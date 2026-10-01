/**
 * ipc-router.ts — Registers all IPC handlers.
 * Every channel is declared here. Payloads validated with zod.
 * Sender identity verified per IPC_CONTRACT.md rule 4.
 */
import { ipcMain, BrowserWindow, dialog } from 'electron'
import { z } from 'zod'
import { IPC, CockpitPayloads, OverlayPayloads, err, ok } from '@shared/ipc'
import type { Result } from '@shared/ipc'
import { store } from './store'
import { logger } from './services/logger'

// Services injected at startup
import type { DisplayService as IDisplayService } from './services/displays'
import type { StageController as IStageController } from './services/stage'
import type { SceneService as ISceneService } from './services/scene'
import type { AudioService as IAudioService } from './services/audio'
import type { CaptureService as ICaptureService } from './services/capture'

export interface Services {
  display: IDisplayService
  stage: IStageController
  scene: ISceneService
  audio: IAudioService
  capture: ICaptureService
}

let cockpitWindow: BrowserWindow | null = null
let overlayWindow: BrowserWindow | null = null
let services: Services | null = null

export function setCockpitWindow(win: BrowserWindow): void {
  cockpitWindow = win
}
export function setOverlayWindow(win: BrowserWindow): void {
  overlayWindow = win
}

function isCockpit(event: Electron.IpcMainInvokeEvent): boolean {
  return cockpitWindow !== null && event.sender === cockpitWindow.webContents
}

function isOverlay(event: Electron.IpcMainInvokeEvent): boolean {
  return overlayWindow !== null && event.sender === overlayWindow.webContents
}

/**
 * Validate a payload against a zod schema. Returns Result with E_VALIDATION on failure.
 */
function validate<T>(schema: z.ZodType<T>, payload: unknown): Result<T> {
  const result = schema.safeParse(payload)
  if (!result.success) {
    return err('E_VALIDATION', result.error.message)
  }
  return ok(result.data)
}

