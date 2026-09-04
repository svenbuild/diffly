<script lang="ts">
  import type { ThemeDefinition } from '../theme'

  export let panes: Array<{
    theme: ThemeDefinition
    clip?: 'left' | 'right'
  }>

  function paneStyle(theme: ThemeDefinition) {
    return `--wire-canvas:${theme.surface};--wire-sidebar:color-mix(in srgb, ${theme.surface} 86%, ${theme.ink});--wire-panel:color-mix(in srgb, ${theme.surface} 94%, ${theme.ink});--wire-muted:color-mix(in srgb, ${theme.surface} 80%, ${theme.ink});--wire-accent:${theme.accent};--wire-action:${theme.semanticColors.skill}`
  }
</script>

<span aria-hidden="true" class="t3-theme-wireframe">
  {#each panes as pane}
    <span
      class:clip-left={pane.clip === 'left'}
      class:clip-right={pane.clip === 'right'}
      class="t3-theme-wireframe-pane"
      style={paneStyle(pane.theme)}
    >
      <span class="t3-wire-sidebar"></span>
      <span class="t3-wire-search"></span>
      <span class="t3-wire-thread t3-wire-thread-active"></span>
      <span class="t3-wire-thread t3-wire-thread-two"></span>
      <span class="t3-wire-thread t3-wire-thread-three"></span>
      <span class="t3-wire-message"></span>
      <span class="t3-wire-copy t3-wire-copy-one"></span>
      <span class="t3-wire-copy t3-wire-copy-two"></span>
      <span class="t3-wire-composer">
        <span></span>
        <i></i>
      </span>
      <span class="t3-wire-island">
        <i></i><span></span>
        <i></i><span></span>
        <i></i><span></span>
      </span>
    </span>
  {/each}
</span>
