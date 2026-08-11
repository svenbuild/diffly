<script lang="ts">
  import { onMount } from 'svelte'
  import type { ComparisonSearchQuery, SearchMatch } from '../search-types'
  import { comparisonSearch } from './search-store'
  import { workspaceSearchController } from './search-controller'

  export let sessionId: string
  export let onNavigate: (match: SearchMatch) => Promise<void> | void = () => {}

  let query: ComparisonSearchQuery = $comparisonSearch.query
  let searchInput: HTMLInputElement | null = null

  onMount(() => searchInput?.focus())

  function run() {
    if (query.text.trim()) void workspaceSearchController.start(sessionId, { ...query })
  }

  function keydown(event: KeyboardEvent) {
    if (event.key === 'Enter') {
      event.preventDefault()
      run()
    } else if (event.key === 'Escape') {
      workspaceSearchController.close()
    }
  }

  function activate(match: SearchMatch, index: number) {
    workspaceSearchController.select(index)
    void onNavigate(match)
  }
</script>

<svelte:window on:keydown={keydown} />

<aside class="workspace-search-panel" aria-label="Search entire comparison">
  <header>
    <strong>Search</strong>
    <button class="secondary" aria-label="Close search" type="button" on:click={() => workspaceSearchController.close()}>×</button>
  </header>
  <div class="workspace-search-form">
    <div class="workspace-search-input-row">
      <input bind:this={searchInput} bind:value={query.text} placeholder="Search comparison" />
      <button type="button" disabled={!query.text.trim() || $comparisonSearch.running} on:click={run}>Find</button>
    </div>
    <div class="workspace-search-options">
      <label><input type="checkbox" bind:checked={query.caseSensitive} /> Case</label>
      <label><input type="checkbox" bind:checked={query.wholeWord} /> Whole word</label>
      <label><input type="checkbox" bind:checked={query.regex} /> Regex</label>
    </div>
    <select bind:value={query.scope} aria-label="Search scope">
      <option value="all">All files</option>
      <option value="changed">Changed lines</option>
      <option value="added">Added lines</option>
      <option value="deleted">Deleted lines</option>
      <option value="context">Context lines</option>
    </select>
    <input bind:value={query.pathFilter} placeholder="Path filter, e.g. src/**/*.ts" />
  </div>
  <div class="workspace-search-summary">
    {#if $comparisonSearch.running}
      Searching {$comparisonSearch.scannedDocuments}/{$comparisonSearch.totalDocuments}…
    {:else}
      {$comparisonSearch.results.length} results
    {/if}
  </div>
  {#if $comparisonSearch.error}<p class="workspace-search-error">{$comparisonSearch.error}</p>{/if}
  <div class="workspace-search-results">
    {#each $comparisonSearch.results as match, index (match.id)}
      <button
        class:selected={$comparisonSearch.selectedIndex === index}
        type="button"
        on:click={() => activate(match, index)}
      >
        <strong>{match.path}:{match.lineNumber}</strong>
        <code>{match.preview}</code>
      </button>
    {/each}
  </div>
</aside>

<style>
  .workspace-search-panel { grid-row: 1; min-width: 0; min-height: 0; display: grid; grid-template-rows: auto auto auto auto minmax(0, 1fr); border-left: 1px solid var(--border-color); background: var(--panel-surface); }
  header, .workspace-search-input-row, .workspace-search-options { display: flex; align-items: center; gap: 6px; }
  header { justify-content: space-between; padding: 7px 10px; border-bottom: 1px solid var(--border-color); }
  header button { min-height: 24px; padding: 1px 8px; }
  .workspace-search-form { display: grid; gap: 7px; padding: 9px; }
  .workspace-search-input-row input { flex: 1; min-width: 0; }
  .workspace-search-options { flex-wrap: wrap; color: var(--muted-text); font-size: 11px; }
  .workspace-search-summary, .workspace-search-error { margin: 0; padding: 5px 10px; color: var(--muted-text); font-size: 11px; }
  .workspace-search-error { color: var(--diff-removed); }
  .workspace-search-results { min-height: 0; overflow: auto; }
  .workspace-search-results button { display: grid; width: 100%; gap: 3px; border: 0; border-radius: 0; padding: 7px 10px; text-align: left; background: transparent; }
  .workspace-search-results button:hover, .workspace-search-results button.selected { background: var(--hover-surface); }
  .workspace-search-results strong, .workspace-search-results code { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .workspace-search-results code { color: var(--muted-text); }
</style>
