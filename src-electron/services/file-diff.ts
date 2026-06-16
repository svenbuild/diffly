import { createHash } from 'node:crypto'
import {
  open,
  readFile,
  stat,
} from 'node:fs/promises'
import { isAbsolute, parse, resolve, sep } from 'node:path'
import type {
  CompareOptions,
  FileDiffResult,
  TextDiffPayload,
  UnsupportedDiffPayload,
} from '../../src/lib/types'
import {
  runGitBytes,
} from './git/git-service'
import {
  isUsableGitOid,
  readGitObjectByOid,
} from './git/git-object-store'

export const MAX_TEXT_BYTES = 1024 * 1024

const BINARY_SAMPLE_BYTES = 8192
const FILES_EQUAL_CHUNK_BYTES = 1024 * 1024
const FILE_DIFF_CACHE_LIMIT = 32
const FILE_DIFF_CACHE_MAX_BYTES = 48 * 1024 * 1024
const CRLF_BYTES = Buffer.from('\r\n')
const UTF8_DECODER = new TextDecoder('utf-8', { fatal: true })
const WINDOWS_1252_DECODER = new TextDecoder('windows-1252')

export type FileKind = 'missing' | 'tooLarge' | 'text' | 'image' | 'binary' | 'readError'
export type DetectedFileKind = Exclude<FileKind, 'missing' | 'readError'>

export interface DiffSnapshot {
  exists: boolean
  label: string
  logicalPath: string
  cacheKey: string | null
  bytes: Uint8Array | null
  text: string | null
  size: number | null
  lineEnding: 'lf' | 'crlf' | null
  hasTrailingNewline: boolean | null
  kind: FileKind
  error: string | null
}

export type GitSnapshotSource =
  | {
      kind: 'empty'
      label: string
      logicalPath: string
    }
  | {
      kind: 'head'
      repoPath: string
      repositoryRoot: string
      path: string
      label: string
      // Full blob oid when known; enables the cat-file --batch fast path.
      oid?: string | null
    }
  | {
      kind: 'index'
      repoPath: string
      repositoryRoot: string
      path: string
      label: string
      oid?: string | null
    }
  | {
      kind: 'workingTree'
      repositoryRoot: string
      path: string
      label: string
    }
  | {
      kind: 'ref'
      repoPath: string
      repositoryRoot: string
      // Resolved rev (commit sha or rev expression) used as `<ref>:<path>`.
      ref: string
      path: string
      label: string
      oid?: string | null
    }

export interface GithubSnapshotSource {
  owner: string
  repo: string
  ref: string
  path: string
  sha: string | null
  label: string
  exists: boolean
  bytes: Uint8Array | null
  text?: string | null
  // Set when the download was cut off because the file exceeds the fetch cap;
  // the snapshot then renders as a tooLarge state instead of partial content.
  truncated?: boolean
  size?: number | null
}

export interface FileIdentity {
  size: number
  modifiedMs: number | null
}

interface CachedFileDiffEntry {
  bytes: number
  result: FileDiffResult
}

const fileDiffCache = new Map<string, CachedFileDiffEntry>()
let fileDiffCacheBytes = 0

export function clearFileDiffCache() {
  fileDiffCache.clear()
  fileDiffCacheBytes = 0
}

export async function fileIdentity(pathValue: string): Promise<FileIdentity> {
  const info = await stat(pathValue)
  return { size: info.size, modifiedMs: Math.trunc(info.mtimeMs) }
}

export function identityEquals(left: FileIdentity | null, right: FileIdentity | null) {
  return left?.size === right?.size && left?.modifiedMs === right?.modifiedMs
}

export async function openCompareItem(
  leftBase: string,
  rightBase: string,
  relativePathValue: string,
  options: CompareOptions,
) {
  const leftPath = resolveChildPath(leftBase, relativePathValue)
  const rightPath = resolveChildPath(rightBase, relativePathValue)
  return buildFileDiffFromPaths(leftPath, rightPath, relativePathValue, relativePathValue, options)
}

