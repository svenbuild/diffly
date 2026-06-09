<script lang="ts">
  import AppTopBar from '../AppTopBar.svelte'
  import SetupModeSlider from '../setup/SetupModeSlider.svelte'
  import LocalSetupPanel from '../setup/LocalSetupPanel.svelte'
  import GitSetupPanel from '../setup/GitSetupPanel.svelte'
  import GithubSetupPanel from '../setup/GithubSetupPanel.svelte'
  import type { ExplorerEntry, GitDiffSource, PersistedGitSetup, SetupMode } from '../types'
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
  export let compareButtonTitle = ''
  export let runCompare: () => void | Promise<void>
  export let openSettings: (section?: SettingsSection) => void
  export let errorMessage = ''
  export let onGitSourceChange: (source: GitDiffSource | null) => void = () => {}
  export let gitSetup: PersistedGitSetup = {}
  export let onGitSetupChange: (setup: PersistedGitSetup) => void = () => {}
  export let reloadRecentsRequestId = 0
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
      {#if setupTopbarWarning}
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
      <LocalSetupPanel
        {pickerSides}
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
        {useCurrentFolder}
        {isCurrentFolderSelected}
        {selectListEntry}
        {activateListEntry}
        {isTargetSelected}
      />
    {:else if setupMode === 'git'}
      <GitSetupPanel
        onChange={onGitSourceChange}
        {gitSetup}
        onSetupChange={onGitSetupChange}
        {reloadRecentsRequestId}
      />
    {:else}
      <GithubSetupPanel />
    {/if}
  </section>
</main>
