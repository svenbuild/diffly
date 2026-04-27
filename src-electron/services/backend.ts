import { app, dialog, ipcMain } from 'electron'
import { createHash, randomUUID } from 'node:crypto'
import { createReadStream, existsSync } from 'node:fs'
import {
  mkdir,
  open,
  readdir,
  readFile,
  stat,
  writeFile,
} from 'node:fs/promises'
import { basename, dirname, isAbsolute, join, parse, relative, resolve, sep } from 'node:path'
import { pathToFileURL } from 'node:url'
import type {
  BinaryDiffPayload,
  BinaryFileMeta,
  CompareOptions,
  CompareResponse,
  ContentKind,
  DiffCell,
  DiffChange,
  DiffSegment,
  DirectoryEntryResult,
  DirectoryListing,
  ExplorerEntry,
  FileDiffResult,
  ImageDiffPayload,
  LaunchContext,
  PathInfo,
  PersistedSession,
  PollDirectoryCompareResponse,
  SideBySideRow,
  TextDiffPayload,
  UnifiedLine,
  UpdateActionResult,
  UpdateChannel,
  UpdateCheckResult,
} from '../../src/lib/types'

const MAX_TEXT_BYTES = 1024 * 1024
const MAX_BINARY_RENDER_BYTES = 1024
const MAX_SESSION_STATE_BYTES = 1024 * 1024
const BINARY_SAMPLE_BYTES = 8192
const HEX_BYTES_PER_ROW = 16
const LCS_MAX_MATRIX_CELLS = 1_000_000
const ALIGN_LOOKAHEAD_WINDOW = 32
const STREAM_CHUNK_BYTES = 1024 * 1024
const HASH_FILE_SIZE_LIMIT = 256 * 1024 * 1024
const FILES_EQUAL_CHUNK_BYTES = 1024 * 1024
const FILE_READ_TIMEOUT_MS = 60_000

type FileKind = 'missing' | 'tooLarge' | 'text' | 'image' | 'binary'

interface LoadedFile {
  kind: FileKind
  text?: string
  bytes?: Uint8Array
  sha256?: string
  lineEnding?: 'lf' | 'crlf'
  hasTrailingNewline?: boolean
  path: string
  size: number | null
  format: string | null
  truncated: boolean
}

interface DirectoryJob {
  totalCount: number | null
  completedCount: number
  updates: Array<{ index: number; entry: DirectoryEntryResult | null }>
  done: boolean
  error: string | null
}

interface FileIdentity {
  size: number
  modifiedMs: number | null
}

interface CachedDirectoryEntry {
  left: FileIdentity | null
  right: FileIdentity | null
  result: DirectoryEntryResult | null
}

interface DirectoryCacheSession {
  key: string
  entries: Map<string, CachedDirectoryEntry>
}

interface AlignPair {
  left: number | null
  right: number | null
}

interface AnchorPair {
  left: number
  right: number
}

let launchContext: LaunchContext | null | undefined
let directoryCache: DirectoryCacheSession | null = null
const directoryJobs = new Map<string, DirectoryJob>()
let autoUpdaterInstance: Awaited<ReturnType<typeof loadAutoUpdater>> | null = null

export function registerIpcHandlers() {
  ipcMain.handle('diffly:choosePath', (_event, payload: { kind: string }) =>
    choosePath(payload.kind),
  )
  ipcMain.handle('diffly:listRoots', () => listRoots())
  ipcMain.handle('diffly:listDirectory', (_event, payload: { path: string }) =>
    listDirectory(payload.path),
  )
  ipcMain.handle('diffly:pathInfo', (_event, payload: { path: string }) =>
    pathInfo(payload.path),
  )
  ipcMain.handle('diffly:loadSessionState', () => loadSessionState())
  ipcMain.handle('diffly:loadLaunchContext', () => loadLaunchContext())
  ipcMain.handle('diffly:saveSessionState', (_event, payload: { session: PersistedSession }) =>
    saveSessionState(payload.session),
  )
  ipcMain.handle('diffly:getAppVersion', () => app.getVersion())
  ipcMain.handle('diffly:checkForUpdates', (_event, payload: { channel: UpdateChannel }) =>
    checkForUpdates(payload.channel),
  )
  ipcMain.handle('diffly:downloadUpdate', (_event, payload: { channel: UpdateChannel }) =>
    downloadUpdate(payload.channel),
  )
  ipcMain.handle('diffly:installUpdate', (_event, payload: { channel: UpdateChannel }) =>
    installUpdate(payload.channel),
  )
  ipcMain.handle('diffly:comparePaths', (_event, payload) =>
    comparePaths(payload.leftPath, payload.rightPath, payload.mode, payload.options),
  )
  ipcMain.handle('diffly:startDirectoryCompare', (_event, payload) =>
    startDirectoryCompare(payload.leftPath, payload.rightPath, payload.options),
  )
  ipcMain.handle('diffly:pollDirectoryCompare', (_event, payload: { jobId: string }) =>
    pollDirectoryCompare(payload.jobId),
  )
  ipcMain.handle('diffly:openCompareItem', (_event, payload) =>
    openCompareItem(payload.leftBase, payload.rightBase, payload.relativePath, payload.options),
  )
  ipcMain.handle('diffly:loadBinaryPreview', (_event, payload) =>
    loadBinaryPreview(payload.leftPath, payload.rightPath, payload.options),
  )
}

async function choosePath(kind: string) {
  const properties: Array<'openDirectory' | 'openFile'> =
    kind === 'directory' ? ['openDirectory'] : ['openFile']
  const result = await dialog.showOpenDialog({ properties })
  return result.canceled ? null : result.filePaths[0] ?? null
}

async function listRoots(): Promise<ExplorerEntry[]> {
  if (process.platform !== 'win32') {
    return [await explorerEntry('/', 'drive')]
  }

  const roots: ExplorerEntry[] = []
  for (let code = 65; code <= 90; code += 1) {
    const root = `${String.fromCharCode(code)}:\\`
    if (existsSync(root)) {
      roots.push(await explorerEntry(root, 'drive'))
    }
  }
  return roots
}

