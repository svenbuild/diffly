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
  DiffEntry,
  DiffSource,
  DirectoryEntryResult,
  FileDiffResult,
  PollDirectoryCompareResponse,
  StartDirectoryCompareResponse,
} from '../../../src/lib/types'
import type {
  DiffSessionProvider,
  DiffSessionRecordLike,
  ProviderEntryData,
  ProviderSessionData,
} from '../diff/provider'
import {
  MAX_TEXT_BYTES,
  buildFileDiff,
  bytesEqual,
  detectFileKind,
  fileIdentity,
  filesEqual,
  identityEquals,
  normalizeCompareText,
  openCompareItem as openLocalCompareItem,
  sampleFile,
  type FileIdentity,
} from '../file-diff'

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

export class LocalProvider implements DiffSessionProvider {
  private readonly directoryCache = new Map<string, DirectoryCacheSession>()
  private readonly directoryJobs = new Map<string, DirectoryJob>()

  create(source: DiffSource, options: CompareOptions): Promise<ProviderSessionData> {
    return this.buildLocalProviderSessionData(source, options)
  }

  openEntry(
    session: DiffSessionRecordLike,
    entryId: string,
    options: CompareOptions,
  ): Promise<FileDiffResult> {
    const entry = session.entryData.get(entryId)
    if (!entry) {
      throw new Error('Diff entry was not found.')
    }

    switch (entry.kind) {
      case 'localFile':
        return buildFileDiff(
          entry.leftPath,
          entry.rightPath,
          entry.leftLabel,
          entry.rightLabel,
          options,
        )
      case 'localDirectory':
        return this.openCompareItem(
          entry.leftBase,
          entry.rightBase,
          entry.relativePath,
          options,
        )
      default:
        return assertUnsupportedLocalEntry(entry)
    }
  }

  refresh(session: DiffSessionRecordLike): Promise<ProviderSessionData> {
    return this.create(session.source, session.options)
  }

  async comparePaths(
    leftPath: string,
    rightPath: string,
    mode: 'file' | 'directory',
    options: CompareOptions,
  ): Promise<CompareResponse> {
    if (mode === 'directory') {
      return {
        kind: 'directory',
        entries: await this.compareDirectories(leftPath, rightPath, options),
      }
    }

    return {
      kind: 'file',
      result: await buildFileDiff(
        leftPath,
        rightPath,
        basename(leftPath),
        basename(rightPath),
        options,
      ),
    }
  }

  async startDirectoryCompare(
    leftPath: string,
    rightPath: string,
    options: CompareOptions,
  ): Promise<StartDirectoryCompareResponse> {
    this.pruneDirectoryJobs()
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
    this.directoryJobs.set(jobId, job)

    void this.runDirectoryJob(job, leftPath, rightPath, options)
    return { jobId }
  }

  pollDirectoryCompare(jobId: string): PollDirectoryCompareResponse {
    this.pruneDirectoryJobs()
    const job = this.directoryJobs.get(jobId)
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
      this.directoryJobs.delete(jobId)
    }

