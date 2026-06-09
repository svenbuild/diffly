import type { DiffSource } from '../../../src/lib/types'

// Structural validation for DiffSource payloads crossing the IPC boundary.
// Renderer input is untrusted; anything that does not match a known source
// shape is rejected before it reaches providers or storage.

export function isDiffSourcePayload(value: unknown): value is DiffSource {
  if (!isRecord(value) || typeof value.kind !== 'string') {
    return false
  }

  switch (value.kind) {
    case 'local':
      return (
        typeof value.leftPath === 'string' &&
        typeof value.rightPath === 'string' &&
        (value.compareMode === 'file' || value.compareMode === 'directory')
      )
    case 'git':
      return (
        typeof value.repoPath === 'string' &&
        typeof value.repositoryRoot === 'string' &&
        isGitSelectionPayload(value.selection)
      )
    case 'githubPullRequest':
      return (
        typeof value.owner === 'string' &&
        typeof value.repo === 'string' &&
        typeof value.url === 'string' &&
        typeof value.pullNumber === 'number' &&
        Number.isInteger(value.pullNumber) &&
        value.pullNumber > 0
      )
    case 'githubCompare':
      return (
        typeof value.owner === 'string' &&
        typeof value.repo === 'string' &&
        typeof value.url === 'string' &&
        typeof value.baseRef === 'string' &&
        value.baseRef.trim() !== '' &&
        typeof value.headRef === 'string' &&
        value.headRef.trim() !== '' &&
        (value.notation === 'twoDot' || value.notation === 'threeDot')
      )
    default:
      return false
  }
}

export function isGitSelectionPayload(value: unknown): boolean {
  if (!isRecord(value) || typeof value.kind !== 'string') {
    return false
  }

  switch (value.kind) {
    case 'workingTree':
      return (
        value.initialScope === 'all' ||
        value.initialScope === 'staged' ||
        value.initialScope === 'unstaged' ||
        value.initialScope === 'untracked'
      )
    case 'refRange':
      return (
        typeof value.baseRef === 'string' &&
        typeof value.headRef === 'string' &&
        (value.notation === 'twoDot' || value.notation === 'threeDot')
      )
    case 'commit':
      return typeof value.commitRef === 'string'
    default:
      return false
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
