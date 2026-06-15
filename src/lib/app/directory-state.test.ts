import { describe, expect, it } from 'vitest'
import type { DirectoryEntryResult } from '../types'
import { defaultDirectoryEntry, isDiffableDirectoryEntry } from './directory-state'

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

describe('isDiffableDirectoryEntry', () => {
  it('accepts modified, leftOnly, and rightOnly entries', () => {
    expect(isDiffableDirectoryEntry(entry({ status: 'modified' }))).toBe(true)
    expect(isDiffableDirectoryEntry(entry({ status: 'leftOnly' }))).toBe(true)
    expect(isDiffableDirectoryEntry(entry({ status: 'rightOnly' }))).toBe(true)
  })

  it('rejects unsupported and binary entries', () => {
    expect(isDiffableDirectoryEntry(entry({ status: 'unsupported' }))).toBe(false)
    expect(isDiffableDirectoryEntry(entry({ binary: true }))).toBe(false)
  })

  it('rejects unchanged entries so they never open a text diff', () => {
    expect(isDiffableDirectoryEntry(entry({ status: 'unchanged' }))).toBe(false)
  })

  it('rejects null and undefined', () => {
    expect(isDiffableDirectoryEntry(null)).toBe(false)
    expect(isDiffableDirectoryEntry(undefined)).toBe(false)
  })
})

describe('defaultDirectoryEntry', () => {
  it('prefers a normal source file over root lockfiles for the initial diff', () => {
    const entries = [
      entry({ relativePath: 'package-lock.json' }),
      entry({ relativePath: 'src/App.tsx' }),
    ]

    expect(defaultDirectoryEntry(entries)?.relativePath).toBe('src/App.tsx')
  })

  it('keeps normal root files ahead of nested files', () => {
    const entries = [
      entry({ relativePath: 'src/App.tsx' }),
      entry({ relativePath: 'package.json' }),
    ]

    expect(defaultDirectoryEntry(entries)?.relativePath).toBe('package.json')
  })

  it('prefers source files over asset files when binary state is not known yet', () => {
    const entries = [
      entry({ relativePath: 'src-tauri/icons/icon.png', status: 'rightOnly' }),
      entry({ relativePath: 'src/app/App.tsx' }),
    ]

    expect(defaultDirectoryEntry(entries)?.relativePath).toBe('src/app/App.tsx')
  })

  it('falls back to a low-priority file when it is the only diffable entry', () => {
    const entries = [
      entry({ relativePath: 'package-lock.json' }),
      entry({ relativePath: 'README.md', status: 'unchanged' }),
    ]

    expect(defaultDirectoryEntry(entries)?.relativePath).toBe('package-lock.json')
  })
})
