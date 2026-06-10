<script lang="ts">
  import type { AppearanceSettings } from '../theme'
  import type {
    CompareTreeSettings,
    DiffSource,
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
  export let contextMenuSource: DiffSource | null = null
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
        {contextMenuSource}
        contextMenuEnabled={true}
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
          <path clip-rule="evenodd" fill-rule="evenodd" d="M8 1.25a6.75 6.75 0 1 0 0 13.5 6.75 6.75 0 0 0 0-13.5Zm0 2.8a.95.95 0 1 0 0 1.9.95.95 0 0 0 0-1.9ZM7.25 7.25a.75.75 0 0 1 1.5 0v3.75a.75.75 0 0 1-1.5 0Z" />
        </svg>
        <span class="sidebar-metric-title">
          <span class="sidebar-metric-name">Diff Stats</span>
          <span class="sidebar-metric-hint">F2</span>
        </span>
      </button>

      <div
        class="sidebar-metric-reveal"
        class:open={activePanel === 'diffStats'}
        aria-hidden={activePanel !== 'diffStats'}
      >
        <div class="sidebar-metric-reveal-inner">
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
        </div>
      </div>
    </section>

    <section class="sidebar-metric-section">
      <button
        aria-expanded={activePanel === 'systemMonitor'}
        class="sidebar-metric-header"
        type="button"
        on:click={() => onSetActivePanel('systemMonitor')}
      >
        <svg aria-hidden="true" class="sidebar-metric-icon" fill="none" viewBox="0 0 16 16">
          <path d="M1.75 8S4 3.75 8 3.75 14.25 8 14.25 8 12 12.25 8 12.25 1.75 8 1.75 8Z" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.3" />
          <circle cx="8" cy="8" r="1.85" fill="currentColor" />
        </svg>
        <span class="sidebar-metric-title">
          <span class="sidebar-metric-name">System Monitor</span>
          <span class="sidebar-metric-hint">F3</span>
        </span>
      </button>

      <div
        class="sidebar-metric-reveal"
        class:open={activePanel === 'systemMonitor'}
        aria-hidden={activePanel !== 'systemMonitor'}
      >
        <div class="sidebar-metric-reveal-inner">
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
              <dt>Rendering Diffs</dt>
              <dd>{formatNumber(systemMonitor.renderingDiffs)}</dd>
            </div>
            <div>
              <dt>Prepared Diffs</dt>
              <dd>{formatNumber(systemMonitor.preparedDiffs)}</dd>
            </div>
            <div>
              <dt>Diff Cache</dt>
              <dd>{formatNumber(systemMonitor.diffCache)}</dd>
            </div>
          </dl>
        </div>
      </div>
    </section>
  </div>
</aside>
