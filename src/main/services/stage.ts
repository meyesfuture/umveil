/**
 * stage.ts — StageController.
 * Creates, manages, and communicates with the Stage window.
 * Implements FR-03, FR-05, FR-06, FR-12, FR-13, FR-14, FR-15, FR-17.
 * INV-1: Stage never on Cockpit's display.
 */
import { BrowserWindow, app, screen } from 'electron'
import * as path from 'path'
import { store } from '../store'
import { logger } from './logger'
import { PowerService } from './power'
import { DisplayService, pickStageDisplay } from './displays'
import { MediaProtocol } from './media-protocol'
import { AudioService } from './audio'
import { hwndFromSourceId, Win32Bridge } from './win32'
import { IPC } from '@shared/ipc'
import { ok, err } from '@shared/ipc'
import type { Result, StageLoadCommand } from '@shared/ipc'
import type { StageContent, SceneSettings } from '@shared/state'
import { v4 as uuidv4 } from 'uuid'

const KILL_LOCKOUT_MS = 750
const KILL_WATCHDOG_MS = 150
const EMBED_TIMEOUT_MS = 8000
const DEFAULT_TIMEOUT_MS = 3000

let pushTokenCounter = 0
function nextToken(): number {
  return ++pushTokenCounter
}

export class StageController {
  private cockpitWin: BrowserWindow
  private stageWin: BrowserWindow | null = null
  private overlayWin: BrowserWindow | null = null
  private failsafeWin: BrowserWindow | null = null
  private killWatchdog: ReturnType<typeof setTimeout> | null = null
  private killTime: number | null = null
  private mirrorPollTimer: ReturnType<typeof setInterval> | null = null

  constructor(cockpitWin: BrowserWindow) {
    this.cockpitWin = cockpitWin
  }

  // --------------------------------------------------------------------------
  // Stage window lifecycle
  // --------------------------------------------------------------------------

  private createStageWindow(display: Electron.Display): BrowserWindow {
    const preloadPath = path.join(__dirname, '../../preload/stage.js')
    const win = new BrowserWindow({
      x: display.bounds.x,
      y: display.bounds.y,
      width: display.bounds.width,
      height: display.bounds.height,
      frame: false,
      focusable: false,
      skipTaskbar: true,
      alwaysOnTop: true,
      backgroundColor: '#000000',
      show: false,
      webPreferences: {
        preload: preloadPath,
        contextIsolation: true,
        sandbox: true,
        nodeIntegration: false,
        devTools: !app.isPackaged,
        webviewTag: true, // needed for <webview> embeds
      },
    })

    win.setAlwaysOnTop(true, 'screen-saver')
    win.setVisibleOnAllWorkspaces(true)

    // Block unsafe webview navigations (FR-10, IPC_CONTRACT rule 5)
    win.webContents.on('will-navigate', (_event, url) => {
      try {
        const { protocol } = new URL(url)
        if (protocol !== 'https:' && protocol !== 'http:') {
          _event.preventDefault()
          logger.warn('stage.webview.blocked-navigation', { url: url.slice(0, 80) })
        }
      } catch {
        _event.preventDefault()
      }
    })

    // Register stage IPC listeners
    this.registerStageIpc(win)


    if (process.env.ELECTRON_RENDERER_URL) {
      win.loadURL(`${process.env.ELECTRON_RENDERER_URL}/stage/index.html`)
    } else {
      win.loadFile(path.join(__dirname, '../../renderer/stage/index.html'))
    }

    win.on('closed', () => {
      if (this.stageWin === win) this.stageWin = null
    })

    logger.info('stage.window.created', { displayId: display.id })
    return win
  }

  private registerStageIpc(win: BrowserWindow): void {
    const { ipcMain } = require('electron') as typeof import('electron')

    win.webContents.on('ipc-message', (_event, channel, ...args) => {
      switch (channel) {
        case IPC.STAGE_READY:
          this.onStageReady()
          break
        case IPC.STAGE_STATUS:
          this.onStageStatus(args[0])
          break
        case IPC.STAGE_CURTAIN_ACK:
          this.onCurtainAck(args[0])
          break
        case IPC.STAGE_MEDIA_EVENT:
          this.onMediaEvent(args[0])
          break
        case IPC.STAGE_AUDIO_DEVICES:
          this.onAudioDevices(args[0])
          break
        case IPC.STAGE_CAPTURE_ENDED:
          this.onCaptureEnded(args[0])
          break
        case IPC.PLAYBACK_TICK:
          this.onPlaybackTick(args[0])
          break
      }
    })
  }

