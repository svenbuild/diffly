import type { GitDiffSource, GithubDiffSource, GitSelection, GitWorkingTreeScope } from '../types'
import { getFileName } from '../path-utils'

// Pure label/tooltip formatting for the Compare View source header. Kept
// Svelte-free so the per-mode formatting can be unit-tested directly.

const SHORT_SHA_LENGTH = 7
const FULL_SHA_PATTERN = /^[0-9a-f]{40}$/i

// Display name for a repository, derived from its root path. Never empty.
export function repoName(root: string): string {
  return getFileName(root) || root || 'Repository'
}

export function notationDots(notation: 'twoDot' | 'threeDot'): string {
  return notation === 'threeDot' ? '...' : '..'
}

// Shorten a full 40-char hex sha to its 7-char prefix for display. Branch
// names, tags, and already-short refs pass through untouched.
export function shortSha(ref: string): string {
  return FULL_SHA_PATTERN.test(ref) ? ref.slice(0, SHORT_SHA_LENGTH) : ref
}

// Human-readable left/right semantic for a Git selection, e.g.
// 'HEAD ↔ Working Tree'. Keeps two-dot and three-dot ranges distinguishable.
export function gitSemantic(selection: GitSelection): string {
  if (selection.kind === 'workingTree') {
    return 'HEAD ↔ Working Tree'
  }

  if (selection.kind === 'refRange') {
    return selection.notation === 'threeDot' ? 'Merge-base ↔ Head' : 'Base ↔ Head'
  }

  return 'Parent ↔ Commit'
}

const WORKING_TREE_SCOPE_COMMANDS: Record<GitWorkingTreeScope, string> = {
  all: 'git diff HEAD',
  staged: 'git diff --cached',
  unstaged: 'git diff',
  untracked: 'git ls-files --others',
}

// The git command equivalent to a selection. For working tree compares this
// reflects the initial scope (the compare view tabs can switch scope later).
export function gitCommandHint(selection: GitSelection): string {
  if (selection.kind === 'workingTree') {
    return WORKING_TREE_SCOPE_COMMANDS[selection.initialScope]
  }

  if (selection.kind === 'refRange') {
    return `git diff ${selection.baseRef}${notationDots(selection.notation)}${selection.headRef}`
  }

  return `git show ${selection.commitRef}`
}

export function gitLabel(source: GitDiffSource): string {
  const name = repoName(source.repositoryRoot)
  const selection = source.selection
  const semantic = gitSemantic(selection)

  if (selection.kind === 'workingTree') {
    return selection.currentBranch
      ? `${name} • ${selection.currentBranch} • ${semantic}`
      : `${name} • ${semantic}`
  }

  if (selection.kind === 'refRange') {
    return `${name} • ${selection.baseRef}${notationDots(selection.notation)}${selection.headRef} • ${semantic}`
  }

  return `${name} • commit ${shortSha(selection.commitRef)} • ${semantic}`
}

export function gitTooltip(source: GitDiffSource): string {
  const root = source.repositoryRoot
  const selection = source.selection

  if (selection.kind === 'workingTree') {
    const lines = [`Repository: ${root}`]
    if (selection.currentBranch) {
      lines.push(`Branch: ${selection.currentBranch}`)
    }
    lines.push(`Scope: ${selection.initialScope}`)
    lines.push('Source: Working tree')
    lines.push(`Command: ${gitCommandHint(selection)}`)
    return lines.join('\n')
  }

  if (selection.kind === 'refRange') {
    return [
      `Repository: ${root}`,
      `Base: ${selection.baseRef}`,
      `Head: ${selection.headRef}`,
      `Notation: ${selection.notation}`,
      `Command: ${gitCommandHint(selection)}`,
    ].join('\n')
  }

  // Tooltip keeps the full commit ref, even when the label is shortened.
  return [
    `Repository: ${root}`,
    `Commit: ${selection.commitRef}`,
    `Command: ${gitCommandHint(selection)}`,
  ].join('\n')
}

export function githubLabel(source: GithubDiffSource): string {
  if (source.kind === 'githubPullRequest') {
    return `${source.owner}/${source.repo} #${source.pullNumber}`
  }
  if (source.kind === 'githubCommit') {
    return `${source.owner}/${source.repo} commit ${shortSha(source.commitRef)}`
  }

  return `${source.owner}/${source.repo} ${source.baseRef}${notationDots(source.notation)}${source.headRef}`
}

export function githubTooltip(source: GithubDiffSource): string {
  return source.url || githubLabel(source)
}
