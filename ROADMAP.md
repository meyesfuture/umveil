# Roadmap: spikes, milestones, risks

Sizes are relative effort (S < M < L), not calendar time, since no deadline has been set. Build in order: each milestone leaves a working, demo-able app.

## 1. Spikes (M-0)

Throwaway experiments in `spikes/<id>-<name>/`. Run them on **real hardware with a real external display or TV over HDMI**. Time-box each to about two focused sessions; record the result in `DECISIONS.md` ("Spike outcomes"). Run in this order: S-4, S-1, S-3 first (highest risk), then S-2, S-5, S-6.

| ID | Question | Method | Pass criteria | Fallback if it fails | Feeds |
|---|---|---|---|---|---|
| **S-4** | Can we reliably place a frameless, non-focusable Stage on display 2, react to unplug/replug, and confine the cursor? | Electron app: create the window at display-2 bounds with the ADR-004 properties; log `display-added/removed/metrics-changed` while physically unplugging HDMI, switching Win+P modes, changing projector resolution, and mixing 100%/150% DPI. `koffi` call to `ClipCursor`; kill the process while clipped. | Stage never appears on display 1; hidden ≤ 500 ms after removal; bounds correct after replug and DPI mix; cursor clip applies and releases; behavior after process kill is known | Use `fullscreen: true` instead of bounds; add a startup self-release for the clip; native N-API addon for cursor if `koffi` misbehaves | ADR-004, FR-03/06/16, NF-02 |
| **S-1** | Can we mirror arbitrary windows (PowerPoint slideshow, Chrome, VLC) to the Stage as video? | `desktopCapturer.getSources({types:['window']})` list + thumbnails; stream a chosen source into a `<video>` in a second window; test occluded, minimized, fullscreen, elevated (admin) app, different DPI, DRM video; measure fps and CPU; parse `window:<HWND>:0` ids; try `getUserMedia` desktop constraint vs `setDisplayMediaRequestHandler` | ≥ 15 fps on the reference laptop; works when occluded; minimized/closed detectable; source-id to HWND to process-name works | ADR-005 fallback: move/resize the real window onto the Stage display via `SetWindowPos` | ADR-005, FR-12/13 |
| **S-3** | Can we (a) list output devices with labels, (b) route `<video>` audio to a chosen device, (c) route webview guest audio too? | `enumerateDevices` in a window; `setSinkId` on `<video>` and `AudioContext`; webview loading a YouTube embed with a guest preload that patches media elements; unplug the HDMI audio device mid-play | (a) labels present, else a documented workaround works; (b) audio only on the selected device; (c) guest audio follows the sink, or we confirm it does not | (c) fails: document Windows per-app output setting; keep embeds best-effort | ADR-008, FR-09/10, INV-4 |
| **S-2** | Can we capture the Stage reliably for the confidence monitor and freeze? | `getMediaSourceId()` of the non-focusable always-on-top Stage on display 2 into a Cockpit `<video>` at 15 fps; `capturePage()` on a Stage showing `<video>`, `<webview>`, and a mirrored stream | Preview ≥ 12 fps, ≤ 500 ms latency, CPU acceptable; `capturePage` includes webview and mirror content; freeze capture ≤ 150 ms | Poll `capturePage()` at ~5 fps for the preview; freeze from last preview frame | ADR-006, FR-14/15 |
| **S-5** | Do `umveil-media://` and the codecs behave? | Custom privileged protocol serving a 1 GB MP4 from disk; test seeking; try H.264/AAC MP4, VP9 WebM, HEVC MOV, AVIF, animated GIF | Seeking works without full reads; supported list in PRD FR-07 confirmed or adjusted | Serve via `file://` with narrow `webPreferences`; update the supported-format list | FR-07/08 |
| **S-6** | Do real embeds work in `<webview>`? | Load a Slido event page, YouTube watch and embed URLs, Google Slides published link, a generic site; check autoplay (`autoplayPolicy`), popups denied, permission prompts denied, load-failure and 8 s timeout handling | Pages render cleanly fullscreen; autoplay works; failures are detected | `WebContentsView` fallback (ADR-008) | ADR-008, FR-10 |

