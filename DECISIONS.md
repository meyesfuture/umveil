# Decision log (ADRs)

Status values: **Accepted** (settled by the requirements), **Proposed** (my recommendation; confirm), **Spike-gated** (provisional until the named spike reports; record the outcome under "Outcome").

| ADR | Decision | Status |
|---|---|---|
| 001 | Electron + TypeScript | Proposed |
| 002 | Windows-only v1 | Accepted |
| 003 | Main process owns all state | Accepted |
| 004 | Frameless non-focusable Stage at display bounds | Accepted (validated in S-4) |
| 005 | App mirroring by window capture | Spike-gated (S-1) |
| 006 | Confidence monitor from real Stage capture | Spike-gated (S-2) |
| 007 | Two-tier Kill | Accepted |
| 008 | Embeds in `<webview>` | Spike-gated (S-3, S-6) |
| 009 | `.umveil` = ZIP (stored) with `scene.json` + `media/` | Accepted |
| 010 | Fixed 16:9 logical canvas, contain-fit | Accepted |
| 011 | React for Cockpit, vanilla TS for Stage/Overlay, electron-vite | Proposed |
| 012 | zod validation at every boundary | Accepted |
| 013 | Portable + NSIS via electron-builder, unsigned in v1 | Proposed |
| 014 | Vitest + Playwright (Electron) + manual hardware matrix | Proposed |

---

## ADR-001: Electron + TypeScript
**Context.** umveil needs multi-window control across displays, display add/remove events, media playback with per-element audio sinks, window capture, a controllable embedded browser, and a global-shortcut API, all on Windows.
**Decision.** Electron with TypeScript. Win32 calls (cursor clip, window to process mapping, foreground control) go through `koffi` (FFI, no compile step) behind `Win32Bridge`.
**Alternatives.**
- *Native C/C++ + Win32 + WebView2 + Media Foundation:* maximum control and footprint, but display management, capture, media decoding, audio sinks, and embeds must each be built by hand. Several times the effort; poor fit for a v1 deadline. The `Win32Bridge` boundary leaves room to move hot spots into a native N-API C addon later.
- *Tauri (WebView2):* smaller footprint, but no equivalent of `desktopCapturer` or Chromium's per-element audio sink, and multi-window display control is less mature.
**Consequences.** ~150 MB+ install, Chromium memory use; fastest path to every required capability. Requires a Windows host for development (CLAUDE.md).
**Why "Proposed".** This is the biggest foundation choice. Confirm it before M-0 ends. Spike results (S-1..S-6) can still overturn it.

## ADR-002: Windows-only v1
Events in scope use Windows laptops; per-OS cursor confinement, window mapping, and capture quirks would triple the QA surface. Revisit after v1.

## ADR-003: Main process owns all state
A single reducer in the main process produces revisioned snapshots; renderers send commands and render snapshots. This keeps Kill state across Cockpit reloads, lets the Stage be rebuilt after a crash (`stage:sync`), and makes invariants testable in pure code (INV-5).

## ADR-004: Stage = frameless, non-focusable window at display bounds
`focusable: false` + `showInactive()` prevents focus theft from the Cockpit and keeps the Stage out of Alt-Tab/taskbar. Using window bounds instead of OS fullscreen avoids Windows fullscreen transitions and multi-monitor relocation. Always-on-top at `screen-saver` level covers the secondary display's taskbar.

## ADR-005: App mirroring by window capture
**Context.** The brief: select a running app (e.g. PowerPoint), it appears on the Stage, an operator-only Return button gets back to the Cockpit.
**Decision.** Capture the selected window as a `MediaStream` and render it in a Stage layer. The app stays on the laptop where the operator drives it; the Return overlay lives on the laptop display.
**Why.** All Stage invariants (Kill, Freeze, transitions, letterbox, disconnect handling) stay in one compositor. Moving a foreign window onto the Stage display would bypass all of them, and apps like PowerPoint choose their own display.
**Alternative (fallback if S-1 says no-go).** Move/resize the real window onto the Stage display with `SetWindowPos` through `Win32Bridge`; Kill/Freeze would then need the blackout window and a captured still.
**Risks.** Capture of occluded/minimized/elevated/DRM windows (R-01). **Outcome:** _pending S-1_.

