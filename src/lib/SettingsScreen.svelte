<script lang="ts">
  import AppearanceSettingsSection from './settings/AppearanceSettingsSection.svelte'
  import CompareSettingsSection from './settings/CompareSettingsSection.svelte'
  import ResetSettingsSection from './settings/ResetSettingsSection.svelte'
  import UpdateSettingsSection from './settings/UpdateSettingsSection.svelte'
  import type {
    CompareTreeSettings,
    CompareViewerSettings,
    ThemeMode,
    UpdateMetadata,
    ViewMode,
  } from './types'
  import type {
    AppearanceSettings,
    ThemeDefinition,
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
    { id: 'compare', label: 'Compare' },
    { id: 'updates', label: 'Updates' },
    { id: 'reset', label: 'Reset' },
  ]

  export let activeSection: SettingsSection
  export let onImportThemes: (themes: ThemeDefinition[]) => void
  export let appearanceSettings: AppearanceSettings
  export let resolvedThemeMode: 'light' | 'dark' = 'dark'
  export let lightTheme: ThemeDefinition
  export let darkTheme: ThemeDefinition
  export let availableLightThemes: ThemeDefinition[]
  export let availableDarkThemes: ThemeDefinition[]
  export let viewMode: ViewMode
  export let viewerSettings: CompareViewerSettings
  export let treeSettings: CompareTreeSettings
  export let minUiFontSize: number
  export let maxUiFontSize: number
  export let minCodeFontSize: number
  export let maxCodeFontSize: number
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
  export let onSelectSection: (section: SettingsSection) => void
  export let onSetThemeMode: (theme: ThemeMode) => void
  export let onSetThemePreset: (variant: ThemeVariant, themeId: string) => void
  export let onSetThemeFont: (variant: ThemeVariant, field: 'ui' | 'code', value: string) => void
  export let onSetThemeContrast: (variant: ThemeVariant, value: number) => void
  export let onSetUsePointerCursor: (value: boolean) => void
  export let onSetUiFontSize: (value: number) => void
  export let onSetCodeFontSize: (value: number) => void
  export let onSetViewMode: (viewMode: ViewMode) => void
  export let onSetViewerSettings: (settings: CompareViewerSettings) => void
  export let onOpenThemeEditor: (
    appearance: ThemeVariant,
    seedName: string,
    editing: boolean,
    availableAppearances: ThemeVariant[],
    themeId?: string,
  ) => void
  export let onSetTreeSettings: (settings: CompareTreeSettings) => void
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
              {:else if section.id === 'compare'}
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
          {resolvedThemeMode}
          {lightTheme}
          {darkTheme}
          {availableLightThemes}
          {availableDarkThemes}
          {viewerSettings}
          {minUiFontSize}
          {maxUiFontSize}
          {minCodeFontSize}
          {maxCodeFontSize}
          {onSetThemeMode}
          {onSetThemePreset}
          {onSetThemeFont}
          {onSetThemeContrast}
          {onSetUsePointerCursor}
          {onSetUiFontSize}
          {onSetCodeFontSize}
          {onSetViewerSettings}
          {onOpenThemeEditor}
    {onImportThemes}
        />
      {/if}

      {#if activeSection === 'compare'}
        <CompareSettingsSection
          {viewMode}
          {viewerSettings}
          {treeSettings}
          {appearanceSettings}
          {resolvedThemeMode}
          {onSetViewMode}
          {onSetViewerSettings}
          {onSetTreeSettings}
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
