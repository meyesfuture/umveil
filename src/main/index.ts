/**
 * index.ts — Main process entry point.
 * App lifecycle, single-instance lock, window creation.
 */
import { app, BrowserWindow, screen, shell } from 'electron'
import * as path from 'path'
import { logger } from './services/logger'
import { store } from './store'
import { PowerService } from './services/power'
import { HotkeyService } from './services/hotkeys'
import { registerIpcHandlers, setCockpitWindow, setOverlayWindow } from './ipc-router'
import { DisplayService } from './services/displays'
import { StageController } from './services/stage'
import { SceneService } from './services/scene'
import { AudioService } from './services/audio'
import { CaptureService } from './services/capture'
import { MediaProtocol } from './services/media-protocol'
import { IPC } from '@shared/ipc'

// --------------------------------------------------------------------------
// Single-instance lock
// --------------------------------------------------------------------------
const gotLock = app.requestSingleInstanceLock()
if (!gotLock) {
  app.quit()
  process.exit(0)
}

let cockpitWin: BrowserWindow | null = null

app.on('second-instance', (_event, argv) => {
  // Forward a .umveil path from the second instance
  const filePath = argv.find((a) => a.endsWith('.umveil'))
  if (filePath && cockpitWin) {
    if (cockpitWin.isMinimized()) cockpitWin.restore()
    cockpitWin.focus()
    SceneService.openScene(filePath).catch(() => undefined)
  } else if (cockpitWin) {
    if (cockpitWin.isMinimized()) cockpitWin.restore()
    cockpitWin.focus()
  }
})

// Register custom media protocol (must be before app is ready)
MediaProtocol.register()

// --------------------------------------------------------------------------
// App ready
// --------------------------------------------------------------------------
app.whenReady().then(async () => {
  logger.info('app.ready', { version: app.getVersion() })

  // Install custom media protocol handler
  MediaProtocol.install()

  // Init power monitor
  PowerService.init()

  // Release any residual cursor clip from a previous crashed session (INV-8 / R-05)
  {
    const { Win32Bridge } = require('./services/win32') as typeof import('./services/win32')
    Win32Bridge.clipCursor(null)
    logger.info('app.cursor.self-released')
  }

  // Create Cockpit window
  cockpitWin = createCockpitWindow()
  setCockpitWindow(cockpitWin)

  // Init services
  const display = DisplayService
  const stage = new StageController(cockpitWin)
  const scene = SceneService
  const audio = AudioService
  const capture = CaptureService

  // Wire display service to cockpit window
  display.init(cockpitWin, stage)

  // Register IPC
  registerIpcHandlers({ display, stage, scene, audio, capture })

  // Subscribe store → broadcast to Cockpit
  store.subscribe((state) => {
    if (cockpitWin && !cockpitWin.isDestroyed()) {
      cockpitWin.webContents.send(IPC.STATE_UPDATE, state)
    }
  })

  // Register hotkeys
  const hotkeyStatuses = HotkeyService.registerAll({
    killRestore: () => {
      const s = store.getState()
      if (s.stage.killed) stage.restore()
      else stage.kill()
    },
    freeze: () => {
      const s = store.getState()
      stage.setFreeze(!s.stage.frozen)
    },
    ret: () => {
      stage.handleReturn()
    },
  })
  store.dispatch({ type: 'HOTKEYS_STATUS', ...hotkeyStatuses })

  // Open .umveil if launched with file argument
  const filePath = process.argv.slice(1).find((a) => a.endsWith('.umveil'))
  if (filePath) {
    await SceneService.openScene(filePath)
  }

  // Send initial state
  cockpitWin.webContents.on('did-finish-load', () => {
    cockpitWin!.webContents.send(IPC.STATE_UPDATE, store.getState())
  })

  logger.info('app.started')
})

app.on('before-quit', () => {
  HotkeyService.unregisterAll()
  // Release cursor confinement on exit (INV-8)
  const { Win32Bridge } = require('./services/win32') as typeof import('./services/win32')
  Win32Bridge.clipCursor(null)
  PowerService.stop()
  logger.info('app.quit')
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

// --------------------------------------------------------------------------
// Window factories
// --------------------------------------------------------------------------

function createCockpitWindow(): BrowserWindow {
  const preloadPath = path.join(__dirname, '../preload/cockpit.js')

  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    title: 'umveil',
    backgroundColor: '#0f0f0f',
    webPreferences: {
      preload: preloadPath,
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      devTools: !app.isPackaged,
    },
  })

  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
  win.webContents.on('will-navigate', (e, url) => {
    if (!url.startsWith('http://localhost') && !url.startsWith('file://')) {
      e.preventDefault()
      shell.openExternal(url)
    }
  })

  if (process.env.ELECTRON_RENDERER_URL) {
    win.loadURL(`${process.env.ELECTRON_RENDERER_URL}/cockpit/index.html`)
  } else {
    win.loadFile(path.join(__dirname, '../renderer/cockpit/index.html'))
  }

  logger.info('cockpit.window.created')
  return win
}
