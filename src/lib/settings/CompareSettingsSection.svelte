<script lang="ts">
  import DiffSettingsSection from './DiffSettingsSection.svelte'
  import TreeSettingsSection from './TreeSettingsSection.svelte'
  import type { CompareTreeSettings, CompareViewerSettings, ViewMode } from '../types'

  type CompareSettingsTab = 'diffs' | 'trees'

  export let viewMode: ViewMode
  export let viewerSettings: CompareViewerSettings
  export let treeSettings: CompareTreeSettings
  export let ignoreWhitespace: boolean
  export let ignoreCase: boolean
  export let comparisonRulesRequireRefresh: boolean
  export let compareNeedsRefresh: boolean
  export let onSetViewMode: (viewMode: ViewMode) => void
  export let onSetViewerSettings: (settings: CompareViewerSettings) => void
  export let onSetTreeSettings: (settings: CompareTreeSettings) => void
  export let onToggleIgnoreWhitespace: () => void
  export let onToggleIgnoreCase: () => void

  let activeTab: CompareSettingsTab = 'diffs'
</script>

<section class="settings-page compare-settings-page">
  <div class="settings-page-heading">
    <h2>Compare</h2>
    <p>Configure the diff viewer and directory tree used by compare sessions.</p>
  </div>

  <div class="settings-tabs" role="tablist" aria-label="Compare settings">
    <button
      aria-controls="compare-diffs-panel"
      aria-selected={activeTab === 'diffs'}
      class:active={activeTab === 'diffs'}
      id="compare-diffs-tab"
      role="tab"
      type="button"
      on:click={() => (activeTab = 'diffs')}
    >
      Diffs
    </button>
    <button
      aria-controls="compare-trees-panel"
      aria-selected={activeTab === 'trees'}
      class:active={activeTab === 'trees'}
      id="compare-trees-tab"
      role="tab"
      type="button"
      on:click={() => (activeTab = 'trees')}
    >
      Trees
    </button>
  </div>

  {#if activeTab === 'diffs'}
    <div aria-labelledby="compare-diffs-tab" id="compare-diffs-panel" role="tabpanel">
      <DiffSettingsSection
        {viewMode}
        {viewerSettings}
        {ignoreWhitespace}
        {ignoreCase}
        {comparisonRulesRequireRefresh}
        {compareNeedsRefresh}
        {onSetViewMode}
        {onSetViewerSettings}
        {onToggleIgnoreWhitespace}
        {onToggleIgnoreCase}
      />
    </div>
  {:else}
    <div aria-labelledby="compare-trees-tab" id="compare-trees-panel" role="tabpanel">
      <TreeSettingsSection
        {treeSettings}
        {onSetTreeSettings}
      />
    </div>
  {/if}
</section>
