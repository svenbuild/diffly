import { parseDiffFromFile, processFile, type FileContents, type FileDiffMetadata } from '@pierre/diffs'
import { describe, expect, it } from 'vitest'
import { detectMovedLines } from './moved-lines'

function diffFromPatch(lines: string[], cacheKey = lines.join('\n')): FileDiffMetadata {
  const patchText = `${lines.join('\n')}\n`
  const fileDiff = processFile(patchText, {
    cacheKey,
    isGitDiff: true,
    throwOnError: true,
  })

  if (!fileDiff) {
    throw new Error('Unable to parse test patch.')
  }

  return fileDiff
}

function file(contents: string): FileContents {
  return {
    name: 'example.c',
    contents,
    cacheKey: `${contents.length}`,
  }
}

function lineSetValues(lines: Set<number>) {
  return Array.from(lines).sort((left, right) => left - right)
}

describe('detectMovedLines', () => {
  it('marks an identical deleted and added one-liner as moved', () => {
    const fileDiff = diffFromPatch([
      '--- a/example.c',
      '+++ b/example.c',
      '@@ -10,2 +20,2 @@',
      '-SetCtrlVal(pBlockPanel,BLOCKPANEL_BLOCK10090221,0);',
      '-oldValue();',
      '+newValue();',
      '+SetCtrlVal(pBlockPanel,BLOCKPANEL_BLOCK10090221,0);',
    ])

    const movedLines = detectMovedLines(fileDiff)

    expect(lineSetValues(movedLines.deletions)).toEqual([10])
    expect(lineSetValues(movedLines.additions)).toEqual([21])
  })

  it('matches multiple identical occurrences in stable line-number order', () => {
    const fileDiff = diffFromPatch([
      '--- a/example.c',
      '+++ b/example.c',
      '@@ -5,4 +50,4 @@',
      '-repeatMeaningfulCall();',
      '-oldValueOne();',
      '-repeatMeaningfulCall();',
      '-oldValueTwo();',
      '+repeatMeaningfulCall();',
      '+newValueOne();',
      '+repeatMeaningfulCall();',
      '+newValueTwo();',
    ])

    const movedLines = detectMovedLines(fileDiff)

    expect(lineSetValues(movedLines.deletions)).toEqual([5, 7])
    expect(lineSetValues(movedLines.additions)).toEqual([50, 52])
  })

  it('ignores blank lines', () => {
    const fileDiff = diffFromPatch([
      '--- a/example.c',
      '+++ b/example.c',
      '@@ -1,1 +1,1 @@',
      '-',
      '+',
    ])

    const movedLines = detectMovedLines(fileDiff)

    expect(movedLines.deletions.size).toBe(0)
    expect(movedLines.additions.size).toBe(0)
  })

  it('ignores generic short code lines', () => {
    const fileDiff = diffFromPatch([
      '--- a/example.c',
      '+++ b/example.c',
      '@@ -1,5 +1,5 @@',
      '-{',
      '-}',
      '-};',
      '-break;',
      '-else',
      '+{',
      '+}',
      '+};',
      '+break;',
      '+else',
    ])

    const movedLines = detectMovedLines(fileDiff)

    expect(movedLines.deletions.size).toBe(0)
    expect(movedLines.additions.size).toBe(0)
  })

  it('does not mark lines with different text', () => {
    const fileDiff = diffFromPatch([
      '--- a/example.c',
      '+++ b/example.c',
      '@@ -1,1 +1,1 @@',
      '-SetCtrlVal(panel,CONTROL,0);',
      '+SetCtrlVal(panel,CONTROL,(unsigned char)0);',
    ])

    const movedLines = detectMovedLines(fileDiff)

    expect(movedLines.deletions.size).toBe(0)
    expect(movedLines.additions.size).toBe(0)
  })

  it('matches identical code text when only line endings differ', () => {
    const fileDiff = diffFromPatch([
      '--- a/example.c',
      '+++ b/example.c',
      '@@ -61,1 +61,1 @@',
      '-static void openVkaserBackend(void);\r',
      '+static void openVkaserBackend(void);',
    ])

    const movedLines = detectMovedLines(fileDiff)

    expect(lineSetValues(movedLines.deletions)).toEqual([61])
    expect(lineSetValues(movedLines.additions)).toEqual([61])
  })

  it('works with processFile patch metadata', () => {
    const fileDiff = diffFromPatch([
      '--- a/example.c',
      '+++ b/example.c',
      '@@ -1,2 +1,2 @@',
      '-unsigned char *ToString(unsigned char in)',
      '-oldImplementation();',
      '+newImplementation();',
      '+unsigned char *ToString(unsigned char in)',
    ])

    const movedLines = detectMovedLines(fileDiff)

    expect(lineSetValues(movedLines.deletions)).toEqual([1])
    expect(lineSetValues(movedLines.additions)).toEqual([2])
  })

  it('works with parseDiffFromFile metadata', () => {
    const fileDiff = parseDiffFromFile(
      file('sameCallOne();\noldOnly();\nsameCallTwo();\n'),
      file('sameCallTwo();\nnewOnly();\nsameCallOne();\n'),
      undefined,
      true,
    )

    const movedLines = detectMovedLines(fileDiff)

    expect(lineSetValues(movedLines.deletions)).toEqual([1])
    expect(lineSetValues(movedLines.additions)).toEqual([3])
  })

  it('caps very frequent identical occurrences per side', () => {
    const deleted = Array.from({ length: 70 }, () => '-veryFrequentMeaningfulCall();')
    const added = Array.from({ length: 70 }, () => '+veryFrequentMeaningfulCall();')
    const fileDiff = diffFromPatch([
      '--- a/example.c',
      '+++ b/example.c',
      '@@ -1,70 +1,70 @@',
      ...deleted,
      ...added,
    ])

    const movedLines = detectMovedLines(fileDiff)

    expect(movedLines.deletions.size).toBe(64)
    expect(movedLines.additions.size).toBe(64)
    expect(Math.max(...movedLines.deletions)).toBe(64)
    expect(Math.max(...movedLines.additions)).toBe(64)
  })
})
