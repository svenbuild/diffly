// Minimal whole-file unified diff generation for the review-mode "Copy patch"
// action. @pierre/diffs parses patches (parseDiffFromFile feeds jsdiff output
// straight into processFile) but never exposes the raw patch text, so we build
// it ourselves from the already-loaded left/right file contents.

/** Combined left+right text length above which copyPatch refuses to run. */
export const MAX_PATCH_SOURCE_LENGTH = 4 * 1024 * 1024

// Beyond this many LCS cells the line-level diff falls back to a whole-block
// replace hunk, keeping memory and time bounded for huge, heavily-changed
// files while still producing a valid unified diff.
const MAX_LCS_CELLS = 1 << 20

const NO_NEWLINE_MARKER = '\\ No newline at end of file'

export interface UnifiedPatchInput {
  leftLabel: string
  rightLabel: string
  leftText: string
  rightText: string
  /** Unchanged context lines around each hunk. Defaults to 3. */
  context?: number
}

interface SplitResult {
  lines: string[]
  trailingNewline: boolean
}

type DiffOpType = 'equal' | 'delete' | 'insert'

interface DiffOp {
  type: DiffOpType
  count: number
}

interface LineRecord {
  type: ' ' | '-' | '+'
  text: string
  /** 1-based old-file line for ' '/'-' records; next unconsumed old line for '+'. */
  aLine: number
  /** 1-based new-file line for ' '/'+' records; next unconsumed new line for '-'. */
  bLine: number
}

function splitLines(text: string): SplitResult {
  if (text === '') {
    return { lines: [], trailingNewline: true }
  }

  const trailingNewline = text.endsWith('\n')
  const lines = text.split('\n')
  if (trailingNewline) {
    lines.pop()
  }

  return { lines, trailingNewline }
}

function commonPrefixLength(a: string[], b: string[]): number {
  const max = Math.min(a.length, b.length)
  let length = 0
  while (length < max && a[length] === b[length]) {
    length += 1
  }
  return length
}

function commonSuffixLength(a: string[], b: string[], prefix: number): number {
  const max = Math.min(a.length, b.length) - prefix
  let length = 0
  while (
    length < max &&
    a[a.length - 1 - length] === b[b.length - 1 - length]
  ) {
    length += 1
  }
  return length
}

function pushOp(ops: DiffOp[], type: DiffOpType, count: number) {
  if (count <= 0) {
    return
  }

  const last = ops[ops.length - 1]
  if (last && last.type === type) {
    last.count += count
    return
  }

  ops.push({ type, count })
}

// LCS dynamic program over the middle section (common prefix/suffix trimmed).
// Returns delete/insert ops for the middle only.
function diffMiddle(a: string[], b: string[]): DiffOp[] {
  const n = a.length
  const m = b.length
  const ops: DiffOp[] = []

  if (n === 0 || m === 0 || n * m > MAX_LCS_CELLS) {
    pushOp(ops, 'delete', n)
    pushOp(ops, 'insert', m)
    return ops
  }

  const width = m + 1
  const table = new Uint32Array((n + 1) * width)
  for (let i = 1; i <= n; i += 1) {
    const row = i * width
    const prevRow = row - width
    for (let j = 1; j <= m; j += 1) {
      table[row + j] =
        a[i - 1] === b[j - 1]
          ? table[prevRow + j - 1] + 1
          : Math.max(table[prevRow + j], table[row + j - 1])
    }
  }

  const reversed: DiffOp[] = []
  let i = n
  let j = m
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && a[i - 1] === b[j - 1]) {
      pushOp(reversed, 'equal', 1)
      i -= 1
      j -= 1
    } else if (j > 0 && (i === 0 || table[i * width + j - 1] >= table[(i - 1) * width + j])) {
      pushOp(reversed, 'insert', 1)
      j -= 1
    } else {
      pushOp(reversed, 'delete', 1)
      i -= 1
    }
  }

  reversed.reverse()
  for (const op of reversed) {
    pushOp(ops, op.type, op.count)
  }
  return ops
}

function diffOps(a: string[], b: string[]): DiffOp[] {
  const prefix = commonPrefixLength(a, b)
  const suffix = commonSuffixLength(a, b, prefix)
  const ops: DiffOp[] = []

  pushOp(ops, 'equal', prefix)
  for (const op of diffMiddle(
    a.slice(prefix, a.length - suffix),
    b.slice(prefix, b.length - suffix),
  )) {
    pushOp(ops, op.type, op.count)
  }
  pushOp(ops, 'equal', suffix)
  return ops
}

