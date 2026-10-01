/**
 * state.ts — AppState types and reducer.
 * No Electron imports. Pure TypeScript.
 * Source of truth for the state model (see docs/IPC_CONTRACT.md §2).
 */

import { v4 as uuidv4 } from 'uuid'

// ---------------------------------------------------------------------------
// Primitive types
// ---------------------------------------------------------------------------

export type HotkeyStatus = 'registered' | 'failed' | 'disabled'

export interface AudioOutput {
  deviceId: string
  label: string
}

export interface AudioState {
  outputs: AudioOutput[]
  selected: AudioOutput | null
  /** 'unset' = none chosen; 'missing' = chosen device not present */
  status: 'ok' | 'unset' | 'missing'
  /** true when killed or audio status !== 'ok' */
  managedMuted: boolean
}

export interface DisplayInfo {
  /** Electron display id — NOT stable across sessions */
  id: number
  label: string
  bounds: { x: number; y: number; width: number; height: number }
  scaleFactor: number
  internal: boolean
  isCockpit: boolean
  isStage: boolean
}

export interface Alert {
  id: string
  level: 'info' | 'warn' | 'error'
  code: AlertCode
  message: string
  /** epoch ms */
  at: number
  itemId?: string
  /** sticky alerts stay until their condition clears or dismissed */
  sticky: boolean
}

export type AlertCode =
  | 'DISPLAY_LOST'
  | 'DISPLAY_AVAILABLE'
  | 'AUDIO_OUTPUT_MISSING'
  | 'AUDIO_OUTPUT_UNSET'
  | 'EMBED_LOAD_FAILED'
  | 'MEDIA_DECODE_ERROR'
  | 'APP_WINDOW_LOST'
  | 'STAGE_RENDERER_CRASHED'
  | 'SCENE_LOAD_FAILED'
  | 'SCENE_SAVE_FAILED'
  | 'ASSET_MISSING'
  | 'HOTKEY_REGISTRATION_FAILED'
  | 'CURSOR_LOCK_FAILED'

// ---------------------------------------------------------------------------
// Scene / Item types
// ---------------------------------------------------------------------------

export interface Playback {
  autoplay: boolean
  loop: boolean
  /** 0–100 */
  volume: number
}

export type ItemStatus = 'ok' | 'missing' | 'error'

interface ItemBase {
  id: string
  name: string
  status: ItemStatus
}

export type ItemView =
  | (ItemBase & { kind: 'image'; assetId: string; thumbUrl: string })
  | (ItemBase & { kind: 'video'; assetId: string; thumbUrl: string; durationMs: number; playback: Playback })
  | (ItemBase & { kind: 'embed'; url: string; normalizedUrl: string })
  | (ItemBase & { kind: 'app'; match: { processName: string; titleContains?: string }; running: boolean })

export interface SceneSettings {
  slate: { mode: 'black' | 'logo'; logoAssetId: string | null }
  transition: { type: 'cut' | 'crossfade'; durationMs: number }
  audio: { output: AudioOutput | null }
  stage: { displayHint: { width: number; height: number; internal: boolean } | null }
  cursorLock: boolean
  returnTarget: 'slate' | 'keep'
}

export const DEFAULT_SCENE_SETTINGS: SceneSettings = {
  slate: { mode: 'black', logoAssetId: null },
  transition: { type: 'crossfade', durationMs: 400 },
  audio: { output: null },
  stage: { displayHint: null },
  cursorLock: true,
  returnTarget: 'slate',
}

export interface SceneState {
  /** null until first save */
  path: string | null
  name: string
  dirty: boolean
  settings: SceneSettings
  /** Asset bin in display order */
  items: ItemView[]
}

// ---------------------------------------------------------------------------
// Stage types
// ---------------------------------------------------------------------------

export type StageContent =
  | { kind: 'slate' }
  | { kind: 'image'; itemId: string }
  | { kind: 'video'; itemId: string; playing: boolean; loop: boolean; volume: number }
  | { kind: 'embed'; itemId: string; muted: boolean }
  | { kind: 'app'; itemId: string | null; sourceId: string; title: string }

