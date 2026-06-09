import type {
  DiffEntry,
  DirectoryEntryResult,
  EntryStatus,
} from '../types'

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
