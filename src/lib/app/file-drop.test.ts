import { describe, expect, it } from 'vitest'
import {
  extractDroppedPaths,
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
})
