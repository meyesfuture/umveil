# IPC contract and state model (normative)

Source of truth in code: `src/shared/ipc.ts` and `src/shared/state.ts` (zod schemas; types are inferred). This document must match them. Behavior: `PRD.md`. Design: `ARCHITECTURE.md`.

## 1. Rules

1. Windows never talk to each other directly; everything goes through the main process (INV-5).
2. Two patterns only: **invoke** (renderer to main, request/response, returns `Result<T>`) and **send** (one-way events; main to renderer, or Stage to main).
3. Every payload is validated with zod in the receiver. Unknown channels are rejected.
4. Every main-side handler verifies the sender: Cockpit channels only from the Cockpit's `webContents`, Stage channels only from the Stage's, `overlay:return` only from the Overlay's.
5. **Commands are idempotent where possible** (`stage:kill` while killed returns ok, no state change).
6. State is delivered as **whole snapshots** with a monotonically increasing `revision`; receivers ignore any snapshot whose `revision` is not greater than the last applied.
7. High-frequency data (video position) uses `playback:tick`, never the snapshot.

```ts
type Result<T> = { ok: true; value: T } | { ok: false; error: { code: ErrorCode; message: string } };

type ErrorCode =
  | 'E_VALIDATION'          // payload failed schema
  | 'E_NOT_ALLOWED'         // precondition not met (see §4)
  | 'E_NOT_FOUND'           // unknown item/asset/display
  | 'E_IO'                  // filesystem failure
  | 'E_SCENE_INVALID'       // scene file failed validation
  | 'E_SCENE_TOO_NEW'       // schemaVersion above supported
  | 'E_UNSUPPORTED_MEDIA'   // probe failed at import
  | 'E_PREFLIGHT_BLOCKED'   // Start Scene blocked
  | 'E_LOCKOUT'             // Restore within 750 ms of Kill
  | 'E_INTERNAL';
```

## 2. State model

```ts
export interface AppState {
  revision: number;
  scene: SceneState;
  displays: DisplayInfo[];
  stage: StageState;
  audio: AudioState;
  cursor: { lockEnabled: boolean; lockActive: boolean };
  hotkeys: { killRestore: HotkeyStatus; freeze: HotkeyStatus; ret: HotkeyStatus };
  overlay: { visible: boolean };
  alerts: Alert[];
}

type HotkeyStatus = 'registered' | 'failed' | 'disabled';

export interface SceneState {
  path: string | null;       // null until first save
  name: string;
  dirty: boolean;
  settings: SceneSettings;
  items: ItemView[];         // bin order
}

export interface SceneSettings {                 // mirrors SCENE_FORMAT.md `settings`
  slate: { mode: 'black' | 'logo'; logoAssetId: string | null };
  transition: { type: 'cut' | 'crossfade'; durationMs: number };   // 0-2000, step 100
  audio: { output: { deviceId: string; label: string } | null };
  stage: { displayHint: { width: number; height: number; internal: boolean } | null };
  cursorLock: boolean;
  returnTarget: 'slate' | 'keep';
}

export interface Playback { autoplay: boolean; loop: boolean; volume: number }  // volume 0-100

type ItemStatus = 'ok' | 'missing' | 'error';
interface ItemBase { id: string; name: string; status: ItemStatus }

export type ItemView =
  | (ItemBase & { kind: 'image'; assetId: string; thumbUrl: string })
  | (ItemBase & { kind: 'video'; assetId: string; thumbUrl: string; durationMs: number; playback: Playback })
  | (ItemBase & { kind: 'embed'; url: string; normalizedUrl: string })
  | (ItemBase & { kind: 'app'; match: { processName: string; titleContains?: string }; running: boolean });

export interface DisplayInfo {
  id: number;                // Electron display id (not stable across sessions)
  label: string;
  bounds: { x: number; y: number; width: number; height: number };   // DIPs
  scaleFactor: number;
  internal: boolean;
  isCockpit: boolean;
  isStage: boolean;
}

export type StageContent =
  | { kind: 'slate' }
  | { kind: 'image'; itemId: string }
  | { kind: 'video'; itemId: string; playing: boolean; loop: boolean; volume: number }
  | { kind: 'embed'; itemId: string; muted: boolean }
  | { kind: 'app'; itemId: string | null; sourceId: string; title: string };

export interface StageState {
  session: 'stopped' | 'live' | 'detached';
  displayId: number | null;
  content: StageContent;
  pending: { token: number; itemId: string | null } | null;   // prerolling push
  killed: boolean;
  frozen: boolean;
  lastLive: StageContent | null;          // offered as "Restore last live" after detach/return
}

export interface AudioOutput { deviceId: string; label: string }

export interface AudioState {
  outputs: AudioOutput[];
  selected: AudioOutput | null;
  status: 'ok' | 'unset' | 'missing';     // unset = none chosen; missing = chosen device not present
  managedMuted: boolean;                  // true when killed or status != 'ok'
}

export type AlertCode =
  | 'DISPLAY_LOST' | 'DISPLAY_AVAILABLE'
  | 'AUDIO_OUTPUT_MISSING' | 'AUDIO_OUTPUT_UNSET'
  | 'EMBED_LOAD_FAILED' | 'MEDIA_DECODE_ERROR'
  | 'APP_WINDOW_LOST' | 'STAGE_RENDERER_CRASHED'
  | 'SCENE_LOAD_FAILED' | 'SCENE_SAVE_FAILED' | 'ASSET_MISSING'
  | 'HOTKEY_REGISTRATION_FAILED' | 'CURSOR_LOCK_FAILED';

export interface Alert {
  id: string;
  level: 'info' | 'warn' | 'error';
  code: AlertCode;
  message: string;
  at: number;               // epoch ms
  itemId?: string;
  sticky: boolean;          // sticky alerts stay until their condition clears or the operator dismisses
}
```

