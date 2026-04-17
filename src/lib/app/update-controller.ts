import type {
  UpdateActionResult,
  UpdateChannel,
  UpdateCheckResult,
  UpdateMetadata,
} from '../types'

export type UpdateStatus =
  | 'idle'
  | 'checking'
  | 'available'
  | 'upToDate'
  | 'downloading'
  | 'downloaded'
  | 'failed'
  | 'unavailable'

export interface UpdateIndicatorState {
  status: UpdateStatus
  currentVersion: string
  metadata: UpdateMetadata | null
  message: string
}

interface UpdateControllerDependencies {
  getAppVersion: () => Promise<string>
  checkForUpdates: (channel: UpdateChannel) => Promise<UpdateCheckResult>
  downloadUpdate: (channel: UpdateChannel) => Promise<UpdateActionResult>
  installUpdate: (channel: UpdateChannel) => Promise<UpdateActionResult>
}

export function formatLastUpdateCheck(value: string) {
  const date = parseUpdateTimestamp(value)

  if (!date) {
    return 'Never'
  }

  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(date)
}

export function formatLastUpdateCheckRelative(value: string) {
  const date = parseUpdateTimestamp(value)

  if (!date) {
    return 'No checks yet'
  }

  const diffMs = date.getTime() - Date.now()
  const absDiffMs = Math.abs(diffMs)
  const relativeTime = new Intl.RelativeTimeFormat(undefined, {
    numeric: 'auto',
  })

  if (absDiffMs < 60_000) {
    return 'Just now'
  }

  if (absDiffMs < 3_600_000) {
    return relativeTime.format(Math.round(diffMs / 60_000), 'minute')
  }

  if (absDiffMs < 86_400_000) {
    return relativeTime.format(Math.round(diffMs / 3_600_000), 'hour')
  }

  return relativeTime.format(Math.round(diffMs / 86_400_000), 'day')
}

export function formatUpdateChannelLabel(channel: UpdateChannel) {
  return channel === 'prerelease' ? 'Stable + prerelease' : 'Stable only'
}

export function getUpdateIndicatorTitle(updateIndicatorState: UpdateIndicatorState) {
  const versionSuffix = updateIndicatorState.currentVersion
    ? `Current version ${updateIndicatorState.currentVersion}.`
    : ''

  if (updateIndicatorState.status === 'available' && updateIndicatorState.metadata) {
    return `Update available: ${updateIndicatorState.metadata.version}. ${versionSuffix}`.trim()
  }

  if (updateIndicatorState.status === 'checking') {
    return 'Checking for updates.'
  }

  if (updateIndicatorState.status === 'downloaded') {
    return 'Update downloaded. Install and restart from Settings.'
  }

  if (
    updateIndicatorState.status === 'failed' ||
    updateIndicatorState.status === 'unavailable'
  ) {
    return updateIndicatorState.message
  }

  if (updateIndicatorState.status === 'upToDate') {
    return `Diffly is up to date. ${versionSuffix}`.trim()
  }

  return `Open update settings. ${versionSuffix}`.trim()
}

export function shouldShowUpdateIndicator(updateIndicatorState: UpdateIndicatorState) {
  return (
    updateIndicatorState.status === 'available' ||
    updateIndicatorState.status === 'downloaded'
  )
}

export function normalizeUnavailableUpdateMessage(message: string | null | undefined) {
  if (!message) {
    return 'Updates are not configured for this build yet.'
  }

  if (message.includes('does not have any endpoints set')) {
    return 'Updates are not configured for this build yet.'
  }

  return message
}

export function normalizeFailedUpdateMessage(message: string | null | undefined) {
  if (!message) {
    return 'Unable to contact the published update feed.'
  }

  if (message.includes('404')) {
    return 'No published updater release is available yet.'
  }

  return message
}

