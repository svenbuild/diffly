import { getDroppedFilePath } from '../api'
import type { PathInfo } from '../types'
import type { Side } from '../ui-types'

export interface DropDataTransferLike {
  types?: ArrayLike<string> | Iterable<string>
  files?: ArrayLike<File>
}

export interface ScrollBounds {
  scrollTop: number
  clientHeight: number
  scrollHeight: number
}

function normalizeComparablePath(value: string): string {
  return value.trim().replace(/[/\\]+/g, '/').toLowerCase()
}

export function hasFileDragPayload(dataTransfer: DropDataTransferLike | null | undefined): boolean {
  if (!dataTransfer?.types) {
    return false
  }
  return Array.from(dataTransfer.types).includes('Files')
}

export function extractDroppedPaths(
  dataTransfer: DropDataTransferLike | null | undefined,
  resolvePath: (file: File) => string,
): string[] {
  const paths: string[] = []
  for (const file of Array.from(dataTransfer?.files ?? [])) {
    const resolved = resolvePath(file)?.trim()
    if (resolved && !paths.includes(resolved)) {
      paths.push(resolved)
    }
  }
  return paths
}

export type DropItemInfo = Pick<PathInfo, 'path' | 'exists' | 'isDirectory' | 'isFile'>

export type PathDropPlan<T extends DropItemInfo> =
  | { ok: true; kind: 'file' | 'directory'; targets: Partial<Record<Side, T>> }
  | { ok: false; error: string }

function itemKind(item: DropItemInfo): 'file' | 'directory' | null {
  if (!item.exists) return null
  if (item.isDirectory) return 'directory'
  if (item.isFile) return 'file'
  return null
}

/**
 * One dropped item goes to the side it was dropped on. Two dropped items of
 * the same kind become the left and right side, in drop order.
 */
export function planPathDrop<T extends DropItemInfo>(side: Side, items: T[]): PathDropPlan<T> {
  if (items.length === 0 || items.length > 2) {
    return { ok: false, error: 'Drop one item on a side, or two items to compare them with each other.' }
  }

  const kinds = items.map(itemKind)
  if (kinds.some((kind) => kind === null)) {
    return { ok: false, error: 'The dropped item no longer exists.' }
  }

  const kind = kinds[0] as 'file' | 'directory'
  if (items.length === 1) {
    return { ok: true, kind, targets: { [side]: items[0] } }
  }
  if (kinds[1] !== kind) {
    return { ok: false, error: 'Drop two files or two folders, not one of each.' }
  }
  return { ok: true, kind, targets: { left: items[0], right: items[1] } }
}

export interface FileDropZoneOptions {
  /** Called on every dragenter and dragover with a file payload. */
  onHover?: (event: DragEvent) => void
  onLeave?: () => void
  onDrop: (paths: string[], event: DragEvent) => void
}

/** Svelte action that turns an element into a drop target for OS files and folders. */
export function fileDropZone(node: HTMLElement, initialOptions: FileDropZoneOptions) {
  let options = initialOptions
  // dragenter and dragleave also fire for every child element, so count them.
  let depth = 0

  function handleEnterOrOver(event: DragEvent) {
    if (!hasFileDragPayload(event.dataTransfer)) return
    event.preventDefault()
    if (event.type === 'dragenter') depth += 1
    if (event.dataTransfer) event.dataTransfer.dropEffect = 'copy'
    options.onHover?.(event)
  }

  function handleLeave(event: DragEvent) {
    if (depth === 0) return
    depth -= 1
    // Rows that re-render during the drag never send their dragleave, so the
    // count can stay too high. Leaving the zone itself always resets it.
    const target = event.relatedTarget
    const stillInside = target instanceof Node && node.contains(target)
    if (depth === 0 || !stillInside) {
      depth = 0
      options.onLeave?.()
    }
  }

  function handleDrop(event: DragEvent) {
    if (!hasFileDragPayload(event.dataTransfer)) return
    event.preventDefault()
    depth = 0
    options.onLeave?.()
    const paths = extractDroppedPaths(event.dataTransfer, getDroppedFilePath)
    if (paths.length > 0) options.onDrop(paths, event)
  }

  node.addEventListener('dragenter', handleEnterOrOver)
  node.addEventListener('dragover', handleEnterOrOver)
  node.addEventListener('dragleave', handleLeave)
  node.addEventListener('drop', handleDrop)

  return {
    update(nextOptions: FileDropZoneOptions) {
      options = nextOptions
    },
    destroy() {
      node.removeEventListener('dragenter', handleEnterOrOver)
      node.removeEventListener('dragover', handleEnterOrOver)
      node.removeEventListener('dragleave', handleLeave)
      node.removeEventListener('drop', handleDrop)
    },
  }
}

export function findRowIndexByPath<T extends { entry: { path: string } }>(
  rows: readonly T[],
  targetPath: string,
): number {
  const normalizedTarget = normalizeComparablePath(targetPath)
  if (!normalizedTarget) {
    return -1
  }

  return rows.findIndex(
    (row) => normalizeComparablePath(row.entry.path) === normalizedTarget,
  )
}

export function computeRowScrollTop(
  rowIndex: number,
  rowHeight: number,
  bounds: ScrollBounds,
): number | null {
  if (rowIndex < 0 || rowHeight <= 0 || bounds.clientHeight <= 0) {
    return null
  }

  const maxScrollTop = Math.max(0, bounds.scrollHeight - bounds.clientHeight)
  const top = Math.min(maxScrollTop, rowIndex * rowHeight)
  const bottom = Math.min(bounds.scrollHeight, (rowIndex + 1) * rowHeight)
  const viewTop = bounds.scrollTop
  const viewBottom = viewTop + bounds.clientHeight

  if (top < viewTop) {
    return top
  }

  if (bottom > viewBottom) {
    return Math.max(0, Math.min(maxScrollTop, bottom - bounds.clientHeight))
  }

  return null
}
