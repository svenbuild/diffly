import { describe, expect, it } from 'vitest'
import {
  computeRowScrollTop,
  extractDroppedPaths,
  findRowIndexByPath,
  hasFileDragPayload,
  resolveCompareDropSide,
} from './file-drop'

function fakeFile(name: string): File {
  return { name } as unknown as File
}

describe('file-drop', () => {
  it('detects file drag payloads and ignores non-file drags', () => {
    expect(hasFileDragPayload({ types: ['Files'] })).toBe(true)
    expect(hasFileDragPayload({ types: ['text/plain', 'Files'] })).toBe(true)
    expect(hasFileDragPayload({ types: ['text/plain'] })).toBe(false)
    expect(hasFileDragPayload({ types: [] })).toBe(false)
    expect(hasFileDragPayload(null)).toBe(false)
  })

  it('extracts, trims, and deduplicates dropped file paths in order', () => {
    const files = [fakeFile('a'), fakeFile('b'), fakeFile('dup'), fakeFile('empty')]
    const map: Record<string, string> = {
      a: ' C:\left\Resource.vb ',
      b: 'C:\right\Resource.vb',
      dup: 'C:\left\Resource.vb',
      empty: '   ',
    }

    const paths = extractDroppedPaths({ files }, (file) => map[file.name] ?? '')
    expect(paths).toEqual(['C:\left\Resource.vb', 'C:\right\Resource.vb'])
  })

  it('returns an empty array when no files are present', () => {
    expect(extractDroppedPaths(null, () => 'C:\test.txt')).toEqual([])
    expect(extractDroppedPaths({ files: [] }, () => 'C:\test.txt')).toEqual([])
  })

  it('resolves left or right side from pointer position inside the compare viewer', () => {
    const rect = { left: 200, width: 1000 }
    expect(resolveCompareDropSide(250, rect, 'sideBySide')).toBe('left')
    expect(resolveCompareDropSide(699, rect, 'sideBySide')).toBe('left')
    expect(resolveCompareDropSide(700, rect, 'sideBySide')).toBe('right')
    expect(resolveCompareDropSide(1100, rect, 'unified')).toBe('right')
    expect(resolveCompareDropSide(100, { left: 0, width: 0 }, 'sideBySide')).toBe('right')
  })

  it('finds matching rows case-insensitively and computes scrollTop to bring selected rows into view', () => {
    const rows = [
      { entry: { path: 'C:\src\A.vb' } },
      { entry: { path: 'C:\src\M.vb' } },
      { entry: { path: 'C:\src\Resource.vb' } },
    ]

    expect(findRowIndexByPath(rows, 'c:\src\resource.vb')).toBe(2)
    expect(findRowIndexByPath(rows, 'C:\src\Missing.vb')).toBe(-1)
    expect(findRowIndexByPath(rows, '')).toBe(-1)

    // Row 2 at y=60..90 when viewport shows 0..150 is already visible
    expect(computeRowScrollTop(2, 30, { scrollTop: 0, clientHeight: 150, scrollHeight: 600 })).toBeNull()

    // Row 15 at y=450..480 when viewport shows 0..150 scrolls down so bottom aligns with viewBottom
    expect(computeRowScrollTop(15, 30, { scrollTop: 0, clientHeight: 150, scrollHeight: 600 })).toBe(330)

    // Row 2 at y=60..90 when viewport is scrolled to 300..450 scrolls up to row top
    expect(computeRowScrollTop(2, 30, { scrollTop: 300, clientHeight: 150, scrollHeight: 600 })).toBe(60)
  })
})