async function listDirectory(pathValue: string): Promise<DirectoryListing> {
  const entries = await readdir(pathValue, { withFileTypes: true })
  const directories: ExplorerEntry[] = []
  const files: ExplorerEntry[] = []

  for (const entry of entries) {
    const fullPath = join(pathValue, entry.name)
    if (entry.isDirectory()) {
      directories.push(await explorerEntry(fullPath, 'directory'))
    } else if (entry.isFile()) {
      files.push(await explorerEntry(fullPath, 'file'))
    }
  }

  directories.sort(compareExplorerEntries)
  files.sort(compareExplorerEntries)

  return {
    path: pathValue,
    parentPath: dirname(pathValue) === pathValue ? null : dirname(pathValue),
    directories,
    files,
  }
}

async function pathInfo(pathValue: string): Promise<PathInfo> {
  let exists = false
  let isDirectory = false
  let isFile = false

  try {
    const info = await stat(pathValue)
    exists = true
    isDirectory = info.isDirectory()
    isFile = info.isFile()
  } catch {
    exists = false
  }

  return {
    path: pathValue,
    exists,
    isDirectory,
    isFile,
    parentPath: dirname(pathValue) === pathValue ? null : dirname(pathValue),
    name: basename(pathValue) || pathValue,
  }
}

async function explorerEntry(pathValue: string, kind: ExplorerEntry['kind']): Promise<ExplorerEntry> {
  let size: number | null = null
  let modifiedMs: number | null = null

  try {
    const info = await stat(pathValue)
    size = kind === 'file' ? info.size : null
    modifiedMs = Math.trunc(info.mtimeMs)
  } catch {
    size = null
    modifiedMs = null
  }

  return {
    name: basename(pathValue) || pathValue,
    path: pathValue,
    kind,
    size,
    modifiedMs,
  }
}

function compareExplorerEntries(left: ExplorerEntry, right: ExplorerEntry) {
  return left.name.localeCompare(right.name, undefined, { sensitivity: 'base' })
}

async function loadSessionState(): Promise<PersistedSession | null> {
  const filePath = sessionPath()
  if (!existsSync(filePath)) {
    return null
  }

  const info = await stat(filePath)
  validateSessionStateSize(info.size)
  return JSON.parse(await readFile(filePath, 'utf8')) as PersistedSession
}

async function saveSessionState(session: PersistedSession) {
  const json = JSON.stringify(session)
  validateSessionStateSize(Buffer.byteLength(json))
  await mkdir(dirname(sessionPath()), { recursive: true })
  await writeFile(sessionPath(), json, 'utf8')
}

function sessionPath() {
  return join(app.getPath('userData'), 'session.json')
}

function validateSessionStateSize(byteLength: number) {
  if (byteLength > MAX_SESSION_STATE_BYTES) {
    throw new Error('Session state is too large to load safely.')
  }
}

function loadLaunchContext(): LaunchContext | null {
  if (launchContext === undefined) {
    launchContext = parseLaunchContext(process.argv.slice(1))
  }
  return launchContext
}

function parseLaunchContext(args: string[]): LaunchContext | null {
  const index = args.indexOf('--open-here')
  if (index < 0) {
    return null
  }

  const openHerePath = args[index + 1]
  if (!openHerePath || !existsSync(openHerePath)) {
    return null
  }

  try {
    if (!existsSync(openHerePath)) {
      return null
    }
  } catch {
    return null
  }

  return { openHerePath }
}

async function checkForUpdates(channel: UpdateChannel): Promise<UpdateCheckResult> {
  if (!app.isPackaged) {
    return unavailableUpdate('Updates are not available in development builds.')
  }

  try {
    const autoUpdater = await getAutoUpdater()
    configureAutoUpdater(autoUpdater, channel)
    const result = await autoUpdater.checkForUpdates()
    const info = result?.updateInfo
    if (!info) {
      return unavailableUpdate('No update information was returned.')
    }

    const available = info.version !== app.getVersion()
    return {
      kind: available ? 'available' : 'upToDate',
      available,
      metadata: {
        version: info.version,
        currentVersion: app.getVersion(),
        body: typeof info.releaseNotes === 'string' ? info.releaseNotes : null,
        date: info.releaseDate,
      },
      message: null,
    }
  } catch (error) {
    return {
      kind: 'error',
      available: false,
      metadata: null,
      message: errorMessage(error),
    }
  }
}

async function downloadUpdate(channel: UpdateChannel): Promise<UpdateActionResult> {
  if (!app.isPackaged) {
    return unavailableAction('Updates are not available in development builds.')
  }

  try {
    const autoUpdater = await getAutoUpdater()
    configureAutoUpdater(autoUpdater, channel)
    await autoUpdater.downloadUpdate()
    return { kind: 'downloaded', message: null }
  } catch (error) {
    return { kind: 'error', message: errorMessage(error) }
  }
}

async function installUpdate(_channel: UpdateChannel): Promise<UpdateActionResult> {
  if (!app.isPackaged) {
    return unavailableAction('Updates are not available in development builds.')
  }

  try {
    const autoUpdater = await getAutoUpdater()
    autoUpdater.quitAndInstall(false, true)
    return { kind: 'installed', message: null }
  } catch (error) {
    return { kind: 'error', message: errorMessage(error) }
  }
}

async function getAutoUpdater() {
  if (!autoUpdaterInstance) {
    autoUpdaterInstance = await loadAutoUpdater()
    autoUpdaterInstance.autoDownload = false
    autoUpdaterInstance.autoInstallOnAppQuit = false
  }

  return autoUpdaterInstance
}

async function loadAutoUpdater() {
  const updaterModule = await import('electron-updater')
  return updaterModule.default?.autoUpdater ?? updaterModule.autoUpdater
}