export async function buildFileDiffFromPaths(
  leftPath: string,
  rightPath: string,
  leftLabel: string,
  rightLabel: string,
  options: CompareOptions,
): Promise<FileDiffResult> {
  const [left, right] = await Promise.all([
    loadFileSnapshotFromPath(leftPath, leftLabel),
    loadFileSnapshotFromPath(rightPath, rightLabel),
  ])

  return buildFileDiffFromSnapshots(left, right, options)
}

export const buildFileDiff = buildFileDiffFromPaths

export async function buildFileDiffFromGit(
  left: GitSnapshotSource,
  right: GitSnapshotSource,
  options: CompareOptions,
): Promise<FileDiffResult> {
  const [leftSnapshot, rightSnapshot] = await Promise.all([
    loadGitSnapshot(left),
    loadGitSnapshot(right),
  ])

  return buildFileDiffFromSnapshots(leftSnapshot, rightSnapshot, options)
}

export async function buildFileDiffFromGithub(
  left: GithubSnapshotSource,
  right: GithubSnapshotSource,
  options: CompareOptions,
): Promise<FileDiffResult> {
  return buildFileDiffFromSnapshots(
    loadGithubSnapshot(left),
    loadGithubSnapshot(right),
    options,
  )
}

export async function buildFileDiffFromSnapshots(
  left: DiffSnapshot,
  right: DiffSnapshot,
  options: CompareOptions,
): Promise<FileDiffResult> {
  const cacheKey = buildFileDiffCacheKey(left, right, options)
  const cached = cacheKey ? getCachedFileDiff(cacheKey) : null
  if (cached) {
    return cached
  }

  const summary = buildSummary(left, right)

  if (canBuildTextDiff(left, right)) {
    const textPayload = buildTextPayload(left, right)
    const result: FileDiffResult = {
      contentKind: 'text',
      summary,
      leftLabel: left.label,
      rightLabel: right.label,
      text: textPayload,
      unsupported: null,
    }
    if (cacheKey) {
      setCachedFileDiff(cacheKey, result)
    }
    return result
  }

  const result: FileDiffResult = {
    contentKind: 'unsupported',
    summary,
    leftLabel: left.label,
    rightLabel: right.label,
    text: null,
    unsupported: buildUnsupportedPayload(left, right),
  }
  if (cacheKey) {
    setCachedFileDiff(cacheKey, result)
  }
  return result
}

export async function sampleFile(pathValue: string) {
  return readPartial(pathValue, BINARY_SAMPLE_BYTES)
}

export function detectFileKind(
  pathValue: string,
  size: number,
  sample: Uint8Array,
): DetectedFileKind {
  const imageFormat = detectImageFormat(sample, pathValue)
  if (size > MAX_TEXT_BYTES && !imageFormat) {
    return 'tooLarge'
  }

  if (imageFormat) {
    return 'image'
  }

  if (looksBinary(sample)) {
    return 'binary'
  }

  return 'text'
}

export function normalizeCompareText(text: string, options: CompareOptions) {
  let value = text
  if (options.ignoreWhitespace) {
    value = value.replace(/\s+/g, '')
  }
  if (options.ignoreCase) {
    value = value.toLowerCase()
  }
  return value
}

export function bytesEqual(left: Uint8Array, right: Uint8Array) {
  if (left.byteLength !== right.byteLength) {
    return false
  }

  const leftBuffer = Buffer.from(left.buffer, left.byteOffset, left.byteLength)
  const rightBuffer = Buffer.from(right.buffer, right.byteOffset, right.byteLength)
  return leftBuffer.compare(rightBuffer) === 0
}

