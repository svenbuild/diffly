import { dialog } from 'electron'
import type { Stats } from 'node:fs'
import { readdir, stat } from 'node:fs/promises'
import { basename, dirname, join } from 'node:path'
import type {
  DirectoryListing,
  ExplorerEntry,
  PathInfo,
} from '../../src/lib/types'

const LIST_DIRECTORY_STAT_CONCURRENCY = 64
const DIRECTORY_LISTING_CACHE_LIMIT = 64
const DRIVE_ROOT_PROBE_TIMEOUT_MS = 250
const EXPLORER_ENTRY_COLLATOR = new Intl.Collator(undefined, { sensitivity: 'base' })

interface ExplorerEntryInput {
  name: string
  path: string
  kind: ExplorerEntry['kind']
}

interface CachedDirectoryListing {
  modifiedMs: number
  listing: DirectoryListing
}

const directoryListingCache = new Map<string, CachedDirectoryListing>()

export async function choosePath(kind: string) {
  const properties: Array<'openDirectory' | 'openFile'> =
    kind === 'directory' ? ['openDirectory'] : ['openFile']
  const result = await dialog.showOpenDialog({ properties })
  return result.canceled ? null : result.filePaths[0] ?? null
}

export async function listRoots(): Promise<ExplorerEntry[]> {
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

export async function listDirectory(pathValue: string): Promise<DirectoryListing> {
  const directoryInfo = await stat(pathValue)
  const cached = getCachedDirectoryListing(pathValue, directoryInfo.mtimeMs)
  if (cached) {
    return cached
  }

  const entries = await readdir(pathValue, { withFileTypes: true })
  const directories: ExplorerEntryInput[] = []
  const files: ExplorerEntryInput[] = []

  for (const entry of entries) {
    const fullPath = join(pathValue, entry.name)
    if (entry.isDirectory()) {
      directories.push({ name: entry.name, path: fullPath, kind: 'directory' })
    } else if (entry.isFile()) {
      files.push({ name: entry.name, path: fullPath, kind: 'file' })
    }
  }

  const [directoryEntries, fileEntries] = await Promise.all([
    buildExplorerEntries(directories),
    buildExplorerEntries(files),
  ])

  directoryEntries.sort(compareExplorerEntries)
  fileEntries.sort(compareExplorerEntries)

  const listing = {
    path: pathValue,
    parentPath: dirname(pathValue) === pathValue ? null : dirname(pathValue),
    directories: directoryEntries,
    files: fileEntries,
  }
  setCachedDirectoryListing(pathValue, directoryInfo.mtimeMs, listing)
  return listing
}

export async function pathInfo(pathValue: string): Promise<PathInfo> {
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

export function clearDirectoryListingCache() {
  directoryListingCache.clear()
}

function getCachedDirectoryListing(pathValue: string, modifiedMs: number) {
  const cached = directoryListingCache.get(pathValue)
  if (!cached || cached.modifiedMs !== modifiedMs) {
    return null
  }

  directoryListingCache.delete(pathValue)
  directoryListingCache.set(pathValue, cached)
  return cached.listing
}

function setCachedDirectoryListing(pathValue: string, modifiedMs: number, listing: DirectoryListing) {
  directoryListingCache.delete(pathValue)
  directoryListingCache.set(pathValue, { modifiedMs, listing })

  while (directoryListingCache.size > DIRECTORY_LISTING_CACHE_LIMIT) {
    const oldestKey = directoryListingCache.keys().next().value
    if (oldestKey === undefined) {
      return
    }
    directoryListingCache.delete(oldestKey)
  }
}

async function explorerEntry(pathValue: string, kind: ExplorerEntry['kind'], name?: string): Promise<ExplorerEntry> {
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
    name: name ?? (basename(pathValue) || pathValue),
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
  items: ExplorerEntryInput[],
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
      results[index] = await explorerEntry(item.path, item.kind, item.name)
    }
  }

  const workerCount = Math.min(LIST_DIRECTORY_STAT_CONCURRENCY, items.length)
  await Promise.all(Array.from({ length: workerCount }, () => runWorker()))
  return results
}

function compareExplorerEntries(left: ExplorerEntry, right: ExplorerEntry) {
  return EXPLORER_ENTRY_COLLATOR.compare(left.name, right.name)
}
