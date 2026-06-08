import type { FileDiffResult, DirectoryEntryResult } from '../types'
import { statusLabel } from './directory-code-view-items'

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
    toggleEntry: (relativePath: string) => void
  },
) {
  const context = getCodeViewItemContext(args)
  const itemId = context?.item?.id
  if (!itemId) {
    return null
  }

  const collapsed = options.collapsedPaths.has(itemId)
  const button = document.createElement('button')
  const icon = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
  const path = document.createElementNS('http://www.w3.org/2000/svg', 'path')
  button.type = 'button'
  button.className = 'diffly-codeview-collapse-button'
  button.dataset.difflyEntryPath = itemId
  button.dataset.collapsed = collapsed ? 'true' : 'false'
  button.setAttribute('aria-label', collapsed ? 'Expand file diff' : 'Collapse file diff')
  button.setAttribute('aria-expanded', collapsed ? 'false' : 'true')
  button.title = collapsed ? 'Expand file diff' : 'Collapse file diff'
  icon.setAttribute('viewBox', '0 0 16 16')
  icon.setAttribute('aria-hidden', 'true')
  path.setAttribute('d', 'M5.75 3.5 10.25 8l-4.5 4.5')
  path.setAttribute('fill', 'none')
  path.setAttribute('stroke', 'currentColor')
  path.setAttribute('stroke-linecap', 'round')
  path.setAttribute('stroke-linejoin', 'round')
  path.setAttribute('stroke-width', '1.8')
  icon.appendChild(path)
  button.appendChild(icon)
  button.addEventListener('click', (event) => {
    event.preventDefault()
    event.stopPropagation()
    options.toggleEntry(itemId)
  })

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

  const metadata = document.createElement('span')
  metadata.className = 'diffly-codeview-status-metadata'
  if (loadedEntry.error) {
    metadata.textContent = 'Error'
    metadata.title = loadedEntry.error
  } else {
    metadata.textContent = loadedEntry.loading || !loadedEntry.diff?.text
      ? 'Loading...'
      : statusLabel(loadedEntry.entry.status)
  }
  return metadata
}

export function applyDirectoryItemPostRender(
  args: unknown[],
  options: {
    entryByPath: Map<string, LoadedDirectoryDiffLike>
    loadingPaths: Set<string>
    placeholderPaths: Set<string>
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

  options.scheduleVisibleEntryRequest()
}
