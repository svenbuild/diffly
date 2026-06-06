<script lang="ts">
  import ThemeEditorPanel from './ThemeEditorPanel.svelte'
  import ThemePreviewCard from './ThemePreviewCard.svelte'
  import type { AppearanceSettings, ThemeDefinition, ThemeSemanticColorKey, ThemeVariant } from '../theme'
  import type { CompareViewerSettings, ViewMode } from '../types'

  interface ThemeState {
    availableThemes: ThemeDefinition[]
    presetId: string
    theme: ThemeDefinition
  }

  export let appearanceSettings: AppearanceSettings
  export let lightTheme: ThemeDefinition
  export let darkTheme: ThemeDefinition
  export let visibleThemeVariants: ThemeVariant[]
  export let availableLightThemes: ThemeDefinition[]
  export let availableDarkThemes: ThemeDefinition[]
  export let viewerSettings: CompareViewerSettings
  export let viewMode: ViewMode
  export let minUiFontSize: number
  export let maxUiFontSize: number
  export let minCodeFontSize: number
  export let maxCodeFontSize: number
  export let onSetThemeMode: (theme: AppearanceSettings['mode']) => void
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
  export let onSetUsePointerCursor: (value: boolean) => void
  export let onStepUiFontSize: (direction: -1 | 1) => void
  export let onStepCodeFontSize: (direction: -1 | 1) => void

  const themeTitles: Record<ThemeVariant, string> = {
    light: 'Light theme',
    dark: 'Dark theme',
  }

  const previewTitles: Record<ThemeVariant, string> = {
    light: 'Light preview',
    dark: 'Dark preview',
  }

  let resolvedThemeState: Record<ThemeVariant, ThemeState>

  function formatThemeLabel(value: string) {
    if (value === 'legacy-tuerkis') {
      return 'Original türkis'
    }

    return value
      .split('-')
      .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
      .join(' ')
  }

  function getThemeTitle(variant: ThemeVariant) {
    return themeTitles[variant]
  }

  function getThemePalette(theme: ThemeDefinition) {
    return [
      { label: 'Accent', value: theme.accent },
      { label: 'Surface', value: theme.surface },
      { label: 'Text', value: theme.ink },
      { label: 'Added', value: theme.semanticColors.diffAdded },
      { label: 'Removed', value: theme.semanticColors.diffRemoved },
      { label: 'Syntax', value: theme.semanticColors.skill },
    ]
  }

  function getPreviewTitle(variant: ThemeVariant) {
    return previewTitles[variant]
  }

  $: resolvedThemeState = {
    light: {
      availableThemes: availableLightThemes,
      presetId: appearanceSettings.lightThemeId,
      theme: lightTheme,
    },
    dark: {
      availableThemes: availableDarkThemes,
      presetId: appearanceSettings.darkThemeId,
      theme: darkTheme,
    },
  }
</script>

