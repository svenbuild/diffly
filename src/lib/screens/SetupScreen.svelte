<script lang="ts">
  import AppTopBar from '../AppTopBar.svelte'
  import PickerPane from '../PickerPane.svelte'
  import SetupModeSlider from '../setup/SetupModeSlider.svelte'
  import type { ExplorerEntry, SetupMode } from '../types'
  import type {
    ExplorerPaneState,
    SettingsSection,
    Side,
  } from '../ui-types'
  import type { UpdateIndicatorState } from '../app/update-controller'
  import UpdateIndicator from './UpdateIndicator.svelte'

  export let updateIndicatorState: UpdateIndicatorState
  export let showUpdateIndicator = false
  export let updateIndicatorTitle = ''
  export let openUpdateSettings: () => void
  export let setupMode: SetupMode = 'local'
  export let onSetupModeChange: (mode: SetupMode) => void
  export let setupTopbarWarning = ''
  export let loading = false
  export let pickerCanCompare = false
  export let sameSelectionWarning = ''
  export let setupHintMessage = ''
  export let runCompare: () => void
  export let openSettings: (section?: SettingsSection) => void
  export let errorMessage = ''
  export let pickerSides: Array<{ side: Side; pane: ExplorerPaneState }> = []
  export let pickerLoading = false
  export let canGoBack: (pane: ExplorerPaneState) => boolean
  export let canGoForward: (pane: ExplorerPaneState) => boolean
  export let currentDrive: (pane: ExplorerPaneState) => string
  export let formatModified: (modifiedMs: number | null) => string
  export let formatSize: (size: number | null) => string
  export let entryTypeLabel: (entry: ExplorerEntry) => string
  export let changeDrive: (side: Side, path: string) => Promise<void>
  export let navigateHistory: (side: Side, direction: -1 | 1) => Promise<void>
  export let navigateTo: (side: Side, path: string) => Promise<void>
  export let updatePathInput: (side: Side, value: string) => void
  export let submitPathInput: (side: Side) => Promise<void>
  export let browseSystem: (side: Side, kind?: 'file' | 'directory') => Promise<void>
  export let useCurrentFolder: (side: Side) => void
  export let isCurrentFolderSelected: (pane: ExplorerPaneState) => boolean
  export let selectListEntry: (side: Side, entry: ExplorerEntry, event?: MouseEvent) => void
  export let activateListEntry: (side: Side, entry: ExplorerEntry) => Promise<void>
  export let isTargetSelected: (pane: ExplorerPaneState, entry: ExplorerEntry) => boolean

  $: placeholderMessage =
    setupMode === 'git' ? 'Git setup coming soon' : 'GitHub setup coming soon'
  $: compareButtonTitle =
    setupMode === 'local'
      ? sameSelectionWarning || setupHintMessage || 'Compare selected targets'
      : placeholderMessage
</script>

<main class="screen setup-screen">
  <AppTopBar context="Setup">
    {#snippet status()}
      <UpdateIndicator
        visible={showUpdateIndicator}
        title={updateIndicatorTitle}
        status={updateIndicatorState.status}
        onOpen={openUpdateSettings}
      />
    {/snippet}

    {#snippet middle()}
      <SetupModeSlider mode={setupMode} onChange={onSetupModeChange} />
      {#if setupTopbarWarning && setupMode === 'local'}
        <p class="setup-topbar-warning">{setupTopbarWarning}</p>
      {/if}
    {/snippet}

    {#snippet actions()}
    <div class="setup-bar-actions">
      <button
        class="primary setup-compare-button"
        class:compare-action-busy={loading}
        aria-busy={loading}
        disabled={!pickerCanCompare || loading}
        title={compareButtonTitle}
        type="button"
        on:click={runCompare}
      >
        {#if loading}
          Comparing...
        {:else}
          Compare
        {/if}
      </button>
      <button class="secondary" type="button" on:click={() => openSettings('appearance')}>
        Settings
      </button>
    </div>
    {/snippet}
  </AppTopBar>

  {#if errorMessage}
    <p class="error-banner">{errorMessage}</p>
  {/if}

  <section class="setup-body">
    {#if setupMode === 'local'}
      <section class="setup-launcher" aria-label="Compare setup">
        <section class="picker-workspace">
          {#each pickerSides as item}
            <PickerPane
              side={item.side}
              pane={item.pane}
              {pickerLoading}
              {canGoBack}
              {canGoForward}
              {currentDrive}
              {formatModified}
              {formatSize}
              {entryTypeLabel}
              {changeDrive}
              {navigateHistory}
              {navigateTo}
              {updatePathInput}
              {submitPathInput}
              {browseSystem}
              setCurrentFolderAsTarget={useCurrentFolder}
              {isCurrentFolderSelected}
              {selectListEntry}
              {activateListEntry}
              {isTargetSelected}
            />
          {/each}
        </section>
      </section>
    {:else}
      <section class="setup-placeholder" aria-label="{setupMode} setup">
        <p>{placeholderMessage}</p>
      </section>
    {/if}
  </section>
</main>
