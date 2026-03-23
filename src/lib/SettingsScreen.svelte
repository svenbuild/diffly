<script lang="ts">
  import type {
    ContextLinesSetting,
    ThemeMode,
    UpdateChannel,
    UpdateMetadata,
    ViewMode,
  } from './types'
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
  export let themeMode: ThemeMode
  export let ignoreWhitespace: boolean
  export let ignoreCase: boolean
  export let viewMode: ViewMode
  export let showFullFile: boolean
  export let contextLines: ContextLinesSetting
  export let contextLinePresets: ContextLinesSetting[]
  export let viewerTextSize: number
  export let minViewerTextSize: number
  export let maxViewerTextSize: number
  export let wrapSideBySideLines: boolean
  export let showInlineHighlights: boolean
  export let showSyntaxHighlighting: boolean
  export let syncSideBySideScroll: boolean
  export let checkForUpdatesOnLaunch: boolean
  export let updateChannel: UpdateChannel
  export let currentVersion: string
  export let updateIndicatorState: UpdateIndicatorStatus
  export let updateStatusMessage: string
  export let availableUpdate: UpdateMetadata | null
  export let lastUpdateCheckLabel: string
  export let updateBusy: boolean
  export let onBack: () => void
  export let onSelectSection: (section: SettingsSection) => void
  export let onSetThemeMode: (theme: ThemeMode) => void
  export let onToggleIgnoreWhitespace: () => void
  export let onToggleIgnoreCase: () => void
  export let onSetViewMode: (viewMode: ViewMode) => void
  export let onToggleShowFullFile: () => void
  export let onSetContextLines: (value: string) => void
  export let onStepViewerTextSize: (direction: -1 | 1) => void
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

  let searchQuery = ''
  let normalizedSearch = ''
  let searchActive = false
  let showAppearancePage = false
  let showViewerLayout = false
  let showViewerRendering = false
  let showViewerComparison = false
  let showViewerScrolling = false
  let showViewerPage = false
  let showUpdatesStatus = false
  let showUpdatesBehavior = false
  let showUpdatesPage = false
  let showResetStorage = false
  let showResetDanger = false
  let showResetPage = false
  let renderAppearancePage = false
  let renderViewerPage = false
  let renderUpdatesPage = false
  let renderResetPage = false
  let hasSearchResults = false

  const normalizeSearchValue = (value: string) => value.trim().toLowerCase()

  function matchesSearch(...terms: Array<string | number | null | undefined>) {
    if (!normalizedSearch) {
      return true
    }

    return terms.some((term) => normalizeSearchValue(String(term ?? '')).includes(normalizedSearch))
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

    if (status === 'upToDate') {
      return 'success'
    }

    if (status === 'failed' || status === 'unavailable') {
      return 'danger'
    }

    return 'neutral'
  }

  function sectionHasSearchMatch(section: SettingsSection) {
    if (section === 'appearance') {
      return showAppearancePage
    }

    if (section === 'viewer') {
      return showViewerPage
    }

    if (section === 'updates') {
      return showUpdatesPage
    }

    return showResetPage
  }

  function selectSection(section: SettingsSection) {
    searchQuery = ''
    onSelectSection(section)
  }

  $: normalizedSearch = normalizeSearchValue(searchQuery)
  $: searchActive = normalizedSearch.length > 0
  $: showAppearancePage = matchesSearch(
    'appearance',
    'theme',
    'dark theme',
    'light theme',
    'window appearance',
  )
  $: showViewerLayout = matchesSearch(
    'viewer',
    'layout',
    'view mode',
    'split view',
    'unified view',
    'wrap long lines',
    'full file',
    'context lines',
  )
  $: showViewerRendering = matchesSearch(
    'viewer',
    'rendering',
    'text size',
    'syntax highlighting',
    'inline highlights',
  )
  $: showViewerComparison = matchesSearch(
    'viewer',
    'comparison behavior',
    'ignore whitespace',
    'ignore case',
  )
  $: showViewerScrolling = matchesSearch('viewer', 'scrolling', 'sync scrolling')
  $: showViewerPage =
    showViewerLayout || showViewerRendering || showViewerComparison || showViewerScrolling
  $: showUpdatesStatus = matchesSearch(
    'updates',
    'current version',
    'last checked',
    'status',
    'check for updates',
    updateStatusMessage,
    currentVersion,
    lastUpdateCheckLabel,
    availableUpdate?.version,
  )
  $: showUpdatesBehavior = matchesSearch(
    'updates',
    'check for updates on startup',
    'startup',
    'release channel',
    updateChannel,
    'stable channel',
  )
  $: showUpdatesPage = showUpdatesStatus || showUpdatesBehavior
  $: showResetStorage = matchesSearch(
    'reset',
    'preferences',
    'clear remembered selections',
    'history',
    'remembered selections',
  )
  $: showResetDanger = matchesSearch('reset everything', 'danger zone', 'reset', 'first-run state')
  $: showResetPage = showResetStorage || showResetDanger
  $: hasSearchResults =
    showAppearancePage || showViewerPage || showUpdatesPage || showResetPage
  $: renderAppearancePage = searchActive ? showAppearancePage : activeSection === 'appearance'
  $: renderViewerPage = searchActive ? showViewerPage : activeSection === 'viewer'
  $: renderUpdatesPage = searchActive ? showUpdatesPage : activeSection === 'updates'
  $: renderResetPage = searchActive ? showResetPage : activeSection === 'reset'
