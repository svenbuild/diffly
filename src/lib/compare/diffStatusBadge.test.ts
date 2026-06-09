import { describe, expect, it } from 'vitest'
import type { DiffEntryStatus, DirectoryEntryResult, EntryStatus } from '../types'
import { buildChangedDirectorySet, getEntryStatusBadge } from './diffStatusBadge'

function entry(overrides: Partial<DirectoryEntryResult>): DirectoryEntryResult {
  return {
    relativePath: 'a.ts',
    status: 'modified',
    leftPath: 'a.ts',
    rightPath: 'a.ts',
    leftSize: null,
    rightSize: null,
    ...overrides,
  }
}

describe('getEntryStatusBadge — git/github (diffEntryStatus)', () => {
  const cases: Array<[DiffEntryStatus, string | null]> = [
    ['modified', 'M'],
    ['added', 'A'],
    ['deleted', 'D'],
    ['renamed', 'R'],
    ['copied', 'C'],
    ['typeChanged', 'T'],
    ['untracked', '?'],
    ['conflicted', 'U'],
    ['unsupported', null],
  ]

  it.each(cases)('maps %s to badge %s', (diffEntryStatus, expected) => {
    const badge = getEntryStatusBadge(entry({ diffEntryStatus }))
    expect(badge?.text ?? null).toBe(expected)
  })

  it('prefers diffEntryStatus over the coarse local status', () => {
    // Local status says modified, but the detailed git status is untracked.
    const badge = getEntryStatusBadge(entry({ status: 'modified', diffEntryStatus: 'untracked' }))
    expect(badge?.text).toBe('?')
  })
})

describe('getEntryStatusBadge — local fallback (status)', () => {
  const cases: Array<[EntryStatus, string | null]> = [
    ['modified', 'M'],
    ['leftOnly', 'D'],
    ['rightOnly', 'A'],
    ['unsupported', null],
  ]

  it.each(cases)('maps local %s to badge %s', (status, expected) => {
    const badge = getEntryStatusBadge(entry({ status, diffEntryStatus: undefined }))
    expect(badge?.text ?? null).toBe(expected)
  })

  it('uses descriptive tooltips for left/right-only', () => {
    expect(getEntryStatusBadge(entry({ status: 'leftOnly' }))?.title).toBe('Only in left')
    expect(getEntryStatusBadge(entry({ status: 'rightOnly' }))?.title).toBe('Only in right')
  })
})

describe('getEntryStatusBadge — rename tooltip', () => {
  it('normalizes "old -> new" to "old → new"', () => {
    const badge = getEntryStatusBadge(
      entry({
        relativePath: 'new/path.ts',
        diffEntryStatus: 'renamed',
        displayPath: 'old/path.ts -> new/path.ts',
      }),
    )
    expect(badge?.text).toBe('R')
    expect(badge?.title).toBe('old/path.ts → new/path.ts')
  })

  it('uses the rename display for copies too', () => {
    const badge = getEntryStatusBadge(
      entry({ diffEntryStatus: 'copied', displayPath: 'a.ts -> b.ts' }),
    )
    expect(badge?.text).toBe('C')
    expect(badge?.title).toBe('a.ts → b.ts')
  })

  it('falls back to a generic title when no displayPath is present', () => {
    expect(getEntryStatusBadge(entry({ diffEntryStatus: 'renamed' }))?.title).toBe('Renamed')
  })
})

describe('buildChangedDirectorySet', () => {
  it('adds only ancestor folders, not the file path itself', () => {
    const set = buildChangedDirectorySet([entry({ relativePath: 'a/b/c.ts' })])
    expect([...set].sort()).toEqual(['a', 'a/b'])
    expect(set.has('a/b/c.ts')).toBe(false)
  })

  it('adds nothing for a root-level file', () => {
    const set = buildChangedDirectorySet([entry({ relativePath: 'file.ts' })])
    expect(set.size).toBe(0)
  })

  it('adds the single parent for a one-level-deep file', () => {
    const set = buildChangedDirectorySet([entry({ relativePath: 'a/file.ts' })])
    expect([...set]).toEqual(['a'])
  })

  it('ignores unsupported entries (no badge)', () => {
    const set = buildChangedDirectorySet([
      entry({ relativePath: 'a/b/c.ts', status: 'unsupported', diffEntryStatus: 'unsupported' }),
    ])
    expect(set.size).toBe(0)
  })

  it('splits mixed \\ and / separators into canonical / keys', () => {
    const set = buildChangedDirectorySet([entry({ relativePath: 'a\\b/c.ts' })])
    expect([...set].sort()).toEqual(['a', 'a/b'])
  })
})