## 3. Channels

### 3.1 Cockpit to Main (invoke)

| Channel | Payload | Returns | Notes |
|---|---|---|---|
| `scene:new` | none | `void` | Prompts via Cockpit if dirty (UI-side) |
| `scene:open` | `{ path?: string }` | `void` | No path: main shows the file dialog |
| `scene:save` | none | `{ path: string }` | Save As flow if no path |
| `scene:save-as` | `{ path?: string }` | `{ path: string }` | |
| `scene:update-settings` | `{ patch: DeepPartial<SceneSettings> }` | `void` | |
| `items:import` | `{ paths: string[] }` | `{ added: ItemView[]; rejected: { path: string; reason: string }[] }` | Hash, probe, copy |
| `items:add-embed` | `{ url: string; name?: string }` | `ItemView` | Validates and normalizes |
| `items:pin-app` | `{ sourceId: string }` | `ItemView` | Creates an `app` target |
| `items:update` | `{ itemId: string; patch: { name?: string; playback?: Partial<Playback> } }` | `void` | |
| `items:remove` | `{ itemId: string }` | `void` | |
| `preflight:run` | none | `PreflightResult` | |
| `stage:start` | none | `PreflightResult` | `E_PREFLIGHT_BLOCKED` if any check blocks |
| `stage:stop` | none | `void` | |
| `stage:resume` | none | `void` | Only from `detached` |
| `stage:restore-last-live` | none | `void` | Pushes `lastLive` again |
| `stage:set-display` | `{ displayId: number }` | `void` | Not the Cockpit display |
| `stage:push` | `{ itemId: string }` | `{ token: number }` | Returns when accepted, not when committed |
| `stage:kill` | none | `void` | Idempotent |
| `stage:restore` | none | `void` | `E_LOCKOUT` within 750 ms of kill |
| `stage:freeze` | `{ on: boolean }` | `void` | Idempotent |
| `stage:playback` | `{ action: 'play' \| 'pause' \| 'restart' \| 'seek' \| 'loop' \| 'volume'; value?: number \| boolean }` | `void` | Video only |
| `stage:embed` | `{ action: 'reload' \| 'mute' \| 'unmute' }` | `void` | Embed only |
| `audio:refresh` | none | `AudioOutput[]` | Re-enumerate |
| `audio:select` | `{ deviceId: string }` | `void` | |
| `audio:test-tone` | none | `void` | Through the Stage sink |
| `apps:list` | none | `AppWindowInfo[]` | Thumbnails; excludes umveil windows |
| `apps:project` | `{ sourceId: string }` | `{ token: number }` | |
| `cursor:set-lock` | `{ enabled: boolean }` | `void` | |
| `diagnostics:copy` | none | `string` | Log tail + versions |

```ts
interface PreflightCheck { id: 'displays' | 'stageDisplay' | 'audio' | 'assets'; result: 'pass' | 'warn' | 'block'; message: string; itemIds?: string[] }
interface PreflightResult { checks: PreflightCheck[]; canStart: boolean }
interface AppWindowInfo { sourceId: string; title: string; processName: string | null; iconDataUrl: string | null; thumbDataUrl: string; minimized: boolean }
```

### 3.2 Overlay to Main (invoke)

| Channel | Payload | Returns | Notes |
|---|---|---|---|
| `overlay:return` | none | `void` | Focus Cockpit; apply `returnTarget` |

### 3.3 Main to Cockpit (send)

| Channel | Payload | Notes |
|---|---|---|
| `state:update` | `AppState` | Whole snapshot; also sent on Cockpit load |
| `playback:tick` | `{ positionMs: number; durationMs: number }` | ≤ 4 Hz, video only |
| `preview:source` | `{ mediaSourceId: string \| null }` | Stage's capture id for the confidence monitor; `null` when the Stage is not running |

### 3.4 Main to Stage (send)

