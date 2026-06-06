<script lang="ts">
  import ThemeEditorPanel from './ThemeEditorPanel.svelte'
  import ThemePreviewCard from './ThemePreviewCard.svelte'
  import type { AppearanceSettings, ThemeDefinition, ThemeSemanticColorKey, ThemeVariant } from '../theme'
  import { createThemeCssVariables } from '../theme/runtime'

  interface RenderedDiffFragment {
    text: string
    highlighted: boolean
    className: string
  }

  interface PreviewLine {
    lineNumber: number
    fragments: RenderedDiffFragment[]
  }

  interface PreviewStyleOptions {
    codeFontSize: number
    uiFontSize: number
    showInlineHighlights: boolean
    showSyntaxHighlighting: boolean
    usePointerCursor: boolean
  }

  interface ThemeState {
    availableThemes: ThemeDefinition[]
    basePreviewLines: PreviewLine[]
    presetId: string
    previewStyle: string
    theme: ThemeDefinition
    viewerPreviewLines: PreviewLine[]
  }

  export let appearanceSettings: AppearanceSettings
  export let lightTheme: ThemeDefinition
  export let darkTheme: ThemeDefinition
  export let visibleThemeVariants: ThemeVariant[]
  export let availableLightThemes: ThemeDefinition[]
  export let availableDarkThemes: ThemeDefinition[]
  export let showInlineHighlights: boolean
  export let showSyntaxHighlighting: boolean
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

  let previewStyleOptions: PreviewStyleOptions
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

  function buildInlineStyle(values: Record<string, string>) {
    return Object.entries(values)
      .map(([property, value]) => `${property}: ${value}`)
      .join('; ')
  }

  function getPreviewStyle(theme: ThemeDefinition, previewOptions: PreviewStyleOptions) {
    const previewVariables = createThemeCssVariables(theme, {
      codeFontSize: previewOptions.codeFontSize,
      uiFontSize: previewOptions.uiFontSize,
      usePointerCursor: previewOptions.usePointerCursor,
    })

    return buildInlineStyle({
      ...previewVariables,
      '--preview-surface': previewVariables['--diff-context-bg'],
      '--preview-ink': previewVariables['--text'],
      '--preview-added': previewVariables['--diff-insert-bg'],
      '--preview-added-text': previewVariables['--diff-insert-text'],
      '--preview-removed': previewVariables['--diff-delete-bg'],
      '--preview-removed-text': previewVariables['--diff-delete-text'],
      '--preview-diff-divider': previewVariables['--diff-divider'],
      '--preview-line-number': previewVariables['--muted'],
      '--preview-ui-font': theme.fonts.ui ?? previewVariables['--ui-font'],
      '--preview-code-font': theme.fonts.code ?? previewVariables['--code'],
      '--preview-code-font-size': previewVariables['--code-font-size'],
    })
  }

  function buildPreviewFragments(
    text: string,
    segments: Array<{ text: string; highlighted: boolean }>,
    previewOptions: PreviewStyleOptions,
  ) {
    const sourceSegments = previewOptions.showInlineHighlights && segments.length > 0
      ? segments
      : [{ text, highlighted: false }]

    return sourceSegments.map((segment) => ({
      text: segment.text,
      highlighted: segment.highlighted,
      className: previewOptions.showSyntaxHighlighting ? 'syntax-token property' : '',
    }))
  }

  function createPreviewLine(
    lineNumber: number,
    text: string,
    previewOptions: PreviewStyleOptions,
    segments: Array<{ text: string; highlighted: boolean }> = [],
  ): PreviewLine {
    return {
      lineNumber,
      fragments: buildPreviewFragments(text, segments, previewOptions),
    }
  }

  function getPreviewLines(
    theme: ThemeDefinition,
    pane: 'base' | 'viewer',
    previewOptions: PreviewStyleOptions,
  ): PreviewLine[] {
    const isViewer = pane === 'viewer'
    const surfaceValue = isViewer ? 'sidebar-elevated' : 'sidebar'
    const contrastValue = isViewer ? theme.contrast : Math.max(theme.contrast - 8, 0)

    return [
      createPreviewLine(1, 'export const theme = {', previewOptions),
      createPreviewLine(2, '  name: "Diffly",', previewOptions),
      createPreviewLine(3, `  surface: "${surfaceValue}",`, previewOptions, [
        { text: '  surface: "', highlighted: false },
        { text: surfaceValue, highlighted: true },
        { text: '",', highlighted: false },
      ]),
      createPreviewLine(4, `  accent: "${theme.accent}",`, previewOptions, [
        { text: '  accent: "', highlighted: false },
        { text: theme.accent, highlighted: true },
        { text: '",', highlighted: false },
      ]),
      createPreviewLine(5, `  contrast: ${contrastValue},`, previewOptions, [
        { text: '  contrast: ', highlighted: false },
        { text: String(contrastValue), highlighted: true },
        { text: ',', highlighted: false },
      ]),
      createPreviewLine(6, '  radius: 10,', previewOptions),
      createPreviewLine(7, '  font: "Cascadia Code",', previewOptions),
      createPreviewLine(8, '  render(node) {', previewOptions),
      createPreviewLine(9, '    return paint(node, this.accent)', previewOptions),
      createPreviewLine(10, '  },', previewOptions),
      createPreviewLine(11, '};', previewOptions),
    ]
  }

  $: previewStyleOptions = {
    codeFontSize: appearanceSettings.codeFontSize,
    uiFontSize: appearanceSettings.uiFontSize,
    showInlineHighlights,
    showSyntaxHighlighting,
    usePointerCursor: appearanceSettings.usePointerCursor,
  }

  $: resolvedThemeState = {
    light: {
      availableThemes: availableLightThemes,
      basePreviewLines: getPreviewLines(lightTheme, 'base', previewStyleOptions),
      presetId: appearanceSettings.lightThemeId,
      previewStyle: getPreviewStyle(lightTheme, previewStyleOptions),
      theme: lightTheme,
      viewerPreviewLines: getPreviewLines(lightTheme, 'viewer', previewStyleOptions),
    },
    dark: {
      availableThemes: availableDarkThemes,
      basePreviewLines: getPreviewLines(darkTheme, 'base', previewStyleOptions),
      presetId: appearanceSettings.darkThemeId,
      previewStyle: getPreviewStyle(darkTheme, previewStyleOptions),
      theme: darkTheme,
      viewerPreviewLines: getPreviewLines(darkTheme, 'viewer', previewStyleOptions),
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
              previewStyle={themeState.previewStyle}
              basePreviewLines={themeState.basePreviewLines}
              viewerPreviewLines={themeState.viewerPreviewLines}
              palette={getThemePalette(themeState.theme)}
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
