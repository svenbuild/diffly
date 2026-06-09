import { describe, expect, it } from 'vitest'
import { parseGithubDiffUrl, parseGithubPullRequestUrl } from './github-url'

describe('parseGithubPullRequestUrl', () => {
  it('parses standard pull request URLs', () => {
    expect(parseGithubPullRequestUrl('https://github.com/owner/repo/pull/123')).toEqual({
      kind: 'githubPullRequest',
      owner: 'owner',
      repo: 'repo',
      pullNumber: 123,
      url: 'https://github.com/owner/repo/pull/123',
    })
  })

  it('parses www and scheme-less URLs to the canonical form', () => {
    const expected = {
      kind: 'githubPullRequest',
      owner: 'owner',
      repo: 'repo',
      pullNumber: 123,
      url: 'https://github.com/owner/repo/pull/123',
    }

    expect(parseGithubPullRequestUrl('https://www.github.com/owner/repo/pull/123')).toEqual(expected)
    expect(parseGithubPullRequestUrl('github.com/owner/repo/pull/123')).toEqual(expected)
    expect(parseGithubPullRequestUrl('www.github.com/owner/repo/pull/123')).toEqual(expected)
  })

  it('accepts trailing slashes, sub-pages, query strings, and fragments', () => {
    expect(parseGithubPullRequestUrl('https://github.com/owner/repo/pull/9/')?.pullNumber).toBe(9)
    expect(parseGithubPullRequestUrl('https://github.com/owner/repo/pull/9/files')?.pullNumber).toBe(9)
    expect(parseGithubPullRequestUrl('https://github.com/owner/repo/pull/9?diff=split')?.pullNumber).toBe(9)
    expect(parseGithubPullRequestUrl('https://github.com/owner/repo/pull/9#discussion')?.pullNumber).toBe(9)
  })

  it('accepts raw pull request diff and patch URLs', () => {
    expect(parseGithubPullRequestUrl('https://github.com/owner/repo/pull/9.diff')?.pullNumber).toBe(9)
    expect(parseGithubPullRequestUrl('https://github.com/owner/repo/pull/9.patch')?.pullNumber).toBe(9)
  })

  it('normalizes repository names with dots, dashes, and .git suffixes', () => {
    expect(parseGithubPullRequestUrl('github.com/my-org/my.repo-name/pull/4')?.repo).toBe('my.repo-name')
    expect(parseGithubPullRequestUrl('github.com/my-org/repo.git/pull/4')?.repo).toBe('repo')
  })

  it('preserves untrimmed surrounding whitespace input', () => {
    expect(parseGithubPullRequestUrl('  https://github.com/owner/repo/pull/5  ')?.pullNumber).toBe(5)
  })

  it('rejects non-GitHub domains', () => {
    expect(parseGithubPullRequestUrl('https://gitlab.com/owner/repo/pull/123')).toBeNull()
    expect(parseGithubPullRequestUrl('https://github.com.evil.com/owner/repo/pull/123')).toBeNull()
    expect(parseGithubPullRequestUrl('https://evilgithub.com/owner/repo/pull/123')).toBeNull()
    expect(parseGithubPullRequestUrl('https://github.com:8443/owner/repo/pull/123')).toBeNull()
  })

  it('rejects non-pull-request and malformed inputs', () => {
    expect(parseGithubPullRequestUrl('')).toBeNull()
    expect(parseGithubPullRequestUrl('not a url')).toBeNull()
    expect(parseGithubPullRequestUrl('https://github.com/owner/repo')).toBeNull()
    expect(parseGithubPullRequestUrl('https://github.com/owner/repo/issues/12')).toBeNull()
    expect(parseGithubPullRequestUrl('https://github.com/owner/repo/pull/abc')).toBeNull()
    expect(parseGithubPullRequestUrl('https://github.com/owner/repo/pull/0')).toBeNull()
    expect(parseGithubPullRequestUrl('ftp://github.com/owner/repo/pull/12')).toBeNull()
    expect(parseGithubPullRequestUrl('https://github.com/owner/.git/pull/12')).toBeNull()
  })
})

describe('parseGithubDiffUrl', () => {
  it('parses three-dot compare URLs', () => {
    expect(parseGithubDiffUrl('https://github.com/torvalds/linux/compare/v6.9...v7.1-rc7')).toEqual({
      kind: 'githubCompare',
      owner: 'torvalds',
      repo: 'linux',
      baseRef: 'v6.9',
      headRef: 'v7.1-rc7',
      notation: 'threeDot',
      url: 'https://github.com/torvalds/linux/compare/v6.9...v7.1-rc7',
    })
  })

  it('parses two-dot compare URLs', () => {
    expect(parseGithubDiffUrl('github.com/owner/repo/compare/f75c570..3391dcc')).toEqual({
      kind: 'githubCompare',
      owner: 'owner',
      repo: 'repo',
      baseRef: 'f75c570',
      headRef: '3391dcc',
      notation: 'twoDot',
      url: 'https://github.com/owner/repo/compare/f75c570..3391dcc',
    })
  })

  it('parses compare URLs for forks and branch names with slashes', () => {
    const source = parseGithubDiffUrl('https://github.com/octocat/linguist/compare/master...octocat:feature/topic')
    expect(source).toMatchObject({
      kind: 'githubCompare',
      owner: 'octocat',
      repo: 'linguist',
      baseRef: 'master',
      headRef: 'octocat:feature/topic',
      notation: 'threeDot',
    })
  })

  it('parses compare URLs with explicit fork repository notation', () => {
    const source = parseGithubDiffUrl('https://github.com/octocat/awesome-app/compare/octocat:main...octo-org:awesome-app:main')
    expect(source).toMatchObject({
      kind: 'githubCompare',
      owner: 'octocat',
      repo: 'awesome-app',
      baseRef: 'octocat:main',
      headRef: 'octo-org:awesome-app:main',
    })
  })

  it('accepts raw compare diff and patch URLs', () => {
    expect(parseGithubDiffUrl('https://github.com/owner/repo/compare/base...head.diff')).toMatchObject({
      kind: 'githubCompare',
      baseRef: 'base',
      headRef: 'head',
    })
    expect(parseGithubDiffUrl('https://github.com/owner/repo/compare/base...head.patch')).toMatchObject({
      kind: 'githubCompare',
      baseRef: 'base',
      headRef: 'head',
    })
  })

  it('still rejects unsupported GitHub URLs', () => {
    expect(parseGithubDiffUrl('https://github.com/owner/repo/compare/base')).toBeNull()
    expect(parseGithubDiffUrl('https://github.com/owner/repo/commits/main')).toBeNull()
  })
})
