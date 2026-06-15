import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
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
import type { DiffSource } from '../../src/lib/types'

let userDataPath = ''

vi.mock('electron', () => ({
  app: {
    getPath: (name: string) => {
      if (name !== 'userData') {
        throw new Error(`Unexpected app.getPath(${name}) in test.`)
      }
      return userDataPath
    },
  },
}))

import {
  addRecentSource,
  loadRecentSources,
  removeRecentSource,
} from './recents-store'

describe('recents-store', () => {
  beforeEach(async () => {
    userDataPath = await mkdtemp(join(tmpdir(), 'diffly-recents-'))
  })

  afterEach(async () => {
    await rm(userDataPath, {
      recursive: true,
      force: true,
      maxRetries: 10,
      retryDelay: 100,
    })
  })

  it('returns defaults when no recents file exists', async () => {
    const recents = await loadRecentSources()

    expect(recents.gitRepositories).toEqual([])
    expect(recents.githubPullRequests).toEqual([])
    expect(recents.githubCompares).toEqual([])
    expect(recents.localTargets).toEqual([])
  })

  it('returns defaults instead of crashing on a corrupted recents file', async () => {
    await writeFile(join(userDataPath, 'recent-sources.json'), '{not json', 'utf8')

    const recents = await loadRecentSources()

    expect(recents.gitRepositories).toEqual([])
    expect(recents.githubPullRequests).toEqual([])
  })

  it('persists git repositories across loads and moves reused repos to the top', async () => {
    await addRecentSource(gitSource('C:/repos/alpha'))
    await addRecentSource(gitSource('C:/repos/beta'))
    await addRecentSource(gitSource('C:/repos/alpha'))

    const recents = await loadRecentSources()

    expect(recents.gitRepositories).toHaveLength(2)
    expect(recents.gitRepositories[0]?.name).toBe('alpha')
    expect(recents.gitRepositories[1]?.name).toBe('beta')
  })

  it('dedupes git repositories by repository root regardless of input subfolder', async () => {
    await addRecentSource(gitSource('C:/repos/alpha', 'C:/repos/alpha/src'))
    await addRecentSource(gitSource('C:/repos/alpha', 'C:/repos/alpha'))

    const recents = await loadRecentSources()

    expect(recents.gitRepositories).toHaveLength(1)
    expect(recents.gitRepositories[0]?.repoPath.replaceAll('\\', '/')).toBe('C:/repos/alpha')
  })

  it('dedupes GitHub pull requests by owner, repo, and number and keeps titles', async () => {
    await addRecentSource(githubSource(12), { title: 'First title' })
    await addRecentSource(githubSource(12))

    const recents = await loadRecentSources()

    expect(recents.githubPullRequests).toHaveLength(1)
    expect(recents.githubPullRequests[0]?.title).toBe('First title')
  })

  it('dedupes GitHub compares by owner, repo, refs, and notation', async () => {
    await addRecentSource(githubCompareSource('main', 'dev'))
    await addRecentSource(githubCompareSource('main', 'dev'))
    await addRecentSource(githubCompareSource('main', 'feature/topic'))

    const recents = await loadRecentSources()

    expect(recents.githubCompares).toHaveLength(2)
    expect(recents.githubCompares[0]?.headRef).toBe('feature/topic')
    expect(recents.githubCompares[1]?.headRef).toBe('dev')
  })

  it('persists GitHub compares across loads and removes them by id', async () => {
    const withCompare = await addRecentSource(githubCompareSource('v1.0', 'v2.0'))
    const compareId = withCompare.githubCompares[0]?.id ?? ''

    const loaded = await loadRecentSources()
    expect(loaded.githubCompares).toHaveLength(1)
    expect(loaded.githubCompares[0]?.baseRef).toBe('v1.0')
    expect(loaded.githubCompares[0]?.notation).toBe('threeDot')

    const recents = await removeRecentSource(compareId)
    expect(recents.githubCompares).toEqual([])
  })

  it('caps git repositories and pull requests at 20 entries', async () => {
    for (let index = 0; index < 25; index += 1) {
      await addRecentSource(gitSource(`C:/repos/repo-${index}`))
      await addRecentSource(githubSource(index + 1))
    }

    const recents = await loadRecentSources()

    expect(recents.gitRepositories).toHaveLength(20)
    expect(recents.githubPullRequests).toHaveLength(20)
    expect(recents.gitRepositories[0]?.name).toBe('repo-24')
    expect(recents.githubPullRequests[0]?.pullNumber).toBe(25)
  }, 15000)

  it('removes entries by id', async () => {
    await addRecentSource(gitSource('C:/repos/alpha'))
    const withPr = await addRecentSource(githubSource(7))
    const prId = withPr.githubPullRequests[0]?.id ?? ''

    const recents = await removeRecentSource(prId)

    expect(recents.githubPullRequests).toEqual([])
    expect(recents.gitRepositories).toHaveLength(1)
  })

  it('writes a recents file that survives a JSON round trip', async () => {
    await addRecentSource(githubSource(3), { title: 'Round trip' })

    const raw = await readFile(join(userDataPath, 'recent-sources.json'), 'utf8')
    const parsed = JSON.parse(raw)

    expect(parsed.githubPullRequests[0].pullNumber).toBe(3)
    expect(parsed.githubPullRequests[0].title).toBe('Round trip')
  })
})

function gitSource(repositoryRoot: string, repoPath = repositoryRoot): DiffSource {
  return {
    kind: 'git',
    repoPath,
    repositoryRoot,
    selection: {
      kind: 'workingTree',
      initialScope: 'all',
    },
  }
}

function githubCompareSource(baseRef: string, headRef: string): DiffSource {
  return {
    kind: 'githubCompare',
    owner: 'owner',
    repo: 'repo',
    baseRef,
    headRef,
    notation: 'threeDot',
    url: `https://github.com/owner/repo/compare/${baseRef}...${headRef}`,
  }
}

function githubSource(pullNumber: number): DiffSource {
  return {
    kind: 'githubPullRequest',
    owner: 'owner',
    repo: 'repo',
    pullNumber,
    url: `https://github.com/owner/repo/pull/${pullNumber}`,
  }
}
