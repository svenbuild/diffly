import type { SideBySideRow, UnifiedLine } from './types'
import type { DiffHunkRange, SideBySideRenderItem, UnifiedRenderItem } from './ui-types'

export interface VirtualRange {
  start: number
  end: number
  topPadding: number
  bottomPadding: number
}

export interface VirtualHunkAnchor {
  hunkIndex: number
  top: number
  height: number
  kind: 'insert' | 'delete' | 'mixed'
}

export interface ItemLayout {
  offsets: number[]
  total: number
  anchors: VirtualHunkAnchor[]
}

export const FULL_FILE_VIRTUALIZATION_MIN_ROWS = 200
export const FULL_FILE_VIRTUALIZATION_BASE_OVERSCAN = 40
export const LARGE_FULL_FILE_FRAGMENT_SIMPLIFICATION_ROWS = 600
export const HUGE_FILE_THRESHOLD = 3000
export const NON_FULL_VIRTUALIZATION_MIN_ITEMS = 200
export const COLLAPSED_ROW_HEIGHT = 38

export const emptyVirtualRange: VirtualRange = {
  start: 0,
  end: 0,
  topPadding: 0,
  bottomPadding: 0,
}
export const emptyVirtualAnchors: VirtualHunkAnchor[] = []
export const emptyItemLayout: ItemLayout = { offsets: [0], total: 0, anchors: [] }

export function buildVisibleFullFileSideBySideItems(
  rows: SideBySideRow[],
  hunks: DiffHunkRange[],
  start: number,
  end: number,
) {
  return buildVisibleFullFileItems(rows, hunks, start, end).map(
    ({ row, hunkIndex, isAnchor }) =>
      ({
        type: 'row',
        row,
        hunkIndex,
        isAnchor,
      }) satisfies SideBySideRenderItem,
  )
}

export function buildVisibleFullFileUnifiedItems(
  rows: UnifiedLine[],
  hunks: DiffHunkRange[],
  start: number,
  end: number,
) {
  return buildVisibleFullFileItems(rows, hunks, start, end).map(
    ({ row, hunkIndex, isAnchor }) =>
      ({
        type: 'row',
        row,
        hunkIndex,
        isAnchor,
      }) satisfies UnifiedRenderItem,
  )
}

export function buildVirtualRange(
  itemCount: number,
  scrollTop: number,
  viewportHeight: number,
  rowHeight: number,
): VirtualRange {
  if (itemCount === 0) {
    return emptyVirtualRange
  }

  const overscan = getEffectiveOverscan(itemCount)
  const snappedRow = Math.floor(scrollTop / rowHeight)
  const visibleRows = Math.max(1, Math.ceil(viewportHeight / rowHeight))
  const start = Math.max(0, snappedRow - overscan)
  const end = Math.min(itemCount, snappedRow + visibleRows + overscan)

  return {
    start,
    end,
    topPadding: start * rowHeight,
    bottomPadding: Math.max(0, (itemCount - end) * rowHeight),
  }
}

export function buildVirtualRangeFromLayout(
  layout: ItemLayout,
  scrollTop: number,
  viewportHeight: number,
  rowHeight: number,
): VirtualRange {
  const offsets = layout.offsets
  const itemCount = offsets.length - 1

  if (itemCount === 0) {
    return emptyVirtualRange
  }

  const overscan = getEffectiveOverscan(itemCount)
  const overscanPx = overscan * rowHeight
  const rangeTop = Math.max(0, scrollTop - overscanPx)
  const rangeBottom = scrollTop + viewportHeight + overscanPx
  const start = findLastOffsetAtOrBefore(offsets, rangeTop, itemCount)
  const end = findFirstOffsetAtOrAfter(offsets, rangeBottom, start, itemCount)

  return {
    start,
    end: Math.min(itemCount, end),
    topPadding: offsets[start],
    bottomPadding: Math.max(0, layout.total - offsets[end]),
  }
}

export function buildSideBySideItemLayout(
  rows: SideBySideRow[],
  items: SideBySideRenderItem[],
  hunks: DiffHunkRange[],
  rowHeight: number,
): ItemLayout {
  const { offsets, total } = buildItemOffsets(items, rowHeight)
  const anchors = buildLayoutAnchors(items, hunks, offsets, (hunk) =>
    classifySideBySideHunk(rows, hunk),
  )

  return { offsets, total, anchors }
}

export function buildUnifiedItemLayout(
  rows: UnifiedLine[],
  items: UnifiedRenderItem[],
  hunks: DiffHunkRange[],
  rowHeight: number,
): ItemLayout {
  const { offsets, total } = buildItemOffsets(items, rowHeight)
  const anchors = buildLayoutAnchors(items, hunks, offsets, (hunk) =>
    classifyUnifiedHunk(rows, hunk),
  )

  return { offsets, total, anchors }
}

export function buildSideBySideVirtualAnchors(
  rows: SideBySideRow[],
  hunks: DiffHunkRange[],
  rowHeight: number,
): VirtualHunkAnchor[] {
  return buildFullFileVirtualAnchors(hunks, rowHeight, (hunk) => classifySideBySideHunk(rows, hunk))
}

export function buildUnifiedVirtualAnchors(
  rows: UnifiedLine[],
  hunks: DiffHunkRange[],
  rowHeight: number,
): VirtualHunkAnchor[] {
  return buildFullFileVirtualAnchors(hunks, rowHeight, (hunk) => classifyUnifiedHunk(rows, hunk))
}

