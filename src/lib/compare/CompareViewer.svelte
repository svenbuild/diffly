<script lang="ts">
  import PierreDiffViewer from './PierreDiffViewer.svelte'
  import DirectoryDiffList from './DirectoryDiffList.svelte'
  import UnsupportedCompareView from './UnsupportedCompareView.svelte'
  import type { AppearanceSettings } from '../theme'
  import type {
    CompareMode,
    CompareViewerSettings,
    DirectoryEntryResult,
    EntryStatus,
    FileDiffResult,
    ViewMode,
  } from '../types'

  export let mode: CompareMode = 'file'
  export let activeDiff: FileDiffResult | null
  export let directoryEntries: DirectoryEntryResult[] = []
  export let selectedRelativePath = ''
  export let loading = false
  export let detailLoading = false
  export let viewerSettings: CompareViewerSettings
  export let appearanceSettings: AppearanceSettings
  export let resolvedThemeMode: 'light' | 'dark'
  export let viewMode: ViewMode
  export let statusLabel: Record<EntryStatus, string>
  export let revision = 0
  export let loadEntryDiff: (entry: DirectoryEntryResult) => Promise<FileDiffResult>
  export let selectEntry: (entry: DirectoryEntryResult) => Promise<void>
</script>

<section class="compare-viewer">
  {#if mode === 'directory'}
    <DirectoryDiffList
      {directoryEntries}
      {selectedRelativePath}
      {loading}
      {viewerSettings}
      {appearanceSettings}
      {resolvedThemeMode}
      {viewMode}
      {statusLabel}
      {revision}
      {loadEntryDiff}
      {selectEntry}
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
    />
  {:else}
    <UnsupportedCompareView
      unsupported={activeDiff.unsupported ?? null}
      summary={activeDiff.summary}
    />
  {/if}
</section>