**M-0 exit criteria:** all six spikes recorded in `DECISIONS.md`; ADR-001 confirmed (or replaced); ADR-005/006/008 resolved; repo skeleton builds and opens an empty Cockpit and Stage.

## 2. Milestones

### M-0: Spikes and skeleton (M)
- [ ] Repo init: `package.json`, TypeScript strict, `electron-vite` with three renderer pages, Vitest, logger stub, CLAUDE.md conventions
- [ ] Spikes S-1 to S-6 (above)
- [ ] `src/shared`: `state.ts` and `ipc.ts` skeletons from `IPC_CONTRACT.md`

### M-1: Two-window core (L)
Requirements: FR-03, FR-04 (displays/stage-display checks), FR-05 (soft path + main-level mute), FR-11, FR-14.
- [ ] Store + reducer + typed IPC router with sender checks and zod
- [ ] `DisplayService`, `StageController`: create/position/show/hide Stage (INV-1), Start/Stop, display choice
- [ ] Compositor skeleton: A/B slots, `.canvas` 16:9 letterbox, `.curtain`, slate (black/logo)
- [ ] Kill/Restore with 750 ms lockout, main-level `setAudioMuted`, curtain ack
- [ ] Confidence monitor (per S-2 outcome); state chips; `PowerService` (prevent display sleep)
- [ ] Cockpit shell: header, banner area, status bar
- **Exit:** Start puts a black Stage on display 2 without stealing focus; Kill/Restore work and latency is logged; preview shows the Stage; Stop removes it; INV-1/2/3(soft)/5 tests pass.

### M-2: Media and scenes (L)
Requirements: FR-01, FR-07, FR-08, FR-17.
- [ ] `SceneService` per `SCENE_FORMAT.md` (import, hash/dedupe, probe, atomic save, open, extraction safety)
- [ ] `MediaProtocol` (`umveil-media://`) with Range
- [ ] Asset Bin (Media tab), tiles with states, drag-and-drop import
- [ ] Push image/video through preroll gate (INV-6); playback controls and `playback:tick`
- [ ] Transitions: cut/crossfade, supersede rule, audio crossfade for managed audio
- **Exit:** build a scene, save, close, reopen, push everything with correct transitions; corrupt-file tests pass.

### M-3: Audio, embeds, disconnect (L)
Requirements: FR-09, FR-10, FR-06, FR-04 (audio and asset checks).
- [ ] `AudioService`: device list, selection, sink application, device loss, test tone, INV-4
- [ ] Web tab: URL validation/normalization (`src/shared/url.ts`), `<webview>` layer, preroll with 8 s timeout, reload/mute
- [ ] Display disconnect/reconnect flow with banner, Resume, Restore last live (INV-7)
- [ ] Complete preflight (audio, assets)
- **Exit:** drills D-1 (unplug during video), D-2 (audio device removed), D-4 (embed failure) pass on hardware.

### M-4: Freeze and Hide Mouse (M)
Requirements: FR-15, FR-16.
- [ ] Freeze: `capturePage` to `.freeze` layer; interplay with Kill, pushes, unfreeze transition
- [ ] Hide Mouse: `Win32Bridge.clipCursor`, re-apply on display change/resume, release paths (INV-8)
- **Exit:** freeze holds the correct frame with changing content beneath it; cursor cannot reach the Stage display; clip released on exit.

### M-5: App Switcher and Return overlay (L)
Requirements: FR-12, FR-13.
- [ ] `CaptureService` window listing (exclude own windows), thumbnails, 2 s refresh, pinned app targets
- [ ] Mirror layer (`MediaStream`), preroll, `Win32Bridge` (`hwndFromSourceId`, `getWindowInfo`, `bringToFront`)
- [ ] Return overlay window (capture-excluded, clamped to Cockpit display) and Return behavior (`returnTarget`)
- [ ] Closed/minimized detection (track end + 500 ms poll) with slate fallback
- **Exit:** a PowerPoint slideshow mirrors at ≥ 15 fps, Return works, closing the app returns the Stage to the slate.

