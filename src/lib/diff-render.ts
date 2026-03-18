import type { SideBySideRow, UnifiedLine } from './types'
import type {
  DiffHunkRange,
  SideBySideRenderItem,
  UnifiedRenderItem,
} from './ui-types'

const DIFF_CONTEXT_LINES = 3

export function buildSideBySideHunkRanges(rows: SideBySideRow[]) {
  return buildHunkRanges(
    rows.map((row) => row.left?.change !== 'context' || row.right?.change !== 'context'),
  ).map((range) => {
    const hunkRows = rows.slice(range.start, range.end + 1)

    return {
      ...range,
      header: formatHunkHeader(
        hunkRows.map((row) => row.left?.lineNumber ?? null),
        hunkRows.map((row) => row.right?.lineNumber ?? null),
      ),
    } satisfies DiffHunkRange
  })
}

export function buildUnifiedHunkRanges(rows: UnifiedLine[]) {
  return buildHunkRanges(rows.map((row) => row.change !== 'context')).map((range) => {
    const hunkRows = rows.slice(range.start, range.end + 1)

    return {
      ...range,
      header: formatHunkHeader(
        hunkRows.map((row) => row.leftLineNumber),
        hunkRows.map((row) => row.rightLineNumber),
      ),
    } satisfies DiffHunkRange
  })
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

    return [
      {
        type: 'hunk',
        header: hunk.header,
        hunkIndex: index,
        isAnchor: true,
      } satisfies SideBySideRenderItem,
      ...hunkRows.map((row) => ({ type: 'row', row }) satisfies SideBySideRenderItem),
    ]
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

    return [
      {
        type: 'hunk',
        header: hunk.header,
        hunkIndex: index,
        isAnchor: true,
      } satisfies UnifiedRenderItem,
      ...hunkRows.map((row) => ({ type: 'row', row }) satisfies UnifiedRenderItem),
    ]
  })
}

function buildHunkRanges(changedRows: boolean[]) {
  const ranges: Array<{ start: number; end: number }> = []

  for (const [index, isChanged] of changedRows.entries()) {
    if (!isChanged) {
      continue
    }

    const nextStart = Math.max(0, index - DIFF_CONTEXT_LINES)
    const nextEnd = Math.min(changedRows.length - 1, index + DIFF_CONTEXT_LINES)
    const previous = ranges.at(-1)

    if (previous && nextStart <= previous.end + 1) {
      previous.end = Math.max(previous.end, nextEnd)
    } else {
      ranges.push({ start: nextStart, end: nextEnd })
    }
  }

  return ranges
}

function formatHunkHeader(
  leftLineNumbers: Array<number | null>,
  rightLineNumbers: Array<number | null>,
) {
  const leftRange = summarizeLineNumbers(leftLineNumbers)
  const rightRange = summarizeLineNumbers(rightLineNumbers)

  return `@@ -${leftRange.start},${leftRange.count} +${rightRange.start},${rightRange.count} @@`
}

function summarizeLineNumbers(lineNumbers: Array<number | null>) {
  const present = lineNumbers.filter((value): value is number => value !== null)

  if (present.length === 0) {
    return {
      start: 0,
      count: 0,
    }
  }

  return {
    start: present[0],
    count: present.length,
  }
}
