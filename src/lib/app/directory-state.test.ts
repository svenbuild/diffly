import { describe, expect, it } from 'vitest'
import type { DirectoryEntryResult } from '../types'
import { isDiffableDirectoryEntry } from './directory-state'

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
