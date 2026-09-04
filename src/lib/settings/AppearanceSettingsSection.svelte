<script lang="ts">
  import ThemeLibraryCard from './ThemeLibraryCard.svelte'
  import ThemeWireframe from './ThemeWireframe.svelte'
  import type {
    AppearanceSettings,
    ThemeAdvancedColorKey,
    ThemeDefinition,
    ThemeId,
    ThemeSemanticColorKey,
    ThemeVariant,
  } from '../theme'
  import type { CompareViewerSettings } from '../types'

  interface ThemePair {
    id: ThemeId
    light?: ThemeDefinition
    dark?: ThemeDefinition
  }

  export let appearanceSettings: AppearanceSettings
  export let resolvedThemeMode: ThemeVariant
  export let lightTheme: ThemeDefinition
  export let darkTheme: ThemeDefinition
  export let availableLightThemes: ThemeDefinition[]
  export let availableDarkThemes: ThemeDefinition[]
  export let viewerSettings: CompareViewerSettings
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
  export let onSetUiFontSize: (value: number) => void
  export let onSetCodeFontSize: (value: number) => void
  export let onSetViewerSettings: (settings: CompareViewerSettings) => void
  export let onOpenThemeEditor: (
    appearance: ThemeVariant,
    seedName: string,
    editing: boolean,
    availableAppearances: ThemeVariant[],
  ) => void
  export let onSetThemeAdvancedColor: (
    variant: ThemeVariant,
    field: ThemeAdvancedColorKey,
    value: string,
  ) => void

  let themeFileInput: HTMLInputElement
  let importMessage = ''
  let themePairs: ThemePair[] = []

  $: themePairs = buildThemePairs(availableLightThemes, availableDarkThemes)
  $: activeInterfaceTheme = resolvedThemeMode === 'light' ? lightTheme : darkTheme

  function buildThemePairs(light: ThemeDefinition[], dark: ThemeDefinition[]): ThemePair[] {
    const pairs = new Map<ThemeId, ThemePair>()
    for (const theme of [...light, ...dark]) {
      const pair = pairs.get(theme.id) ?? { id: theme.id }
      pair[theme.variant] = theme
      pairs.set(theme.id, pair)
    }
    return [...pairs.values()].sort((left, right) => {
      if (left.id === 'codex') return -1
      if (right.id === 'codex') return 1
      return formatThemeLabel(left.id).localeCompare(formatThemeLabel(right.id))
    })
  }

  function formatThemeLabel(value: string) {
    if (value === 'codex') return 'Diffly'
    if (value === 'legacy-tuerkis') return 'Original türkis'
    if (value === 'vscode-plus') return 'VS Code Plus'
    return value
      .split('-')
      .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
      .join(' ')
  }

  function useThemePair(pair: ThemePair) {
    if (pair.light) onSetThemePreset('light', pair.light.id)
    if (pair.dark) onSetThemePreset('dark', pair.dark.id)
  }

  function openThemeEditor(pair?: ThemePair) {
    if (pair) useThemePair(pair)
    const initialAppearance = pair?.[resolvedThemeMode]
      ? resolvedThemeMode
      : pair?.dark
        ? 'dark'
        : pair?.light
          ? 'light'
          : resolvedThemeMode
    onOpenThemeEditor(
      initialAppearance,
      pair ? formatThemeLabel(pair.id) : '',
      Boolean(pair),
      pair
        ? (['light', 'dark'] as ThemeVariant[]).filter((variant) => Boolean(pair[variant]))
        : ['light', 'dark'],
    )
  }

  function setInterfaceContrast(value: number) {
    if (appearanceSettings.mode === 'system') {
      onSetThemeContrast('light', value)
      onSetThemeContrast('dark', value)
      return
    }
    onSetThemeContrast(appearanceSettings.mode, value)
  }

  function setGlobalFont(field: 'ui' | 'code', value: string) {
    onSetThemeFont('light', field, value)
    onSetThemeFont('dark', field, value)
  }

  function cssColorToHex(value: unknown) {
    if (typeof value !== 'string') return null
    const context = document.createElement('canvas').getContext('2d', { willReadFrequently: true })
    if (!context) return null
    context.canvas.width = 1
    context.canvas.height = 1
    context.clearRect(0, 0, 1, 1)
    context.fillStyle = '#000000'
    try {
      context.fillStyle = value
    } catch {
      return null
    }
    context.fillRect(0, 0, 1, 1)
    const [red, green, blue] = context.getImageData(0, 0, 1, 1).data
    return `#${[red, green, blue]
      .map((channel) => channel.toString(16).padStart(2, '0'))
      .join('')}`
  }

  function applyT3ThemeColors(variant: ThemeVariant, colors: Record<string, unknown>) {
    const mappings: Array<{
      field: 'accent' | 'surface' | 'ink'
      candidates: string[]
    }> = [
      { field: 'accent', candidates: ['accent', 'messageAction', 'focus'] },
      { field: 'surface', candidates: ['canvas', 'surface', 'codeBackground'] },
      { field: 'ink', candidates: ['text', 'codeForeground', 'sidebarForeground'] },
    ]
    for (const mapping of mappings) {
      const color = mapping.candidates.map((key) => cssColorToHex(colors[key])).find(Boolean)
      if (color) onSetThemeColor(variant, mapping.field, color)
    }
    const removed = cssColorToHex(colors.error)
    const syntax = cssColorToHex(colors.messageAction) ?? cssColorToHex(colors.accent)
    if (removed) onSetThemeSemanticColor(variant, 'diffRemoved', removed)
    if (syntax) onSetThemeSemanticColor(variant, 'skill', syntax)
    const advancedMappings: Array<[ThemeAdvancedColorKey, string[]]> = [
      ['background', ['canvas']],
      ['raisedSurface', ['surfaceRaised']],
      ['overlay', ['surfaceOverlay']],
      ['mutedText', ['textMuted', 'mutedForeground']],
      ['border', ['border']],
      ['input', ['input']],
    ]
    for (const [field, candidates] of advancedMappings) {
      const color = candidates.map((key) => cssColorToHex(colors[key])).find(Boolean)
      if (color) onSetThemeAdvancedColor(variant, field, color)
    }
  }

  function applyImportedTheme(raw: string) {
    const payload = raw.startsWith('codex-theme-v1:') ? raw.slice('codex-theme-v1:'.length) : raw
    const parsed = JSON.parse(payload) as {
      version?: number
      name?: unknown
      appearance?: ThemeVariant
      colors?: Record<string, unknown>
      variants?: Partial<Record<ThemeVariant, Record<string, unknown>>>
      variant?: ThemeVariant
      theme?: Partial<ThemeDefinition> & {
        semanticColors?: Partial<ThemeDefinition['semanticColors']>
      }
    }

    if (
      parsed.version === 1 &&
      (parsed.appearance === 'light' || parsed.appearance === 'dark') &&
      parsed.colors
    ) {
      applyT3ThemeColors(parsed.appearance, parsed.colors)
      const importedVariants: ThemeVariant[] = [parsed.appearance]
      for (const variant of ['light', 'dark'] as const) {
        const colors = parsed.variants?.[variant]
        if (colors && variant !== parsed.appearance) {
          applyT3ThemeColors(variant, colors)
          importedVariants.push(variant)
        }
      }
      onOpenThemeEditor(
        importedVariants[0] ?? resolvedThemeMode,
        typeof parsed.name === 'string' ? parsed.name : 'Imported theme',
        false,
        importedVariants,
      )
      return
    }

    const variant = parsed.variant
    const theme = parsed.theme
    if ((variant !== 'light' && variant !== 'dark') || !theme) {
      throw new Error('This file does not contain a Diffly light or dark theme.')
    }
    if (theme.accent) onSetThemeColor(variant, 'accent', theme.accent)
    if (theme.surface) onSetThemeColor(variant, 'surface', theme.surface)
    if (theme.ink) onSetThemeColor(variant, 'ink', theme.ink)
    if (theme.semanticColors?.diffAdded) {
      onSetThemeSemanticColor(variant, 'diffAdded', theme.semanticColors.diffAdded)
    }
    if (theme.semanticColors?.diffRemoved) {
      onSetThemeSemanticColor(variant, 'diffRemoved', theme.semanticColors.diffRemoved)
    }
    if (theme.semanticColors?.skill) {
      onSetThemeSemanticColor(variant, 'skill', theme.semanticColors.skill)
    }
    if (theme.fonts?.ui !== undefined) onSetThemeFont(variant, 'ui', theme.fonts.ui ?? '')
    if (theme.fonts?.code !== undefined) onSetThemeFont(variant, 'code', theme.fonts.code ?? '')
    if (typeof theme.contrast === 'number') onSetThemeContrast(variant, theme.contrast)
    for (const [field, color] of Object.entries(theme.advancedColors ?? {})) {
      if (typeof color === 'string') {
        onSetThemeAdvancedColor(variant, field as ThemeAdvancedColorKey, color)
      }
    }
    onOpenThemeEditor(variant, 'Imported theme', false, [variant])
  }

  async function importTheme(event: Event) {
    const input = event.currentTarget as HTMLInputElement
    const file = input.files?.[0]
    input.value = ''
    if (!file) return
    try {
      applyImportedTheme(await file.text())
      importMessage = `${file.name} imported`
    } catch (error) {
      importMessage = error instanceof Error ? error.message : 'Theme import failed.'
    }
  }
