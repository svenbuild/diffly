<script lang="ts">
  import type {
    CompareMode,
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

  const sections: { id: SettingsSection; label: string }[] = [
    { id: 'appearance', label: 'Appearance' },
    { id: 'general', label: 'General' },
    { id: 'comparison', label: 'Comparison' },
    { id: 'viewer', label: 'Viewer' },
    { id: 'updates', label: 'Updates' },
    { id: 'reset', label: 'Reset' },
  ]

  export let activeSection: SettingsSection
  export let themeMode: ThemeMode
  export let mode: CompareMode
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
  export let onSelectSection: (section: SettingsSection) => void
  export let onSetThemeMode: (theme: ThemeMode) => void
  export let onSetMode: (mode: CompareMode) => void
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
  export let onSetUpdateChannel: (channel: UpdateChannel) => void
  export let onCheckForUpdates: () => void
  export let onDownloadUpdate: () => void
  export let onInstallUpdate: () => void
  export let onResetPreferences: () => void
  export let onClearRememberedSelections: () => void
  export let onResetEverything: () => void
</script>

<section class="settings-screen-body">
  <nav aria-label="Settings sections" class="settings-section-rail">
    <div class="settings-section-list">
      {#each sections as section}
        <button
          aria-current={activeSection === section.id ? 'page' : undefined}
          class:active={activeSection === section.id}
          class="settings-section-link"
          type="button"
          on:click={() => onSelectSection(section.id)}
        >
          {section.label}
        </button>
      {/each}
    </div>
  </nav>

  <div class="settings-panel-shell">
    <div class="settings-panel">
      <header class="settings-panel-header">
        <div class="settings-panel-heading">
          <h1>Settings</h1>
          <p>Configure Diffly defaults and maintenance options.</p>
        </div>
      </header>

      {#if activeSection === 'appearance'}
        <section class="settings-card">
          <div class="settings-card-header">
            <h2>Appearance</h2>
            <p>Visual preferences that apply across the app.</p>
          </div>

          <div class="settings-choice-list">
            <button
              class:active={themeMode === 'dark'}
              class="settings-choice-row"
              type="button"
              on:click={() => onSetThemeMode('dark')}
            >
              <span class="settings-choice-copy">
                <strong>Dark</strong>
                <small>Use the dark theme.</small>
              </span>
              {#if themeMode === 'dark'}
                <span class="settings-choice-state">Active</span>
              {/if}
            </button>

            <button
              class:active={themeMode === 'light'}
              class="settings-choice-row"
              type="button"
              on:click={() => onSetThemeMode('light')}
            >
              <span class="settings-choice-copy">
                <strong>Light</strong>
                <small>Use the light theme.</small>
              </span>
              {#if themeMode === 'light'}
                <span class="settings-choice-state">Active</span>
              {/if}
            </button>
          </div>
        </section>
      {/if}

      {#if activeSection === 'general'}
        <section class="settings-card">
          <div class="settings-card-header">
            <h2>General</h2>
            <p>Default behavior before a compare starts.</p>
          </div>

          <div class="settings-choice-list">
            <button
              class:active={mode === 'directory'}
              class="settings-choice-row"
              type="button"
              on:click={() => onSetMode('directory')}
            >
              <span class="settings-choice-copy">
                <strong>Directories</strong>
                <small>Start in directory compare mode.</small>
              </span>
              {#if mode === 'directory'}
                <span class="settings-choice-state">Active</span>
              {/if}
            </button>

            <button
              class:active={mode === 'file'}
              class="settings-choice-row"
              type="button"
              on:click={() => onSetMode('file')}
            >
              <span class="settings-choice-copy">
                <strong>Files</strong>
                <small>Start in file compare mode.</small>
              </span>
              {#if mode === 'file'}
                <span class="settings-choice-state">Active</span>
              {/if}
            </button>
          </div>
        </section>
      {/if}

      {#if activeSection === 'comparison'}
        <section class="settings-card">
          <div class="settings-card-header">
            <h2>Comparison</h2>
            <p>How Diffly should detect differences by default.</p>
          </div>

          <label class="settings-toggle-row">
            <span>
              <strong>Ignore whitespace</strong>
              <small>Treat whitespace-only changes as unchanged.</small>
            </span>
            <input checked={ignoreWhitespace} type="checkbox" on:change={onToggleIgnoreWhitespace} />
          </label>

          <label class="settings-toggle-row">
            <span>
              <strong>Ignore case</strong>
              <small>Treat case-only edits as unchanged.</small>
            </span>
            <input checked={ignoreCase} type="checkbox" on:change={onToggleIgnoreCase} />
          </label>
        </section>
      {/if}

      {#if activeSection === 'viewer'}
        <section class="settings-card">
          <div class="settings-card-header">
            <h2>Viewer</h2>
            <p>Defaults for the diff presentation after compare starts.</p>
          </div>

          <div class="settings-choice-list">
            <button
              class:active={viewMode === 'sideBySide'}
              class="settings-choice-row"
              type="button"
              on:click={() => onSetViewMode('sideBySide')}
            >
              <span class="settings-choice-copy">
                <strong>Split view</strong>
                <small>Show left and right panes side by side.</small>
              </span>
              {#if viewMode === 'sideBySide'}
                <span class="settings-choice-state">Active</span>
              {/if}
            </button>

            <button
              class:active={viewMode === 'unified'}
              class="settings-choice-row"
              type="button"
              on:click={() => onSetViewMode('unified')}
            >
              <span class="settings-choice-copy">
                <strong>Unified view</strong>
                <small>Show one merged diff view.</small>
              </span>
              {#if viewMode === 'unified'}
                <span class="settings-choice-state">Active</span>
              {/if}
            </button>
          </div>

          <label class="settings-toggle-row">
            <span>
              <strong>Full file</strong>
              <small>Show the complete file instead of contextual hunks.</small>
            </span>
            <input checked={showFullFile} type="checkbox" on:change={onToggleShowFullFile} />
          </label>

          <label class="settings-select-row">
            <span>
              <strong>Context lines</strong>
              <small>Lines shown around each change when full file is off.</small>
            </span>
            <select
              disabled={showFullFile}
              value={contextLines}
              on:change={(event) => onSetContextLines((event.currentTarget as HTMLSelectElement).value)}
            >
              {#each contextLinePresets as preset}
                <option value={preset}>{preset}</option>
              {/each}
            </select>
          </label>

          <div class="settings-stepper-row">
            <span>
              <strong>Text size</strong>
              <small>Adjust the size of diff text.</small>
            </span>
            <div class="settings-stepper">
              <button
                class="secondary settings-stepper-button"
                disabled={viewerTextSize <= minViewerTextSize}
                type="button"
                on:click={() => onStepViewerTextSize(-1)}
              >
                -
              </button>
              <span class="settings-stepper-value">{String(viewerTextSize)}</span>
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

          <label class="settings-toggle-row">
            <span>
              <strong>Wrap long lines</strong>
              <small>Wrap lines instead of scrolling horizontally.</small>
            </span>
            <input checked={wrapSideBySideLines} type="checkbox" on:change={onToggleWrapSideBySideLines} />
          </label>

          <label class="settings-toggle-row">
            <span>
              <strong>Inline highlights</strong>
              <small>Highlight changed fragments inside a line.</small>
            </span>
            <input checked={showInlineHighlights} type="checkbox" on:change={onToggleShowInlineHighlights} />
          </label>

          <label class="settings-toggle-row">
            <span>
              <strong>Syntax highlighting</strong>
              <small>Apply language coloring in the diff viewer.</small>
            </span>
            <input checked={showSyntaxHighlighting} type="checkbox" on:change={onToggleShowSyntaxHighlighting} />
          </label>

          <label class="settings-toggle-row">
            <span>
              <strong>Sync scrolling</strong>
              <small>Keep both panes aligned while scrolling.</small>
            </span>
            <input checked={syncSideBySideScroll} type="checkbox" on:change={onToggleSyncSideBySideScroll} />
          </label>
        </section>
      {/if}

      {#if activeSection === 'updates'}
        <section class="settings-card">
          <div class="settings-card-header">
            <h2>Updates</h2>
            <p>Check for new Diffly builds and manage installation.</p>
          </div>

          <div class="settings-info-grid">
            <div class="settings-info-row">
              <strong>Current version</strong>
              <span>{currentVersion || 'Unavailable'}</span>
            </div>
            <div class="settings-info-row">
              <strong>Release channel</strong>
              <span>{updateChannel}</span>
            </div>
            <div class="settings-info-row">
              <strong>Last checked</strong>
              <span>{lastUpdateCheckLabel}</span>
            </div>
          </div>

          <label class="settings-toggle-row">
            <span>
              <strong>Check for updates on startup</strong>
              <small>Run a background check after app startup.</small>
            </span>
            <input
              checked={checkForUpdatesOnLaunch}
              type="checkbox"
              on:change={(event) =>
                onSetCheckForUpdatesOnLaunch((event.currentTarget as HTMLInputElement).checked)}
            />
          </label>

          <label class="settings-select-row">
            <span>
              <strong>Release channel</strong>
              <small>Only the stable channel is available in this version.</small>
            </span>
            <select
              value={updateChannel}
              on:change={(event) =>
                onSetUpdateChannel((event.currentTarget as HTMLSelectElement).value as UpdateChannel)}
            >
              <option value="stable">Stable</option>
            </select>
          </label>

          <div class="settings-update-status" data-status={updateIndicatorState}>
            <strong>
              {#if updateIndicatorState === 'available'}
                Update available
              {:else if updateIndicatorState === 'downloaded'}
                Update ready
              {:else if updateIndicatorState === 'upToDate'}
                Up to date
              {:else if updateIndicatorState === 'failed' || updateIndicatorState === 'unavailable'}
                Update issue
              {:else}
                Update status
              {/if}
            </strong>
            <p>{updateStatusMessage}</p>
            {#if availableUpdate}
              <span class="settings-update-meta">Latest version {availableUpdate.version}</span>
            {/if}
          </div>

          <div class="settings-action-row">
            <button class="secondary" disabled={updateBusy} type="button" on:click={onCheckForUpdates}>
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
        </section>
      {/if}

      {#if activeSection === 'reset'}
        <section class="settings-card settings-card-danger">
          <div class="settings-card-header">
            <h2>Reset</h2>
            <p>Clear saved preferences or remembered compare selections.</p>
          </div>

          <div class="settings-reset-list">
            <div class="settings-reset-row">
              <span>
                <strong>Reset preferences</strong>
                <small>Restore appearance, comparison, viewer, and update defaults.</small>
              </span>
              <button class="secondary" type="button" on:click={onResetPreferences}>
                Reset preferences
              </button>
            </div>

            <div class="settings-reset-row">
              <span>
                <strong>Clear remembered selections</strong>
                <small>Remove stored pane selections and history.</small>
              </span>
              <button class="secondary" type="button" on:click={onClearRememberedSelections}>
                Clear selections
              </button>
            </div>

            <div class="settings-reset-row">
              <span>
                <strong>Reset everything</strong>
                <small>Return Diffly to a clean first-run state.</small>
              </span>
              <button class="primary" type="button" on:click={onResetEverything}>
                Reset everything
              </button>
            </div>
          </div>
        </section>
      {/if}
    </div>
  </div>
</section>
