import { describe, expect, it, vi } from 'vitest'
import type { DiffSource, DirectoryEntryResult } from '../types'
import {
  compareSourceKind,
  listVisibleCompareActions,
  resolveEntryAbsolutePath,
  type CompareActionContext,
  type CompareSourceKind,
} from './compare-actions'

function entry(overrides: Partial<DirectoryEntryResult> = {}): DirectoryEntryResult {
  return {
    relativePath: 'src/app.ts',
    status: 'modified',
    leftPath: 'C:\\left\\src\\app.ts',
    rightPath: 'C:\\right\\src\\app.ts',
    leftSize: 10,
    rightSize: 12,
    ...overrides,
  }
}

function context(overrides: Partial<CompareActionContext> = {}): CompareActionContext {
  return {
    sourceKind: 'local',
    entryKind: 'file',
    relativePath: 'src/app.ts',
    entry: entry(),
    absolutePath: 'C:\\right\\src\\app.ts',
    directoryExpanded: null,
    copyText: vi.fn(),
    openPath: vi.fn(),
    revealPath: vi.fn(),
    toggleDirectoryExpanded: null,
    ...overrides,
  }
}

function visibleIds(overrides: Partial<CompareActionContext> = {}) {
  return listVisibleCompareActions(context(overrides)).map((item) => item.action.id)
}

const localSource: DiffSource = {
  kind: 'local',
  leftPath: 'C:\\left',
  rightPath: 'C:\\right',
  compareMode: 'directory',
}

function gitSource(selection: Extract<DiffSource, { kind: 'git' }>['selection']): DiffSource {
  return {
    kind: 'git',
    repoPath: 'C:\\repo',
    repositoryRoot: 'C:\\repo',
    selection,
  }
}

const githubPullRequestSource: DiffSource = {
  kind: 'githubPullRequest',
  owner: 'octo',
  repo: 'diffly',
  pullNumber: 7,
  url: 'https://github.com/octo/diffly/pull/7',
}

describe('compareSourceKind', () => {
  it('treats null (legacy local compare) and local sources as local', () => {
    expect(compareSourceKind(null)).toBe('local')
    expect(compareSourceKind(localSource)).toBe('local')
  })

  it('maps git selections onto their gating kinds', () => {
    expect(
      compareSourceKind(gitSource({ kind: 'workingTree', initialScope: 'all' })),
    ).toBe('gitWorkingTree')
    expect(
      compareSourceKind(
        gitSource({ kind: 'refRange', baseRef: 'main', headRef: 'dev', notation: 'twoDot' }),
      ),
    ).toBe('gitRefRange')
    expect(compareSourceKind(gitSource({ kind: 'commit', commitRef: 'abc123' }))).toBe('gitCommit')
  })

  it('maps github sources onto github', () => {
    expect(compareSourceKind(githubPullRequestSource)).toBe('github')
    expect(
      compareSourceKind({
        kind: 'githubCompare',
        owner: 'octo',
        repo: 'diffly',
        baseRef: 'main',
        headRef: 'dev',
        notation: 'threeDot',
        url: 'https://github.com/octo/diffly/compare/main...dev',
      }),
    ).toBe('github')
    expect(
      compareSourceKind({
        kind: 'githubCommit',
        owner: 'octo',
        repo: 'diffly',
        commitRef: '5550b7b5faed07f7e6ae357d60c51ac055c8b46c',
        url: 'https://github.com/octo/diffly/commit/5550b7b5faed07f7e6ae357d60c51ac055c8b46c',
      }),
    ).toBe('github')
  })
})

describe('resolveEntryAbsolutePath', () => {
  it('returns the right side path for local compares, falling back to left', () => {
    expect(resolveEntryAbsolutePath(localSource, entry())).toBe('C:\\right\\src\\app.ts')
    expect(resolveEntryAbsolutePath(null, entry({ rightPath: null }))).toBe(
      'C:\\left\\src\\app.ts',
    )
  })

  it('joins git working-tree entries onto the repository root', () => {
    const source = gitSource({ kind: 'workingTree', initialScope: 'all' })
    const result = resolveEntryAbsolutePath(
      source,
      entry({ leftPath: 'src/app.ts', rightPath: 'src/app.ts' }),
    )
    expect(result).toBe('C:\\repo\\src\\app.ts')
  })

  it('uses forward slashes when the repository root does', () => {
    const source: DiffSource = {
      kind: 'git',
      repoPath: '/repo',
      repositoryRoot: '/repo/',
      selection: { kind: 'workingTree', initialScope: 'all' },
    }
    expect(
      resolveEntryAbsolutePath(source, entry({ leftPath: 'src/app.ts', rightPath: 'src/app.ts' })),
    ).toBe('/repo/src/app.ts')
  })

  it('never resolves paths for ref-range, commit, or github sources', () => {
    const fileEntry = entry({ leftPath: 'src/app.ts', rightPath: 'src/app.ts' })
    expect(
      resolveEntryAbsolutePath(
        gitSource({ kind: 'refRange', baseRef: 'main', headRef: 'dev', notation: 'twoDot' }),
        fileEntry,
      ),
    ).toBeNull()
    expect(
      resolveEntryAbsolutePath(gitSource({ kind: 'commit', commitRef: 'abc123' }), fileEntry),
    ).toBeNull()
    expect(resolveEntryAbsolutePath(githubPullRequestSource, fileEntry)).toBeNull()
  })

  it('returns null without an entry or without any side path', () => {
    expect(resolveEntryAbsolutePath(localSource, null)).toBeNull()
    expect(
      resolveEntryAbsolutePath(localSource, entry({ leftPath: null, rightPath: null })),
    ).toBeNull()
  })
})

