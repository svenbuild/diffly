<script lang="ts">
  import { onMount, tick } from 'svelte'
  import AppTopBar from '../AppTopBar.svelte'
  import ToolbarSvgIcon from '../components/ToolbarSvgIcon.svelte'
  import SetupModeSlider from '../setup/SetupModeSlider.svelte'
  import GitSetupPanel from '../setup/GitSetupPanel.svelte'
  import settingsIconUrl from '../assets/icons/toolbar-settings.svg'
  import type {
    ExplorerEntry,
    GitDiffSource,
    GithubDiffSource,
    GithubPullRequestMetadata,
    PersistedGitSetup,
    SetupMode,
  } from '../types'
  import type {
    ExplorerPaneState,
    SettingsSection,
    Side,
  } from '../ui-types'
  import type { UpdateIndicatorState } from '../app/update-controller'
  import { markStartupProfile } from '../app/startup-profile'
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
  export let onGithubSourceChange: (source: GithubDiffSource | null) => void = () => {}
  export let onGithubMetadataChange: (metadata: GithubPullRequestMetadata | null) => void = () => {}
  export let initialGithubUrl = ''
  export let reloadRecentsRequestId = 0
  export let gitBrowserRoots: ExplorerEntry[] = []
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

  let LocalSetupPanelComponent: typeof import('../setup/LocalSetupPanel.svelte').default | null = null
  let GithubSetupPanelComponent: typeof import('../setup/GithubSetupPanel.svelte').default | null = null
  let localSetupPanelPromise: Promise<void> | null = null
  let githubSetupPanelPromise: Promise<void> | null = null

  function loadLocalSetupPanel() {
    if (LocalSetupPanelComponent) {
      return Promise.resolve()
    }

    if (!localSetupPanelPromise) {
      markStartupProfile('local-setup-panel-load-start')
      localSetupPanelPromise = import('../setup/LocalSetupPanel.svelte')
        .then((module) => {
          LocalSetupPanelComponent = module.default
          markStartupProfile('local-setup-panel-loaded')
        })
        .catch((error) => {
          localSetupPanelPromise = null
          throw error
        })
    }

    return localSetupPanelPromise
  }

  function loadGithubSetupPanel() {
    if (GithubSetupPanelComponent) {
      return Promise.resolve()
    }

    if (!githubSetupPanelPromise) {
      markStartupProfile('github-setup-panel-load-start')
      githubSetupPanelPromise = import('../setup/GithubSetupPanel.svelte')
        .then((module) => {
          GithubSetupPanelComponent = module.default
          markStartupProfile('github-setup-panel-loaded')
        })
        .catch((error) => {
          githubSetupPanelPromise = null
          throw error
        })
    }

    return githubSetupPanelPromise
  }

  onMount(() => {
    markStartupProfile('setup-screen-mounted', { setupMode })
    void tick().then(() => markStartupProfile('setup-screen-flushed', { setupMode }))
  })

  $: if (setupMode === 'local') {
    void loadLocalSetupPanel()
  }
  $: if (setupMode === 'github') {
    void loadGithubSetupPanel()
  }
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
      <button
        class="secondary icon-button settings-button"
        aria-label="Settings"
        title="Settings"
        type="button"
        on:click={() => openSettings('appearance')}
      >
        <ToolbarSvgIcon src={settingsIconUrl} className="settings-icon" />
      </button>
    </div>
    {/snippet}
  </AppTopBar>

  {#if errorMessage}
    <p class="error-banner">{errorMessage}</p>
  {/if}

  <section class="setup-body">
    {#if setupMode === 'local'}
      {#if LocalSetupPanelComponent}
        <svelte:component
          this={LocalSetupPanelComponent}
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
      {/if}
    {:else if setupMode === 'git'}
      <GitSetupPanel
        onChange={onGitSourceChange}
        {gitSetup}
        onSetupChange={onGitSetupChange}
        {reloadRecentsRequestId}
        browserRoots={gitBrowserRoots}
      />
    {:else}
      {#if GithubSetupPanelComponent}
        <svelte:component
          this={GithubSetupPanelComponent}
          onChange={onGithubSourceChange}
          onMetadataChange={onGithubMetadataChange}
          initialUrl={initialGithubUrl}
          {reloadRecentsRequestId}
        />
      {/if}
    {/if}
  </section>
</main>
