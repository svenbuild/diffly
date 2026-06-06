<script lang="ts">
  import DiffPreview from './DiffPreview.svelte'
  import type { CompareViewerSettings, ViewMode } from '../types'
  import type { AppearanceSettings } from '../theme'

  interface PaletteSwatch {
    label: string
    value: string
  }

  export let title: string
  export let themeLabel: string
  export let previewStyle = ''
  export let palette: PaletteSwatch[] = []
  export let viewerSettings: CompareViewerSettings
  export let viewMode: ViewMode
  export let appearanceSettings: AppearanceSettings
  export let resolvedThemeMode: 'light' | 'dark'
</script>

<div class="settings-appearance-preview-card" style={previewStyle}>
  <div class="settings-appearance-preview-header">
    <strong>{title}</strong>
    <span>{themeLabel}</span>
  </div>

  <DiffPreview
    bare
    height={208}
    leftLabel="palette.ts"
    rightLabel="palette.ts"
    {viewerSettings}
    {viewMode}
    {appearanceSettings}
    {resolvedThemeMode}
  />

  {#if palette.length > 0}
    <div class="settings-appearance-preview-palette">
      {#each palette as swatch}
        <span class="settings-appearance-preview-swatch">
          <span
            aria-hidden="true"
            class="settings-appearance-preview-swatch-dot"
            style={`background:${swatch.value}`}
          ></span>
          <span class="settings-appearance-preview-swatch-text">
            <span class="settings-appearance-preview-swatch-label">{swatch.label}</span>
            <span class="settings-appearance-preview-swatch-value">{swatch.value}</span>
          </span>
        </span>
      {/each}
    </div>
  {/if}
</div>
