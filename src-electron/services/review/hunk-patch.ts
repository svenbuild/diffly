import { createHash } from 'node:crypto'
import type { HunkFingerprint, PartialChangeSelection, ReviewChangeRange } from '../../../src/lib/review-types'

export interface ParsedHunk {
  header: string
  oldStart: number
  oldCount: number
  newStart: number
  newCount: number
  lines: string[]
  fingerprint: HunkFingerprint
}

export interface ParsedSingleFilePatch {
  headers: string[]
  hunks: ParsedHunk[]
}

export function parseSingleFilePatch(patch: string): ParsedSingleFilePatch {
  const lines = patch.replace(/\r\n/g, '\n').split('\n')
  const headers: string[] = []
  const hunks: ParsedHunk[] = []
  let current: Omit<ParsedHunk, 'fingerprint'> | null = null

  for (const line of lines) {
    const match = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@(.*)$/.exec(line)
    if (match) {
      if (current) hunks.push(withFingerprint(current))
      current = {
        header: line,
        oldStart: Number(match[1]),
        oldCount: match[2] === undefined ? 1 : Number(match[2]),
        newStart: Number(match[3]),
        newCount: match[4] === undefined ? 1 : Number(match[4]),
        lines: [],
      }
      continue
    }
    if (current) {
      if (line.startsWith('diff --git ')) throw new Error('Expected a single-file patch.')
      if (line === '' && lines.indexOf(line) === lines.length - 1) continue
      if (line.startsWith(' ') || line.startsWith('+') || line.startsWith('-') || line.startsWith('\\')) {
        current.lines.push(line)
      }
    } else {
      headers.push(line)
    }
  }
  if (current) hunks.push(withFingerprint(current))
  if (hunks.length === 0) throw new Error('Patch contains no hunks.')
  return { headers, hunks }
}

export function buildSelectedPatch(patch: string, selections: PartialChangeSelection[], direction: 'forward' | 'reverse' = 'forward') {
  const parsed = parseSingleFilePatch(patch)
  const selected = selectHunks(parsed.hunks, selections, direction)
  return [
    ...parsed.headers,
    ...selected.flatMap((hunk) => [hunkHeader(hunk), ...hunk.lines]),
    '',
  ].join('\n')
}

export function applySelectedHunks(
  contents: string,
  patch: string,
  selections: PartialChangeSelection[],
  direction: 'forward' | 'reverse',
) {
  const parsed = parseSingleFilePatch(patch)
  const hunks = selectHunks(parsed.hunks, selections, direction)
  const eol = contents.includes('\r\n') ? '\r\n' : contents.includes('\r') ? '\r' : '\n'
  const trailing = /(?:\r\n|\r|\n)$/.test(contents)
  const source = contents.split(/\r\n|\r|\n/)
  if (trailing) source.pop()
  let offset = 0

  for (const hunk of hunks) {
    const before = hunk.lines.filter((line) => line[0] !== '+').map(stripPrefix)
    const after = hunk.lines.filter((line) => line[0] !== '-').map(stripPrefix)
    const expected = direction === 'forward' ? before : after
    const replacement = direction === 'forward' ? after : before
    const start = (direction === 'forward' ? hunk.oldStart : hunk.newStart) - 1 + offset
    if (start < 0 || !arraysEqual(source.slice(start, start + expected.length), expected)) {
      throw new Error('PATCH_DOES_NOT_APPLY')
    }
    source.splice(start, expected.length, ...replacement)
    offset += replacement.length - expected.length
  }
  return source.join(eol) + (trailing ? eol : '')
}

export function applySelectedHunksBoth(
  contents: string,
  patch: string,
  selections: PartialChangeSelection[],
  targetSide: 'left' | 'right',
) {
  const parsed = parseSingleFilePatch(patch)
  const hunks = selectHunks(parsed.hunks, selections, targetSide === 'left' ? 'forward' : 'reverse')
  const eol = contents.includes('\r\n') ? '\r\n' : contents.includes('\r') ? '\r' : '\n'
  const trailing = /(?:\r\n|\r|\n)$/.test(contents)
  const source = contents.split(/\r\n|\r|\n/)
  if (trailing) source.pop()
  let offset = 0

  for (const hunk of hunks) {
    const before = hunk.lines.filter((line) => line[0] !== '+').map(stripPrefix)
    const after = hunk.lines.filter((line) => line[0] !== '-').map(stripPrefix)
    const expected = targetSide === 'left' ? before : after
    const combined = hunk.lines.filter((line) => !line.startsWith('\\')).map(stripPrefix)
    const start = (targetSide === 'left' ? hunk.oldStart : hunk.newStart) - 1 + offset
    if (start < 0 || !arraysEqual(source.slice(start, start + expected.length), expected)) {
      throw new Error('PATCH_DOES_NOT_APPLY')
    }
    source.splice(start, expected.length, ...combined)
    offset += combined.length - expected.length
  }
  return source.join(eol) + (trailing ? eol : '')
}