export function registerIpcHandlers(svc: Services): void {
  services = svc

  // ---- Scene ----
  ipcMain.handle(IPC.SCENE_NEW, async (event) => {
    if (!isCockpit(event)) return err('E_NOT_ALLOWED', 'Not cockpit')
    svc.scene.newScene()
    return ok(undefined)
  })

  ipcMain.handle(IPC.SCENE_OPEN, async (event, payload) => {
    if (!isCockpit(event)) return err('E_NOT_ALLOWED', 'Not cockpit')
    const v = validate(CockpitPayloads[IPC.SCENE_OPEN], payload)
    if (!v.ok) return v
    const p = v.value.path
    if (!p) {
      const { filePaths } = await dialog.showOpenDialog(cockpitWindow!, {
        title: 'Open Scene',
        filters: [{ name: 'umveil scene', extensions: ['umveil'] }],
        properties: ['openFile'],
      })
      if (!filePaths[0]) return ok(undefined)
      return svc.scene.openScene(filePaths[0])
    }
    return svc.scene.openScene(p)
  })

  ipcMain.handle(IPC.SCENE_SAVE, async (event) => {
    if (!isCockpit(event)) return err('E_NOT_ALLOWED', 'Not cockpit')
    const state = store.getState()
    if (!state.scene.path) {
      const { filePath } = await dialog.showSaveDialog(cockpitWindow!, {
        title: 'Save Scene',
        defaultPath: `${state.scene.name}.umveil`,
        filters: [{ name: 'umveil scene', extensions: ['umveil'] }],
      })
      if (!filePath) return ok({ path: '' })
      return svc.scene.saveScene(filePath)
    }
    return svc.scene.saveScene(state.scene.path)
  })

  ipcMain.handle(IPC.SCENE_SAVE_AS, async (event, payload) => {
    if (!isCockpit(event)) return err('E_NOT_ALLOWED', 'Not cockpit')
    const v = validate(CockpitPayloads[IPC.SCENE_SAVE_AS], payload)
    if (!v.ok) return v
    const p = v.value.path
    if (!p) {
      const { filePath } = await dialog.showSaveDialog(cockpitWindow!, {
        title: 'Save Scene As',
        filters: [{ name: 'umveil scene', extensions: ['umveil'] }],
      })
      if (!filePath) return ok({ path: '' })
      return svc.scene.saveScene(filePath)
    }
    return svc.scene.saveScene(p)
  })

  ipcMain.handle(IPC.SCENE_UPDATE_SETTINGS, async (event, payload) => {
    if (!isCockpit(event)) return err('E_NOT_ALLOWED', 'Not cockpit')
    const v = validate(CockpitPayloads[IPC.SCENE_UPDATE_SETTINGS], payload)
    if (!v.ok) return v
    store.dispatch({ type: 'SCENE_SETTINGS_UPDATE', patch: v.value.patch as never })
    return ok(undefined)
  })

  // ---- Items ----
  ipcMain.handle(IPC.ITEMS_IMPORT, async (event, payload) => {
    if (!isCockpit(event)) return err('E_NOT_ALLOWED', 'Not cockpit')
    const v = validate(CockpitPayloads[IPC.ITEMS_IMPORT], payload)
    if (!v.ok) return v
    return svc.scene.importItems(v.value.paths)
  })

  ipcMain.handle(IPC.ITEMS_ADD_EMBED, async (event, payload) => {
    if (!isCockpit(event)) return err('E_NOT_ALLOWED', 'Not cockpit')
    const v = validate(CockpitPayloads[IPC.ITEMS_ADD_EMBED], payload)
    if (!v.ok) return v
    return svc.scene.addEmbedItem(v.value.url, v.value.name)
  })

  ipcMain.handle(IPC.ITEMS_PIN_APP, async (event, payload) => {
    if (!isCockpit(event)) return err('E_NOT_ALLOWED', 'Not cockpit')
    const v = validate(CockpitPayloads[IPC.ITEMS_PIN_APP], payload)
    if (!v.ok) return v
    return svc.capture.pinAppTarget(v.value.sourceId)
  })

  ipcMain.handle(IPC.ITEMS_UPDATE, async (event, payload) => {
    if (!isCockpit(event)) return err('E_NOT_ALLOWED', 'Not cockpit')
    const v = validate(CockpitPayloads[IPC.ITEMS_UPDATE], payload)
    if (!v.ok) return v
    store.dispatch({ type: 'SCENE_ITEM_UPDATE', itemId: v.value.itemId, patch: v.value.patch as never })
    return ok(undefined)
  })

  ipcMain.handle(IPC.ITEMS_REMOVE, async (event, payload) => {
    if (!isCockpit(event)) return err('E_NOT_ALLOWED', 'Not cockpit')
    const v = validate(CockpitPayloads[IPC.ITEMS_REMOVE], payload)
    if (!v.ok) return v
    store.dispatch({ type: 'SCENE_ITEM_REMOVE', itemId: v.value.itemId })
    return ok(undefined)
  })

  // ---- Stage ----
  ipcMain.handle(IPC.PREFLIGHT_RUN, async (event) => {
    if (!isCockpit(event)) return err('E_NOT_ALLOWED', 'Not cockpit')
    return ok(await svc.display.runPreflight())
  })

  ipcMain.handle(IPC.STAGE_START, async (event) => {
    if (!isCockpit(event)) return err('E_NOT_ALLOWED', 'Not cockpit')
    return svc.stage.startScene()
  })

  ipcMain.handle(IPC.STAGE_STOP, async (event) => {
    if (!isCockpit(event)) return err('E_NOT_ALLOWED', 'Not cockpit')
    svc.stage.stopScene()
    return ok(undefined)
  })

  ipcMain.handle(IPC.STAGE_RESUME, async (event) => {
    if (!isCockpit(event)) return err('E_NOT_ALLOWED', 'Not cockpit')
    return svc.stage.resumeScene()
  })

  ipcMain.handle(IPC.STAGE_RESTORE_LAST_LIVE, async (event) => {
    if (!isCockpit(event)) return err('E_NOT_ALLOWED', 'Not cockpit')
    return svc.stage.restoreLastLive()
  })

  ipcMain.handle(IPC.STAGE_SET_DISPLAY, async (event, payload) => {
    if (!isCockpit(event)) return err('E_NOT_ALLOWED', 'Not cockpit')
    const v = validate(CockpitPayloads[IPC.STAGE_SET_DISPLAY], payload)
    if (!v.ok) return v
    return svc.stage.setDisplay(v.value.displayId)
  })

  ipcMain.handle(IPC.STAGE_PUSH, async (event, payload) => {
    if (!isCockpit(event)) return err('E_NOT_ALLOWED', 'Not cockpit')
    const v = validate(CockpitPayloads[IPC.STAGE_PUSH], payload)
    if (!v.ok) return v
    return svc.stage.pushItem(v.value.itemId)
  })

  ipcMain.handle(IPC.STAGE_KILL, async (event) => {
    if (!isCockpit(event)) return err('E_NOT_ALLOWED', 'Not cockpit')
    svc.stage.kill()
    return ok(undefined)
  })

  ipcMain.handle(IPC.STAGE_RESTORE, async (event) => {
    if (!isCockpit(event)) return err('E_NOT_ALLOWED', 'Not cockpit')
    return svc.stage.restore()
  })

  ipcMain.handle(IPC.STAGE_FREEZE, async (event, payload) => {
    if (!isCockpit(event)) return err('E_NOT_ALLOWED', 'Not cockpit')
    const v = validate(CockpitPayloads[IPC.STAGE_FREEZE], payload)
    if (!v.ok) return v
    return svc.stage.setFreeze(v.value.on)
  })

  ipcMain.handle(IPC.STAGE_PLAYBACK, async (event, payload) => {
    if (!isCockpit(event)) return err('E_NOT_ALLOWED', 'Not cockpit')
    const v = validate(CockpitPayloads[IPC.STAGE_PLAYBACK], payload)
    if (!v.ok) return v
    return svc.stage.sendPlaybackCommand(v.value)
  })

  ipcMain.handle(IPC.STAGE_EMBED, async (event, payload) => {
    if (!isCockpit(event)) return err('E_NOT_ALLOWED', 'Not cockpit')
    const v = validate(CockpitPayloads[IPC.STAGE_EMBED], payload)
    if (!v.ok) return v
    return svc.stage.sendEmbedCommand(v.value)
  })

  // ---- Audio ----
  ipcMain.handle(IPC.AUDIO_REFRESH, async (event) => {
    if (!isCockpit(event)) return err('E_NOT_ALLOWED', 'Not cockpit')
    return ok(await svc.audio.refreshOutputs())
  })

  ipcMain.handle(IPC.AUDIO_SELECT, async (event, payload) => {
    if (!isCockpit(event)) return err('E_NOT_ALLOWED', 'Not cockpit')
    const v = validate(CockpitPayloads[IPC.AUDIO_SELECT], payload)
    if (!v.ok) return v
    return svc.audio.selectOutput(v.value.deviceId)
  })

  ipcMain.handle(IPC.AUDIO_TEST_TONE, async (event) => {
    if (!isCockpit(event)) return err('E_NOT_ALLOWED', 'Not cockpit')
    return svc.stage.sendTestTone()
  })

  // ---- Apps ----
  ipcMain.handle(IPC.APPS_LIST, async (event) => {
    if (!isCockpit(event)) return err('E_NOT_ALLOWED', 'Not cockpit')
    return ok(await svc.capture.listWindows())
  })

  ipcMain.handle(IPC.APPS_PROJECT, async (event, payload) => {
    if (!isCockpit(event)) return err('E_NOT_ALLOWED', 'Not cockpit')
    const v = validate(CockpitPayloads[IPC.APPS_PROJECT], payload)
    if (!v.ok) return v
    return svc.stage.projectApp(v.value.sourceId)
  })

  // ---- Cursor ----
  ipcMain.handle(IPC.CURSOR_SET_LOCK, async (event, payload) => {
    if (!isCockpit(event)) return err('E_NOT_ALLOWED', 'Not cockpit')
    const v = validate(CockpitPayloads[IPC.CURSOR_SET_LOCK], payload)
    if (!v.ok) return v
    svc.display.setCursorLock(v.value.enabled)
    return ok(undefined)
  })

  // ---- Diagnostics ----
  ipcMain.handle(IPC.DIAGNOSTICS_COPY, async (event) => {
    if (!isCockpit(event)) return err('E_NOT_ALLOWED', 'Not cockpit')
    const { getDiagnostics } = await import('./services/logger')
    void getDiagnostics // will use logger below
    const { logger: l } = await import('./services/logger')
    return ok(l.getDiagnostics())
  })

  // ---- Overlay ----
  ipcMain.handle(IPC.OVERLAY_RETURN, async (event) => {
    if (!isOverlay(event)) return err('E_NOT_ALLOWED', 'Not overlay')
    return svc.stage.handleReturn()
  })

  logger.info('ipc-router.registered')
}

