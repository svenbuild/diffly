import type { TextDiffPayload } from './types'

export type LineEnding = 'lf' | 'crlf'
export type TextSide = 'left' | 'right'

export interface TextSnapshot {
  side: TextSide
  text: string
  exists: boolean
  sha256: string | null
  lineEnding: LineEnding
  hasTrailingNewline: boolean
  lines: string[]
}

function splitPreservingFinalBlankLine(text: string) {
  if (text.length === 0) {
    return []
  }

  const normalized = text.replace(/\r\n/g, '\n')
  const lines = normalized.split('\n')

  if (text.endsWith('\n')) {
    lines.pop()
  }

  return lines
}

export function buildTextSnapshot(
  payload: TextDiffPayload,
  side: TextSide,
): TextSnapshot {
  const text = side === 'left' ? payload.leftText : payload.rightText

  return {
    side,
    text,
    exists: side === 'left' ? payload.leftExists : payload.rightExists,
    sha256: side === 'left' ? payload.leftSha256 : payload.rightSha256,
    lineEnding: side === 'left' ? payload.leftLineEnding : payload.rightLineEnding,
    hasTrailingNewline:
      side === 'left' ? payload.leftHasTrailingNewline : payload.rightHasTrailingNewline,
    lines: splitPreservingFinalBlankLine(text),
  }
}

export function joinSnapshotLines(
  lines: string[],
  lineEnding: LineEnding,
  hasTrailingNewline: boolean,
) {
  const separator = lineEnding === 'crlf' ? '\r\n' : '\n'
  const body = lines.join(separator)

  return hasTrailingNewline ? `${body}${separator}` : body
}

export function snapshotTextEquals(snapshot: TextSnapshot, nextText: string) {
  return snapshot.text === nextText
}
