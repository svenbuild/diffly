import type { ContextLinesSetting, SideBySideRow, UnifiedLine } from './types'
import type {
  DiffHunkRange,
  SideBySideRenderItem,
  UnifiedRenderItem,
} from './ui-types'

export function buildSideBySideHunkRanges(
  rows: SideBySideRow[],
  contextLines: ContextLinesSetting,
) {
  return buildHunkRanges(
    rows.map((row) => row.left?.change !== 'context' || row.right?.change !== 'context'),
    contextLines,
  )
}

export function buildUnifiedHunkRanges(
  rows: UnifiedLine[],
  contextLines: ContextLinesSetting,
) {
  return buildHunkRanges(rows.map((row) => row.change !== 'context'), contextLines)
}

export function buildSideBySideRenderItems(
  rows: SideBySideRow[],
  hunks: DiffHunkRange[],
  showFullFile: boolean,
) {
  if (showFullFile) {
    const anchorRows = new Map<number, number>()

    hunks.forEach((hunk, index) => {
      anchorRows.set(hunk.start, index)
    })

    return rows.map(
      (row, index) =>
        ({
          type: 'row',
          row,
          hunkIndex: anchorRows.get(index),
          isAnchor: anchorRows.has(index),
        }) satisfies SideBySideRenderItem,
    )
  }

  return hunks.flatMap((hunk, index) => {
    const hunkRows = rows.slice(hunk.start, hunk.end + 1)
    const previousHunk = hunks[index - 1]
    const hiddenLineCount = previousHunk ? hunk.start - previousHunk.end - 1 : hunk.start
    const items: SideBySideRenderItem[] = []

    if (hiddenLineCount > 0) {
      items.push({
        type: 'hunk',
        header: formatCollapsedLineCount(hiddenLineCount),
        hunkIndex: index,
        isAnchor: false,
      } satisfies SideBySideRenderItem)
    }

    items.push(
      ...hunkRows.map(
        (row, rowIndex) =>
          ({
            type: 'row',
            row,
            hunkIndex: index,
            isAnchor: rowIndex === 0,
          }) satisfies SideBySideRenderItem,
      ),
    )

    return items
  })
}

export function buildUnifiedRenderItems(
  rows: UnifiedLine[],
  hunks: DiffHunkRange[],
  showFullFile: boolean,
) {
  if (showFullFile) {
    const anchorRows = new Map<number, number>()

    hunks.forEach((hunk, index) => {
      anchorRows.set(hunk.start, index)
    })

    return rows.map(
      (row, index) =>
        ({
          type: 'row',
          row,
          hunkIndex: anchorRows.get(index),
          isAnchor: anchorRows.has(index),
        }) satisfies UnifiedRenderItem,
    )
  }

  return hunks.flatMap((hunk, index) => {
    const hunkRows = rows.slice(hunk.start, hunk.end + 1)
    const previousHunk = hunks[index - 1]
    const hiddenLineCount = previousHunk ? hunk.start - previousHunk.end - 1 : hunk.start
    const items: UnifiedRenderItem[] = []

    if (hiddenLineCount > 0) {
      items.push({
        type: 'hunk',
        header: formatCollapsedLineCount(hiddenLineCount),
        hunkIndex: index,
        isAnchor: false,
      } satisfies UnifiedRenderItem)
    }

    items.push(
      ...hunkRows.map(
        (row, rowIndex) =>
          ({
            type: 'row',
            row,
            hunkIndex: index,
            isAnchor: rowIndex === 0,
          }) satisfies UnifiedRenderItem,
      ),
    )

    return items
  })
}

function buildHunkRanges(changedRows: boolean[], contextLines: ContextLinesSetting) {
  const ranges: Array<{ start: number; end: number }> = []

  for (const [index, isChanged] of changedRows.entries()) {
    if (!isChanged) {
      continue
    }

    const nextStart = Math.max(0, index - contextLines)
    const nextEnd = Math.min(changedRows.length - 1, index + contextLines)
    const previous = ranges.at(-1)

    if (previous && nextStart <= previous.end + 1) {
      previous.end = Math.max(previous.end, nextEnd)
    } else {
      ranges.push({ start: nextStart, end: nextEnd })
    }
  }

  return ranges
}

function formatCollapsedLineCount(hiddenLineCount: number) {
  return `${hiddenLineCount} unmodified line${hiddenLineCount === 1 ? '' : 's'}`
}
