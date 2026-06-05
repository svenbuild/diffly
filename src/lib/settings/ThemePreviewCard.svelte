<script lang="ts">
  interface PreviewFragment {
    text: string
    highlighted: boolean
    className?: string | null
  }

  interface PreviewLine {
    lineNumber: number
    fragments: PreviewFragment[]
  }

  interface PaletteSwatch {
    label: string
    value: string
  }

  export let title: string
  export let themeLabel: string
  export let previewStyle: string
  export let basePreviewLines: PreviewLine[]
  export let viewerPreviewLines: PreviewLine[]
  export let palette: PaletteSwatch[] = []
</script>

<div class="settings-appearance-preview-card" style={previewStyle}>
  <div class="settings-appearance-preview-header">
    <strong>{title}</strong>
    <span>{themeLabel}</span>
  </div>

  <div class="settings-appearance-preview-diff">
    <div class="settings-appearance-preview-pane settings-appearance-preview-pane-removed">
      {#each basePreviewLines as line}
        <span class="settings-appearance-preview-line-number">{line.lineNumber}</span>
        <code class="settings-appearance-preview-code">
          {#each line.fragments as fragment}
            <span
              class:highlighted={fragment.highlighted}
              class={`line-fragment ${fragment.className ?? ''}`}
            >
              {fragment.text || ' '}
            </span>
          {/each}
        </code>
      {/each}
    </div>

    <div class="settings-appearance-preview-pane settings-appearance-preview-pane-added">
      {#each viewerPreviewLines as line}
        <span class="settings-appearance-preview-line-number">{line.lineNumber}</span>
        <code class="settings-appearance-preview-code">
          {#each line.fragments as fragment}
            <span
              class:highlighted={fragment.highlighted}
              class={`line-fragment ${fragment.className ?? ''}`}
            >
              {fragment.text || ' '}
            </span>
          {/each}
        </code>
      {/each}
    </div>
  </div>

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