export async function filesEqual(leftPath: string, rightPath: string, startOffset = 0) {
  const [leftHandle, rightHandle] = await Promise.all([
    open(leftPath, 'r'),
    open(rightPath, 'r'),
  ])

  const leftBuffer = Buffer.alloc(FILES_EQUAL_CHUNK_BYTES)
  const rightBuffer = Buffer.alloc(FILES_EQUAL_CHUNK_BYTES)
  let offset = startOffset

  try {
    while (true) {
      const [leftRead, rightRead] = await Promise.all([
        leftHandle.read(leftBuffer, 0, FILES_EQUAL_CHUNK_BYTES, offset),
        rightHandle.read(rightBuffer, 0, FILES_EQUAL_CHUNK_BYTES, offset),
      ])

      if (leftRead.bytesRead !== rightRead.bytesRead) {
        return false
      }

      if (leftRead.bytesRead === 0) {
        return true
      }

      if (
        leftBuffer.compare(rightBuffer, 0, leftRead.bytesRead, 0, leftRead.bytesRead) !== 0
      ) {
        return false
      }

      offset += leftRead.bytesRead
    }
  } finally {
    await Promise.all([
      leftHandle.close().catch(() => undefined),
      rightHandle.close().catch(() => undefined),
    ])
  }
}

function getCachedFileDiff(cacheKey: string) {
  const cached = fileDiffCache.get(cacheKey)
  if (!cached) {
    return null
  }

  fileDiffCache.delete(cacheKey)
  fileDiffCache.set(cacheKey, cached)
  return cached.result
}

function setCachedFileDiff(
  cacheKey: string,
  result: FileDiffResult,
) {
  const previous = fileDiffCache.get(cacheKey)
  if (previous) {
    fileDiffCacheBytes -= previous.bytes
    fileDiffCache.delete(cacheKey)
  }

  const bytes = estimatedFileDiffBytes(result)
  fileDiffCache.set(cacheKey, {
    bytes,
    result,
  })
  fileDiffCacheBytes += bytes

  while (
    fileDiffCache.size > FILE_DIFF_CACHE_LIMIT ||
    fileDiffCacheBytes > FILE_DIFF_CACHE_MAX_BYTES
  ) {
    const oldestKey = fileDiffCache.keys().next().value
    if (oldestKey === undefined) {
      return
    }

    const oldest = fileDiffCache.get(oldestKey)
    if (oldest) {
      fileDiffCacheBytes -= oldest.bytes
    }
    fileDiffCache.delete(oldestKey)
  }
}

function buildFileDiffCacheKey(
  left: DiffSnapshot,
  right: DiffSnapshot,
  options: CompareOptions,
) {
  if (left.cacheKey === null || right.cacheKey === null) {
    return null
  }

  return [
    left.cacheKey,
    right.cacheKey,
    options.ignoreWhitespace ? '1' : '0',
    options.ignoreCase ? '1' : '0',
  ].join('\u0000')
}

function estimatedFileDiffBytes(result: FileDiffResult) {
  const text = result.text
  return (
    512 +
    Buffer.byteLength(result.summary, 'utf8') +
    Buffer.byteLength(result.leftLabel, 'utf8') +
    Buffer.byteLength(result.rightLabel, 'utf8') +
    (text
      ? Buffer.byteLength(text.leftText, 'utf8') +
        Buffer.byteLength(text.rightText, 'utf8') +
        Buffer.byteLength(text.patchText ?? '', 'utf8')
      : 0)
  )
}

function resolveChildPath(base: string, relativePathValue: string) {
  if (isAbsolute(relativePathValue) || parse(relativePathValue).root) {
    throw new Error('Relative path must not be absolute.')
  }

  const resolvedBase = resolve(base)
  const resolvedChild = resolve(resolvedBase, relativePathValue)
  if (resolvedChild !== resolvedBase && !resolvedChild.startsWith(`${resolvedBase}${sep}`)) {
    throw new Error('Relative path must stay inside the compared directory.')
  }

  return resolvedChild
}

