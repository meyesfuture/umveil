# `.umveil` scene file format (normative)

Format version: **1** (`schemaVersion: 1`). Implements FR-01. Schemas live in `src/shared/scene-schema.ts` (zod) and are the source of truth for types.

## 1. Container

A `.umveil` file is a **ZIP archive** (entries stored with no compression) containing:

| Entry | Required | Description |
|---|---|---|
| `scene.json` | Yes | UTF-8 JSON, see §2 |
| `media/<sha256>.<ext>` | One per asset | Original media bytes; `<sha256>` is the lowercase hex SHA-256 of the file; `<ext>` is the lowercase original extension |

No other entries are read. Unknown entries are ignored (and dropped on the next save).

**Limits (v1):** soft limit 2 GB per scene file (warn above it); ZIP64 is not validated for larger files. Maximum 500 items.

## 2. `scene.json`

```json
{
  "schemaVersion": 1,
  "app": { "name": "umveil", "version": "0.1.0" },
  "scene": {
    "id": "3f6c1d1e-8a6b-4c3e-9a1f-6b0a2f7d9c11",
    "name": "Fest Opening Ceremony",
    "createdAt": "2026-10-02T09:00:00.000Z",
    "modifiedAt": "2026-10-02T09:30:00.000Z"
  },
  "settings": {
    "slate": { "mode": "logo", "logoAssetId": "a1b2c3d4-0000-4000-8000-000000000001" },
    "transition": { "type": "crossfade", "durationMs": 400 },
    "audio": {
      "output": { "deviceId": "e5b1...", "label": "HDMI Output (Intel Display Audio)" }
    },
    "stage": { "displayHint": { "width": 1920, "height": 1080, "internal": false } },
    "cursorLock": true,
    "returnTarget": "slate"
  },
  "assets": [
    {
      "id": "a1b2c3d4-0000-4000-8000-000000000001",
      "role": "logo",
      "file": "media/9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08.png",
      "sha256": "9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08",
      "mime": "image/png",
      "bytes": 84213,
      "width": 1920,
      "height": 1080
    },
    {
      "id": "a1b2c3d4-0000-4000-8000-000000000002",
      "role": "item",
      "file": "media/2c26b46b68ffc68ff99b453c1d30413413422d706483bfa0f98a5e886266e7ae.mp4",
      "sha256": "2c26b46b68ffc68ff99b453c1d30413413422d706483bfa0f98a5e886266e7ae",
      "mime": "video/mp4",
      "bytes": 48213990,
      "width": 1920,
      "height": 1080,
      "durationMs": 92000
    }
  ],
  "items": [
    {
      "id": "b1000000-0000-4000-8000-000000000001",
      "kind": "video",
      "name": "Opening reel",
      "assetId": "a1b2c3d4-0000-4000-8000-000000000002",
      "playback": { "autoplay": true, "loop": false, "volume": 100 }
    },
    {
      "id": "b1000000-0000-4000-8000-000000000002",
      "kind": "embed",
      "name": "Slido poll",
      "url": "https://app.sli.do/event/abc123",
      "normalizedUrl": "https://app.sli.do/event/abc123"
    },
    {
      "id": "b1000000-0000-4000-8000-000000000003",
      "kind": "app",
      "name": "Keynote slides",
      "match": { "processName": "POWERPNT.EXE", "titleContains": "Keynote" }
    }
  ]
}
```

(Hashes above are illustrative. File names must match the real SHA-256.)

## 3. Field rules

**Top level:** `schemaVersion` (integer, required), `app`, `scene`, `settings`, `assets`, `items` all required.

**`scene`:** `id` UUID v4; `name` 1-120 chars; `createdAt`/`modifiedAt` UTC ISO-8601.

**`settings`**

| Field | Type | Default | Notes |
|---|---|---|---|
| `slate.mode` | `"black" \| "logo"` | `"black"` | Used by Kill and by the idle/return state |
| `slate.logoAssetId` | asset id or `null` | `null` | Must reference an asset with `role: "logo"`; if `mode` is `logo` and this is null, fall back to black with a warning |
| `transition.type` | `"cut" \| "crossfade"` | `"crossfade"` | |
| `transition.durationMs` | integer 0-2000, step 100 | `400` | Ignored for `cut` |
| `audio.output` | `{ deviceId, label } \| null` | `null` | Resolved by label on other machines; unresolved is flagged, not an error |
| `stage.displayHint` | `{ width, height, internal } \| null` | `null` | Soft hint only |
| `cursorLock` | boolean | `true` | FR-16 |
| `returnTarget` | `"slate" \| "keep"` | `"slate"` | FR-13 |

