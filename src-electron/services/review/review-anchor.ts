import { createHash } from 'node:crypto'
import type { ReviewAnchor } from '../../../src/lib/review-types'

const CONTEXT_LINES = 3

export function createReviewAnchor(input: {
  contents: string
  side: ReviewAnchor['side']
  lineNumber: number
  revision: string
}): ReviewAnchor {
  const lines = splitLines(input.contents)
  const index = input.lineNumber - 1
  if (index < 0 || index >= lines.length) throw new Error('Review line is outside the document.')
  return {
    side: input.side,
    lineNumber: input.lineNumber,
    revision: input.revision,
    lineHash: lineHash(lines[index] ?? ''),
    contextBefore: lines.slice(Math.max(0, index - CONTEXT_LINES), index),
    contextAfter: lines.slice(index + 1, index + 1 + CONTEXT_LINES),
  }
}

export function relocateReviewAnchor(
  anchor: ReviewAnchor,
  contents: string,
  revision: string,
): { anchor: ReviewAnchor; state: 'unchanged' | 'relocated' | 'outdated' } {
  if (anchor.revision === revision) return { anchor, state: 'unchanged' }
  const lines = splitLines(contents)
  const candidates: number[] = []
  for (let index = 0; index < lines.length; index += 1) {
    if (lineHash(lines[index] ?? '') !== anchor.lineHash) continue
    if (contextMatches(lines, index, anchor)) candidates.push(index)
  }
  if (candidates.length !== 1) return { anchor, state: 'outdated' }
  return {
    anchor: createReviewAnchor({
      contents,
      side: anchor.side,
      lineNumber: candidates[0]! + 1,
      revision,
    }),
    state: 'relocated',
  }
}

export function lineHash(line: string) {
  return createHash('sha256').update(line).digest('hex')
}

function contextMatches(lines: string[], index: number, anchor: ReviewAnchor) {
  const before = lines.slice(Math.max(0, index - anchor.contextBefore.length), index)
  const after = lines.slice(index + 1, index + 1 + anchor.contextAfter.length)
  return arraysEqual(before, anchor.contextBefore) && arraysEqual(after, anchor.contextAfter)
}

function splitLines(contents: string) {
  const lines = contents.split(/\r\n|\r|\n/)
  if (/\r\n$|\r$|\n$/.test(contents)) lines.pop()
  return lines
}

function arraysEqual(left: string[], right: string[]) {
  return left.length === right.length && left.every((value, index) => value === right[index])
}
