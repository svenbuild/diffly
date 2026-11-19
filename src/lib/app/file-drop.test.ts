import { describe, expect, it } from 'vitest'
import { extractDroppedPaths, hasFileDragPayload, planPathDrop, type DropItemInfo } from './file-drop'

function fakeFile(name: string): File {
  return { name } as unknown as File
}

function file(path: string): DropItemInfo {
  return { path, exists: true, isFile: true, isDirectory: false }
}

function folder(path: string): DropItemInfo {
  return { path, exists: true, isFile: false, isDirectory: true }
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
      a: ' C:\\left\\Resource.vb ',
      b: 'C:\\right\\Resource.vb',
      dup: 'C:\\left\\Resource.vb',
      empty: '   ',
    }

    const paths = extractDroppedPaths({ files }, (entry) => map[entry.name] ?? '')
    expect(paths).toEqual(['C:\\left\\Resource.vb', 'C:\\right\\Resource.vb'])
    expect(extractDroppedPaths(null, () => 'C:\\test.txt')).toEqual([])
  })

  it('puts a single dropped item on the side it was dropped on', () => {
    expect(planPathDrop('right', [file('b.txt')])).toEqual({
      ok: true,
      kind: 'file',
      targets: { right: file('b.txt') },
    })
    expect(planPathDrop('left', [folder('src')])).toEqual({
      ok: true,
      kind: 'directory',
      targets: { left: folder('src') },
    })
  })

  it('spreads two items of the same kind over both sides in drop order', () => {
    expect(planPathDrop('right', [folder('a'), folder('b')])).toEqual({
      ok: true,
      kind: 'directory',
      targets: { left: folder('a'), right: folder('b') },
    })
  })

  it('rejects mixed kinds, missing items, and more than two items', () => {
    expect(planPathDrop('left', [file('a'), folder('b')]).ok).toBe(false)
    expect(planPathDrop('left', [{ ...file('a'), exists: false }]).ok).toBe(false)
    expect(planPathDrop('left', [file('a'), file('b'), file('c')]).ok).toBe(false)
    expect(planPathDrop('left', []).ok).toBe(false)
  })
})
