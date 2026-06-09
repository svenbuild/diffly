<script lang="ts">
  import type { GitWorkingTreeScope } from '../types'

  let {
    scope,
    counts,
    onSelect,
    disabled = false,
  }: {
    scope: GitWorkingTreeScope
    counts: Record<GitWorkingTreeScope, number>
    onSelect: (scope: GitWorkingTreeScope) => void
    disabled?: boolean
  } = $props()

  const options: Array<{ value: GitWorkingTreeScope; label: string }> = [
    { value: 'all', label: 'All' },
    { value: 'staged', label: 'Staged' },
    { value: 'unstaged', label: 'Unstaged' },
    { value: 'untracked', label: 'Untracked' },
  ]
</script>

<div
  class="segmented-control toolbar-segmented-control git-scope-tabs"
  role="group"
  aria-label="Git scope"
>
  {#each options as option (option.value)}
    <button
      type="button"
      aria-pressed={scope === option.value}
      class:active={scope === option.value}
      {disabled}
      title={`Show ${option.label.toLowerCase()} changes`}
      onclick={() => onSelect(option.value)}
    >
      <span>{option.label}</span>
      <span class="git-scope-count">{counts[option.value]}</span>
    </button>
  {/each}
</div>

<style>
  .git-scope-tabs {
    flex: 0 0 auto;
  }

  .git-scope-tabs button {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    white-space: nowrap;
  }

  .git-scope-count {
    min-width: 16px;
    padding: 0 4px;
    border-radius: 999px;
    background: color-mix(in srgb, var(--border) 55%, transparent);
    color: var(--secondary-text);
    font-size: 10px;
    font-variant-numeric: tabular-nums;
    line-height: 15px;
    text-align: center;
  }

  .git-scope-tabs button.active .git-scope-count {
    background: color-mix(in srgb, var(--accent) 22%, transparent);
    color: var(--text);
  }
</style>
