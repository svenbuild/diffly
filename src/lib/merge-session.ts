import type { FileDiffResult, SideBySideRow } from './types'
import type { DiffHunkRange, Side } from './ui-types'
import {
  buildTextSnapshot,
  joinSnapshotLines,
  snapshotTextEquals,
  type LineEnding,
  type TextSnapshot,
} from './text-session'

export interface MergeHunkSelection {
  toLeft: boolean
  toRight: boolean
}

export interface MergeHunkOperation {
  hunkIndex: number
  leftStart: number
  leftEnd: number
  rightStart: number
  rightEnd: number
  leftLines: string[]
  rightLines: string[]
}

export interface MergeSession {
  leftSnapshot: TextSnapshot
  rightSnapshot: TextSnapshot
  operations: MergeHunkOperation[]
  selections: MergeHunkSelection[]
  leftDraftText: string
  rightDraftText: string
  leftDirty: boolean
  rightDirty: boolean
}

function getChangedRows(rows: SideBySideRow[], range: DiffHunkRange) {
  const hunkRows = rows.slice(range.start, range.end + 1)

  return {
    hunkRows,
    changedIndexes: hunkRows.reduce<number[]>((indexes, row, index) => {
      const leftChanged = row.left?.change !== 'context'
      const rightChanged = row.right?.change !== 'context'

      if (leftChanged || rightChanged) {
        indexes.push(index)
      }

      return indexes
    }, []),
  }
}

function collectChangedLines(rows: SideBySideRow[], side: Side) {
  const lines: string[] = []

  for (const row of rows) {
    const cell = side === 'left' ? row.left : row.right

    if (cell) {
      lines.push(cell.text)
    }
  }

  return lines
}

function findInsertionBoundary(
  rows: SideBySideRow[],
  changedIndexes: number[],
  side: Side,
  totalLines: number,
) {
  const firstChangedIndex = changedIndexes[0]
  const lastChangedIndex = changedIndexes[changedIndexes.length - 1]

  for (let index = firstChangedIndex - 1; index >= 0; index -= 1) {
    const cell = side === 'left' ? rows[index]?.left : rows[index]?.right

    if (cell?.lineNumber) {
      return cell.lineNumber
    }
  }

  for (let index = lastChangedIndex + 1; index < rows.length; index += 1) {
    const cell = side === 'left' ? rows[index]?.left : rows[index]?.right

    if (cell?.lineNumber) {
      return cell.lineNumber - 1
    }
  }

  return totalLines
}

function buildSideRange(
  rows: SideBySideRow[],
  changedIndexes: number[],
  side: Side,
  totalLines: number,
) {
  const lineNumbers = changedIndexes
    .map((index) => {
      const cell = side === 'left' ? rows[index]?.left : rows[index]?.right
      return cell?.lineNumber ?? null
    })
    .filter((value): value is number => typeof value === 'number')

  if (lineNumbers.length > 0) {
    return {
      start: lineNumbers[0] - 1,
      end: lineNumbers[lineNumbers.length - 1],
    }
  }

  const boundary = findInsertionBoundary(rows, changedIndexes, side, totalLines)

  return {
    start: boundary,
    end: boundary,
  }
}

function getDraftLineFormat(
  targetSnapshot: TextSnapshot,
  sourceSnapshot: TextSnapshot,
): { lineEnding: LineEnding; hasTrailingNewline: boolean } {
  if (targetSnapshot.exists) {
    return {
      lineEnding: targetSnapshot.lineEnding,
      hasTrailingNewline: targetSnapshot.hasTrailingNewline,
    }
  }

  return {
    lineEnding: sourceSnapshot.lineEnding,
    hasTrailingNewline: sourceSnapshot.hasTrailingNewline,
  }
}

function rebuildDraftText(
  snapshot: TextSnapshot,
  sourceSnapshot: TextSnapshot,
  operations: MergeHunkOperation[],
  selections: MergeHunkSelection[],
  targetSide: Side,
) {
  const nextLines = [...snapshot.lines]
  let lineOffset = 0

  for (const operation of operations) {
    const selection = selections[operation.hunkIndex]
    const selected = targetSide === 'left' ? selection?.toLeft : selection?.toRight

    if (!selected) {
      continue
    }

    const start = (targetSide === 'left' ? operation.leftStart : operation.rightStart) + lineOffset
    const end = (targetSide === 'left' ? operation.leftEnd : operation.rightEnd) + lineOffset
    const replacement = targetSide === 'left' ? operation.rightLines : operation.leftLines
    const deleteCount = Math.max(0, end - start)

    nextLines.splice(start, deleteCount, ...replacement)
    lineOffset += replacement.length - deleteCount
  }

  const outputFormat = getDraftLineFormat(snapshot, sourceSnapshot)

  return joinSnapshotLines(
    nextLines,
    outputFormat.lineEnding,
    outputFormat.hasTrailingNewline,
  )
}

