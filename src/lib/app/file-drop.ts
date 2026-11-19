import type { ViewMode } from '../types'
import type { Side } from '../ui-types'

export interface DropDataTransferLike {
  types?: ArrayLike<string> | Iterable<string>
  files?: ArrayLike<File>
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
