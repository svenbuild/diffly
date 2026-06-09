import { execFile } from 'node:child_process'
import {
  mkdir,
  mkdtemp,
  rm,
  writeFile,
} from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { promisify } from 'node:util'
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
} from 'vitest'
import {
  buildFileDiffFromGit,
  buildFileDiffFromPaths,
  buildFileDiffFromSnapshots,
  clearFileDiffCache,
  type DiffSnapshot,
} from './file-diff'

const execFileAsync = promisify(execFile)
const tempDirs: string[] = []

describe('file diff snapshots', () => {
  beforeEach(() => {
    clearFileDiffCache()
  })

  afterEach(async () => {
    clearFileDiffCache()
    await Promise.all(tempDirs.splice(0).map((path) =>
      rm(path, { recursive: true, force: true }),
    ))
  })

  it('builds a text diff from snapshots without local paths', async () => {
    const result = await buildFileDiffFromSnapshots(
      textSnapshot('left.txt', 'left.txt', 'left\n', 'left-key'),
      textSnapshot('right.txt', 'right.txt', 'right\n', 'right-key'),
      defaultOptions(),
    )

    expect(result.contentKind).toBe('text')
    expect(result.leftLabel).toBe('left.txt')
    expect(result.rightLabel).toBe('right.txt')
    expect(result.text?.leftText).toBe('left\n')
    expect(result.text?.rightText).toBe('right\n')
    expect(result.summary).toBe('Comparison ready.')
  })

  it('builds a text diff when the left snapshot is missing', async () => {
    const result = await buildFileDiffFromSnapshots(
      missingSnapshot('left.txt', 'left.txt', 'left-missing'),
      textSnapshot('right.txt', 'right.txt', 'right\n', 'right-key'),
      defaultOptions(),
    )

    expect(result.contentKind).toBe('text')
    expect(result.summary).toBe('Only the right file exists.')
    expect(result.text?.leftExists).toBe(false)
    expect(result.text?.leftText).toBe('')
    expect(result.text?.rightExists).toBe(true)
    expect(result.text?.rightText).toBe('right\n')
  })

  it('builds a text diff when the right snapshot is missing', async () => {
    const result = await buildFileDiffFromSnapshots(
      textSnapshot('left.txt', 'left.txt', 'left\n', 'left-key'),
      missingSnapshot('right.txt', 'right.txt', 'right-missing'),
      defaultOptions(),
    )

    expect(result.contentKind).toBe('text')
    expect(result.summary).toBe('Only the left file exists.')
    expect(result.text?.leftExists).toBe(true)
    expect(result.text?.rightExists).toBe(false)
    expect(result.text?.rightText).toBe('')
  })

  it('returns unsupported missing when both snapshots are missing', async () => {
    const result = await buildFileDiffFromSnapshots(
      missingSnapshot('left.txt', 'left.txt', 'left-missing'),
      missingSnapshot('right.txt', 'right.txt', 'right-missing'),
      defaultOptions(),
    )

    expect(result.contentKind).toBe('unsupported')
    expect(result.summary).toBe('Neither file exists.')
    expect(result.unsupported?.reason).toBe('missing')
  })

  it.each([
    ['binary', 'binary'],
    ['image', 'image'],
    ['tooLarge', 'tooLarge'],
    ['readError', 'readError'],
  ] as const)('returns unsupported %s snapshots', async (kind, reason) => {
    const result = await buildFileDiffFromSnapshots(
      nonTextSnapshot(kind, 'left.bin', 'left.bin'),
      textSnapshot('right.txt', 'right.txt', 'right\n', 'right-key'),
      defaultOptions(),
    )

    expect(result.contentKind).toBe('unsupported')
    expect(result.unsupported?.reason).toBe(reason)
  })

  it('keeps local file diff working through path snapshots', async () => {
    const dir = await createTempDir()
    const leftPath = join(dir, 'left.txt')
    const rightPath = join(dir, 'right.txt')
    await writeFile(leftPath, 'left\n')
    await writeFile(rightPath, 'right\n')

    const result = await buildFileDiffFromPaths(
      leftPath,
      rightPath,
      'left.txt',
      'right.txt',
      defaultOptions(),
    )

    expect(result.contentKind).toBe('text')
    expect(result.text?.leftText).toBe('left\n')
    expect(result.text?.rightText).toBe('right\n')
  })

  it('detects local CRLF line endings and trailing newlines', async () => {
    const dir = await createTempDir()
    const leftPath = join(dir, 'left.txt')
    const rightPath = join(dir, 'right.txt')
    await writeFile(leftPath, 'left\r\n')
    await writeFile(rightPath, 'right')

    const result = await buildFileDiffFromPaths(
      leftPath,
      rightPath,
      'left.txt',
      'right.txt',
      defaultOptions(),
    )

    expect(result.text?.leftLineEnding).toBe('crlf')
    expect(result.text?.leftHasTrailingNewline).toBe(true)
    expect(result.text?.rightLineEnding).toBe('lf')
    expect(result.text?.rightHasTrailingNewline).toBe(false)
  })

  it('uses snapshot cache keys for file diff caching', async () => {
    const first = await buildFileDiffFromSnapshots(
      textSnapshot('left.txt', 'left.txt', 'left x\n', 'left-a'),
      textSnapshot('right.txt', 'right.txt', 'right x\n', 'right-a'),
      defaultOptions(),
    )
    const cached = await buildFileDiffFromSnapshots(
      textSnapshot('left.txt', 'left.txt', 'left y\n', 'left-a'),
      textSnapshot('right.txt', 'right.txt', 'right y\n', 'right-a'),
      defaultOptions(),
    )
    const changed = await buildFileDiffFromSnapshots(
      textSnapshot('left.txt', 'left.txt', 'left y\n', 'left-b'),
      textSnapshot('right.txt', 'right.txt', 'right y\n', 'right-b'),
      defaultOptions(),
    )

    expect(first.text?.leftText).toBe('left x\n')
    expect(cached.text?.leftText).toBe('left x\n')
    expect(changed.text?.leftText).toBe('left y\n')
  })

  it('diffs HEAD and index git blobs without temporary files', async () => {
    const repoPath = await createRepo()
    await commitFile(repoPath, 'tracked.txt', 'base\n')
    await writeFile(join(repoPath, 'tracked.txt'), 'staged\n')
    await git(repoPath, ['add', 'tracked.txt'])

    const result = await buildFileDiffFromGit(
      {
        kind: 'head',
        repoPath,
        repositoryRoot: repoPath,
        path: 'tracked.txt',
        label: 'HEAD:tracked.txt',
      },
      {
        kind: 'index',
        repoPath,
        repositoryRoot: repoPath,
        path: 'tracked.txt',
        label: ':tracked.txt',
      },
      defaultOptions(),
    )

    expect(result.contentKind).toBe('text')
    expect(result.text?.leftText).toBe('base\n')
    expect(result.text?.rightText).toBe('staged\n')
    expect(result.text?.leftCacheKey).toContain('git\u0000HEAD\u0000tracked.txt\u0000')
    expect(result.text?.rightCacheKey).toContain('git\u0000INDEX\u0000tracked.txt\u0000')
  })

  it('diffs git blobs for paths with spaces and unicode characters', async () => {
    const repoPath = await createRepo()
    const path = 'path with spaces/überblick.txt'
    await commitFile(repoPath, path, 'base\n')
    await writeFile(join(repoPath, ...path.split('/')), 'staged\n')
    await git(repoPath, ['add', path])

    const result = await buildFileDiffFromGit(
      {
        kind: 'head',
        repoPath,
        repositoryRoot: repoPath,
        path,
        label: `HEAD:${path}`,
      },
      {
        kind: 'index',
        repoPath,
        repositoryRoot: repoPath,
        path,
        label: `:${path}`,
      },
      defaultOptions(),
    )

    expect(result.contentKind).toBe('text')
    expect(result.text?.leftText).toBe('base\n')
    expect(result.text?.rightText).toBe('staged\n')
    expect(result.text?.leftCacheKey).toContain(`git\u0000HEAD\u0000${path}\u0000`)
    expect(result.text?.rightCacheKey).toContain(`git\u0000INDEX\u0000${path}\u0000`)
  })

  it('diffs a git working tree snapshot with a SHA based cache key', async () => {
    const repoPath = await createRepo()
    await commitFile(repoPath, 'tracked.txt', 'base\n')
    await writeFile(join(repoPath, 'tracked.txt'), 'worktree\n')

    const result = await buildFileDiffFromGit(
      {
        kind: 'head',
        repoPath,
        repositoryRoot: repoPath,
        path: 'tracked.txt',
        label: 'HEAD:tracked.txt',
      },
      {
        kind: 'workingTree',
        repositoryRoot: repoPath,
        path: 'tracked.txt',
        label: 'tracked.txt',
      },
      defaultOptions(),
    )

    expect(result.contentKind).toBe('text')
    expect(result.text?.leftText).toBe('base\n')
    expect(result.text?.rightText).toBe('worktree\n')
    expect(result.text?.rightCacheKey).toMatch(/git\u0000WORKTREE\u0000tracked\.txt\u0000[0-9a-f]{64}/)
  })

  it('diffs empty and working tree git snapshots', async () => {
    const repoPath = await createRepo()
    await writeFile(join(repoPath, 'new.txt'), 'new\n')

    const result = await buildFileDiffFromGit(
      {
        kind: 'empty',
        label: 'new.txt',
        logicalPath: 'new.txt',
      },
      {
        kind: 'workingTree',
        repositoryRoot: repoPath,
        path: 'new.txt',
        label: 'new.txt',
      },
      defaultOptions(),
    )

    expect(result.contentKind).toBe('text')
    expect(result.summary).toBe('Only the right file exists.')
    expect(result.text?.leftExists).toBe(false)
    expect(result.text?.rightText).toBe('new\n')
  })

  it('keeps binary git blobs unsupported', async () => {
    const repoPath = await createRepo()
    await writeFile(join(repoPath, 'binary.bin'), Uint8Array.from([0, 1, 2, 3]))
    await git(repoPath, ['add', 'binary.bin'])
    await git(repoPath, ['commit', '-m', 'Commit binary'])

    const result = await buildFileDiffFromGit(
      {
        kind: 'head',
        repoPath,
        repositoryRoot: repoPath,
        path: 'binary.bin',
        label: 'HEAD:binary.bin',
      },
      {
        kind: 'empty',
        label: 'binary.bin',
        logicalPath: 'binary.bin',
      },
      defaultOptions(),
    )

    expect(result.contentKind).toBe('unsupported')
    expect(result.unsupported?.reason).toBe('binary')
  })

  it('maps missing git objects to missing snapshots', async () => {
    const repoPath = await createRepo()

    const result = await buildFileDiffFromGit(
      {
        kind: 'head',
        repoPath,
        repositoryRoot: repoPath,
        path: 'missing.txt',
        label: 'HEAD:missing.txt',
      },
      {
        kind: 'empty',
        label: 'missing.txt',
        logicalPath: 'missing.txt',
      },
      defaultOptions(),
    )

    expect(result.contentKind).toBe('unsupported')
    expect(result.summary).toBe('Neither file exists.')
    expect(result.unsupported?.reason).toBe('missing')
  })
})