## ADR-006: Confidence monitor from real Stage capture
A re-render of Cockpit state could show something different from what the projector shows. Capturing the actual Stage window guarantees fidelity (including mirrors and embeds). Fallback: poll `capturePage()` at ~5 fps. **Outcome:** _pending S-2_.

## ADR-007: Two-tier Kill
**Soft path:** Stage DOM curtain (0-frame latency, can crossfade the logo). **Hard path:** main-process-level `setAudioMuted` on all Stage WebContents immediately, plus, if the Stage does not ack within 150 ms, a pre-created black failsafe window over the Stage display. Rationale: a hung renderer must not defeat the panic button (INV-3). Audio mute (main-level) ships in M-1; the blackout window ships in M-6.

## ADR-008: Embeds in `<webview>`
**Context.** Slido, YouTube, etc. must show cleanly, and the Kill curtain must always be able to cover them.
**Decision.** Use `<webview>` with partition `persist:umveil-embeds`.
**Why.**
- A webview guest is its own top-level browsing context, so `X-Frame-Options`/`frame-ancestors` restrictions that block iframes do not apply.
- It is a DOM element in the Stage, so CSS layering (curtain, freeze, crossfade) works. A native `WebContentsView` sits above all DOM and would defeat the curtain and crossfades.
**Costs.** Electron discourages `<webview>` ("may be changed in the future"), audio sink routing needs a guest preload (S-3).
**Fallback.** `WebContentsView` managed from main, with curtain implemented as a second top-most view, accepting no CSS crossfade for embeds. **Outcome:** _pending S-3/S-6_.

## ADR-009: `.umveil` is a ZIP (STORE) with `scene.json` + `media/`
Single portable file; media is copied in at import so a scene survives moving between laptops. STORE (no compression) because photo/video formats are already compressed and it keeps writes fast. On open, media is extracted to a per-scene cache (`%LOCALAPPDATA%\umveil\cache\<sceneId>`), deduplicated by SHA-256. Alternative considered: a folder bundle (awkward file association and sharing) and path-referencing JSON (breaks on every other laptop). Future optimization: serve ranges straight from the archive to skip extraction. Details: `SCENE_FORMAT.md`.

## ADR-010: Fixed 16:9 logical canvas, contain-fit
One rule for all content: a 16:9 canvas fitted to the display, bars elsewhere. Predictable on 4:3/16:10/ultra-wide projectors; no per-item stretch modes in v1. A "fill/crop" mode is a possible P2.

## ADR-011: React (Cockpit) + vanilla TS (Stage/Overlay) + electron-vite
The Cockpit is a state-driven dashboard (React fits). The Stage and Overlay must stay tiny and predictable (no framework). `electron-vite` gives one config for main, preload, and the three renderer pages; replaceable with plain Vite + esbuild if it gets in the way.

## ADR-012: zod validation everywhere
Validate every IPC payload in main and every scene file on load. The same schemas generate the TypeScript types, preventing drift between `IPC_CONTRACT.md`, `SCENE_FORMAT.md`, and code.

## ADR-013: Distribution
`electron-builder`: a **portable** `.exe` (runs on borrowed laptops without admin rights) and an **NSIS** installer (needed for `.umveil` file association). Unsigned in v1 (SmartScreen warning); signing is a later decision (PRD Q8).

## ADR-014: Testing strategy
Vitest for pure logic (reducer, schema, URL normalizer); Playwright's Electron support for integration/e2e on one display; a manual hardware matrix and failure drills for everything involving real displays, projectors, audio devices, and cables (`TEST_PLAN.md`).

---

## Spike outcomes (fill in as spikes complete)

| Spike | Date | Result | ADR impact |
|---|---|---|---|
| S-1 | | | ADR-005 |
| S-2 | | | ADR-006 |
| S-3 | | | ADR-008, FR-09, FR-10 |
| S-4 | | | ADR-004, FR-06, FR-16 |
| S-5 | | | FR-07, FR-08 |
| S-6 | | | ADR-008, FR-10 |