### M-6: Hardening and release (L)
Requirements: FR-02, FR-18, FR-19, hard path of FR-05, NF-01..NF-10.
- [ ] Failsafe blackout window and 150 ms watchdog (ADR-007); Stage crash recovery (`stage:sync`)
- [ ] Global hotkeys; autosave/recovery; diagnostics log and "Copy diagnostics"
- [ ] Single-instance lock, `.umveil` file association, startup cursor self-release
- [ ] Packaging: portable + NSIS; unsigned note in README
- [ ] 4-hour soak, hardware matrix, dress rehearsal (`TEST_PLAN.md`)
- **Exit:** PRD §11 success criteria met.

### Requirement coverage check

| FR | Milestone | FR | Milestone |
|---|---|---|---|
| FR-01 | M-2 | FR-11 | M-1 |
| FR-02 | M-6 | FR-12 | M-5 |
| FR-03 | M-1 | FR-13 | M-5 |
| FR-04 | M-1, M-3 | FR-14 | M-1 |
| FR-05 | M-1, M-6 | FR-15 | M-4 |
| FR-06 | M-3 | FR-16 | M-4 |
| FR-07 | M-2 | FR-17 | M-2 |
| FR-08 | M-2 | FR-18 | M-6 |
| FR-09 | M-3 | FR-19 | M-6 |
| FR-10 | M-3 | | |

## 3. Risk register

L = likelihood, I = impact (H/M/L).

| ID | Risk | L | I | Mitigation | Spike |
|---|---|---|---|---|---|
| R-01 | Window capture unreliable (occluded, minimized, elevated app, DRM, low fps) | M | H | Spike first; alert + slate fallback; fallback design = move real window (ADR-005) | S-1 |
| R-02 | Webview guest audio cannot follow the selected output | M | M | Guest preload patch; else documented Windows per-app output setting; guarantee table already says "best effort" | S-3 |
| R-03 | Output device labels unavailable in Electron | M | M | Transient media permission or Win32 MMDevice enumeration | S-3 |
| R-04 | Display-removal race or mixed-DPI bounds drift puts Stage on the wrong screen | M | H | Hide on event; verify and re-apply bounds; INV-1 test in hardware matrix | S-4 |
| R-05 | Cursor clip persists after a crash or fights other apps | L | M | Release on all exit paths; startup self-release; hotkey/toggle to disable | S-4 |
| R-06 | Stage capture incomplete for webview/mirror or too heavy | M | M | Poll `capturePage` fallback; lower fps/size | S-2 |
| R-07 | Codec/seek problems (HEVC, Range via custom protocol) | M | M | Probe at import; reject unsupported; `file://` fallback | S-5 |
| R-08 | Embeds behave badly (login walls, frame-busting, autoplay) | M | L | Preroll gate + timeout; normalization; "mirror a browser" workaround | S-6 |
| R-09 | **Main-process crash leaves the projector showing the desktop** | L | H | Operator checklist: solid black wallpaper on the projector display; extend mode; optional external watchdog (P2) | n/a |
| R-10 | PowerPoint Presenter View grabs the Stage display itself | H | M | In-app help text + checklist; document in UX_SPEC §4 | n/a |
| R-11 | Scope creep / solo schedule | H | M | P0-first milestones; PRD change control; spikes time-boxed | n/a |
| R-12 | Projector quirks (resolution renegotiation, sleep, overscan) | M | M | Handle `display-metrics-changed`; hardware matrix on multiple projectors | S-4 |
| R-13 | OS notifications, Focus Assist, update reboots during an event | M | M | Event-day checklist (Do Not Disturb, pause updates, power plan) | n/a |
| R-14 | Unsigned app trips SmartScreen/AV on borrowed machines | M | L | Portable build; signing later | n/a |
| R-15 | Large scene files make save/open slow | M | L | 2 GB soft limit; progress UI; later: serve ranges from the zip | S-5 |