function buildOperations(
  diff: FileDiffResult,
  hunks: DiffHunkRange[],
  leftSnapshot: TextSnapshot,
  rightSnapshot: TextSnapshot,
) {
  return hunks.map((range, hunkIndex) => {
    const { hunkRows, changedIndexes } = getChangedRows(diff.sideBySide, range)
    const leftRange = buildSideRange(hunkRows, changedIndexes, 'left', leftSnapshot.lines.length)
    const rightRange = buildSideRange(hunkRows, changedIndexes, 'right', rightSnapshot.lines.length)

    return {
      hunkIndex,
      leftStart: leftRange.start,
      leftEnd: leftRange.end,
      rightStart: rightRange.start,
      rightEnd: rightRange.end,
      leftLines: collectChangedLines(hunkRows, 'left'),
      rightLines: collectChangedLines(hunkRows, 'right'),
    } satisfies MergeHunkOperation
  })
}

function recomputeDrafts(session: MergeSession): MergeSession {
  const leftDraftText = rebuildDraftText(
    session.leftSnapshot,
    session.rightSnapshot,
    session.operations,
    session.selections,
    'left',
  )
  const rightDraftText = rebuildDraftText(
    session.rightSnapshot,
    session.leftSnapshot,
    session.operations,
    session.selections,
    'right',
  )

  return {
    ...session,
    leftDraftText,
    rightDraftText,
    leftDirty: !snapshotTextEquals(session.leftSnapshot, leftDraftText),
    rightDirty: !snapshotTextEquals(session.rightSnapshot, rightDraftText),
  }
}

export function createMergeSession(
  diff: FileDiffResult,
  hunks: DiffHunkRange[],
): MergeSession {
  if (diff.contentKind !== 'text' || !diff.text) {
    throw new Error('Merge mode is only available for text diffs.')
  }

  const leftSnapshot = buildTextSnapshot(diff.text, 'left')
  const rightSnapshot = buildTextSnapshot(diff.text, 'right')
  const operations = buildOperations(diff, hunks, leftSnapshot, rightSnapshot)
  const selections = operations.map(() => ({
    toLeft: false,
    toRight: false,
  }))

  return recomputeDrafts({
    leftSnapshot,
    rightSnapshot,
    operations,
    selections,
    leftDraftText: leftSnapshot.text,
    rightDraftText: rightSnapshot.text,
    leftDirty: false,
    rightDirty: false,
  })
}

export function toggleMergeHunk(
  session: MergeSession,
  hunkIndex: number,
  targetSide: Side,
) {
  if (hunkIndex < 0 || hunkIndex >= session.selections.length) {
    return session
  }

  const selections = session.selections.map((selection, index) =>
    index === hunkIndex
      ? {
          ...selection,
          toLeft: targetSide === 'left' ? !selection.toLeft : selection.toLeft,
          toRight: targetSide === 'right' ? !selection.toRight : selection.toRight,
        }
      : selection,
  )

  return recomputeDrafts({
    ...session,
    selections,
  })
}

export function setAllMergeHunks(
  session: MergeSession,
  targetSide: Side,
  selected: boolean,
) {
  const selections = session.selections.map((selection) => ({
    ...selection,
    toLeft: targetSide === 'left' ? selected : selection.toLeft,
    toRight: targetSide === 'right' ? selected : selection.toRight,
  }))

  return recomputeDrafts({
    ...session,
    selections,
  })
}

export function hasDirtyMergeDrafts(session: MergeSession | null) {
  return Boolean(session && (session.leftDirty || session.rightDirty))
}

export function getMergeSelectionCounts(session: MergeSession | null) {
  if (!session) {
    return {
      left: 0,
      right: 0,
    }
  }

  return session.selections.reduce(
    (counts, selection) => ({
      left: counts.left + (selection.toLeft ? 1 : 0),
      right: counts.right + (selection.toRight ? 1 : 0),
    }),
    {
      left: 0,
      right: 0,
    },
  )
}