export interface StageState {
  session: 'stopped' | 'live' | 'detached'
  /** Electron display id of the Stage window, null when stopped */
  displayId: number | null
  content: StageContent
  /** non-null while the Stage is prerolling a push (INV-6) */
  pending: { token: number; itemId: string | null } | null
  killed: boolean
  frozen: boolean
  /** offered as "Restore last live" after detach/return */
  lastLive: StageContent | null
}

const INITIAL_STAGE_STATE: StageState = {
  session: 'stopped',
  displayId: null,
  content: { kind: 'slate' },
  pending: null,
  killed: false,
  frozen: false,
  lastLive: null,
}

// ---------------------------------------------------------------------------
// Root AppState
// ---------------------------------------------------------------------------

export interface AppState {
  revision: number
  scene: SceneState
  displays: DisplayInfo[]
  stage: StageState
  audio: AudioState
  cursor: { lockEnabled: boolean; lockActive: boolean }
  hotkeys: { killRestore: HotkeyStatus; freeze: HotkeyStatus; ret: HotkeyStatus }
  overlay: { visible: boolean }
  alerts: Alert[]
}

export const INITIAL_STATE: AppState = {
  revision: 0,
  scene: {
    path: null,
    name: 'Untitled Scene',
    dirty: false,
    settings: { ...DEFAULT_SCENE_SETTINGS },
    items: [],
  },
  displays: [],
  stage: { ...INITIAL_STAGE_STATE },
  audio: {
    outputs: [],
    selected: null,
    status: 'unset',
    managedMuted: false,
  },
  cursor: { lockEnabled: true, lockActive: false },
  hotkeys: { killRestore: 'disabled', freeze: 'disabled', ret: 'disabled' },
  overlay: { visible: false },
  alerts: [],
}

// ---------------------------------------------------------------------------
// Reducer actions
// ---------------------------------------------------------------------------

export type AppAction =
  // Scene
  | { type: 'SCENE_LOADED'; path: string | null; name: string; settings: SceneSettings; items: ItemView[] }
  | { type: 'SCENE_NEW' }
  | { type: 'SCENE_SAVED'; path: string }
  | { type: 'SCENE_DIRTY'; dirty: boolean }
  | { type: 'SCENE_SETTINGS_UPDATE'; patch: Partial<SceneSettings> }
  | { type: 'SCENE_ITEMS_SET'; items: ItemView[] }
  | { type: 'SCENE_ITEM_ADD'; item: ItemView }
  | { type: 'SCENE_ITEM_REMOVE'; itemId: string }
  | { type: 'SCENE_ITEM_UPDATE'; itemId: string; patch: Partial<ItemView> }
  // Displays
  | { type: 'DISPLAYS_UPDATE'; displays: DisplayInfo[] }
  // Stage session
  | { type: 'STAGE_STARTED'; displayId: number }
  | { type: 'STAGE_STOPPED' }
  | { type: 'STAGE_DETACHED' }
  | { type: 'STAGE_RESUMED'; displayId: number }
  // Stage content
  | { type: 'STAGE_PUSH_PENDING'; token: number; itemId: string | null }
  | { type: 'STAGE_PUSH_COMMITTED'; content: StageContent }
  | { type: 'STAGE_PUSH_FAILED'; token: number }
  // Stage controls
  | { type: 'STAGE_KILLED' }
  | { type: 'STAGE_RESTORED' }
  | { type: 'STAGE_FREEZE'; frozen: boolean }
  | { type: 'STAGE_VIDEO_PLAYING'; playing: boolean }
  | { type: 'STAGE_VIDEO_LOOP'; loop: boolean }
  | { type: 'STAGE_VIDEO_VOLUME'; volume: number }
  | { type: 'STAGE_EMBED_MUTED'; muted: boolean }
  // Audio
  | { type: 'AUDIO_OUTPUTS_UPDATE'; outputs: AudioOutput[] }
  | { type: 'AUDIO_SELECTED'; output: AudioOutput | null }
  | { type: 'AUDIO_STATUS'; status: AudioState['status']; managedMuted: boolean }
  // Cursor
  | { type: 'CURSOR_LOCK_ENABLED'; enabled: boolean }
  | { type: 'CURSOR_LOCK_ACTIVE'; active: boolean }
  // Hotkeys
  | { type: 'HOTKEYS_STATUS'; killRestore: HotkeyStatus; freeze: HotkeyStatus; ret: HotkeyStatus }
  // Overlay
  | { type: 'OVERLAY_VISIBLE'; visible: boolean }
  // Alerts
  | { type: 'ALERT_ADD'; alert: Omit<Alert, 'id' | 'at'> & { id?: string; at?: number } }
  | { type: 'ALERT_REMOVE'; id: string }
  | { type: 'ALERT_REMOVE_BY_CODE'; code: AlertCode }
  | { type: 'ALERTS_CLEAR_NON_STICKY' }