function buildVisibleFullFileItems<Row>(
  rows: Row[],
  hunks: DiffHunkRange[],
  start: number,
  end: number,
) {
  const items: Array<{ row: Row; hunkIndex: number | undefined; isAnchor: boolean }> = []
  let hunkIndex = findIntersectingHunkIndex(hunks, start)

  for (let rowIndex = start; rowIndex < end; rowIndex += 1) {
    const row = rows[rowIndex]

    while (hunkIndex < hunks.length && hunks[hunkIndex].end < rowIndex) {
      hunkIndex += 1
    }

    const activeHunk = hunks[hunkIndex]
    const rowHunkIndex =
      activeHunk && activeHunk.start <= rowIndex && activeHunk.end >= rowIndex
        ? hunkIndex
        : undefined

    items.push({
      row,
      hunkIndex: rowHunkIndex,
      isAnchor: rowHunkIndex !== undefined && activeHunk?.start === rowIndex,
    })
  }

  return items
}

function findIntersectingHunkIndex(hunks: DiffHunkRange[], rowIndex: number) {
  let low = 0
  let high = hunks.length - 1

  while (low <= high) {
    const middle = Math.floor((low + high) / 2)
    const hunk = hunks[middle]

    if (rowIndex < hunk.start) {
      high = middle - 1
      continue
    }

    if (rowIndex > hunk.end) {
      low = middle + 1
      continue
    }

    return middle
  }

  return low
}

function getEffectiveOverscan(itemCount: number): number {
  if (itemCount > 5000) {
    return 12
  }

  if (itemCount > HUGE_FILE_THRESHOLD) {
    return 20
  }

  if (itemCount > 1000) {
    return 30
  }

  return FULL_FILE_VIRTUALIZATION_BASE_OVERSCAN
}

function buildItemOffsets(
  itemTypes: ReadonlyArray<{ type: 'row' | 'hunk' }>,
  rowHeight: number,
): { offsets: number[]; total: number } {
  const offsets = new Array<number>(itemTypes.length + 1)
  let cursor = 0
  offsets[0] = cursor

  for (let index = 0; index < itemTypes.length; index += 1) {
    cursor += itemTypes[index].type === 'row' ? rowHeight : COLLAPSED_ROW_HEIGHT
    offsets[index + 1] = cursor
  }

  return { offsets, total: cursor }
}

function buildLayoutAnchors(
  items: ReadonlyArray<{ hunkIndex?: number }>,
  hunks: DiffHunkRange[],
  offsets: number[],
  classify: (hunk: DiffHunkRange) => VirtualHunkAnchor['kind'],
) {
  const anchors: VirtualHunkAnchor[] = []

  for (const [hunkIndex, range] of collectAnchorRanges(items)) {
    const hunk = hunks[hunkIndex]

    if (!hunk) {
      continue
    }

    anchors.push({
      hunkIndex,
      top: offsets[range.firstIndex],
      height: offsets[range.pastLastIndex] - offsets[range.firstIndex],
      kind: classify(hunk),
    })
  }

  return anchors
}

function collectAnchorRanges(
  items: ReadonlyArray<{ hunkIndex?: number }>,
): Map<number, { firstIndex: number; pastLastIndex: number }> {
  const ranges = new Map<number, { firstIndex: number; pastLastIndex: number }>()

  for (let index = 0; index < items.length; index += 1) {
    const hunkIndex = items[index].hunkIndex

    if (hunkIndex === undefined) {
      continue
    }

    const existing = ranges.get(hunkIndex)

    if (existing) {
      existing.pastLastIndex = index + 1
    } else {
      ranges.set(hunkIndex, { firstIndex: index, pastLastIndex: index + 1 })
    }
  }

  return ranges
}

function buildFullFileVirtualAnchors(
  hunks: DiffHunkRange[],
  rowHeight: number,
  classify: (hunk: DiffHunkRange) => VirtualHunkAnchor['kind'],
): VirtualHunkAnchor[] {
  return hunks.map((hunk, hunkIndex) => ({
    hunkIndex,
    top: hunk.start * rowHeight,
    height: Math.max(rowHeight, (hunk.end - hunk.start + 1) * rowHeight),
    kind: classify(hunk),
  }))
}

function classifySideBySideHunk(rows: SideBySideRow[], hunk: DiffHunkRange) {
  return classifyHunkChanges(hunk, (index) => {
    const row = rows[index]
    return [row?.left?.change, row?.right?.change]
  })
}

function classifyUnifiedHunk(rows: UnifiedLine[], hunk: DiffHunkRange) {
  return classifyHunkChanges(hunk, (index) => [rows[index]?.change])
}

function classifyHunkChanges(
  hunk: DiffHunkRange,
  getChanges: (rowIndex: number) => Array<'context' | 'delete' | 'insert' | undefined>,
): VirtualHunkAnchor['kind'] {
  let sawInsert = false
  let sawDelete = false

  for (let index = hunk.start; index <= hunk.end; index += 1) {
    const changes = getChanges(index)

    if (changes.includes('delete')) {
      sawDelete = true
    }

    if (changes.includes('insert')) {
      sawInsert = true
    }

    if (sawInsert && sawDelete) {
      return 'mixed'
    }
  }

  if (sawInsert) {
    return 'insert'
  }

  if (sawDelete) {
    return 'delete'
  }

  return 'mixed'
}

function findLastOffsetAtOrBefore(offsets: number[], target: number, itemCount: number) {
  let low = 0
  let high = itemCount

  while (low < high) {
    const middle = (low + high + 1) >>> 1

    if (offsets[middle] <= target) {
      low = middle
    } else {
      high = middle - 1
    }
  }

  return low
}

function findFirstOffsetAtOrAfter(
  offsets: number[],
  target: number,
  start: number,
  itemCount: number,
) {
  let low = start
  let high = itemCount

  while (low < high) {
    const middle = (low + high) >>> 1

    if (offsets[middle] >= target) {
      high = middle
    } else {
      low = middle + 1
    }
  }

  return low
}
