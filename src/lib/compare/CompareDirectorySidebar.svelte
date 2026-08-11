<script lang="ts">
  import {
    clearPlannedOperations,
    discardPlannedOperation,
    plannedFileOperations,
    plannedOperationNotice,
  } from './file-operation-preview'
  import { isDiffableDirectoryEntry } from '../app/directory-state'
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

  $: knownStatsFiles = directoryEntries.filter(isDiffableDirectoryEntry).length
  $: displayedStatsFiles = knownStatsFiles
  $: displayedCalculatedFiles = Math.min(diffStats.calculatedFiles, displayedStatsFiles)
  $: statsCalculating =
    diffStats.calculating ||
    (activePanel === 'diffStats' && displayedCalculatedFiles < displayedStatsFiles)
  $: hasCalculatedStats = displayedCalculatedFiles > 0

  function formatDiffMetric(value: number) {
    return statsCalculating && !hasCalculatedStats ? '—' : formatNumber(value)
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

  {#if $plannedFileOperations.length > 0 || $plannedOperationNotice}
    <div class="planned-operations-panel" aria-label="Planned file operations">
      {#if $plannedOperationNotice}
        <p class="planned-operations-notice" role="status">{$plannedOperationNotice}</p>
      {/if}
      {#if $plannedFileOperations.length > 0}
        <div class="planned-operations-header">
          <span class="planned-operations-title">Planned changes</span>
          <div class="planned-operations-actions">
            <button
              class="planned-operations-button"
              disabled
              title="Applying file operations is not implemented yet"
              type="button"
            >
              Apply
            </button>
            <button
              class="planned-operations-button"
              type="button"
              on:click={() => clearPlannedOperations()}
            >
              Discard all
            </button>
          </div>
        </div>
        <ul class="planned-operations-list">
          {#each $plannedFileOperations as operation (operation.id)}
            <li class="planned-operation-row">
              <span
                class="planned-operation-text"
                title={`${operation.fromRelativePath} -> ${operation.toRelativePath}`}
              >
                {operation.kind === 'rename' ? 'Rename planned' : 'Move planned'}:
                {operation.fromRelativePath} -&gt; {operation.toRelativePath}
              </span>
              <button
                aria-label={`Discard planned change for ${operation.fromRelativePath}`}
                class="planned-operation-discard"
                title="Discard"
                type="button"
                on:click={() => discardPlannedOperation(operation.id)}
              >
                &times;
              </button>
            </li>
          {/each}
        </ul>
      {/if}
    </div>
  {/if}

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
          {#if statsCalculating}
            <p class="diff-stats-progress" role="status">
              <span class="refresh-spinner visible" aria-hidden="true"></span>
              Calculating…
              {#if displayedStatsFiles > 0}
                <span>{displayedCalculatedFiles}/{displayedStatsFiles} files</span>
              {/if}
            </p>
          {/if}
          <dl class="sidebar-metric-list">
            <div>
              <dt>Files</dt>
              <dd>{formatNumber(displayedStatsFiles)}</dd>
            </div>
            <div>
              <dt>Additions</dt>
              <dd class="metric-additions">{formatDiffMetric(diffStats.additions)}</dd>
            </div>
            <div>
              <dt>Deletions</dt>
              <dd class="metric-deletions">{formatDiffMetric(diffStats.deletions)}</dd>
            </div>
            <div>
              <dt>Lines</dt>
              <dd>{formatDiffMetric(diffStats.lines)}</dd>
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
