# UX specification

Implements the operator-facing behavior of `PRD.md`. Visual styling is deliberately minimal: dark, high-contrast, legible from arm's length in a dim hall.

## 1. Principles

1. **State is always visible.** The operator can tell at a glance: Stage running or not, what is live, killed/frozen, audio output OK.
2. **The panic button is the biggest, most contrasting thing on screen** and never moves.
3. **No blocking modals while the Stage is live** (NF-10). Problems appear as inline banners. Only OS file pickers and the unsaved-changes prompt (when not live) are modal.
4. **Destructive or audience-visible actions are one click; accidental ones are guarded** (Restore lockout, remove-live confirmation).
5. Plain language, no jargon: "Stage" and "Cockpit" are the only product terms.

## 2. Cockpit layout

```text
┌────────────────────────────────────────────────────────────────────────────────────┐
│ umveil · Fest Opening.umveil *      [ ▶ Start Scene ]            [ ■  KILL STAGE ] │  header
├────────────────────────────────────────────────────────┬───────────────────────────┤
│  [banner area: alerts, e.g. "Stage display disconnected"]                           │
├────────────────────────────────────────────────────────┬───────────────────────────┤
│  CONFIDENCE MONITOR   (what the audience sees)         │  ASSET BIN                │
│  ┌──────────────────────────────────────────────────┐  │  [ Media | Web | Apps ]   │
│  │                                                  │  │  ┌─────┐ ┌─────┐ ┌─────┐  │
│  │                16:9 live preview                 │  │  │ img │ │ vid │ │ ... │  │
│  │                                                  │  │  └─────┘ └─────┘ └─────┘  │
│  └──────────────────────────────────────────────────┘  │                           │
│  [LIVE]  Now showing: Opening reel         00:12 / 1:32│  [ + Import media ]       │
│  ▶/❚❚  ⟲ restart  ──────●──────────  Loop ☐  Vol ▮▮▮▯ │  [ + Paste web URL ]      │
│                                                         │  [ Open App Switcher ]   │
├────────────────────────────────────────────────────────┴───────────────────────────┤
│ Freeze ☐   Hide Mouse ☑   Transition [Crossfade ▾] [400 ms]   Audio out [HDMI ▾][♪]│  control bar
├─────────────────────────────────────────────────────────────────────────────────────┤
│ Stage: Display 2 (1920x1080) · Audio: HDMI OK · Hotkeys: Kill Ctrl+Alt+K            │  status bar
└─────────────────────────────────────────────────────────────────────────────────────┘
```

| Region | Content | Requirement |
|---|---|---|
| Header | Scene name + dirty `*`; **Start Scene / Stop Scene**; **KILL STAGE / RESTORE STAGE** (right, large) | FR-01, 03, 05 |
| Banner area | Stacked non-modal alerts (§5) | FR-06, all alerts |
| Confidence monitor | Live preview, state chips, now-showing, playback controls (only for video) | FR-14, 08 |
| Asset Bin | Tabs Media / Web / Apps; tiles; import / paste / App Switcher | FR-07, 10, 12 |
| Control bar | Freeze, Hide Mouse, transition type + duration, audio output + test tone | FR-15, 16, 17, 09 |
| Status bar | Stage display, audio status, hotkey status | FR-04, 18 |

## 3. Components and states

### 3.1 Kill control
| State | Label | Style | Behavior |
|---|---|---|---|
| Normal | `■ KILL STAGE` | Solid red, white text, contrast ≥ 7:1, min 56 px tall | One click kills |
| Killed | `▶ RESTORE STAGE` | Solid green, dark text | Disabled for 750 ms after kill (shows a brief fill animation), then one click restores |
| Stage stopped | `■ KILL STAGE` (dimmed) | Still enabled; records the flag so a later Start begins killed | |
| Detached | Normal | Stage is hidden anyway | |

### 3.2 Start / Stop
`▶ Start Scene` (primary) becomes `■ Stop Scene` while live. Start shows the preflight result inline (§3.6) and starts when there are no blocks; warnings need one extra click ("Start anyway").

### 3.3 Confidence monitor
- Border color by state: live = green, killed = red, frozen = blue, detached = amber, offline = grey.
- Chips (can combine): `LIVE`, `KILLED`, `FROZEN`, `DETACHED`, `OFFLINE`.
- Offline placeholder: "Stage offline. Press Start Scene."
- Playback controls appear only when content is a video; embed shows `Reload` and `Mute`.
- The preview never plays audio.

### 3.4 Asset tile (Media / Web / Apps)
| State | Look |
|---|---|
| Idle | Thumbnail + name |
| Loading | Spinner overlay (preroll in progress) |
| Live | Green outline + `LIVE` badge |
| Error | Red outline + icon; tooltip with reason (decode error, load failed, missing file) |
| Disabled | Dimmed when the Stage is detached or stopped (push needs `live`) |

A single click pushes. Right-click or a `⋯` menu: Rename, Playback defaults (video), Remove. Removing the live item asks for confirmation.

### 3.5 App Switcher
Grid of window thumbnails (320x180) with icon and title, refreshed every 2 s while open; minimized windows are marked "Minimized (restore it first)". Pin icon on each card saves an app target. Pinned targets appear in the Apps tab, greyed when not running. Selecting a card mirrors it, brings it to front, and shows the Return overlay.

