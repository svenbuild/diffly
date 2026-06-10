import { DIFF_STATUS_INDICATORS, type DiffStatusIndicatorKey } from '../icons/status-icons'
import type { DirectoryEntryResult } from '../types'

// Single source of truth for the per-entry status badge shown in the compare
// sidebar. The tree itself is rendered by @pierre/trees, which only accepts
// plain text + tooltip per row (renderRowDecoration), so the badge is described
// here as data and rendered by the library — there is no per-row Svelte markup.
export interface DiffStatusBadge {
  // Single-letter label: M A D R C T ? U
  text: string
  // Tooltip text; for renames/copies the full "old → new" path.
  title: string
}

// git-provider formats rename/copy display paths as "old -> new". Normalize the
// ASCII arrow to the unicode arrow used in the UI.
function normalizeRenameDisplay(displayPath: string): string {
  return displayPath.replace(/\s*->\s*/g, ' → ')
}

function indicatorBadge(key: DiffStatusIndicatorKey, title?: string): DiffStatusBadge {
  const indicator = DIFF_STATUS_INDICATORS[key]
  return { text: indicator.letter, title: title ?? indicator.label }
}

// Map a directory comparison entry to its badge. Git/GitHub entries carry the
// detailed `diffEntryStatus`; local-only entries fall back to the coarse
// `status`. Returns null when no badge should be shown (unsupported entries).
export function getEntryStatusBadge(entry: DirectoryEntryResult): DiffStatusBadge | null {
  const renameTitle = entry.displayPath
    ? normalizeRenameDisplay(entry.displayPath)
    : null

  if (entry.diffEntryStatus) {
    switch (entry.diffEntryStatus) {
      case 'modified':
      case 'added':
      case 'deleted':
      case 'typeChanged':
      case 'untracked':
      case 'conflicted':
        return indicatorBadge(entry.diffEntryStatus)
      case 'renamed':
      case 'copied':
        return indicatorBadge(entry.diffEntryStatus, renameTitle ?? undefined)
      case 'unsupported':
        return null
    }
  }

  switch (entry.status) {
    case 'modified':
      return indicatorBadge('modified')
    case 'leftOnly':
      return indicatorBadge('deleted', 'Only in left')
    case 'rightOnly':
      return indicatorBadge('added', 'Only in right')
    case 'unsupported':
    case 'unchanged':
      return null
  }

  return null
}

// Precompute the set of ancestor directory paths that contain at least one
// changed entry, so the tree can show a "contains changes" dot per folder
// without an O(n²) scan per visible row. Keys are '/'-joined canonical paths
// matching the tree's directory node paths. Only ancestor folders are added —
// never the file path itself.
export function buildChangedDirectorySet(entries: DirectoryEntryResult[]): Set<string> {
  const directories = new Set<string>()

  for (const entry of entries) {
    if (!getEntryStatusBadge(entry)) {
      continue
    }

    const segments = entry.relativePath.split(/[\\/]/).filter(Boolean)
    let prefix = ''
    for (let index = 0; index < segments.length - 1; index += 1) {
      prefix = prefix ? `${prefix}/${segments[index]}` : segments[index]
      directories.add(prefix)
    }
  }

  return directories
}