function configureAutoUpdater(
  autoUpdater: Awaited<ReturnType<typeof loadAutoUpdater>>,
  channel: UpdateChannel,
) {
  autoUpdater.allowPrerelease = channel === 'prerelease'
}

function unavailableUpdate(message: string): UpdateCheckResult {
  return { kind: 'unavailable', available: false, metadata: null, message }
}

function unavailableAction(message: string): UpdateActionResult {
  return { kind: 'unavailable', message }
}

async function comparePaths(
  leftPath: string,
  rightPath: string,
  mode: 'file' | 'directory',
  options: CompareOptions,
): Promise<CompareResponse> {
  if (mode === 'directory') {
    return {
      kind: 'directory',
      entries: await compareDirectories(leftPath, rightPath, options),
    }
  }

  return {
    kind: 'file',
    result: await buildFileDiff(leftPath, rightPath, basename(leftPath), basename(rightPath), options),
  }
}

async function startDirectoryCompare(leftPath: string, rightPath: string, options: CompareOptions) {
  const jobId = randomUUID()
  const job: DirectoryJob = {
    totalCount: null,
    completedCount: 0,
    updates: [],
    done: false,
    error: null,
  }
  directoryJobs.set(jobId, job)

  void runDirectoryJob(job, leftPath, rightPath, options)
  return { jobId }
}

function pollDirectoryCompare(jobId: string): PollDirectoryCompareResponse {
  const job = directoryJobs.get(jobId)
  if (!job) {
    return {
      totalCount: null,
      completedCount: 0,
      updates: [],
      done: true,
      error: 'Directory compare job was not found.',
    }
  }

  const updates = job.updates.splice(0)
  if (job.done) {
    directoryJobs.delete(jobId)
  }

  return {
    totalCount: job.totalCount,
    completedCount: job.completedCount,
    updates,
    done: job.done,
    error: job.error,
  }
}

async function runDirectoryJob(
  job: DirectoryJob,
  leftPath: string,
  rightPath: string,
  options: CompareOptions,
) {
  try {
    const entries = await compareDirectories(leftPath, rightPath, options, (index, entry) => {
      job.completedCount += 1
      job.updates.push({ index, entry })
    }, (total) => {
      job.totalCount = total
    })

    if (job.totalCount === null) {
      job.totalCount = entries.length
      entries.forEach((entry, index) => {
        job.completedCount += 1
        job.updates.push({ index, entry })
      })
    }
  } catch (error) {
    job.error = errorMessage(error)
  } finally {
    job.done = true
  }
}

async function compareDirectories(
  leftPath: string,
  rightPath: string,
  options: CompareOptions,
  onUpdate?: (index: number, entry: DirectoryEntryResult | null) => void,
  onTotal?: (total: number) => void,
): Promise<DirectoryEntryResult[]> {
  const leftInfo = await stat(leftPath)
  const rightInfo = await stat(rightPath)
  if (!leftInfo.isDirectory()) {
    throw new Error('The left path is not a directory.')
  }
  if (!rightInfo.isDirectory()) {
    throw new Error('The right path is not a directory.')
  }

  const leftFiles = await collectDirectoryFiles(leftPath)
  const rightFiles = await collectDirectoryFiles(rightPath)
  const allPaths = Array.from(new Set([...leftFiles.keys(), ...rightFiles.keys()])).sort()
  const cacheKey = JSON.stringify({ leftPath, rightPath, ...options })
  const previousEntries = directoryCache?.key === cacheKey ? directoryCache.entries : new Map()
  const nextEntries = new Map<string, CachedDirectoryEntry>()
  const results: DirectoryEntryResult[] = []
  onTotal?.(allPaths.length)

  for (let index = 0; index < allPaths.length; index += 1) {
    const relativePath = allPaths[index]
    const entry = await compareDirectoryEntry(
      relativePath,
      leftFiles.get(relativePath) ?? null,
      rightFiles.get(relativePath) ?? null,
      options,
      previousEntries.get(relativePath),
      nextEntries,
    )

    if (entry) {
      results.push(entry)
    }
    onUpdate?.(index, entry)
  }

  directoryCache = { key: cacheKey, entries: nextEntries }
  return results
}

async function collectDirectoryFiles(root: string) {
  const files = new Map<string, string>()

  async function walk(current: string) {
    const entries = await readdir(current, { withFileTypes: true })
    for (const entry of entries) {
      const fullPath = join(current, entry.name)
      if (entry.isDirectory()) {
        await walk(fullPath)
      } else if (entry.isFile()) {
        files.set(relative(root, fullPath).split(sep).join('/'), fullPath)
      }
    }
  }

  await walk(root)
  return files
}

async function compareDirectoryEntry(
  relativePath: string,
  leftPath: string | null,
  rightPath: string | null,
  options: CompareOptions,
  cached: CachedDirectoryEntry | undefined,
  nextEntries: Map<string, CachedDirectoryEntry>,
): Promise<DirectoryEntryResult | null> {
  const leftIdentity = leftPath ? await fileIdentity(leftPath) : null
  const rightIdentity = rightPath ? await fileIdentity(rightPath) : null

  if (
    cached &&
    identityEquals(cached.left, leftIdentity) &&
    identityEquals(cached.right, rightIdentity)
  ) {
    nextEntries.set(relativePath, cached)
    return cached.result
  }

  const result = await computeDirectoryEntry(relativePath, leftPath, rightPath, options)
  nextEntries.set(relativePath, {
    left: leftIdentity,
    right: rightIdentity,
    result,
  })
  return result
}

