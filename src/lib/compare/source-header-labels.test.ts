import { describe, expect, it } from 'vitest'
import type { GitDiffSource, GithubCompareSource, GithubPullRequestSource } from '../types'
import {
  gitCommandHint,
  gitLabel,
  gitSemantic,
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

describe('gitSemantic', () => {
  it('describes working tree compares as HEAD vs working tree', () => {
    expect(gitSemantic({ kind: 'workingTree', initialScope: 'all' })).toBe('HEAD ↔ Working Tree')
  })

  it('distinguishes two-dot from three-dot ranges', () => {
    expect(
      gitSemantic({ kind: 'refRange', baseRef: 'main', headRef: 'feature', notation: 'twoDot' }),
    ).toBe('Base ↔ Head')
    expect(
      gitSemantic({ kind: 'refRange', baseRef: 'main', headRef: 'feature', notation: 'threeDot' }),
    ).toBe('Merge-base ↔ Head')
  })

  it('describes single commits as parent vs commit', () => {
    expect(gitSemantic({ kind: 'commit', commitRef: 'abc1234' })).toBe('Parent ↔ Commit')
  })
})

describe('gitCommandHint', () => {
  it('maps working tree scopes to their git commands', () => {
    expect(gitCommandHint({ kind: 'workingTree', initialScope: 'all' })).toBe('git diff HEAD')
    expect(gitCommandHint({ kind: 'workingTree', initialScope: 'staged' })).toBe('git diff --cached')
    expect(gitCommandHint({ kind: 'workingTree', initialScope: 'unstaged' })).toBe('git diff')
    expect(gitCommandHint({ kind: 'workingTree', initialScope: 'untracked' })).toBe(
      'git ls-files --others',
    )
  })

  it('renders ref ranges with notation-specific dots', () => {
    expect(
      gitCommandHint({ kind: 'refRange', baseRef: 'main', headRef: 'feature', notation: 'twoDot' }),
    ).toBe('git diff main..feature')
    expect(
      gitCommandHint({ kind: 'refRange', baseRef: 'main', headRef: 'feature', notation: 'threeDot' }),
    ).toBe('git diff main...feature')
  })

  it('renders single commits as git show', () => {
    expect(gitCommandHint({ kind: 'commit', commitRef: 'abc1234' })).toBe('git show abc1234')
  })
})

describe('gitLabel', () => {
  it('renders working tree with the current branch and semantic', () => {
    const label = gitLabel(
      gitSource({ kind: 'workingTree', initialScope: 'all', currentBranch: 'main' }),
    )
    expect(label).toBe('Diffly • main • HEAD ↔ Working Tree')
  })

  it('omits the branch on detached HEAD / null branch', () => {
    expect(
      gitLabel(gitSource({ kind: 'workingTree', initialScope: 'all', currentBranch: null })),
    ).toBe('Diffly • HEAD ↔ Working Tree')
    expect(
      gitLabel(gitSource({ kind: 'workingTree', initialScope: 'staged' })),
    ).toBe('Diffly • HEAD ↔ Working Tree')
  })

  it('renders ref ranges with notation-specific dots and semantics', () => {
    expect(
      gitLabel(
        gitSource({ kind: 'refRange', baseRef: 'main', headRef: 'feature', notation: 'threeDot' }),
      ),
    ).toBe('Diffly • main...feature • Merge-base ↔ Head')
    expect(
      gitLabel(
        gitSource({ kind: 'refRange', baseRef: 'main', headRef: 'feature', notation: 'twoDot' }),
      ),
    ).toBe('Diffly • main..feature • Base ↔ Head')
  })

  it('renders commits with a shortened sha and semantic', () => {
    expect(
      gitLabel(gitSource({ kind: 'commit', commitRef: 'abc1234def5678901234567890123456789abcd0' })),
    ).toBe('Diffly • commit abc1234 • Parent ↔ Commit')
  })
})

describe('gitTooltip', () => {
  it('lists repository, branch, scope, source, and command for working tree', () => {
    expect(
      gitTooltip(gitSource({ kind: 'workingTree', initialScope: 'all', currentBranch: 'main' })),
    ).toBe(
      `Repository: ${ROOT}\nBranch: main\nScope: all\nSource: Working tree\nCommand: git diff HEAD`,
    )
  })

  it('omits the branch line when there is no branch', () => {
    expect(
      gitTooltip(gitSource({ kind: 'workingTree', initialScope: 'unstaged', currentBranch: null })),
    ).toBe(`Repository: ${ROOT}\nScope: unstaged\nSource: Working tree\nCommand: git diff`)
  })

  it('keeps the full commit ref in the tooltip even when the label is shortened', () => {
    const fullSha = 'abc1234def5678901234567890123456789abcd0'
    expect(gitTooltip(gitSource({ kind: 'commit', commitRef: fullSha }))).toBe(
      `Repository: ${ROOT}\nCommit: ${fullSha}\nCommand: git show ${fullSha}`,
    )
  })

  it('lists base, head, notation, and command for ref ranges', () => {
    expect(
      gitTooltip(
        gitSource({ kind: 'refRange', baseRef: 'main', headRef: 'feature', notation: 'threeDot' }),
      ),
    ).toBe(
      `Repository: ${ROOT}\nBase: main\nHead: feature\nNotation: threeDot\nCommand: git diff main...feature`,
    )
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
  const compare: GithubCompareSource = {
    kind: 'githubCompare',
    owner: 'octocat',
    repo: 'hello',
    baseRef: 'v1.0.0',
    headRef: 'feature/topic',
    notation: 'threeDot',
    url: 'https://github.com/octocat/hello/compare/v1.0.0...feature/topic',
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

  it('renders GitHub compare refs with notation-specific dots', () => {
    expect(githubLabel(compare)).toBe('octocat/hello v1.0.0...feature/topic')
    expect(githubLabel({ ...compare, notation: 'twoDot' })).toBe('octocat/hello v1.0.0..feature/topic')
  })

  it('uses the compare url in the tooltip when present', () => {
    expect(githubTooltip(compare)).toBe('https://github.com/octocat/hello/compare/v1.0.0...feature/topic')
  })
})
