<script lang="ts">
  import { detectSyntaxLanguage, renderDiffFragments, type RenderedDiffFragment } from '../syntax'
  import ThemeEditorPanel from './ThemeEditorPanel.svelte'
  import ThemePreviewCard from './ThemePreviewCard.svelte'
  import type { AppearanceSettings, ThemeDefinition, ThemeSemanticColorKey, ThemeVariant } from '../theme'
  import { createThemeCssVariables } from '../theme/runtime'

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

  const previewLanguage = detectSyntaxLanguage('theme-preview.ts')

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
    return renderDiffFragments(
      text,
      previewOptions.showInlineHighlights ? segments : [],
      previewOptions.showSyntaxHighlighting ? previewLanguage : null,
    )
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
    if (pane === 'base') {
      const surfaceText = '  surface: "sidebar",'
      const accentText = `  accent: "${theme.accent}",`
      const contrastText = `  contrast: ${Math.max(theme.contrast - 8, 0)},`

      return [
        createPreviewLine(1, 'const themePreview = {', previewOptions),
        createPreviewLine(2, surfaceText, previewOptions, [
          { text: '  surface: "', highlighted: false },
          { text: 'sidebar', highlighted: true },
          { text: '",', highlighted: false },
        ]),
        createPreviewLine(3, accentText, previewOptions, [
          { text: '  accent: "', highlighted: false },
          { text: theme.accent, highlighted: true },
          { text: '",', highlighted: false },
        ]),
        createPreviewLine(4, contrastText, previewOptions, [
          { text: '  contrast: ', highlighted: false },
          { text: String(Math.max(theme.contrast - 8, 0)), highlighted: true },
          { text: ',', highlighted: false },
        ]),
        createPreviewLine(5, '};', previewOptions),
      ]
    }

    const surfaceText = '  surface: "sidebar-elevated",'
    const accentText = `  accent: "${theme.accent}",`
    const contrastText = `  contrast: ${theme.contrast},`

    return [
      createPreviewLine(1, 'const themePreview = {', previewOptions),
      createPreviewLine(2, surfaceText, previewOptions, [
        { text: '  surface: "', highlighted: false },
        { text: 'sidebar-elevated', highlighted: true },
        { text: '",', highlighted: false },
      ]),
      createPreviewLine(3, accentText, previewOptions, [
        { text: '  accent: "', highlighted: false },
        { text: theme.accent, highlighted: true },
        { text: '",', highlighted: false },
      ]),
      createPreviewLine(4, contrastText, previewOptions, [
        { text: '  contrast: ', highlighted: false },
        { text: String(theme.contrast), highlighted: true },
        { text: ',', highlighted: false },
      ]),
      createPreviewLine(5, '};', previewOptions),
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

<section class="settings-page settings-appearance">
  <div class="settings-page-heading settings-appearance-heading">
    <div>
      <h2>Appearance</h2>
      <p>Choose how Diffly should look across the app.</p>
    </div>

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

  <div class="settings-appearance-shell">
    <div class="settings-appearance-preview-column">
      <div class="settings-appearance-preview-grid" data-count={visibleThemeVariants.length}>
        {#each visibleThemeVariants as variant}
          {@const themeState = resolvedThemeState[variant]}
          <ThemePreviewCard
            title={getPreviewTitle(variant)}
            themeLabel={formatThemeLabel(themeState.theme.id)}
            previewStyle={themeState.previewStyle}
            basePreviewLines={themeState.basePreviewLines}
            viewerPreviewLines={themeState.viewerPreviewLines}
          />
        {/each}
      </div>
    </div>

    <div class="settings-theme-editor-stack">
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
  </div>

  <section class="settings-group settings-global-appearance">
    <div class="settings-group-header">
      <h3>Global appearance</h3>
      <p>These settings apply across both light and dark variants.</p>
    </div>

    <div class="settings-global-appearance-row">
      <label class="settings-global-appearance-cell settings-row-interactive">
        <div class="settings-row-copy">
          <strong>Use pointer cursors</strong>
          <p>Show a hand cursor on interactive controls.</p>
        </div>
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

      <div class="settings-global-appearance-cell">
        <div class="settings-row-copy">
          <strong>UI font size</strong>
          <p>Scales menus, sidebars, and headings.</p>
        </div>
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

      <div class="settings-global-appearance-cell">
        <div class="settings-row-copy">
          <strong>Code font size</strong>
          <p>Scales source code rendered inside the diff viewer.</p>
        </div>
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
</section>