<section class="settings-page">
  <div class="settings-page-heading">
    <h2>Appearance</h2>
    <p>Choose how Diffly should look across the app.</p>
  </div>

  <section class="settings-group settings-appearance-group">
    <div class="settings-group-header">
      <h3>Color scheme</h3>
      <p>Presets control the full theme. The fields below override only what the UI exposes.</p>
    </div>

    <div class="settings-appearance-shell">
      <div class="settings-appearance-preview-column">
        <div class="settings-appearance-mode-bar">
          <span>Theme</span>
          <div
            class="segmented-control toolbar-segmented-control settings-theme-mode-control"
            role="group"
            aria-label="Theme mode"
          >
            <button
              aria-pressed={appearanceSettings.mode === 'light'}
              class:active={appearanceSettings.mode === 'light'}
              type="button"
              on:click={() => onSetThemeMode('light')}
            >
              <span>Light</span>
            </button>
            <button
              aria-pressed={appearanceSettings.mode === 'dark'}
              class:active={appearanceSettings.mode === 'dark'}
              type="button"
              on:click={() => onSetThemeMode('dark')}
            >
              <span>Dark</span>
            </button>
            <button
              aria-pressed={appearanceSettings.mode === 'system'}
              class:active={appearanceSettings.mode === 'system'}
              type="button"
              on:click={() => onSetThemeMode('system')}
            >
              <span>System</span>
            </button>
          </div>
        </div>

        <div class="settings-appearance-preview-grid" data-count={visibleThemeVariants.length}>
          {#each visibleThemeVariants as variant}
            {@const themeState = resolvedThemeState[variant]}
            <ThemePreviewCard
              title={getPreviewTitle(variant)}
              themeLabel={formatThemeLabel(themeState.theme.id)}
              palette={getThemePalette(themeState.theme)}
              {viewerSettings}
              {viewMode}
              {appearanceSettings}
              resolvedThemeMode={variant}
            />
          {/each}
        </div>
      </div>

      <div class="settings-theme-editor-stack">
        <div class="settings-theme-editor-variants" data-variant-count={visibleThemeVariants.length}>
          {#each visibleThemeVariants as variant}
            {@const themeState = resolvedThemeState[variant]}
            {#key `${variant}:${themeState.presetId}`}
              <ThemeEditorPanel
                title={getThemeTitle(variant)}
                subtitle="Preset changes stay in sync here. Manual edits become overrides."
                {variant}
                {themeState}
                {formatThemeLabel}
                {onSetThemePreset}
                {onSetThemeColor}
                {onSetThemeSemanticColor}
                {onSetThemeFont}
                {onSetThemeContrast}
              />
            {/key}
          {/each}
        </div>

        <section class="settings-theme-editor settings-theme-editor-global">
          <header class="settings-theme-editor-header">
            <div class="settings-theme-editor-title">
              <strong>Global appearance</strong>
              <span>These settings apply across both light and dark variants.</span>
            </div>
          </header>

          <div class="settings-theme-editor-grid">
            <label class="settings-theme-editor-row settings-theme-editor-row-interactive">
              <span>Use pointer cursors</span>
              <span class="settings-switch">
                <input
                  checked={appearanceSettings.usePointerCursor}
                  role="switch"
                  type="checkbox"
                  on:change={(event) =>
                    onSetUsePointerCursor((event.currentTarget as HTMLInputElement).checked)}
                />
                <span aria-hidden="true" class="settings-switch-ui"></span>
              </span>
            </label>

            <div class="settings-theme-editor-row">
              <span>UI font size</span>
              <div class="settings-stepper">
                <button
                  class="secondary settings-stepper-button"
                  disabled={appearanceSettings.uiFontSize <= minUiFontSize}
                  type="button"
                  on:click={() => onStepUiFontSize(-1)}
                >
                  -
                </button>
                <span class="settings-stepper-value">{appearanceSettings.uiFontSize}</span>
                <button
                  class="secondary settings-stepper-button"
                  disabled={appearanceSettings.uiFontSize >= maxUiFontSize}
                  type="button"
                  on:click={() => onStepUiFontSize(1)}
                >
                  +
                </button>
                <small class="settings-stepper-unit">px</small>
              </div>
            </div>

            <div class="settings-theme-editor-row">
              <span>Code font size</span>
              <div class="settings-stepper">
                <button
                  class="secondary settings-stepper-button"
                  disabled={appearanceSettings.codeFontSize <= minCodeFontSize}
                  type="button"
                  on:click={() => onStepCodeFontSize(-1)}
                >
                  -
                </button>
                <span class="settings-stepper-value">{appearanceSettings.codeFontSize}</span>
                <button
                  class="secondary settings-stepper-button"
                  disabled={appearanceSettings.codeFontSize >= maxCodeFontSize}
                  type="button"
                  on:click={() => onStepCodeFontSize(1)}
                >
                  +
                </button>
                <small class="settings-stepper-unit">px</small>
              </div>
            </div>
          </div>
        </section>
      </div>
    </div>
  </section>
</section>
