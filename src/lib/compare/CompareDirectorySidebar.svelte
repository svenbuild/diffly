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
  export let activePanel: 'diffStats' | 'systemMonitor' = 'diffStats'
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
        <svg aria-hidden="true" class="sidebar-metric-icon" viewBox="0 0 16 16">
          <path d="M4.5 4.5h7M4.5 8h7M4.5 11.5h4.8" fill="none" stroke="currentColor" stroke-linecap="round" stroke-width="1.35" />
          <path d="M2.8 2.8h10.4v10.4H2.8z" fill="none" stroke="currentColor" stroke-width="1.15" />
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