export function fingerprintHunk(hunk: Omit<ParsedHunk, 'fingerprint'>): HunkFingerprint {
  const context = hunk.lines.filter((line) => line.startsWith(' ')).join('\n')
  const changes = hunk.lines.filter((line) => line.startsWith('+') || line.startsWith('-')).join('\n')
  return {
    oldStart: hunk.oldStart,
    oldCount: hunk.oldCount,
    newStart: hunk.newStart,
    newCount: hunk.newCount,
    contextHash: hash(context),
    changeHash: hash(changes),
  }
}

function selectHunks(hunks: ParsedHunk[], selections: PartialChangeSelection[], direction: 'forward' | 'reverse' = 'forward') {
  const byFingerprint = new Map<string, Set<number> | null>()
  for (const selection of selections) {
    const key = fingerprintKey(selection.fingerprint)
    if (selection.changeIndex === undefined) {
      byFingerprint.set(key, null)
    } else if (!byFingerprint.has(key) || byFingerprint.get(key) !== null) {
      const indexes = byFingerprint.get(key) ?? new Set<number>()
      indexes?.add(selection.changeIndex)
      byFingerprint.set(key, indexes)
    }
  }
  if (byFingerprint.size === 0) throw new Error('No partial changes were selected.')

  const selected: ParsedHunk[] = []
  for (const hunk of hunks) {
    const blocks = byFingerprint.get(fingerprintKey(hunk.fingerprint))
    if (blocks === undefined) continue
    selected.push(blocks === null ? hunk : selectChangeBlocks(hunk, blocks, direction))
  }
  if (selected.length !== byFingerprint.size) throw new Error('PATCH_DOES_NOT_APPLY')
  return selected
}

function selectChangeBlocks(hunk: ParsedHunk, selected: Set<number>, direction: 'forward' | 'reverse'): ParsedHunk {
  const lines: string[] = []
  let changeIndex = -1
  let inChange = false
  for (const line of hunk.lines) {
    const changed = line.startsWith('+') || line.startsWith('-')
    if (changed && !inChange) changeIndex += 1
    if (!line.startsWith('\\')) inChange = changed
    if (!changed || selected.has(changeIndex) || line.startsWith('\\')) {
      lines.push(line)
    } else if (line.startsWith(direction === 'forward' ? '-' : '+')) {
      lines.push(` ${line.slice(1)}`)
    }
  }
  if (changeIndex < 0 || [...selected].some((index) => index < 0 || index > changeIndex)) {
    throw new Error('PATCH_DOES_NOT_APPLY')
  }
  const oldCount = lines.filter((line) => !line.startsWith('+') && !line.startsWith('\\')).length
  const newCount = lines.filter((line) => !line.startsWith('-') && !line.startsWith('\\')).length
  return { ...hunk, lines, oldCount, newCount }
}

function withFingerprint(hunk: Omit<ParsedHunk, 'fingerprint'>): ParsedHunk {
  return { ...hunk, fingerprint: fingerprintHunk(hunk) }
}

function hunkHeader(hunk: ParsedHunk) {
  const suffix = hunk.header.slice(hunk.header.indexOf('@@', 2) + 2)
  return `@@ -${hunk.oldStart},${hunk.oldCount} +${hunk.newStart},${hunk.newCount} @@${suffix}`
}

function fingerprintKey(value: HunkFingerprint) {
  return [value.oldStart, value.oldCount, value.newStart, value.newCount, value.contextHash, value.changeHash].join(':')
}

function stripPrefix(line: string) {
  return line.startsWith('\\') ? line : line.slice(1)
}

function arraysEqual(left: string[], right: string[]) {
  return left.length === right.length && left.every((line, index) => line === right[index])
}

function hash(value: string) {
  return createHash('sha256').update(value).digest('hex')
}
export function changedRanges(hunk: ParsedHunk): ReviewChangeRange[] {
  const ranges: ReviewChangeRange[] = []
  let left = hunk.oldStart
  let right = hunk.newStart
  let current: ReviewChangeRange | null = null
  for (const line of hunk.lines) {
    if (line.startsWith('\\')) continue
    if (line.startsWith(' ')) {
      current = null
      left += 1
      right += 1
      continue
    }
    if (!current) {
      current = { changeIndex: ranges.length, leftStart: left, leftCount: 0, rightStart: right, rightCount: 0 }
      ranges.push(current)
    }
    if (line.startsWith('-')) { current.leftCount += 1; left += 1 }
    if (line.startsWith('+')) { current.rightCount += 1; right += 1 }
  }
  return ranges
}
