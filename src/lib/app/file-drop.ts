import type { ViewMode } from '../types'
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

export function hasFileDragPayload(dataTransfer: DropDataTransferLike | null | undefined): boolean {
  if (!dataTransfer?.types) {
    return false
  }

  for (const type of Array.from(dataTransfer.types)) {
    if (type === 'Files') {
      return true
    }
  }

  return false
}

export function extractDroppedPaths(
  dataTransfer: DropDataTransferLike | null | undefined,
  resolvePath: (file: File) => string,
): string[] {
  if (!dataTransfer?.files || dataTransfer.files.length === 0) {
    return []
  }

  const seen = new Set<string>()
  const paths: string[] = []

  for (const file of Array.from(dataTransfer.files)) {
    const resolved = resolvePath(file)?.trim()
    if (!resolved || seen.has(resolved)) {
      continue
    }
    seen.add(resolved)
    paths.push(resolved)
  }

  return paths
}

export function resolveCompareDropSide(
  clientX: number,
  rect: { left: number; width: number },
  viewMode: ViewMode,
): Side {
  void viewMode
  if (rect.width <= 0) {
    return 'right'
  }

  return clientX < rect.left + rect.width / 2 ? 'left' : 'right'
}

export function findRowIndexByPath<T extends { entry: { path: string } }>(
  rows: readonly T[],
  targetPath: string,
): number {
  if (!targetPath) {
    return -1
  }

  const normalizedTarget = targetPath.toLowerCase()
  return rows.findIndex((row) => row.entry.path.toLowerCase() === normalizedTarget)
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
