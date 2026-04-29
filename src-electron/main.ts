import { app, BrowserWindow, Menu, screen, shell } from 'electron'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { LaunchContext } from '../src/lib/types'
import {
  getLaunchContextFromArgs,
  registerIpcHandlers,
  registerWindowLaunchContext,
} from './services/backend'

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

let mainWindow: Electron.BrowserWindow | null = null
const windows = new Set<Electron.BrowserWindow>()
const pendingLaunchContexts: LaunchContext[] = []

function showWindow(window: Electron.BrowserWindow) {
  if (window.isDestroyed() || window.isVisible()) {
    return
  }

  window.show()
}

function createWindow(launchContext: LaunchContext | null = null) {
  const savedState = nextWindowState(loadWindowState())
  const icon = getWindowIconPath()
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
    icon,
    webPreferences: {
      preload: join(__dirname, '../preload/preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  })
  windows.add(window)
  mainWindow = window
  registerWindowLaunchContext(window, launchContext)
  window.setMenuBarVisibility(false)

  if (savedState.maximized) {
    window.maximize()
  }

  window.webContents.once('dom-ready', () => showWindow(window))
  window.once('ready-to-show', () => showWindow(window))

  window.on('close', () => {
    saveWindowState(window)
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

  if (process.env.ELECTRON_RENDERER_URL) {
    void window.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    const rendererPath = join(__dirname, '../renderer/index.html')
    void window.loadFile(rendererPath)
  }
}

function openLaunchWindow(launchContext: LaunchContext) {
  if (app.isReady()) {
    createWindow(launchContext)
    return
  }

  pendingLaunchContexts.push(launchContext)
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
const shouldUseSingleInstanceLock = initialLaunchContext === null

if (shouldUseSingleInstanceLock && !app.requestSingleInstanceLock()) {
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
    registerIpcHandlers()
    createWindow(initialLaunchContext)
    for (const launchContext of pendingLaunchContexts.splice(0)) {
      createWindow(launchContext)
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
