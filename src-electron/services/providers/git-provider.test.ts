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
import { MAX_TEXT_BYTES } from '../file-diff'
import { disposeAllGitObjectStores } from '../git/git-object-store'
import { GitProvider } from './git-provider'

const execFileAsync = promisify(execFile)

const tempRepos: string[] = []

describe('GitProvider working tree entries', () => {
  afterEach(async () => {
    disposeAllGitObjectStores()
    await new Promise((resolve) => setTimeout(resolve, 50))
    for (const path of tempRepos.splice(0)) {
      await removeTempPath(path)
    }
  }, 30000)

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

  it('attaches scope patch text to tracked working tree entries', async () => {
    const repoPath = await createRepo()
    await commitFile(repoPath, 'tracked.txt', 'base\n')
    await writeFile(join(repoPath, 'tracked.txt'), 'worktree\n')

    const entries = await createEntries(repoPath)
    const allEntry = findEntry(entries, 'all', 'tracked.txt')
    const unstagedEntry = findEntry(entries, 'unstaged', 'tracked.txt')

    expect(allEntry?.diffPatchText).toContain('diff --git a/tracked.txt b/tracked.txt')
    expect(allEntry?.diffPatchText).toContain('-base')
    expect(allEntry?.diffPatchText).toContain('+worktree')
    expect(allEntry?.diffPatchCacheKey).toContain('git-working-tree-patch')
    expect(unstagedEntry?.diffPatchText).toContain('diff --git a/tracked.txt b/tracked.txt')
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

  it('leaves fast snapshot sizes unset before entries are opened', async () => {
    const repoPath = await createRepo()
    await commitFile(repoPath, 'deleted.txt', 'delete me\n')
    await commitFile(repoPath, 'modified.txt', 'before\n')

    await unlink(join(repoPath, 'deleted.txt'))
    await writeFile(join(repoPath, 'modified.txt'), 'after\n')
    await writeFile(join(repoPath, 'untracked.txt'), 'untracked\n')

    const entries = await createEntries(repoPath)

    expect(findEntry(entries, 'all', 'deleted.txt')?.status).toBe('deleted')
    expect(findEntry(entries, 'all', 'deleted.txt')?.rightSize).toBeNull()
    expect(findEntry(entries, 'all', 'modified.txt')?.rightSize).toBeNull()
    expect(findEntry(entries, 'all', 'untracked.txt')?.rightSize).toBeNull()
  })

  it('preserves rename metadata', async () => {
    const repoPath = await createRepo()
    await git(repoPath, ['config', 'status.renames', 'true'])
    await commitFile(repoPath, 'old-name.txt', 'content\n')

    await git(repoPath, ['mv', 'old-name.txt', 'new-name.txt'])

    const entries = await createEntries(repoPath)
    const stagedEntry = findEntry(entries, 'staged', 'new-name.txt')

    expect(stagedEntry?.status).toBe('renamed')
    expect(stagedEntry?.oldPath).toBe('old-name.txt')
    expect(stagedEntry?.displayPath).toBe('old-name.txt -> new-name.txt')
    expect(stagedEntry?.rightSize).toBeNull()
  })

  it('keeps delete/add status snapshots without raw rename fallback', async () => {
    const repoPath = await createRepo()
    await git(repoPath, ['config', 'status.renames', 'false'])
    await commitFile(repoPath, 'old-name.txt', 'content\n')

    await git(repoPath, ['rm', 'old-name.txt'])
    await writeFile(join(repoPath, 'new-name.txt'), 'content\n')
    await git(repoPath, ['add', 'new-name.txt'])

    const entries = await createEntries(repoPath)
    const deletedEntry = findEntry(entries, 'staged', 'old-name.txt')
    const stagedEntry = findEntry(entries, 'staged', 'new-name.txt')

    expect(deletedEntry?.status).toBe('deleted')
    expect(stagedEntry?.status).toBe('added')
    expect(stagedEntry?.oldPath).toBeNull()
    expect(stagedEntry?.rightSize).toBeNull()
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
    expect(result.rightLabel).toBe(':staged.txt')
    expect(result.text?.leftExists).toBe(false)
    expect(result.text?.rightText).toBe('staged\n')
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

  it('attaches git patch text for modified working tree files', async () => {
    const repoPath = await createRepo()
    await commitFile(repoPath, 'tracked.txt', 'base\n')
    await writeFile(join(repoPath, 'tracked.txt'), 'worktree\n')

    const result = await openEntry(repoPath, 'all', 'tracked.txt')

    expect(result.text?.patchText).toContain('diff --git a/tracked.txt b/tracked.txt')
    expect(result.text?.patchText).toContain('-base')
    expect(result.text?.patchText).toContain('+worktree')
    expect(result.text?.patchCacheKey).toContain('git-patch')
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

  it('defers untracked binary detection until open', async () => {
    const repoPath = await createRepo()
    await commitFile(repoPath, 'baseline.txt', 'baseline\n')
    await writeFile(join(repoPath, 'untracked.bin'), Uint8Array.from([0, 1, 2, 3]))

    const entries = await createEntries(repoPath)

    expect(findEntry(entries, 'all', 'untracked.bin')?.binary).toBeUndefined()
    expect(findEntry(entries, 'untracked', 'untracked.bin')?.binary).toBeUndefined()

    const result = await openEntry(repoPath, 'untracked', 'untracked.bin')

    expect(result.contentKind).toBe('unsupported')
    expect(result.unsupported?.reason).toBe('binary')
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

    const entries = await createEntries(repoPath)
    expect(findEntry(entries, 'all', 'binary.bin')?.binary).toBe(true)
    expect(findEntry(entries, 'unstaged', 'binary.bin')?.binary).toBe(true)

    const result = await openEntry(repoPath, 'all', 'binary.bin')

    expect(result.contentKind).toBe('unsupported')
    expect(result.unsupported?.reason).toBe('binary')
  })

  it('opens too-large files as unsupported', async () => {
    const repoPath = await createRepo()
    await commitFile(repoPath, 'large.txt', 'base\n')
    await writeFile(join(repoPath, 'large.txt'), `${'a'.repeat(MAX_TEXT_BYTES + 1)}\n`)

    const result = await openEntry(repoPath, 'all', 'large.txt')

    expect(result.contentKind).toBe('unsupported')
    expect(result.unsupported?.reason).toBe('tooLarge')
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

describe('GitProvider ref range and commit entries', () => {
  afterEach(async () => {
    disposeAllGitObjectStores()
    await new Promise((resolve) => setTimeout(resolve, 50))
    for (const path of tempRepos.splice(0)) {
      await removeTempPath(path)
    }
  }, 30000)

  it('diffs base against head for two-dot ranges', async () => {
    const repoPath = await createRepo()
    await commitFile(repoPath, 'shared.txt', 'base\n')
    await git(repoPath, ['checkout', '-b', 'feature/topic'])
    await commitFile(repoPath, 'feature.txt', 'feature\n')
    await commitFile(repoPath, 'shared.txt', 'feature change\n')

    const provider = new GitProvider()
    const sessionData = await provider.create(
      refRangeSource(repoPath, 'main', 'feature/topic', 'twoDot'),
      defaultOptions(),
    )

    const paths = sessionData.entries.map((entry) => entry.path).sort()
    expect(paths).toEqual(['feature.txt', 'shared.txt'])
    expect(sessionData.entries.find((entry) => entry.path === 'feature.txt')?.status).toBe('added')
    expect(sessionData.entries.find((entry) => entry.path === 'shared.txt')?.status).toBe('modified')
  })

  it('ignores base-only changes for three-dot ranges', async () => {
    const repoPath = await createRepo()
    await commitFile(repoPath, 'shared.txt', 'base\n')
    await git(repoPath, ['checkout', '-b', 'feature/topic'])
    await commitFile(repoPath, 'feature.txt', 'feature\n')
    await git(repoPath, ['checkout', 'main'])
    await commitFile(repoPath, 'base-only.txt', 'base only\n')

    const provider = new GitProvider()
    const threeDot = await provider.create(
      refRangeSource(repoPath, 'main', 'feature/topic', 'threeDot'),
      defaultOptions(),
    )
    const twoDot = await provider.create(
      refRangeSource(repoPath, 'main', 'feature/topic', 'twoDot'),
      defaultOptions(),
    )

    expect(threeDot.entries.map((entry) => entry.path)).toEqual(['feature.txt'])
    expect(twoDot.entries.map((entry) => entry.path).sort()).toEqual([
      'base-only.txt',
      'feature.txt',
    ])
  })

  it('opens ref range entries with base content left and head content right', async () => {
    const repoPath = await createRepo()
    await commitFile(repoPath, 'shared.txt', 'base\n')
    await git(repoPath, ['checkout', '-b', 'feature/topic'])
    await commitFile(repoPath, 'shared.txt', 'feature change\n')

    const provider = new GitProvider()
    const source = refRangeSource(repoPath, 'main', 'feature/topic', 'twoDot')
    const sessionData = await provider.create(source, defaultOptions())
    const entry = sessionData.entries.find((item) => item.path === 'shared.txt')
    if (!entry) {
      throw new Error('Missing shared.txt range entry.')
    }

    const result = await provider.openEntry({
      source,
      options: defaultOptions(),
      entryData: sessionData.entryData,
    }, entry.id, defaultOptions())

    expect(result.contentKind).toBe('text')
    expect(result.leftLabel).toBe('main:shared.txt')
    expect(result.rightLabel).toBe('feature/topic:shared.txt')
    expect(result.text?.leftText).toBe('base\n')
    expect(result.text?.rightText).toBe('feature change\n')
  })

  it('preserves renames in ref range diffs', async () => {
    const repoPath = await createRepo()
    await commitFile(repoPath, 'old-name.txt', 'stable content\n')
    await git(repoPath, ['checkout', '-b', 'feature/rename'])
    await git(repoPath, ['mv', 'old-name.txt', 'new-name.txt'])
    await git(repoPath, ['commit', '-m', 'Rename file'])

    const provider = new GitProvider()
    const source = refRangeSource(repoPath, 'main', 'feature/rename', 'threeDot')
    const sessionData = await provider.create(source, defaultOptions())
    const entry = sessionData.entries[0]

    expect(entry?.status).toBe('renamed')
    expect(entry?.oldPath).toBe('old-name.txt')
    expect(entry?.path).toBe('new-name.txt')

    const result = await provider.openEntry({
      source,
      options: defaultOptions(),
      entryData: sessionData.entryData,
    }, entry.id, defaultOptions())

    expect(result.text?.leftText).toBe('stable content\n')
    expect(result.text?.rightText).toBe('stable content\n')
  })

  it('rejects unresolvable refs with a clear error', async () => {
    const repoPath = await createRepo()
    await commitFile(repoPath, 'tracked.txt', 'base\n')

    const provider = new GitProvider()

    await expect(provider.create(
      refRangeSource(repoPath, 'does-not-exist', 'main', 'twoDot'),
      defaultOptions(),
    )).rejects.toThrow("Base ref 'does-not-exist' could not be resolved.")
    await expect(provider.create(
      commitSource(repoPath, 'not-a-commit'),
      defaultOptions(),
    )).rejects.toThrow("Commit 'not-a-commit' could not be resolved.")
  })

  it('diffs a single commit against its parent', async () => {
    const repoPath = await createRepo()
    await commitFile(repoPath, 'tracked.txt', 'first\n')
    await commitFile(repoPath, 'tracked.txt', 'second\n')

    const provider = new GitProvider()
    const source = commitSource(repoPath, 'HEAD')
    const sessionData = await provider.create(source, defaultOptions())

    expect(sessionData.entries.map((entry) => entry.path)).toEqual(['tracked.txt'])
    expect(sessionData.entries[0]?.status).toBe('modified')

    const result = await provider.openEntry({
      source,
      options: defaultOptions(),
      entryData: sessionData.entryData,
    }, sessionData.entries[0].id, defaultOptions())

    expect(result.text?.leftText).toBe('first\n')
    expect(result.text?.rightText).toBe('second\n')
  })

  it('treats a root commit as empty left against the commit', async () => {
    const repoPath = await createRepo()
    await commitFile(repoPath, 'tracked.txt', 'first\n')

    const provider = new GitProvider()
    const source = commitSource(repoPath, 'HEAD')
    const sessionData = await provider.create(source, defaultOptions())

    expect(sessionData.entries.map((entry) => entry.path)).toEqual(['tracked.txt'])
    expect(sessionData.entries[0]?.status).toBe('added')

    const result = await provider.openEntry({
      source,
      options: defaultOptions(),
      entryData: sessionData.entryData,
    }, sessionData.entries[0].id, defaultOptions())

    expect(result.summary).toBe('Only the right file exists.')
    expect(result.text?.leftExists).toBe(false)
    expect(result.text?.rightText).toBe('first\n')
  })

  it('diffs a merge commit against its first parent', async () => {
    const repoPath = await createRepo()
    await commitFile(repoPath, 'main.txt', 'main\n')
    await git(repoPath, ['checkout', '-b', 'feature/merge'])
    await commitFile(repoPath, 'feature.txt', 'feature\n')
    await git(repoPath, ['checkout', 'main'])
    await commitFile(repoPath, 'main.txt', 'main update\n')
    await git(repoPath, ['merge', '--no-ff', '-m', 'Merge feature', 'feature/merge'])

    const provider = new GitProvider()
    const sessionData = await provider.create(
      commitSource(repoPath, 'HEAD'),
      defaultOptions(),
    )

    // First-parent diff shows only what the merge brought in from the branch.
    expect(sessionData.entries.map((entry) => entry.path)).toEqual(['feature.txt'])
    expect(sessionData.entries[0]?.status).toBe('added')
  })
})

function refRangeSource(
  repoPath: string,
  baseRef: string,
  headRef: string,
  notation: 'twoDot' | 'threeDot',
): DiffSource {
  return {
    kind: 'git',
    repoPath,
    repositoryRoot: repoPath,
    selection: {
      kind: 'refRange',
      baseRef,
      headRef,
      notation,
    },
  }
}

function commitSource(repoPath: string, commitRef: string): DiffSource {
  return {
    kind: 'git',
    repoPath,
    repositoryRoot: repoPath,
    selection: {
      kind: 'commit',
      commitRef,
    },
  }
}

async function createRepo() {
  const repoPath = await mkdtemp(join(tmpdir(), 'diffly-git-provider-'))
  tempRepos.push(repoPath)
  await initGitRepo(repoPath)
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

async function initGitRepo(repoPath: string) {
  await git(repoPath, ['init'])
  await git(repoPath, ['checkout', '-b', 'main'])
}

async function removeTempPath(path: string) {
  for (let attempt = 1; attempt <= 8; attempt += 1) {
    try {
      await rm(path, {
        recursive: true,
        force: true,
        maxRetries: 10,
        retryDelay: 100,
      })
      return
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code
      if (attempt === 8 || (code !== 'EBUSY' && code !== 'ENOTEMPTY' && code !== 'EPERM')) {
        throw error
      }

      await new Promise((resolve) => setTimeout(resolve, attempt * 250))
    }
  }
}

function findEntry(
  entries: DiffEntry[],
  scope: GitWorkingTreeScope,
  path: string,
) {
  return entries.find((entry) => entry.scope === scope && entry.path === path)
}
