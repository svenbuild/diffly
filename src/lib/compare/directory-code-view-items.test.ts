import { describe, expect, it } from 'vitest'
import {
  buildPlaceholderFile,
  estimatePlaceholderLineCount,
} from './directory-code-view-items'
import type {
  DirectoryEntryResult,
  TextDiffPayload,
} from '../types'

function entry(overrides: Partial<DirectoryEntryResult> = {}): DirectoryEntryResult {
  return {
    relativePath: 'src/file.ts',
    status: 'modified',
    leftPath: null,
    rightPath: null,
    leftSize: null,
    rightSize: null,
    ...overrides,
  }
}

function text(overrides: Partial<TextDiffPayload> = {}): TextDiffPayload {
  return {
    leftText: '',
    rightText: '',
    patchText: null,
    patchCacheKey: null,
    leftExists: true,
    rightExists: true,
    leftCacheKey: null,
    rightCacheKey: null,
    leftSha256: null,
    rightSha256: null,
    leftLineEnding: 'lf',
    rightLineEnding: 'lf',
    leftHasTrailingNewline: false,
    rightHasTrailingNewline: false,
    ...overrides,
  }
}

describe('directory code view placeholders', () => {
  it('estimates split placeholder rows from patch hunks', () => {
    const lineCount = estimatePlaceholderLineCount(
      entry(),
      text({
        patchText: [
          'diff --git a/src/file.ts b/src/file.ts',
          '--- a/src/file.ts',
          '+++ b/src/file.ts',
          '@@ -1,3 +1,4 @@',
          ' keep',
          '-old',
          '+new',
          '+extra',
          ' tail',
          '',
        ].join('\n'),
      }),
      'split',
    )

    expect(lineCount).toBe(8)
  })

  it('uses unified rows when unified mode is active', () => {
    const patchText = [
      'diff --git a/src/file.ts b/src/file.ts',
      '--- a/src/file.ts',
      '+++ b/src/file.ts',
      '@@ -1,3 +1,4 @@',
      ' keep',
      '-old',
      '+new',
      '+extra',
      ' tail',
      '',
    ].join('\n')

    expect(estimatePlaceholderLineCount(entry(), text({ patchText }), 'unified')).toBe(9)
  })

  it('falls back to size-based estimates without patch text', () => {
    expect(estimatePlaceholderLineCount(entry({ leftSize: 310, rightSize: 310 }))).toBe(10)
  })

  it('uses a stable placeholder height when git sizes are unknown', () => {
    expect(estimatePlaceholderLineCount(entry())).toBe(48)
  })

  it('builds placeholder contents with the estimated patch height', () => {
    const file = buildPlaceholderFile(
      {
        entry: entry(),
        error: '',
        hasTextDiff: true,
        text: text({
          patchText: [
            'diff --git a/src/file.ts b/src/file.ts',
            '--- a/src/file.ts',
            '+++ b/src/file.ts',
            '@@ -1 +1 @@',
            '-old',
            '+new',
          ].join('\n'),
        }),
        viewStyle: 'split',
      },
      'key',
      new Map(),
    )

    expect(file.contents.split('\n')).toHaveLength(8)
  })
})
