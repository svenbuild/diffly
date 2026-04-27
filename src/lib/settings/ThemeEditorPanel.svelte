<script lang="ts">
  import type { ThemeDefinition, ThemeSemanticColorKey, ThemeVariant } from '../theme'

  interface ThemeState {
    availableThemes: ThemeDefinition[]
    presetId: string
    theme: ThemeDefinition
  }

  export let title: string
  export let subtitle: string
  export let variant: ThemeVariant
  export let themeState: ThemeState
  export let formatThemeLabel: (value: string) => string
  export let onSetThemePreset: (variant: ThemeVariant, themeId: string) => void
  export let onSetThemeColor: (
    variant: ThemeVariant,
    field: 'accent' | 'surface' | 'ink',
    value: string,
  ) => void
  export let onSetThemeSemanticColor: (
    variant: ThemeVariant,
    field: ThemeSemanticColorKey,
    value: string,
  ) => void
  export let onSetThemeFont: (variant: ThemeVariant, field: 'ui' | 'code', value: string) => void
  export let onSetThemeContrast: (variant: ThemeVariant, value: number) => void

  let presetMenuOpen = false
  let presetMenuEl: HTMLDivElement | null = null

  function getFontValue(field: 'ui' | 'code') {
    const value = field === 'ui' ? themeState.theme.fonts.ui : themeState.theme.fonts.code
    return value ?? ''
  }

  function getColorValueStyle(color: string) {
    return buildInlineStyle({
      '--settings-color-value-bg': color,
      '--settings-color-value-text': pickReadableSwatchText(color),
    })
  }

  function buildInlineStyle(values: Record<string, string>) {
    return Object.entries(values)
      .map(([property, value]) => `${property}: ${value}`)
      .join('; ')
  }

  function pickReadableSwatchText(color: string) {
    return relativeLuminance(parseHexColor(color)) > 0.5 ? '#111111' : '#FFFFFF'
  }

  function parseHexColor(value: string) {
    const normalized = value.trim().replace(/^#/, '')

    return {
      r: Number.parseInt(normalized.slice(0, 2), 16),
      g: Number.parseInt(normalized.slice(2, 4), 16),
      b: Number.parseInt(normalized.slice(4, 6), 16),
    }
  }

  function relativeLuminance(value: { r: number; g: number; b: number }) {
    const toLinear = (channel: number) => {
      const normalized = channel / 255

      if (normalized <= 0.03928) {
        return normalized / 12.92
      }

      return ((normalized + 0.055) / 1.055) ** 2.4
    }

    return 0.2126 * toLinear(value.r) + 0.7152 * toLinear(value.g) + 0.0722 * toLinear(value.b)
  }

  function selectPreset(themeId: string) {
    onSetThemePreset(variant, themeId)
    presetMenuOpen = false
  }

  function handleWindowClick(event: MouseEvent) {
    if (!presetMenuOpen || presetMenuEl?.contains(event.target as Node)) {
      return
    }

    presetMenuOpen = false
  }

  function handleWindowKeydown(event: KeyboardEvent) {
    if (event.key === 'Escape') {
      presetMenuOpen = false
    }
  }
</script>

<svelte:window on:click={handleWindowClick} on:keydown={handleWindowKeydown} />

<section class="settings-theme-editor">
  <header class="settings-theme-editor-header">
    <div class="settings-theme-editor-title">
      <strong>{title}</strong>
      <span>{subtitle}</span>
    </div>

    <div class="settings-theme-editor-actions">
      <div bind:this={presetMenuEl} class="settings-theme-select">
        <button
          aria-expanded={presetMenuOpen}
          aria-haspopup="listbox"
          aria-label={`${title} preset`}
          class="settings-theme-select-button"
          type="button"
          on:click={() => (presetMenuOpen = !presetMenuOpen)}
        >
          <span>{formatThemeLabel(themeState.presetId)}</span>
          <svg aria-hidden="true" viewBox="0 0 16 16">
            <path d="m4.5 6.2 3.5 3.6 3.5-3.6" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" />
          </svg>
        </button>

        {#if presetMenuOpen}
          <div class="settings-theme-select-menu" role="listbox" tabindex="-1">
          {#each themeState.availableThemes as preset}
            <button
              aria-selected={preset.id === themeState.presetId}
              class:active={preset.id === themeState.presetId}
              role="option"
              type="button"
              on:click={() => selectPreset(preset.id)}
            >
              {formatThemeLabel(preset.id)}
            </button>
          {/each}
          </div>
        {/if}
      </div>
    </div>
  </header>

  <div class="settings-theme-editor-grid">
    <div class="settings-theme-editor-row">
      <span>Accent</span>
      <label class="settings-color-control">
        <input
          aria-label={`${title} accent`}
          type="color"
          value={themeState.theme.accent}
          on:input={(event) =>
            onSetThemeColor(variant, 'accent', (event.currentTarget as HTMLInputElement).value)}
        />
        <span class="settings-color-value" style={getColorValueStyle(themeState.theme.accent)}>
          {themeState.theme.accent.toUpperCase()}
        </span>
      </label>
    </div>

    <div class="settings-theme-editor-row">
      <span>Surface</span>
      <label class="settings-color-control">
        <input
          aria-label={`${title} surface`}
          type="color"
          value={themeState.theme.surface}
          on:input={(event) =>
            onSetThemeColor(variant, 'surface', (event.currentTarget as HTMLInputElement).value)}
        />
        <span class="settings-color-value" style={getColorValueStyle(themeState.theme.surface)}>
          {themeState.theme.surface.toUpperCase()}
        </span>
      </label>
    </div>

    <div class="settings-theme-editor-row">
      <span>Text</span>
      <label class="settings-color-control">
        <input
          aria-label={`${title} text`}
          type="color"
          value={themeState.theme.ink}
          on:input={(event) =>
            onSetThemeColor(variant, 'ink', (event.currentTarget as HTMLInputElement).value)}
        />
        <span class="settings-color-value" style={getColorValueStyle(themeState.theme.ink)}>
          {themeState.theme.ink.toUpperCase()}
        </span>
      </label>
    </div>

    <div class="settings-theme-editor-row">
      <span>Syntax accent</span>
      <label class="settings-color-control">
        <input
          aria-label={`${title} syntax accent`}
          type="color"
          value={themeState.theme.semanticColors.skill}
          on:input={(event) =>
            onSetThemeSemanticColor(
              variant,
              'skill',
              (event.currentTarget as HTMLInputElement).value,
            )}
        />
        <span class="settings-color-value" style={getColorValueStyle(themeState.theme.semanticColors.skill)}>
          {themeState.theme.semanticColors.skill.toUpperCase()}
        </span>
      </label>
    </div>

    <div class="settings-theme-editor-row">
      <span>Added</span>
      <label class="settings-color-control">
        <input
          aria-label={`${title} added changes`}
          type="color"
          value={themeState.theme.semanticColors.diffAdded}
          on:input={(event) =>
            onSetThemeSemanticColor(
              variant,
              'diffAdded',
              (event.currentTarget as HTMLInputElement).value,
            )}
        />
        <span
          class="settings-color-value"
          style={getColorValueStyle(themeState.theme.semanticColors.diffAdded)}
        >
          {themeState.theme.semanticColors.diffAdded.toUpperCase()}
        </span>
      </label>
    </div>

    <div class="settings-theme-editor-row">
      <span>Removed</span>
      <label class="settings-color-control">
        <input
          aria-label={`${title} removed changes`}
          type="color"
          value={themeState.theme.semanticColors.diffRemoved}
          on:input={(event) =>
            onSetThemeSemanticColor(
              variant,
              'diffRemoved',
              (event.currentTarget as HTMLInputElement).value,
            )}
        />
        <span
          class="settings-color-value"
          style={getColorValueStyle(themeState.theme.semanticColors.diffRemoved)}
        >
          {themeState.theme.semanticColors.diffRemoved.toUpperCase()}
        </span>
      </label>
    </div>

    <div class="settings-theme-editor-row">
      <span>UI font</span>
      <input
        aria-label={`${title} UI font`}
        class="settings-theme-text-input"
        placeholder="Default app font"
        type="text"
        value={getFontValue('ui')}
        on:input={(event) =>
          onSetThemeFont(variant, 'ui', (event.currentTarget as HTMLInputElement).value)}
      />
    </div>

    <div class="settings-theme-editor-row">
      <span>Code font</span>
      <input
        aria-label={`${title} code font`}
        class="settings-theme-text-input"
        placeholder="Default monospace stack"
        type="text"
        value={getFontValue('code')}
        on:input={(event) =>
          onSetThemeFont(variant, 'code', (event.currentTarget as HTMLInputElement).value)}
      />
    </div>

    <div class="settings-theme-editor-row settings-theme-editor-row-full settings-theme-editor-row-slider">
      <span>Contrast</span>
      <div class="settings-theme-slider">
        <input
          aria-label={`${title} contrast`}
          max="100"
          min="0"
          type="range"
          value={themeState.theme.contrast}
          on:input={(event) =>
            onSetThemeContrast(variant, Number((event.currentTarget as HTMLInputElement).value))}
        />
        <span>{themeState.theme.contrast}</span>
      </div>
    </div>
  </div>
</section>
