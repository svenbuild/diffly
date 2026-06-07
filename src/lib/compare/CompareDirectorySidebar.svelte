<script lang="ts">
  import type { AppearanceSettings } from '../theme'
  import type {
    CompareTreeSettings,
    DiffStatsSnapshot,
    DirectoryEntryResult,
    SystemMonitorSnapshot,
  } from '../types'

  export let loading = false
  export let directoryEntries: DirectoryEntryResult[] = []
  export let entriesRevision = 0
  export let selectedRelativePath = ''
  export let treeSettings: CompareTreeSettings
  export let appearanceSettings: AppearanceSettings
  export let resolvedThemeMode: 'light' | 'dark'
  export let selectEntry: (entry: DirectoryEntryResult) => Promise<void>
  export let PierreDirectoryTreeComponent: typeof import('./PierreDirectoryTree.svelte').default | null = null
  export let diffStats: DiffStatsSnapshot
  export let systemMonitor: SystemMonitorSnapshot
  export let activePanel: 'diffStats' | 'systemMonitor' | null = null
  export let onSetActivePanel: (panel: 'diffStats' | 'systemMonitor') => void = () => {}

  const numberFormatter = new Intl.NumberFormat('en-US')

  function formatNumber(value: number) {
    return numberFormatter.format(Math.max(0, Math.round(value)))
  }
</script>

<aside class="directory-tree-panel compare-directory-sidebar">
  <div class="directory-tree-main">
    {#if PierreDirectoryTreeComponent}
      <svelte:component
        this={PierreDirectoryTreeComponent}
        {loading}
        {directoryEntries}
        {entriesRevision}
        {selectedRelativePath}
        {treeSettings}
        {appearanceSettings}
        {resolvedThemeMode}
        {selectEntry}
        embedded={true}
      />
    {:else}
      <div class="directory-tree-host">
        <div class="directory-tree-state">
          <span class="refresh-spinner visible"></span>
          <p>Loading file list...</p>
        </div>
      </div>
    {/if}
  </div>

  <div class="compare-sidebar-metrics" aria-label="Compare metrics">
    <section class="sidebar-metric-section">
      <button
        aria-expanded={activePanel === 'diffStats'}
        class="sidebar-metric-header"
        type="button"
        on:click={() => onSetActivePanel('diffStats')}
      >
        <svg aria-hidden="true" class="sidebar-metric-icon" fill="currentColor" viewBox="0 0 16 16">
          <path clip-rule="evenodd" d="M8 0a8 8 0 1 1 0 16A8 8 0 0 1 8 0ZM5.25 10a.75.75 0 0 0 0 1.5h5.5a.75.75 0 0 0 0-1.5h-5.5ZM8 3.546a.75.75 0 0 0-.75.75v6.25h1.5v-6.25A.75.75 0 0 0 8 3.546Z" fill-rule="evenodd" />
        </svg>
        <span>Diff Stats (F2)</span>
      </button>

      {#if activePanel === 'diffStats'}
        <dl class="sidebar-metric-list">
          <div>
            <dt>Files</dt>
            <dd>{formatNumber(diffStats.files)}</dd>
          </div>
          <div>
            <dt>Additions</dt>
            <dd class="metric-additions">{formatNumber(diffStats.additions)}</dd>
          </div>
          <div>
            <dt>Deletions</dt>
            <dd class="metric-deletions">{formatNumber(diffStats.deletions)}</dd>
          </div>
          <div>
            <dt>Lines</dt>
            <dd>{formatNumber(diffStats.lines)}</dd>
          </div>
        </dl>
      {/if}
    </section>

    <section class="sidebar-metric-section">
      <button
        aria-expanded={activePanel === 'systemMonitor'}
        class="sidebar-metric-header"
        type="button"
        on:click={() => onSetActivePanel('systemMonitor')}
      >
        <svg aria-hidden="true" class="sidebar-metric-icon" viewBox="0 0 16 16">
          <path d="M2.2 8s2.1-3.4 5.8-3.4 5.8 3.4 5.8 3.4-2.1 3.4-5.8 3.4S2.2 8 2.2 8Z" fill="none" stroke="currentColor" stroke-width="1.15" />
          <circle cx="8" cy="8" r="1.7" fill="none" stroke="currentColor" stroke-width="1.15" />
        </svg>
        <span>System Monitor (F3)</span>
      </button>

      {#if activePanel === 'systemMonitor'}
        <dl class="sidebar-metric-list">
          <div>
            <dt>Busy Workers</dt>
            <dd>{formatNumber(systemMonitor.busyWorkers)}/{formatNumber(systemMonitor.totalWorkers)}</dd>
          </div>
          <div>
            <dt>Task Queue</dt>
            <dd>{formatNumber(systemMonitor.taskQueue)}</dd>
          </div>
          <div>
            <dt>Rendered Diffs</dt>
            <dd>{formatNumber(systemMonitor.renderedDiffs)}</dd>
          </div>
          <div>
            <dt>Diff Cache</dt>
            <dd>{formatNumber(systemMonitor.diffCache)}</dd>
          </div>
        </dl>
      {/if}
    </section>
  </div>
</aside>