function defaultOptions() {
  return {
    ignoreWhitespace: false,
    ignoreCase: false,
  }
}

async function createTempDir() {
  const dir = await mkdtemp(join(tmpdir(), 'diffly-file-diff-'))
  tempDirs.push(dir)
  return dir
}

async function createRepo() {
  const repoPath = await createTempDir()
  await git(repoPath, ['init'])
  await git(repoPath, ['config', 'user.email', 'test@example.com'])
  await git(repoPath, ['config', 'user.name', 'Test User'])
  return repoPath
}

async function commitFile(repoPath: string, relativePath: string, content: string) {
  const absolutePath = join(repoPath, ...relativePath.split('/'))
  await mkdir(dirname(absolutePath), { recursive: true })
  await writeFile(absolutePath, content)
  await git(repoPath, ['add', relativePath])
  await git(repoPath, ['commit', '-m', `Commit ${relativePath}`])
}

async function git(repoPath: string, args: string[]) {
  await execFileAsync('git', args, {
    cwd: repoPath,
    windowsHide: true,
  })
}

function textSnapshot(
  label: string,
  logicalPath: string,
  text: string,
  cacheKey: string | null,
): DiffSnapshot {
  const bytes = new TextEncoder().encode(text)
  return {
    kind: 'text',
    exists: true,
    label,
    logicalPath,
    cacheKey,
    bytes,
    text,
    size: bytes.byteLength,
    lineEnding: text.includes('\r\n') ? 'crlf' : 'lf',
    hasTrailingNewline: text.endsWith('\n'),
    error: null,
  }
}

function missingSnapshot(
  label: string,
  logicalPath: string,
  cacheKey: string | null,
): DiffSnapshot {
  return {
    kind: 'missing',
    exists: false,
    label,
    logicalPath,
    cacheKey,
    bytes: null,
    text: null,
    size: null,
    lineEnding: null,
    hasTrailingNewline: null,
    error: null,
  }
}

function nonTextSnapshot(
  kind: 'binary' | 'image' | 'tooLarge' | 'readError',
  label: string,
  logicalPath: string,
): DiffSnapshot {
  return {
    kind,
    exists: true,
    label,
    logicalPath,
    cacheKey: `${kind}-key`,
    bytes: null,
    text: null,
    size: 10,
    lineEnding: null,
    hasTrailingNewline: null,
    error: kind === 'readError' ? 'failed' : null,
  }
}
