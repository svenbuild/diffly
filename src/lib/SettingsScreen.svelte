<script lang="ts">
  import AppearanceSettingsSection from './settings/AppearanceSettingsSection.svelte'
  import ResetSettingsSection from './settings/ResetSettingsSection.svelte'
  import UpdateSettingsSection from './settings/UpdateSettingsSection.svelte'
  import ViewerSettingsSection from './settings/ViewerSettingsSection.svelte'
  import type {
    ContextLinesSetting,
    ThemeMode,
    UpdateMetadata,
    ViewMode,
  } from './types'
  import type {
    AppearanceSettings,
    ThemeDefinition,
    ThemeSemanticColorKey,
    ThemeVariant,
  } from './theme'
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
  export let updateChannel: 'stable' | 'prerelease'
  export let updateChannelLabel: string
  export let currentVersion: string
  export let updateIndicatorState: UpdateIndicatorStatus
  export let updateStatusMessage: string
  export let availableUpdate: UpdateMetadata | null
  export let lastUpdateCheckLabel: string
  export let lastUpdateCheckRelativeLabel: string
  export let updateBusy: boolean
  export let comparisonRulesRequireRefresh: boolean
  export let compareNeedsRefresh: boolean
  export let onSelectSection: (section: SettingsSection) => void
  export let onSetThemeMode: (theme: ThemeMode) => void
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
  export let onSetUpdateChannel: (value: 'stable' | 'prerelease') => void
  export let onCheckForUpdates: () => void
  export let onDownloadUpdate: () => void
  export let onInstallUpdate: () => void
  export let onResetPreferences: () => void
  export let onClearRememberedSelections: () => void
  export let onResetEverything: () => void
</script>

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
      {#if activeSection === 'appearance'}
        <AppearanceSettingsSection
          {appearanceSettings}
          {lightTheme}
          {darkTheme}
          {visibleThemeVariants}
          {availableLightThemes}
          {availableDarkThemes}
          {showInlineHighlights}
          {showSyntaxHighlighting}
          {minUiFontSize}
          {maxUiFontSize}
          {minCodeFontSize}
          {maxCodeFontSize}
          {onSetThemeMode}
          {onSetThemePreset}
          {onSetThemeColor}
          {onSetThemeSemanticColor}
          {onSetThemeFont}
          {onSetThemeContrast}
          {onSetUsePointerCursor}
          {onStepUiFontSize}
          {onStepCodeFontSize}
        />
      {/if}

      {#if activeSection === 'viewer'}
        <ViewerSettingsSection
          {viewMode}
          {wrapSideBySideLines}
          {syncSideBySideScroll}
          {showFullFile}
          {contextLines}
          {contextLinePresets}
          {showSyntaxHighlighting}
          {showInlineHighlights}
          {ignoreWhitespace}
          {ignoreCase}
          {comparisonRulesRequireRefresh}
          {compareNeedsRefresh}
          {onSetViewMode}
          {onToggleWrapSideBySideLines}
          {onToggleSyncSideBySideScroll}
          {onToggleShowFullFile}
          {onSetContextLines}
          {onToggleShowSyntaxHighlighting}
          {onToggleShowInlineHighlights}
          {onToggleIgnoreWhitespace}
          {onToggleIgnoreCase}
        />
      {/if}

      {#if activeSection === 'updates'}
        <UpdateSettingsSection
          {currentVersion}
          {updateIndicatorState}
          {updateStatusMessage}
          {availableUpdate}
          {lastUpdateCheckLabel}
          {lastUpdateCheckRelativeLabel}
          {updateBusy}
          {updateChannel}
          {updateChannelLabel}
          {checkForUpdatesOnLaunch}
          {onCheckForUpdates}
          {onDownloadUpdate}
          {onInstallUpdate}
          {onSetUpdateChannel}
          {onSetCheckForUpdatesOnLaunch}
        />
      {/if}

      {#if activeSection === 'reset'}
        <ResetSettingsSection
          {onResetPreferences}
          {onClearRememberedSelections}
          {onResetEverything}
        />
      {/if}
    </div>
  </div>
</section>