  private sendToStage(channel: string, payload?: unknown): void {
    if (this.stageWin && !this.stageWin.isDestroyed()) {
      this.stageWin.webContents.send(channel, payload)
    }
  }

  private sendToCockpit(channel: string, payload?: unknown): void {
    if (!this.cockpitWin.isDestroyed()) {
      this.cockpitWin.webContents.send(channel, payload)
    }
  }

  // --------------------------------------------------------------------------
  // Stage event handlers
  // --------------------------------------------------------------------------

  private onStageReady(): void {
    logger.info('stage.ready')
    this.sendSyncToStage()
    // Send preview source ID
    if (this.stageWin) {
      const sourceId = this.stageWin.getMediaSourceId()
      this.sendToCockpit(IPC.PREVIEW_SOURCE, { mediaSourceId: sourceId })
    }
  }

  private onStageStatus(payload: unknown): void {
    const p = payload as { token: number; phase: 'committed' | 'failed'; code?: string }
    const state = store.getState()

    if (p.phase === 'committed') {
      // Check token is still relevant
      if (state.stage.pending?.token !== p.token) return
      // Content was committed — transition pending to live
      const pendingItemId = state.stage.pending.itemId
      const items = state.scene.items
      const item = pendingItemId ? items.find((i) => i.id === pendingItemId) : null

      let content: StageContent = { kind: 'slate' }
      if (item) {
        if (item.kind === 'image') content = { kind: 'image', itemId: item.id }
        else if (item.kind === 'video') {
          const autoplay = !state.stage.killed && !state.stage.frozen
          content = { kind: 'video', itemId: item.id, playing: autoplay, loop: item.playback.loop, volume: item.playback.volume }
        }
        else if (item.kind === 'embed') content = { kind: 'embed', itemId: item.id, muted: false }
        else if (item.kind === 'app') content = { kind: 'app', itemId: item.id, sourceId: '', title: item.name }
      }

      store.dispatch({ type: 'STAGE_PUSH_COMMITTED', content })
      logger.info('stage.push.committed', { token: p.token })
    } else {
      store.dispatch({ type: 'STAGE_PUSH_FAILED', token: p.token })
      store.dispatch({
        type: 'ALERT_ADD',
        alert: {
          level: 'warn',
          code: 'MEDIA_DECODE_ERROR',
          message: `Content failed to load: ${p.code ?? 'unknown'}`,
          sticky: false,
        },
      })
      logger.warn('stage.push.failed', { token: p.token, code: p.code })
    }
  }

  private onCurtainAck(payload: unknown): void {
    const p = payload as { on: boolean; presentedAtMs: number }
    if (this.killWatchdog) {
      clearTimeout(this.killWatchdog)
      this.killWatchdog = null
    }
    if (this.killTime !== null) {
      const latencyMs = p.presentedAtMs - this.killTime
      logger.info('stage.kill.latency', { latencyMs })
      this.killTime = null
    }
  }

  private onMediaEvent(payload: unknown): void {
    const p = payload as { type: 'ended' | 'error' }
    if (p.type === 'ended') {
      logger.info('stage.media.ended')
      // Video holds last frame — no auto-advance
    } else {
      logger.warn('stage.media.error')
      store.dispatch({
        type: 'ALERT_ADD',
        alert: { level: 'warn', code: 'MEDIA_DECODE_ERROR', message: 'Media playback error.', sticky: false },
      })
    }
  }

  private onAudioDevices(payload: unknown): void {
    const p = payload as { outputs: { deviceId: string; label: string }[]; sinkApplied: boolean }
    AudioService.updateOutputs(p.outputs)
  }

  private onCaptureEnded(payload: unknown): void {
    const p = payload as { reason: string }
    logger.warn('stage.capture.ended', { reason: p.reason })
    this.clearMirrorPoll()
    // Return to slate
    const token = nextToken()
    store.dispatch({ type: 'STAGE_PUSH_PENDING', token, itemId: null })
    this.sendToStage(IPC.STAGE_LOAD, {
      token,
      content: { kind: 'slate' },
      source: { kind: 'slate' },
      transition: store.getState().scene.settings.transition,
      autoplay: false,
      timeoutMs: DEFAULT_TIMEOUT_MS,
    } satisfies StageLoadCommand)
    store.dispatch({
      type: 'ALERT_ADD',
      alert: { level: 'warn', code: 'APP_WINDOW_LOST', message: 'Mirrored app window was closed. Stage returned to slate.', sticky: false },
    })
    this.hideOverlay()
  }

