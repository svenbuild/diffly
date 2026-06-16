import { processFile } from '@pierre/diffs'
import { describe, expect, it } from 'vitest'
import type { TextDiffPayload } from '../types'
import { buildSmartDiffPatch } from './smart-diff'

function textPayload(overrides: Partial<TextDiffPayload> = {}): TextDiffPayload {
  return {
    leftText: 'old\nsame\n',
    rightText: 'new\nsame\n',
    patchText: null,
    patchCacheKey: null,
    leftExists: true,
    rightExists: true,
    leftCacheKey: 'left-key',
    rightCacheKey: 'right-key',
    leftSha256: null,
    rightSha256: null,
    leftLineEnding: 'lf',
    rightLineEnding: 'lf',
    leftHasTrailingNewline: true,
    rightHasTrailingNewline: true,
    ...overrides,
  }
}

describe('buildSmartDiffPatch', () => {
  it('emits git-compatible file headers for Pierre', () => {
    const text = textPayload()
    const patch = buildSmartDiffPatch(text, 'can.c', 'can.c')

    expect(patch.patchText).toContain('--- a/can.c\n+++ b/can.c')

    const fileDiff = processFile(patch.patchText, {
      cacheKey: patch.cacheKey,
      isGitDiff: true,
      oldFile: { name: 'can.c', contents: text.leftText, cacheKey: 'left-key' },
      newFile: { name: 'can.c', contents: text.rightText, cacheKey: 'right-key' },
      throwOnError: true,
    })

    expect(fileDiff?.name).toBe('can.c')
  })
})
