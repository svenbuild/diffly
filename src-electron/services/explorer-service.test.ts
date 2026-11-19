import { mkdir, mkdtemp, rm, utimes, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest'

vi.mock('electron', () => ({
  dialog: {
    showOpenDialog: vi.fn(),
  },
}))

import { clearDirectoryListingCache, listDirectory } from './explorer-service'

describe('explorer-service listDirectory', () => {
  let tempDir = ''

  beforeEach(async () => {
    clearDirectoryListingCache()
    tempDir = await mkdtemp(join(tmpdir(), 'diffly-explorer-'))
  })

  afterEach(async () => {
    clearDirectoryListingCache()
    if (tempDir) {
      await rm(tempDir, { recursive: true, force: true })
      tempDir = ''
    }
  })

  it('bypasses the directory cache when forceRefresh is true even if folder mtime is unchanged', async () => {
    const filePath = join(tempDir, 'sample.txt')
    const fixedTime = new Date(Math.floor(Date.now() / 1000) * 1000)
    await writeFile(filePath, 'initial', 'utf8')
    await utimes(tempDir, fixedTime, fixedTime)

    const firstListing = await listDirectory(tempDir)
    expect(firstListing.files).toHaveLength(1)
    expect(firstListing.files[0]?.name).toBe('sample.txt')
    expect(firstListing.files[0]?.size).toBe(7)

    // Modify file contents and keep the parent directory mtime pinned to match
    // Windows NTFS behavior, where editing an existing file does not bump
    // the parent directory's mtime.
    await writeFile(filePath, 'initial-updated-content', 'utf8')
    await utimes(tempDir, fixedTime, fixedTime)

    const cachedListing = await listDirectory(tempDir)
    expect(cachedListing.files[0]?.size).toBe(7)

    const refreshedListing = await listDirectory(tempDir, { forceRefresh: true })
    expect(refreshedListing.files).toHaveLength(1)
    expect(refreshedListing.files[0]?.name).toBe('sample.txt')
    expect(refreshedListing.files[0]?.size).toBe(23)

    // Subsequent default reads should serve the refreshed cache entry.
    const nextCachedListing = await listDirectory(tempDir)
    expect(nextCachedListing.files[0]?.size).toBe(23)
  })

  it('reflects created and removed entries when forceRefresh is true', async () => {
    const fileA = join(tempDir, 'a.txt')
    const fileB = join(tempDir, 'b.txt')
    const subDir = join(tempDir, 'nested')

    await writeFile(fileA, 'a', 'utf8')
    const firstListing = await listDirectory(tempDir)
    expect(firstListing.files.map((entry) => entry.name)).toEqual(['a.txt'])
    expect(firstListing.directories).toEqual([])

    await writeFile(fileB, 'bb', 'utf8')
    await mkdir(subDir)
    await rm(fileA)

    const refreshedListing = await listDirectory(tempDir, { forceRefresh: true })
    expect(refreshedListing.files.map((entry) => entry.name)).toEqual(['b.txt'])
    expect(refreshedListing.directories.map((entry) => entry.name)).toEqual(['nested'])
  })
})
