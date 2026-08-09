import { describe, expect, it } from 'vitest'
import { createAdvancedGitSource, createWorkingTreeSource } from './git-setup-source'

describe('Git setup sources', () => {
  it('always opens a normal repository selection with the complete working tree', () => {
    expect(createWorkingTreeSource('/repo', '/repo', 'main')).toEqual({
      kind: 'git',
      repoPath: '/repo',
      repositoryRoot: '/repo',
      selection: {
        kind: 'workingTree',
        initialScope: 'all',
        currentBranch: 'main',
      },
    })
  })

  it.each([
    ['PR style', 'threeDot'],
    ['Direct', 'twoDot'],
  ] as const)('keeps the %s comparison notation in advanced sources', (_label, notation) => {
    const source = createAdvancedGitSource('/repo', '/repo', {
      kind: 'refRange',
      baseRef: 'main',
      headRef: 'feature/setup',
      notation,
    })

    expect(source.selection).toEqual({
      kind: 'refRange',
      baseRef: 'main',
      headRef: 'feature/setup',
      notation,
    })
  })
})