export function unregisterIpcHandlers(): void {
  const channels = [
    IPC.SCENE_NEW, IPC.SCENE_OPEN, IPC.SCENE_SAVE, IPC.SCENE_SAVE_AS, IPC.SCENE_UPDATE_SETTINGS,
    IPC.ITEMS_IMPORT, IPC.ITEMS_ADD_EMBED, IPC.ITEMS_PIN_APP, IPC.ITEMS_UPDATE, IPC.ITEMS_REMOVE,
    IPC.PREFLIGHT_RUN, IPC.STAGE_START, IPC.STAGE_STOP, IPC.STAGE_RESUME, IPC.STAGE_RESTORE_LAST_LIVE,
    IPC.STAGE_SET_DISPLAY, IPC.STAGE_PUSH, IPC.STAGE_KILL, IPC.STAGE_RESTORE, IPC.STAGE_FREEZE,
    IPC.STAGE_PLAYBACK, IPC.STAGE_EMBED, IPC.AUDIO_REFRESH, IPC.AUDIO_SELECT, IPC.AUDIO_TEST_TONE,
    IPC.APPS_LIST, IPC.APPS_PROJECT, IPC.CURSOR_SET_LOCK, IPC.DIAGNOSTICS_COPY, IPC.OVERLAY_RETURN,
  ]
  for (const ch of channels) ipcMain.removeAllListeners(ch)
}
