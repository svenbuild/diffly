<script lang="ts">
  import HunkReviewPanel from './HunkReviewPanel.svelte'
  import ReviewThreadsPanel from './ReviewThreadsPanel.svelte'

  export let sessionId: string
  export let entryId: string
  export let entryPath = ''
  export let sourceKind: 'local' | 'git'
  export let gitScope: 'all' | 'staged' | 'unstaged' | 'untracked' = 'all'
  export let onApplied: () => Promise<void> | void = () => {}
  export let onNavigateThread: (side: 'deletions' | 'additions', lineNumber: number) => Promise<void> | void = () => {}

  let tab: 'changes' | 'threads' = 'threads'
</script>

<aside class="review-workspace-panel" aria-label="Review workspace">
  <div class="tabs" role="tablist" aria-label="Review panel">
    <button class:active={tab === 'threads'} role="tab" aria-selected={tab === 'threads'} type="button" on:click={() => tab = 'threads'}>Threads</button>
    <button class:active={tab === 'changes'} role="tab" aria-selected={tab === 'changes'} type="button" on:click={() => tab = 'changes'}>Changes</button>
  </div>
  {#if tab === 'threads'}
    <ReviewThreadsPanel {sessionId} {entryId} {entryPath} onNavigate={onNavigateThread} />
  {:else}
    <HunkReviewPanel {sessionId} {entryId} {sourceKind} {gitScope} {onApplied} embedded />
  {/if}
</aside>

<style>
  .review-workspace-panel { grid-row: 1; min-width: 0; min-height: 0; display: grid; grid-template-rows: auto minmax(0, 1fr); border-left: 1px solid var(--border-color); background: var(--panel-surface); }
  .tabs { display: grid; grid-template-columns: 1fr 1fr; border-bottom: 1px solid var(--border-color); }
  .tabs button { min-height: 30px; border: 0; border-radius: 0; border-bottom: 2px solid transparent; background: transparent; color: var(--muted-text); }
  .tabs button.active { border-bottom-color: var(--accent); color: var(--text-color); }
</style>
