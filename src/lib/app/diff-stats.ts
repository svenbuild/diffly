import { parseDiffFromFile, processFile } from '@pierre/diffs'
import type { DiffStatsSnapshot, TextDiffPayload } from '../types'

interface TextDiffStats {
  additions: number
  deletions: number
  lines: number
}

export const EMPTY_DIFF_STATS: DiffStatsSnapshot = {
  files: 0,
  additions: 0,
  deletions: 0,
  lines: 0,
}

function countTextLines(contents: string, hasTrailingNewline: boolean) {
  if (contents.length === 0) {
    return 0
  }

  const lineCount = contents.split(/\r\n|\n|\r/).length
  return hasTrailingNewline ? Math.max(0, lineCount - 1) : lineCount
}

function textStatsSignature(text: TextDiffPayload) {
  return [
    text.leftCacheKey ?? text.leftSha256 ?? text.leftText.length,
    text.rightCacheKey ?? text.rightSha256 ?? text.rightText.length,
    text.patchCacheKey ?? text.patchText?.length ?? '',
    text.leftExists ? '1' : '0',
    text.rightExists ? '1' : '0',
    text.leftHasTrailingNewline ? '1' : '0',
    text.rightHasTrailingNewline ? '1' : '0',
  ].join('\u0000')
}

export function buildTextDiffStats(text: TextDiffPayload): TextDiffStats & { signature: string } {
  const lines = text.rightExists
    ? countTextLines(text.rightText, text.rightHasTrailingNewline)
    : countTextLines(text.leftText, text.leftHasTrailingNewline)

  try {
    const diff = text.patchText
      ? processFile(text.patchText, {
          cacheKey: text.patchCacheKey ?? textStatsSignature(text),
          isGitDiff: true,
          throwOnError: true,
        })
      : parseDiffFromFile(
          {
            name: 'left',
            contents: text.leftText,
            cacheKey: text.leftCacheKey ?? text.leftSha256 ?? undefined,
          },
          {
            name: 'right',
            contents: text.rightText,
            cacheKey: text.rightCacheKey ?? text.rightSha256 ?? undefined,
          },
          undefined,
          true,
        )

    if (!diff) {
      throw new Error('Unable to parse diff stats.')
    }

    return {
      additions: diff.hunks.reduce((total, hunk) => total + hunk.additionLines, 0),
      deletions: diff.hunks.reduce((total, hunk) => total + hunk.deletionLines, 0),
      lines,
      signature: textStatsSignature(text),
    }
  } catch {
    return {
      additions: 0,
      deletions: 0,
      lines,
      signature: textStatsSignature(text),
    }
  }
}
