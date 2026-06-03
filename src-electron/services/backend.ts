import { app, dialog, ipcMain } from 'electron'
import type { BrowserWindow } from 'electron'
import { randomUUID } from 'node:crypto'
import { existsSync } from 'node:fs'
import type { Stats } from 'node:fs'
import {
  mkdir,
  open,
  readdir,
  readFile,
  stat,
  writeFile,
} from 'node:fs/promises'
import { basename, dirname, isAbsolute, join, parse, resolve, sep } from 'node:path'
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
const DIRECTORY_COMPARE_CONCURRENCY = 16
const DIRECTORY_WALK_CONCURRENCY = 16
const DIRECTORY_CACHE_LIMIT = 8
const DIRECTORY_POLL_UPDATE_LIMIT = 512
const DIRECTORY_JOB_RETENTION_MS = 60_000
const LIST_DIRECTORY_STAT_CONCURRENCY = 32
const DRIVE_ROOT_PROBE_TIMEOUT_MS = 250
const CRLF_BYTES = Buffer.from('\r\n')
const UTF8_DECODER = new TextDecoder('utf-8', { fatal: true })

type FileKind = 'missing' | 'tooLarge' | 'text' | 'image' | 'binary' | 'readError'

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

interface DirectoryJob {
  totalCount: number | null
  completedCount: number
  updates: Array<{ index: number; entry: DirectoryEntryResult | null }>
  done: boolean
  error: string | null
  cancelled: boolean
  completedAt: number | null
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
const directoryCache = new Map<string, DirectoryCacheSession>()
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
  ipcMain.handle('diffly:cancelDirectoryCompare', (_event, payload: { jobId: string }) =>
    cancelDirectoryCompare(payload.jobId),
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

  const entries = await Promise.all(
    Array.from({ length: 26 }, (_, index) =>
      driveRootEntry(`${String.fromCharCode(65 + index)}:\\`),
    ),
  )

  return entries.filter((entry): entry is ExplorerEntry => entry !== null)
}

async function listDirectory(pathValue: string): Promise<DirectoryListing> {
  const entries = await readdir(pathValue, { withFileTypes: true })
  const directories: Array<{ path: string; kind: ExplorerEntry['kind'] }> = []
  const files: Array<{ path: string; kind: ExplorerEntry['kind'] }> = []

  for (const entry of entries) {
    const fullPath = join(pathValue, entry.name)
    if (entry.isDirectory()) {
      directories.push({ path: fullPath, kind: 'directory' })
    } else if (entry.isFile()) {
      files.push({ path: fullPath, kind: 'file' })
    }
  }

  const [directoryEntries, fileEntries] = await Promise.all([
    buildExplorerEntries(directories),
    buildExplorerEntries(files),
  ])

  directoryEntries.sort(compareExplorerEntries)
  fileEntries.sort(compareExplorerEntries)

  return {
    path: pathValue,
    parentPath: dirname(pathValue) === pathValue ? null : dirname(pathValue),
    directories: directoryEntries,
    files: fileEntries,
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

async function driveRootEntry(pathValue: string): Promise<ExplorerEntry | null> {
  const info = await statWithTimeout(pathValue, DRIVE_ROOT_PROBE_TIMEOUT_MS)
  if (!info?.isDirectory()) {
    return null
  }

  return {
    name: basename(pathValue) || pathValue,
    path: pathValue,
    kind: 'drive',
    size: null,
    modifiedMs: Math.trunc(info.mtimeMs),
  }
}

async function statWithTimeout(pathValue: string, timeoutMs: number): Promise<Stats | null> {
  let timeoutId: NodeJS.Timeout | null = null
  const probe = stat(pathValue).catch(() => null)
  const timeout = new Promise<null>((resolveTimeout) => {
    timeoutId = setTimeout(() => resolveTimeout(null), timeoutMs)
  })

  try {
    return await Promise.race([probe, timeout])
  } finally {
    if (timeoutId) {
      clearTimeout(timeoutId)
    }
  }
}

async function buildExplorerEntries(
  items: Array<{ path: string; kind: ExplorerEntry['kind'] }>,
) {
  const results: ExplorerEntry[] = new Array(items.length)
  let nextIndex = 0

  const runWorker = async () => {
    while (true) {
      const index = nextIndex
      nextIndex += 1

      if (index >= items.length) {
        return
      }

      const item = items[index]
      results[index] = await explorerEntry(item.path, item.kind)
    }
  }

  const workerCount = Math.min(LIST_DIRECTORY_STAT_CONCURRENCY, items.length)
  await Promise.all(Array.from({ length: workerCount }, () => runWorker()))
  return results
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

export async function comparePaths(
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

export async function startDirectoryCompare(leftPath: string, rightPath: string, options: CompareOptions) {
  pruneDirectoryJobs()
  const jobId = randomUUID()
  const job: DirectoryJob = {
    totalCount: null,
    completedCount: 0,
    updates: [],
    done: false,
    error: null,
    cancelled: false,
    completedAt: null,
  }
  directoryJobs.set(jobId, job)

  void runDirectoryJob(job, leftPath, rightPath, options)
  return { jobId }
}

export function pollDirectoryCompare(jobId: string): PollDirectoryCompareResponse {
  pruneDirectoryJobs()
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

  const updates = job.updates.splice(0, DIRECTORY_POLL_UPDATE_LIMIT)
  const done = job.done && job.updates.length === 0
  if (done) {
    directoryJobs.delete(jobId)
  }

  return {
    totalCount: job.totalCount,
    completedCount: job.completedCount,
    updates,
    done,
    error: job.error,
  }
}

export function cancelDirectoryCompare(jobId: string) {
  const job = directoryJobs.get(jobId)
  if (!job) {
    return false
  }

  job.cancelled = true
  job.done = true
  job.updates = []
  job.completedAt = Date.now()
  directoryJobs.delete(jobId)
  return true
}

function pruneDirectoryJobs() {
  const now = Date.now()
  for (const [jobId, job] of directoryJobs) {
    if (job.done && job.completedAt !== null && now - job.completedAt > DIRECTORY_JOB_RETENTION_MS) {
      directoryJobs.delete(jobId)
    }
  }
}

function getCachedDirectoryEntries(cacheKey: string) {
  const cached = directoryCache.get(cacheKey)
  if (!cached) {
    return new Map<string, CachedDirectoryEntry>()
  }

  directoryCache.delete(cacheKey)
  directoryCache.set(cacheKey, cached)
  return cached.entries
}

function setCachedDirectoryEntries(cacheKey: string, entries: Map<string, CachedDirectoryEntry>) {
  directoryCache.delete(cacheKey)
  directoryCache.set(cacheKey, { key: cacheKey, entries })

  while (directoryCache.size > DIRECTORY_CACHE_LIMIT) {
    const oldestKey = directoryCache.keys().next().value
    if (oldestKey === undefined) {
      return
    }
    directoryCache.delete(oldestKey)
  }
}

export function clearDirectoryCompareCache() {
  directoryCache.clear()
}

async function runDirectoryJob(
  job: DirectoryJob,
  leftPath: string,
  rightPath: string,
  options: CompareOptions,
) {
  try {
    if (job.cancelled) {
      return
    }

    const entries = await compareDirectories(leftPath, rightPath, options, (index, entry) => {
      if (job.cancelled) {
        return
      }
      job.completedCount += 1
      if (entry) {
        job.updates.push({ index, entry })
      }
    }, (total) => {
      job.totalCount = total
    }, () => job.cancelled)

    if (job.cancelled) {
      return
    }

    if (job.totalCount === null) {
      job.totalCount = entries.length
      entries.forEach((entry, index) => {
        job.completedCount += 1
        job.updates.push({ index, entry })
      })
    }
  } catch (error) {
    if (!job.cancelled) {
      job.error = errorMessage(error)
    }
  } finally {
    job.done = true
    job.completedAt = Date.now()
  }
}

async function compareDirectories(
  leftPath: string,
  rightPath: string,
  options: CompareOptions,
  onUpdate?: (index: number, entry: DirectoryEntryResult | null) => void,
  onTotal?: (total: number) => void,
  isCancelled?: () => boolean,
): Promise<DirectoryEntryResult[]> {
  const [leftInfo, rightInfo] = await Promise.all([stat(leftPath), stat(rightPath)])
  if (!leftInfo.isDirectory()) {
    throw new Error('The left path is not a directory.')
  }
  if (!rightInfo.isDirectory()) {
    throw new Error('The right path is not a directory.')
  }

  const [leftFiles, rightFiles] = await Promise.all([
    collectDirectoryFiles(leftPath, isCancelled),
    collectDirectoryFiles(rightPath, isCancelled),
  ])

  if (isCancelled?.()) {
    return []
  }

  const allPaths = Array.from(new Set([...leftFiles.keys(), ...rightFiles.keys()])).sort()
  const cacheKey = JSON.stringify({ leftPath, rightPath, ...options })
  const previousEntries = getCachedDirectoryEntries(cacheKey)
  const nextEntries = new Map<string, CachedDirectoryEntry>()
  const resultSlots: Array<DirectoryEntryResult | null> = new Array(allPaths.length).fill(null)
  let nextIndex = 0
  onTotal?.(allPaths.length)

  const runWorker = async () => {
    while (true) {
      if (isCancelled?.()) {
        return
      }

      const index = nextIndex
      nextIndex += 1

      if (index >= allPaths.length) {
        return
      }

      const relativePath = allPaths[index]
      const entry = await compareDirectoryEntry(
        relativePath,
        leftFiles.get(relativePath) ?? null,
        rightFiles.get(relativePath) ?? null,
        options,
        previousEntries.get(relativePath),
        nextEntries,
        isCancelled,
      )

      if (isCancelled?.()) {
        return
      }

      resultSlots[index] = entry
      if (!isCancelled?.()) {
        onUpdate?.(index, entry)
      }
    }
  }

  const workerCount = Math.min(DIRECTORY_COMPARE_CONCURRENCY, allPaths.length)
  await Promise.all(Array.from({ length: workerCount }, () => runWorker()))

  if (isCancelled?.()) {
    return []
  }

  const results = resultSlots.filter((entry): entry is DirectoryEntryResult => entry !== null)
  setCachedDirectoryEntries(cacheKey, nextEntries)
  return results
}

async function collectDirectoryFiles(root: string, isCancelled?: () => boolean) {
  const files = new Map<string, string>()
  const pending: Array<{ absolutePath: string; relativePath: string }> = [
    { absolutePath: root, relativePath: '' },
  ]
  let pendingHead = 0
  let activeCount = 0
  let done = false

  return new Promise<Map<string, string>>((resolveFiles, rejectFiles) => {
    const pump = () => {
      if (isCancelled?.()) {
        done = true
        resolveFiles(files)
        return
      }

      while (!done && activeCount < DIRECTORY_WALK_CONCURRENCY && pendingHead < pending.length) {
        const current = pending[pendingHead]
        pendingHead += 1
        if (!current) {
          continue
        }

        activeCount += 1
        void readdir(current.absolutePath, { withFileTypes: true })
          .then((entries) => {
            if (isCancelled?.()) {
              return
            }

            for (const entry of entries) {
              if (isCancelled?.()) {
                return
              }

              const absolutePath = join(current.absolutePath, entry.name)
              const relativePath = current.relativePath
                ? `${current.relativePath}/${entry.name}`
                : entry.name

              if (entry.isDirectory()) {
                pending.push({ absolutePath, relativePath })
              } else if (entry.isFile()) {
                files.set(relativePath, absolutePath)
              }
            }
          })
          .catch((error) => {
            done = true
            rejectFiles(error)
          })
          .finally(() => {
            activeCount -= 1
            if (done) {
              return
            }

            if (activeCount === 0 && pendingHead >= pending.length) {
              done = true
              resolveFiles(files)
              return
            }

            pump()
          })
      }
    }

    pump()
  })
}

async function compareDirectoryEntry(
  relativePath: string,
  leftPath: string | null,
  rightPath: string | null,
  options: CompareOptions,
  cached: CachedDirectoryEntry | undefined,
  nextEntries: Map<string, CachedDirectoryEntry>,
  isCancelled?: () => boolean,
): Promise<DirectoryEntryResult | null> {
  if (isCancelled?.()) {
    return null
  }

  const leftIdentity = leftPath ? await fileIdentity(leftPath) : null
  const rightIdentity = rightPath ? await fileIdentity(rightPath) : null

  if (isCancelled?.()) {
    return null
  }

  if (
    cached &&
    identityEquals(cached.left, leftIdentity) &&
    identityEquals(cached.right, rightIdentity)
  ) {
    nextEntries.set(relativePath, cached)
    return cached.result
  }

  const result = await computeDirectoryEntry(
    relativePath,
    leftPath,
    rightPath,
    leftIdentity,
    rightIdentity,
    options,
  )
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
  leftIdentity: FileIdentity | null,
  rightIdentity: FileIdentity | null,
  options: CompareOptions,
): Promise<DirectoryEntryResult | null> {
  if (leftPath && !rightPath) {
    return {
      relativePath,
      status: 'leftOnly',
      leftPath,
      rightPath: null,
      leftSize: leftIdentity?.size ?? null,
      rightSize: null,
    }
  }

  if (!leftPath && rightPath) {
    return {
      relativePath,
      status: 'rightOnly',
      leftPath: null,
      rightPath,
      leftSize: null,
      rightSize: rightIdentity?.size ?? null,
    }
  }

  if (!leftPath || !rightPath) {
    return null
  }

  if (!leftIdentity || !rightIdentity) {
    return null
  }

  // Skip equal-content fast path for trivially differing sizes.
  if (
    leftIdentity.size !== rightIdentity.size &&
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
  const leftKind = detectFileKind(leftPath, leftIdentity.size, leftSample)
  const rightKind = detectFileKind(rightPath, rightIdentity.size, rightSample)

  if (leftIdentity.size === rightIdentity.size) {
    const samplesEqual = bytesEqual(leftSample, rightSample)
    if (samplesEqual && leftIdentity.size <= leftSample.byteLength) {
      return null
    }
    if (samplesEqual && await filesEqual(leftPath, rightPath, leftSample.byteLength)) {
      return null
    }
  }

  if (leftKind === 'text' && rightKind === 'text' && (options.ignoreWhitespace || options.ignoreCase)) {
    if (
      leftIdentity.size <= MAX_TEXT_BYTES &&
      rightIdentity.size <= MAX_TEXT_BYTES
    ) {
      const [leftText, rightText] = await Promise.all([
        readFile(leftPath, 'utf8'),
        readFile(rightPath, 'utf8'),
      ])
      if (normalizeCompareText(leftText, options) === normalizeCompareText(rightText, options)) {
        return null
      }
    }
  }

  const status = leftKind === 'text' && rightKind === 'text'
    ? 'modified'
    : 'unsupported'

  return {
    relativePath,
    status,
    leftPath,
    rightPath,
    leftSize: leftIdentity.size,
    rightSize: rightIdentity.size,
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

function bytesEqual(left: Uint8Array, right: Uint8Array) {
  if (left.byteLength !== right.byteLength) {
    return false
  }

  const leftBuffer = Buffer.from(left.buffer, left.byteOffset, left.byteLength)
  const rightBuffer = Buffer.from(right.buffer, right.byteOffset, right.byteLength)
  return leftBuffer.compare(rightBuffer) === 0
}

async function filesEqual(leftPath: string, rightPath: string, startOffset = 0) {
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

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error)
}