async function computeDirectoryEntry(
  relativePath: string,
  leftPath: string | null,
  rightPath: string | null,
  options: CompareOptions,
): Promise<DirectoryEntryResult | null> {
  if (leftPath && !rightPath) {
    const info = await stat(leftPath)
    return {
      relativePath,
      status: 'leftOnly',
      leftPath,
      rightPath: null,
      leftSize: info.size,
      rightSize: null,
    }
  }

  if (!leftPath && rightPath) {
    const info = await stat(rightPath)
    return {
      relativePath,
      status: 'rightOnly',
      leftPath: null,
      rightPath,
      leftSize: null,
      rightSize: info.size,
    }
  }

  if (!leftPath || !rightPath) {
    return null
  }

  const [leftInfo, rightInfo] = await Promise.all([stat(leftPath), stat(rightPath)])

  // Skip equal-content fast path for trivially differing sizes.
  if (
    leftInfo.size !== rightInfo.size &&
    !(options.ignoreWhitespace || options.ignoreCase)
  ) {
    // Sizes differ and we are not normalising — definitely not equal. Fall
    // through to classification using a small partial sample so we never
    // touch the whole file just to decide kind.
  }

  const [leftSample, rightSample] = await Promise.all([
    sampleFile(leftPath),
    sampleFile(rightPath),
  ])
  const leftKind = detectFileKind(leftPath, leftInfo.size, leftSample)
  const rightKind = detectFileKind(rightPath, rightInfo.size, rightSample)

  if (leftKind === 'text' && rightKind === 'text' && (options.ignoreWhitespace || options.ignoreCase)) {
    if (
      leftInfo.size <= MAX_TEXT_BYTES &&
      rightInfo.size <= MAX_TEXT_BYTES
    ) {
      const [leftText, rightText] = await Promise.all([
        readFile(leftPath, 'utf8'),
        readFile(rightPath, 'utf8'),
      ])
      if (normalizeCompareText(leftText, options) === normalizeCompareText(rightText, options)) {
        return null
      }
    }
  } else if (leftInfo.size === rightInfo.size && await filesEqual(leftPath, rightPath)) {
    return null
  }

  const status = leftKind === 'tooLarge' || rightKind === 'tooLarge'
    ? 'tooLarge'
    : leftKind === 'binary' || rightKind === 'binary' || leftKind === 'image' || rightKind === 'image'
      ? 'binary'
      : 'modified'

  return {
    relativePath,
    status,
    leftPath,
    rightPath,
    leftSize: leftInfo.size,
    rightSize: rightInfo.size,
  }
}

async function fileIdentity(pathValue: string): Promise<FileIdentity> {
  const info = await stat(pathValue)
  return { size: info.size, modifiedMs: Math.trunc(info.mtimeMs) }
}

function identityEquals(left: FileIdentity | null, right: FileIdentity | null) {
  return left?.size === right?.size && left?.modifiedMs === right?.modifiedMs
}

async function openCompareItem(
  leftBase: string,
  rightBase: string,
  relativePathValue: string,
  options: CompareOptions,
) {
  const leftPath = resolveChildPath(leftBase, relativePathValue)
  const rightPath = resolveChildPath(rightBase, relativePathValue)
  return buildFileDiff(leftPath, rightPath, relativePathValue, relativePathValue, options)
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

async function loadBinaryPreview(leftPath: string, rightPath: string, _options: CompareOptions) {
  const [leftLoaded, rightLoaded] = await Promise.all([
    loadBinaryPreviewFile(leftPath),
    loadBinaryPreviewFile(rightPath),
  ])
  return buildBinaryPayload(leftPath, rightPath, leftLoaded, rightLoaded)
}

async function buildFileDiff(
  leftPath: string,
  rightPath: string,
  leftLabel: string,
  rightLabel: string,
  options: CompareOptions,
): Promise<FileDiffResult> {
  const [leftLoaded, rightLoaded] = await Promise.all([
    loadFile(leftPath, false),
    loadFile(rightPath, false),
  ])
  const summary = buildSummary(leftLoaded, rightLoaded)

  if (shouldRenderAsImage(leftLoaded, rightLoaded)) {
    return {
      contentKind: 'image',
      summary,
      leftLabel,
      rightLabel,
      text: null,
      sideBySide: [],
      unified: [],
      image: buildImagePayload(leftPath, rightPath, leftLoaded, rightLoaded),
      binary: null,
    }
  }

  if (leftLoaded.kind === 'tooLarge' || rightLoaded.kind === 'tooLarge') {
    return {
      ...emptyNonTextResult('tooLarge', summary, leftLabel, rightLabel),
      binary: buildBinaryPayload(leftPath, rightPath, leftLoaded, rightLoaded, false),
    }
  }

  if (leftLoaded.kind === 'text' || rightLoaded.kind === 'text') {
    const textPayload = buildTextPayload(leftLoaded, rightLoaded)
    const views = buildTextViews(
      textPayload.leftText,
      textPayload.rightText,
      options,
    )
    return {
      contentKind: 'text',
      summary,
      leftLabel,
      rightLabel,
      text: textPayload,
      sideBySide: views.sideBySide,
      unified: views.unified,
      image: null,
      binary: null,
    }
  }

  return {
    contentKind: 'binary',
    summary,
    leftLabel,
    rightLabel,
    text: null,
    sideBySide: [],
    unified: [],
    image: null,
    binary: buildBinaryPayload(leftPath, rightPath, leftLoaded, rightLoaded, false),
  }
}

function emptyNonTextResult(
  contentKind: ContentKind,
  summary: string,
  leftLabel: string,
  rightLabel: string,
): FileDiffResult {
  return {
    contentKind,
    summary,
    leftLabel,
    rightLabel,
    text: null,
    sideBySide: [],
    unified: [],
    image: null,
    binary: null,
  }
}

async function loadFile(pathValue: string, includeBinaryPreview: boolean): Promise<LoadedFile> {
  let info
  try {
    info = await stat(pathValue)
  } catch {
    return {
      kind: 'missing',
      path: pathValue,
      size: null,
      format: null,
      truncated: false,
    }
  }

  // Small-file fast path: if the file fits in the preview cap, a single
  // partial read gives us everything (sample, preview, full bytes for hash).
  // No streaming, no second open.
  if (info.size <= MAX_BINARY_RENDER_BYTES) {
    const buffer = info.size === 0
      ? new Uint8Array(0)
      : await readPartial(pathValue, info.size)
    const sample =
      buffer.length > BINARY_SAMPLE_BYTES ? buffer.subarray(0, BINARY_SAMPLE_BYTES) : buffer
    const kind = detectFileKind(pathValue, info.size, sample)

    if (kind === 'tooLarge') {
      return { kind, path: pathValue, size: info.size, format: null, truncated: true }
    }

    if (kind === 'text') {
      const bytes = Buffer.from(buffer)
      return {
        kind,
        path: pathValue,
        size: info.size,
        format: null,
        truncated: false,
        text: bytes.toString('utf8'),
        sha256: sha256(bytes),
        lineEnding: bytes.includes(Buffer.from('\r\n')) ? 'crlf' : 'lf',
        hasTrailingNewline: bytes[bytes.length - 1] === 10,
      }
    }

    return {
      kind,
      path: pathValue,
      size: info.size,
      format: detectImageFormat(sample, pathValue),
      truncated: false,
      bytes: includeBinaryPreview ? buffer : new Uint8Array(0),
      sha256: sha256(buffer),
    }
  }

  // Larger file: classify with a cheap 8 KB sample before deciding what to
  // do next. tooLarge files stop here without any further reads.
  const sample = await readPartial(pathValue, BINARY_SAMPLE_BYTES)
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
    // Text means size <= MAX_TEXT_BYTES, bounded.
    const bytes = await readFile(pathValue)
    return {
      kind,
      path: pathValue,
      size: info.size,
      format: null,
      truncated: false,
      text: bytes.toString('utf8'),
      sha256: sha256(bytes),
      lineEnding: bytes.includes(Buffer.from('\r\n')) ? 'crlf' : 'lf',
      hasTrailingNewline: bytes[bytes.length - 1] === 10,
    }
  }

  // Binary or image larger than 256 KB: single streaming pass that
  // captures the preview window and computes the hash simultaneously.
  const { preview, sha256: hash } = await readBinaryPreviewAndHash(pathValue, info.size)
  return {
    kind,
    path: pathValue,
    size: info.size,
    format: detectImageFormat(sample, pathValue),
    truncated: includeBinaryPreview && info.size > MAX_BINARY_RENDER_BYTES,
    bytes: includeBinaryPreview ? preview : new Uint8Array(0),
    sha256: hash ?? undefined,
  }
}

