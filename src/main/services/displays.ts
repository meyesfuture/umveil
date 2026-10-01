/**
 * displays.ts — DisplayService.
 * Enumerates displays, picks Stage display, handles connect/disconnect.
 * Implements FR-03/04/06, INV-1.
 */
import { screen, BrowserWindow } from 'electron'
import { store } from '../store'
import { logger } from './logger'
import { Win32Bridge } from './win32'
import type { DisplayInfo } from '@shared/state'
import type { PreflightResult } from '@shared/ipc'

// Forward declaration — injected to avoid circular dep
type StageControllerLike = {
  handleDisplayRemoved: () => void
  handleDisplayAdded: () => void
}

let cockpitWin: BrowserWindow | null = null
let stageController: StageControllerLike | null = null
let preferredDisplayId: number | null = null

function toDisplayInfo(d: Electron.Display, cockpitId: number, stageId: number | null): DisplayInfo {
  return {
    id: d.id,
    label: d.label ?? `Display ${d.id}`,
    bounds: d.bounds,
    scaleFactor: d.scaleFactor,
    internal: d.internal ?? false,
    isCockpit: d.id === cockpitId,
    isStage: d.id === stageId,
  }
}

function refreshDisplays(): void {
  const cockpitDisplay = cockpitWin
    ? screen.getDisplayMatching(cockpitWin.getBounds())
    : screen.getPrimaryDisplay()
  const stageId = store.getState().stage.displayId
  const infos = screen.getAllDisplays().map((d) =>
    toDisplayInfo(d, cockpitDisplay.id, stageId)
  )
  store.dispatch({ type: 'DISPLAYS_UPDATE', displays: infos })
}

/** Pick the best Stage display: non-internal, not the Cockpit's. */
export function pickStageDisplay(): Electron.Display | null {
  const cockpitDisplay = cockpitWin
    ? screen.getDisplayMatching(cockpitWin.getBounds())
    : screen.getPrimaryDisplay()
  const all = screen.getAllDisplays()
  if (all.length < 2) return null

  // Try preferred
  if (preferredDisplayId !== null) {
    const found = all.find((d) => d.id === preferredDisplayId && d.id !== cockpitDisplay.id)
    if (found) return found
  }
  // Prefer external
  const external = all.find((d) => d.id !== cockpitDisplay.id && !d.internal)
  if (external) return external
  // Any non-cockpit
  return all.find((d) => d.id !== cockpitDisplay.id) ?? null
}

export const DisplayService = {
  init(win: BrowserWindow, stage: StageControllerLike): void {
    cockpitWin = win
    stageController = stage
    refreshDisplays()

    screen.on('display-added', () => {
      logger.info('display.added')
      refreshDisplays()
      stageController?.handleDisplayAdded()
    })
    screen.on('display-removed', () => {
      logger.info('display.removed')
      refreshDisplays()
      stageController?.handleDisplayRemoved()
    })
    screen.on('display-metrics-changed', () => {
      logger.info('display.metrics-changed')
      refreshDisplays()
    })
  },

  getDisplays(): DisplayInfo[] {
    return store.getState().displays
  },

  pickStageDisplay,

  setPreferredDisplay(id: number): void {
    preferredDisplayId = id
  },

  getCockpitDisplay(): Electron.Display {
    return cockpitWin
      ? screen.getDisplayMatching(cockpitWin.getBounds())
      : screen.getPrimaryDisplay()
  },

  /** Confine cursor to Cockpit's display (INV-8 applies). */
  applyCursorClip(): void {
    const state = store.getState()
    if (!state.cursor.lockEnabled || !cockpitWin) {
      Win32Bridge.clipCursor(null)
      store.dispatch({ type: 'CURSOR_LOCK_ACTIVE', active: false })
      return
    }
    const d = this.getCockpitDisplay()
    const sf = d.scaleFactor
    Win32Bridge.clipCursor({
      left: Math.round(d.bounds.x * sf),
      top: Math.round(d.bounds.y * sf),
      right: Math.round((d.bounds.x + d.bounds.width) * sf),
      bottom: Math.round((d.bounds.y + d.bounds.height) * sf),
    })
    store.dispatch({ type: 'CURSOR_LOCK_ACTIVE', active: true })
    logger.debug('display.cursor-clipped')
  },

  releaseCursorClip(): void {
    Win32Bridge.clipCursor(null)
    store.dispatch({ type: 'CURSOR_LOCK_ACTIVE', active: false })
    logger.debug('display.cursor-released')
  },

  setCursorLock(enabled: boolean): void {
    store.dispatch({ type: 'CURSOR_LOCK_ENABLED', enabled })
    if (enabled && store.getState().stage.session === 'live') {
      this.applyCursorClip()
    } else {
      this.releaseCursorClip()
    }
  },

  async runPreflight(): Promise<PreflightResult> {
    const checks: PreflightResult['checks'] = []
    const all = screen.getAllDisplays()
    const cockpit = this.getCockpitDisplay()

    // Check 1: At least 2 displays in extend mode
    if (all.length < 2) {
      checks.push({
        id: 'displays',
        result: 'block',
        message: 'Windows is mirroring or has one display. Press Win+P and choose Extend.',
      })
    } else {
      checks.push({ id: 'displays', result: 'pass', message: 'Two or more displays detected.' })
    }

    // Check 2: Stage display is not Cockpit's
    const stageDisplay = this.pickStageDisplay()
    if (!stageDisplay) {
      checks.push({
        id: 'stageDisplay',
        result: 'block',
        message: 'No valid Stage display found (all displays are the Cockpit display).',
      })
    } else if (stageDisplay.id === cockpit.id) {
      checks.push({
        id: 'stageDisplay',
        result: 'block',
        message: 'Stage display cannot be the same as the Cockpit display.',
      })
    } else {
      checks.push({ id: 'stageDisplay', result: 'pass', message: `Stage will use: ${stageDisplay.label ?? stageDisplay.id}` })
    }

    // Check 3: Audio output
    const audio = store.getState().audio
    if (audio.status === 'unset') {
      checks.push({ id: 'audio', result: 'warn', message: 'No audio output selected. Audio will be muted.' })
    } else if (audio.status === 'missing') {
      checks.push({ id: 'audio', result: 'warn', message: 'Selected audio output not found. Audio will be muted.' })
    } else {
      checks.push({ id: 'audio', result: 'pass', message: `Audio output: ${audio.selected?.label}` })
    }

    // Check 4: Asset availability
    const items = store.getState().scene.items
    const missingItems = items.filter((i) => i.status === 'missing' || i.status === 'error')
    if (missingItems.length > 0) {
      checks.push({
        id: 'assets',
        result: 'warn',
        message: `${missingItems.length} item(s) have errors and will show an error tile.`,
        itemIds: missingItems.map((i) => i.id),
      })
    } else {
      checks.push({ id: 'assets', result: 'pass', message: 'All assets OK.' })
    }

    const canStart = !checks.some((c) => c.result === 'block')
    return { checks, canStart }
  },
}
