<script lang="ts">
  import PierreDiffViewer from './PierreDiffViewer.svelte'
  import DirectoryDiffList from './DirectoryDiffList.svelte'
  import UnsupportedCompareView from './UnsupportedCompareView.svelte'
  import type { CompareSourceKind } from '../actions/compare-actions'
  import type { AppearanceSettings } from '../theme'
  import type {
    CompareMode,
    CompareOptions,
    CompareViewerSettings,
    DiffStatsSnapshot,
    SystemMonitorSnapshot,
    DirectoryDetailLoader,
    DirectoryEntryResult,
    FileDiffResult,
    ViewMode,
  } from '../types'

  export let mode: CompareMode = 'file'
  export let activeDiff: FileDiffResult | null
  export let detailLoader: DirectoryDetailLoader = { kind: 'localPaths' }
  export let emptyMessage = 'No file changes.'
  export let directoryEntries: DirectoryEntryResult[] = []
  export let selectedRelativePath = ''
  export let scrollTargetRevision = 0
  export let loading = false
  export let detailLoading = false
  export let viewerSettings: CompareViewerSettings
  export let appearanceSettings: AppearanceSettings
  export let resolvedThemeMode: 'light' | 'dark'
  export let viewMode: ViewMode
  export let revision = 0
  export let leftPath = ''
  export let rightPath = ''
  export let compareOptions: CompareOptions = {
    ignoreWhitespace: false,
    ignoreCase: false,
  }
  export let transitionActive = false
  export let onDiffStatsChange: (stats: DiffStatsSnapshot) => void = () => {}
  export let calculateAllStats = false
  export let onSystemMonitorChange: (stats: SystemMonitorSnapshot) => void = () => {}
  export let resolveEntryBases: (relativePath: string) => {
    leftBase: string
    rightBase: string
    relativePath: string
  } = (relativePath) => ({
    leftBase: leftPath,
    rightBase: rightPath,
    relativePath,
  })
  export let reviewModeEnabled = false
  export let reviewSourceKind: CompareSourceKind = 'local'
  export let reviewSessionId: string | null = null
  export let reviewEntryId = 'file'
  export let onReviewRefresh: () => Promise<void> | void = () => {}
  export let collapseAllRevision = 0
  export let expandAllRevision = 0
  export let onDirectoryCollapseStateChange: (allCollapsed: boolean) => void = () => {}
</script>

<section class:compare-viewer-transitioning={transitionActive} class="compare-viewer">
  {#if mode === 'directory'}
    <DirectoryDiffList
      {directoryEntries}
      {selectedRelativePath}
      {scrollTargetRevision}
      {loading}
      {viewerSettings}
      {appearanceSettings}
      {resolvedThemeMode}
      {viewMode}
      {revision}
      {leftPath}
      {rightPath}
      {compareOptions}
      {onDiffStatsChange}
      {calculateAllStats}
      {onSystemMonitorChange}
      {resolveEntryBases}
      {detailLoader}
      {emptyMessage}
      {reviewModeEnabled}
      {reviewSourceKind}
      {onReviewRefresh}
      {collapseAllRevision}
      {expandAllRevision}
      onCollapseStateChange={onDirectoryCollapseStateChange}
    />
  {:else if loading || detailLoading}
    <div class="compare-viewer-state">
      <span class="refresh-spinner visible"></span>
      <p>{loading ? 'Comparing files...' : 'Opening file...'}</p>
    </div>
  {:else if !activeDiff}
    <div class="compare-viewer-state">
      <p>No file selected.</p>
    </div>
  {:else if activeDiff.contentKind === 'text' && activeDiff.text}
    <PierreDiffViewer
      text={activeDiff.text}
      leftLabel={activeDiff.leftLabel}
      rightLabel={activeDiff.rightLabel}
      {viewerSettings}
      {appearanceSettings}
      {resolvedThemeMode}
      {viewMode}
      {onSystemMonitorChange}
      {reviewModeEnabled}
      {reviewSourceKind}
      reviewLeftPath={leftPath}
      reviewRightPath={rightPath}
      {reviewSessionId}
      {reviewEntryId}
      {onReviewRefresh}
    />
  {:else}
    <UnsupportedCompareView
      unsupported={activeDiff.unsupported ?? null}
      summary={activeDiff.summary}
    />
  {/if}
</section>