// Emits per-line records with deletions before insertions inside every
// changed run, the standard unified diff ordering.
function buildRecords(aLines: string[], bLines: string[], ops: DiffOp[]): LineRecord[] {
  const records: LineRecord[] = []
  let aIndex = 0
  let bIndex = 0
  let opIndex = 0

  while (opIndex < ops.length) {
    const op = ops[opIndex]
    if (op.type === 'equal') {
      for (let k = 0; k < op.count; k += 1) {
        records.push({
          type: ' ',
          text: aLines[aIndex],
          aLine: aIndex + 1,
          bLine: bIndex + 1,
        })
        aIndex += 1
        bIndex += 1
      }
      opIndex += 1
      continue
    }

    // Gather the full non-equal run so deletes always precede inserts.
    let deleteCount = 0
    let insertCount = 0
    while (opIndex < ops.length && ops[opIndex].type !== 'equal') {
      if (ops[opIndex].type === 'delete') {
        deleteCount += ops[opIndex].count
      } else {
        insertCount += ops[opIndex].count
      }
      opIndex += 1
    }

    for (let k = 0; k < deleteCount; k += 1) {
      records.push({
        type: '-',
        text: aLines[aIndex],
        aLine: aIndex + 1,
        bLine: bIndex + 1,
      })
      aIndex += 1
    }
    for (let k = 0; k < insertCount; k += 1) {
      records.push({
        type: '+',
        text: bLines[bIndex],
        aLine: aIndex + 1,
        bLine: bIndex + 1,
      })
      bIndex += 1
    }
  }

  return records
}

interface HunkRange {
  start: number
  end: number
}

function collectHunkRanges(records: LineRecord[], context: number): HunkRange[] {
  const ranges: HunkRange[] = []
  let current: { firstChange: number; lastChange: number } | null = null

  for (let index = 0; index < records.length; index += 1) {
    if (records[index].type === ' ') {
      continue
    }

    if (current && index - current.lastChange - 1 > context * 2) {
      ranges.push(expandRange(current, records.length, context))
      current = null
    }

    if (!current) {
      current = { firstChange: index, lastChange: index }
    } else {
      current.lastChange = index
    }
  }

  if (current) {
    ranges.push(expandRange(current, records.length, context))
  }

  return ranges
}

function expandRange(
  change: { firstChange: number; lastChange: number },
  recordCount: number,
  context: number,
): HunkRange {
  return {
    start: Math.max(0, change.firstChange - context),
    end: Math.min(recordCount - 1, change.lastChange + context),
  }
}

export function buildUnifiedPatch(input: UnifiedPatchInput): string {
  const context = Math.max(0, input.context ?? 3)
  const left = splitLines(input.leftText)
  const right = splitLines(input.rightText)
  const ops = diffOps(left.lines, right.lines)
  const records = buildRecords(left.lines, right.lines, ops)
  const ranges = collectHunkRanges(records, context)

  const out: string[] = [
    `--- ${input.leftLabel}`,
    `+++ ${input.rightLabel}`,
  ]

  for (const range of ranges) {
    const hunk = records.slice(range.start, range.end + 1)
    let oldCount = 0
    let newCount = 0
    let oldStart = 0
    let newStart = 0

    for (const record of hunk) {
      if (record.type !== '+') {
        if (oldCount === 0) {
          oldStart = record.aLine
        }
        oldCount += 1
      }
      if (record.type !== '-') {
        if (newCount === 0) {
          newStart = record.bLine
        }
        newCount += 1
      }
    }

    // Zero-count sides anchor on the line before the change, matching the
    // unified diff convention for pure insertions/deletions.
    if (oldCount === 0) {
      oldStart = hunk[0].aLine - 1
    }
    if (newCount === 0) {
      newStart = hunk[0].bLine - 1
    }

    out.push(`@@ -${oldStart},${oldCount} +${newStart},${newCount} @@`)

    for (const record of hunk) {
      out.push(`${record.type}${record.text}`)

      const endsOldFile =
        record.type !== '+' &&
        !left.trailingNewline &&
        record.aLine === left.lines.length
      const endsNewFile =
        record.type !== '-' &&
        !right.trailingNewline &&
        record.bLine === right.lines.length
      if (endsOldFile || endsNewFile) {
        out.push(NO_NEWLINE_MARKER)
      }
    }
  }

  return `${out.join('\n')}\n`
}
