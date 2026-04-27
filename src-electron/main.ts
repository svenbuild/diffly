import { app, BrowserWindow, Menu, screen, shell } from 'electron'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { registerIpcHandlers } from './services/backend'

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

function showMainWindow() {
  if (!mainWindow || mainWindow.isVisible()) {
    return
  }

  mainWindow.show()
}

function createWindow() {
  const savedState = loadWindowState()
  Menu.setApplicationMenu(null)

  mainWindow = new BrowserWindow({
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
    webPreferences: {
      preload: join(__dirname, '../preload/preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  })
  mainWindow.setMenuBarVisibility(false)

  if (savedState.maximized) {
    mainWindow.maximize()
  }

  mainWindow.webContents.once('dom-ready', showMainWindow)
  mainWindow.once('ready-to-show', showMainWindow)

  mainWindow.on('close', () => {
    if (mainWindow) {
      saveWindowState(mainWindow)
    }
  })

  mainWindow.webContents.setWindowOpenHandler((details: Electron.HandlerDetails) => {
    void shell.openExternal(details.url)
    return { action: 'deny' }
  })

  if (process.env.ELECTRON_RENDERER_URL) {
    void mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    const rendererPath = join(__dirname, '../renderer/index.html')
    void mainWindow.loadFile(rendererPath)
  }
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

if (!app.requestSingleInstanceLock()) {
  app.quit()
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) {
        mainWindow.restore()
      }
      mainWindow.focus()
    }
  })

  app.whenReady().then(() => {
    registerIpcHandlers()
    createWindow()

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