// ---------------------------------------------------------------------------
// Pure reducer
// ---------------------------------------------------------------------------

export function appReducer(state: AppState, action: AppAction): AppState {
  const next = { ...state, revision: state.revision + 1 }

  switch (action.type) {
    // ---- Scene ----
    case 'SCENE_LOADED':
      next.scene = {
        path: action.path,
        name: action.name,
        dirty: false,
        settings: action.settings,
        items: action.items,
      }
      next.stage = { ...INITIAL_STAGE_STATE }
      next.overlay = { visible: false }
      return next

    case 'SCENE_NEW':
      next.scene = {
        path: null,
        name: 'Untitled Scene',
        dirty: false,
        settings: { ...DEFAULT_SCENE_SETTINGS },
        items: [],
      }
      next.stage = { ...INITIAL_STAGE_STATE }
      return next

    case 'SCENE_SAVED':
      next.scene = { ...state.scene, path: action.path, dirty: false }
      return next

    case 'SCENE_DIRTY':
      next.scene = { ...state.scene, dirty: action.dirty }
      return next

    case 'SCENE_SETTINGS_UPDATE':
      next.scene = {
        ...state.scene,
        settings: { ...state.scene.settings, ...action.patch },
        dirty: true,
      }
      return next

    case 'SCENE_ITEMS_SET':
      next.scene = { ...state.scene, items: action.items, dirty: true }
      return next

    case 'SCENE_ITEM_ADD':
      next.scene = { ...state.scene, items: [...state.scene.items, action.item], dirty: true }
      return next

    case 'SCENE_ITEM_REMOVE':
      next.scene = {
        ...state.scene,
        items: state.scene.items.filter((i) => i.id !== action.itemId),
        dirty: true,
      }
      return next

    case 'SCENE_ITEM_UPDATE': {
      const items = state.scene.items.map((item) => {
        if (item.id !== action.itemId) return item
        const patch = action.patch
        let merged = { ...item, ...patch }
        // Deep merge playback if it exists in both
        if ('playback' in item && patch.playback) {
          merged.playback = { ...item.playback, ...patch.playback }
        }
        return merged as ItemView
      })
      next.scene = { ...state.scene, items, dirty: true }
      return next
    }

    // ---- Displays ----
    case 'DISPLAYS_UPDATE':
      next.displays = action.displays
      return next

    // ---- Stage session ----
    case 'STAGE_STARTED':
      next.stage = {
        ...state.stage,
        session: 'live',
        displayId: action.displayId,
        content: { kind: 'slate' },
        pending: null,
        killed: false,
        frozen: false,
      }
      return next

    case 'STAGE_STOPPED':
      next.stage = { ...INITIAL_STAGE_STATE }
      next.overlay = { visible: false }
      next.cursor = { ...state.cursor, lockActive: false }
      return next

    case 'STAGE_DETACHED':
      next.stage = { ...state.stage, session: 'detached' }
      next.cursor = { ...state.cursor, lockActive: false }
      return next

    case 'STAGE_RESUMED':
      next.stage = {
        ...state.stage,
        session: 'live',
        displayId: action.displayId,
        content: { kind: 'slate' },
      }
      return next

    // ---- Stage content ----
    case 'STAGE_PUSH_PENDING':
      next.stage = { ...state.stage, pending: { token: action.token, itemId: action.itemId } }
      return next

    case 'STAGE_PUSH_COMMITTED':
      next.stage = {
        ...state.stage,
        content: action.content,
        pending: null,
        lastLive: action.content.kind !== 'slate' ? action.content : state.stage.lastLive,
      }
      return next

    case 'STAGE_PUSH_FAILED':
      // Only clear pending if the token matches
      if (state.stage.pending?.token === action.token) {
        next.stage = { ...state.stage, pending: null }
      } else {
        return state // no change
      }
      return next

    // ---- Stage controls ----
    case 'STAGE_KILLED':
      next.stage = { ...state.stage, killed: true }
      next.audio = { ...state.audio, managedMuted: true }
      return next

    case 'STAGE_RESTORED':
      next.stage = { ...state.stage, killed: false }
      next.audio = {
        ...state.audio,
        managedMuted: state.audio.status !== 'ok',
      }
      return next

    case 'STAGE_FREEZE':
      next.stage = { ...state.stage, frozen: action.frozen }
      return next

    case 'STAGE_VIDEO_PLAYING':
      if (state.stage.content.kind === 'video') {
        next.stage = {
          ...state.stage,
          content: { ...state.stage.content, playing: action.playing },
        }
      } else return state
      return next

    case 'STAGE_VIDEO_LOOP':
      if (state.stage.content.kind === 'video') {
        next.stage = {
          ...state.stage,
          content: { ...state.stage.content, loop: action.loop },
        }
      } else return state
      return next

    case 'STAGE_VIDEO_VOLUME':
      if (state.stage.content.kind === 'video') {
        next.stage = {
          ...state.stage,
          content: { ...state.stage.content, volume: action.volume },
        }
      } else return state
      return next

    case 'STAGE_EMBED_MUTED':
      if (state.stage.content.kind === 'embed') {
        next.stage = {
          ...state.stage,
          content: { ...state.stage.content, muted: action.muted },
        }
      } else return state
      return next

    // ---- Audio ----
    case 'AUDIO_OUTPUTS_UPDATE':
      next.audio = { ...state.audio, outputs: action.outputs }
      return next

    case 'AUDIO_SELECTED': {
      const status = action.output === null ? 'unset' : 'ok'
      next.audio = {
        ...state.audio,
        selected: action.output,
        status,
        managedMuted: status !== 'ok' || state.stage.killed,
      }
      return next
    }

    case 'AUDIO_STATUS':
      next.audio = { ...state.audio, status: action.status, managedMuted: action.managedMuted }
      return next

    // ---- Cursor ----
    case 'CURSOR_LOCK_ENABLED':
      next.cursor = { ...state.cursor, lockEnabled: action.enabled }
      return next

    case 'CURSOR_LOCK_ACTIVE':
      next.cursor = { ...state.cursor, lockActive: action.active }
      return next

    // ---- Hotkeys ----
    case 'HOTKEYS_STATUS':
      next.hotkeys = {
        killRestore: action.killRestore,
        freeze: action.freeze,
        ret: action.ret,
      }
      return next

    // ---- Overlay ----
    case 'OVERLAY_VISIBLE':
      next.overlay = { visible: action.visible }
      return next

    // ---- Alerts ----
    case 'ALERT_ADD':
      next.alerts = [
        ...state.alerts,
        { ...action.alert, id: action.alert.id ?? uuidv4(), at: action.alert.at ?? Date.now() },
      ]
      return next

    case 'ALERT_REMOVE':
      next.alerts = state.alerts.filter((a) => a.id !== action.id)
      return next

    case 'ALERT_REMOVE_BY_CODE':
      next.alerts = state.alerts.filter((a) => a.code !== action.code)
      return next

    case 'ALERTS_CLEAR_NON_STICKY':
      next.alerts = state.alerts.filter((a) => a.sticky)
      return next

    default: {
      // Exhaustive check
      const _exhaustive: never = action
      void _exhaustive
      return state
    }
  }
}
