<script lang="ts">
  import { tick } from 'svelte'
  import type { ContextLinesSetting, ThemeMode, UpdateMetadata, ViewMode } from './types'
  import type { AppearanceSettings, ThemeDefinition, ThemeVariant } from './theme'
  import type { SettingsSection } from './ui-types'

  type UpdateIndicatorStatus =
    | 'idle'
    | 'checking'
    | 'available'
    | 'upToDate'
    | 'downloading'
    | 'downloaded'
    | 'failed'
    | 'unavailable'

  interface SectionItem {
    id: SettingsSection
    label: string
  }

  const RESET_CONFIRMATION_PHRASE = 'RESET'

  const sections: SectionItem[] = [
    { id: 'appearance', label: 'Appearance' },
    { id: 'viewer', label: 'Viewer' },
    { id: 'updates', label: 'Updates' },
    { id: 'reset', label: 'Reset' },
  ]

  export let activeSection: SettingsSection
  export let appearanceSettings: AppearanceSettings
  export let lightTheme: ThemeDefinition
  export let darkTheme: ThemeDefinition
  export let visibleThemeVariants: ThemeVariant[]
  export let availableLightThemes: ThemeDefinition[]
  export let availableDarkThemes: ThemeDefinition[]
  export let copiedThemeVariant: ThemeVariant | null
  export let ignoreWhitespace: boolean
  export let ignoreCase: boolean
  export let viewMode: ViewMode
  export let showFullFile: boolean
  export let contextLines: ContextLinesSetting
  export let contextLinePresets: ContextLinesSetting[]
  export let minUiFontSize: number
  export let maxUiFontSize: number
  export let minCodeFontSize: number
  export let maxCodeFontSize: number
  export let wrapSideBySideLines: boolean
  export let showInlineHighlights: boolean
  export let showSyntaxHighlighting: boolean
  export let syncSideBySideScroll: boolean
  export let checkForUpdatesOnLaunch: boolean
  export let updateChannelLabel: string
  export let currentVersion: string
  export let updateIndicatorState: UpdateIndicatorStatus
  export let updateStatusMessage: string
  export let availableUpdate: UpdateMetadata | null
  export let lastUpdateCheckLabel: string
  export let lastUpdateCheckRelativeLabel: string
  export let updateBusy: boolean
  export let onBack: () => void
  export let onSelectSection: (section: SettingsSection) => void
  export let onSetThemeMode: (theme: ThemeMode) => void
  export let onSetThemePreset: (variant: ThemeVariant, themeId: string) => void
  export let onSetThemeColor: (
    variant: ThemeVariant,
    field: 'accent' | 'surface' | 'ink',
    value: string
  ) => void
  export let onSetThemeFont: (variant: ThemeVariant, field: 'ui' | 'code', value: string) => void
  export let onSetThemeTranslucency: (variant: ThemeVariant, enabled: boolean) => void
  export let onSetThemeContrast: (variant: ThemeVariant, value: number) => void
  export let onSetUsePointerCursor: (value: boolean) => void
  export let onStepUiFontSize: (direction: -1 | 1) => void
  export let onStepCodeFontSize: (direction: -1 | 1) => void
  export let onCopyTheme: (variant: ThemeVariant) => void
  export let onToggleIgnoreWhitespace: () => void
  export let onToggleIgnoreCase: () => void
  export let onSetViewMode: (viewMode: ViewMode) => void
  export let onToggleShowFullFile: () => void
  export let onSetContextLines: (value: string) => void
  export let onToggleWrapSideBySideLines: () => void
  export let onToggleShowInlineHighlights: () => void
  export let onToggleShowSyntaxHighlighting: () => void
  export let onToggleSyncSideBySideScroll: () => void
  export let onSetCheckForUpdatesOnLaunch: (value: boolean) => void
  export let onCheckForUpdates: () => void
  export let onDownloadUpdate: () => void
  export let onInstallUpdate: () => void
  export let onResetPreferences: () => void
  export let onClearRememberedSelections: () => void
  export let onResetEverything: () => void

  let showResetEverythingDialog = false
  let resetEverythingConfirmationValue = ''
  let resetEverythingInput: HTMLInputElement | null = null

  function formatThemeLabel(value: string) {
    return value
      .split('-')
      .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
      .join(' ')
  }

  function getThemeForVariant(variant: ThemeVariant) {
    return variant === 'light' ? lightTheme : darkTheme
  }

  function getThemesForVariant(variant: ThemeVariant) {
    return variant === 'light' ? availableLightThemes : availableDarkThemes
  }

  function getThemeTitle(variant: ThemeVariant) {
    return variant === 'light' ? 'Light theme' : 'Dark theme'
  }

  function getPreviewTitle(variant: ThemeVariant) {
    return variant === 'light' ? 'Light preview' : 'Dark preview'
  }

  function getFontValue(theme: ThemeDefinition, field: 'ui' | 'code') {
    const value = field === 'ui' ? theme.fonts.ui : theme.fonts.code
    return value ?? ''
  }

  function getPreviewStyle(theme: ThemeDefinition) {
    return [
      `--preview-surface: ${theme.surface}`,
      `--preview-ink: ${theme.ink}`,
      `--preview-accent: ${theme.accent}`,
      `--preview-added: ${theme.semanticColors.diffAdded}`,
      `--preview-removed: ${theme.semanticColors.diffRemoved}`,
      `--preview-ui-font: ${theme.fonts.ui ?? 'var(--ui-font)'}`,
      `--preview-code-font: ${theme.fonts.code ?? 'var(--code)'}`,
    ].join('; ')
  }

  function getUpdateStatusTitle(status: UpdateIndicatorStatus) {
    if (status === 'available') {
      return 'Update available'
    }

    if (status === 'downloaded') {
      return 'Ready to install'
    }

    if (status === 'upToDate') {
      return 'Up to date'
    }

    if (status === 'failed') {
      return 'Update issue'
    }

    if (status === 'unavailable') {
      return 'Updates unavailable'
    }

    if (status === 'checking') {
      return 'Checking for updates'
    }

    if (status === 'downloading') {
      return 'Downloading update'
    }

    return 'Not checked yet'
  }

  function getUpdateStatusTone(status: UpdateIndicatorStatus) {
    if (status === 'available' || status === 'downloaded') {
      return 'accent'
    }

    if (status === 'failed' || status === 'unavailable') {
      return 'danger'
    }

    return 'neutral'
  }

  function shouldShowUpdateDetail(status: UpdateIndicatorStatus) {
    return status !== 'idle' && status !== 'upToDate'
  }

  function setIgnoreWhitespace(nextValue: boolean) {
    if (ignoreWhitespace !== nextValue) {
      onToggleIgnoreWhitespace()
    }
  }

  function setIgnoreCase(nextValue: boolean) {
    if (ignoreCase !== nextValue) {
      onToggleIgnoreCase()
    }
  }

  async function openResetEverythingDialog() {
    resetEverythingConfirmationValue = ''
    showResetEverythingDialog = true
    await tick()
    resetEverythingInput?.focus()
  }

  function closeResetEverythingDialog() {
    showResetEverythingDialog = false
    resetEverythingConfirmationValue = ''
  }

  function confirmResetEverything() {
    if (resetEverythingConfirmationValue !== RESET_CONFIRMATION_PHRASE) {
      return
    }

    closeResetEverythingDialog()
    onResetEverything()
  }

  function handleWindowKeydown(event: KeyboardEvent) {
    if (showResetEverythingDialog && event.key === 'Escape') {
      closeResetEverythingDialog()
    }
  }