  private onPlaybackTick(payload: unknown): void {
    const p = payload as { positionMs: number; durationMs: number }
    this.sendToCockpit(IPC.PLAYBACK_TICK, payload)

    // Update video item durationMs if not yet probed (was 0)
    if (p.durationMs > 0) {
      const state = store.getState()
      if (state.stage.content.kind === 'video') {
        const itemId = state.stage.content.itemId
        const item = state.scene.items.find((i) => i.id === itemId)
        if (item && item.kind === 'video' && item.durationMs === 0) {
          store.dispatch({ type: 'SCENE_ITEM_UPDATE_DURATION', itemId, durationMs: p.durationMs })
        }
      }
    }
  }

  // --------------------------------------------------------------------------
  // Sync
  // --------------------------------------------------------------------------

  private sendSyncToStage(): void {
    const state = store.getState()
    this.sendToStage(IPC.STAGE_SYNC, {
      content: state.stage.content,
      killed: state.stage.killed,
      frozen: state.stage.frozen,
      slate: state.scene.settings.slate,
      transition: state.scene.settings.transition,
      sink: state.audio.selected,
      managedMuted: state.audio.managedMuted,
      assetBaseUrl: 'umveil-media://asset/',
    })
  }

  // --------------------------------------------------------------------------
  // Public API
  // --------------------------------------------------------------------------

  async startScene(): Promise<Result<import('@shared/ipc').PreflightResult>> {
    const state = store.getState()
    if (state.stage.session !== 'stopped') {
      return err('E_NOT_ALLOWED', 'Stage already running')
    }

    const preflight = await DisplayService.runPreflight()
    if (!preflight.canStart) {
      return err('E_PREFLIGHT_BLOCKED', preflight.checks.find((c) => c.result === 'block')?.message ?? 'Preflight failed')
    }

    const display = pickStageDisplay()
    if (!display) return err('E_NOT_ALLOWED', 'No valid Stage display')

    this.stageWin = this.createStageWindow(display)
    this.stageWin.showInactive()
    // Verify bounds
    this.stageWin.setBounds(display.bounds)

    store.dispatch({ type: 'STAGE_STARTED', displayId: display.id })
    PowerService.start()

    if (state.scene.settings.cursorLock) {
      DisplayService.applyCursorClip()
    }

    MediaProtocol.install()
    logger.info('stage.scene.started', { displayId: display.id })
    return ok(preflight)
  }

  stopScene(): void {
    this.clearMirrorPoll()
    this.hideOverlay()
    DisplayService.releaseCursorClip()
    PowerService.stop()

    if (this.stageWin && !this.stageWin.isDestroyed()) {
      this.stageWin.hide()
      this.stageWin.destroy()
      this.stageWin = null
    }
    this.sendToCockpit(IPC.PREVIEW_SOURCE, { mediaSourceId: null })
    store.dispatch({ type: 'STAGE_STOPPED' })
    logger.info('stage.scene.stopped')
  }

  async resumeScene(): Promise<Result<void>> {
    const state = store.getState()
    if (state.stage.session !== 'detached') return err('E_NOT_ALLOWED', 'Not detached')
    const display = pickStageDisplay()
    if (!display) return err('E_NOT_ALLOWED', 'No valid Stage display')

    if (!this.stageWin || this.stageWin.isDestroyed()) {
      this.stageWin = this.createStageWindow(display)
    } else {
      this.stageWin.setBounds(display.bounds)
    }
    this.stageWin.showInactive()
    store.dispatch({ type: 'STAGE_RESUMED', displayId: display.id })

    if (state.scene.settings.cursorLock) DisplayService.applyCursorClip()
    logger.info('stage.scene.resumed', { displayId: display.id })
    return ok(undefined)
  }

  restoreLastLive(): Result<void> {
    const state = store.getState()
    const last = state.stage.lastLive
    if (!last || last.kind === 'slate') return err('E_NOT_ALLOWED', 'No last live content')
    if (last.kind === 'image' || last.kind === 'video' || last.kind === 'embed') {
      this.pushItem(last.kind === 'app' ? last.itemId ?? '' : (last as { itemId: string }).itemId)
    }
    return ok(undefined)
  }

