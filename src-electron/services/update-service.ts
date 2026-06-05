import { app } from 'electron'
import type {
  UpdateActionResult,
  UpdateChannel,
  UpdateCheckResult,
} from '../../src/lib/types'

let autoUpdaterInstance: Awaited<ReturnType<typeof loadAutoUpdater>> | null = null

export async function checkForUpdates(channel: UpdateChannel): Promise<UpdateCheckResult> {
  if (!app.isPackaged) {
    return unavailableUpdate('Updates are not available in development builds.')
  }

  try {
    const autoUpdater = await getAutoUpdater()
    configureAutoUpdater(autoUpdater, channel)
    const result = await autoUpdater.checkForUpdates()
    const info = result?.updateInfo
    if (!info) {
      return unavailableUpdate('No update information was returned.')
    }

    const available = info.version !== app.getVersion()
    return {
      kind: available ? 'available' : 'upToDate',
      available,
      metadata: {
        version: info.version,
        currentVersion: app.getVersion(),
        body: typeof info.releaseNotes === 'string' ? info.releaseNotes : null,
        date: info.releaseDate,
      },
      message: null,
    }
  } catch (error) {
    return {
      kind: 'error',
      available: false,
      metadata: null,
      message: errorMessage(error),
    }
  }
}

export async function downloadUpdate(channel: UpdateChannel): Promise<UpdateActionResult> {
  if (!app.isPackaged) {
    return unavailableAction('Updates are not available in development builds.')
  }

  try {
    const autoUpdater = await getAutoUpdater()
    configureAutoUpdater(autoUpdater, channel)
    await autoUpdater.downloadUpdate()
    return { kind: 'downloaded', message: null }
  } catch (error) {
    return { kind: 'error', message: errorMessage(error) }
  }
}

export async function installUpdate(_channel: UpdateChannel): Promise<UpdateActionResult> {
  if (!app.isPackaged) {
    return unavailableAction('Updates are not available in development builds.')
  }

  try {
    const autoUpdater = await getAutoUpdater()
    autoUpdater.quitAndInstall(false, true)
    return { kind: 'installed', message: null }
  } catch (error) {
    return { kind: 'error', message: errorMessage(error) }
  }
}

async function getAutoUpdater() {
  if (!autoUpdaterInstance) {
    autoUpdaterInstance = await loadAutoUpdater()
    autoUpdaterInstance.autoDownload = false
    autoUpdaterInstance.autoInstallOnAppQuit = false
  }

  return autoUpdaterInstance
}

async function loadAutoUpdater() {
  const updaterModule = await import('electron-updater')
  return updaterModule.default?.autoUpdater ?? updaterModule.autoUpdater
}

function configureAutoUpdater(
  autoUpdater: Awaited<ReturnType<typeof loadAutoUpdater>>,
  channel: UpdateChannel,
) {
  autoUpdater.allowPrerelease = channel === 'prerelease'
}

function unavailableUpdate(message: string): UpdateCheckResult {
  return { kind: 'unavailable', available: false, metadata: null, message }
}

function unavailableAction(message: string): UpdateActionResult {
  return { kind: 'unavailable', message }
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : 'Unknown error'
}
