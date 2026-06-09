import {
  describe,
  expect,
  it,
} from 'vitest'
import type { DiffEntry } from '../types'
import {
  mapGitDiffEntry,
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

    const mapped = mapGitDiffEntry(entry)

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

    const mapped = mapGitDiffEntry(entry)

    expect(mapped.diffEntryId).toBe('git:unstaged::tracked.txt')
    expect(mapped.diffEntryStatus).toBe('modified')
    expect(mapped.diffEntryScope).toBe('unstaged')
  })

  it('maps added, deleted, and untracked file sides', () => {
    expect(mapGitDiffEntry(diffEntry({ status: 'added' }))).toMatchObject({
      status: 'rightOnly',
      leftPath: null,
      rightPath: 'tracked.txt',
    })
    expect(mapGitDiffEntry(diffEntry({ status: 'deleted' }))).toMatchObject({
      status: 'leftOnly',
      leftPath: 'tracked.txt',
      rightPath: null,
    })
    expect(mapGitDiffEntry(diffEntry({ status: 'untracked' }))).toMatchObject({
      status: 'rightOnly',
      leftPath: null,
      rightPath: 'tracked.txt',
    })
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
