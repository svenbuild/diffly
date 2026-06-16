import { describe, expect, it } from 'vitest'
import type { TextDiffPayload } from '../types'
import { buildTextDiffStats } from './diff-stats'

function textPayload(overrides: Partial<TextDiffPayload>): TextDiffPayload {
  return {
    leftText: 'old\nsame\n',
    rightText: 'new\nsame\nextra\n',
    patchText: null,
    patchCacheKey: null,
    leftExists: true,
    rightExists: true,
    leftCacheKey: 'left',
    rightCacheKey: 'right',
    leftSha256: null,
    rightSha256: null,
    leftLineEnding: 'lf',
    rightLineEnding: 'lf',
    leftHasTrailingNewline: true,
    rightHasTrailingNewline: true,
    ...overrides,
  }
}

describe('buildTextDiffStats', () => {
  it('counts additions and deletions from git patch text', () => {
    const stats = buildTextDiffStats(textPayload({
      patchText: [
        'diff --git a/file.txt b/file.txt',
        'index 5c2d1f8..05ce19f 100644',
        '--- a/file.txt',
        '+++ b/file.txt',
        '@@ -1,2 +1,3 @@',
        '-old',
        '+new',
        ' same',
        '+extra',
        '',
      ].join('\n'),
      patchCacheKey: 'patch-key',
    }))

    expect(stats.additions).toBe(2)
    expect(stats.deletions).toBe(1)
    expect(stats.lines).toBe(3)
  })
})
