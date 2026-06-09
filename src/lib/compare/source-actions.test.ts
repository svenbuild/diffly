import { describe, expect, it } from 'vitest'
import type {
  GitDiffSource,
  GithubPullRequestSource,
  LocalDiffSource,
} from '../types'
import { sourceActions } from './source-actions'

const ROOT = 'D:\\Users\\me\\Projects\\Diffly'

function gitSource(selection: GitDiffSource['selection']): GitDiffSource {
  return { kind: 'git', repoPath: ROOT, repositoryRoot: ROOT, selection }
}

const localSource: LocalDiffSource = {
  kind: 'local',
  leftPath: 'a.txt',
  rightPath: 'b.txt',
  compareMode: 'file',
}

const pr: GithubPullRequestSource = {
  kind: 'githubPullRequest',
  owner: 'octocat',
  repo: 'hello',
  pullNumber: 123,
  url: 'https://github.com/octocat/hello/pull/123',
}

describe('sourceActions', () => {
  it('shows Swap and no external action for the null (multi-pair local) source', () => {
    expect(sourceActions(null)).toEqual({ showSwap: true, openExternal: null })
  })

  it('shows Swap and no external action for an explicit local source', () => {
    expect(sourceActions(localSource)).toEqual({ showSwap: true, openExternal: null })
  })

  it('hides Swap and external action for all git selection kinds', () => {
    const noActions = { showSwap: false, openExternal: null }
    expect(
      sourceActions(gitSource({ kind: 'workingTree', initialScope: 'all', currentBranch: 'main' })),
    ).toEqual(noActions)
    expect(
      sourceActions(gitSource({ kind: 'refRange', baseRef: 'main', headRef: 'feat', notation: 'twoDot' })),
    ).toEqual(noActions)
    expect(sourceActions(gitSource({ kind: 'commit', commitRef: 'abc1234' }))).toEqual(noActions)
  })

  it('offers Open PR (no Swap) for a GitHub PR with an http(s) url', () => {
    expect(sourceActions(pr)).toEqual({
      showSwap: false,
      openExternal: {
        label: 'Open PR',
        ariaLabel: 'Open pull request #123 in browser',
        url: 'https://github.com/octocat/hello/pull/123',
      },
    })
  })

  it('omits the external action for a PR with an empty, file:, or broken url', () => {
    expect(sourceActions({ ...pr, url: '' })).toEqual({ showSwap: false, openExternal: null })
    expect(sourceActions({ ...pr, url: 'file:///etc/passwd' })).toEqual({
      showSwap: false,
      openExternal: null,
    })
    expect(sourceActions({ ...pr, url: 'javascript:alert(1)' })).toEqual({
      showSwap: false,
      openExternal: null,
    })
  })
})