async function loadFileSnapshotFromPath(
  pathValue: string,
  label: string,
): Promise<DiffSnapshot> {
  const resolvedPath = resolve(pathValue)
  let info

  try {
    info = await stat(pathValue)
  } catch {
    return buildMissingSnapshot(label, resolvedPath, buildLocalSnapshotCacheKey(resolvedPath, 'missing'))
  }

  const identity = `${info.size}:${Math.trunc(info.mtimeMs)}`
  const cacheKey = buildLocalSnapshotCacheKey(resolvedPath, identity)

  try {
    const sample = await readPartial(pathValue, Math.min(info.size, BINARY_SAMPLE_BYTES))
    const kind = detectFileKind(pathValue, info.size, sample)
    if (kind === 'tooLarge') {
      return buildNonTextSnapshot(kind, label, resolvedPath, cacheKey, info.size, null)
    }

    if (kind !== 'text') {
      return buildNonTextSnapshot(kind, label, resolvedPath, cacheKey, info.size, null)
    }

    try {
      const bytes = await readFile(pathValue)
      return buildTextSnapshot(label, resolvedPath, cacheKey, bytes)
    } catch (error) {
      return {
        kind: 'readError',
        exists: true,
        label,
        logicalPath: resolvedPath,
        cacheKey,
        bytes: null,
        text: null,
        size: info.size,
        lineEnding: null,
        hasTrailingNewline: null,
        error: errorMessage(error),
      }
    }
  } catch (error) {
    return {
      kind: 'readError',
      exists: true,
      label,
      logicalPath: resolvedPath,
      cacheKey,
      bytes: null,
      text: null,
      size: info.size,
      lineEnding: null,
      hasTrailingNewline: null,
      error: errorMessage(error),
    }
  }
}

async function loadGitSnapshot(source: GitSnapshotSource): Promise<DiffSnapshot> {
  switch (source.kind) {
    case 'empty':
      return buildMissingSnapshot(
        source.label,
        source.logicalPath,
        buildGitSnapshotCacheKey('EMPTY', source.logicalPath, 'missing'),
      )
    case 'head':
      return loadGitObjectSnapshot(source, 'HEAD')
    case 'index':
      return loadGitObjectSnapshot(source, 'INDEX')
    case 'workingTree':
      return loadGitWorkingTreeSnapshot(source)
    case 'ref':
      return loadGitRefSnapshot(source)
  }
}

// Fast path: resolve content by blob oid through the persistent
// `git cat-file --batch` process. Returns null when the oid is unknown or the
// batch lookup failed, in which case callers fall back to spawning `git show`.
async function tryLoadGitSnapshotByOid(
  repositoryRoot: string,
  oid: string | null | undefined,
  label: string,
  logicalPath: string,
  pathValue: string,
  refLabel: string,
): Promise<DiffSnapshot | null> {
  if (!isUsableGitOid(oid)) {
    return null
  }

  let result
  try {
    result = await readGitObjectByOid(repositoryRoot, oid)
  } catch {
    return null
  }

  if (result.kind === 'missing') {
    return buildMissingSnapshot(
      label,
      logicalPath,
      buildGitSnapshotCacheKey(refLabel, pathValue, 'missing'),
    )
  }

  if (result.type !== 'blob') {
    // Submodule commits and other non-blob objects keep the git show path.
    return null
  }

  // The full oid already identifies the content, so the sha256 hash used by
  // the git show path is unnecessary here.
  const cacheKey = buildGitSnapshotCacheKey('OID', pathValue, oid)
  return buildSnapshotFromBytes(label, logicalPath, cacheKey, result.bytes)
}

