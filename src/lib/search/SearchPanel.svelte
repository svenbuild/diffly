<script lang="ts">
  import { onMount } from 'svelte'
  import { applyComparisonReplace, previewComparisonReplace } from '../api'
  import type { ComparisonSearchQuery, SearchMatch } from '../search-types'
  import type { ReplaceAllPreview } from '../search-types'
  import { comparisonSearch } from './search-store'
  import { workspaceSearchController } from './search-controller'

  export let sessionId: string
  export let onNavigate: (match: SearchMatch) => Promise<void> | void = () => {}
  export let onReplaced: () => Promise<void> | void = () => {}

  let query: ComparisonSearchQuery = $comparisonSearch.query
  let searchInput: HTMLInputElement | null = null
  let replaceOpen = false
  let replacement = ''
  let replacePreview: ReplaceAllPreview | null = null
  let selectedTargets = new Set<string>()
  let replacing = false
  let replaceError = ''

  onMount(() => searchInput?.focus())

  function run() {
    replacePreview = null
    if (query.text.trim()) void workspaceSearchController.start(sessionId, { ...query })
  }

  async function previewReplace() {
    if (!query.text.trim()) return
    replaceError = ''
    replacing = true
    try {
      replacePreview = await previewComparisonReplace({ sessionId, query: { ...query }, replacement })
      selectedTargets = new Set(replacePreview.files.map((file) => targetKey(file.target)))
    } catch (error) {
      replaceError = error instanceof Error ? error.message : String(error)
    } finally {
      replacing = false
    }
  }

  async function applyReplace() {
    if (!replacePreview) return
    replaceError = ''
    replacing = true
    try {
      const files = replacePreview.files.filter((file) => selectedTargets.has(targetKey(file.target)))
      const result = await applyComparisonReplace({
        sessionId,
        query: { ...query },
        replacement,
        documents: files.map((file) => ({ target: file.target, expectedRevision: file.revision })),
      })
      if (!result.ok) {
        replaceError = result.error.code
        return
      }
      replacePreview = null
      await onReplaced()
      run()
    } catch (error) {
      replaceError = error instanceof Error ? error.message : String(error)
    } finally {
      replacing = false
    }
  }

  function toggleTarget(key: string) {
    const next = new Set(selectedTargets)
    if (next.has(key)) next.delete(key)
    else next.add(key)
    selectedTargets = next
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
    <button class="replace-toggle secondary" type="button" aria-expanded={replaceOpen} on:click={() => replaceOpen = !replaceOpen}>{replaceOpen ? 'Hide replace' : 'Replace…'}</button>
    {#if replaceOpen}
      <div class="workspace-search-input-row">
        <input bind:value={replacement} placeholder="Replace with" />
        <button type="button" disabled={!query.text.trim() || replacing} on:click={previewReplace}>Preview</button>
      </div>
    {/if}
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
  {#if replaceError}<p class="workspace-search-error">{replaceError}</p>{/if}
  {#if replacePreview}
    <div class="replace-preview">
      <header><strong>{replacePreview.totalMatches} replacements in {replacePreview.files.length} files</strong></header>
      <div class="replace-files">
        {#each replacePreview.files as file (targetKey(file.target))}
          <label>
            <input type="checkbox" checked={selectedTargets.has(targetKey(file.target))} on:change={() => toggleTarget(targetKey(file.target))} />
            <span><strong>{file.path}</strong><small>{file.matchCount} matches</small></span>
          </label>
        {/each}
      </div>
      <button type="button" disabled={selectedTargets.size === 0 || replacing} on:click={applyReplace}>Replace in {selectedTargets.size} files</button>
    </div>
  {/if}
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
  .replace-toggle { justify-self: start; }
  .workspace-search-input-row input { flex: 1; min-width: 0; }
  .workspace-search-options { flex-wrap: wrap; color: var(--muted-text); font-size: 11px; }
  .workspace-search-summary, .workspace-search-error { margin: 0; padding: 5px 10px; color: var(--muted-text); font-size: 11px; }
  .workspace-search-error { color: var(--diff-removed); }
  .workspace-search-results { min-height: 0; overflow: auto; }
  .replace-preview { display: grid; gap: 6px; max-height: 42%; padding: 8px; border-block: 1px solid var(--border-color); overflow: auto; }
  .replace-preview header { padding: 0; border: 0; }
  .replace-files { display: grid; gap: 4px; }
  .replace-files label { display: flex; align-items: flex-start; gap: 6px; }
  .replace-files span { display: grid; min-width: 0; }
  .replace-files strong { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .replace-files small { color: var(--muted-text); }
  .workspace-search-results button { display: grid; width: 100%; gap: 3px; border: 0; border-radius: 0; padding: 7px 10px; text-align: left; background: transparent; }
  .workspace-search-results button:hover, .workspace-search-results button.selected { background: var(--hover-surface); }
  .workspace-search-results strong, .workspace-search-results code { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .workspace-search-results code { color: var(--muted-text); }
</style>

<script lang="ts" context="module">
  import type { DocumentTarget } from '../workspace-types'

  function targetKey(target: DocumentTarget) {
    if (target.kind === 'scratch') return `scratch:${target.sourceSessionId}:${target.sourceEntryId}:${target.sourceSide}`
    return `${target.kind}:${target.sessionId}:${target.entryId}:${target.kind === 'local' ? target.side : ''}`
  }
</script>
