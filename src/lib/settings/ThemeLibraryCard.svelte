<script lang="ts">
  import type { ThemeDefinition, ThemeVariant } from '../theme'

  export let label: string
  export let lightTheme: ThemeDefinition | undefined
  export let darkTheme: ThemeDefinition | undefined
  export let activeLightId: string
  export let activeDarkId: string
  export let onUseTheme: (variant: ThemeVariant, themeId: string) => void
  export let onUseBoth: () => void
  export let onCustomize: () => void

  function circleStyle(theme: ThemeDefinition) {
    const baseTarget = theme.variant === 'dark' ? '#000000' : '#ffffff'
    const edge = theme.variant === 'dark' ? 'rgba(255,255,255,.14)' : 'rgba(0,0,0,.10)'
    return [
      `background-color:color-mix(in oklab, ${theme.surface} 90%, ${baseTarget})`,
      `background-image:radial-gradient(circle at 70% 30% in oklab, ${theme.accent} 0%, color-mix(in oklab, ${theme.accent} 32%, transparent) 38%, transparent 70%),radial-gradient(circle at 22% 78% in oklab, color-mix(in oklab, ${theme.semanticColors.skill} 18%, transparent) 0%, transparent 62%)`,
      `box-shadow:inset 0 0 0 1px ${edge},0 1px 2px rgba(0,0,0,.16)`,
    ].join(';')
  }
</script>

<div
  class="t3-theme-card"
  class:active={(lightTheme?.id === activeLightId) || (darkTheme?.id === activeDarkId)}
  role="group"
  aria-label={`${label} theme`}
>
  <div class="t3-theme-circles">
    {#if lightTheme}
      {@const selected = lightTheme.id === activeLightId}
      <button
        aria-label={`Use ${label} for light mode`}
        aria-pressed={selected}
        class:selected
        class="t3-theme-circle-button"
        title="Use for light mode only"
        type="button"
        on:click|stopPropagation={() => onUseTheme('light', lightTheme!.id)}
      >
        <span class="t3-theme-circle" style={circleStyle(lightTheme)}></span>
        {#if selected}
          <span aria-hidden="true" class="t3-theme-mode-badge">
            <svg viewBox="0 0 16 16"><circle cx="8" cy="8" r="3"></circle><path d="M8 1.8v1.5M8 12.7v1.5M1.8 8h1.5M12.7 8h1.5M3.6 3.6l1 1M11.4 11.4l1 1M12.4 3.6l-1 1M4.6 11.4l-1 1"></path></svg>
          </span>
        {/if}
      </button>
    {/if}

    {#if darkTheme}
      {@const selected = darkTheme.id === activeDarkId}
      <button
        aria-label={`Use ${label} for dark mode`}
        aria-pressed={selected}
        class:selected
        class="t3-theme-circle-button"
        title="Use for dark mode only"
        type="button"
        on:click|stopPropagation={() => onUseTheme('dark', darkTheme!.id)}
      >
        <span class="t3-theme-circle" style={circleStyle(darkTheme)}></span>
        {#if selected}
          <span aria-hidden="true" class="t3-theme-mode-badge">
            <svg viewBox="0 0 16 16"><path d="M12.7 10.4A5.4 5.4 0 0 1 5.6 3.3 5.5 5.5 0 1 0 12.7 10.4Z"></path></svg>
          </span>
        {/if}
      </button>
    {/if}
  </div>

  <div class="t3-theme-card-footer">
    <button
      aria-label={`Use ${label} theme`}
      class="t3-theme-card-name"
      type="button"
      on:click|stopPropagation={onUseBoth}
    >{label}</button>
    <button
      aria-label={`Edit ${label}`}
      class="t3-theme-card-action"
      title="Edit theme"
      type="button"
      on:click|stopPropagation={onCustomize}
    >
      <svg aria-hidden="true" viewBox="0 0 16 16"><path d="m10.8 2.6 2.6 2.6-7.5 7.5-3.2.6.6-3.2 7.5-7.5Z"></path><path d="m9.5 3.9 2.6 2.6"></path></svg>
    </button>
  </div>
</div>