async function loadGitRefSnapshot(
  source: Extract<GitSnapshotSource, { kind: 'ref' }>,
): Promise<DiffSnapshot> {
  const logicalPath = gitLogicalPath(source.path)
  const refLabel = `REF:${source.ref}`
  const fastSnapshot = await tryLoadGitSnapshotByOid(
    source.repositoryRoot,
    source.oid,
    source.label,
    logicalPath,
    source.path,
    refLabel,
  )
  if (fastSnapshot) {
    return fastSnapshot
  }

  const contentResult = await runGitBytes(source.repositoryRoot, [
    'show',
    '--no-textconv',
    `${source.ref}:${source.path}`,
  ], {
    allowNonZeroExit: true,
  })

  if (contentResult.exitCode !== 0) {
    return buildMissingSnapshot(
      source.label,
      logicalPath,
      buildGitSnapshotCacheKey(refLabel, source.path, 'missing'),
    )
  }

  const cacheKey = buildGitSnapshotCacheKey(refLabel, source.path, sha256(contentResult.stdout))
  return buildSnapshotFromBytes(
    source.label,
    logicalPath,
    cacheKey,
    contentResult.stdout,
  )
}

async function loadGitObjectSnapshot(
  source: Extract<GitSnapshotSource, { kind: 'head' | 'index' }>,
  refLabel: 'HEAD' | 'INDEX',
): Promise<DiffSnapshot> {
  const objectRef = source.kind === 'head'
    ? `HEAD:${source.path}`
    : `:${source.path}`
  const logicalPath = gitLogicalPath(source.path)
  const fastSnapshot = await tryLoadGitSnapshotByOid(
    source.repositoryRoot,
    source.oid,
    source.label,
    logicalPath,
    source.path,
    refLabel,
  )
  if (fastSnapshot) {
    return fastSnapshot
  }

  const contentResult = await runGitBytes(source.repoPath, [
    'show',
    '--no-textconv',
    objectRef,
  ], {
    allowNonZeroExit: true,
  })

  if (contentResult.exitCode !== 0) {
    return buildMissingSnapshot(
      source.label,
      logicalPath,
      buildGitSnapshotCacheKey(refLabel, source.path, 'missing'),
    )
  }

  const cacheKey = buildGitSnapshotCacheKey(refLabel, source.path, sha256(contentResult.stdout))
  return buildSnapshotFromBytes(
    source.label,
    logicalPath,
    cacheKey,
    contentResult.stdout,
  )
}

async function loadGitWorkingTreeSnapshot(
  source: Extract<GitSnapshotSource, { kind: 'workingTree' }>,
): Promise<DiffSnapshot> {
  const logicalPath = gitLogicalPath(source.path)
  const absolutePath = resolveChildPath(source.repositoryRoot, source.path)

  try {
    const bytes = await readFile(absolutePath)
    const sha = sha256(bytes)
    return buildSnapshotFromBytes(
      source.label,
      logicalPath,
      buildGitSnapshotCacheKey('WORKTREE', source.path, sha),
      bytes,
    )
  } catch (error) {
    return buildNonTextSnapshot(
      'readError',
      source.label,
      logicalPath,
      null,
      null,
      errorMessage(error),
    )
  }
}

function loadGithubSnapshot(source: GithubSnapshotSource): DiffSnapshot {
  const logicalPath = githubLogicalPath(source)
  if (!source.exists) {
    return buildMissingSnapshot(
      source.label,
      logicalPath,
      buildGithubSnapshotCacheKey(source, 'missing'),
    )
  }

  const cacheKey = source.sha
    ? buildGithubSnapshotCacheKey(source, source.sha)
    : null

  if (source.truncated) {
    return buildNonTextSnapshot(
      'tooLarge',
      source.label,
      logicalPath,
      cacheKey,
      source.size ?? null,
      null,
    )
  }

  if (source.bytes) {
    return buildSnapshotFromBytes(source.label, logicalPath, cacheKey, source.bytes)
  }

  if (source.text !== undefined && source.text !== null) {
    return buildSnapshotFromBytes(
      source.label,
      logicalPath,
      cacheKey,
      new TextEncoder().encode(source.text),
    )
  }

  return buildNonTextSnapshot(
    'readError',
    source.label,
    logicalPath,
    null,
    null,
    'GitHub snapshot content was not provided.',
  )
}

