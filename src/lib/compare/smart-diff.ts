import { processFile, type FileContents, type FileDiffMetadata } from '@pierre/diffs'
import type { TextDiffPayload } from '../types'
import { buildUnifiedPatch } from './unified-patch'

const SMART_DIFF_CONTEXT_LINES = 3
const SMART_DIFF_VERSION = 'patience-v1'

export function smartDiffCacheKey(
  text: TextDiffPayload,
  leftLabel: string,
  rightLabel: string,
) {
  return [
    'diffly-smart-diff',
    SMART_DIFF_VERSION,
    leftLabel,
    rightLabel,
    text.leftCacheKey ?? text.leftSha256 ?? text.leftText.length,
    text.rightCacheKey ?? text.rightSha256 ?? text.rightText.length,
    text.leftText.length,
    text.rightText.length,
    text.leftHasTrailingNewline ? '1' : '0',
    text.rightHasTrailingNewline ? '1' : '0',
  ].join('\u0000')
}

export function buildSmartDiffPatch(
  text: TextDiffPayload,
  leftLabel: string,
  rightLabel: string,
) {
  return {
    cacheKey: smartDiffCacheKey(text, leftLabel, rightLabel),
    patchText: buildUnifiedPatch({
      leftLabel,
      rightLabel,
      leftText: text.leftText,
      rightText: text.rightText,
      context: SMART_DIFF_CONTEXT_LINES,
    }),
  }
}

export function buildSmartFileDiff(
  text: TextDiffPayload,
  leftLabel: string,
  rightLabel: string,
  oldFile: FileContents,
  newFile: FileContents,
): FileDiffMetadata | null {
  const patch = buildSmartDiffPatch(text, leftLabel, rightLabel)
  return processFile(patch.patchText, {
    cacheKey: patch.cacheKey,
    isGitDiff: true,
    oldFile,
    newFile,
    throwOnError: true,
  }) ?? null
}