async function loadBinaryPreviewFile(pathValue: string): Promise<LoadedFile> {
  let info
  try {
    info = await stat(pathValue)
  } catch {
    return {
      kind: 'missing',
      path: pathValue,
      size: null,
      format: null,
      truncated: false,
    }
  }

  const previewLength = Math.min(info.size, MAX_BINARY_RENDER_BYTES)
  const preview = previewLength === 0
    ? new Uint8Array(0)
    : await readPartial(pathValue, previewLength)
  const sample =
    preview.length > BINARY_SAMPLE_BYTES ? preview.subarray(0, BINARY_SAMPLE_BYTES) : preview
  const detectedKind = detectFileKind(pathValue, info.size, sample)
  const kind: FileKind = detectedKind === 'text' ? 'binary' : detectedKind

  return {
    kind,
    path: pathValue,
    size: info.size,
    format: detectImageFormat(sample, pathValue),
    truncated: info.size > preview.length,
    bytes: preview,
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
    // Copy out so the returned slice does not pin the larger buffer.
    return Uint8Array.prototype.slice.call(buffer, 0, bytesRead)
  } finally {
    await handle.close().catch(() => undefined)
  }
}

async function sampleFile(pathValue: string) {
  return readPartial(pathValue, BINARY_SAMPLE_BYTES)
}

async function readBinaryPreviewAndHash(
  pathValue: string,
  sizeHint: number,
): Promise<{ preview: Uint8Array; sha256: string | null }> {
  if (sizeHint > HASH_FILE_SIZE_LIMIT) {
    // Files too large to hash: just capture the preview window.
    return {
      preview: await readPartial(pathValue, MAX_BINARY_RENDER_BYTES),
      sha256: null,
    }
  }

  return new Promise((resolveResult, rejectResult) => {
    const hasher = createHash('sha256')
    const previewCap = Math.min(sizeHint, MAX_BINARY_RENDER_BYTES)
    const previewBuffer = previewCap > 0 ? Buffer.alloc(previewCap) : Buffer.alloc(0)
    let previewWritten = 0
    let settled = false

    const stream = createReadStream(pathValue, { highWaterMark: STREAM_CHUNK_BYTES })

    const timeout = setTimeout(() => {
      if (settled) return
      settled = true
      stream.destroy()
      rejectResult(new Error(`Reading file timed out after ${FILE_READ_TIMEOUT_MS / 1000}s: ${pathValue}`))
    }, FILE_READ_TIMEOUT_MS)
    timeout.unref?.()

    stream.on('data', (chunk) => {
      const buffer = chunk as Buffer
      hasher.update(buffer)

      if (previewWritten < previewBuffer.length) {
        const remaining = previewBuffer.length - previewWritten
        const copyLength = buffer.length < remaining ? buffer.length : remaining
        buffer.copy(previewBuffer, previewWritten, 0, copyLength)
        previewWritten += copyLength
      }
    })

    stream.once('end', () => {
      if (settled) return
      settled = true
      clearTimeout(timeout)
      resolveResult({
        preview: Uint8Array.prototype.slice.call(previewBuffer, 0, previewWritten),
        sha256: hasher.digest('hex'),
      })
    })

    stream.once('error', (error) => {
      if (settled) return
      settled = true
      clearTimeout(timeout)
      stream.destroy()
      rejectResult(error)
    })
  })
}

