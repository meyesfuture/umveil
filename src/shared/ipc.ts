/**
 * ipc.ts — IPC channel names and payload types.
 * All zod schemas here; TypeScript types are inferred.
 * Normative: must match docs/IPC_CONTRACT.md.
 */

import { z } from 'zod'

// ---------------------------------------------------------------------------
// Result wrapper
// ---------------------------------------------------------------------------

export const ErrorCodeSchema = z.enum([
  'E_VALIDATION',
  'E_NOT_ALLOWED',
  'E_NOT_FOUND',
  'E_IO',
  'E_SCENE_INVALID',
  'E_SCENE_TOO_NEW',
  'E_UNSUPPORTED_MEDIA',
  'E_PREFLIGHT_BLOCKED',
  'E_LOCKOUT',
  'E_INTERNAL',
])

export type ErrorCode = z.infer<typeof ErrorCodeSchema>

export type Result<T> =
  | { ok: true; value: T }
  | { ok: false; error: { code: ErrorCode; message: string } }

export function ok<T>(value: T): Result<T> {
  return { ok: true, value }
}

export function err<T>(code: ErrorCode, message: string): Result<T> {
  return { ok: false, error: { code, message } }
}

// ---------------------------------------------------------------------------
// Shared payload schemas (sub-schemas)
// ---------------------------------------------------------------------------

export const AudioOutputSchema = z.object({
  deviceId: z.string(),
  label: z.string(),
})

export const PlaybackSchema = z.object({
  autoplay: z.boolean(),
  loop: z.boolean(),
  volume: z.number().int().min(0).max(100),
})

export const TransitionSchema = z.object({
  type: z.enum(['cut', 'crossfade']),
  durationMs: z.number().int().min(0).max(2000),
})

export const SlateSchema = z.object({
  mode: z.enum(['black', 'logo']),
  logoAssetId: z.string().nullable(),
})

export const PreflightCheckSchema = z.object({
  id: z.enum(['displays', 'stageDisplay', 'audio', 'assets']),
  result: z.enum(['pass', 'warn', 'block']),
  message: z.string(),
  itemIds: z.array(z.string()).optional(),
})

export const PreflightResultSchema = z.object({
  checks: z.array(PreflightCheckSchema),
  canStart: z.boolean(),
})

export type PreflightResult = z.infer<typeof PreflightResultSchema>

export const AppWindowInfoSchema = z.object({
  sourceId: z.string(),
  title: z.string(),
  processName: z.string().nullable(),
  iconDataUrl: z.string().nullable(),
  thumbDataUrl: z.string(),
  minimized: z.boolean(),
})

export type AppWindowInfo = z.infer<typeof AppWindowInfoSchema>

// ---------------------------------------------------------------------------
// Cockpit → Main channel payloads
// ---------------------------------------------------------------------------

export const CockpitPayloads = {
  'scene:new': z.undefined(),
  'scene:open': z.object({ path: z.string().optional() }),
  'scene:save': z.undefined(),
  'scene:save-as': z.object({ path: z.string().optional() }),
  'scene:update-settings': z.object({
    patch: z.object({
      slate: SlateSchema.optional(),
      transition: TransitionSchema.optional(),
      audio: z.object({ output: AudioOutputSchema.nullable() }).optional(),
      stage: z.object({ displayHint: z.object({ width: z.number(), height: z.number(), internal: z.boolean() }).nullable() }).optional(),
      cursorLock: z.boolean().optional(),
      returnTarget: z.enum(['slate', 'keep']).optional(),
    }),
  }),
  'items:import': z.object({ paths: z.array(z.string()) }),
  'items:add-embed': z.object({ url: z.string(), name: z.string().optional() }),
  'items:pin-app': z.object({ sourceId: z.string() }),
  'items:update': z.object({
    itemId: z.string(),
    patch: z.object({
      name: z.string().optional(),
      playback: PlaybackSchema.partial().optional(),
    }),
  }),
  'items:remove': z.object({ itemId: z.string() }),
  'preflight:run': z.undefined(),
  'stage:start': z.undefined(),
  'stage:stop': z.undefined(),
  'stage:resume': z.undefined(),
  'stage:restore-last-live': z.undefined(),
  'stage:set-display': z.object({ displayId: z.number() }),
  'stage:push': z.object({ itemId: z.string() }),
  'stage:kill': z.undefined(),
  'stage:restore': z.undefined(),
  'stage:freeze': z.object({ on: z.boolean() }),
  'stage:playback': z.object({
    action: z.enum(['play', 'pause', 'restart', 'seek', 'loop', 'volume']),
    value: z.union([z.number(), z.boolean()]).optional(),
  }),
  'stage:embed': z.object({ action: z.enum(['reload', 'mute', 'unmute']) }),
  'audio:refresh': z.undefined(),
  'audio:select': z.object({ deviceId: z.string() }),
  'audio:test-tone': z.undefined(),
  'apps:list': z.undefined(),
  'apps:project': z.object({ sourceId: z.string() }),
  'cursor:set-lock': z.object({ enabled: z.boolean() }),
  'diagnostics:copy': z.undefined(),
} as const

export type CockpitChannel = keyof typeof CockpitPayloads

// ---------------------------------------------------------------------------
// Overlay → Main channel payloads
// ---------------------------------------------------------------------------

export const OverlayPayloads = {
  'overlay:return': z.undefined(),
} as const

