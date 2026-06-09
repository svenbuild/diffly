import { execFile } from 'node:child_process'
import {
  mkdtemp,
  rm,
  unlink,
  writeFile,
} from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { promisify } from 'node:util'
import {
  afterEach,
  describe,
  expect,
  it,
} from 'vitest'
import type {
  DiffEntry,
  DiffSource,
  GitWorkingTreeScope,
} from '../../../src/lib/types'
import { GitProvider } from './git-provider'

const execFileAsync = promisify(execFile)

const tempRepos: string[] = []

describe('GitProvider working tree entries', () => {
  afterEach(async () => {
    await Promise.all(tempRepos.splice(0).map((path) =>
      rm(path, { recursive: true, force: true }),
    ))
  })

  it('returns empty entries for a clean repository', async () => {
    const repoPath = await createRepo()
    await commitFile(repoPath, 'tracked.txt', 'baseline\n')

    const entries = await createEntries(repoPath)

    expect(entries).toEqual([])
  })

  it('returns untracked entries in a repository without HEAD', async () => {
    const repoPath = await createRepo()
    await writeFile(join(repoPath, 'new.txt'), 'new\n')

    const entries = await createEntries(repoPath)

    expect(findEntry(entries, 'all', 'new.txt')?.status).toBe('untracked')
    expect(findEntry(entries, 'untracked', 'new.txt')?.status).toBe('untracked')
  })

  it('maps staged, unstaged, and untracked entries to their scopes and all', async () => {
    const repoPath = await createRepo()
    await commitFile(repoPath, 'tracked.txt', 'baseline\n')

    await writeFile(join(repoPath, 'staged.txt'), 'staged\n')
    await git(repoPath, ['add', 'staged.txt'])
    await writeFile(join(repoPath, 'tracked.txt'), 'changed\n')
    await writeFile(join(repoPath, 'untracked.txt'), 'untracked\n')

    const entries = await createEntries(repoPath)

    expect(findEntry(entries, 'staged', 'staged.txt')?.status).toBe('added')
    expect(findEntry(entries, 'all', 'staged.txt')?.status).toBe('added')
    expect(findEntry(entries, 'unstaged', 'tracked.txt')?.status).toBe('modified')
    expect(findEntry(entries, 'all', 'tracked.txt')?.status).toBe('modified')
    expect(findEntry(entries, 'untracked', 'untracked.txt')?.status).toBe('untracked')
    expect(findEntry(entries, 'all', 'untracked.txt')?.status).toBe('untracked')
  })

  it('shows a staged and unstaged file once in all and separately in each scope', async () => {
    const repoPath = await createRepo()
    await commitFile(repoPath, 'both.txt', 'baseline\n')

    await writeFile(join(repoPath, 'both.txt'), 'staged\n')
    await git(repoPath, ['add', 'both.txt'])
    await writeFile(join(repoPath, 'both.txt'), 'unstaged\n')

    const entries = await createEntries(repoPath)

    expect(entries.filter((entry) => entry.scope === 'all' && entry.path === 'both.txt')).toHaveLength(1)
    expect(entries.filter((entry) => entry.scope === 'staged' && entry.path === 'both.txt')).toHaveLength(1)
    expect(entries.filter((entry) => entry.scope === 'unstaged' && entry.path === 'both.txt')).toHaveLength(1)
  })

  it('sets rightSize for working tree files and null for deleted files', async () => {
    const repoPath = await createRepo()
    await commitFile(repoPath, 'deleted.txt', 'delete me\n')
    await commitFile(repoPath, 'modified.txt', 'before\n')

    await unlink(join(repoPath, 'deleted.txt'))
    await writeFile(join(repoPath, 'modified.txt'), 'after\n')
    await writeFile(join(repoPath, 'untracked.txt'), 'untracked\n')

    const entries = await createEntries(repoPath)

    expect(findEntry(entries, 'all', 'deleted.txt')?.status).toBe('deleted')
    expect(findEntry(entries, 'all', 'deleted.txt')?.rightSize).toBeNull()
    expect(findEntry(entries, 'all', 'modified.txt')?.rightSize).toBe(6)
    expect(findEntry(entries, 'all', 'untracked.txt')?.rightSize).toBe(10)
  })

  it('preserves rename metadata', async () => {
    const repoPath = await createRepo()
    await commitFile(repoPath, 'old-name.txt', 'content\n')

    await git(repoPath, ['mv', 'old-name.txt', 'new-name.txt'])

    const entries = await createEntries(repoPath)
    const stagedEntry = findEntry(entries, 'staged', 'new-name.txt')

    expect(stagedEntry?.status).toBe('renamed')
    expect(stagedEntry?.oldPath).toBe('old-name.txt')
    expect(stagedEntry?.displayPath).toBe('old-name.txt -> new-name.txt')
  })

  it('preserves paths with spaces and unicode characters', async () => {
    const repoPath = await createRepo()
    await commitFile(repoPath, 'baseline.txt', 'baseline\n')

    const spacedPath = 'path with spaces.txt'
    const unicodePath = 'überblick.txt'
    await writeFile(join(repoPath, spacedPath), 'space\n')
    await writeFile(join(repoPath, unicodePath), 'unicode\n')
    await git(repoPath, ['add', spacedPath, unicodePath])

    const entries = await createEntries(repoPath)

    expect(findEntry(entries, 'staged', spacedPath)?.path).toBe(spacedPath)
    expect(findEntry(entries, 'staged', unicodePath)?.path).toBe(unicodePath)
  })

  it('opens staged added files as empty left and index right', async () => {
    const repoPath = await createRepo()
    await commitFile(repoPath, 'baseline.txt', 'baseline\n')
    await writeFile(join(repoPath, 'staged.txt'), 'staged\n')
    await git(repoPath, ['add', 'staged.txt'])

    const result = await openEntry(repoPath, 'staged', 'staged.txt')

    expect(result.contentKind).toBe('text')
    expect(result.summary).toBe('Only the right file exists.')
    expect(result.text?.leftExists).toBe(false)
    expect(result.text?.rightText).toBe('staged\n')
    expect(result.text?.rightCacheKey).toContain('git\u0000INDEX\u0000staged.txt\u0000')
  })

  it('opens unstaged modified files from index to working tree', async () => {
    const repoPath = await createRepo()
    await commitFile(repoPath, 'tracked.txt', 'base\n')
    await writeFile(join(repoPath, 'tracked.txt'), 'index\n')
    await git(repoPath, ['add', 'tracked.txt'])
    await writeFile(join(repoPath, 'tracked.txt'), 'worktree\n')

    const result = await openEntry(repoPath, 'unstaged', 'tracked.txt')

    expect(result.contentKind).toBe('text')
    expect(result.leftLabel).toBe(':tracked.txt')
    expect(result.rightLabel).toBe('tracked.txt')
    expect(result.text?.leftText).toBe('index\n')
    expect(result.text?.rightText).toBe('worktree\n')
    expect(result.text?.leftCacheKey).toContain('git\u0000INDEX\u0000tracked.txt\u0000')
    expect(result.text?.rightCacheKey).toContain('git\u0000WORKTREE\u0000tracked.txt\u0000')
  })

  it('opens all modified files from HEAD to working tree', async () => {
    const repoPath = await createRepo()
    await commitFile(repoPath, 'tracked.txt', 'base\n')
    await writeFile(join(repoPath, 'tracked.txt'), 'worktree\n')

    const result = await openEntry(repoPath, 'all', 'tracked.txt')

    expect(result.contentKind).toBe('text')
    expect(result.leftLabel).toBe('HEAD:tracked.txt')
    expect(result.rightLabel).toBe('tracked.txt')
    expect(result.text?.leftText).toBe('base\n')
    expect(result.text?.rightText).toBe('worktree\n')
  })

  it('opens untracked files as empty left and working tree right', async () => {
    const repoPath = await createRepo()
    await commitFile(repoPath, 'baseline.txt', 'baseline\n')
    await writeFile(join(repoPath, 'untracked.txt'), 'untracked\n')

    const result = await openEntry(repoPath, 'untracked', 'untracked.txt')

    expect(result.contentKind).toBe('text')
    expect(result.summary).toBe('Only the right file exists.')
    expect(result.text?.leftExists).toBe(false)
    expect(result.text?.rightText).toBe('untracked\n')
  })

  it('opens deleted files as HEAD left and empty right', async () => {
    const repoPath = await createRepo()
    await commitFile(repoPath, 'deleted.txt', 'delete me\n')
    await unlink(join(repoPath, 'deleted.txt'))

    const result = await openEntry(repoPath, 'all', 'deleted.txt')

    expect(result.contentKind).toBe('text')
    expect(result.summary).toBe('Only the left file exists.')
    expect(result.text?.leftText).toBe('delete me\n')
    expect(result.text?.rightExists).toBe(false)
  })

  it('opens renamed files using the old path on the left and new path on the right', async () => {
    const repoPath = await createRepo()
    await commitFile(repoPath, 'old-name.txt', 'old\n')
    await git(repoPath, ['mv', 'old-name.txt', 'new-name.txt'])

    const result = await openEntry(repoPath, 'staged', 'new-name.txt')

    expect(result.contentKind).toBe('text')
    expect(result.leftLabel).toBe('HEAD:old-name.txt')
    expect(result.rightLabel).toBe(':new-name.txt')
    expect(result.text?.leftText).toBe('old\n')
    expect(result.text?.rightText).toBe('old\n')
  })

  it('opens binary files as unsupported', async () => {
    const repoPath = await createRepo()
    await commitFile(repoPath, 'binary.bin', 'base\n')
    await writeFile(join(repoPath, 'binary.bin'), Uint8Array.from([0, 1, 2, 3]))

    const result = await openEntry(repoPath, 'all', 'binary.bin')

    expect(result.contentKind).toBe('unsupported')
    expect(result.unsupported?.reason).toBe('binary')
  })

  it('throws for conflicted entries', async () => {
    const repoPath = await createRepo()
    const provider = new GitProvider()
    const source = gitSource(repoPath)
    const entryData = new Map()
    entryData.set('conflict', {
      kind: 'gitWorkingTree',
      repoPath,
      repositoryRoot: repoPath,
      scope: 'all',
      path: 'conflict.txt',
      oldPath: null,
      status: 'conflicted',
    })

    await expect(provider.openEntry({
      source,
      options: defaultOptions(),
      entryData,
    }, 'conflict', defaultOptions())).rejects.toThrow(
      'Git conflicted file details are not implemented yet.',
    )
  })
})