function detectFileKind(pathValue: string, size: number, sample: Uint8Array): FileKind {
  if (size > MAX_TEXT_BYTES && !detectImageFormat(sample, pathValue)) {
    return 'tooLarge'
  }

  if (detectImageFormat(sample, pathValue)) {
    return 'image'
  }

  if (looksBinary(sample)) {
    return 'binary'
  }

  return 'text'
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

function shouldRenderAsImage(left: LoadedFile, right: LoadedFile) {
  return left.kind === 'image' && ['image', 'missing'].includes(right.kind)
    || right.kind === 'image' && ['image', 'missing'].includes(left.kind)
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
    leftSha256: left.kind === 'text' ? left.sha256 ?? null : null,
    rightSha256: right.kind === 'text' ? right.sha256 ?? null : null,
    leftLineEnding: left.lineEnding ?? 'lf',
    rightLineEnding: right.lineEnding ?? 'lf',
    leftHasTrailingNewline: left.hasTrailingNewline ?? false,
    rightHasTrailingNewline: right.hasTrailingNewline ?? false,
  }
}

function buildTextViews(leftText: string, rightText: string, options: CompareOptions) {
  const leftLines = splitLines(leftText)
  const rightLines = splitLines(rightText)
  const pairs = alignLines(leftLines, rightLines, options)
  const sideBySide: SideBySideRow[] = []
  const unified: UnifiedLine[] = []
  let leftLineNumber = 1
  let rightLineNumber = 1

  for (const pair of pairs) {
    const leftLine = pair.left === null ? null : leftLines[pair.left] ?? ''
    const rightLine = pair.right === null ? null : rightLines[pair.right] ?? ''
    let change: DiffChange
    if (leftLine === null) {
      change = 'insert'
    } else if (rightLine === null) {
      change = 'delete'
    } else {
      change = normalizeCompareText(leftLine, options) === normalizeCompareText(rightLine, options)
        ? 'context'
        : 'delete'
    }

    const leftCell = leftLine === null
      ? null
      : buildDiffCell(leftLineNumber++, change === 'insert' ? 'context' : change, leftLine)
    const rightCell = rightLine === null
      ? null
      : buildDiffCell(rightLineNumber++, change === 'delete' && leftLine !== null ? 'insert' : change, rightLine)

    if (leftCell && rightCell && leftCell.change !== 'context' && rightCell.change !== 'context') {
      const [leftSegments, rightSegments] = buildInlineSegments(leftCell.text, rightCell.text)
      leftCell.segments = leftSegments
      rightCell.segments = rightSegments
    }

    sideBySide.push({ left: leftCell, right: rightCell })

    if (leftCell && rightCell && leftCell.change !== 'context' && rightCell.change !== 'context') {
      unified.push(unifiedLine(leftCell, '-'))
      unified.push(unifiedLine(rightCell, '+'))
    } else {
      if (leftCell) {
        unified.push(unifiedLine(leftCell, leftCell.change === 'delete' ? '-' : ' '))
      }
      if (rightCell && !leftCell) {
        unified.push(unifiedLine(rightCell, '+'))
      }
    }
  }

  return { sideBySide, unified }
}

function splitLines(text: string) {
  if (!text) {
    return []
  }
  return text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n')
}

function alignLines(left: string[], right: string[], options: CompareOptions): AlignPair[] {
  return coalesceChangedRows(alignLineRange(left, right, options, 0, left.length, 0, right.length))
}

function alignLineRange(
  left: string[],
  right: string[],
  options: CompareOptions,
  leftStart: number,
  leftEnd: number,
  rightStart: number,
  rightEnd: number,
): AlignPair[] {
  const leftLength = leftEnd - leftStart
  const rightLength = rightEnd - rightStart

  if (leftLength === 0) {
    return range(rightStart, rightEnd).map((rightIndex) => ({ left: null, right: rightIndex }))
  }

  if (rightLength === 0) {
    return range(leftStart, leftEnd).map((leftIndex) => ({ left: leftIndex, right: null }))
  }

  if (leftLength * rightLength <= LCS_MAX_MATRIX_CELLS) {
    return alignLineRangeWithLcs(left, right, options, leftStart, leftEnd, rightStart, rightEnd)
  }

  const anchors = uniqueLineAnchors(left, right, options, leftStart, leftEnd, rightStart, rightEnd)
  if (anchors.length === 0) {
    return alignLineRangeGreedy(left, right, options, leftStart, leftEnd, rightStart, rightEnd)
  }

  const pairs: AlignPair[] = []
  let nextLeftStart = leftStart
  let nextRightStart = rightStart

  for (const anchor of anchors) {
    pairs.push(
      ...alignLineRange(
        left,
        right,
        options,
        nextLeftStart,
        anchor.left,
        nextRightStart,
        anchor.right,
      ),
    )
    pairs.push(anchor)
    nextLeftStart = anchor.left + 1
    nextRightStart = anchor.right + 1
  }

  pairs.push(
    ...alignLineRange(
      left,
      right,
      options,
      nextLeftStart,
      leftEnd,
      nextRightStart,
      rightEnd,
    ),
  )

  return pairs
}

