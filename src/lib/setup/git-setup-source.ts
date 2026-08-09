import type { GitDiffSource, GitSelection } from '../types'

export function createWorkingTreeSource(
  repoPath: string,
  repositoryRoot: string,
  currentBranch: string | null,
): GitDiffSource {
  return {
    kind: 'git',
    repoPath,
    repositoryRoot,
    selection: {
      kind: 'workingTree',
      initialScope: 'all',
      currentBranch,
    },
  }
}

export function createAdvancedGitSource(
  repoPath: string,
  repositoryRoot: string,
  selection: GitSelection,
): GitDiffSource {
  return {
    kind: 'git',
    repoPath,
    repositoryRoot,
    selection,
  }
}