async function createRepo() {
  const repoPath = await mkdtemp(join(tmpdir(), 'diffly-git-provider-'))
  tempRepos.push(repoPath)
  await git(repoPath, ['init'])
  await git(repoPath, ['config', 'user.email', 'test@example.com'])
  await git(repoPath, ['config', 'user.name', 'Test User'])
  return repoPath
}

async function commitFile(repoPath: string, relativePath: string, content: string) {
  await writeFile(join(repoPath, relativePath), content)
  await git(repoPath, ['add', relativePath])
  await git(repoPath, ['commit', '-m', `Commit ${relativePath}`])
}

async function createEntries(repoPath: string) {
  const provider = new GitProvider()
  const sessionData = await provider.create(gitSource(repoPath), defaultOptions())
  return sessionData.entries
}

async function openEntry(
  repoPath: string,
  scope: GitWorkingTreeScope,
  path: string,
) {
  const provider = new GitProvider()
  const source = gitSource(repoPath)
  const options = defaultOptions()
  const sessionData = await provider.create(source, options)
  const entry = findEntry(sessionData.entries, scope, path)
  if (!entry) {
    throw new Error(`Missing test entry for ${scope}:${path}.`)
  }

  return provider.openEntry({
    source,
    options,
    entryData: sessionData.entryData,
  }, entry.id, options)
}

function gitSource(repoPath: string): DiffSource {
  return {
    kind: 'git',
    repoPath,
    repositoryRoot: repoPath,
    selection: {
      kind: 'workingTree',
      initialScope: 'all',
    },
  }
}

function defaultOptions() {
  return {
    ignoreWhitespace: false,
    ignoreCase: false,
  }
}

async function git(repoPath: string, args: string[]) {
  await execFileAsync('git', args, {
    cwd: repoPath,
    windowsHide: true,
  })
}

function findEntry(
  entries: DiffEntry[],
  scope: GitWorkingTreeScope,
  path: string,
) {
  return entries.find((entry) => entry.scope === scope && entry.path === path)
}
