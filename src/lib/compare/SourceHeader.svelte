<script lang="ts">
  import type { DiffSource } from '../types'
  import {
    gitLabel,
    gitTooltip,
    githubLabel,
    githubTooltip,
  } from './source-header-labels'

  // The active compare source. null for local compares, where we fall back to
  // the multi-pair-aware labels App already derives (single source of truth).
  export let source: DiffSource | null = null
  export let localLabel = ''
  export let localTooltip = ''

  $: label =
    source?.kind === 'git'
      ? gitLabel(source)
      : source?.kind === 'githubPullRequest'
        ? githubLabel(source)
        : localLabel

  $: title =
    source?.kind === 'git'
      ? gitTooltip(source)
      : source?.kind === 'githubPullRequest'
        ? githubTooltip(source)
        : localTooltip
</script>

<span class="source-header" {title}>{label}</span>
