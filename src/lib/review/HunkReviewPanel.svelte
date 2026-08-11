<script lang="ts">
  import { onMount } from 'svelte'
  import type { PartialChangeOperation, ReviewHunkSummary } from '../review-types'
  import { hunkResolution, hunkSelectionKey } from './hunk-resolution-store'
  import { workspaceHunkController } from './hunk-controller'

  export let sessionId: string
  export let entryId: string
  export let sourceKind: 'local' | 'git'
  export let gitScope: 'all' | 'staged' | 'unstaged' | 'untracked' = 'all'
  export let onApplied: () => Promise<void> | void = () => {}

  $: hunks = $hunkResolution.hunksByEntry.get(entryId) ?? []
  $: plannedCount = Array.from($hunkResolution.planned.values()).filter((item) => item.entryId === entryId).length

  onMount(() => void workspaceHunkController.load(sessionId, entryId))
  $: if (!$hunkResolution.hunksByEntry.has(entryId) && $hunkResolution.loadingEntryId !== entryId) {
    void workspaceHunkController.load(sessionId, entryId)
  }

  function operations(): Array<{ operation: PartialChangeOperation; label: string }> {
    if (sourceKind === 'local') return [
      { operation: 'applyRightToLeft', label: '← Keep right' },
      { operation: 'applyLeftToRight', label: 'Keep left →' },
    ]
    if (gitScope === 'staged') return [{ operation: 'unstage', label: 'Unstage' }]
    if (gitScope === 'unstaged') return [
      { operation: 'stage', label: 'Stage' },
      { operation: 'discard', label: 'Discard' },
    ]
    return []
  }

  function isPlanned(hunk: ReviewHunkSummary, operation: PartialChangeOperation, changeIndex?: number) {
    return $hunkResolution.planned.get(hunkSelectionKey(entryId, {
      fingerprint: hunk.fingerprint,
      changeIndex,
    }))?.operation === operation
  }

  async function apply() {
    await workspaceHunkController.apply(sessionId, entryId)
    await onApplied()
    await workspaceHunkController.load(sessionId, entryId)
  }
</script>

<aside class="hunk-review-panel" aria-label="Hunk review">
  <header><strong>Review changes</strong><span>{hunks.length} hunks</span></header>
  {#if $hunkResolution.loadingEntryId === entryId}<p>Loading hunks…</p>{/if}
  {#if $hunkResolution.error}<p class="error">{$hunkResolution.error}</p>{/if}
  <div class="hunk-review-list">
    {#each hunks as hunk (hunk.fingerprint.changeHash)}
      <section>
        <code>{hunk.header}</code>
        <div class="hunk-actions">
          {#each operations() as action}
            <button
              class:active={isPlanned(hunk, action.operation)}
              type="button"
              on:click={() => workspaceHunkController.plan(entryId, action.operation, { fingerprint: hunk.fingerprint })}
            >{action.label}</button>
          {/each}
          <button class="secondary" type="button" on:click={() => workspaceHunkController.reset(entryId)}>Reset</button>
        </div>
        {#if hunk.changeCount > 1}
          <div class="change-block-actions">
            {#each Array(hunk.changeCount) as _, changeIndex}
              {#each operations() as action}
                <button
                  class:active={isPlanned(hunk, action.operation, changeIndex)}
                  type="button"
                  on:click={() => workspaceHunkController.plan(entryId, action.operation, { fingerprint: hunk.fingerprint, changeIndex })}
                >Block {changeIndex + 1}: {action.label}</button>
              {/each}
            {/each}
          </div>
        {/if}
      </section>
    {/each}
  </div>
  {#if plannedCount > 0}
    <footer>
      <span>{plannedCount} changes selected</span>
      <button type="button" disabled={$hunkResolution.applying} on:click={apply}>Apply selected</button>
      <button class="secondary" type="button" on:click={() => workspaceHunkController.reset(entryId)}>Reset all</button>
    </footer>
  {/if}
</aside>

<style>
  .hunk-review-panel { grid-row: 1; min-height: 0; display: grid; grid-template-rows: auto minmax(0, 1fr) auto; border-left: 1px solid var(--border-color); background: var(--panel-surface); }
  header, footer { display: flex; align-items: center; justify-content: space-between; gap: 8px; padding: 8px 10px; border-bottom: 1px solid var(--border-color); }
  header span, p { color: var(--muted-text); font-size: 11px; }
  p { padding: 8px 10px; }
  p.error { color: var(--diff-removed); }
  .hunk-review-list { min-height: 0; overflow: auto; }
  .hunk-review-list section { display: grid; gap: 7px; padding: 9px; border-bottom: 1px solid var(--border-color); }
  .hunk-review-list code { color: var(--muted-text); font-size: 11px; }
  .hunk-actions, .change-block-actions, footer { display: flex; flex-wrap: wrap; gap: 5px; }
  button { min-height: 25px; padding: 2px 7px; }
  button.active { color: var(--accent); border-color: var(--accent); }
  footer { border-top: 1px solid var(--border-color); border-bottom: 0; justify-content: flex-start; }
</style>
