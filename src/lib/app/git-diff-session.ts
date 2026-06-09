import type {
  DiffEntry,
  DirectoryEntryResult,
  EntryStatus,
  GitWorkingTreeScope,
} from '../types'

export const EMPTY_GIT_SCOPE_COUNTS = {
  all: 0,
  staged: 0,
  unstaged: 0,
  untracked: 0,
} satisfies Record<GitWorkingTreeScope, number>

// Count loaded working-tree entries per scope for the Compare View scope tabs.
// Always returns all four scope keys so callers never see partial objects.
export function countGitEntriesByScope(
  entries: DiffEntry[],
): Record<GitWorkingTreeScope, number> {
  const counts = { ...EMPTY_GIT_SCOPE_COUNTS }
  for (const entry of entries) {
    if (entry.scope) {
      counts[entry.scope] += 1
    }
  }
  return counts
}

export function mapGitDiffEntry(entry: DiffEntry): DirectoryEntryResult {
  return {
    relativePath: entry.path,
    displayPath: entry.displayPath !== entry.path ? entry.displayPath : undefined,
    status: mapGitEntryStatus(entry.status),
    leftPath: gitEntryLeftPath(entry),
    rightPath: gitEntryRightPath(entry),
    leftSize: entry.leftSize,
    rightSize: entry.rightSize,
    diffEntryId: entry.id,
    diffEntryStatus: entry.status,
    diffEntryScope: entry.scope,
    binary: entry.binary,
  }
}

export function mapGitEntryStatus(status: DiffEntry['status']): EntryStatus {
  switch (status) {
    case 'deleted':
      return 'leftOnly'
    case 'added':
    case 'untracked':
      return 'rightOnly'
    case 'conflicted':
    case 'unsupported':
      return 'unsupported'
    case 'modified':
    case 'renamed':
    case 'copied':
    case 'typeChanged':
    default:
      return 'modified'
  }
}

function gitEntryLeftPath(entry: DiffEntry) {
  if (entry.status === 'added' || entry.status === 'untracked') {
    return null
  }

  return entry.oldPath ?? entry.path
}

function gitEntryRightPath(entry: DiffEntry) {
  if (entry.status === 'deleted') {
    return null
  }

  return entry.path
}