function alignLineRangeWithLcs(
  left: string[],
  right: string[],
  options: CompareOptions,
  leftStart: number,
  leftEnd: number,
  rightStart: number,
  rightEnd: number,
): AlignPair[] {
  const leftLength = leftEnd - leftStart
  const rightLength = rightEnd - rightStart
  const width = rightLength + 1
  const matrix = new Array((leftLength + 1) * width).fill(0)

  for (let leftOffset = leftLength - 1; leftOffset >= 0; leftOffset -= 1) {
    for (let rightOffset = rightLength - 1; rightOffset >= 0; rightOffset -= 1) {
      const offset = leftOffset * width + rightOffset
      matrix[offset] = normalizedLine(left, leftStart + leftOffset, options) === normalizedLine(right, rightStart + rightOffset, options)
        ? matrix[(leftOffset + 1) * width + rightOffset + 1] + 1
        : Math.max(matrix[(leftOffset + 1) * width + rightOffset], matrix[leftOffset * width + rightOffset + 1])
    }
  }

  const pairs: AlignPair[] = []
  let leftOffset = 0
  let rightOffset = 0
  while (leftOffset < leftLength || rightOffset < rightLength) {
    if (
      leftOffset < leftLength &&
      rightOffset < rightLength &&
      normalizedLine(left, leftStart + leftOffset, options) === normalizedLine(right, rightStart + rightOffset, options)
    ) {
      pairs.push({ left: leftStart + leftOffset, right: rightStart + rightOffset })
      leftOffset += 1
      rightOffset += 1
    } else if (
      rightOffset >= rightLength ||
      matrix[(leftOffset + 1) * width + rightOffset] >= matrix[leftOffset * width + rightOffset + 1]
    ) {
      pairs.push({ left: leftStart + leftOffset, right: null })
      leftOffset += 1
    } else {
      pairs.push({ left: null, right: rightStart + rightOffset })
      rightOffset += 1
    }
  }

  return pairs
}

function uniqueLineAnchors(
  left: string[],
  right: string[],
  options: CompareOptions,
  leftStart: number,
  leftEnd: number,
  rightStart: number,
  rightEnd: number,
): AnchorPair[] {
  const leftOccurrences = lineOccurrences(left, options, leftStart, leftEnd)
  const rightOccurrences = lineOccurrences(right, options, rightStart, rightEnd)
  const candidates: AnchorPair[] = []

  for (const [line, leftIndexes] of leftOccurrences) {
    const rightIndexes = rightOccurrences.get(line)
    if (line && leftIndexes.length === 1 && rightIndexes?.length === 1) {
      candidates.push({ left: leftIndexes[0], right: rightIndexes[0] })
    }
  }

  candidates.sort((leftCandidate, rightCandidate) =>
    leftCandidate.left - rightCandidate.left || leftCandidate.right - rightCandidate.right,
  )

  return longestIncreasingRightSequence(candidates)
}

function lineOccurrences(
  lines: string[],
  options: CompareOptions,
  start: number,
  end: number,
) {
  const occurrences = new Map<string, number[]>()
  for (let index = start; index < end; index += 1) {
    const line = normalizedLine(lines, index, options)
    const indexes = occurrences.get(line) ?? []
    indexes.push(index)
    occurrences.set(line, indexes)
  }
  return occurrences
}

function longestIncreasingRightSequence(candidates: AnchorPair[]): AnchorPair[] {
  if (candidates.length === 0) {
    return []
  }

  const lengths = new Array<number>(candidates.length).fill(1)
  const previous = new Array<number>(candidates.length).fill(-1)
  let bestIndex = 0

  for (let index = 0; index < candidates.length; index += 1) {
    for (let prior = 0; prior < index; prior += 1) {
      if (candidates[prior].right < candidates[index].right && lengths[prior] + 1 > lengths[index]) {
        lengths[index] = lengths[prior] + 1
        previous[index] = prior
      }
    }
    if (lengths[index] > lengths[bestIndex]) {
      bestIndex = index
    }
  }

  const anchors: AnchorPair[] = []
  for (let index = bestIndex; index >= 0; index = previous[index]) {
    anchors.push(candidates[index])
    if (previous[index] < 0) {
      break
    }
  }
  return anchors.reverse()
}

function alignLineRangeGreedy(
  left: string[],
  right: string[],
  options: CompareOptions,
  leftStart: number,
  leftEnd: number,
  rightStart: number,
  rightEnd: number,
): AlignPair[] {
  const pairs: AlignPair[] = []
  let leftIndex = leftStart
  let rightIndex = rightStart

  while (leftIndex < leftEnd || rightIndex < rightEnd) {
    if (leftIndex >= leftEnd) {
      pairs.push({ left: null, right: rightIndex })
      rightIndex += 1
      continue
    }

    if (rightIndex >= rightEnd) {
      pairs.push({ left: leftIndex, right: null })
      leftIndex += 1
      continue
    }

    const leftLine = normalizedLine(left, leftIndex, options)
    const rightLine = normalizedLine(right, rightIndex, options)
    if (leftLine === rightLine) {
      pairs.push({ left: leftIndex, right: rightIndex })
      leftIndex += 1
      rightIndex += 1
      continue
    }

    const rightMatchOffset = findNextLine(right, leftLine, rightIndex + 1, rightEnd, options)
    const leftMatchOffset = findNextLine(left, rightLine, leftIndex + 1, leftEnd, options)

    if (rightMatchOffset > 0 && (leftMatchOffset < 0 || rightMatchOffset <= leftMatchOffset)) {
      pairs.push({ left: null, right: rightIndex })
      rightIndex += 1
    } else if (leftMatchOffset > 0) {
      pairs.push({ left: leftIndex, right: null })
      leftIndex += 1
    } else {
      pairs.push({ left: leftIndex, right: null })
      pairs.push({ left: null, right: rightIndex })
      leftIndex += 1
      rightIndex += 1
    }
  }

  return pairs
}

function findNextLine(
  searchLines: string[],
  targetLine: string,
  start: number,
  end: number,
  options: CompareOptions,
) {
  const limit = Math.min(end, start + ALIGN_LOOKAHEAD_WINDOW)
  for (let index = start; index < limit; index += 1) {
    if (normalizedLine(searchLines, index, options) === targetLine) {
      return index - start + 1
    }
  }

  return -1
}

function coalesceChangedRows(pairs: AlignPair[]): AlignPair[] {
  const result: AlignPair[] = []
  for (let index = 0; index < pairs.length; index += 1) {
    const current = pairs[index]
    const next = pairs[index + 1]
    if (current.left !== null && current.right === null && next?.left === null && next.right !== null) {
      result.push({ left: current.left, right: next.right })
      index += 1
    } else {
      result.push(current)
    }
  }
  return result
}

