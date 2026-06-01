import { app, dialog, ipcMain } from 'electron'
import type { BrowserWindow } from 'electron'
import { createHash, randomUUID } from 'node:crypto'
import { existsSync } from 'node:fs'
import {
  mkdir,
  open,
  readdir,
  readFile,
  stat,
  writeFile,
} from 'node:fs/promises'
import { basename, dirname, isAbsolute, join, parse, relative, resolve, sep } from 'node:path'
import type {
  CompareOptions,
  CompareResponse,
  DirectoryEntryResult,
  DirectoryListing,
  ExplorerEntry,
  FileDiffResult,
  LaunchContext,
  PathInfo,
  PersistedSession,
  PollDirectoryCompareResponse,
  TextDiffPayload,
  UpdateActionResult,
  UpdateChannel,
  UpdateCheckResult,
  UnsupportedDiffPayload,
} from '../../src/lib/types'

const MAX_TEXT_BYTES = 1024 * 1024
const MAX_SESSION_STATE_BYTES = 1024 * 1024
const BINARY_SAMPLE_BYTES = 8192
const FILES_EQUAL_CHUNK_BYTES = 1024 * 1024

type FileKind = 'missing' | 'tooLarge' | 'text' | 'image' | 'binary' | 'readError'

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

let launchContext: LaunchContext | null | undefined
let directoryCache: DirectoryCacheSession | null = null
const directoryJobs = new Map<string, DirectoryJob>()
const windowLaunchContexts = new Map<number, LaunchContext | null>()
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
  ipcMain.handle('diffly:loadLaunchContext', (event) => loadLaunchContext(event.sender.id))
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
}

export function registerWindowLaunchContext(
  window: BrowserWindow,
  context: LaunchContext | null,
) {
  const webContentsId = window.webContents.id
  windowLaunchContexts.set(webContentsId, context)
  window.webContents.once('destroyed', () => {
    windowLaunchContexts.delete(webContentsId)
  })
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

function loadLaunchContext(webContentsId: number): LaunchContext | null {
  if (windowLaunchContexts.has(webContentsId)) {
    return windowLaunchContexts.get(webContentsId) ?? null
  }

  if (launchContext === undefined) {
    launchContext = parseLaunchContext(process.argv.slice(1))
  }
  return launchContext
}

export function getLaunchContextFromArgs(args: string[]) {
  return parseLaunchContext(args)
}

function parseLaunchContext(args: string[]): LaunchContext | null {
  const index = args.indexOf('--open-here')
  if (index < 0) {
    return null
  }

  const openHerePath = args[index + 1]?.trim()
  if (!openHerePath) {
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

  const status = leftKind === 'text' && rightKind === 'text'
    ? 'modified'
    : 'unsupported'

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

async function buildFileDiff(
  leftPath: string,
  rightPath: string,
  leftLabel: string,
  rightLabel: string,
  _options: CompareOptions,
): Promise<FileDiffResult> {
  const [leftLoaded, rightLoaded] = await Promise.all([
    loadFile(leftPath),
    loadFile(rightPath),
  ])
  const summary = buildSummary(leftLoaded, rightLoaded)

  if (canBuildTextDiff(leftLoaded, rightLoaded)) {
    const textPayload = buildTextPayload(leftLoaded, rightLoaded)
    return {
      contentKind: 'text',
      summary,
      leftLabel,
      rightLabel,
      text: textPayload,
      unsupported: null,
    }
  }

  return {
    contentKind: 'unsupported',
    summary,
    leftLabel,
    rightLabel,
    text: null,
    unsupported: buildUnsupportedPayload(leftPath, rightPath, leftLoaded, rightLoaded),
  }
}

function canBuildTextDiff(left: LoadedFile, right: LoadedFile) {
  return (
    (left.kind === 'text' && (right.kind === 'text' || right.kind === 'missing')) ||
    (right.kind === 'text' && (left.kind === 'text' || left.kind === 'missing'))
  )
}

async function loadFile(pathValue: string): Promise<LoadedFile> {
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
    try {
      bytes = await readFile(pathValue)
      new TextDecoder('utf-8', { fatal: true }).decode(bytes)
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
