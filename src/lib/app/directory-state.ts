import { getParentPath, ROOT_GROUP } from '../path-utils'
import type { DirectoryEntryResult, EntryStatus } from '../types'
import type { FolderSection } from '../ui-types'

const LOW_PRIORITY_DEFAULT_BASENAMES = new Set([
  'bun.lock',
  'bun.lockb',
  'cargo.lock',
  'composer.lock',
  'go.sum',
  'package-lock.json',
  'pnpm-lock.yaml',
  'poetry.lock',
  'yarn.lock',
])

const LOW_PRIORITY_DEFAULT_DIRECTORIES = new Set([
  '.svelte-kit',
  'build',
  'coverage',
  'dist',
  'node_modules',
  'out',
  'target',
])

const LOW_PRIORITY_DEFAULT_EXTENSIONS = new Set([
  '.avif',
  '.bmp',
  '.gif',
  '.icns',
  '.ico',
  '.jpeg',
  '.jpg',
  '.lock',
  '.map',
  '.min.css',
  '.min.js',
  '.png',
  '.svg',
  '.webp',
])

const MEDIUM_DEFAULT_ENTRY_SIZE_BYTES = 256 * 1024
const LARGE_DEFAULT_ENTRY_SIZE_BYTES = 1024 * 1024

export function buildGroups(entries: DirectoryEntryResult[]) {
  const groups = new Map<string, DirectoryEntryResult[]>()

  for (const entry of entries) {
    const groupKey = getParentPath(entry.relativePath)

    if (!groups.has(groupKey)) {
      groups.set(groupKey, [])
    }

    groups.get(groupKey)?.push(entry)
  }

  return Array.from(groups.entries())
    .map(([key, groupedEntries]) => ({
      key,
      label: key === ROOT_GROUP ? 'Root' : key,
      entries: [...groupedEntries].sort((left, right) =>
        left.relativePath.localeCompare(right.relativePath),
      ),
    }))
    .sort((left, right) => left.label.localeCompare(right.label))
}

export function filterDirectoryEntries(
  entries: DirectoryEntryResult[],
  statusFilters: EntryStatus[],
) {
  if (statusFilters.length === 0) {
    return entries
  }

  return entries.filter((entry) => statusFilters.includes(entry.status))
}

export function isDiffableDirectoryEntry(
  entry: DirectoryEntryResult | null | undefined,
): entry is DirectoryEntryResult {
  return Boolean(
    entry && entry.status !== 'unsupported' && entry.status !== 'unchanged' && !entry.binary,
  )
}

export function defaultDirectoryEntry(entries: DirectoryEntryResult[]) {
  let bestEntry: DirectoryEntryResult | null = null
  let bestScore = Number.POSITIVE_INFINITY

  for (const [index, entry] of entries.entries()) {
    const score = defaultDirectoryEntryScore(entry, index)
    if (score < bestScore) {
      bestEntry = entry
      bestScore = score
    }
  }

  return bestEntry ?? entries[0]
}

function defaultDirectoryEntryScore(entry: DirectoryEntryResult, index: number) {
  if (!isDiffableDirectoryEntry(entry)) {
    return Number.POSITIVE_INFINITY
  }

  let score = index / 10000

  if (isLowPriorityDefaultEntry(entry)) {
    score += 1000
  }

  const knownSize = Math.max(entry.leftSize ?? 0, entry.rightSize ?? 0)
  if (knownSize >= LARGE_DEFAULT_ENTRY_SIZE_BYTES) {
    score += 500
  } else if (knownSize >= MEDIUM_DEFAULT_ENTRY_SIZE_BYTES) {
    score += 100
  }

  if (getParentPath(entry.relativePath) !== ROOT_GROUP) {
    score += 10
  }

  return score
}

function isLowPriorityDefaultEntry(entry: DirectoryEntryResult) {
  const segments = entry.relativePath.split(/[\\/]/).filter(Boolean)
  const basename = (segments[segments.length - 1] ?? entry.relativePath).toLowerCase()

  if (LOW_PRIORITY_DEFAULT_BASENAMES.has(basename)) {
    return true
  }

  if (segments.some((segment) => LOW_PRIORITY_DEFAULT_DIRECTORIES.has(segment.toLowerCase()))) {
    return true
  }

  return Array.from(LOW_PRIORITY_DEFAULT_EXTENSIONS).some((extension) =>
    basename.endsWith(extension),
  )
}

export function reconcileCollapsedState(
  previousState: Record<string, boolean>,
  sections: FolderSection[],
) {
  const nextState: Record<string, boolean> = {}

  for (const section of sections) {
    nextState[section.key] = previousState[section.key] ?? false
  }

  return nextState
}