export type OverlayChannel = keyof typeof OverlayPayloads

// ---------------------------------------------------------------------------
// Stage → Main channel payloads
// ---------------------------------------------------------------------------

export const StageToMainPayloads = {
  'stage:ready': z.undefined(),
  'stage:status': z.object({
    token: z.number(),
    phase: z.enum(['committed', 'failed']),
    code: z.enum(['TIMEOUT', 'DECODE', 'LOAD', 'CAPTURE']).optional(),
    detail: z.string().optional(),
  }),
  'stage:curtain-ack': z.object({
    on: z.boolean(),
    presentedAtMs: z.number(),
  }),
  'stage:media-event': z.object({
    type: z.enum(['ended', 'error']),
    detail: z.string().optional(),
  }),
  'stage:audio-devices': z.object({
    outputs: z.array(AudioOutputSchema),
    sinkApplied: z.boolean(),
  }),
  'stage:capture-ended': z.object({
    reason: z.enum(['ended', 'error']),
  }),
  'playback:tick': z.object({
    positionMs: z.number(),
    durationMs: z.number(),
  }),
} as const

export type StageToMainChannel = keyof typeof StageToMainPayloads

// ---------------------------------------------------------------------------
// Main → Stage channel payloads (send, one-way)
// ---------------------------------------------------------------------------

export const StageContentSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('slate') }),
  z.object({ kind: z.literal('image'), itemId: z.string() }),
  z.object({ kind: z.literal('video'), itemId: z.string(), playing: z.boolean(), loop: z.boolean(), volume: z.number() }),
  z.object({ kind: z.literal('embed'), itemId: z.string(), muted: z.boolean() }),
  z.object({ kind: z.literal('app'), itemId: z.string().nullable(), sourceId: z.string(), title: z.string() }),
])

export const StageLoadCommandSchema = z.object({
  token: z.number(),
  content: StageContentSchema,
  source: z.union([
    z.object({ kind: z.enum(['image', 'video']), url: z.string() }),
    z.object({ kind: z.literal('embed'), url: z.string() }),
    z.object({ kind: z.literal('app'), sourceId: z.string() }),
    z.object({ kind: z.literal('slate') }),
  ]),
  transition: TransitionSchema,
  autoplay: z.boolean(),
  playback: PlaybackSchema.optional(),
  timeoutMs: z.number(),
})

export type StageLoadCommand = z.infer<typeof StageLoadCommandSchema>

// All channels as string constants (avoids magic strings in code)
export const IPC = {
  // Cockpit invoke channels
  SCENE_NEW: 'scene:new',
  SCENE_OPEN: 'scene:open',
  SCENE_SAVE: 'scene:save',
  SCENE_SAVE_AS: 'scene:save-as',
  SCENE_UPDATE_SETTINGS: 'scene:update-settings',
  ITEMS_IMPORT: 'items:import',
  ITEMS_ADD_EMBED: 'items:add-embed',
  ITEMS_PIN_APP: 'items:pin-app',
  ITEMS_UPDATE: 'items:update',
  ITEMS_REMOVE: 'items:remove',
  PREFLIGHT_RUN: 'preflight:run',
  STAGE_START: 'stage:start',
  STAGE_STOP: 'stage:stop',
  STAGE_RESUME: 'stage:resume',
  STAGE_RESTORE_LAST_LIVE: 'stage:restore-last-live',
  STAGE_SET_DISPLAY: 'stage:set-display',
  STAGE_PUSH: 'stage:push',
  STAGE_KILL: 'stage:kill',
  STAGE_RESTORE: 'stage:restore',
  STAGE_FREEZE: 'stage:freeze',
  STAGE_PLAYBACK: 'stage:playback',
  STAGE_EMBED: 'stage:embed',
  AUDIO_REFRESH: 'audio:refresh',
  AUDIO_SELECT: 'audio:select',
  AUDIO_TEST_TONE: 'audio:test-tone',
  APPS_LIST: 'apps:list',
  APPS_PROJECT: 'apps:project',
  CURSOR_SET_LOCK: 'cursor:set-lock',
  DIAGNOSTICS_COPY: 'diagnostics:copy',
  // Overlay
  OVERLAY_RETURN: 'overlay:return',
  // Stage → Main
  STAGE_READY: 'stage:ready',
  STAGE_STATUS: 'stage:status',
  STAGE_CURTAIN_ACK: 'stage:curtain-ack',
  STAGE_MEDIA_EVENT: 'stage:media-event',
  STAGE_AUDIO_DEVICES: 'stage:audio-devices',
  STAGE_CAPTURE_ENDED: 'stage:capture-ended',
  PLAYBACK_TICK: 'playback:tick',
  // Main → Cockpit
  STATE_UPDATE: 'state:update',
  PREVIEW_SOURCE: 'preview:source',
  // Main → Stage
  STAGE_SYNC: 'stage:sync',
  STAGE_LOAD: 'stage:load',
  STAGE_CURTAIN: 'stage:curtain',
  STAGE_FREEZE_IMAGE: 'stage:freeze-image',
  STAGE_PLAYBACK_CMD: 'stage:playback-cmd',
  STAGE_EMBED_CMD: 'stage:embed-cmd',
  STAGE_AUDIO: 'stage:audio',
  STAGE_TONE: 'stage:tone',
} as const