  async setDisplay(displayId: number): Promise<Result<void>> {
    const displays = screen.getAllDisplays()
    const display = displays.find((d) => d.id === displayId)
    if (!display) return err('E_NOT_FOUND', `Display ${displayId} not found`)
    const cockpit = DisplayService.getCockpitDisplay()
    if (display.id === cockpit.id) return err('E_NOT_ALLOWED', 'Cannot use Cockpit display as Stage')
    DisplayService.setPreferredDisplay(displayId)
    // If live, restart on new display
    if (store.getState().stage.session === 'live') {
      this.stopScene()
      await this.startScene()
    }
    return ok(undefined)
  }

  pushItem(itemId: string): Result<{ token: number }> {
    const state = store.getState()
    if (state.stage.session !== 'live') return err('E_NOT_ALLOWED', 'Stage not live')
    const item = state.scene.items.find((i) => i.id === itemId)
    if (!item) return err('E_NOT_FOUND', `Item ${itemId} not found`)

    const token = nextToken()
    store.dispatch({ type: 'STAGE_PUSH_PENDING', token, itemId })

    let source: StageLoadCommand['source']
    let timeoutMs = DEFAULT_TIMEOUT_MS
    let playback: StageLoadCommand['playback'] | undefined

    if (item.kind === 'image') {
      source = { kind: 'image', url: MediaProtocol.getAssetUrl(item.assetId) }
    } else if (item.kind === 'video') {
      source = { kind: 'video', url: MediaProtocol.getAssetUrl(item.assetId) }
      playback = item.playback
    } else if (item.kind === 'embed') {
      source = { kind: 'embed', url: item.normalizedUrl }
      timeoutMs = EMBED_TIMEOUT_MS
    } else if (item.kind === 'app') {
      // Find running window matching app target
      source = { kind: 'app', sourceId: '' } // sourceId filled by real implementation
    } else {
      return err('E_NOT_FOUND', 'Unknown item kind')
    }

    const cmd: StageLoadCommand = {
      token,
      content: item.kind === 'image' ? { kind: 'image', itemId } :
               item.kind === 'video' ? { kind: 'video', itemId, playing: !state.stage.killed, loop: item.playback.loop, volume: item.playback.volume } :
               item.kind === 'embed' ? { kind: 'embed', itemId, muted: false } :
               { kind: 'app', itemId, sourceId: '', title: item.name },
      source,
      transition: state.scene.settings.transition,
      autoplay: !state.stage.killed && !state.stage.frozen,
      playback,
      timeoutMs,
    }

    this.sendToStage(IPC.STAGE_LOAD, cmd)
    logger.info('stage.push', { itemId, token, kind: item.kind })
    return ok({ token })
  }

  kill(): void {
    if (this.killWatchdog) {
      clearTimeout(this.killWatchdog)
      this.killWatchdog = null
    }
    const now = Date.now()
    this.killTime = now
    store.dispatch({ type: 'STAGE_KILLED' })

    // Mute at WebContents level immediately (INV-3, INV-4)
    if (this.stageWin && !this.stageWin.isDestroyed()) {
      this.stageWin.webContents.setAudioMuted(true)
    }

    // Soft path: send curtain command
    const state = store.getState()
    this.sendToStage(IPC.STAGE_CURTAIN, { on: true, slate: state.scene.settings.slate })

    // Start watchdog for hard path (M-6: failsafe window)
    this.killWatchdog = setTimeout(() => {
      logger.warn('stage.kill.watchdog_fired')
      // Hard path: show failsafe blackout window
      this.showFailsafe()
    }, KILL_WATCHDOG_MS)

    logger.info('stage.kill')
  }

  restore(): Result<void> {
    const state = store.getState()
    if (!state.stage.killed) return err('E_NOT_ALLOWED', 'Not killed')
    if (this.killTime !== null && Date.now() - this.killTime < KILL_LOCKOUT_MS) {
      return err('E_LOCKOUT', 'Kill lockout active')
    }

    store.dispatch({ type: 'STAGE_RESTORED' })
    if (this.stageWin && !this.stageWin.isDestroyed()) {
      this.stageWin.webContents.setAudioMuted(false)
    }
    const s = store.getState()
    this.sendToStage(IPC.STAGE_CURTAIN, { on: false, slate: s.scene.settings.slate })
    this.sendToStage(IPC.STAGE_AUDIO, { sink: s.audio.selected, managedMuted: s.audio.managedMuted })
    this.hideFailsafe()
    logger.info('stage.restore')
    return ok(undefined)
  }