    return {
      totalCount: job.totalCount,
      completedCount: job.completedCount,
      updates,
      done,
      error: job.error,
    }
  }

  cancelDirectoryCompare(jobId: string) {
    const job = this.directoryJobs.get(jobId)
    if (!job) {
      return false
    }

    job.cancelled = true
    job.done = true
    job.updates = []
    job.completedAt = Date.now()
    this.directoryJobs.delete(jobId)
    return true
  }

  openCompareItem(
    leftBase: string,
    rightBase: string,
    relativePath: string,
    options: CompareOptions,
  ): Promise<FileDiffResult> {
    return openLocalCompareItem(leftBase, rightBase, relativePath, options)
  }

  clearDirectoryCompareCache() {
    this.directoryCache.clear()
  }

  private async buildLocalProviderSessionData(
    source: DiffSource,
    options: CompareOptions,
  ): Promise<ProviderSessionData> {
    if (source.kind !== 'local') {
      throw new Error('Expected a local diff source.')
    }
    if (source.compareMode !== 'file' && source.compareMode !== 'directory') {
      throw new Error('Invalid local compare mode.')
    }

    const entryData = new Map<string, ProviderEntryData>()
    const entries: DiffEntry[] = []

    if (source.compareMode === 'file') {
      const displayPath = basename(source.rightPath) || basename(source.leftPath) || 'File'
      const entry: DiffEntry = {
        id: 'file',
        path: displayPath,
        oldPath: null,
        displayPath,
        status: 'modified',
        leftSize: await getFileSize(source.leftPath),
        rightSize: await getFileSize(source.rightPath),
      }
      entries.push(entry)
      entryData.set(entry.id, {
        kind: 'localFile',
        leftPath: source.leftPath,
        rightPath: source.rightPath,
        leftLabel: basename(source.leftPath),
        rightLabel: basename(source.rightPath),
      })
    } else {
      const directoryEntries = await this.compareDirectories(
        source.leftPath,
        source.rightPath,
        options,
      )
      for (const directoryEntry of directoryEntries) {
        const entry = mapDirectoryEntryToDiffEntry(directoryEntry)
        entries.push(entry)
        entryData.set(entry.id, {
          kind: 'localDirectory',
          leftBase: source.leftPath,
          rightBase: source.rightPath,
          relativePath: directoryEntry.relativePath,
        })
      }
    }

    return {
      entries,
      entryData,
    }
  }

  private pruneDirectoryJobs() {
    const now = Date.now()
    for (const [jobId, job] of this.directoryJobs) {
      if (job.done && job.completedAt !== null && now - job.completedAt > DIRECTORY_JOB_RETENTION_MS) {
        this.directoryJobs.delete(jobId)
      }
    }
  }

  private getCachedDirectoryEntries(cacheKey: string) {
    const cached = this.directoryCache.get(cacheKey)
    if (!cached) {
      return new Map<string, CachedDirectoryEntry>()
    }

    this.directoryCache.delete(cacheKey)
    this.directoryCache.set(cacheKey, cached)
    return cached.entries
  }

  private setCachedDirectoryEntries(
    cacheKey: string,
    entries: Map<string, CachedDirectoryEntry>,
  ) {
    this.directoryCache.delete(cacheKey)
    this.directoryCache.set(cacheKey, { key: cacheKey, entries })

    while (this.directoryCache.size > DIRECTORY_CACHE_LIMIT) {
      const oldestKey = this.directoryCache.keys().next().value
      if (oldestKey === undefined) {
        return
      }
      this.directoryCache.delete(oldestKey)
    }
  }

  private async runDirectoryJob(
    job: DirectoryJob,
    leftPath: string,
    rightPath: string,
    options: CompareOptions,
  ) {
    try {
      if (job.cancelled) {
        return
      }

      const entries = await this.compareDirectories(leftPath, rightPath, options, (index, entry) => {
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

  private async compareDirectories(
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
    const previousEntries = this.getCachedDirectoryEntries(cacheKey)
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
    this.setCachedDirectoryEntries(cacheKey, nextEntries)
    return results
  }
}

async function getFileSize(pathValue: string): Promise<number | null> {
  try {
    return (await stat(pathValue)).size
  } catch {
    return null
  }
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

function mapDirectoryEntryToDiffEntry(entry: DirectoryEntryResult): DiffEntry {
  return {
    id: encodeURIComponent(entry.relativePath),
    path: entry.relativePath,
    oldPath: null,
    displayPath: entry.relativePath,
    status: mapDirectoryEntryStatus(entry.status),
    leftSize: entry.leftSize,
    rightSize: entry.rightSize,
    binary: entry.status === 'unsupported' ? true : undefined,
  }
}

function mapDirectoryEntryStatus(status: DirectoryEntryResult['status']): DiffEntry['status'] {
  switch (status) {
    case 'modified':
      return 'modified'
    case 'leftOnly':
      return 'deleted'
    case 'rightOnly':
      return 'added'
    case 'unsupported':
      return 'unsupported'
  }
}

function assertUnsupportedLocalEntry(entry: never): Promise<FileDiffResult> {
  void entry
  throw new Error('Unsupported local diff entry data.')
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error)
}
