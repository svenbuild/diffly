<script lang="ts">
  import AppTopBar from '../AppTopBar.svelte'
  import CompareLoadingOverlay from '../compare/CompareLoadingOverlay.svelte'
  import CompareDirectorySidebar from '../compare/CompareDirectorySidebar.svelte'
  import ToolbarSvgIcon from '../components/ToolbarSvgIcon.svelte'
  import { clearPlannedOperations } from '../compare/file-operation-preview'
  import GitScopeTabs from '../compare/GitScopeTabs.svelte'
  import { reviewModeEnabled } from '../compare/review-mode'
  import { sourceActions } from '../compare/source-actions'
  import { compareSourceKind } from '../actions/compare-actions'
  import backIconUrl from '../assets/icons/toolbar-back.svg'
  import collapseAllIconUrl from '../assets/icons/toolbar-collapse-all.svg'
  import expandAllIconUrl from '../assets/icons/toolbar-expand-all.svg'
  import reloadIconUrl from '../assets/icons/toolbar-reload.svg'
  import settingsIconUrl from '../assets/icons/toolbar-settings.svg'
  import type { AppearanceSettings } from '../theme'
  import type {
    CompareMode,
    CompareOptions,
    CompareTreeSettings,
    CompareViewerSettings,
    DiffSource,
    DiffStatsSnapshot,
    DirectoryDetailLoader,
    DirectoryEntryResult,
    FileDiffResult,
    GitWorkingTreeScope,
    SystemMonitorSnapshot,
    ViewMode,
    DocumentTarget,
  } from '../types'
  import type { SettingsSection } from '../ui-types'
  import type { UpdateIndicatorState } from '../app/update-controller'
  import type { CompareLoadingState } from '../app/compare-timing'
  import UpdateIndicator from './UpdateIndicator.svelte'
  import WorkspaceEditor from '../workspace/WorkspaceEditor.svelte'
  import {
    activeWorkspaceDocument,
    dirtyDocumentCount,
    documentWorkspace,
    setWorkspaceMode,
  } from '../workspace/document-store'
  import { workspaceDocumentController } from '../workspace/document-controller'
  import SearchPanel from '../search/SearchPanel.svelte'
  import { comparisonSearch } from '../search/search-store'
  import { workspaceSearchController } from '../search/search-controller'
  import type { SearchMatch } from '../search-types'
  import HunkReviewPanel from '../review/HunkReviewPanel.svelte'
  import MergeConflictViewer from '../conflicts/MergeConflictViewer.svelte'

  export let updateIndicatorState: UpdateIndicatorState
  export let showUpdateIndicator = false
  export let updateIndicatorTitle = ''
  export let openUpdateSettings: () => void
  export let mode: CompareMode = 'directory'
  export let compareSidebarWidth = 212
  export let compareSurfaceTransitioning = false
  export let compareLoadingState: CompareLoadingState = {
    active: false,
    detail: undefined,
    elapsedMs: 0,
    label: '',
    stage: '',
    startedAt: 0,
  }
  export let selectedRelativePath = ''
  export let activeDiffSource: DiffSource | null = null
  export let activeDiffSessionId: string | null = null
  export let viewMode: ViewMode = 'sideBySide'
  export let textDiffActive = false
  export let toggleViewMode: () => void
  export let loading = false
  export let detailLoading = false
  export let pickerLoading = false
  export let swapComparedSides: () => Promise<void>
  export let openExternalUrl: (url: string) => void = () => {}
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
  export let gitScope: GitWorkingTreeScope = 'all'
  export let gitScopeCounts: Record<GitWorkingTreeScope, number> = {
    all: 0,
    staged: 0,
    unstaged: 0,
    untracked: 0,
  }
  export let setGitScope: (scope: GitWorkingTreeScope) => void = () => {}
  export let resetCompareSidebarWidth: () => void
  export let startCompareSidebarResize: (event: PointerEvent) => void
  export let activeDiff: FileDiffResult | null = null
  export let detailLoader: DirectoryDetailLoader = { kind: 'localPaths' }
  export let emptyMessage = 'No file changes.'
  export let directoryScrollTargetRevision = 0
  export let viewerSettings: CompareViewerSettings
  export let compareRevision = 0
  export let leftPath = ''
  export let rightPath = ''
  export let activeCompareOptions: CompareOptions
  export let diffStats: DiffStatsSnapshot
  export let systemMonitor: SystemMonitorSnapshot
  export let onDiffStatsChange: (stats: DiffStatsSnapshot) => void
  export let onSystemMonitorChange: (stats: SystemMonitorSnapshot) => void
  export let getDetailBasesForPath: (prefixedPath: string) => {
    leftBase: string
    rightBase: string
    relativePath: string
  }

  let activeSidebarPanel: 'diffStats' | 'systemMonitor' | null = null
  let directoryDiffsAllCollapsed = false
  let collapseAllRevision = 0
  let expandAllRevision = 0
  let toolbarReloadPending = false

  $: showGitScopeTabs =
    mode === 'directory' &&
    activeDiffSource?.kind === 'git' &&
    activeDiffSource.selection.kind === 'workingTree'

  $: srcActions = sourceActions(activeDiffSource)

  $: reviewSourceKind = compareSourceKind(activeDiffSource)
  $: selectedEntry = directoryEntries.find((entry) => entry.relativePath === selectedRelativePath) ?? null
  $: selectedEntryId = mode === 'file' ? 'file' : selectedEntry?.diffEntryId ?? null
  $: showHunkReviewPanel =
    $documentWorkspace.mode === 'review' &&
    !$comparisonSearch.open &&
    Boolean(activeDiffSessionId && selectedEntryId) &&
    (activeDiffSource?.kind === 'local' ||
      (activeDiffSource?.kind === 'git' && activeDiffSource.selection.kind === 'workingTree'))

  function selectWorkspaceMode(nextMode: 'review' | 'edit' | 'resolve') {
    setWorkspaceMode(nextMode)
    reviewModeEnabled.set(nextMode === 'review')
    if (nextMode === 'edit') void openSelectedDocument()
  }

  async function openSelectedDocument(side: 'left' | 'right' = 'right') {
    const target = selectedDocumentTarget(side)
    if (!target) return
    try {
      await workspaceDocumentController.open(target)
    } catch (error) {
      console.error('Unable to open editable document', error)
    }
  }

  function selectedDocumentTarget(side: 'left' | 'right'): DocumentTarget | null {
    if (!activeDiffSessionId || !activeDiffSource) return null
    const entryId = mode === 'file'
      ? 'file'
      : directoryEntries.find((entry) => entry.relativePath === selectedRelativePath)?.diffEntryId
    if (!entryId) return null

    if (activeDiffSource.kind === 'local') {
      return { kind: 'local', sessionId: activeDiffSessionId, entryId, side }
    }
    if (activeDiffSource.kind === 'git') {
      if (activeDiffSource.selection.kind === 'workingTree') {
        return gitScope === 'staged'
          ? { kind: 'gitIndex', sessionId: activeDiffSessionId, entryId }
          : { kind: 'gitWorktree', sessionId: activeDiffSessionId, entryId }
      }
      return {
        kind: 'scratch',
        sourceSessionId: activeDiffSessionId,
        sourceEntryId: entryId,
        sourceSide: side,
      }
    }
    return {
      kind: 'scratch',
      sourceSessionId: activeDiffSessionId,
      sourceEntryId: entryId,
      sourceSide: side,
    }
  }

  async function saveAllDocuments() {
    const result = await workspaceDocumentController.saveAll()
    if (result?.ok) await runCompare()
  }

  function toggleAllFileDiffs() {
    if (directoryDiffsAllCollapsed) {
      expandAllRevision += 1
    } else {
      collapseAllRevision += 1
    }
  }

  async function runCompareFromToolbar() {
    if (toolbarReloadPending || loading) {
      return
    }

    toolbarReloadPending = true
    try {
      await runCompare()
    } finally {
      toolbarReloadPending = false
    }
  }

  // Planned file operations are preview state for one specific compare;
  // switching source or compared paths invalidates every recorded plan.
  $: compareIdentityKey = JSON.stringify({ activeDiffSource, leftPath, rightPath })
  $: compareIdentityKey, clearPlannedOperations()

  function toggleSidebarPanel(panel: 'diffStats' | 'systemMonitor') {
    activeSidebarPanel = activeSidebarPanel === panel ? null : panel
  }

  function isEditableTarget(target: EventTarget | null) {
    if (!(target instanceof HTMLElement)) {
      return false
    }

    const tagName = target.tagName.toLowerCase()
    return (
      tagName === 'input' ||
      tagName === 'textarea' ||
      tagName === 'select' ||
      target.isContentEditable
    )
  }

  function handleCompareKeydown(event: KeyboardEvent) {
    if ((event.ctrlKey || event.metaKey) && event.shiftKey && event.key.toLowerCase() === 'f') {
      event.preventDefault()
      comparisonSearch.update((state) => ({ ...state, open: true }))
      return
    }
    if (event.key === 'F3') {
      event.preventDefault()
      workspaceSearchController.next(event.shiftKey ? -1 : 1)
      const state = $comparisonSearch
      const match = state.results[state.selectedIndex]
      if (match) void navigateToSearchMatch(match)
      return
    }
    if (
      mode !== 'directory' ||
      event.defaultPrevented ||
      event.altKey ||
      event.ctrlKey ||
      event.metaKey ||
      isEditableTarget(event.target)
    ) {
      return
    }

    if (event.key === 'F2') {
      event.preventDefault()
      toggleSidebarPanel('diffStats')
    }
  }

  async function navigateToSearchMatch(match: SearchMatch) {
    const entry = directoryEntries.find((candidate) => candidate.diffEntryId === match.entryId)
    if (entry && selectedRelativePath !== entry.relativePath) await selectEntry(entry)
    if ($documentWorkspace.mode === 'edit') {
      await workspaceDocumentController.open(match.target)
      workspaceDocumentController.focusMatch(
        match.target,
        match.lineNumber,
        match.startColumn,
        match.endColumn,
      )
    }
  }
