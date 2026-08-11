import { describe, expect, it } from 'vitest'
import {
  compareLoadingCopy,
  compareLoadingStageLabel,
} from './compare-loading-labels'

describe('compare loading labels', () => {
  it.each([
    ['git workingTree:all', 'Git', 'Loading working tree changes…'],
    ['git refRange', 'Git', 'Loading branch comparison…'],
    ['git commit', 'Git', 'Loading commit…'],
    ['githubPullRequest', 'GitHub', 'Loading pull request…'],
    ['githubCompare', 'GitHub', 'Loading branch comparison…'],
    ['githubCommit', 'GitHub', 'Loading commit…'],
    ['local directory', 'Local', 'Comparing folders…'],
    ['local file', 'Local', 'Comparing files…'],
  ])('maps %s without exposing its internal identifier', (label, context, title) => {
    expect(compareLoadingCopy(label)).toEqual({ context, title })
  })

  it('uses a stable user-facing fallback for profiling-only stages', () => {
    expect(compareLoadingStageLabel('first-pierre-parse-end')).toBe('Rendering diff')
    expect(compareLoadingStageLabel('future-internal-stage')).toBe('Preparing comparison')
  })
})
