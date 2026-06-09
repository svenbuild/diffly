import type { GitDiffSource, GithubPullRequestSource } from '../types'
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

export function gitLabel(source: GitDiffSource): string {
  const name = repoName(source.repositoryRoot)
  const selection = source.selection

  if (selection.kind === 'workingTree') {
    return selection.currentBranch
      ? `${name} • ${selection.currentBranch} • Working tree`
      : `${name} • Working tree`
  }

  if (selection.kind === 'refRange') {
    return `${name} • ${selection.baseRef}${notationDots(selection.notation)}${selection.headRef}`
  }

  return `${name} • commit ${shortSha(selection.commitRef)}`
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
    return lines.join('\n')
  }

  if (selection.kind === 'refRange') {
    return [
      `Repository: ${root}`,
      `Base: ${selection.baseRef}`,
      `Head: ${selection.headRef}`,
      `Notation: ${selection.notation}`,
    ].join('\n')
  }

  // Tooltip keeps the full commit ref, even when the label is shortened.
  return [`Repository: ${root}`, `Commit: ${selection.commitRef}`].join('\n')
}

export function githubLabel(source: GithubPullRequestSource): string {
  return `${source.owner}/${source.repo} #${source.pullNumber}`
}

export function githubTooltip(source: GithubPullRequestSource): string {
  return source.url || githubLabel(source)
}
