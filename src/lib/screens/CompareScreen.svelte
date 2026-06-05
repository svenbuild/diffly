<script lang="ts">
  import AppTopBar from '../AppTopBar.svelte'
  import type { AppearanceSettings } from '../theme'
  import type {
    CompareMode,
    CompareOptions,
    CompareTreeSettings,
    CompareViewerSettings,
    DirectoryEntryResult,
    FileDiffResult,
    ViewMode,
  } from '../types'
  import type {
    DiffHeaderContext,
    SettingsSection,
  } from '../ui-types'
  import type { UpdateIndicatorState } from '../app/update-controller'
  import UpdateIndicator from './UpdateIndicator.svelte'

  export let updateIndicatorState: UpdateIndicatorState
  export let showUpdateIndicator = false
  export let updateIndicatorTitle = ''
  export let openUpdateSettings: () => void
  export let mode: CompareMode = 'directory'
  export let compareSidebarWidth = 238
  export let compareSurfaceTransitioning = false
  export let diffHeaderContext: DiffHeaderContext
  export let selectedRelativePath = ''
  export let comparePairsTooltip = ''
  export let comparePairsLabel = ''
  export let canGoToPreviousDiff = false
  export let canGoToNextDiff = false
  export let goToPreviousDifference: () => void
  export let goToNextDifference: () => void
  export let viewMode: ViewMode = 'sideBySide'
  export let textDiffActive = false
  export let toggleViewMode: () => void
  export let loading = false
  export let detailLoading = false
  export let pickerLoading = false
  export let swapComparedSides: () => Promise<void>
  export let compareNeedsRefresh = false
  export let runCompare: () => Promise<void> | void
  export let openSettings: (section?: SettingsSection) => void
  export let goToSetup: () => void
  export let errorMessage = ''
  export let compareSidebarResizeActive = false
  export let PierreDirectoryTreeComponent: typeof import('../compare/PierreDirectoryTree.svelte').default | null = null
  export let CompareViewerComponent: typeof import('../compare/CompareViewer.svelte').default | null = null
  export let directoryEntries: DirectoryEntryResult[] = []
  export let directoryEntriesRevision = 0
  export let treeSettings: CompareTreeSettings
  export let appearanceSettings: AppearanceSettings
  export let resolvedThemeMode: 'light' | 'dark'
  export let selectEntry: (entry: DirectoryEntryResult) => Promise<void>
  export let resetCompareSidebarWidth: () => void
  export let startCompareSidebarResize: (event: PointerEvent) => void
  export let activeDiff: FileDiffResult | null = null
  export let directoryScrollTargetRevision = 0
  export let viewerSettings: CompareViewerSettings
  export let compareRevision = 0
  export let leftPath = ''
  export let rightPath = ''
  export let activeCompareOptions: CompareOptions
  export let getDetailBasesForPath: (prefixedPath: string) => {
    leftBase: string
    rightBase: string
    relativePath: string
  }
</script>

<main
  class="screen compare-screen"
  style:--compare-sidebar-width={mode === 'directory' ? `${compareSidebarWidth}px` : undefined}
