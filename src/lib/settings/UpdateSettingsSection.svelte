<script lang="ts">
  import type { UpdateMetadata } from '../types'

  type UpdateIndicatorStatus =
    | 'idle'
    | 'checking'
    | 'available'
    | 'upToDate'
    | 'downloading'
    | 'downloaded'
    | 'failed'
    | 'unavailable'

  export let currentVersion: string
  export let updateIndicatorState: UpdateIndicatorStatus
  export let updateStatusMessage: string
  export let availableUpdate: UpdateMetadata | null
  export let lastUpdateCheckLabel: string
  export let lastUpdateCheckRelativeLabel: string
  export let updateBusy: boolean
  export let updateChannel: 'stable' | 'prerelease'
  export let updateChannelLabel: string
  export let checkForUpdatesOnLaunch: boolean
  export let onCheckForUpdates: () => void
  export let onDownloadUpdate: () => void
  export let onInstallUpdate: () => void
  export let onSetUpdateChannel: (value: 'stable' | 'prerelease') => void
  export let onSetCheckForUpdatesOnLaunch: (value: boolean) => void

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
      return 'Release status'
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
      return 'warning'
    }

    return 'neutral'
  }

  function shouldShowUpdateDetail(status: UpdateIndicatorStatus) {
    return status !== 'idle' && status !== 'upToDate'
  }

  function toggleUpdateChannel() {
    onSetUpdateChannel(updateChannel === 'stable' ? 'prerelease' : 'stable')
  }
</script>

<section class="settings-page">
  <div class="settings-page-heading">
    <h2>Updates</h2>
    <p>Current release status and automatic checks.</p>
  </div>

  <section class="settings-group">
    <div class="settings-group-header settings-group-header-with-actions">
      <div class="settings-group-header-copy">
        <h3>Overview</h3>
        <p>Version, channel, and the latest update check.</p>
      </div>

      <div class="settings-group-header-actions">
        <button class="secondary" disabled={updateBusy} type="button" on:click={onCheckForUpdates}>
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
    </div>

    <dl class="settings-update-summary">
      <div class="settings-summary-item">
        <dt>Current version</dt>
        <dd>
          <strong>{currentVersion || 'Unavailable'}</strong>
          <small>{getUpdateStatusTitle(updateIndicatorState)}</small>
        </dd>
      </div>

      <div class="settings-summary-item">
        <dt>Channel</dt>
        <dd>
          <strong>{updateChannelLabel}</strong>
          <small>
            {updateChannel === 'prerelease'
              ? 'Includes beta and prerelease builds.'
              : 'Only stable releases are offered.'}
          </small>
        </dd>
      </div>

      <div class="settings-summary-item">
        <dt>Auto-check</dt>
        <dd>
          <strong>{checkForUpdatesOnLaunch ? 'Enabled' : 'Disabled'}</strong>
          <small>{checkForUpdatesOnLaunch ? 'Checks after launch.' : 'Manual checks only.'}</small>
        </dd>
      </div>

      <div class="settings-summary-item">
        <dt>Last checked</dt>
        <dd>
          <strong>{lastUpdateCheckLabel}</strong>
          <small>{lastUpdateCheckRelativeLabel}</small>
        </dd>
      </div>

      <div class="settings-summary-item">
        <dt>{availableUpdate ? 'Latest version' : 'Release notes'}</dt>
        <dd>
          <strong>{availableUpdate ? availableUpdate.version : 'Not published'}</strong>
          <small>
            {availableUpdate
              ? 'Ready to download from this screen.'
              : 'Release notes link will appear with a published update.'}
          </small>
        </dd>
      </div>
    </dl>

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
      <h3>Preferences</h3>
      <p>Choose the update feed and startup behavior.</p>
    </div>

    <div class="settings-group-grid">
      <div class="settings-row settings-row-span-full">
        <div class="settings-row-copy">
          <strong>Update feed</strong>
          <p>Stable is safest. Prerelease also includes beta builds when they are published.</p>
        </div>

        <div class="settings-control settings-control-wide">
          <div
            class="segmented-control toolbar-segmented-control settings-segmented-control"
            role="group"
            aria-label="Update channel"
          >
            <button
              aria-pressed={updateChannel === 'stable'}
              class:active={updateChannel === 'stable'}
              type="button"
              on:click={toggleUpdateChannel}
            >
              Stable
            </button>

            <button
              aria-pressed={updateChannel === 'prerelease'}
              class:active={updateChannel === 'prerelease'}
              type="button"
              on:click={toggleUpdateChannel}
            >
              Prerelease
            </button>
          </div>
        </div>
      </div>

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
                onSetCheckForUpdatesOnLaunch((event.currentTarget as HTMLInputElement).checked)}
            />
            <span aria-hidden="true" class="settings-switch-ui"></span>
          </span>
        </span>
      </label>
    </div>
  </section>
</section>