</script>

<svelte:window on:keydown={handleCompareKeydown} />

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

    {#snippet leading()}
      {#if showGitScopeTabs}
        <GitScopeTabs
          scope={gitScope}
          counts={gitScopeCounts}
          onSelect={setGitScope}
          disabled={loading}
        />
      {/if}
    {/snippet}

    {#snippet actions()}
    <div class="compare-actions">
      <div class="compare-action-group display-actions">
        <button
          aria-label={viewMode === 'sideBySide' ? 'Switch to unified view' : 'Switch to split view'}
          aria-pressed={viewMode === 'unified'}
          class="secondary toolbar-button icon-button view-mode-button"
          disabled={!textDiffActive}
          title={viewMode === 'sideBySide' ? 'Split view — click for unified' : 'Unified view — click for split'}
          type="button"
          on:click={toggleViewMode}
        >
          {#if viewMode === 'sideBySide'}
            <svg aria-hidden="true" class="view-mode-icon" viewBox="0 0 16 16">
              <rect x="2.5" y="3" width="4.2" height="10" rx="1.2" fill="none" stroke="currentColor" stroke-width="1.3" />
              <rect x="9.3" y="3" width="4.2" height="10" rx="1.2" fill="none" stroke="currentColor" stroke-width="1.3" />
            </svg>
          {:else}
            <svg aria-hidden="true" class="view-mode-icon" viewBox="0 0 16 16">
              <rect x="2.5" y="3" width="11" height="10" rx="1.5" fill="none" stroke="currentColor" stroke-width="1.3" />
              <path d="M4.8 5.5h6.4M4.8 8h6.4M4.8 10.5h4.2" fill="none" stroke="currentColor" stroke-linecap="round" stroke-width="1.3" />
            </svg>
          {/if}
        </button>

        <div class="workspace-mode-switcher" aria-label="Workspace mode">
          <button
            class:active={$documentWorkspace.mode === 'review'}
            aria-pressed={$documentWorkspace.mode === 'review'}
            class="secondary toolbar-button"
            type="button"
            on:click={() => selectWorkspaceMode('review')}
          >Review</button>
          <button
            class:active={$documentWorkspace.mode === 'edit'}
            aria-pressed={$documentWorkspace.mode === 'edit'}
            class="secondary toolbar-button"
            type="button"
            disabled={!activeDiffSessionId || !textDiffActive}
            on:click={() => selectWorkspaceMode('edit')}
          >Edit</button>
          <button
            class:active={$documentWorkspace.mode === 'resolve'}
            aria-pressed={$documentWorkspace.mode === 'resolve'}
            class="secondary toolbar-button"
            type="button"
            disabled={selectedEntry?.diffEntryStatus !== 'conflicted'}
            on:click={() => selectWorkspaceMode('resolve')}
          >Resolve</button>
        </div>

        {#if $documentWorkspace.mode === 'edit' && activeDiffSource?.kind === 'local'}
          <button class="secondary toolbar-button" type="button" on:click={() => openSelectedDocument('left')}>Edit Left</button>
          <button class="secondary toolbar-button" type="button" on:click={() => openSelectedDocument('right')}>Edit Right</button>
        {/if}

        {#if mode === 'directory'}
          <button
            aria-label={directoryDiffsAllCollapsed ? 'Expand all file diffs' : 'Collapse all file diffs'}
            class="secondary toolbar-button icon-button collapse-all-button"
            disabled={directoryEntries.length === 0}
            title={directoryDiffsAllCollapsed ? 'Expand all file diffs' : 'Collapse all file diffs'}
            type="button"
            on:click={toggleAllFileDiffs}
          >
            <ToolbarSvgIcon
              src={directoryDiffsAllCollapsed ? expandAllIconUrl : collapseAllIconUrl}
              className="collapse-all-icon"
            />
          </button>
        {/if}
      </div>

      {#if srcActions.openExternal}
        <div class="compare-action-group external-actions">
          <button
            class="secondary toolbar-button"
            aria-label={srcActions.openExternal.ariaLabel}
            title={srcActions.openExternal.ariaLabel}
            type="button"
            on:click={() => srcActions.openExternal && openExternalUrl(srcActions.openExternal.url)}
          >
            {srcActions.openExternal.label}
          </button>
        </div>
      {/if}

      <div class="compare-action-group utility-actions">
        <button
          class:active={$comparisonSearch.open}
          aria-pressed={$comparisonSearch.open}
          class="secondary toolbar-button"
          type="button"
          disabled={!activeDiffSessionId}
          on:click={() => comparisonSearch.update((state) => ({ ...state, open: !state.open }))}
        >Search</button>
        {#if srcActions.showSwap}
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
        {/if}

        <button
          aria-label={compareNeedsRefresh ? 'Reload to apply comparison rule changes' : 'Reload compare'}
          aria-busy={loading || toolbarReloadPending}
          class:compare-action-busy={loading || toolbarReloadPending}
          class:pending-refresh={compareNeedsRefresh}
          class="secondary toolbar-button icon-button refresh-button"
          title={compareNeedsRefresh ? 'Reload to apply comparison rule changes' : 'Reload compare'}
          type="button"
          disabled={loading || toolbarReloadPending}
          on:click={runCompareFromToolbar}
        >
          <span class="refresh-icon-slot" aria-hidden="true">
            {#if loading || toolbarReloadPending}
              <span class="refresh-spinner visible"></span>
            {:else}
              <ToolbarSvgIcon src={reloadIconUrl} className="refresh-icon" />
            {/if}
          </span>
        </button>
      </div>

      <div class="compare-action-group global-actions">
        <button
          class="secondary toolbar-button"
          type="button"
          disabled={$dirtyDocumentCount === 0}
          on:click={saveAllDocuments}
        >Save All{#if $dirtyDocumentCount > 0} ({$dirtyDocumentCount}){/if}</button>
        <button
          class="secondary toolbar-button icon-button settings-button"
          aria-label="Settings"
          title="Settings"
          type="button"
          on:click={() => openSettings('compare')}
        >
          <ToolbarSvgIcon src={settingsIconUrl} className="settings-icon" />
        </button>
        <button
          class="secondary toolbar-button icon-button toolbar-back-button"
          aria-label="Back"
          title="Back"
          type="button"
          on:click={goToSetup}
        >
          <ToolbarSvgIcon src={backIconUrl} className="back-icon" />
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
    class:search-panel-open={$comparisonSearch.open && Boolean(activeDiffSessionId)}
    class:review-panel-open={showHunkReviewPanel}
    class="compare-layout"
    style:--compare-sidebar-width={mode === 'directory' ? `${compareSidebarWidth}px` : undefined}
  >
    {#if mode === 'directory'}
      <CompareDirectorySidebar
        {loading}
        {directoryEntries}
        entriesRevision={directoryEntriesRevision}
        {selectedRelativePath}
        {treeSettings}
        {appearanceSettings}
        {resolvedThemeMode}
        {selectEntry}
        contextMenuSource={activeDiffSource}
        {PierreDirectoryTreeComponent}
        {diffStats}
        {systemMonitor}
        activePanel={activeSidebarPanel}
        onSetActivePanel={toggleSidebarPanel}
      />
      <button
        aria-label="Resize file list panel"
        class="compare-sidebar-resizer"
        type="button"
        on:dblclick={resetCompareSidebarWidth}
        on:pointerdown={startCompareSidebarResize}
      ></button>
    {/if}

    {#if $documentWorkspace.mode === 'edit' && $activeWorkspaceDocument}
      <WorkspaceEditor
        state={$activeWorkspaceDocument}
        {appearanceSettings}
        {resolvedThemeMode}
        onSaved={runCompare}
      />
    {:else if $documentWorkspace.mode === 'resolve' && activeDiffSessionId && selectedEntryId && selectedEntry?.diffEntryStatus === 'conflicted'}
      <MergeConflictViewer
        sessionId={activeDiffSessionId}
        entryId={selectedEntryId}
        {appearanceSettings}
        {resolvedThemeMode}
        onResolved={runCompare}
      />
    {:else if $documentWorkspace.mode === 'resolve'}
      <section class="compare-viewer">
        <div class="compare-viewer-state">
          <p>Select a conflicted file to resolve.</p>
        </div>
      </section>
    {:else if CompareViewerComponent}
      <svelte:component
        this={CompareViewerComponent}
        {mode}
        {activeDiff}
        {detailLoader}
        {emptyMessage}
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
        {onDiffStatsChange}
        calculateAllStats={activeSidebarPanel === 'diffStats'}
        {onSystemMonitorChange}
        resolveEntryBases={getDetailBasesForPath}
        reviewModeEnabled={$reviewModeEnabled}
        {reviewSourceKind}
        onReviewRefresh={runCompare}
        {collapseAllRevision}
        {expandAllRevision}
        onDirectoryCollapseStateChange={(allCollapsed) => {
          directoryDiffsAllCollapsed = allCollapsed
        }}
      />
    {:else}
      <section class="compare-viewer">
        <div class="compare-viewer-state">
          <span class="refresh-spinner visible"></span>
          <p>Opening compare view...</p>
        </div>
      </section>
    {/if}

    {#if $comparisonSearch.open && activeDiffSessionId}
      <SearchPanel
        sessionId={activeDiffSessionId}
        onNavigate={navigateToSearchMatch}
      />
    {/if}
    {#if showHunkReviewPanel && activeDiffSessionId && selectedEntryId}
      <HunkReviewPanel
        sessionId={activeDiffSessionId}
        entryId={selectedEntryId}
        sourceKind={activeDiffSource?.kind === 'local' ? 'local' : 'git'}
        {gitScope}
        onApplied={runCompare}
      />
    {/if}
  </section>

  <CompareLoadingOverlay state={compareLoadingState} />
</main>
