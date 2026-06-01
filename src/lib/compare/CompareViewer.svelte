<script lang="ts">
  import PierreDiffViewer from './PierreDiffViewer.svelte'
  import UnsupportedCompareView from './UnsupportedCompareView.svelte'
  import type { AppearanceSettings } from '../theme'
  import type { CompareViewerSettings, FileDiffResult, ViewMode } from '../types'

  export let activeDiff: FileDiffResult | null
  export let loading = false
  export let detailLoading = false
  export let viewerSettings: CompareViewerSettings
  export let appearanceSettings: AppearanceSettings
  export let resolvedThemeMode: 'light' | 'dark'
  export let viewMode: ViewMode
</script>

<section class="compare-viewer">
  {#if loading || detailLoading}
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
