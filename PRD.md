# PRD: umveil v1.0

| | |
|---|---|
| Version | 0.1 (2026-10-02) |
| Status | Draft for build; open questions in §10 have defaults so work can start |
| Platform | Windows 10 (2004 / build 19041+) and Windows 11, x64 |

## 1. Summary

umveil is a two-window live-event display controller. The operator drives a **Cockpit** dashboard on the laptop screen; the audience sees a borderless **Stage** on the secondary display (typically an HDMI projector). The operator pushes images, videos, web embeds, or a live mirror of another application (e.g. PowerPoint) to the Stage, and can kill, freeze, or recover the feed without anything unplanned reaching the audience.

## 2. Problem

At college events the operator's laptop is mirrored or extended to a projector of unknown quality. Typical failures: the operator's desktop, notifications, or a stray window appear on the big screen; unplugging HDMI drags a fullscreen video onto the laptop; audio plays from laptop speakers instead of the hall system; videos stretch on 4:3 projectors; switching between a video, a poll, and slides means fumbling with tabs. umveil removes these failure modes by making the audience view a separate, controlled surface.

## 3. Users

| Persona | Needs |
|---|---|
| **Operator** (primary): student volunteer or AV lead running a fest, seminar, or ceremony from one laptop | Fast, obvious controls; certainty about what the audience sees; instant panic button; recoverable from cable/app mishaps; reusable scenes for recurring events |
| **Audience** (indirect) | Sees only clean content, correct aspect ratio, correct audio |

## 4. Goals and non-goals

**Goals (v1)**
1. Operator UI and audience output are physically separate windows (INV-1, INV-2).
2. Every failure ends in a safe, recoverable state (black/slate, paused, muted) with a clear Cockpit alert.
3. One-click content switching across images, videos, web embeds, and live app mirroring, with consistent transitions.
4. Reusable, portable scene files.
5. Fully usable offline, except web embeds.

**Non-goals (v1)**
- Not a streaming/recording tool (no OBS replacement, no recording, no NDI/RTMP).
- Single Stage output only (no multi-projector walls).
- No slide authoring, timelines, cue lists, or audio mixing.
- No remote control (phone/web), no cloud, no accounts.
- No macOS/Linux. No DRM-protected content (it renders black when captured).
- No operator interaction *inside* a web embed (see FR-10).
- Does not change Windows display mode (Extend/Duplicate); it detects and guides.

## 5. Principles and invariants

**Principles:** (1) Never expose the operator. (2) Failure goes to safe, never to random. (3) One huge control for the worst moment. (4) Local-first. (5) Predictable: no surprise autoplay. (6) Honest about limits (see guarantee levels below).

**Invariants.** These must hold in every state; each has a test in `TEST_PLAN.md`.

| ID | Invariant |
|---|---|
| INV-1 | The Stage window is never shown on the Cockpit's display. |
| INV-2 | The Stage never contains operator UI, dialogs, or the Return overlay. |
| INV-3 | Kill always works: soft path in the Stage renderer, hard fallback from the main process. |
| INV-4 | umveil-managed audio plays only through the selected output. If that output is unavailable, the audio is muted, never rerouted to the default device. |
| INV-5 | The main process owns all state; renderers are views. |
| INV-6 | Content is shown on the Stage only after it is ready (preroll gate). Load failure leaves the Stage unchanged. |
| INV-7 | After a display disconnect, nothing auto-resumes; the operator confirms. |
| INV-8 | Cursor confinement is released on Stop Scene, toggle-off, and app exit. |

**Guarantee levels (what "managed audio" covers)**

| Content kind | Kill hides picture | Kill mutes audio | Audio goes to selected output |
|---|---|---|---|
| Image | Yes | n/a | n/a |
| Video played by umveil | Yes | **Guaranteed** | **Guaranteed** (per-element sink) |
| Web embed | Yes | Yes (page-level mute) | **Best effort** (validated in spike S-3) |
| App mirror | Yes (picture) | **Not managed in v1** | **Not managed in v1** |

For app mirrors, the app's audio is outside umveil. Workaround: Windows Settings > Volume mixer, assign the app's output device. Per-app audio session control is a v1.1 candidate.

## 6. Functional requirements

Priority: **P0** = required for v1.0; **P1** = should have in v1.0; **P2** = later. Items marked **(+)** are additions beyond the original brief, included because the brief's features depend on them or because they protect the "zero-embarrassment" goal.

### A. Core workflow

