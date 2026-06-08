import { app, ipcMain } from 'electron'
import { randomUUID } from 'node:crypto'
import {
  readdir,
  readFile,
  stat,
} from 'node:fs/promises'
import { basename, join } from 'node:path'
import type {
  CompareOptions,
  CompareResponse,
  CreateDiffSessionResponse,
  DiffEntry,
  DiffEntryFilter,
  DiffSource,
  DirectoryEntryResult,
  FileDiffResult,
  PersistedSession,
  PollDirectoryCompareResponse,
  UpdateChannel,
} from '../../src/lib/types'
import {
  choosePath,
  listDirectory,
  listRoots,
  pathInfo,
} from './explorer-service'
import { loadLaunchContext } from './launch-context'
import {
  loadSessionState,
  saveSessionState,
} from './session-store'
import {
  checkForUpdates,
  downloadUpdate,
  installUpdate,
} from './update-service'
import {
  MAX_TEXT_BYTES,
  buildFileDiff,
  bytesEqual,
  detectFileKind,
  fileIdentity,
  filesEqual,
  identityEquals,
  normalizeCompareText,
  openCompareItem,
  sampleFile,
  type FileIdentity,
} from './file-diff'
import { DiffSessionService } from './diff/diff-session-service'

const DIRECTORY_COMPARE_CONCURRENCY = 16
const DIRECTORY_WALK_CONCURRENCY = 16
const DIRECTORY_CACHE_LIMIT = 8
const DIRECTORY_POLL_UPDATE_LIMIT = 512
const DIRECTORY_JOB_RETENTION_MS = 60_000

interface DirectoryJob {
  totalCount: number | null
  completedCount: number
  updates: Array<{ index: number; entry: DirectoryEntryResult | null }>
  done: boolean
  error: string | null
  cancelled: boolean
  completedAt: number | null
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

const directoryCache = new Map<string, DirectoryCacheSession>()
const directoryJobs = new Map<string, DirectoryJob>()
const diffSessionService = new DiffSessionService({
  compareDirectories,
  openCompareItem,
  buildFileDiff,
})

export {
  clearDirectoryListingCache,
  listDirectory,
  listRoots,
} from './explorer-service'
export {
  getLaunchContextFromArgs,
  registerWindowLaunchContext,
} from './launch-context'
export { loadSessionState, saveSessionState } from './session-store'
export { clearFileDiffCache } from './file-diff'

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
  ipcMain.handle('diffly:createDiffSession', (_event, payload) =>
    createDiffSession(payload?.source, payload?.options),
  )
  ipcMain.handle('diffly:listDiffEntries', (_event, payload) =>
    listDiffEntries(payload?.sessionId, payload?.filter),
  )
  ipcMain.handle('diffly:openDiffEntry', (_event, payload) =>
    openDiffEntry(payload?.sessionId, payload?.entryId, payload?.options),
  )
  ipcMain.handle('diffly:refreshDiffSession', (_event, payload) =>
    refreshDiffSession(payload?.sessionId),
  )
  ipcMain.handle('diffly:disposeDiffSession', (_event, payload) =>
    disposeDiffSession(payload?.sessionId),
  )
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

export async function createDiffSession(
  source: DiffSource,
  options: CompareOptions,
): Promise<CreateDiffSessionResponse> {
  return diffSessionService.create(source, options)
}

export function listDiffEntries(
  sessionId: string,
  filter?: DiffEntryFilter,
): DiffEntry[] {
  return diffSessionService.listEntries(sessionId, filter)
}

export async function openDiffEntry(
  sessionId: string,
  entryId: string,
  options: CompareOptions,
): Promise<FileDiffResult> {
  return diffSessionService.openEntry(sessionId, entryId, options)
}

export async function refreshDiffSession(sessionId: string): Promise<CreateDiffSessionResponse> {
  return diffSessionService.refresh(sessionId)
}

export function disposeDiffSession(sessionId: string): void {
  diffSessionService.dispose(sessionId)
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

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error)
}