  setFreeze(on: boolean): Result<void> {
    const state = store.getState()
    if (state.stage.session !== 'live') return err('E_NOT_ALLOWED', 'Stage not live')
    store.dispatch({ type: 'STAGE_FREEZE', frozen: on })
    if (on) {
      // Capture current frame
      if (this.stageWin && !this.stageWin.isDestroyed()) {
        this.stageWin.webContents.capturePage().then((img) => {
          const jpegDataUrl = `data:image/jpeg;base64,${img.toJPEG(90).toString('base64')}`
          this.sendToStage(IPC.STAGE_FREEZE_IMAGE, { jpegDataUrl })
          logger.info('stage.freeze.captured')
        }).catch((e) => logger.warn('stage.freeze.capture-failed', { error: String(e) }))
      }
    } else {
      this.sendToStage(IPC.STAGE_FREEZE_IMAGE, { jpegDataUrl: null })
    }
    logger.info('stage.freeze', { on })
    return ok(undefined)
  }

  sendPlaybackCommand(cmd: { action: string; value?: number | boolean }): Result<void> {
    const state = store.getState()
    if (state.stage.content.kind !== 'video') return err('E_NOT_ALLOWED', 'Not a video')
    this.sendToStage(IPC.STAGE_PLAYBACK_CMD, cmd)
    return ok(undefined)
  }

  sendEmbedCommand(cmd: { action: string }): Result<void> {
    const state = store.getState()
    if (state.stage.content.kind !== 'embed') return err('E_NOT_ALLOWED', 'Not an embed')
    this.sendToStage(IPC.STAGE_EMBED_CMD, cmd)
    return ok(undefined)
  }

  sendTestTone(): Result<void> {
    this.sendToStage(IPC.STAGE_TONE)
    return ok(undefined)
  }

  async projectApp(sourceId: string): Promise<Result<{ token: number }>> {
    const state = store.getState()
    if (state.stage.session !== 'live') return err('E_NOT_ALLOWED', 'Stage not live')

    const token = nextToken()
    store.dispatch({ type: 'STAGE_PUSH_PENDING', token, itemId: null })

    this.sendToStage(IPC.STAGE_LOAD, {
      token,
      content: { kind: 'app', itemId: null, sourceId, title: '' },
      source: { kind: 'app', sourceId },
      transition: state.scene.settings.transition,
      autoplay: !state.stage.killed,
      timeoutMs: DEFAULT_TIMEOUT_MS,
    } satisfies StageLoadCommand)

    // Bring mirrored window to front
    const hwnd = hwndFromSourceId(sourceId)
    if (hwnd !== null) Win32Bridge.bringToFront(hwnd)

    // Show Return overlay
    this.showOverlay()
    this.startMirrorPoll(sourceId)
    logger.info('stage.projectApp', { sourceId })
    return ok({ token })
  }

  handleReturn(): Result<void> {
    this.cockpitWin.focus()
    this.hideOverlay()
    this.clearMirrorPoll()

    const state = store.getState()
    if (state.scene.settings.returnTarget === 'slate') {
      const token = nextToken()
      store.dispatch({ type: 'STAGE_PUSH_PENDING', token, itemId: null })
      this.sendToStage(IPC.STAGE_LOAD, {
        token,
        content: { kind: 'slate' },
        source: { kind: 'slate' },
        transition: state.scene.settings.transition,
        autoplay: false,
        timeoutMs: DEFAULT_TIMEOUT_MS,
      } satisfies StageLoadCommand)
    }
    logger.info('stage.return')
    return ok(undefined)
  }

  // --------------------------------------------------------------------------
  // Display events
  // --------------------------------------------------------------------------

  handleDisplayRemoved(): void {
    const state = store.getState()
    if (state.stage.session === 'stopped') return

    // Check if Stage display is still present
    const all = screen.getAllDisplays()
    const stageDisplayGone = state.stage.displayId !== null &&
      !all.find((d) => d.id === state.stage.displayId)

    if (stageDisplayGone || all.length < 2) {
      if (this.stageWin && !this.stageWin.isDestroyed()) {
        this.stageWin.destroy() // Destroy to prevent running on wrong screen
        this.stageWin = null
      }
      DisplayService.releaseCursorClip()
      store.dispatch({ type: 'STAGE_DETACHED' })
      store.dispatch({
        type: 'ALERT_ADD',
        alert: { level: 'error', code: 'DISPLAY_LOST', message: 'Stage display disconnected. Playback paused.', sticky: true },
      })
      this.sendToCockpit(IPC.PREVIEW_SOURCE, { mediaSourceId: null })
      logger.warn('stage.display.removed')
    }
  }

