import type { DiffSource } from '../types'

// Maps a compare source to the set of toolbar actions it supports. Kept
// Svelte-free so the per-source matrix can be unit-tested directly, and so the
// Compare View has a single source of truth for which buttons to render.

export interface OpenExternalAction {
  label: string
  ariaLabel: string
  url: string
}

export interface SourceActions {
  showSwap: boolean
  openExternal: OpenExternalAction | null
}

function isHttpUrl(url: string): boolean {
  return /^https?:\/\//i.test(url)
}

export function sourceActions(source: DiffSource | null): SourceActions {
  // Local: source is null (multi-pair fallback) or kind === 'local'. Swap only
  // ever makes sense here, since it swaps the local explorer panes.
  if (!source || source.kind === 'local') {
    return { showSwap: true, openExternal: null }
  }

  // Only a valid http(s) GitHub URL yields a button; file:/empty/broken -> none.
  if ((source.kind === 'githubPullRequest' || source.kind === 'githubCompare') && isHttpUrl(source.url)) {
    if (source.kind === 'githubCompare') {
      return {
        showSwap: false,
        openExternal: {
          label: 'Open Compare',
          ariaLabel: `Open compare ${source.baseRef}${source.notation === 'threeDot' ? '...' : '..'}${source.headRef} in browser`,
          url: source.url,
        },
      }
    }

    return {
      showSwap: false,
      openExternal: {
        label: 'Open PR',
        ariaLabel: `Open pull request #${source.pullNumber} in browser`,
        url: source.url,
      },
    }
  }

  // git (workingTree / refRange / commit) and GitHub sources without a valid URL.
  return { showSwap: false, openExternal: null }
}