describe('listVisibleCompareActions gating matrix', () => {
  it('local file rows expose open, reveal, and both copy actions', () => {
    expect(visibleIds({ sourceKind: 'local' })).toEqual([
      'openFile',
      'revealInExplorer',
      'copyRelativePath',
      'copyAbsolutePath',
    ])
  })

  it('git working-tree file rows gate exactly like local rows', () => {
    expect(visibleIds({ sourceKind: 'gitWorkingTree' })).toEqual([
      'openFile',
      'revealInExplorer',
      'copyRelativePath',
      'copyAbsolutePath',
    ])
  })

  it.each<CompareSourceKind>(['gitRefRange', 'gitCommit', 'github'])(
    '%s file rows only expose copyRelativePath',
    (sourceKind) => {
      expect(visibleIds({ sourceKind, absolutePath: null })).toEqual(['copyRelativePath'])
    },
  )

  it('directory rows expose copyRelativePath plus expand or collapse', () => {
    const base: Partial<CompareActionContext> = {
      entryKind: 'directory',
      entry: null,
      absolutePath: null,
      relativePath: 'src',
      toggleDirectoryExpanded: vi.fn(),
    }
    expect(visibleIds({ ...base, directoryExpanded: false })).toEqual([
      'copyRelativePath',
      'expandDirectory',
    ])
    expect(visibleIds({ ...base, directoryExpanded: true })).toEqual([
      'copyRelativePath',
      'collapseDirectory',
    ])
  })

  it('disables open and reveal when the shell bridge is unavailable', () => {
    const items = listVisibleCompareActions(
      context({ openPath: null, revealPath: null }),
    )
    const byId = new Map(items.map((item) => [item.action.id, item.enabled]))
    expect(byId.get('openFile')).toBe(false)
    expect(byId.get('revealInExplorer')).toBe(false)
    expect(byId.get('copyAbsolutePath')).toBe(true)
  })

  it('disables path actions when no absolute path resolves', () => {
    const items = listVisibleCompareActions(context({ absolutePath: null }))
    const byId = new Map(items.map((item) => [item.action.id, item.enabled]))
    expect(byId.get('openFile')).toBe(false)
    expect(byId.get('revealInExplorer')).toBe(false)
    expect(byId.get('copyAbsolutePath')).toBe(false)
    expect(byId.get('copyRelativePath')).toBe(true)
  })

  it('disables copy actions when the clipboard is unavailable', () => {
    const items = listVisibleCompareActions(context({ copyText: null }))
    const byId = new Map(items.map((item) => [item.action.id, item.enabled]))
    expect(byId.get('copyRelativePath')).toBe(false)
    expect(byId.get('copyAbsolutePath')).toBe(false)
    expect(byId.get('openFile')).toBe(true)
  })

  it('runs actions against the context callbacks', async () => {
    const openPath = vi.fn().mockResolvedValue(undefined)
    const copyText = vi.fn().mockResolvedValue(undefined)
    const ctx = context({ openPath, copyText })
    const items = listVisibleCompareActions(ctx)

    await items.find((item) => item.action.id === 'openFile')?.action.run(ctx)
    expect(openPath).toHaveBeenCalledWith('C:\\right\\src\\app.ts')

    await items.find((item) => item.action.id === 'copyRelativePath')?.action.run(ctx)
    expect(copyText).toHaveBeenCalledWith('src/app.ts')

    await items.find((item) => item.action.id === 'copyAbsolutePath')?.action.run(ctx)
    expect(copyText).toHaveBeenCalledWith('C:\\right\\src\\app.ts')
  })
})
