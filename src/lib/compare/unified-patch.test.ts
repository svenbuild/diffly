import { describe, expect, it } from 'vitest'
import { buildUnifiedPatch } from './unified-patch'

function patch(leftText: string, rightText: string, context?: number) {
  return buildUnifiedPatch({
    leftLabel: 'a/file.txt',
    rightLabel: 'b/file.txt',
    leftText,
    rightText,
    context,
  })
}

describe('buildUnifiedPatch', () => {
  it('emits only the file header for identical files', () => {
    expect(patch('one\ntwo\n', 'one\ntwo\n')).toBe(
      '--- a/file.txt\n+++ b/file.txt\n',
    )
  })

  it('produces a single hunk for a one-line modification', () => {
    const result = patch('one\ntwo\nthree\n', 'one\nTWO\nthree\n', 1)
    expect(result).toBe(
      [
        '--- a/file.txt',
        '+++ b/file.txt',
        '@@ -1,3 +1,3 @@',
        ' one',
        '-two',
        '+TWO',
        ' three',
        '',
      ].join('\n'),
    )
  })

  it('orders deletions before insertions inside a changed run', () => {
    const result = patch('a\nold1\nold2\nz\n', 'a\nnew1\nz\n', 0)
    expect(result).toBe(
      [
        '--- a/file.txt',
        '+++ b/file.txt',
        '@@ -2,2 +2,1 @@',
        '-old1',
        '-old2',
        '+new1',
        '',
      ].join('\n'),
    )
  })

  it('uses zero-count anchors for pure insertions', () => {
    const result = patch('a\nb\n', 'a\nb\nc\n', 0)
    expect(result).toBe(
      [
        '--- a/file.txt',
        '+++ b/file.txt',
        '@@ -2,0 +3,1 @@',
        '+c',
        '',
      ].join('\n'),
    )
  })

  it('uses zero-count anchors for pure deletions', () => {
    const result = patch('a\nb\nc\n', 'a\nc\n', 0)
    expect(result).toBe(
      [
        '--- a/file.txt',
        '+++ b/file.txt',
        '@@ -2,1 +1,0 @@',
        '-b',
        '',
      ].join('\n'),
    )
  })

  it('handles empty left file as full insertion', () => {
    const result = patch('', 'a\nb\n')
    expect(result).toContain('@@ -0,0 +1,2 @@')
    expect(result).toContain('+a')
    expect(result).toContain('+b')
    expect(result).not.toContain('\n-')
  })

  it('handles empty right file as full deletion', () => {
    const result = patch('a\nb\n', '')
    expect(result).toContain('@@ -1,2 +0,0 @@')
    expect(result).toContain('-a')
    expect(result).toContain('-b')
  })

  it('splits distant changes into separate hunks', () => {
    const lines = Array.from({ length: 30 }, (_, index) => `line${index + 1}`)
    const leftText = `${lines.join('\n')}\n`
    const changed = [...lines]
    changed[0] = 'first-changed'
    changed[29] = 'last-changed'
    const result = patch(leftText, `${changed.join('\n')}\n`, 2)

    const hunkHeaders = result
      .split('\n')
      .filter((line) => line.startsWith('@@'))
    expect(hunkHeaders).toEqual(['@@ -1,3 +1,3 @@', '@@ -28,3 +28,3 @@'])
  })

  it('merges nearby changes into one hunk', () => {
    const result = patch('a\nb\nc\nd\ne\n', 'A\nb\nc\nd\nE\n', 3)
    const hunkHeaders = result
      .split('\n')
      .filter((line) => line.startsWith('@@'))
    expect(hunkHeaders).toEqual(['@@ -1,5 +1,5 @@'])
  })

  it('keeps identical shifted blocks as context', () => {
    const leftText = [
      'case 0x5C7:',
      '  CanReceive_Speedometer_Data8_5C7(data);',
      '  break;',
      '',
      'case 0x50A:',
      '  CanReceive_Speedometer_Status_50A(data);',
      '  break;',
      '',
      'case 0x600:',
      '  CanReceive_Other_600(data);',
      '  break;',
      '',
    ].join('\n')
    const rightText = [
      'case 0x5C7:',
      '  CanReceive_Speedometer_Data8_5C7(data);',
      '  break;',
      '',
      'case 0x499:',
      '  CanReceive_New_499(data);',
      '  break;',
      '',
      'case 0x50A:',
      '  CanReceive_Speedometer_Status_50A(data);',
      '  break;',
      '',
      'case 0x600:',
      '  CanReceive_Other_600(data);',
      '  break;',
      '',
    ].join('\n')
    const result = patch(leftText, rightText, 3)

    expect(result).toContain(' case 0x50A:')
    expect(result).not.toContain('-case 0x50A:')
    expect(result).not.toContain('+case 0x50A:')
  })

  it('keeps repeated identical one-liners as context', () => {
    const leftText = [
      'beforeLeft();',
      'sameCall();',
      'oldMiddle();',
      'sameCall();',
      'afterLeft();',
      '',
    ].join('\n')
    const rightText = [
      'beforeRight();',
      'sameCall();',
      'newMiddle();',
      'sameCall();',
      'afterRight();',
      '',
    ].join('\n')
    const result = patch(leftText, rightText, 1)

    expect(result.match(/^ sameCall\(\);$/gm)).toHaveLength(2)
    expect(result).not.toContain('-sameCall();')
    expect(result).not.toContain('+sameCall();')
  })

  it('marks missing trailing newline on the old side', () => {
    const result = patch('a\nb', 'a\nB\n', 0)
    expect(result).toBe(
      [
        '--- a/file.txt',
        '+++ b/file.txt',
        '@@ -2,1 +2,1 @@',
        '-b',
        '\\ No newline at end of file',
        '+B',
        '',
      ].join('\n'),
    )
  })

  it('marks missing trailing newline on the new side', () => {
    const result = patch('a\nb\n', 'a\nB', 0)
    expect(result).toBe(
      [
        '--- a/file.txt',
        '+++ b/file.txt',
        '@@ -2,1 +2,1 @@',
        '-b',
        '+B',
        '\\ No newline at end of file',
        '',
      ].join('\n'),
    )
  })

  it('keeps carriage returns from CRLF input on patch lines', () => {
    const result = patch('one\r\ntwo\r\n', 'one\r\nTWO\r\n', 0)
    expect(result).toContain('-two\r')
    expect(result).toContain('+TWO\r')
  })

  it('falls back to a replace hunk for oversized middles but stays valid', () => {
    // 1100 x 1100 changed lines exceeds the LCS cell budget (2^20).
    const leftLines = Array.from({ length: 1100 }, (_, index) => `left${index}`)
    const rightLines = Array.from({ length: 1100 }, (_, index) => `right${index}`)
    const result = patch(`${leftLines.join('\n')}\n`, `${rightLines.join('\n')}\n`, 0)

    expect(result).toContain('@@ -1,1100 +1,1100 @@')
    expect(result.split('\n').filter((line) => line.startsWith('-'))).toHaveLength(1101)
  })
})