**`assets[]`:** `id` UUID; `role` `"item"` or `"logo"`; `file` must equal `media/<sha256>.<ext>` and match the `sha256` field; `mime` one of the supported types (PRD FR-07); `bytes` integer; `width`/`height` optional integers; `durationMs` optional integer (videos). Two assets may not share a `sha256` (dedupe on import).

**`items[]`** is ordered (bin order). Discriminated by `kind`:

| `kind` | Required fields | Notes |
|---|---|---|
| `image` | `id`, `name`, `assetId` | `assetId` must reference an asset with `role: "item"` |
| `video` | `id`, `name`, `assetId`, `playback { autoplay, loop, volume 0-100 }` | |
| `embed` | `id`, `name`, `url`, `normalizedUrl` | `http`/`https` only; `normalizedUrl` is what the Stage loads (e.g. YouTube `/embed/`) |
| `app` | `id`, `name`, `match { processName, titleContains? }` | Pure data: matched against running windows at runtime; **never launched** |

**Referential integrity (validated on load):** every `assetId` exists; no orphan `item` assets (orphans are dropped with a warning); ids unique.

## 4. Versioning and compatibility

- `schemaVersion` is a single integer. The app opens versions ≤ its supported version, running migrations in order (`migrate_1_to_2`, ...), and always saves the current version.
- A file with a **higher** version is refused ("Created by a newer umveil") and left untouched.
- Unknown JSON fields are ignored on load and dropped on save, which is why newer versions are refused rather than half-read.

## 5. Working copy, import, and save

**Working directory:** `%LOCALAPPDATA%\umveil\cache\<sceneId>\` (falls back to the OS temp directory if `LOCALAPPDATA` is unset). Contains `media/` and the in-memory scene is serialized from `AppState`.

**Import (FR-07):** read file, compute SHA-256 while copying into `media/<sha256>.<ext>`; if the hash already exists, reuse it. Probe decodability (image decode / `<video>` metadata load); reject on failure. Store `mime`, `bytes`, dimensions, duration.

**Open (FR-01):**
1. Open the ZIP; read and validate `scene.json` (version check, zod, referential integrity).
2. Extract only entries matching `^media/[0-9a-f]{64}\.[a-z0-9]{1,8}$` that are referenced by `assets[]`; **never** use entry names as paths without this check (zip-slip). Verify each file's size equals `bytes`; verify SHA-256 lazily on first use, and fully on demand ("Verify scene").
3. Missing/corrupt media: open the scene, mark the items as errored, and surface a warning (FR-04 preflight).

**Save (atomic):**
1. Serialize `scene.json` (stable key order, `modifiedAt` updated).
2. Write a new ZIP (STORE) to `<target>.tmp` in the **same directory** (same volume).
3. `fsync`, then rename over `<target>`. Keep the previous file as `<target>.bak` (one generation).
4. On any failure: delete the `.tmp`, leave the original untouched, alert the operator.

**Autosave (FR-02, P1):** every 60 s while dirty, write the same structure to `%APPDATA%\umveil\recovery\<sceneId>.umveil`; delete on successful save/close; offer on next launch if present.

**Cache hygiene:** delete a scene's working directory when it is closed; on startup purge cache directories untouched for more than 7 days.

**Recommended libraries:** `yauzl` (read) and `yazl` (write; per-file `compress: false`).

## 6. Security notes

- Scene files are untrusted input: schema-validate, bound sizes, cap item count, never execute or launch anything from them.
- URLs: only `http`/`https`; reject `javascript:`, `data:`, `file:`, `chrome:`, and anything else.
- Process names in `match` are compared as strings only.

## 7. Example migration stub

```ts
const migrations: Record<number, (s: unknown) => unknown> = {
  // 1: (s) => ({ ...(s as V1), schemaVersion: 2, /* new fields with defaults */ }),
};
```
