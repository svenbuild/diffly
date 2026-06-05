import type { BrowserWindow } from 'electron'
import type { LaunchContext } from '../../src/lib/types'

let launchContext: LaunchContext | null | undefined
const windowLaunchContexts = new Map<number, LaunchContext | null>()

export function registerWindowLaunchContext(
  window: BrowserWindow,
  context: LaunchContext | null,
) {
  const webContentsId = window.webContents.id
  windowLaunchContexts.set(webContentsId, context)
  window.webContents.once('destroyed', () => {
    windowLaunchContexts.delete(webContentsId)
  })
}

export function loadLaunchContext(webContentsId: number): LaunchContext | null {
  if (windowLaunchContexts.has(webContentsId)) {
    return windowLaunchContexts.get(webContentsId) ?? null
  }

  if (launchContext === undefined) {
    launchContext = parseLaunchContext(process.argv.slice(1))
  }
  return launchContext
}

export function getLaunchContextFromArgs(args: string[]) {
  return parseLaunchContext(args)
}

function parseLaunchContext(args: string[]): LaunchContext | null {
  const index = args.indexOf('--open-here')
  if (index < 0) {
    return null
  }

  const openHerePath = args[index + 1]?.trim()
  if (!openHerePath) {
    return null
  }

  return { openHerePath }
}
