import { app, BrowserWindow, ipcMain, Menu, screen, shell } from 'electron'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { LaunchContext } from '../src/lib/types'
import {
  getLaunchContextFromArgs,
  registerWindowLaunchContext,
} from './services/launch-context'
import {
  registerIpcHandlers,
} from './services/backend'

// Use Electron's default GPU configuration — no forced GPU switches. The
// reference app T3 Code (github.com/pingdotgg/t3code) renders diffs with the
// same @pierre/diffs engine and NO GPU command-line switches, and scrolls
// smoothly on the same hardware. The force-GPU switches tried earlier
// (ignore-gpu-blocklist / use-angle / disable-gpu-sandbox) did not enable the
// GPU and can themselves destabilise GPU-process init, so they are removed.

interface WindowState {
  x: number
  y: number
  width: number
  height: number
  maximized?: boolean
}

const DEFAULT_WINDOW_STATE: WindowState = {
  width: 1480,
  height: 920,
  x: Number.NaN,
  y: Number.NaN,
}

const startupUserDataDir = process.env.DIFFLY_USER_DATA_DIR?.trim()

if (startupUserDataDir) {
  app.setPath('userData', startupUserDataDir)
}

let mainWindow: Electron.BrowserWindow | null = null
const windows = new Set<Electron.BrowserWindow>()
const pendingLaunchContexts: LaunchContext[] = []
const closeApproved = new Set<number>()
const mainStartupStartedAt = Date.now()

function markMainStartup(name: string, detail?: Record<string, unknown>) {
  if (process.env.DIFFLY_STARTUP_PROFILE !== '1') {
    return
  }

  console.log(`[diffly-startup-main] ${JSON.stringify({
    detail,
    elapsedMs: Date.now() - mainStartupStartedAt,
    name,
    wallMs: Date.now(),
  })}`)
}

markMainStartup('main-module-loaded')

function showWindow(window: Electron.BrowserWindow) {
  if (window.isDestroyed() || window.isVisible()) {
    return
  }

  window.show()
}

