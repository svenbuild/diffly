import { describe, expect, it } from 'vitest'
import { parseGithubPullRequestUrl } from './github-url'

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
