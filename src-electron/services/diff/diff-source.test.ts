import { describe, expect, it } from 'vitest'
import type { DiffSource } from '../../../src/lib/types'
import { isDiffSourcePayload, isGitSelectionPayload } from './diff-source'

describe('isDiffSourcePayload', () => {
  it('accepts every DiffSource variant after a JSON round trip', () => {
    const sources: DiffSource[] = [
      {
        kind: 'local',
        leftPath: 'C:/left',
        rightPath: 'C:/right',
        compareMode: 'directory',
      },
      {
        kind: 'git',
        repoPath: 'C:/repo/sub',
        repositoryRoot: 'C:/repo',
        selection: { kind: 'workingTree', initialScope: 'staged' },
      },
      {
        kind: 'git',
        repoPath: 'C:/repo',
        repositoryRoot: 'C:/repo',
        selection: {
          kind: 'refRange',
          baseRef: 'main',
          headRef: 'feature/topic',
          notation: 'threeDot',
        },
      },
      {
        kind: 'git',
        repoPath: 'C:/repo',
        repositoryRoot: 'C:/repo',
        selection: { kind: 'commit', commitRef: 'HEAD~1' },
      },
      {
        kind: 'githubPullRequest',
        owner: 'owner',
        repo: 'repo',
        pullNumber: 123,
        url: 'https://github.com/owner/repo/pull/123',
      },
      {
        kind: 'githubCompare',
        owner: 'owner',
        repo: 'repo',
        baseRef: 'v1.0.0',
        headRef: 'v1.1.0',
        notation: 'threeDot',
        url: 'https://github.com/owner/repo/compare/v1.0.0...v1.1.0',
      },
    ]

    for (const source of sources) {
      expect(isDiffSourcePayload(JSON.parse(JSON.stringify(source)))).toBe(true)
    }
  })

  it('rejects unknown kinds and malformed payloads', () => {
    expect(isDiffSourcePayload(null)).toBe(false)
    expect(isDiffSourcePayload('local')).toBe(false)
    expect(isDiffSourcePayload({})).toBe(false)
    expect(isDiffSourcePayload({ kind: 'ftp' })).toBe(false)
    expect(isDiffSourcePayload({ kind: 'local', leftPath: 'a' })).toBe(false)
    expect(isDiffSourcePayload({
      kind: 'local',
      leftPath: 'a',
      rightPath: 'b',
      compareMode: 'archive',
    })).toBe(false)
    expect(isDiffSourcePayload({
      kind: 'git',
      repoPath: 'C:/repo',
      repositoryRoot: 'C:/repo',
      selection: { kind: 'workingTree', initialScope: 'everything' },
    })).toBe(false)
    expect(isDiffSourcePayload({
      kind: 'githubPullRequest',
      owner: 'owner',
      repo: 'repo',
      pullNumber: 0,
      url: 'https://github.com/owner/repo/pull/0',
    })).toBe(false)
    expect(isDiffSourcePayload({
      kind: 'githubPullRequest',
      owner: 'owner',
      repo: 'repo',
      pullNumber: 1.5,
      url: 'https://github.com/owner/repo/pull/1',
    })).toBe(false)
    expect(isDiffSourcePayload({
      kind: 'githubCompare',
      owner: 'owner',
      repo: 'repo',
      baseRef: '',
      headRef: 'head',
      notation: 'threeDot',
      url: 'https://github.com/owner/repo/compare/base...head',
    })).toBe(false)
    expect(isDiffSourcePayload({
      kind: 'githubCompare',
      owner: 'owner',
      repo: 'repo',
      baseRef: 'base',
      headRef: 'head',
      notation: 'fourDot',
      url: 'https://github.com/owner/repo/compare/base...head',
    })).toBe(false)
  })
})

describe('isGitSelectionPayload', () => {
  it('validates each selection kind', () => {
    expect(isGitSelectionPayload({ kind: 'workingTree', initialScope: 'all' })).toBe(true)
    expect(isGitSelectionPayload({
      kind: 'refRange',
      baseRef: 'main',
      headRef: 'dev',
      notation: 'twoDot',
    })).toBe(true)
    expect(isGitSelectionPayload({ kind: 'commit', commitRef: 'abc1234' })).toBe(true)

    expect(isGitSelectionPayload(null)).toBe(false)
    expect(isGitSelectionPayload({ kind: 'refRange', baseRef: 'main', headRef: 'dev', notation: 'fourDot' })).toBe(false)
    expect(isGitSelectionPayload({ kind: 'commit' })).toBe(false)
  })
})
