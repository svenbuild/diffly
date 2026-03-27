import { getParentPath, ROOT_GROUP } from '../path-utils'
import type { DirectoryEntryResult, EntryStatus } from '../types'
import type { FolderSection } from '../ui-types'

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

export function defaultDirectoryEntry(entries: DirectoryEntryResult[]) {
  return entries.find((entry) => getParentPath(entry.relativePath) === ROOT_GROUP) ?? entries[0]
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