</script>

<section class="settings-page t3-appearance-page">
  <section class="t3-settings-section t3-settings-section-plain">
    <h3 class="t3-settings-section-label">Color scheme</h3>
    <div aria-label="Appearance mode" class="t3-mode-grid" role="group">
      <button
        aria-label="Follow the system appearance"
        aria-pressed={appearanceSettings.mode === 'system'}
        class:active={appearanceSettings.mode === 'system'}
        class="t3-mode-tile"
        type="button"
        on:click={() => onSetThemeMode('system')}
      >
        <ThemeWireframe panes={[{ theme: lightTheme, clip: 'left' }, { theme: darkTheme, clip: 'right' }]} />
        <span>System</span>
      </button>
      <button
        aria-label="Use light mode"
        aria-pressed={appearanceSettings.mode === 'light'}
        class:active={appearanceSettings.mode === 'light'}
        class="t3-mode-tile"
        type="button"
        on:click={() => onSetThemeMode('light')}
      >
        <ThemeWireframe panes={[{ theme: lightTheme }]} />
        <span>Light</span>
      </button>
      <button
        aria-label="Use dark mode"
        aria-pressed={appearanceSettings.mode === 'dark'}
        class:active={appearanceSettings.mode === 'dark'}
        class="t3-mode-tile"
        type="button"
        on:click={() => onSetThemeMode('dark')}
      >
        <ThemeWireframe panes={[{ theme: darkTheme }]} />
        <span>Dark</span>
      </button>
    </div>

    <div class="t3-theme-library-header">
      <h3 class="t3-settings-section-label">Themes</h3>
      <div class="t3-theme-library-actions">
        <button class="secondary t3-small-button" type="button" on:click={() => openThemeEditor()}>
          <svg aria-hidden="true" viewBox="0 0 16 16"><path d="M8 2.2a5.8 5.8 0 1 0 0 11.6h.9a1.3 1.3 0 0 0 0-2.6H8a1 1 0 0 1 0-2h1.3a4.7 4.7 0 0 0 0-9.4H8Z"></path><circle cx="5" cy="5.5" r=".65"></circle><circle cx="4.3" cy="8.2" r=".65"></circle><circle cx="7" cy="3.9" r=".65"></circle></svg>
          Create theme
        </button>
        <button class="secondary t3-small-button" type="button" on:click={() => themeFileInput.click()}>
          <svg aria-hidden="true" viewBox="0 0 16 16"><path d="M8 3v10M3 8h10"></path></svg>
          Add theme
        </button>
        <input bind:this={themeFileInput} accept=".json,application/json,text/plain" class="t3-theme-file-input" type="file" on:change={importTheme} />
      </div>
    </div>
    {#if importMessage}<p class="t3-import-message" role="status">{importMessage}</p>{/if}

    <div class="t3-theme-library-grid">
      {#each themePairs as pair (pair.id)}
        <ThemeLibraryCard
          label={formatThemeLabel(pair.id)}
          lightTheme={pair.light}
          darkTheme={pair.dark}
          activeLightId={appearanceSettings.lightThemeId}
          activeDarkId={appearanceSettings.darkThemeId}
          onUseTheme={onSetThemePreset}
          onUseBoth={() => useThemePair(pair)}
          onCustomize={() => openThemeEditor(pair)}
        />
      {/each}
    </div>
  </section>

  <section class="t3-settings-section">
    <h3 class="t3-settings-section-title">Interface</h3>
    <div class="t3-settings-group">
      <div class="t3-settings-row">
        <div><strong>Contrast</strong><p>Adjust the contrast of colors and borders across the interface.</p></div>
        <div class="t3-slider-control">
          <output>{activeInterfaceTheme.contrast}%</output>
          <input aria-label="Contrast" max="100" min="0" step="5" type="range" value={activeInterfaceTheme.contrast} on:input={(event) => setInterfaceContrast(Number((event.currentTarget as HTMLInputElement).value))} />
        </div>
      </div>
      <label class="t3-settings-row t3-settings-row-clickable">
        <div><strong>Pointer cursors</strong><p>Show a pointer cursor for buttons and other interactive controls.</p></div>
        <span class="settings-switch">
          <input checked={appearanceSettings.usePointerCursor} role="switch" type="checkbox" on:change={(event) => onSetUsePointerCursor((event.currentTarget as HTMLInputElement).checked)} />
          <span aria-hidden="true" class="settings-switch-ui"></span>
        </span>
      </label>
    </div>
  </section>

  <section class="t3-settings-section">
    <h3 class="t3-settings-section-title">Typography</h3>
    <div class="t3-settings-group">
      <div class="t3-settings-row t3-font-row">
        <div><strong>Interface font</strong><p>Everything outside diffs, code previews, and editors.</p></div>
        <div class="t3-font-controls">
          <input aria-label="Interface font family" placeholder="System default" type="text" value={activeInterfaceTheme.fonts.ui ?? ''} on:change={(event) => setGlobalFont('ui', (event.currentTarget as HTMLInputElement).value)} />
          <div class="t3-slider-control t3-font-size-control">
            <output>{appearanceSettings.uiFontSize}px</output>
            <input aria-label="Interface font size" max={maxUiFontSize} min={minUiFontSize} step="1" type="range" value={appearanceSettings.uiFontSize} on:input={(event) => onSetUiFontSize(Number((event.currentTarget as HTMLInputElement).value))} />
          </div>
        </div>
      </div>
      <div class="t3-settings-row t3-font-row">
        <div><strong>Monospace font</strong><p>Diffs, code previews, and document editors.</p></div>
        <div class="t3-font-controls">
          <input aria-label="Monospace font family" placeholder="System monospace" type="text" value={activeInterfaceTheme.fonts.code ?? ''} on:change={(event) => setGlobalFont('code', (event.currentTarget as HTMLInputElement).value)} />
          <div class="t3-slider-control t3-font-size-control">
            <output>{appearanceSettings.codeFontSize}px</output>
            <input aria-label="Code font size" max={maxCodeFontSize} min={minCodeFontSize} step="1" type="range" value={appearanceSettings.codeFontSize} on:input={(event) => onSetCodeFontSize(Number((event.currentTarget as HTMLInputElement).value))} />
          </div>
        </div>
      </div>
      <label class="t3-settings-row t3-settings-row-clickable">
        <div><strong>Word wrap</strong><p>Wrap long lines in diffs and file previews by default.</p></div>
        <span class="settings-switch">
          <input checked={viewerSettings.codeOverflow === 'wrap'} role="switch" type="checkbox" on:change={(event) => onSetViewerSettings({ ...viewerSettings, codeOverflow: (event.currentTarget as HTMLInputElement).checked ? 'wrap' : 'scroll' })} />
          <span aria-hidden="true" class="settings-switch-ui"></span>
        </span>
      </label>
    </div>
  </section>
</section>
