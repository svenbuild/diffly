import { describe, expect, it } from 'vitest'
import type { GitDiffSource, GithubPullRequestSource } from '../types'
import {
  gitLabel,
  gitTooltip,
  githubLabel,
  githubTooltip,
  repoName,
  shortSha,
} from './source-header-labels'

const ROOT = 'D:\\Users\\me\\Projects\\Diffly'

function gitSource(selection: GitDiffSource['selection']): GitDiffSource {
  return { kind: 'git', repoPath: ROOT, repositoryRoot: ROOT, selection }
}

describe('repoName', () => {
  it('uses the last path segment', () => {
    expect(repoName(ROOT)).toBe('Diffly')
    expect(repoName('/home/me/repo')).toBe('repo')
  })

  it('falls back to a stable label when the root is empty', () => {
    expect(repoName('')).toBe('Repository')
  })
})

describe('shortSha', () => {
  it('shortens a full 40-char hex sha to 7 chars', () => {
    expect(shortSha('abc1234def5678901234567890123456789abcd0')).toBe('abc1234')
  })

  it('leaves branch names, tags, and short refs untouched', () => {
    expect(shortSha('main')).toBe('main')
    expect(shortSha('v1.2.3')).toBe('v1.2.3')
    expect(shortSha('abc1234')).toBe('abc1234')
  })
})

describe('gitLabel', () => {
  it('renders working tree with the current branch', () => {
    const label = gitLabel(
      gitSource({ kind: 'workingTree', initialScope: 'all', currentBranch: 'main' }),
    )
    expect(label).toBe('Diffly • main • Working tree')
  })

  it('omits the branch on detached HEAD / null branch', () => {
    expect(
      gitLabel(gitSource({ kind: 'workingTree', initialScope: 'all', currentBranch: null })),
    ).toBe('Diffly • Working tree')
    expect(
      gitLabel(gitSource({ kind: 'workingTree', initialScope: 'staged' })),
    ).toBe('Diffly • Working tree')
  })

  it('renders ref ranges with notation-specific dots', () => {
    expect(
      gitLabel(
        gitSource({ kind: 'refRange', baseRef: 'main', headRef: 'feature', notation: 'threeDot' }),
      ),
    ).toBe('Diffly • main...feature')
    expect(
      gitLabel(
        gitSource({ kind: 'refRange', baseRef: 'main', headRef: 'feature', notation: 'twoDot' }),
      ),
    ).toBe('Diffly • main..feature')
  })

  it('renders commits with a shortened sha', () => {
    expect(
      gitLabel(gitSource({ kind: 'commit', commitRef: 'abc1234def5678901234567890123456789abcd0' })),
    ).toBe('Diffly • commit abc1234')
  })
})

describe('gitTooltip', () => {
  it('lists repository, branch, scope, and source for working tree', () => {
    expect(
      gitTooltip(gitSource({ kind: 'workingTree', initialScope: 'all', currentBranch: 'main' })),
    ).toBe(`Repository: ${ROOT}\nBranch: main\nScope: all\nSource: Working tree`)
  })

  it('omits the branch line when there is no branch', () => {
    expect(
      gitTooltip(gitSource({ kind: 'workingTree', initialScope: 'unstaged', currentBranch: null })),
    ).toBe(`Repository: ${ROOT}\nScope: unstaged\nSource: Working tree`)
  })

  it('keeps the full commit ref in the tooltip even when the label is shortened', () => {
    const fullSha = 'abc1234def5678901234567890123456789abcd0'
    expect(gitTooltip(gitSource({ kind: 'commit', commitRef: fullSha }))).toBe(
      `Repository: ${ROOT}\nCommit: ${fullSha}`,
    )
  })

  it('lists base, head, and notation for ref ranges', () => {
    expect(
      gitTooltip(
        gitSource({ kind: 'refRange', baseRef: 'main', headRef: 'feature', notation: 'threeDot' }),
      ),
    ).toBe(`Repository: ${ROOT}\nBase: main\nHead: feature\nNotation: threeDot`)
  })
})

describe('github label and tooltip', () => {
  const pr: GithubPullRequestSource = {
    kind: 'githubPullRequest',
    owner: 'octocat',
    repo: 'hello',
    pullNumber: 123,
    url: 'https://github.com/octocat/hello/pull/123',
  }

  it('renders owner/repo #number', () => {
    expect(githubLabel(pr)).toBe('octocat/hello #123')
  })

  it('uses the url in the tooltip when present', () => {
    expect(githubTooltip(pr)).toBe('https://github.com/octocat/hello/pull/123')
  })

  it('falls back to the label when the url is empty', () => {
    expect(githubTooltip({ ...pr, url: '' })).toBe('octocat/hello #123')
  })
})