**FR-01 Scene files (P0)**
- New, Open, Save, Save As for `.umveil` files; Open via dialog, double-click, or drag onto the Cockpit.
- A scene retains: media (copied into the file), web embed URLs, app targets, transition settings, slate (black/logo + logo image), audio output preference, Stage display hint, Hide Mouse setting, item order.
- Acceptance:
  - Save, close, reopen: bin and settings are identical.
  - Opening on a machine with different displays or audio devices succeeds and flags unresolved preferences (no crash).
  - Corrupt file, or `schemaVersion` newer than supported: clear error, app state unchanged, file untouched.
  - Save is atomic: a crash mid-save leaves the previous file intact.

**FR-02 Unsaved-changes guard and autosave recovery (P1) (+)**
- Dirty indicator in the title bar; prompt on close/open/new when dirty.
- While dirty, write a recovery file every 60 s (never overwriting the user's file); offer recovery after an unclean exit.

**FR-03 Start / Stop Scene (P0)**
- **Start Scene** runs the preflight (FR-04), then creates and shows the Stage on the chosen display with the slate as content, without taking focus from the Cockpit. While live, display sleep is prevented.
- **Stop Scene** hides the Stage, stops playback, releases cursor confinement and the sleep block.
- Acceptance: Stage visible fullscreen on the secondary display within 1.5 s of Start; Cockpit keeps focus; Start is blocked with an explanation when no valid second display exists; Stop removes the Stage completely.

**FR-04 Preflight check (P0) (+)**
Runs on Start Scene and on demand.

| Check | Result if failed |
|---|---|
| At least two displays, in Extend mode (not duplicated) | **Block**: "Windows is mirroring or has one display. Press Win+P and choose Extend." |
| Chosen Stage display is not the Cockpit's display | **Block** |
| Audio output selected and present | **Warn** (muted until fixed) |
| All scene assets present and decodable | **Warn** per missing item |

**FR-05 Kill Switch (P0)**
- Large, high-contrast control always visible in the Cockpit header.
- **Kill**: instantly (no transition) covers the Stage with the curtain (black or logo per scene slate), mutes all managed audio, and pauses video.
- **Restore** (same control, relabeled): removes the curtain with the scene transition; video stays paused until the operator presses Play; audio unmuted. Restore is ignored for 750 ms after Kill to absorb double-clicks.
- Kill during a transition cancels it. Kill state lives in the main process and survives a Cockpit reload.
- While killed, pushed items load paused underneath the curtain.
- Acceptance: p95 input-to-black latency ≤ 100 ms (NF-01); with the Stage renderer deliberately hung, the hard path engages within 250 ms (M-6).

**FR-06 Display disconnect fallback (P0)**
- On Stage display removal or the display mode collapsing to a single display: hide the Stage window *immediately* (so it never relocates to the Cockpit's display), pause media, hold state.
- Cockpit shows a persistent non-modal banner: "Stage display disconnected. Playback paused."; push controls are disabled; the Cockpit stays fully usable.
- When a valid display returns: banner offers "Resume". On Resume the Stage reappears showing the slate; the previously live item is offered as one-click "Restore last live". Never auto-resumes (INV-7).
- Acceptance: unplug during video: audio stops, nothing fullscreen appears on the laptop, Cockpit does not crash; replug: banner, no automatic playback.

### B. Media, audio, web

**FR-07 Asset Bin and import (P0)**
- Right-hand panel with tabs **Media | Web | Apps**. Media tab: thumbnails of imported photos/videos (video shows a poster frame and duration). Import by button or drag-and-drop.
- **Clicking a thumbnail pushes it to the Stage** (single click). The tile shows states: idle / loading / live / error.
- Supported: JPEG, PNG, WebP, GIF, AVIF; MP4 (H.264 + AAC), WebM (VP8/VP9/AV1 + Opus/Vorbis). Anything else is probe-tested at import and rejected with a reason if it cannot be decoded (e.g. some MOV/HEVC).
- Warn for files over 2 GB (v1 soft limit per scene).
- Removing a live item asks for confirmation.

**FR-08 Video playback controls (P0) (+)**
- Play/pause, restart, seek bar, loop toggle, volume (0-100%). Per-item defaults: autoplay on, loop off, volume 100.
- Autoplay occurs only when the Stage is visibly live (not killed, not frozen); otherwise the video loads paused.
- A video that ends holds its last frame (no auto-switch to slate unless loop is on).

**FR-09 Audio output routing (P0)**
- Dropdown of audio output devices; selection forces all managed audio to that device (typically the HDMI output).
- A **Test tone** button plays a short tone through the Stage output.
- Preflight warns if no device is chosen. If the chosen device disappears: managed audio is muted and an alert is raised (INV-4); it never falls back to the default device.
- Device preference is saved in the scene by label and id; on another machine it is matched by label, else flagged.

**FR-10 Clean web embeds (P0)**
- Paste a URL into the Web tab to create an embed item. Only `http` and `https` are accepted (`https` preferred; `http` shows an "insecure" badge). YouTube URLs (`watch`, `youtu.be`, `shorts`) are normalized to the clean `/embed/` player with autoplay.
- Embeds render fullscreen in the Stage's 16:9 canvas with no browser chrome, tabs, address bar, or popups; permission prompts (camera, mic, location, notifications) are denied.
- Preroll gate: the page loads in the hidden layer; if it fails or takes longer than 8 s the Stage stays on the current content and the Cockpit shows the error.
- Controls: Reload embed; Mute embed. **Out of scope v1:** operator interaction inside the embed (use an app mirror of a normal browser instead).

**FR-11 Aspect ratio enforcer (P0)**
- The Stage always renders a 16:9 canvas, scaled uniformly to fit the display and centered, with black bars (letterbox/pillarbox) elsewhere. Media uses `contain` fit inside the canvas. Nothing is ever stretched.
- Acceptance: correct on 1024x768 (4:3), 1280x800 (16:10), 1920x1080, 3840x2160, and an ultra-wide; a 4:3 photo is pillarboxed inside the 16:9 canvas.

### C. Advanced Stage controls

**FR-12 App Switcher and mirroring (P0)**
- The Apps tab opens a visual grid of running top-level windows (thumbnail, title, icon), refreshed every 2 s while open. umveil's own windows and system shell windows are excluded.
- Selecting a window mirrors it live on the Stage (letterboxed, through the scene transition, preroll-gated) and brings that window to the front of the laptop so the operator can drive it. The app is not moved or modified.
- The selection can be pinned as an **app target** (process name + title hint) saved in the scene; pinned targets appear in the Apps tab, greyed out when not running. umveil never launches processes.
- If the mirrored window is closed or minimized, the Stage returns to the slate and the Cockpit raises an alert (no frozen or garbage frame left on the Stage).
- Acceptance: mirrored PowerPoint slideshow appears within 1 s; slide changes on the laptop appear on the Stage at ≥ 15 fps; DRM content appears black (documented limitation).
- Operator note (UX_SPEC): run slideshows on the laptop display (uncheck Presenter View / choose the primary monitor), otherwise PowerPoint will grab the Stage display itself.

**FR-13 Return overlay (P0)**
- While an app is mirrored, a small always-on-top button ("Return to umveil") appears on the Cockpit's display only. It is excluded from screen capture by OS display affinity and never positioned on the Stage's display (INV-1, INV-2).
- Click: brings the Cockpit to the foreground and switches the Stage to the slate using the scene transition (default; avoids exposing an app's editing view). The setting "Return target" may be changed to "Keep current".

**FR-14 Confidence monitor (P0)**
- A live 16:9 preview in the Cockpit of what the Stage is *actually* displaying (captured from the real Stage window, not a re-render), ~15 fps, muted, ≤ 500 ms latency.
- Shows state chips (LIVE / KILLED / FROZEN / DETACHED / OFFLINE), the live item name, and video position. A colored border reflects the state. When the Stage is not running: "Stage offline" placeholder.

**FR-15 Freeze (P0)**
- Toggle captures the Stage's current frame and holds it above the content (below the curtain). Content changes underneath; unfreezing reveals the current content with the scene transition.
- Freezes the picture only; audio continues unless the operator mutes or kills. Kill overrides Freeze. Freeze state is visible in the Cockpit and the confidence monitor.
- Acceptance: the held frame matches what was visible at press time (within ~100 ms); toggling Freeze never changes the audio.

**FR-16 Hide Mouse / cursor lock (P0)**
- The cursor is never rendered inside the Stage window.
- **Hide Mouse** (default on, saved in the scene) confines the system cursor to the Cockpit's display so it cannot cross onto the projector. It is re-applied after display changes and system resume, and released per INV-8.

**FR-17 Global transitions (P0)**
- Types: **cut**, **crossfade** (default crossfade, 400 ms; duration 0-2000 ms in 100 ms steps), saved per scene.
- Applied to: media pushes, embeds, app switches, Return-to-slate, Restore, Unfreeze. Not applied to: Kill, Freeze, disconnect (always instant).
- Managed audio crossfades over the same duration; unmanaged audio (embeds, apps) switches immediately.
- A newer push supersedes an in-flight one (latest wins).

### D. Operational extras

**FR-18 Global hotkeys (P1) (+)**
- System-wide shortcuts that work even when another app has focus: Kill/Restore `Ctrl+Alt+K`, Freeze `Ctrl+Alt+F`, Return `Ctrl+Alt+R` (rebinding is P2). If registration fails the Cockpit warns.

**FR-19 Diagnostic log (P1) (+)**
- JSON-lines log in `%APPDATA%\umveil\logs` (5 files x 2 MB, rotating) recording state changes, display and audio events, kills, and errors. "Copy diagnostics" button in the Cockpit. No media content and no URL query strings in logs.

## 7. Non-functional requirements

| ID | Requirement | Target |
|---|---|---|
| NF-01 | Kill latency (input to curtain presented, software-measured) | Soft path p95 ≤ 100 ms; hard path ≤ 250 ms |
| NF-02 | Stage hidden after OS display-removed event | ≤ 500 ms |
| NF-03 | Responsiveness | UI feedback ≤ 100 ms; image push visible ≤ 300 ms; local 1080p H.264 video starts ≤ 500 ms |
| NF-04 | Cold start to usable Cockpit | ≤ 5 s on an 8 GB RAM laptop |
| NF-05 | Stability | 4-hour live soak: no crash; RSS growth ≤ 20% after warm-up |
| NF-06 | Platform | Windows 10 build 19041+ and Windows 11, x64 |
| NF-07 | Offline | Everything except web embeds works with no network |
| NF-08 | Security | Renderer isolation, sandboxing, IPC validation, no remote code in privileged contexts (ARCHITECTURE §11) |
| NF-09 | Distribution | Portable `.exe` (no admin rights needed) plus installer |
| NF-10 | Operator legibility | Kill control contrast ≥ 7:1; all primary actions keyboard-reachable; no blocking modal dialogs while the Stage is live (except OS file pickers) |

## 8. Traceability: original brief to requirements

| Brief item | Requirement(s) |
|---|---|
| Scene Persistence (`.umveil` files) | FR-01 (+FR-02) |
| Start Scene button | FR-03 (+FR-04) |
| Kill Switch (black or logo, mute all audio) | FR-05 |
| Cable Disconnect Fallback | FR-06 |
| Asset Bin & Uploads | FR-07 (+FR-08) |
| Independent Audio Routing | FR-09 |
| Clean Web Embeds | FR-10 |
| Aspect Ratio Enforcer | FR-11 |
| App Switcher & Return Overlay | FR-12, FR-13 |
| Confidence Monitor & Freeze | FR-14, FR-15 |
| Cursor Lock (Hide Mouse) | FR-16 |
| Global transitions | FR-17 |
| (additions) | FR-02, FR-04, FR-08, FR-18, FR-19 |

## 9. Assumptions

| ID | Assumption |
|---|---|
| A1 | Operators use Windows laptops; v1 is Windows-only. |
| A2 | The projector is connected as an extended display; umveil detects but does not change the display mode. |
| A3 | One Stage output. |
| A4 | For app mirroring, the operator drives the external app on the laptop; umveil mirrors it. |
| A5 | Internet is available at the event only if web embeds are used. |
| A6 | Single local operator; no network control. |
| A7 | Content is not DRM-protected. |
| A8 | Development and testing happen on a Windows host with at least one external display or HDMI/TV. |

## 10. Open questions (defaults let work start now)

| ID | Question | Default used in these docs |
|---|---|---|
| Q1 | Is Windows-only acceptable for v1? | Yes (A1) |
| Q2 | App mirroring by live capture vs moving the real window to the Stage display? | Capture (ADR-005), confirmed or reversed by spike S-1 |
| Q3 | Should Freeze also hold audio? | No: picture only |
| Q4 | What should Return do to the Stage? | Switch to slate (configurable) |
| Q5 | After Restore, should video resume? | No: stays paused |
| Q6 | Hide Mouse default? | On |
| Q7 | Must mirrored-app audio route to HDMI in v1? | No: unmanaged, documented workaround |
| Q8 | Code signing? | Unsigned in v1 (SmartScreen warning expected); revisit |

## 11. Success criteria

1. Dress-rehearsal checklist (`TEST_PLAN.md` §7) passes on two different projectors/displays.
2. All INV-1..INV-8 tests pass; all FR acceptance criteria pass.
3. 4-hour soak passes (NF-05).
4. Usability: three people who have never seen umveil complete the "run a 5-item scene with a kill and a recovery" task in under 10 minutes with no help.
