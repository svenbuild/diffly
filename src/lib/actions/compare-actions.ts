import type { AppIconName } from '../icons/app-icons'
import type { DiffSource, DirectoryEntryResult } from '../types'

// Central registry for compare-tree context-menu actions. Gating is pure so it
// can be unit tested without DOM or IPC: `visible` is the mode gate (failing
// actions are hidden entirely), `enabled` is the availability gate (mode-OK
// actions that fail it render disabled).

export type CompareSourceKind =
  | 'local'
  | 'gitWorkingTree'
  | 'gitRefRange'
  | 'gitCommit'
  | 'github'

export interface CompareActionContext {
  sourceKind: CompareSourceKind
  entryKind: 'file' | 'directory'
  relativePath: string
  /** Compare result for file rows; null for directory rows. */
  entry: DirectoryEntryResult | null
  /**
   * Absolute on-disk path for the entry. Only resolvable for local compares
   * and git working-tree compares; always null for ref/commit/GitHub sources.
   */
  absolutePath: string | null
  /** Expansion state for directory rows; null for file rows. */
  directoryExpanded: boolean | null
  /** Null when the clipboard / shell bridge is unavailable (feature detect). */
  copyText: ((text: string) => Promise<void> | void) | null
  openPath: ((path: string) => Promise<void>) | null
  revealPath: ((path: string) => Promise<void>) | null
  toggleDirectoryExpanded: (() => void) | null
}

export interface CompareAction {
  id: string
  label: string
  icon?: AppIconName
  danger?: boolean
  visible(context: CompareActionContext): boolean
  enabled(context: CompareActionContext): boolean
  run(context: CompareActionContext): Promise<void> | void
}

/**
 * Maps the active diff source onto the gating kind. A null source is the
 * legacy local path compare flow (App.svelte clears the session source there),
 * so it gates exactly like an explicit local source.
 */
export function compareSourceKind(source: DiffSource | null): CompareSourceKind {
  if (!source || source.kind === 'local') {
    return 'local'
  }

  if (source.kind === 'git') {
    switch (source.selection.kind) {
      case 'workingTree':
        return 'gitWorkingTree'
      case 'refRange':
        return 'gitRefRange'
      case 'commit':
        return 'gitCommit'
    }
  }

  return 'github'
}

/**
 * Resolves the absolute on-disk path for a file entry. Local compare entries
 * already carry absolute side paths; git working-tree entries carry
 * repo-relative paths that are joined onto the repository root. Every other
 * source kind has no on-disk file and resolves to null.
 */
export function resolveEntryAbsolutePath(
  source: DiffSource | null,
  entry: DirectoryEntryResult | null,
): string | null {
  if (!entry) {
    return null
  }

  const sidePath = entry.rightPath ?? entry.leftPath
  if (!sidePath) {
    return null
  }

  const kind = compareSourceKind(source)
  if (kind === 'local') {
    return sidePath
  }

  if (kind === 'gitWorkingTree' && source?.kind === 'git' && source.repositoryRoot) {
    return joinRepositoryPath(source.repositoryRoot, sidePath)
  }

  return null
}

function joinRepositoryPath(repositoryRoot: string, relativePath: string): string {
  const separator = repositoryRoot.includes('\\') ? '\\' : '/'
  const root = repositoryRoot.replace(/[\\/]+$/, '')
  const relative = relativePath
    .replace(/^[\\/]+/, '')
    .split(/[\\/]/)
    .join(separator)

  return `${root}${separator}${relative}`
}

function isWorkingCopySource(kind: CompareSourceKind): boolean {
  return kind === 'local' || kind === 'gitWorkingTree'
}

export const compareActions: CompareAction[] = [
  {
    id: 'openFile',
    label: 'Open File',
    visible: (context) =>
      context.entryKind === 'file' && isWorkingCopySource(context.sourceKind),
    enabled: (context) => context.absolutePath !== null && context.openPath !== null,
    run: async (context) => {
      if (context.absolutePath && context.openPath) {
        await context.openPath(context.absolutePath)
      }
    },
  },
  {
    id: 'revealInExplorer',
    label: 'Reveal in Explorer',
    visible: (context) =>
      context.entryKind === 'file' && isWorkingCopySource(context.sourceKind),
    enabled: (context) => context.absolutePath !== null && context.revealPath !== null,
    run: async (context) => {
      if (context.absolutePath && context.revealPath) {
        await context.revealPath(context.absolutePath)
      }
    },
  },
  {
    id: 'copyRelativePath',
    label: 'Copy Relative Path',
    visible: () => true,
    enabled: (context) => context.relativePath.length > 0 && context.copyText !== null,
    run: async (context) => {
      if (context.relativePath && context.copyText) {
        await context.copyText(context.relativePath)
      }
    },
  },
  {
    id: 'copyAbsolutePath',
    label: 'Copy Absolute Path',
    visible: (context) =>
      context.entryKind === 'file' && isWorkingCopySource(context.sourceKind),
    enabled: (context) => context.absolutePath !== null && context.copyText !== null,
    run: async (context) => {
      if (context.absolutePath && context.copyText) {
        await context.copyText(context.absolutePath)
      }
    },
  },
  {
    id: 'expandDirectory',
    label: 'Expand',
    visible: (context) =>
      context.entryKind === 'directory' && context.directoryExpanded === false,
    enabled: (context) => context.toggleDirectoryExpanded !== null,
    run: (context) => {
      context.toggleDirectoryExpanded?.()
    },
  },
  {
    id: 'collapseDirectory',
    label: 'Collapse',
    visible: (context) =>
      context.entryKind === 'directory' && context.directoryExpanded === true,
    enabled: (context) => context.toggleDirectoryExpanded !== null,
    run: (context) => {
      context.toggleDirectoryExpanded?.()
    },
  },
]

export interface CompareActionListItem {
  action: CompareAction
  enabled: boolean
}

export function listVisibleCompareActions(
  context: CompareActionContext,
): CompareActionListItem[] {
  return compareActions
    .filter((action) => action.visible(context))
    .map((action) => ({ action, enabled: action.enabled(context) }))
}
