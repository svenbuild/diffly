<script lang="ts">
  import type { PartialChangeOperation, ReviewHunkSummary } from '../review-types'
  import type { ReviewDecision, ReviewDecisionStatus } from '../review-types'
  import { listReviewDecisions, resetReviewDecisions, setReviewDecision } from '../api'
  import { hunkResolution, hunkSelectionKey } from './hunk-resolution-store'
  import { workspaceHunkController } from './hunk-controller'
  import type { GitWorkingTreeReviewCapabilities } from '../types'

  export let sessionId: string
  export let entryId: string
  export let sourceKind: 'local' | 'git' | 'readOnly'
  export let gitScope: 'all' | 'staged' | 'unstaged' | 'untracked' = 'all'
  export let onApplied: () => Promise<void> | void = () => {}
  export let embedded = false
  export let gitCapabilities: GitWorkingTreeReviewCapabilities | null = null
  let decisions: ReviewDecision[] = []
  let requestedHunkKey = ''
  let requestedDecisionKey = ''
  let reviewCursor = 0

  $: hunks = $hunkResolution.hunksByEntry.get(entryId) ?? []
  $: plannedCount = Array.from($hunkResolution.planned.values()).filter((item) => item.entryId === entryId).length

  $: hunkKey = `${sessionId}:${entryId}`
  $: if (requestedHunkKey !== hunkKey) {
    requestedHunkKey = hunkKey
    void workspaceHunkController.load(sessionId, entryId)
  }
  $: if (sourceKind === 'readOnly' && requestedDecisionKey !== hunkKey) {
    requestedDecisionKey = hunkKey
    void loadDecisions(sessionId, entryId, hunkKey)
  } else if (sourceKind !== 'readOnly' && decisions.length > 0) {
    decisions = []
    requestedDecisionKey = ''
  }

  function operations(): Array<{ operation: PartialChangeOperation; label: string }> {
    if (sourceKind === 'local') return [
      { operation: 'applyRightToLeft', label: '← Keep right' },
      { operation: 'applyLeftToRight', label: 'Keep left →' },
      { operation: 'applyBothToLeft', label: 'Both → left' },
      { operation: 'applyBothToRight', label: 'Both → right' },
    ]
    if (gitScope === 'staged') return [{ operation: 'unstage', label: 'Unstage' }]
    if (gitScope === 'unstaged') return [
      { operation: 'stage', label: 'Stage' },
      { operation: 'discard', label: 'Discard' },
    ]
    if (gitScope === 'all' && gitCapabilities) {
      if (gitCapabilities.unstage) return [{ operation: 'unstage', label: 'Unstage' }]
      const actions: Array<{ operation: PartialChangeOperation; label: string }> = []
      if (gitCapabilities.stage) actions.push({ operation: 'stage', label: 'Stage' })
      if (gitCapabilities.discard) actions.push({ operation: 'discard', label: 'Discard' })
      return actions
    }
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

  async function loadDecisions(nextSessionId: string, nextEntryId: string, key: string) {
    const loaded = await listReviewDecisions(nextSessionId, nextEntryId)
    if (`${sessionId}:${entryId}` === key && sourceKind === 'readOnly') decisions = loaded
  }

  function decisionFor(hunk: ReviewHunkSummary, changeIndex: number | null) {
    return decisions.find((decision) =>
      decision.fingerprint.changeHash === hunk.fingerprint.changeHash && decision.changeIndex === changeIndex)?.status ?? null
  }

  async function decide(hunk: ReviewHunkSummary, status: ReviewDecisionStatus | null, changeIndex: number | null = null) {
    decisions = await setReviewDecision(sessionId, entryId, hunk.fingerprint, changeIndex, status)
  }

  async function resetDecisions() {
    await resetReviewDecisions(sessionId, entryId)
    decisions = []
  }

  function reviewNextPlanned() {
    const planned = Array.from($hunkResolution.planned.values()).filter((item) => item.entryId === entryId)
    if (planned.length === 0) return
    const next = planned[reviewCursor % planned.length]!
    reviewCursor = (reviewCursor + 1) % planned.length
    document.getElementById(`hunk-${entryId}-${next.selection.fingerprint.changeHash}`)
      ?.scrollIntoView({ block: 'center', behavior: 'smooth' })
  }
</script>

<aside class:embedded class="hunk-review-panel" aria-label="Hunk review">
  <header><strong>Review changes</strong><span>{hunks.length} hunks</span></header>
  {#if $hunkResolution.loadingEntryId === entryId}<p>Loading hunks…</p>{/if}
  {#if $hunkResolution.error}<p class="error">{$hunkResolution.error}</p>{/if}
  <div class="hunk-review-list">
    {#each hunks as hunk (hunk.fingerprint.changeHash)}
      <section id={`hunk-${entryId}-${hunk.fingerprint.changeHash}`}>
        <code>{hunk.header}</code>
        <div class="hunk-actions">
          {#if sourceKind === 'readOnly'}
            <button class:active={decisionFor(hunk, null) === 'accepted'} type="button" on:click={() => decide(hunk, 'accepted')}>Accepted</button>
            <button class:active={decisionFor(hunk, null) === 'rejected'} type="button" on:click={() => decide(hunk, 'rejected')}>Rejected</button>
            <button class:active={decisionFor(hunk, null) === 'needsChanges'} type="button" on:click={() => decide(hunk, 'needsChanges')}>Needs changes</button>
            <button class="secondary" type="button" on:click={() => decide(hunk, null)}>Reset</button>
          {:else}
            {#each operations() as action}
              <button
                class:active={isPlanned(hunk, action.operation)}
                type="button"
                on:click={() => workspaceHunkController.plan(entryId, action.operation, { fingerprint: hunk.fingerprint })}
              >{action.label}</button>
            {/each}
            <button class="secondary" type="button" on:click={() => workspaceHunkController.reset(entryId)}>Reset</button>
          {/if}
        </div>
        {#if hunk.changeCount > 1}
          <div class="change-block-actions">
            {#each Array(hunk.changeCount) as _, changeIndex}
              {#if sourceKind === 'readOnly'}
                <button class:active={decisionFor(hunk, changeIndex) === 'accepted'} type="button" on:click={() => decide(hunk, 'accepted', changeIndex)}>Block {changeIndex + 1}: Accept</button>
                <button class:active={decisionFor(hunk, changeIndex) === 'rejected'} type="button" on:click={() => decide(hunk, 'rejected', changeIndex)}>Reject</button>
              {:else}
                {#each operations() as action}
                  <button
                    class:active={isPlanned(hunk, action.operation, changeIndex)}
                    type="button"
                    on:click={() => workspaceHunkController.plan(entryId, action.operation, { fingerprint: hunk.fingerprint, changeIndex })}
                  >Block {changeIndex + 1}: {action.label}</button>
                {/each}
              {/if}
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
      <button class="secondary" type="button" on:click={reviewNextPlanned}>Review {plannedCount}</button>
    </footer>
  {/if}
  {#if sourceKind === 'readOnly' && decisions.length > 0}
    <footer><span>{decisions.length} decisions</span><button class="secondary" type="button" on:click={resetDecisions}>Reset all</button></footer>
  {/if}
</aside>

<style>
  .hunk-review-panel { grid-row: 1; min-height: 0; display: grid; grid-template-rows: auto minmax(0, 1fr) auto; border-left: 1px solid var(--border-color); background: var(--panel-surface); }
  .hunk-review-panel.embedded { grid-row: auto; border-left: 0; }
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
