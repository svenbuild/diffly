<script lang="ts">
  import type { SetupMode } from '../types'

  export let mode: SetupMode
  export let onChange: (mode: SetupMode) => void

  const options: Array<{ value: SetupMode; label: string }> = [
    { value: 'local', label: 'Local' },
    { value: 'git', label: 'Git' },
    { value: 'github', label: 'GitHub' },
  ]
</script>

<div
  class="segmented-control toolbar-segmented-control setup-mode-slider"
  role="group"
  aria-label="Setup source"
>
  {#each options as option}
    <button
      aria-pressed={mode === option.value}
      class:active={mode === option.value}
      type="button"
      on:click={() => onChange(option.value)}
    >
      <span>{option.label}</span>
    </button>
  {/each}
</div>

<style>
  .setup-mode-slider {
    flex: 0 0 auto;
  }
</style>
