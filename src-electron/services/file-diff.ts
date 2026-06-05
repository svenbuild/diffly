import type { Stats } from 'node:fs'
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

export const MAX_TEXT_BYTES = 1024 * 1024

const BINARY_SAMPLE_BYTES = 8192
const FILES_EQUAL_CHUNK_BYTES = 1024 * 1024
const FILE_DIFF_CACHE_LIMIT = 32
const FILE_DIFF_CACHE_MAX_BYTES = 48 * 1024 * 1024
const CRLF_BYTES = Buffer.from('\r\n')
const UTF8_DECODER = new TextDecoder('utf-8', { fatal: true })

export type FileKind = 'missing' | 'tooLarge' | 'text' | 'image' | 'binary' | 'readError'

interface LoadedFile {
  kind: FileKind
  text?: string
  bytes?: Uint8Array
  cacheKey?: string
  sha256?: string
  lineEnding?: 'lf' | 'crlf'
  hasTrailingNewline?: boolean
  path: string
  size: number | null
  format: string | null
  truncated: boolean
}

export interface FileIdentity {
  size: number
  modifiedMs: number | null
}

interface CachedFileDiffEntry {
  bytes: number
  left: FileIdentity | null
  result: FileDiffResult
  right: FileIdentity | null
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
  return buildFileDiff(leftPath, rightPath, relativePathValue, relativePathValue, options)
}

export async function buildFileDiff(
  leftPath: string,
  rightPath: string,
  leftLabel: string,
  rightLabel: string,
  options: CompareOptions,
): Promise<FileDiffResult> {
  const [leftSnapshot, rightSnapshot] = await Promise.all([
    loadFileSnapshot(leftPath),
    loadFileSnapshot(rightPath),
  ])
  const cacheKey = buildFileDiffCacheKey(
    leftPath,
    rightPath,
    leftLabel,
    rightLabel,
    options,
  )
  const cached = getCachedFileDiff(
    cacheKey,
    leftSnapshot.identity,
    rightSnapshot.identity,
  )

  if (cached) {
    return cached
  }

  const [leftLoaded, rightLoaded] = await Promise.all([
    loadFile(leftPath, leftSnapshot.info),
    loadFile(rightPath, rightSnapshot.info),
  ])
  const summary = buildSummary(leftLoaded, rightLoaded)

  if (canBuildTextDiff(leftLoaded, rightLoaded)) {
    const textPayload = buildTextPayload(leftLoaded, rightLoaded)
    const result: FileDiffResult = {
      contentKind: 'text',
      summary,
      leftLabel,
      rightLabel,
      text: textPayload,
      unsupported: null,
    }
    setCachedFileDiff(cacheKey, leftSnapshot.identity, rightSnapshot.identity, result)
    return result
  }

  const result: FileDiffResult = {
    contentKind: 'unsupported',
    summary,
    leftLabel,
    rightLabel,
    text: null,
    unsupported: buildUnsupportedPayload(leftPath, rightPath, leftLoaded, rightLoaded),
  }
  setCachedFileDiff(cacheKey, leftSnapshot.identity, rightSnapshot.identity, result)
  return result
}

export async function sampleFile(pathValue: string) {
  return readPartial(pathValue, BINARY_SAMPLE_BYTES)
}

