<script lang="ts">
  import '../../styles/settings.css'
  import AppTopBar from '../AppTopBar.svelte'
  import SettingsScreen from '../SettingsScreen.svelte'
  import {
    formatLastUpdateCheck,
    formatLastUpdateCheckRelative,
    formatUpdateChannelLabel,
    type UpdateIndicatorState,
  } from '../app/update-controller'
  import type {
    CompareTreeSettings,
    CompareViewerSettings,
    UpdateChannel,
    ViewMode,
  } from '../types'
  import type {
    AppearanceSettings,
    ThemeAdvancedColorKey,
    ThemeDefinition,
    ThemeSemanticColorKey,
    ThemeVariant,
  } from '../theme'
  import type { SettingsSection } from '../ui-types'
  import UpdateIndicator from './UpdateIndicator.svelte'

  export let activeSettingsSection: SettingsSection
  export let appearanceSettings: AppearanceSettings
  export let resolvedThemeMode: 'light' | 'dark' = 'dark'
  export let lightAppearanceTheme: ThemeDefinition
  export let darkAppearanceTheme: ThemeDefinition
  export let availableLightThemes: ThemeDefinition[] = []
  export let availableDarkThemes: ThemeDefinition[] = []
  export let viewMode: ViewMode
  export let viewerSettings: CompareViewerSettings
  export let treeSettings: CompareTreeSettings
  export let minUiFontSize = 0
  export let maxUiFontSize = 0
  export let minCodeFontSize = 0
  export let maxCodeFontSize = 0
  export let checkForUpdatesOnLaunch = true
  export let updateChannel: UpdateChannel
  export let updateIndicatorState: UpdateIndicatorState
  export let lastUpdateCheckAt = ''
  export let errorMessage = ''
  export let showUpdateIndicator = false
  export let updateIndicatorTitle = ''
  export let openUpdateSettings: () => void
  export let onClose: () => void
  export let onSelectSection: (section: SettingsSection) => void
  export let onSetThemeMode: (mode: AppearanceSettings['mode']) => void
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
  export let onSetViewMode: (viewMode: ViewMode) => void
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
  export let onSetTreeSettings: (settings: CompareTreeSettings) => void
  export let onSetCheckForUpdatesOnLaunch: (value: boolean) => void
  export let onSetUpdateChannel: (channel: UpdateChannel) => void
  export let onCheckForUpdates: () => Promise<void> | void
  export let onDownloadUpdate: () => Promise<void> | void
  export let onInstallUpdate: () => Promise<void> | void
  export let onResetPreferences: () => void
  export let onClearRememberedSelections: () => void
  export let onResetEverything: () => void
</script>

<main class="screen settings-view">
  <AppTopBar context="Settings">
    {#snippet status()}
      <UpdateIndicator
        visible={showUpdateIndicator}
        title={updateIndicatorTitle}
        status={updateIndicatorState.status}
        onOpen={openUpdateSettings}
      />
    {/snippet}

    {#snippet actions()}
      <button
        aria-label="Close settings"
        class="secondary toolbar-button settings-close-button"
        title="Close settings"
        type="button"
        on:click={onClose}
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
        <span>Close</span>
      </button>
    {/snippet}
  </AppTopBar>

  {#if errorMessage}
    <p class="error-banner">{errorMessage}</p>
  {/if}

  <SettingsScreen
    activeSection={activeSettingsSection}
    {appearanceSettings}
    {resolvedThemeMode}
    lightTheme={lightAppearanceTheme}
    darkTheme={darkAppearanceTheme}
    {availableLightThemes}
    {availableDarkThemes}
    {viewMode}
    {viewerSettings}
    {treeSettings}
    {minUiFontSize}
    {maxUiFontSize}
    {minCodeFontSize}
    {maxCodeFontSize}
    {checkForUpdatesOnLaunch}
    {updateChannel}
    updateChannelLabel={formatUpdateChannelLabel(updateChannel)}
    currentVersion={updateIndicatorState.currentVersion}
    updateIndicatorState={updateIndicatorState.status}
    updateStatusMessage={updateIndicatorState.message}
    availableUpdate={updateIndicatorState.metadata}
    lastUpdateCheckLabel={formatLastUpdateCheck(lastUpdateCheckAt)}
    lastUpdateCheckRelativeLabel={formatLastUpdateCheckRelative(lastUpdateCheckAt)}
    updateBusy={updateIndicatorState.status === 'checking' || updateIndicatorState.status === 'downloading'}
    {onSelectSection}
    {onSetThemeMode}
    {onSetThemePreset}
    {onSetThemeColor}
    {onSetThemeSemanticColor}
    {onSetThemeAdvancedColor}
    {onSetThemeFont}
    {onSetThemeContrast}
    {onSetUsePointerCursor}
    {onSetUiFontSize}
    {onSetCodeFontSize}
    {onSetViewMode}
    {onSetViewerSettings}
    {onOpenThemeEditor}
    {onSetTreeSettings}
    {onSetCheckForUpdatesOnLaunch}
    {onSetUpdateChannel}
    {onCheckForUpdates}
    {onDownloadUpdate}
    {onInstallUpdate}
    {onResetPreferences}
    {onClearRememberedSelections}
    {onResetEverything}
  />
</main>