### 3.6 Preflight result (inline panel on Start)
| Icon | Check | Example text |
|---|---|---|
| ✔ / ⚠ / ✖ | Displays | `✖ Windows is mirroring or has one display. Press Win+P and choose Extend.` |
| | Stage display | `✖ Stage display is the same as this screen. Pick another display.` |
| | Audio | `⚠ No audio output chosen. Audio will be muted until you pick one.` |
| | Assets | `⚠ 2 files are missing: intro.mp4, logo.png` |

### 3.7 Return overlay
- ~180x44 px, text `◀ Return to umveil`, high-contrast, top-center of the Cockpit's display, always on top, shown only while an app is mirrored.
- Excluded from capture by OS display affinity; never placed on the Stage's display.

## 4. Operator flows

**Before the event (setup)**
1. Open or create a scene → import media, paste URLs, pin apps → set transition, slate (black/logo), audio output.
2. Connect the projector, press Win+P, choose **Extend**. Save the scene.
3. Press **Start Scene** → resolve preflight → check the Stage and the audio with **Test tone**.

**During the event**
- Click tiles to switch content. Watch the confidence monitor.
- App slides: open the App Switcher, select PowerPoint. Drive the slideshow on the laptop. When done, click **Return to umveil** (Stage goes to the slate).
- Something looks wrong: **KILL** (or `Ctrl+Alt+K`). Fix. **RESTORE**.
- An app misbehaves while it is on stage: **Freeze** to hold the picture while fixing it in the background, then unfreeze.

**Recovery**
- *Cable unplugged:* banner appears, Stage vanishes from the projector and nothing appears on the laptop. Re-seat the cable → banner offers **Resume** → Stage returns on the slate → optionally **Restore last live**.
- *Wrong audio device:* alert, audio muted; pick the right device and use Test tone.

**PowerPoint tip (shown in the App Switcher help text):** In PowerPoint, Slide Show > Set Up Slide Show: "Browsed by an individual (window)" or choose the *primary* monitor and untick *Use Presenter View*. Otherwise PowerPoint will take over the projector display directly.

## 5. Alerts and copy

Banners are non-modal, stacked, with an action button and dismiss (sticky ones clear when the condition clears).

| Code | Level | Text | Action |
|---|---|---|---|
| `DISPLAY_LOST` | error, sticky | Stage display disconnected. Playback paused. | none |
| `DISPLAY_AVAILABLE` | warn, sticky | A display is available again. | **Resume** |
| `AUDIO_OUTPUT_MISSING` | error, sticky | Audio device "{label}" is not available. Audio is muted. | Pick device |
| `AUDIO_OUTPUT_UNSET` | warn | No audio output selected. Audio is muted. | Pick device |
| `EMBED_LOAD_FAILED` | warn | Couldn't load "{name}". Stage is unchanged. | Retry |
| `MEDIA_DECODE_ERROR` | warn | "{name}" can't be played. Stage is unchanged. | none |
| `APP_WINDOW_LOST` | error | "{title}" was closed or minimized. Stage returned to the slate. | Open App Switcher |
| `STAGE_RENDERER_CRASHED` | error | Stage recovered from an error and is blacked out. | **Restore** |
| `SCENE_LOAD_FAILED` | error | This file can't be opened: {reason}. | none |
| `SCENE_SAVE_FAILED` | error | Couldn't save. Your previous file is untouched. | Retry |
| `ASSET_MISSING` | warn | {n} file(s) are missing from this scene. | Show |
| `HOTKEY_REGISTRATION_FAILED` | warn | Hotkey {keys} is used by another app. Use the on-screen button. | none |
| `CURSOR_LOCK_FAILED` | warn | Couldn't confine the mouse to this screen. | Retry |

## 6. Hotkeys (P1, global; rebinding is P2)

| Action | Keys |
|---|---|
| Kill / Restore | `Ctrl+Alt+K` |
| Freeze / Unfreeze | `Ctrl+Alt+F` |
| Return to umveil | `Ctrl+Alt+R` |

In-app (Cockpit focused): `Space` play/pause video; `Esc` does **not** kill (avoid accidental triggers).

## 7. Stage visuals

- Background black; cursor never shown; no window chrome; never any text, borders, or watermarks.
- Slate: black, or the logo centered, `contain`-fit, on black.
- Letterbox bars are black.
- Stage never shows loading spinners; loading is only indicated on the Cockpit (INV-6).

## 8. Accessibility and legibility

- All primary actions keyboard-reachable with visible focus; Kill contrast ≥ 7:1.
- State is never conveyed by color alone (chips and labels accompany colors).
- Minimum UI font 14 px; operator-controlled UI scale in settings (P2).

## 9. First-run and empty states

| Situation | Message |
|---|---|
| First launch | "Create a scene, add media, then press Start Scene." with `New scene` / `Open scene` |
| Empty Media tab | "Drop photos and videos here, or click Import." |
| Empty Web tab | "Paste a link (Slido, YouTube, a web page)." |
| Empty Apps tab | "Open the App Switcher to mirror a running app." |
| No second display | Start disabled with the Win+P message |