export function detectFileKind(pathValue: string, size: number, sample: Uint8Array): FileKind {
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

function getCachedFileDiff(
  cacheKey: string,
  leftIdentity: FileIdentity | null,
  rightIdentity: FileIdentity | null,
) {
  const cached = fileDiffCache.get(cacheKey)
  if (
    !cached ||
    !identityEquals(cached.left, leftIdentity) ||
    !identityEquals(cached.right, rightIdentity)
  ) {
    return null
  }

  fileDiffCache.delete(cacheKey)
  fileDiffCache.set(cacheKey, cached)
  return cached.result
}

function setCachedFileDiff(
  cacheKey: string,
  leftIdentity: FileIdentity | null,
  rightIdentity: FileIdentity | null,
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
    left: leftIdentity,
    result,
    right: rightIdentity,
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
  leftPath: string,
  rightPath: string,
  leftLabel: string,
  rightLabel: string,
  options: CompareOptions,
) {
  return [
    leftPath,
    rightPath,
    leftLabel,
    rightLabel,
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
        Buffer.byteLength(text.rightText, 'utf8')
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

async function loadFileSnapshot(pathValue: string) {
  try {
    const info = await stat(pathValue)
    return {
      identity: { size: info.size, modifiedMs: Math.trunc(info.mtimeMs) },
      info,
    }
  } catch {
    return {
      identity: null,
      info: null,
    }
  }
}

async function loadFile(pathValue: string, knownInfo?: Stats | null): Promise<LoadedFile> {
  let info = knownInfo
  if (info === undefined) {
    try {
      info = await stat(pathValue)
    } catch {
      info = null
    }
  }

  if (!info) {
    return {
      kind: 'missing',
      path: pathValue,
      size: null,
      format: null,
      truncated: false,
    }
  }

  const sample = await readPartial(pathValue, Math.min(info.size, BINARY_SAMPLE_BYTES))
  const kind = detectFileKind(pathValue, info.size, sample)
  if (kind === 'tooLarge') {
    return {
      kind,
      path: pathValue,
      size: info.size,
      format: null,
      truncated: true,
    }
  }

  if (kind === 'text') {
    let bytes: Buffer
    let text: string
    try {
      bytes = await readFile(pathValue)
      text = UTF8_DECODER.decode(bytes)
    } catch {
      return {
        kind: 'readError',
        path: pathValue,
        size: info.size,
        format: null,
        truncated: false,
      }
    }

    return {
      kind,
      path: pathValue,
      size: info.size,
      format: null,
      truncated: false,
      text,
      cacheKey: `${pathValue}:${info.size}:${Math.trunc(info.mtimeMs)}`,
      lineEnding: bytes.includes(CRLF_BYTES) ? 'crlf' : 'lf',
      hasTrailingNewline: bytes[bytes.length - 1] === 10,
    }
  }

  return {
    kind,
    path: pathValue,
    size: info.size,
    format: detectImageFormat(sample, pathValue),
    truncated: false,
    sha256: undefined,
  }
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

function canBuildTextDiff(left: LoadedFile, right: LoadedFile) {
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

function buildSummary(left: LoadedFile, right: LoadedFile) {
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

function buildTextPayload(left: LoadedFile, right: LoadedFile): TextDiffPayload {
  return {
    leftText: left.kind === 'text' ? left.text ?? '' : '',
    rightText: right.kind === 'text' ? right.text ?? '' : '',
    leftExists: left.kind === 'text',
    rightExists: right.kind === 'text',
    leftCacheKey: left.kind === 'text' ? left.cacheKey ?? null : null,
    rightCacheKey: right.kind === 'text' ? right.cacheKey ?? null : null,
    leftSha256: left.kind === 'text' ? left.sha256 ?? null : null,
    rightSha256: right.kind === 'text' ? right.sha256 ?? null : null,
    leftLineEnding: left.lineEnding ?? 'lf',
    rightLineEnding: right.lineEnding ?? 'lf',
    leftHasTrailingNewline: left.hasTrailingNewline ?? false,
    rightHasTrailingNewline: right.hasTrailingNewline ?? false,
  }
}

function buildUnsupportedPayload(
  leftPath: string,
  rightPath: string,
  left: LoadedFile,
  right: LoadedFile,
): UnsupportedDiffPayload {
  return {
    reason: unsupportedReason(left, right),
    leftPath: left.kind === 'missing' ? null : leftPath,
    rightPath: right.kind === 'missing' ? null : rightPath,
    leftSize: left.kind === 'missing' ? null : left.size,
    rightSize: right.kind === 'missing' ? null : right.size,
  }
}

function unsupportedReason(
  left: LoadedFile,
  right: LoadedFile,
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