function createWindow(launchContext: LaunchContext | null = null) {
  markMainStartup('create-window-start')
  const savedState = nextWindowState(loadWindowState())
  markMainStartup('window-state-loaded')
  const icon = getWindowIconPath()
  markMainStartup('window-icon-resolved', { hasIcon: Boolean(icon) })
  Menu.setApplicationMenu(null)

  const window = new BrowserWindow({
    title: 'Diffly',
    width: savedState.width,
    height: savedState.height,
    x: Number.isFinite(savedState.x) ? savedState.x : undefined,
    y: Number.isFinite(savedState.y) ? savedState.y : undefined,
    minWidth: 1120,
    minHeight: 680,
    show: false,
    backgroundColor: '#171717',
    resizable: true,
    autoHideMenuBar: true,
    // Custom title bar on Windows; keep the native frame elsewhere for now.
    frame: process.platform !== 'win32',
    icon,
    webPreferences: {
      preload: join(__dirname, '../preload/preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  })
  markMainStartup('browser-window-created')
  windows.add(window)
  mainWindow = window
  registerWindowLaunchContext(window, launchContext)
  window.setMenuBarVisibility(false)

  if (savedState.maximized) {
    window.maximize()
  }

  window.webContents.once('dom-ready', () => {
    markMainStartup('window-dom-ready')
    showWindow(window)
  })
  window.once('ready-to-show', () => {
    markMainStartup('window-ready-to-show')
    showWindow(window)
  })

  const sendMaximizedChange = () => {
    if (!window.isDestroyed()) {
      window.webContents.send('diffly:windowMaximizedChange', window.isMaximized())
    }
  }
  window.on('maximize', sendMaximizedChange)
  window.on('unmaximize', sendMaximizedChange)

  window.on('close', (event) => {
    saveWindowState(window)
    if (!closeApproved.has(window.id) && !window.webContents.isDestroyed()) {
      event.preventDefault()
      window.webContents.send('diffly:workspace:closeRequested')
    }
  })

  window.on('closed', () => {
    windows.delete(window)
    if (mainWindow === window) {
      const remainingWindows = Array.from(windows)
      mainWindow = remainingWindows[remainingWindows.length - 1] ?? null
    }
  })

  window.webContents.setWindowOpenHandler((details: Electron.HandlerDetails) => {
    void shell.openExternal(details.url)
    return { action: 'deny' }
  })
  installStartupProfileExit(window)

  if (process.env.ELECTRON_RENDERER_URL) {
    const rendererUrl = new URL(process.env.ELECTRON_RENDERER_URL)
    appendStartupProfileQuery(rendererUrl.searchParams)
    markMainStartup('window-load-url-start')
    void window.loadURL(rendererUrl.toString())
  } else {
    const rendererPath = join(__dirname, '../renderer/index.html')
    markMainStartup('window-load-file-start')
    void window.loadFile(rendererPath, { query: startupProfileQuery() })
  }
}

function installStartupProfileExit(window: Electron.BrowserWindow) {
  if (process.env.DIFFLY_STARTUP_PROFILE_EXIT !== '1') {
    return
  }

  window.webContents.on('console-message', (_event, _level, message) => {
    if (!message.includes('[diffly-startup-renderer]')) {
      return
    }

    setTimeout(() => {
      markMainStartup('startup-profile-exit')
      app.quit()
    }, 0)
  })
}

function startupProfileQuery() {
  const query: Record<string, string> = {}
  if (process.env.DIFFLY_STARTUP_PROFILE === '1') query.difflyStartupProfile = '1'
  const left = process.env.DIFFLY_E2E_LEFT?.trim()
  const right = process.env.DIFFLY_E2E_RIGHT?.trim()
  if (left && right) {
    query.difflyE2ELeft = left
    query.difflyE2ERight = right
  }
  return Object.keys(query).length > 0 ? query : undefined
}

function appendStartupProfileQuery(params: URLSearchParams) {
  if (process.env.DIFFLY_STARTUP_PROFILE === '1') {
    params.set('difflyStartupProfile', '1')
  }
}

function windowFromIpcEvent(event: Electron.IpcMainInvokeEvent) {
  const window = BrowserWindow.fromWebContents(event.sender)
  return window && !window.isDestroyed() ? window : null
}

function registerWindowControlIpcHandlers() {
  ipcMain.handle('diffly:windowMinimize', (event) => {
    windowFromIpcEvent(event)?.minimize()
  })
  ipcMain.handle('diffly:windowToggleMaximize', (event) => {
    const window = windowFromIpcEvent(event)
    if (!window) {
      return
    }
    if (window.isMaximized()) {
      window.unmaximize()
    } else {
      window.maximize()
    }
  })
  ipcMain.handle('diffly:windowClose', (event) => {
    windowFromIpcEvent(event)?.close()
  })
  ipcMain.handle('diffly:windowIsMaximized', (event) =>
    windowFromIpcEvent(event)?.isMaximized() ?? false,
  )
  ipcMain.handle('diffly:workspace:closeDecision', (event, payload: unknown) => {
    const window = windowFromIpcEvent(event)
    if (!window || typeof payload !== 'object' || payload === null || !('allow' in payload)) return
    if (payload.allow === true) {
      closeApproved.add(window.id)
      window.close()
    }
  })
}

function openLaunchWindow(launchContext: LaunchContext) {
  if (app.isReady()) {
    routeLaunchContext(launchContext)
    return
  }

  pendingLaunchContexts.push(launchContext)
}

function routeLaunchContext(launchContext: LaunchContext) {
  const window = BrowserWindow.getFocusedWindow() ?? mainWindow
  if (!window || window.isDestroyed()) {
    createWindow(launchContext)
    return
  }

  if (window.isMinimized()) {
    window.restore()
  }
  showWindow(window)
  window.focus()
  sendLaunchContext(window, launchContext)
}

function sendLaunchContext(window: Electron.BrowserWindow, launchContext: LaunchContext) {
  registerWindowLaunchContext(window, launchContext)

  const send = () => {
    if (!window.isDestroyed()) {
      window.webContents.send('diffly:launchContext', launchContext)
    }
  }

  if (window.webContents.isLoading()) {
    window.webContents.once('did-finish-load', send)
  } else {
    send()
  }
}

function getWindowIconPath() {
  const iconPath = app.isPackaged
    ? join(process.resourcesPath, 'icon.ico')
    : join(process.cwd(), 'build', 'icons', 'icon.ico')

  return existsSync(iconPath) ? iconPath : undefined
}

function windowStatePath() {
  return join(app.getPath('userData'), 'window-state.json')
}

function loadWindowState(): WindowState {
  const filePath = windowStatePath()
  if (!existsSync(filePath)) {
    return centerDefaultWindowState()
  }

  try {
    const state = JSON.parse(readFileSync(filePath, 'utf8')) as Partial<WindowState>
    if (
      typeof state.width !== 'number' ||
      typeof state.height !== 'number' ||
      typeof state.x !== 'number' ||
      typeof state.y !== 'number'
    ) {
      return centerDefaultWindowState()
    }

    const nextState: WindowState = {
      width: clampWindowSize(state.width, DEFAULT_WINDOW_STATE.width),
      height: clampWindowSize(state.height, DEFAULT_WINDOW_STATE.height),
      x: Math.round(state.x),
      y: Math.round(state.y),
      maximized: state.maximized === true,
    }

    return windowStateIsVisible(nextState) ? nextState : centerDefaultWindowState()
  } catch {
    return centerDefaultWindowState()
  }
}

function nextWindowState(state: WindowState): WindowState {
  const openWindowCount = BrowserWindow.getAllWindows().length
  if (openWindowCount === 0 || state.maximized) {
    return state
  }

  const offset = Math.min(openWindowCount, 6) * 32
  const nextState = {
    ...state,
    x: state.x + offset,
    y: state.y + offset,
  }

  return windowStateIsVisible(nextState) ? nextState : centerDefaultWindowState()
}

function saveWindowState(window: Electron.BrowserWindow) {
  const bounds = window.isMaximized() ? window.getNormalBounds() : window.getBounds()
  const state: WindowState = {
    x: bounds.x,
    y: bounds.y,
    width: bounds.width,
    height: bounds.height,
    maximized: window.isMaximized(),
  }

  try {
    writeFileSync(windowStatePath(), JSON.stringify(state), 'utf8')
  } catch {
    return
  }
}

function centerDefaultWindowState(): WindowState {
  const display = screen.getPrimaryDisplay().workArea
  const width = Math.min(DEFAULT_WINDOW_STATE.width, display.width)
  const height = Math.min(DEFAULT_WINDOW_STATE.height, display.height)

  return {
    ...DEFAULT_WINDOW_STATE,
    width,
    height,
    x: Math.round(display.x + (display.width - width) / 2),
    y: Math.round(display.y + (display.height - height) / 2),
  }
}

function clampWindowSize(value: number, fallback: number) {
  return Math.max(600, Math.min(Math.round(value), 10_000)) || fallback
}

function windowStateIsVisible(state: WindowState) {
  const windowRect = {
    x: state.x,
    y: state.y,
    width: state.width,
    height: state.height,
  }

  return screen.getAllDisplays().some((display) => {
    const workArea = display.workArea
    return rectanglesOverlap(windowRect, workArea)
  })
}

function rectanglesOverlap(
  left: { x: number; y: number; width: number; height: number },
  right: { x: number; y: number; width: number; height: number },
) {
  return (
    left.x < right.x + right.width &&
    left.x + left.width > right.x &&
    left.y < right.y + right.height &&
    left.y + left.height > right.y
  )
}

const initialLaunchContext = getLaunchContextFromArgs(process.argv.slice(1))
const remoteDebuggingPort = process.env.DIFFLY_REMOTE_DEBUGGING_PORT

if (app && remoteDebuggingPort && /^\d+$/.test(remoteDebuggingPort)) {
  app.commandLine.appendSwitch('remote-debugging-port', remoteDebuggingPort)
}

if (!app.requestSingleInstanceLock()) {
  app.quit()
} else {
  app.on('second-instance', (_event, commandLine) => {
    const nextLaunchContext = getLaunchContextFromArgs(commandLine.slice(1))

    if (nextLaunchContext) {
      openLaunchWindow(nextLaunchContext)
      return
    }

    const window = BrowserWindow.getFocusedWindow() ?? mainWindow
    if (window) {
      if (window.isMinimized()) {
        window.restore()
      }
      window.focus()
    } else {
      createWindow()
    }
  })

  app.whenReady().then(() => {
    markMainStartup('app-when-ready')
    // Diagnostic: record whether compositing/rasterization is hardware
    // accelerated. Logged to the console (visible via `npm run preview`) AND
    // written to <userData>/gpu-status.json so the GPU status can be inspected
    // from the packaged/installed build too (where there is no console).
    try {
      const gpuStatus = app.getGPUFeatureStatus()
      console.log('[diffly] GPU feature status:', gpuStatus)
      writeFileSync(
        join(app.getPath('userData'), 'gpu-status.json'),
        JSON.stringify(gpuStatus, null, 2),
        'utf8',
      )
    } catch {
      // Best-effort diagnostics only.
    }
    markMainStartup('gpu-diagnostic-finished')

    registerIpcHandlers()
    markMainStartup('ipc-handlers-registered')
    registerWindowControlIpcHandlers()
    markMainStartup('window-control-ipc-registered')
    createWindow(initialLaunchContext)
    for (const launchContext of pendingLaunchContexts.splice(0)) {
      routeLaunchContext(launchContext)
    }

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        createWindow()
      }
    })
  })

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
      app.quit()
    }
  })
}