</script>

<section class="settings-screen-body">
  <nav aria-label="Settings sections" class="settings-section-rail">
    <div class="settings-rail-inner">
      <button class="secondary settings-back-link" type="button" on:click={onBack}>
        <svg aria-hidden="true" class="settings-back-icon" viewBox="0 0 16 16">
          <path
            d="M9.8 3.2 5.4 8l4.4 4.8"
            fill="none"
            stroke="currentColor"
            stroke-linecap="round"
            stroke-linejoin="round"
            stroke-width="1.6"
          />
        </svg>
        <span>Back</span>
      </button>

      <div class="settings-section-list">
        {#each sections as section}
          <button
            aria-current={!searchActive && activeSection === section.id ? 'page' : undefined}
            class:active={!searchActive && activeSection === section.id}
            class:search-match={searchActive && sectionHasSearchMatch(section.id)}
            class="settings-section-link"
            type="button"
            on:click={() => selectSection(section.id)}
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
          <p>Theme, viewer defaults, updates, and reset actions.</p>
        </div>

        <div class="settings-search-tools">
          <label class="settings-search-field">
            <svg aria-hidden="true" class="settings-search-icon" viewBox="0 0 16 16">
              <circle cx="7" cy="7" r="4.5" fill="none" stroke="currentColor" stroke-width="1.3" />
              <path d="m10.6 10.6 3 3" fill="none" stroke="currentColor" stroke-linecap="round" stroke-width="1.3" />
            </svg>
            <input
              aria-label="Search settings"
              bind:value={searchQuery}
              placeholder="Search settings"
              type="search"
            />
          </label>

          {#if searchActive}
            <button class="secondary" type="button" on:click={() => (searchQuery = '')}>
              Clear
            </button>
          {/if}
        </div>
      </header>

      {#if searchActive}
        <section class="settings-search-summary">
          <div>
            <h2>Search results</h2>
            <p>Matching settings for "{searchQuery}".</p>
          </div>
        </section>
      {/if}

      {#if renderAppearancePage}
        <section class="settings-page">
          <div class="settings-page-heading">
            <h2>Appearance</h2>
            <p>Theme and window presentation.</p>
          </div>

          <section class="settings-group">
            <div class="settings-group-header">
              <h3>Theme</h3>
              <p>Use compact previews instead of oversized option cards.</p>
            </div>

            <div class="settings-row settings-row-wide">
              <div class="settings-row-copy">
                <strong>Theme</strong>
                <p>Choose the default surface palette for the app.</p>
              </div>

              <div class="settings-control settings-control-wide">
                <div class="settings-theme-grid">
                  <button
                    class:active={themeMode === 'dark'}
                    class="settings-theme-tile"
                    type="button"
                    on:click={() => onSetThemeMode('dark')}
                  >
                    <span aria-hidden="true" class="settings-theme-preview settings-theme-preview-dark">
                      <span></span>
                      <span></span>
                      <span></span>
                    </span>
                    <span class="settings-theme-meta">
                      <strong>Dark</strong>
                      <small>Lower glare for long compare sessions.</small>
                    </span>
                  </button>

                  <button
                    class:active={themeMode === 'light'}
                    class="settings-theme-tile"
                    type="button"
                    on:click={() => onSetThemeMode('light')}
                  >
                    <span aria-hidden="true" class="settings-theme-preview settings-theme-preview-light">
                      <span></span>
                      <span></span>
                      <span></span>
                    </span>
                    <span class="settings-theme-meta">
                      <strong>Light</strong>
                      <small>Higher contrast and neutral canvas tones.</small>
                    </span>
                  </button>
                </div>
              </div>
            </div>
          </section>
        </section>
      {/if}

      {#if renderViewerPage}
        <section class="settings-page">
          <div class="settings-page-heading">
            <h2>Viewer</h2>
            <p>Layout, rendering, comparison rules, and scroll behavior.</p>
          </div>

          {#if !searchActive || showViewerLayout}
            <section class="settings-group">
              <div class="settings-group-header">
                <h3>Layout</h3>
                <p>How diffs are arranged and framed.</p>
              </div>

              {#if matchesSearch('viewer', 'layout', 'view mode', 'split view', 'unified view')}
                <div class="settings-row">
                  <div class="settings-row-copy">
                    <strong>View mode</strong>
                    <p>Choose the default diff layout.</p>
                  </div>

                  <div class="settings-control">
                    <div class="settings-segmented-control" role="group" aria-label="Default diff view">
                      <button
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
              {/if}

              {#if matchesSearch('viewer', 'layout', 'wrap long lines', 'wrap')}
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
              {/if}

              {#if matchesSearch('viewer', 'layout', 'full file')}
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
              {/if}

              {#if matchesSearch('viewer', 'layout', 'context lines')}
                <label class="settings-row settings-row-interactive">
                  <div class="settings-row-copy">
                    <strong>Context lines</strong>
                    <p>Visible lines around each change when full file is off.</p>
                  </div>

                  <span class="settings-control">
                    <select
                      disabled={showFullFile}
                      value={contextLines}
                      on:change={(event) => onSetContextLines((event.currentTarget as HTMLSelectElement).value)}
                    >
                      {#each contextLinePresets as preset}
                        <option value={preset}>{preset}</option>
                      {/each}
                    </select>
                  </span>
                </label>
              {/if}
            </section>
          {/if}

          {#if !searchActive || showViewerRendering}
            <section class="settings-group">
              <div class="settings-group-header">
                <h3>Rendering</h3>
                <p>Text readability and inline detail.</p>
              </div>

              {#if matchesSearch('viewer', 'rendering', 'text size')}
                <div class="settings-row">
                  <div class="settings-row-copy">
                    <strong>Text size</strong>
                    <p>Adjust the base size of diff text.</p>
                  </div>

                  <div class="settings-control">
                    <div class="settings-stepper">
                      <button
                        class="secondary settings-stepper-button"
                        disabled={viewerTextSize <= minViewerTextSize}
                        type="button"
                        on:click={() => onStepViewerTextSize(-1)}
                      >
                        -
                      </button>
                      <span class="settings-stepper-value">{viewerTextSize}</span>
                      <button
                        class="secondary settings-stepper-button"
                        disabled={viewerTextSize >= maxViewerTextSize}
                        type="button"
                        on:click={() => onStepViewerTextSize(1)}
                      >
                        +
                      </button>
                    </div>
                  </div>
                </div>
              {/if}

              {#if matchesSearch('viewer', 'rendering', 'syntax highlighting')}
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
              {/if}

              {#if matchesSearch('viewer', 'rendering', 'inline highlights')}
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
              {/if}
            </section>
          {/if}

          {#if !searchActive || showViewerComparison}
            <section class="settings-group">
              <div class="settings-group-header">
                <h3>Comparison behavior</h3>
                <p>Rules that change how diffs are computed.</p>
              </div>

              {#if matchesSearch('viewer', 'comparison behavior', 'ignore whitespace')}
                <label class="settings-row settings-row-interactive">
                  <div class="settings-row-copy">
                    <strong>Ignore whitespace</strong>
                    <p>Treat whitespace-only edits as unchanged.</p>
                  </div>

                  <span class="settings-control">
                    <span class="settings-switch">
                      <input
                        checked={ignoreWhitespace}
                        role="switch"
                        type="checkbox"
                        on:change={onToggleIgnoreWhitespace}
                      />
                      <span aria-hidden="true" class="settings-switch-ui"></span>
                    </span>
                  </span>
                </label>
              {/if}

              {#if matchesSearch('viewer', 'comparison behavior', 'ignore case')}
                <label class="settings-row settings-row-interactive">
                  <div class="settings-row-copy">
                    <strong>Ignore case</strong>
                    <p>Treat case-only edits as unchanged.</p>
                  </div>

                  <span class="settings-control">
                    <span class="settings-switch">
                      <input
                        checked={ignoreCase}
                        role="switch"
                        type="checkbox"
                        on:change={onToggleIgnoreCase}
                      />
                      <span aria-hidden="true" class="settings-switch-ui"></span>
                    </span>
                  </span>
                </label>
              {/if}
            </section>
          {/if}

          {#if !searchActive || showViewerScrolling}
            <section class="settings-group">
              <div class="settings-group-header">
                <h3>Scrolling</h3>
                <p>Pane alignment while reading side-by-side diffs.</p>
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
            </section>
          {/if}
        </section>
      {/if}

      {#if renderUpdatesPage}
        <section class="settings-page">
          <div class="settings-page-heading">
            <h2>Updates</h2>
            <p>Current release status and startup behavior.</p>
          </div>

          {#if !searchActive || showUpdatesStatus}
            <section class="settings-group">
              <div class="settings-group-header">
                <h3>Status</h3>
                <p>Version details for this install.</p>
              </div>

              <div class="settings-update-summary">
                <div class="settings-summary-item">
                  <span>Current version</span>
                  <strong>{currentVersion || 'Unavailable'}</strong>
                </div>
                <div class="settings-summary-item">
                  <span>Last checked</span>
                  <strong>{lastUpdateCheckLabel}</strong>
                </div>
                <div class="settings-summary-item">
                  <span>Status</span>
                  <strong>{getUpdateStatusTitle(updateIndicatorState)}</strong>
                </div>
                <div class="settings-summary-item">
                  <span>{availableUpdate ? 'Latest version' : 'Channel'}</span>
                  <strong>{availableUpdate ? availableUpdate.version : updateChannel}</strong>
                </div>
              </div>

              <div class="settings-update-status" data-tone={getUpdateStatusTone(updateIndicatorState)}>
                <div class="settings-update-copy">
                  <strong>{getUpdateStatusTitle(updateIndicatorState)}</strong>
                  <p>{updateStatusMessage}</p>
                </div>

                <div class="settings-action-row">
                  <button
                    class="secondary"
                    disabled={updateBusy}
                    type="button"
                    on:click={onCheckForUpdates}
                  >
                    Check for updates
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
              </div>
            </section>
          {/if}

          {#if !searchActive || showUpdatesBehavior}
            <section class="settings-group">
              <div class="settings-group-header">
                <h3>Behavior</h3>
                <p>Automatic checks and the current release feed.</p>
              </div>

              {#if matchesSearch('updates', 'check for updates on startup', 'startup')}
                <label class="settings-row settings-row-interactive">
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
                          onSetCheckForUpdatesOnLaunch((event.currentTarget as HTMLInputElement).checked)}
                      />
                      <span aria-hidden="true" class="settings-switch-ui"></span>
                    </span>
                  </span>
                </label>
              {/if}

              {#if matchesSearch('updates', 'release channel', 'stable channel', 'channel')}
                <div class="settings-row">
                  <div class="settings-row-copy">
                    <strong>Release channel</strong>
                    <p>Only the stable feed is available in this build.</p>
                  </div>

                  <div class="settings-control">
                    <span class="settings-readonly-value">{updateChannel}</span>
                  </div>
                </div>
              {/if}
            </section>
          {/if}
        </section>
      {/if}

      {#if renderResetPage}
        <section class="settings-page">
          <div class="settings-page-heading">
            <h2>Reset</h2>
            <p>Clear saved state without losing control of destructive actions.</p>
          </div>

          {#if !searchActive || showResetStorage}
            <section class="settings-group">
              <div class="settings-group-header">
                <h3>Preferences</h3>
                <p>Reset local settings and remembered targets.</p>
              </div>

              {#if matchesSearch('reset', 'preferences', 'appearance', 'viewer', 'updates')}
                <div class="settings-row">
                  <div class="settings-row-copy">
                    <strong>Reset preferences</strong>
                    <p>Restore appearance, viewer, and update defaults.</p>
                  </div>

                  <div class="settings-control">
                    <button class="secondary" type="button" on:click={onResetPreferences}>
                      Reset preferences
                    </button>
                  </div>
                </div>
              {/if}

              {#if matchesSearch('reset', 'clear remembered selections', 'history', 'remembered selections')}
                <div class="settings-row">
                  <div class="settings-row-copy">
                    <strong>Clear remembered selections</strong>
                    <p>Remove stored pane targets and selection history.</p>
                  </div>

                  <div class="settings-control">
                    <button class="secondary" type="button" on:click={onClearRememberedSelections}>
                      Clear selections
                    </button>
                  </div>
                </div>
              {/if}
            </section>
          {/if}

          {#if !searchActive || showResetDanger}
            <section class="settings-group settings-group-danger">
              <div class="settings-group-header">
                <h3>Danger zone</h3>
                <p>Use this only when you want a clean first-run state.</p>
              </div>

              <div class="settings-row">
                <div class="settings-row-copy">
                  <strong>Reset everything</strong>
                  <p>Clear preferences, remembered selections, and reset the app to its initial state.</p>
                </div>

                <div class="settings-control">
                  <button class="primary" type="button" on:click={onResetEverything}>
                    Reset everything
                  </button>
                </div>
              </div>
            </section>
          {/if}
        </section>
      {/if}

      {#if searchActive && !hasSearchResults}
        <section class="settings-empty-state">
          <strong>No matching settings</strong>
          <p>Try terms like theme, whitespace, sync, updates, or reset.</p>
        </section>
      {/if}
    </div>
  </div>
</section>