async function readPartial(pathValue: string, length: number): Promise<Uint8Array> {
  if (length <= 0) {
    return new Uint8Array(0)
  }

  const handle = await open(pathValue, 'r')
  try {
    const buffer = Buffer.alloc(length)
    const { bytesRead } = await handle.read(buffer, 0, length, 0)
    if (bytesRead === 0) {
      return new Uint8Array(0)
    }
    return Uint8Array.prototype.slice.call(buffer, 0, bytesRead)
  } finally {
    await handle.close().catch(() => undefined)
  }
}

function buildLocalSnapshotCacheKey(resolvedPath: string, identity: string) {
  return [
    'local',
    'FILESYSTEM',
    resolvedPath,
    identity,
  ].join('\u0000')
}

function buildGitSnapshotCacheKey(ref: string, pathValue: string, identity: string) {
  return [
    'git',
    ref,
    pathValue,
    identity,
  ].join('\u0000')
}

function gitLogicalPath(pathValue: string) {
  return `git:${pathValue}`
}

function buildGithubSnapshotCacheKey(source: GithubSnapshotSource, identity: string) {
  return [
    'github',
    `${source.owner}/${source.repo}@${source.ref}`,
    source.path,
    identity,
  ].join('\u0000')
}

function githubLogicalPath(source: GithubSnapshotSource) {
  return `github:${source.owner}/${source.repo}@${source.ref}:${source.path}`
}

function buildMissingSnapshot(
  label: string,
  logicalPath: string,
  cacheKey: string | null,
): DiffSnapshot {
  return {
    kind: 'missing',
    exists: false,
    label,
    logicalPath,
    cacheKey,
    bytes: null,
    text: null,
    size: null,
    lineEnding: null,
    hasTrailingNewline: null,
    error: null,
  }
}

function buildNonTextSnapshot(
  kind: Exclude<FileKind, 'missing' | 'text'>,
  label: string,
  logicalPath: string,
  cacheKey: string | null,
  size: number | null,
  error: string | null,
): DiffSnapshot {
  return {
    kind,
    exists: true,
    label,
    logicalPath,
    cacheKey,
    bytes: null,
    text: null,
    size,
    lineEnding: null,
    hasTrailingNewline: null,
    error,
  }
}

function buildTextSnapshot(
  label: string,
  logicalPath: string,
  cacheKey: string | null,
  bytes: Uint8Array,
): DiffSnapshot {
  const buffer = Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  const text = decodeTextBytes(buffer)
  return {
    kind: 'text',
    exists: true,
    label,
    logicalPath,
    cacheKey,
    bytes,
    text,
    size: bytes.byteLength,
    lineEnding: buffer.includes(CRLF_BYTES) ? 'crlf' : 'lf',
    hasTrailingNewline: bytes[bytes.byteLength - 1] === 10,
    error: null,
  }
}

function decodeTextBytes(buffer: Buffer) {
  try {
    return UTF8_DECODER.decode(buffer)
  } catch {
    return WINDOWS_1252_DECODER.decode(buffer)
  }
}

function buildSnapshotFromBytes(
  label: string,
  logicalPath: string,
  cacheKey: string | null,
  bytes: Uint8Array,
): DiffSnapshot {
  const sample = Uint8Array.prototype.slice.call(
    bytes,
    0,
    Math.min(bytes.byteLength, BINARY_SAMPLE_BYTES),
  )
  const kind = detectFileKind(logicalPath, bytes.byteLength, sample)
  if (kind === 'tooLarge') {
    return buildNonTextSnapshot(kind, label, logicalPath, cacheKey, bytes.byteLength, null)
  }
  if (kind !== 'text') {
    return buildNonTextSnapshot(kind, label, logicalPath, cacheKey, bytes.byteLength, null)
  }

  try {
    return buildTextSnapshot(label, logicalPath, cacheKey, bytes)
  } catch (error) {
    return buildNonTextSnapshot(
      'readError',
      label,
      logicalPath,
      cacheKey,
      bytes.byteLength,
      errorMessage(error),
    )
  }
}

function sha256(bytes: Uint8Array) {
  return createHash('sha256').update(bytes).digest('hex')
}