export function createUpdateController(dependencies: UpdateControllerDependencies) {
  return {
    async initializeUpdateVersion(updateIndicatorState: UpdateIndicatorState) {
      try {
        const version = await dependencies.getAppVersion()
        return {
          ...updateIndicatorState,
          currentVersion: version,
        }
      } catch {
        return {
          ...updateIndicatorState,
          status: 'unavailable' as const,
          message: 'Updates are not configured for this build yet.',
        }
      }
    },

    async runUpdateCheck(
      updateIndicatorState: UpdateIndicatorState,
      updateChannel: UpdateChannel,
    ) {
      if (updateIndicatorState.status === 'downloading') {
        return {
          updateIndicatorState,
          lastUpdateCheckAt: null as string | null,
        }
      }

      const checkingState: UpdateIndicatorState = {
        ...updateIndicatorState,
        status: 'checking' as const,
        message: 'Checking for updates...',
      }

      try {
        const result = await dependencies.checkForUpdates(updateChannel)
        const lastUpdateCheckAt = new Date().toISOString()

        if (result.kind === 'available' && result.available && result.metadata) {
          return {
            updateIndicatorState: {
              ...checkingState,
              status: 'available' as const,
              metadata: result.metadata,
              message: result.message ?? `Version ${result.metadata.version} is available.`,
            },
            lastUpdateCheckAt,
          }
        }

        if (result.kind === 'unavailable') {
          return {
            updateIndicatorState: {
              ...checkingState,
              status: 'unavailable' as const,
              metadata: null,
              message: normalizeUnavailableUpdateMessage(result.message),
            },
            lastUpdateCheckAt,
          }
        }

        if (result.kind === 'error') {
          return {
            updateIndicatorState: {
              ...checkingState,
              status: 'failed' as const,
              metadata: null,
              message: normalizeFailedUpdateMessage(result.message),
            },
            lastUpdateCheckAt,
          }
        }

        return {
          updateIndicatorState: {
            ...checkingState,
            status: 'upToDate' as const,
            metadata: null,
            message: result.message ?? 'Diffly is up to date.',
          },
          lastUpdateCheckAt,
        }
      } catch (error) {
        return {
          updateIndicatorState: {
            ...checkingState,
            status: 'failed' as const,
            metadata: null,
            message: normalizeFailedUpdateMessage(
              error instanceof Error ? error.message : 'Unable to check for updates.',
            ),
          },
          lastUpdateCheckAt: null,
        }
      }
    },

    async beginUpdateDownload(
      updateIndicatorState: UpdateIndicatorState,
      updateChannel: UpdateChannel,
    ) {
      if (updateIndicatorState.status !== 'available') {
        return updateIndicatorState
      }

      const downloadingState: UpdateIndicatorState = {
        ...updateIndicatorState,
        status: 'downloading' as const,
        message: 'Downloading update...',
      }

      try {
        const result = await dependencies.downloadUpdate(updateChannel)

        if (result.kind === 'unavailable') {
          return {
            ...downloadingState,
            status: 'unavailable' as const,
            message: normalizeUnavailableUpdateMessage(result.message),
          }
        }

        if (result.kind === 'error') {
          return {
            ...downloadingState,
            status: 'failed' as const,
            message: normalizeFailedUpdateMessage(result.message),
          }
        }

        return {
          ...downloadingState,
          status: 'downloaded' as const,
          message: 'Update downloaded. Install and restart when ready.',
        }
      } catch (error) {
        return {
          ...downloadingState,
          status: 'failed' as const,
          message: normalizeFailedUpdateMessage(
            error instanceof Error ? error.message : 'Unable to download the update.',
          ),
        }
      }
    },

    async applyDownloadedUpdate(
      updateIndicatorState: UpdateIndicatorState,
      updateChannel: UpdateChannel,
    ) {
      if (updateIndicatorState.status !== 'downloaded') {
        return updateIndicatorState
      }

      try {
        const result = await dependencies.installUpdate(updateChannel)

        if (result.kind === 'unavailable') {
          return {
            ...updateIndicatorState,
            status: 'unavailable' as const,
            message: normalizeUnavailableUpdateMessage(result.message),
          }
        }

        if (result.kind === 'error') {
          return {
            ...updateIndicatorState,
            status: 'failed' as const,
            message: normalizeFailedUpdateMessage(result.message),
          }
        }

        return updateIndicatorState
      } catch (error) {
        return {
          ...updateIndicatorState,
          status: 'failed' as const,
          message: normalizeFailedUpdateMessage(
            error instanceof Error ? error.message : 'Unable to install the update.',
          ),
        }
      }
    },
  }
}

function parseUpdateTimestamp(value: string) {
  if (!value) {
    return null
  }

  const numericValue = Number(value)
  const date =
    Number.isFinite(numericValue) && value.trim() !== ''
      ? new Date(numericValue * 1000)
      : new Date(value)

  if (Number.isNaN(date.getTime())) {
    return null
  }

  return date
}
