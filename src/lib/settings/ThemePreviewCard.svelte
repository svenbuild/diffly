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

  export let title: string
  export let themeLabel: string
  export let previewStyle: string
  export let basePreviewLines: PreviewLine[]
  export let viewerPreviewLines: PreviewLine[]
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
</div>
