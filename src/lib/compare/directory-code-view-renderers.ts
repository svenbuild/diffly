import type { FileDiffResult, DirectoryEntryResult } from '../types'
import { statusLabel } from './directory-code-view-items'
import { renderDiffHeaderMetadata, renderDiffHeaderPrefix } from './diff-header-renderers'

export type CodeViewItemContext = {
  item?: {
    id?: string
  }
}

interface LoadedDirectoryDiffLike {
  entry: DirectoryEntryResult
  diff: FileDiffResult | null
  error: string
  loading: boolean
}

export function getCodeViewItemContext(args: unknown[]) {
  const context = args[args.length - 1] as CodeViewItemContext | undefined
  return typeof context?.item?.id === 'string' ? context : null
}

export function renderDirectoryCollapseButton(
  args: unknown[],
  options: {
    collapsedPaths: Set<string>
    entryByPath: Map<string, LoadedDirectoryDiffLike>
    schedulePlaceholderEntryRequest: (path: string) => void
    toggleEntry: (relativePath: string) => void
  },
) {
  const context = getCodeViewItemContext(args)
  const itemId = context?.item?.id
  if (!itemId) {
    return null
  }

  const collapsed = options.collapsedPaths.has(itemId)
  const loadedEntry = options.entryByPath.get(itemId)
  const button = renderDiffHeaderPrefix(itemId, {
    collapsed,
    onToggle: () => options.toggleEntry(itemId),
  })
  button.dataset.difflyEntryPath = itemId

  if (loadedEntry && !loadedEntry.diff?.text && !loadedEntry.loading && !loadedEntry.error) {
    options.schedulePlaceholderEntryRequest(itemId)
  }

  return button
}

export function renderDirectoryHeaderMetadata(
  args: unknown[],
  entryByPath: Map<string, LoadedDirectoryDiffLike>,
) {
  const context = getCodeViewItemContext(args)
  const itemId = context?.item?.id
  if (!itemId) {
    return null
  }

  const loadedEntry = entryByPath.get(itemId)
  if (!loadedEntry || loadedEntry.diff?.text) {
    return null
  }

  if (loadedEntry.error) {
    return renderDiffHeaderMetadata({ text: 'Error', title: loadedEntry.error })
  }

  return renderDiffHeaderMetadata({
    text: loadedEntry.loading || !loadedEntry.diff?.text
      ? 'Loading...'
      : statusLabel(loadedEntry.entry.status),
  })
}

export function applyDirectoryItemPostRender(
  args: unknown[],
  options: {
    entryByPath: Map<string, LoadedDirectoryDiffLike>
    loadingPaths: Set<string>
    placeholderPaths: Set<string>
    schedulePlaceholderEntryRequest: (path: string) => void
    scheduleVisibleEntryRequest: () => void
  },
) {
  const node = args[0]
  const context = getCodeViewItemContext(args)
  const itemId = context?.item?.id
  if (!(node instanceof HTMLElement) || !itemId) {
    return
  }

  node.toggleAttribute('data-diffly-placeholder', options.placeholderPaths.has(itemId))
  node.toggleAttribute('data-diffly-loading', options.loadingPaths.has(itemId))
  node.toggleAttribute('data-diffly-error', Boolean(options.entryByPath.get(itemId)?.error))

  const entry = options.entryByPath.get(itemId)
  if (options.placeholderPaths.has(itemId) && entry && !entry.loading && !entry.error) {
    options.schedulePlaceholderEntryRequest(itemId)
  }

  options.scheduleVisibleEntryRequest()
}