| Channel | Payload | Notes |
|---|---|---|
| `stage:sync` | `{ content: StageContent; killed: boolean; frozen: boolean; slate: SceneSettings['slate']; transition: SceneSettings['transition']; sink: AudioOutput \| null; managedMuted: boolean; assetBaseUrl: string }` | Full desired state; sent after every Stage (re)load |
| `stage:load` | `StageLoadCommand` | Preroll then commit (INV-6) |
| `stage:curtain` | `{ on: boolean; slate: SceneSettings['slate'] }` | Kill/Restore; instant on `on: true` |
| `stage:freeze-image` | `{ jpegDataUrl: string \| null }` | `null` unfreezes |
| `stage:playback-cmd` | same shape as `stage:playback` | |
| `stage:embed-cmd` | same shape as `stage:embed` | |
| `stage:audio` | `{ sink: AudioOutput \| null; managedMuted: boolean }` | |
| `stage:tone` | none | Test tone |

```ts
interface StageLoadCommand {
  token: number;                                  // monotonically increasing; latest wins
  content: Exclude<StageContent, { kind: 'slate' }> | { kind: 'slate' };
  source:                                         // what to load
    | { kind: 'image' | 'video'; url: string }    // umveil-media://asset/<assetId>
    | { kind: 'embed'; url: string }              // normalizedUrl
    | { kind: 'app'; sourceId: string }
    | { kind: 'slate' };
  transition: { type: 'cut' | 'crossfade'; durationMs: number };
  autoplay: boolean;                              // false when killed or frozen (FR-08)
  playback?: Playback;                            // video only
  timeoutMs: number;                              // 8000 embeds; 3000 otherwise
}
```

### 3.5 Stage to Main (send)

| Channel | Payload | Notes |
|---|---|---|
| `stage:ready` | none | Renderer booted; main answers with `stage:sync` |
| `stage:status` | `{ token: number; phase: 'committed' \| 'failed'; code?: 'TIMEOUT' \| 'DECODE' \| 'LOAD' \| 'CAPTURE'; detail?: string }` | Result of a load |
| `stage:curtain-ack` | `{ on: boolean; presentedAtMs: number }` | Cancels the 150 ms hard-kill watchdog; `presentedAtMs` feeds the NF-01 latency log |
| `stage:media-event` | `{ type: 'ended' \| 'error'; detail?: string }` | Video ended / mid-playback error |
| `stage:audio-devices` | `{ outputs: AudioOutput[]; sinkApplied: boolean }` | On boot and on `devicechange` |
| `stage:capture-ended` | `{ reason: 'ended' \| 'error' }` | Mirrored window's track ended |
| `playback:tick` | `{ positionMs: number; durationMs: number }` | ≤ 4 Hz; main forwards to Cockpit |

## 4. Command preconditions

| Command | Allowed when | Otherwise |
|---|---|---|
| `stage:start` | `session = stopped` and preflight has no `block` | `E_PREFLIGHT_BLOCKED` / `E_NOT_ALLOWED` |
| `stage:push`, `apps:project` | `session = live` | `E_NOT_ALLOWED` (detached: controls are disabled in the UI too) |
| `stage:resume` | `session = detached` and a valid non-Cockpit display exists | `E_NOT_ALLOWED` |
| `stage:kill` | always (idempotent; no-op when stopped, flag still recorded) | n/a |
| `stage:restore` | `killed = true` and ≥ 750 ms since kill | `E_LOCKOUT` / `E_NOT_ALLOWED` |
| `stage:freeze` | `session = live` | `E_NOT_ALLOWED` |
| `stage:playback` | content is `video` | `E_NOT_ALLOWED` |
| `stage:embed` | content is `embed` | `E_NOT_ALLOWED` |
| `stage:set-display` | display exists and is not the Cockpit's; if live, restarts the Stage on the new display | `E_NOT_FOUND` / `E_NOT_ALLOWED` |
| `scene:open`, `scene:new` | always (UI warns if dirty or live) | n/a |

The 750 ms Restore lockout and every precondition are enforced in **main**, not in the UI.

## 5. Preload API (Cockpit)

```ts
interface CockpitApi {
  invoke<C extends CockpitInvokeChannel>(channel: C, payload: Payload<C>): Promise<Result<Returns<C>>>;
  onState(cb: (s: AppState) => void): () => void;       // returns unsubscribe
  onTick(cb: (t: { positionMs: number; durationMs: number }) => void): () => void;
  onPreviewSource(cb: (id: string | null) => void): () => void;
}
declare global { interface Window { umveil: CockpitApi } }
```

The Stage and Overlay preloads expose analogous minimal typed APIs for their own channels only.

## 6. Ordering and race rules

- A newer `stage:push`/`apps:project` token supersedes any in-flight one. The Stage drops superseded loads and reports nothing for them.
- `stage:curtain` and `stage:freeze-image` are processed immediately and are never queued behind loads.
- After `stage:ready`, main always sends `stage:sync` before any other Stage-bound message.
- `state:update` is sent after the reducer commits, never before.