function range(start: number, end: number) {
  return Array.from({ length: end - start }, (_value, index) => start + index)
}

function normalizedLine(lines: string[], index: number, options: CompareOptions) {
  return normalizeCompareText(lines[index] ?? '', options)
}

function normalizeCompareText(text: string, options: CompareOptions) {
  let value = text
  if (options.ignoreWhitespace) {
    value = value.replace(/\s+/g, '')
  }
  if (options.ignoreCase) {
    value = value.toLowerCase()
  }
  return value
}

function buildDiffCell(lineNumber: number, change: DiffChange, text: string): DiffCell {
  return {
    lineNumber,
    prefix: change === 'delete' ? '-' : change === 'insert' ? '+' : ' ',
    text,
    segments: [{ text, highlighted: false }],
    change,
  }
}

function buildInlineSegments(leftText: string, rightText: string): [DiffSegment[], DiffSegment[]] {
  let prefixLength = 0
  const minLength = Math.min(leftText.length, rightText.length)
  while (prefixLength < minLength && leftText[prefixLength] === rightText[prefixLength]) {
    prefixLength += 1
  }

  let suffixLength = 0
  while (
    suffixLength < minLength - prefixLength &&
    leftText[leftText.length - 1 - suffixLength] === rightText[rightText.length - 1 - suffixLength]
  ) {
    suffixLength += 1
  }

  return [
    splitInlineSegments(leftText, prefixLength, suffixLength),
    splitInlineSegments(rightText, prefixLength, suffixLength),
  ]
}

function splitInlineSegments(text: string, prefixLength: number, suffixLength: number): DiffSegment[] {
  const changedEnd = text.length - suffixLength
  const segments: DiffSegment[] = []
  if (prefixLength > 0) {
    segments.push({ text: text.slice(0, prefixLength), highlighted: false })
  }
  if (changedEnd > prefixLength) {
    segments.push({ text: text.slice(prefixLength, changedEnd), highlighted: true })
  }
  if (suffixLength > 0) {
    segments.push({ text: text.slice(changedEnd), highlighted: false })
  }
  return segments.length > 0 ? segments : [{ text, highlighted: false }]
}

function unifiedLine(cell: DiffCell, prefix: string): UnifiedLine {
  return {
    leftLineNumber: cell.change === 'insert' ? null : cell.lineNumber,
    rightLineNumber: cell.change === 'delete' ? null : cell.lineNumber,
    prefix,
    text: cell.text,
    segments: cell.segments,
    change: cell.change,
  }
}

function buildImagePayload(
  leftPath: string,
  rightPath: string,
  left: LoadedFile,
  right: LoadedFile,
): ImageDiffPayload {
  const identical = left.sha256 !== undefined && left.sha256 === right.sha256
  return {
    leftAssetUrl: left.kind === 'image' ? pathToFileURL(leftPath).toString() : null,
    rightAssetUrl: right.kind === 'image' ? pathToFileURL(rightPath).toString() : null,
    leftMeta: buildBinaryMeta(leftPath, left, identical),
    rightMeta: buildBinaryMeta(rightPath, right, identical),
  }
}

function buildBinaryPayload(
  leftPath: string,
  rightPath: string,
  left: LoadedFile,
  right: LoadedFile,
  includeBytes = true,
): BinaryDiffPayload {
  const leftBytes = includeBytes ? left.bytes ?? new Uint8Array(0) : new Uint8Array(0)
  const rightBytes = includeBytes ? right.bytes ?? new Uint8Array(0) : new Uint8Array(0)
  const identical = left.sha256 !== undefined && left.sha256 === right.sha256
  const truncated = left.truncated || right.truncated
  const stats = identical || truncated
    ? { changedByteCount: null, changedRowCount: null, firstDifferenceOffset: null }
    : binaryStats(leftBytes, rightBytes)

  return {
    leftMeta: buildBinaryMeta(leftPath, left, identical),
    rightMeta: buildBinaryMeta(rightPath, right, identical),
    leftBytes,
    rightBytes,
    bytesPerRow: HEX_BYTES_PER_ROW,
    ...stats,
    truncated,
    previewLoaded: includeBytes,
  }
}

function buildBinaryMeta(pathValue: string, file: LoadedFile, identicalToOtherSide: boolean): BinaryFileMeta {
  const exists = file.kind !== 'missing' && file.kind !== 'text'
  return {
    exists,
    path: pathValue,
    size: exists ? file.size : null,
    sha256: exists ? file.sha256 ?? null : null,
    format: exists ? file.format : null,
    identicalToOtherSide: exists && identicalToOtherSide,
  }
}

function binaryStats(left: Uint8Array, right: Uint8Array) {
  const total = Math.max(left.length, right.length)
  let changedByteCount = 0
  let changedRowCount = 0
  let firstDifferenceOffset: number | null = null

  for (let offset = 0; offset < total; offset += HEX_BYTES_PER_ROW) {
    let rowChanged = false
    for (let index = 0; index < HEX_BYTES_PER_ROW; index += 1) {
      const byteOffset = offset + index
      if (left[byteOffset] !== right[byteOffset]) {
        changedByteCount += 1
        rowChanged = true
        firstDifferenceOffset ??= byteOffset
      }
    }
    if (rowChanged) {
      changedRowCount += 1
    }
  }

  return { changedByteCount, changedRowCount, firstDifferenceOffset }
}

async function filesEqual(leftPath: string, rightPath: string) {
  const [leftHandle, rightHandle] = await Promise.all([
    open(leftPath, 'r'),
    open(rightPath, 'r'),
  ])

  const leftBuffer = Buffer.alloc(FILES_EQUAL_CHUNK_BYTES)
  const rightBuffer = Buffer.alloc(FILES_EQUAL_CHUNK_BYTES)
  let offset = 0

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

      // Compare only the populated prefix; bail on first mismatch.
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

function sha256(bytes: Uint8Array) {
  return createHash('sha256').update(bytes).digest('hex')
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error)
}
