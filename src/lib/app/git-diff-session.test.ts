import {
  describe,
  expect,
  it,
} from 'vitest'
import type { DiffEntry } from '../types'
import {
  countGitEntriesByScope,
  buildReusableGitEntryAliases,
  mapSessionDiffEntry,
  mapSessionDiffEntries,
  mapGitEntryStatus,
} from './git-diff-session'

describe('git diff session mapping', () => {
  it('maps git statuses to directory entry statuses', () => {
    expect(mapGitEntryStatus('modified')).toBe('modified')
    expect(mapGitEntryStatus('typeChanged')).toBe('modified')
    expect(mapGitEntryStatus('renamed')).toBe('modified')
    expect(mapGitEntryStatus('copied')).toBe('modified')
    expect(mapGitEntryStatus('deleted')).toBe('leftOnly')
    expect(mapGitEntryStatus('added')).toBe('rightOnly')
    expect(mapGitEntryStatus('untracked')).toBe('rightOnly')
    expect(mapGitEntryStatus('conflicted')).toBe('unsupported')
    expect(mapGitEntryStatus('unsupported')).toBe('unsupported')
  })

  it('keeps rename paths machine-readable while preserving display text', () => {
    const entry = diffEntry({
      path: 'new-name.txt',
      oldPath: 'old-name.txt',
      displayPath: 'old-name.txt -> new-name.txt',
      status: 'renamed',
    })

    const mapped = mapSessionDiffEntry(entry)

    expect(mapped.relativePath).toBe('new-name.txt')
    expect(mapped.displayPath).toBe('old-name.txt -> new-name.txt')
    expect(mapped.leftPath).toBe('old-name.txt')
    expect(mapped.rightPath).toBe('new-name.txt')
  })

  it('preserves diff entry metadata', () => {
    const entry = diffEntry({
      id: 'git:unstaged::tracked.txt',
      scope: 'unstaged',
      status: 'modified',
    })

    const mapped = mapSessionDiffEntry(entry)

    expect(mapped.diffEntryId).toBe('git:unstaged::tracked.txt')
    expect(mapped.diffEntryStatus).toBe('modified')
    expect(mapped.diffEntryScope).toBe('unstaged')
  })

  it('maps added, deleted, and untracked file sides', () => {
    expect(mapSessionDiffEntry(diffEntry({ status: 'added' }))).toMatchObject({
      status: 'rightOnly',
      leftPath: null,
      rightPath: 'tracked.txt',
    })
    expect(mapSessionDiffEntry(diffEntry({ status: 'deleted' }))).toMatchObject({
      status: 'leftOnly',
      leftPath: 'tracked.txt',
      rightPath: null,
    })
    expect(mapSessionDiffEntry(diffEntry({ status: 'untracked' }))).toMatchObject({
      status: 'rightOnly',
      leftPath: null,
      rightPath: 'tracked.txt',
    })
  })
})

describe('countGitEntriesByScope', () => {
  it('returns all four scope keys with zero counts for an empty list', () => {
    expect(countGitEntriesByScope([])).toEqual({
      all: 0,
      staged: 0,
      unstaged: 0,
      untracked: 0,
    })
  })

  it('counts entries per scope, including untracked appearing in all and untracked', () => {
    const entries = [
      diffEntry({ scope: 'all', path: 'a.txt' }),
      diffEntry({ scope: 'all', path: 'new.txt', status: 'untracked' }),
      diffEntry({ scope: 'staged', path: 'a.txt' }),
      diffEntry({ scope: 'unstaged', path: 'a.txt' }),
      diffEntry({ scope: 'untracked', path: 'new.txt', status: 'untracked' }),
    ]

    expect(countGitEntriesByScope(entries)).toEqual({
      all: 2,
      staged: 1,
      unstaged: 1,
      untracked: 1,
    })
  })
})

describe('buildReusableGitEntryAliases', () => {
  it('aliases all and untracked entries for the same file', () => {
    const entries = [
      diffEntry({ id: 'git:all::new.txt', scope: 'all', path: 'new.txt', status: 'untracked' }),
      diffEntry({ id: 'git:untracked::new.txt', scope: 'untracked', path: 'new.txt', status: 'untracked' }),
    ]

    expect(buildReusableGitEntryAliases(entries)).toEqual(new Map([
      ['git:all::new.txt', ['git:untracked::new.txt']],
      ['git:untracked::new.txt', ['git:all::new.txt']],
    ]))
  })

  it('aliases all and a single staged scope for the same file', () => {
    const entries = [
      diffEntry({ id: 'git:all::tracked.txt', scope: 'all' }),
      diffEntry({ id: 'git:staged::tracked.txt', scope: 'staged' }),
    ]

    expect(mapSessionDiffEntries(entries)).toEqual([
      expect.objectContaining({
        diffEntryId: 'git:all::tracked.txt',
        diffEntryAliasIds: ['git:staged::tracked.txt'],
      }),
      expect.objectContaining({
        diffEntryId: 'git:staged::tracked.txt',
        diffEntryAliasIds: ['git:all::tracked.txt'],
      }),
    ])
  })

  it('does not alias all when a file has staged and unstaged scopes', () => {
    const entries = [
      diffEntry({ id: 'git:all::tracked.txt', scope: 'all' }),
      diffEntry({ id: 'git:staged::tracked.txt', scope: 'staged' }),
      diffEntry({ id: 'git:unstaged::tracked.txt', scope: 'unstaged' }),
    ]

    expect(buildReusableGitEntryAliases(entries)).toEqual(new Map())
  })
})

function diffEntry(overrides: Partial<DiffEntry> = {}): DiffEntry {
  return {
    id: 'git:all::tracked.txt',
    path: 'tracked.txt',
    oldPath: null,
    displayPath: 'tracked.txt',
    status: 'modified',
    scope: 'all',
    leftSize: null,
    rightSize: 12,
    ...overrides,
  }
}