>
  <AppTopBar context="Compare">
    {#snippet status()}
      <UpdateIndicator
        visible={showUpdateIndicator}
        title={updateIndicatorTitle}
        status={updateIndicatorState.status}
        onOpen={openUpdateSettings}
      />
    {/snippet}

    {#snippet middle()}
    <div
      class:compare-context-updating={compareSurfaceTransitioning}
      class="compare-editor-context"
      aria-label="Compare context"
    >
      <strong title={diffHeaderContext.currentFileLabel || selectedRelativePath}>
        {diffHeaderContext.currentFileLabel || selectedRelativePath || 'Compare results'}
      </strong>
      <span title={comparePairsTooltip}>
        {comparePairsLabel}
      </span>
    </div>
    {/snippet}

    {#snippet actions()}
    <div class="compare-actions">
      <div class="compare-action-group diff-nav-actions">
        <div
          class="nav-button-group segmented-control toolbar-segmented-control"
          aria-label="Diff navigation"
          role="group"
        >
          <button
            class="secondary toolbar-button nav-button nav-button-group-item"
            aria-label="Jump to the previous difference"
            disabled={!canGoToPreviousDiff}
            title="Jump to the previous difference"
            type="button"
            on:click={goToPreviousDifference}
          >
            <svg aria-hidden="true" class="nav-button-icon" viewBox="0 0 16 16">
              <path
                d="M9.8 3.2 5.4 8l4.4 4.8"
                fill="none"
                stroke="currentColor"
                stroke-linecap="round"
                stroke-linejoin="round"
                stroke-width="1.7"
              />
            </svg>
            <span>Prev</span>
          </button>
          <button
            class="secondary toolbar-button nav-button nav-button-group-item"
            aria-label="Jump to the next difference"
            disabled={!canGoToNextDiff}
            title="Jump to the next difference"
            type="button"
            on:click={goToNextDifference}
          >
            <span>Next</span>
            <svg aria-hidden="true" class="nav-button-icon" viewBox="0 0 16 16">
              <path
                d="M6.2 3.2 10.6 8l-4.4 4.8"
                fill="none"
                stroke="currentColor"
                stroke-linecap="round"
                stroke-linejoin="round"
                stroke-width="1.7"
              />
            </svg>
          </button>
        </div>
      </div>

      <div class="compare-action-group display-actions">
        <button
          aria-label={viewMode === 'sideBySide' ? 'Switch to unified view' : 'Switch to split view'}
          aria-pressed={viewMode === 'unified'}
          class:unified-active={viewMode === 'unified'}
          class="view-mode-toggle"
          disabled={!textDiffActive}
          type="button"
          on:click={toggleViewMode}
        >
          <span
            aria-hidden="true"
            class="view-mode-toggle-thumb"
          ></span>
          <span
            aria-hidden="true"
            class:active={viewMode === 'sideBySide'}
            class="view-mode-option"
          >
            <svg aria-hidden="true" class="view-mode-icon" viewBox="0 0 16 16">
              <rect x="2.5" y="3" width="4.2" height="10" rx="1.2" fill="none" stroke="currentColor" stroke-width="1.3" />
              <rect x="9.3" y="3" width="4.2" height="10" rx="1.2" fill="none" stroke="currentColor" stroke-width="1.3" />
            </svg>
            <span class="view-mode-label">Split</span>
          </span>
          <span
            aria-hidden="true"
            class:active={viewMode === 'unified'}
            class="view-mode-option"
          >
            <svg aria-hidden="true" class="view-mode-icon" viewBox="0 0 16 16">
              <rect x="2.5" y="3" width="11" height="10" rx="1.5" fill="none" stroke="currentColor" stroke-width="1.3" />
              <path d="M4.8 5.5h6.4M4.8 8h6.4M4.8 10.5h4.2" fill="none" stroke="currentColor" stroke-linecap="round" stroke-width="1.3" />
            </svg>
            <span class="view-mode-label">Unified</span>
          </span>
        </button>
      </div>

      <div class="compare-action-group utility-actions">
        <button
          class="secondary toolbar-button icon-button swap-button"
          aria-label="Switch left and right sides"
          disabled={loading || detailLoading || pickerLoading}
          title="Switch left and right sides"
          type="button"
          on:click={swapComparedSides}
        >
          <svg aria-hidden="true" class="swap-icon" viewBox="0 0 16 16">
            <path d="M2.5 5h6.6" fill="none" stroke="currentColor" stroke-linecap="round" stroke-width="1.6" />
            <path d="m8.9 2.4 2.6 2.6-2.6 2.6" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.6" />
            <path d="M13.5 11H6.9" fill="none" stroke="currentColor" stroke-linecap="round" stroke-width="1.6" />
            <path d="m7.1 8.4-2.6 2.6 2.6 2.6" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.6" />
          </svg>
        </button>

        <button
          aria-label={compareNeedsRefresh ? 'Refresh to apply comparison rule changes' : 'Refresh compare'}
          aria-busy={loading}
          class:compare-action-busy={loading}
          class:pending-refresh={compareNeedsRefresh}
          class="secondary toolbar-button icon-button refresh-button"
          title={compareNeedsRefresh ? 'Refresh to apply comparison rule changes' : 'Refresh compare'}
          type="button"
          disabled={loading}
          on:click={runCompare}
        >
          <span class="refresh-icon-slot" aria-hidden="true">
            {#if loading}
              <span class="refresh-spinner visible"></span>
            {:else}
              <svg class="refresh-icon" viewBox="0 0 16 16">
                <path
                  d="M12.8 7.8a4.8 4.8 0 0 1-8.2 3.4"
                  fill="none"
                  stroke="currentColor"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  stroke-width="1.7"
                />
                <path
                  d="M10.1 10.9h2.7v2.6"
                  fill="none"
                  stroke="currentColor"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  stroke-width="1.7"
                />
                <path
                  d="M3.2 8.2a4.8 4.8 0 0 1 8.2-3.4"
                  fill="none"
                  stroke="currentColor"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  stroke-width="1.7"
                />
                <path
                  d="M5.9 5.1H3.2V2.5"
                  fill="none"
                  stroke="currentColor"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  stroke-width="1.7"
                />
              </svg>
            {/if}
          </span>
        </button>
      </div>

      <div class="compare-action-group global-actions">
        <button class="secondary toolbar-button" type="button" on:click={() => openSettings('compare')}>
          Settings
        </button>
        <button class="secondary toolbar-button toolbar-setup-button" type="button" on:click={goToSetup}>
          Setup
        </button>
      </div>
    </div>
    {/snippet}
  </AppTopBar>

  {#if errorMessage}
    <p class="error-banner">{errorMessage}</p>
  {/if}

  <section
    class:resizing-sidebar={compareSidebarResizeActive}
    class:single-pane={mode === 'file'}
    class="compare-layout"
    style:--compare-sidebar-width={mode === 'directory' ? `${compareSidebarWidth}px` : undefined}
  >
    {#if mode === 'directory'}
      {#if PierreDirectoryTreeComponent}
        <svelte:component
          this={PierreDirectoryTreeComponent}
          {loading}
          {directoryEntries}
          entriesRevision={directoryEntriesRevision}
          {selectedRelativePath}
          {treeSettings}
          {appearanceSettings}
          {resolvedThemeMode}
          {selectEntry}
        />
      {:else}
        <aside class="directory-tree-panel">
          <div class="directory-tree-host">
            <div class="directory-tree-state">
              <span class="refresh-spinner visible"></span>
              <p>Loading file list...</p>
            </div>
          </div>
        </aside>
      {/if}
      <button
        aria-label="Resize file list panel"
        class="compare-sidebar-resizer"
        type="button"
        on:dblclick={resetCompareSidebarWidth}
        on:pointerdown={startCompareSidebarResize}
      ></button>
    {/if}

    {#if CompareViewerComponent}
      <svelte:component
        this={CompareViewerComponent}
        {mode}
        {activeDiff}
        {directoryEntries}
        {selectedRelativePath}
        scrollTargetRevision={directoryScrollTargetRevision}
        {loading}
        {detailLoading}
        {viewerSettings}
        {appearanceSettings}
        {resolvedThemeMode}
        {viewMode}
        revision={compareRevision}
        {leftPath}
        {rightPath}
        compareOptions={activeCompareOptions}
        transitionActive={compareSurfaceTransitioning}
        resolveEntryBases={getDetailBasesForPath}
      />
    {:else}
      <section class="compare-viewer">
        <div class="compare-viewer-state">
          <span class="refresh-spinner visible"></span>
          <p>Opening compare view...</p>
        </div>
      </section>
    {/if}
  </section>
</main>