function canBuildTextDiff(left: DiffSnapshot, right: DiffSnapshot) {
  return (
    (left.kind === 'text' && (right.kind === 'text' || right.kind === 'missing')) ||
    (right.kind === 'text' && (left.kind === 'text' || left.kind === 'missing'))
  )
}

function looksBinary(sample: Uint8Array) {
  if (sample.includes(0)) {
    return true
  }

  let suspicious = 0
  for (const byte of sample) {
    if (byte < 9 || (byte > 13 && byte < 32)) {
      suspicious += 1
    }
  }
  return sample.length > 0 && suspicious * 100 / sample.length > 10
}

function detectImageFormat(bytes: Uint8Array, pathValue: string) {
  if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) {
    return 'png'
  }
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return 'jpeg'
  }
  if (bytes[0] === 0x47 && bytes[1] === 0x49 && bytes[2] === 0x46) {
    return 'gif'
  }
  if (bytes[0] === 0x42 && bytes[1] === 0x4d) {
    return 'bmp'
  }
  if (
    bytes[0] === 0x52 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x46 &&
    bytes[8] === 0x57 &&
    bytes[9] === 0x45 &&
    bytes[10] === 0x42 &&
    bytes[11] === 0x50
  ) {
    return 'webp'
  }

  const extension = pathValue.split('.').pop()?.toLowerCase()
  return ['png', 'jpg', 'jpeg', 'gif', 'bmp', 'webp'].includes(extension ?? '')
    ? extension === 'jpg' ? 'jpeg' : extension ?? null
    : null
}

function buildSummary(left: DiffSnapshot, right: DiffSnapshot) {
  if (left.kind === 'missing' && right.kind === 'missing') {
    return 'Neither file exists.'
  }
  if (left.kind === 'missing') {
    return 'Only the right file exists.'
  }
  if (right.kind === 'missing') {
    return 'Only the left file exists.'
  }
  return 'Comparison ready.'
}

function buildTextPayload(left: DiffSnapshot, right: DiffSnapshot): TextDiffPayload {
  return {
    leftText: left.kind === 'text' ? left.text ?? '' : '',
    rightText: right.kind === 'text' ? right.text ?? '' : '',
    patchText: null,
    patchCacheKey: null,
    leftExists: left.kind === 'text',
    rightExists: right.kind === 'text',
    leftCacheKey: left.kind === 'text' ? left.cacheKey : null,
    rightCacheKey: right.kind === 'text' ? right.cacheKey : null,
    leftSha256: null,
    rightSha256: null,
    leftLineEnding: left.lineEnding ?? 'lf',
    rightLineEnding: right.lineEnding ?? 'lf',
    leftHasTrailingNewline: left.hasTrailingNewline ?? false,
    rightHasTrailingNewline: right.hasTrailingNewline ?? false,
  }
}

function buildUnsupportedPayload(
  left: DiffSnapshot,
  right: DiffSnapshot,
): UnsupportedDiffPayload {
  return {
    reason: unsupportedReason(left, right),
    leftPath: left.kind === 'missing' ? null : left.logicalPath,
    rightPath: right.kind === 'missing' ? null : right.logicalPath,
    leftSize: left.kind === 'missing' ? null : left.size,
    rightSize: right.kind === 'missing' ? null : right.size,
  }
}

function unsupportedReason(
  left: DiffSnapshot,
  right: DiffSnapshot,
): UnsupportedDiffPayload['reason'] {
  if (left.kind === 'readError' || right.kind === 'readError') {
    return 'readError'
  }
  if (left.kind === 'tooLarge' || right.kind === 'tooLarge') {
    return 'tooLarge'
  }
  if (left.kind === 'image' || right.kind === 'image') {
    return 'image'
  }
  if (left.kind === 'binary' || right.kind === 'binary') {
    return 'binary'
  }
  if (left.kind === 'missing' || right.kind === 'missing') {
    return 'missing'
  }
  return 'readError'
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error)
}