  handleDisplayAdded(): void {
    const state = store.getState()
    if (state.stage.session === 'detached') {
      const display = pickStageDisplay()
      if (display) {
        store.dispatch({ type: 'ALERT_REMOVE_BY_CODE', code: 'DISPLAY_LOST' })
        store.dispatch({
          type: 'ALERT_ADD',
          alert: { level: 'info', code: 'DISPLAY_AVAILABLE', message: 'Stage display reconnected. Click Resume to continue.', sticky: true },
        })
        logger.info('stage.display.added')
      }
    }
  }

  // --------------------------------------------------------------------------
  // Overlay
  // --------------------------------------------------------------------------

  private showOverlay(): void {
    if (this.overlayWin && !this.overlayWin.isDestroyed()) {
      this.overlayWin.show()
      return
    }
    const cockpitDisplay = DisplayService.getCockpitDisplay()
    const preloadPath = path.join(__dirname, '../../preload/overlay.js')
    this.overlayWin = new BrowserWindow({
      x: cockpitDisplay.bounds.x + cockpitDisplay.bounds.width - 180,
      y: cockpitDisplay.bounds.y + 20,
      width: 160,
      height: 48,
      frame: false,
      alwaysOnTop: true,
      focusable: true,
      skipTaskbar: true,
      transparent: true,
      webPreferences: {
        preload: preloadPath,
        contextIsolation: true,
        sandbox: true,
        nodeIntegration: false,
      },
    })
    // Exclude from screen capture (INV-2)
    this.overlayWin.setContentProtection(true)
    store.dispatch({ type: 'OVERLAY_VISIBLE', visible: true })

    if (process.env.ELECTRON_RENDERER_URL) {
      this.overlayWin.loadURL(`${process.env.ELECTRON_RENDERER_URL}/overlay/index.html`)
    } else {
      this.overlayWin.loadFile(path.join(__dirname, '../../renderer/overlay/index.html'))
    }
    logger.info('overlay.shown')
  }

  private hideOverlay(): void {
    if (this.overlayWin && !this.overlayWin.isDestroyed()) {
      this.overlayWin.hide()
    }
    store.dispatch({ type: 'OVERLAY_VISIBLE', visible: false })
  }

  // --------------------------------------------------------------------------
  // Failsafe (M-6 hard kill path)
  // --------------------------------------------------------------------------

  private showFailsafe(): void {
    if (this.failsafeWin && !this.failsafeWin.isDestroyed()) {
      this.failsafeWin.show()
      return
    }
    const display = pickStageDisplay() ?? screen.getPrimaryDisplay()
    this.failsafeWin = new BrowserWindow({
      x: display.bounds.x,
      y: display.bounds.y,
      width: display.bounds.width,
      height: display.bounds.height,
      frame: false,
      focusable: false,
      skipTaskbar: true,
      alwaysOnTop: true,
      backgroundColor: '#000000',
      webPreferences: { nodeIntegration: false },
    })
    this.failsafeWin.setAlwaysOnTop(true, 'screen-saver')
    this.failsafeWin.loadURL('about:blank')
    this.failsafeWin.showInactive()
    logger.warn('stage.failsafe.shown')
  }

  private hideFailsafe(): void {
    if (this.failsafeWin && !this.failsafeWin.isDestroyed()) {
      this.failsafeWin.hide()
    }
  }

  // --------------------------------------------------------------------------
  // Mirror poll
  // --------------------------------------------------------------------------

  private startMirrorPoll(sourceId: string): void {
    this.clearMirrorPoll()
    this.mirrorPollTimer = setInterval(() => {
      const hwnd = hwndFromSourceId(sourceId)
      if (hwnd === null) return
      const info = Win32Bridge.getWindowInfo(hwnd)
      if (!info || info.minimized) {
        // Fallback: window closed or minimized
        this.onCaptureEnded({ reason: 'error' })
      }
    }, 500)
  }

  private clearMirrorPoll(): void {
    if (this.mirrorPollTimer) {
      clearInterval(this.mirrorPollTimer)
      this.mirrorPollTimer = null
    }
  }
}
