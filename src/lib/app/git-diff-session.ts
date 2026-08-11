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

// Maps a diff-session entry (git working tree, ref range, commit, or GitHub PR)
// onto the directory result shape the continuous compare viewer renders.
export function mapSessionDiffEntry(
  entry: DiffEntry,
  diffEntryAliasIds: string[] = [],
): DirectoryEntryResult {
  return {
    relativePath: entry.path,
    displayPath: entry.displayPath !== entry.path ? entry.displayPath : undefined,
    status: mapGitEntryStatus(entry.status),
    leftPath: gitEntryLeftPath(entry),
    rightPath: gitEntryRightPath(entry),
    leftSize: entry.leftSize,
    rightSize: entry.rightSize,
    diffEntryId: entry.id,
    diffEntryAliasIds: diffEntryAliasIds.length > 0 ? diffEntryAliasIds : undefined,
    diffEntryStatus: entry.status,
    diffEntryScope: entry.scope,
    gitReviewCapabilities: entry.gitReviewCapabilities,
    capabilities: entry.capabilities,
    binary: entry.binary,
    diffPatchText: entry.diffPatchText ?? null,
    diffPatchCacheKey: entry.diffPatchCacheKey ?? null,
  }
}

export function mapSessionDiffEntries(entries: DiffEntry[]): DirectoryEntryResult[] {
  const aliasesById = buildReusableGitEntryAliases(entries)
  return entries.map((entry) => mapSessionDiffEntry(entry, aliasesById.get(entry.id) ?? []))
}

export function buildReusableGitEntryAliases(entries: DiffEntry[]): Map<string, string[]> {
  const aliasesById = new Map<string, string[]>()
  const groups = new Map<string, DiffEntry[]>()

  for (const entry of entries) {
    if (!entry.scope) {
      continue
    }

    const key = [
      entry.path,
      entry.oldPath ?? '',
    ].join('\u0000')
    groups.set(key, [...(groups.get(key) ?? []), entry])
  }

  for (const group of groups.values()) {
    const allEntry = group.find((entry) => entry.scope === 'all')
    const scopedEntries = group.filter((entry) => entry.scope !== 'all')
    if (!allEntry || scopedEntries.length !== 1) {
      continue
    }

    const scopedEntry = scopedEntries[0]
    if (allEntry.status !== scopedEntry.status) {
      continue
    }

    addAlias(aliasesById, allEntry.id, scopedEntry.id)
    addAlias(aliasesById, scopedEntry.id, allEntry.id)
  }

  return aliasesById
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

function addAlias(aliasesById: Map<string, string[]>, id: string, aliasId: string) {
  const aliases = aliasesById.get(id) ?? []
  if (!aliases.includes(aliasId)) {
    aliases.push(aliasId)
    aliasesById.set(id, aliases)
  }
}
