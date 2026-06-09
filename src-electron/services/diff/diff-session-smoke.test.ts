import { execFile } from 'node:child_process'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { promisify } from 'node:util'
import {
  afterEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest'
import { parseGithubPullRequestUrl } from '../../../src/lib/github/github-url'
import type { DiffSource } from '../../../src/lib/types'
import { validateGitRepository } from '../git/git-repository'
import { GithubProvider } from '../providers/github-provider'
import { GitProvider } from '../providers/git-provider'
import { LocalProvider } from '../providers/local-provider'
import { DiffSessionService } from './diff-session-service'

// End-to-end smoke tests for the user flows behind the setup modes, driven
// through the same service stack the renderer reaches over IPC. UI-level
// behavior (slider, screens) is covered by svelte-check and component logic
// tests; these verify that every mode produces entries and file diffs.

const execFileAsync = promisify(execFile)
// Vitest runs with the project root as cwd.
const FIXTURES = resolve(process.cwd(), 'test-fixtures/directories')

const tempDirs: string[] = []
const options = { ignoreWhitespace: false, ignoreCase: false }

function createService() {
  return new DiffSessionService({
    localProvider: new LocalProvider(),
    gitProvider: new GitProvider(),
    githubProvider: new GithubProvider(),
  })
}

afterEach(async () => {
  vi.unstubAllGlobals()
  await Promise.all(tempDirs.splice(0).map((path) =>
    rm(path, { recursive: true, force: true }),
  ))
})

describe('local compare flow', () => {
  it('creates a local directory session with entries and opens a file diff', async () => {
    const service = createService()
    const session = await service.create({
      kind: 'local',
      leftPath: join(FIXTURES, 'left'),
      rightPath: join(FIXTURES, 'right'),
      compareMode: 'directory',
    }, options)

    expect(session.entries.length).toBeGreaterThan(0)

    const modified = session.entries.find((entry) => entry.path === 'inline-change.css')
    expect(modified).toBeDefined()

    const diff = await service.openEntry(session.sessionId, modified!.id, options)
    expect(diff.contentKind).toBe('text')
    expect(diff.text?.leftText).not.toBe(diff.text?.rightText)
  })
})

describe('git compare flow', () => {
  it('rejects non-git folders and accepts real repositories', async () => {
    const plainFolder = await makeTempDir('diffly-smoke-plain-')
    const repoPath = await createRepo()
    await commitFile(repoPath, 'tracked.txt', 'base\n')

    const invalid = await validateGitRepository(plainFolder)
    expect(invalid.valid).toBe(false)

    const valid = await validateGitRepository(repoPath)
    expect(valid.valid).toBe(true)
    expect(valid.repositoryRoot).toBeTruthy()
  })

  it('runs a working tree session with scope filtering and per-scope contents', async () => {
    const repoPath = await createRepo()
    await commitFile(repoPath, 'both.txt', 'base\n')

    // both.txt: staged "staged" + unstaged "worktree"; plus one untracked file.
    await writeFile(join(repoPath, 'both.txt'), 'staged\n')
    await git(repoPath, ['add', 'both.txt'])
    await writeFile(join(repoPath, 'both.txt'), 'worktree\n')
    await writeFile(join(repoPath, 'new.txt'), 'untracked\n')

    const service = createService()
    const session = await service.create(gitWorkingTreeSource(repoPath), options)

    const all = service.listEntries(session.sessionId, { scope: 'all' })
    const staged = service.listEntries(session.sessionId, { scope: 'staged' })
    const unstaged = service.listEntries(session.sessionId, { scope: 'unstaged' })
    const untracked = service.listEntries(session.sessionId, { scope: 'untracked' })

    expect(all.map((entry) => entry.path).sort()).toEqual(['both.txt', 'new.txt'])
    expect(staged.map((entry) => entry.path)).toEqual(['both.txt'])
    expect(unstaged.map((entry) => entry.path)).toEqual(['both.txt'])
    expect(untracked.map((entry) => entry.path)).toEqual(['new.txt'])

    // The same path opens scope-specific contents through its scoped entry id.
    const stagedDiff = await service.openEntry(session.sessionId, staged[0].id, options)
    expect(stagedDiff.text?.leftText).toBe('base\n')
    expect(stagedDiff.text?.rightText).toBe('staged\n')

    const unstagedDiff = await service.openEntry(session.sessionId, unstaged[0].id, options)
    expect(unstagedDiff.text?.leftText).toBe('staged\n')
    expect(unstagedDiff.text?.rightText).toBe('worktree\n')

    const allEntry = all.find((entry) => entry.path === 'both.txt')
    const allDiff = await service.openEntry(session.sessionId, allEntry!.id, options)
    expect(allDiff.text?.leftText).toBe('base\n')
    expect(allDiff.text?.rightText).toBe('worktree\n')
  })

  it('refreshes a session idempotently after the working tree changed', async () => {
    const repoPath = await createRepo()
    await commitFile(repoPath, 'tracked.txt', 'base\n')

    const service = createService()
    const session = await service.create(gitWorkingTreeSource(repoPath), options)
    expect(session.entries).toEqual([])

    await writeFile(join(repoPath, 'tracked.txt'), 'changed\n')

    const refreshedOnce = await service.refresh(session.sessionId)
    const refreshedTwice = await service.refresh(session.sessionId)

    expect(refreshedOnce.sessionId).toBe(session.sessionId)
    expect(refreshedTwice.entries.map((entry) => entry.path)).toContain('tracked.txt')
    expect(refreshedTwice.entries).toEqual(refreshedOnce.entries)
  })

  it('rejects opening entries from a disposed session', async () => {
    const repoPath = await createRepo()
    await commitFile(repoPath, 'tracked.txt', 'base\n')
    await writeFile(join(repoPath, 'tracked.txt'), 'changed\n')

    const service = createService()
    const session = await service.create(gitWorkingTreeSource(repoPath), options)
    const entry = session.entries[0]
    expect(entry).toBeDefined()

    service.dispose(session.sessionId)

    expect(() => service.openEntry(session.sessionId, entry.id, options))
      .toThrow('Diff session was not found.')
  })
})

describe('github compare flow', () => {
  it('parses a PR URL into a source the session service accepts', async () => {
    const source = parseGithubPullRequestUrl('github.com/owner/repo/pull/12')
    expect(source).not.toBeNull()

    stubGithubFetch({
      files: [
        { filename: 'src/changed.ts', status: 'modified' },
        { filename: 'src/added.ts', status: 'added' },
        { filename: 'src/removed.ts', status: 'removed' },
        { filename: 'src/renamed.ts', status: 'renamed', previous_filename: 'src/old.ts' },
      ],
      contents: {
        'base:src/changed.ts': 'left\n',
        'head:src/changed.ts': 'right\n',
        'head:src/added.ts': 'added\n',
        'base:src/removed.ts': 'removed\n',
        'base:src/old.ts': 'same\n',
        'head:src/renamed.ts': 'same\n',
      },
    })

    const service = createService()
    const session = await service.create(source as DiffSource, options)

    expect(session.entries.map((entry) => entry.path)).toEqual([
      'src/changed.ts',
      'src/added.ts',
      'src/removed.ts',
      'src/renamed.ts',
    ])

    const byPath = new Map(session.entries.map((entry) => [entry.path, entry]))

    const modified = await service.openEntry(session.sessionId, byPath.get('src/changed.ts')!.id, options)
    expect(modified.text?.leftText).toBe('left\n')
    expect(modified.text?.rightText).toBe('right\n')

    const added = await service.openEntry(session.sessionId, byPath.get('src/added.ts')!.id, options)
    expect(added.summary).toBe('Only the right file exists.')
    expect(added.text?.rightText).toBe('added\n')

    const removed = await service.openEntry(session.sessionId, byPath.get('src/removed.ts')!.id, options)
    expect(removed.summary).toBe('Only the left file exists.')
    expect(removed.text?.leftText).toBe('removed\n')

    const renamedEntry = byPath.get('src/renamed.ts')!
    expect(renamedEntry.oldPath).toBe('src/old.ts')
    expect(renamedEntry.displayPath).toBe('src/old.ts -> src/renamed.ts')
    const renamed = await service.openEntry(session.sessionId, renamedEntry.id, options)
    expect(renamed.text?.leftText).toBe('same\n')
    expect(renamed.text?.rightText).toBe('same\n')
  })

  it('renders binary PR files as unsupported', async () => {
    stubGithubFetch({
      files: [{ filename: 'image.bin', status: 'modified' }],
      contents: {
        'base:image.bin': Uint8Array.from([0, 1, 2, 3]),
        'head:image.bin': Uint8Array.from([3, 2, 1, 0]),
      },
    })

    const service = createService()
    const session = await service.create(githubSource(), options)
    const diff = await service.openEntry(session.sessionId, session.entries[0].id, options)

    expect(diff.contentKind).toBe('unsupported')
    expect(diff.unsupported?.reason).toBe('binary')
  })

  it('surfaces rate-limit failures with a UI-ready message', async () => {
    vi.stubGlobal('fetch', async () => new Response('{}', {
      status: 403,
      headers: { 'x-ratelimit-remaining': '0' },
    }))

    const service = createService()

    await expect(service.create(githubSource(), options)).rejects.toThrow(
      'GitHub could not load this PR. It may be private or rate-limited.',
    )
  })

  it('surfaces missing PRs with a UI-ready message', async () => {
    vi.stubGlobal('fetch', async () => new Response('{}', { status: 404 }))

    const service = createService()

    await expect(service.create(githubSource(), options)).rejects.toThrow(
      'GitHub could not find this pull request. It may not exist or the repository may be private.',
    )
  })
})

interface GithubFetchStub {
  files: Array<Record<string, unknown>>
  contents: Record<string, string | Uint8Array>
}

// Minimal GitHub API double: pull metadata, files pages, and raw contents keyed
// by "<base|head>:<path>".
function stubGithubFetch(stub: GithubFetchStub) {
  const baseSha = 'b'.repeat(40)
  const headSha = 'h'.repeat(39) + 'a'

  vi.stubGlobal('fetch', async (input: RequestInfo | URL) => {
    const url = new URL(String(input))
    const pathname = decodeURIComponent(url.pathname)

    if (/\/repos\/[^/]+\/[^/]+\/pulls\/\d+$/.test(pathname)) {
      return jsonResponse({
        title: 'Smoke test PR',
        state: 'open',
        merged_at: null,
        html_url: 'https://github.com/owner/repo/pull/12',
        changed_files: stub.files.length,
        base: { ref: 'main', sha: baseSha },
        head: { ref: 'feature', sha: headSha },
      })
    }

    if (/\/repos\/[^/]+\/[^/]+\/pulls\/\d+\/files$/.test(pathname)) {
      const page = Number.parseInt(url.searchParams.get('page') ?? '1', 10)
      return jsonResponse(page === 1
        ? stub.files.map((file) => ({ additions: 1, deletions: 1, changes: 2, ...file }))
        : [])
    }

    const contentsMatch = /\/repos\/[^/]+\/[^/]+\/contents\/(.+)$/.exec(pathname)
    if (contentsMatch) {
      const ref = url.searchParams.get('ref')
      const side = ref === baseSha ? 'base' : 'head'
      const content = stub.contents[`${side}:${contentsMatch[1]}`]
      if (content === undefined) {
        return new Response('{}', { status: 404 })
      }

      const bytes = typeof content === 'string'
        ? new TextEncoder().encode(content)
        : content
      return new Response(Buffer.from(bytes), { status: 200 })
    }

    return new Response('{}', { status: 404 })
  })
}

function jsonResponse(payload: unknown) {
  return new Response(JSON.stringify(payload), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  })
}

function githubSource(): DiffSource {
  return {
    kind: 'githubPullRequest',
    owner: 'owner',
    repo: 'repo',
    pullNumber: 12,
    url: 'https://github.com/owner/repo/pull/12',
  }
}

function gitWorkingTreeSource(repoPath: string): DiffSource {
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

async function makeTempDir(prefix: string) {
  const path = await mkdtemp(join(tmpdir(), prefix))
  tempDirs.push(path)
  await mkdir(path, { recursive: true })
  return path
}

async function createRepo() {
  const repoPath = await makeTempDir('diffly-smoke-repo-')
  await git(repoPath, ['init', '-b', 'main'])
  await git(repoPath, ['config', 'user.email', 'test@example.com'])
  await git(repoPath, ['config', 'user.name', 'Test User'])
  return repoPath
}

async function commitFile(repoPath: string, relativePath: string, content: string) {
  await writeFile(join(repoPath, relativePath), content)
  await git(repoPath, ['add', relativePath])
  await git(repoPath, ['commit', '-m', `Commit ${relativePath}`])
}

async function git(repoPath: string, args: string[]) {
  await execFileAsync('git', args, {
    cwd: repoPath,
    windowsHide: true,
  })
}