</script>

<svelte:window on:keydown={handleWindowKeydown} />

<section class="settings-screen-body">
  <nav aria-label="Settings sections" class="settings-section-rail">
    <div class="settings-rail-inner">
      <div class="settings-section-list">
        {#each sections as section}
          <button
            aria-current={activeSection === section.id ? 'page' : undefined}
            class:active={activeSection === section.id}
            class="settings-section-link"
            type="button"
            on:click={() => onSelectSection(section.id)}
          >
            <span aria-hidden="true" class="settings-section-icon">
              {#if section.id === 'appearance'}
                <svg viewBox="0 0 16 16">
                  <circle cx="8" cy="8" r="5.2" fill="none" stroke="currentColor" stroke-width="1.3" />
                  <path d="M8 2.8v10.4" fill="none" stroke="currentColor" stroke-width="1.3" />
                </svg>
              {:else if section.id === 'viewer'}
                <svg viewBox="0 0 16 16">
                  <rect x="2.5" y="3.2" width="11" height="9.6" rx="1.4" fill="none" stroke="currentColor" stroke-width="1.3" />
                  <path d="M8 3.4v9.2" fill="none" stroke="currentColor" stroke-width="1.3" />
                </svg>
              {:else if section.id === 'updates'}
                <svg viewBox="0 0 16 16">
                  <path d="M11.6 5.4A4.6 4.6 0 1 0 12 8" fill="none" stroke="currentColor" stroke-linecap="round" stroke-width="1.3" />
                  <path d="M10.3 3.3h2.8V6" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.3" />
                </svg>
              {:else}
                <svg viewBox="0 0 16 16">
                  <path d="M8 2.7v2.2M8 11.1v2.2M3.8 8h-2M14.2 8h-2M4.9 4.9 3.4 3.4M12.6 12.6l-1.5-1.5M11.1 4.9l1.5-1.5M4.9 11.1l-1.5 1.5" fill="none" stroke="currentColor" stroke-linecap="round" stroke-width="1.2" />
                  <circle cx="8" cy="8" r="2.1" fill="none" stroke="currentColor" stroke-width="1.3" />
                </svg>
              {/if}
            </span>
            <span>{section.label}</span>
          </button>
        {/each}
      </div>
    </div>
  </nav>

  <div class="settings-panel-shell">
    <div class="settings-panel">
      <header class="settings-panel-header">
        <div class="settings-panel-heading">
          <h1>Settings</h1>
          <p>Changes apply instantly.</p>
        </div>

        <button
          aria-label="Close settings"
          class="secondary settings-close-button"
          title="Close settings"
          type="button"
          on:click={onBack}
        >
          <svg aria-hidden="true" class="settings-close-icon" viewBox="0 0 16 16">
            <path
              d="M4 4l8 8M12 4 4 12"
              fill="none"
              stroke="currentColor"
              stroke-linecap="round"
              stroke-width="1.6"
            />
          </svg>
        </button>
      </header>

      {#if activeSection === 'appearance'}
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
              <div class="settings-appearance-mode-bar">
                <span>Theme</span>
                <div class="settings-theme-mode-control" role="group" aria-label="Theme mode">
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
                  {@const theme = getThemeForVariant(variant)}
                  <div class="settings-appearance-preview-card" style={getPreviewStyle(theme)}>
                    <div class="settings-appearance-preview-header">
                      <strong>{getPreviewTitle(variant)}</strong>
                      <span>{formatThemeLabel(theme.id)}</span>
                    </div>

                    <div class="settings-appearance-preview-diff">
                      <div class="settings-appearance-preview-pane settings-appearance-preview-pane-removed">
                        <span>1</span>
                        <code>const themePreview = {'{'}</code>
                        <span>2</span>
                        <code>surface: "sidebar",</code>
                        <span>3</span>
                        <code>accent: "{theme.accent}",</code>
                        <span>4</span>
                        <code>contrast: {theme.contrast},</code>
                        <span>5</span>
                        <code>{'}'};</code>
                      </div>

                      <div class="settings-appearance-preview-pane settings-appearance-preview-pane-added">
                        <span>1</span>
                        <code>const themePreview = {'{'}</code>
                        <span>2</span>
                        <code>surface: "sidebar-elevated",</code>
                        <span>3</span>
                        <code>accent: "{theme.semanticColors.skill}",</code>
                        <span>4</span>
                        <code>contrast: {theme.contrast + 8},</code>
                        <span>5</span>
                        <code>{'}'};</code>
                      </div>
                    </div>
                  </div>
                {/each}
              </div>

              <div class="settings-theme-editor-stack">
                {#each visibleThemeVariants as variant}
                  {@const theme = getThemeForVariant(variant)}
                  <section class="settings-theme-editor">
                    <header class="settings-theme-editor-header">
                      <div class="settings-theme-editor-title">
                        <strong>{getThemeTitle(variant)}</strong>
                        <span>Hidden semantic colors stay preset-driven.</span>
                      </div>

                      <div class="settings-theme-editor-actions">
                        <button class="secondary" type="button" on:click={() => onCopyTheme(variant)}>
                          {copiedThemeVariant === variant ? 'Copied' : 'Copy theme'}
                        </button>

                        <label class="settings-theme-select">
                          <select
                            aria-label={`${getThemeTitle(variant)} preset`}
                            value={variant === 'light' ? appearanceSettings.lightThemeId : appearanceSettings.darkThemeId}
                            on:change={(event) =>
                              onSetThemePreset(
                                variant,
                                (event.currentTarget as HTMLSelectElement).value,
                              )}
                          >
                            {#each getThemesForVariant(variant) as preset}
                              <option value={preset.id}>{formatThemeLabel(preset.id)}</option>
                            {/each}
                          </select>
                        </label>
                      </div>
                    </header>

                    <div class="settings-theme-editor-grid">
                      <div class="settings-theme-editor-row">
                        <span>Accent</span>
                        <label class="settings-color-control">
                          <input
                            aria-label={`${getThemeTitle(variant)} accent`}
                            type="color"
                            value={theme.accent}
                            on:input={(event) =>
                              onSetThemeColor(
                                variant,
                                'accent',
                                (event.currentTarget as HTMLInputElement).value,
                              )}
                          />
                          <span>{theme.accent.toUpperCase()}</span>
                        </label>
                      </div>

                      <div class="settings-theme-editor-row">
                        <span>Background</span>
                        <label class="settings-color-control">
                          <input
                            aria-label={`${getThemeTitle(variant)} background`}
                            type="color"
                            value={theme.surface}
                            on:input={(event) =>
                              onSetThemeColor(
                                variant,
                                'surface',
                                (event.currentTarget as HTMLInputElement).value,
                              )}
                          />
                          <span>{theme.surface.toUpperCase()}</span>
                        </label>
                      </div>

                      <div class="settings-theme-editor-row">
                        <span>Foreground</span>
                        <label class="settings-color-control">
                          <input
                            aria-label={`${getThemeTitle(variant)} foreground`}
                            type="color"
                            value={theme.ink}
                            on:input={(event) =>
                              onSetThemeColor(
                                variant,
                                'ink',
                                (event.currentTarget as HTMLInputElement).value,
                              )}
                          />
                          <span>{theme.ink.toUpperCase()}</span>
                        </label>
                      </div>

                      <div class="settings-theme-editor-row">
                        <span>UI font</span>
                        <input
                          aria-label={`${getThemeTitle(variant)} UI font`}
                          class="settings-theme-text-input"
                          placeholder="Default app font"
                          type="text"
                          value={getFontValue(theme, 'ui')}
                          on:change={(event) =>
                            onSetThemeFont(
                              variant,
                              'ui',
                              (event.currentTarget as HTMLInputElement).value,
                            )}
                        />
                      </div>

                      <div class="settings-theme-editor-row">
                        <span>Code font</span>
                        <input
                          aria-label={`${getThemeTitle(variant)} code font`}
                          class="settings-theme-text-input"
                          placeholder="Default monospace stack"
                          type="text"
                          value={getFontValue(theme, 'code')}
                          on:change={(event) =>
                            onSetThemeFont(
                              variant,
                              'code',
                              (event.currentTarget as HTMLInputElement).value,
                            )}
                        />
                      </div>

                      <label class="settings-theme-editor-row settings-theme-editor-row-interactive">
                        <span>Translucent sidebar</span>
                        <span class="settings-switch">
                          <input
                            checked={!theme.opaqueWindows}
                            role="switch"
                            type="checkbox"
                            on:change={(event) =>
                              onSetThemeTranslucency(
                                variant,
                                (event.currentTarget as HTMLInputElement).checked,
                              )}
                          />
                          <span aria-hidden="true" class="settings-switch-ui"></span>
                        </span>
                      </label>

                      <div class="settings-theme-editor-row settings-theme-editor-row-slider">
                        <span>Contrast</span>
                        <div class="settings-theme-slider">
                          <input
                            aria-label={`${getThemeTitle(variant)} contrast`}
                            max="100"
                            min="0"
                            type="range"
                            value={theme.contrast}
                            on:input={(event) =>
                              onSetThemeContrast(
                                variant,
                                Number((event.currentTarget as HTMLInputElement).value),
                              )}
                          />
                          <span>{theme.contrast}</span>
                        </div>
                      </div>
                    </div>
                  </section>
                {/each}

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
                            onSetUsePointerCursor(
                              (event.currentTarget as HTMLInputElement).checked,
                            )}
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
      {/if}

      {#if activeSection === 'viewer'}
        <section class="settings-page">
          <div class="settings-page-heading">
            <h2>Viewer</h2>
            <p>Defaults for reading and navigating diffs.</p>
          </div>

          <section class="settings-group">
            <div class="settings-group-header">
              <h3>Layout</h3>
              <p>Choose the default diff arrangement.</p>
            </div>

            <div class="settings-group-grid">
              <div class="settings-row settings-row-span-full">
                <div class="settings-row-copy">
                  <strong>View mode</strong>
                  <p>Use split or unified view when a compare opens.</p>
                </div>

                <div class="settings-control">
                  <div class="settings-segmented-control" role="group" aria-label="Default diff view">
                    <button
                      aria-pressed={viewMode === 'sideBySide'}
                      class:active={viewMode === 'sideBySide'}
                      type="button"
                      on:click={() => onSetViewMode('sideBySide')}
                    >
                      <svg aria-hidden="true" viewBox="0 0 16 16">
                        <rect x="2.6" y="3.2" width="11" height="9.6" rx="1.4" fill="none" stroke="currentColor" stroke-width="1.3" />
                        <path d="M8 3.4v9.2" fill="none" stroke="currentColor" stroke-width="1.3" />
                      </svg>
                      <span>Split</span>
                    </button>

                    <button
                      aria-pressed={viewMode === 'unified'}
                      class:active={viewMode === 'unified'}
                      type="button"
                      on:click={() => onSetViewMode('unified')}
                    >
                      <svg aria-hidden="true" viewBox="0 0 16 16">
                        <rect x="2.6" y="3.2" width="10.8" height="9.6" rx="1.4" fill="none" stroke="currentColor" stroke-width="1.3" />
                        <path d="M5 6h6M5 8h5.1M5 10h6" fill="none" stroke="currentColor" stroke-linecap="round" stroke-width="1.3" />
                      </svg>
                      <span>Unified</span>
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </section>

          <section class="settings-group">
            <div class="settings-group-header">
              <h3>Readability</h3>
              <p>Control text density and line rendering.</p>
            </div>

            <div class="settings-group-grid">
              <label class="settings-row settings-row-interactive">
                <div class="settings-row-copy">
                  <strong>Wrap long lines</strong>
                  <p>Wrap side-by-side lines instead of horizontal scrolling.</p>
                </div>

                <span class="settings-control">
                  <span class="settings-switch">
                    <input
                      checked={wrapSideBySideLines}
                      role="switch"
                      type="checkbox"
                      on:change={onToggleWrapSideBySideLines}
                    />
                    <span aria-hidden="true" class="settings-switch-ui"></span>
                  </span>
                </span>
              </label>

              <label class="settings-row settings-row-interactive">
                <div class="settings-row-copy">
                  <strong>Syntax highlighting</strong>
                  <p>Apply language colors inside the diff viewer.</p>
                </div>

                <span class="settings-control">
                  <span class="settings-switch">
                    <input
                      checked={showSyntaxHighlighting}
                      role="switch"
                      type="checkbox"
                      on:change={onToggleShowSyntaxHighlighting}
                    />
                    <span aria-hidden="true" class="settings-switch-ui"></span>
                  </span>
                </span>
              </label>

              <label class="settings-row settings-row-interactive">
                <div class="settings-row-copy">
                  <strong>Inline highlights</strong>
                  <p>Mark changed fragments inside each edited line.</p>
                </div>

                <span class="settings-control">
                  <span class="settings-switch">
                    <input
                      checked={showInlineHighlights}
                      role="switch"
                      type="checkbox"
                      on:change={onToggleShowInlineHighlights}
                    />
                    <span aria-hidden="true" class="settings-switch-ui"></span>
                  </span>
                </span>
              </label>
            </div>
          </section>

          <section class="settings-group">
            <div class="settings-group-header">
              <h3>Comparison rules</h3>
              <p>Choose what counts as a meaningful change.</p>
            </div>

            <div class="settings-group-grid">
              <div class="settings-row">
                <div class="settings-row-copy">
                  <strong>Whitespace</strong>
                  <p>Compare spacing exactly or ignore whitespace-only edits.</p>
                </div>

                <div class="settings-control">
                  <div class="settings-segmented-control" role="group" aria-label="Whitespace handling">
                    <button
                      aria-pressed={!ignoreWhitespace}
                      class:active={!ignoreWhitespace}
                      type="button"
                      on:click={() => setIgnoreWhitespace(false)}
                    >
                      Exact
                    </button>

                    <button
                      aria-pressed={ignoreWhitespace}
                      class:active={ignoreWhitespace}
                      type="button"
                      on:click={() => setIgnoreWhitespace(true)}
                    >
                      Ignore
                    </button>
                  </div>
                </div>
              </div>

              <div class="settings-row">
                <div class="settings-row-copy">
                  <strong>Case sensitivity</strong>
                  <p>Choose whether letter case should count as a change.</p>
                </div>

                <div class="settings-control">
                  <div class="settings-segmented-control" role="group" aria-label="Case sensitivity">
                    <button
                      aria-pressed={!ignoreCase}
                      class:active={!ignoreCase}
                      type="button"
                      on:click={() => setIgnoreCase(false)}
                    >
                      Sensitive
                    </button>

                    <button
                      aria-pressed={ignoreCase}
                      class:active={ignoreCase}
                      type="button"
                      on:click={() => setIgnoreCase(true)}
                    >
                      Insensitive
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </section>

          <section class="settings-group">
            <div class="settings-group-header">
              <h3>Navigation</h3>
              <p>Keep long files and split panes easier to follow.</p>
            </div>

            <div class="settings-group-grid">
              <label class="settings-row settings-row-interactive">
                <div class="settings-row-copy">
                  <strong>Full file</strong>
                  <p>Show the entire file instead of context-only hunks.</p>
                </div>

                <span class="settings-control">
                  <span class="settings-switch">
                    <input
                      checked={showFullFile}
                      role="switch"
                      type="checkbox"
                      on:change={onToggleShowFullFile}
                    />
                    <span aria-hidden="true" class="settings-switch-ui"></span>
                  </span>
                </span>
              </label>

              <div class:settings-row-disabled={showFullFile} class="settings-row">
                <div class="settings-row-copy">
                  <strong>Context lines</strong>
                  <p>Visible lines around each change. Only used when Full file is off.</p>
                </div>

                <div class="settings-control">
                  <select
                    disabled={showFullFile}
                    value={contextLines}
                    on:change={(event) =>
                      onSetContextLines((event.currentTarget as HTMLSelectElement).value)}
                  >
                    {#each contextLinePresets as preset}
                      <option value={preset}>{preset}</option>
                    {/each}
                  </select>
                </div>
              </div>

              <label class="settings-row settings-row-interactive">
                <div class="settings-row-copy">
                  <strong>Sync scrolling</strong>
                  <p>Keep both panes aligned while you scroll.</p>
                </div>

                <span class="settings-control">
                  <span class="settings-switch">
                    <input
                      checked={syncSideBySideScroll}
                      role="switch"
                      type="checkbox"
                      on:change={onToggleSyncSideBySideScroll}
                    />
                    <span aria-hidden="true" class="settings-switch-ui"></span>
                  </span>
                </span>
              </label>
            </div>
          </section>
        </section>
      {/if}

      {#if activeSection === 'updates'}
        <section class="settings-page">
          <div class="settings-page-heading">
            <h2>Updates</h2>
            <p>Current release status and automatic checks.</p>
          </div>

          <section class="settings-group">
            <div class="settings-group-header">
              <h3>Status</h3>
              <p>Version, channel, and the latest update check.</p>
            </div>

            <div class="settings-update-summary">
              <div class="settings-summary-item">
                <span>Version</span>
                <strong>{currentVersion || 'Unavailable'}</strong>
                <small>{getUpdateStatusTitle(updateIndicatorState)}</small>
              </div>

              <div class="settings-summary-item">
                <span>Last checked</span>
                <strong>{lastUpdateCheckLabel}</strong>
                <small>{lastUpdateCheckRelativeLabel}</small>
              </div>

              <div class="settings-summary-item">
                <span>Channel</span>
                <strong>{updateChannelLabel}</strong>
                <small>Stable builds only in this release.</small>
              </div>

              <div class="settings-summary-item">
                <span>Auto-check</span>
                <strong>{checkForUpdatesOnLaunch ? 'Enabled' : 'Disabled'}</strong>
                <small>{checkForUpdatesOnLaunch ? 'Checks after launch.' : 'Manual checks only.'}</small>
              </div>

              {#if availableUpdate}
                <div class="settings-summary-item">
                  <span>Latest version</span>
                  <strong>{availableUpdate.version}</strong>
                  <small>Ready to download from this screen.</small>
                </div>
              {:else}
                <div class="settings-summary-item">
                  <span>Release notes</span>
                  <strong>Not published</strong>
                  <small>Release notes link will appear with a published update.</small>
                </div>
              {/if}
            </div>

            <div class="settings-update-actions">
              <button
                class="secondary"
                disabled={updateBusy}
                type="button"
                on:click={onCheckForUpdates}
              >
                Check now
              </button>

              {#if updateIndicatorState === 'available'}
                <button class="primary" type="button" on:click={onDownloadUpdate}>
                  Download update
                </button>
              {/if}

              {#if updateIndicatorState === 'downloaded'}
                <button class="primary" type="button" on:click={onInstallUpdate}>
                  Install and restart
                </button>
              {/if}
            </div>

            {#if shouldShowUpdateDetail(updateIndicatorState)}
              <div class="settings-update-status" data-tone={getUpdateStatusTone(updateIndicatorState)}>
                <div class="settings-update-copy">
                  <strong>{getUpdateStatusTitle(updateIndicatorState)}</strong>
                  <p>{updateStatusMessage}</p>
                </div>
              </div>
            {/if}
          </section>

          <section class="settings-group">
            <div class="settings-group-header">
              <h3>Automatic checks</h3>
              <p>Control whether Diffly checks for updates after launch.</p>
            </div>

            <div class="settings-group-grid">
              <label class="settings-row settings-row-interactive settings-row-span-full">
                <div class="settings-row-copy">
                  <strong>Check for updates on startup</strong>
                  <p>Run a background update check after launch.</p>
                </div>

                <span class="settings-control">
                  <span class="settings-switch">
                    <input
                      checked={checkForUpdatesOnLaunch}
                      role="switch"
                      type="checkbox"
                      on:change={(event) =>
                        onSetCheckForUpdatesOnLaunch(
                          (event.currentTarget as HTMLInputElement).checked,
                        )}
                    />
                    <span aria-hidden="true" class="settings-switch-ui"></span>
                  </span>
                </span>
              </label>
            </div>
          </section>
        </section>
      {/if}

      {#if activeSection === 'reset'}
        <section class="settings-page">
          <div class="settings-page-heading">
            <h2>Reset</h2>
            <p>Clear saved state when you need a clean slate.</p>
          </div>

          <section class="settings-group">
            <div class="settings-group-header">
              <h3>Local data</h3>
              <p>Reset preferences or remove remembered compare targets.</p>
            </div>

            <div class="settings-group-grid">
              <div class="settings-row">
                <div class="settings-row-copy">
                  <strong>Reset preferences</strong>
                  <p>Restore appearance, viewer, and update settings to defaults.</p>
                </div>

                <div class="settings-control">
                  <button class="secondary" type="button" on:click={onResetPreferences}>
                    Reset preferences
                  </button>
                </div>
              </div>

              <div class="settings-row">
                <div class="settings-row-copy">
                  <strong>Clear remembered selections</strong>
                  <p>Remove recent compare targets and stored file history.</p>
                </div>

                <div class="settings-control">
                  <button class="secondary" type="button" on:click={onClearRememberedSelections}>
                    Clear selections
                  </button>
                </div>
              </div>
            </div>
          </section>

          <section class="settings-group settings-group-danger">
            <div class="settings-group-header">
              <h3>Danger zone</h3>
              <p>Use this only when you want Diffly back in a first-run state.</p>
            </div>

            <div class="settings-group-grid">
              <div class="settings-row settings-row-span-full">
                <div class="settings-row-copy">
                  <strong>Reset everything</strong>
                  <p>Clear all saved local app data and return Diffly to first-run state.</p>
                </div>

                <div class="settings-control">
                  <button class="primary danger-button" type="button" on:click={openResetEverythingDialog}>
                    Reset everything
                  </button>
                </div>
              </div>
            </div>
          </section>
        </section>
      {/if}
    </div>
  </div>

  {#if showResetEverythingDialog}
    <div class="settings-dialog-backdrop" role="presentation">
      <button
        aria-label="Close reset confirmation"
        class="settings-dialog-scrim"
        type="button"
        on:click={closeResetEverythingDialog}
      ></button>
      <div
        aria-describedby="reset-everything-description"
        aria-labelledby="reset-everything-title"
        aria-modal="true"
        class="settings-dialog"
        role="dialog"
      >
        <div class="settings-dialog-header">
          <h2 id="reset-everything-title">Reset everything?</h2>
          <p id="reset-everything-description">
            This clears the saved local state for Diffly and returns the app to setup mode.
          </p>
        </div>

        <ul class="settings-dialog-list">
          <li>Restore appearance, viewer, and update settings to defaults.</li>
          <li>Remove remembered compare targets and navigation history.</li>
          <li>Return Diffly to a clean first-run state.</li>
        </ul>

        <label class="settings-dialog-field">
          <span>Type {RESET_CONFIRMATION_PHRASE} to continue</span>
          <input
            bind:this={resetEverythingInput}
            bind:value={resetEverythingConfirmationValue}
            autocomplete="off"
            spellcheck="false"
            type="text"
          />
        </label>

        <div class="settings-dialog-actions">
          <button class="secondary" type="button" on:click={closeResetEverythingDialog}>
            Cancel
          </button>
          <button
            class="primary danger-button"
            disabled={resetEverythingConfirmationValue !== RESET_CONFIRMATION_PHRASE}
            type="button"
            on:click={confirmResetEverything}
          >
            Reset everything
          </button>
        </div>
      </div>
    </div>
  {/if}
</section>
