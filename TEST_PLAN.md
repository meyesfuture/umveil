# Test plan

Goal: prove the invariants (PRD §5) and acceptance criteria (PRD §6), and rehearse failure. Real displays, audio devices, and cables cannot be faked, so this plan pairs automation with a hardware matrix and failure drills.

## 1. Strategy

| Layer | Tooling | Covers |
|---|---|---|
| **Unit** | Vitest | Reducer (state transitions, Kill lockout, preconditions), scene schema + migrations + referential integrity, embed URL validation/normalization, zip-slip guard, transition supersede logic, preflight evaluation |
| **Integration / e2e** | Playwright (Electron) on a dev machine | IPC contract (sender checks, validation), scene save/open round-trip, push flow with preroll, Kill/Freeze flags, Cockpit reload rehydration, Stage crash recovery (`stage:sync`) |
| **Manual: hardware matrix** | Real projector/TV, real cable | Anything involving displays, DPI, audio devices, capture, cursor |
| **Failure drills** | Physically perform failures | §6 |
| **Soak** | 4-hour run | NF-05 |

Automation runs without a second display where possible (mock `DisplayService`); anything that needs one is marked **HW**.

## 2. Unit and integration test list (automated)

| ID | Test | Covers |
|---|---|---|
| U-01 | Reducer: Kill sets flag and clears pending transition; Restore before 750 ms returns `E_LOCKOUT`; after returns ok | FR-05 |
| U-02 | Reducer: `display-removed` moves `live` to `detached`, pauses video, sets `managedMuted`; never to `live` without `stage:resume` | FR-06, INV-7 |
| U-03 | Reducer: pushes while killed/frozen produce `autoplay: false` | FR-08 |
| U-04 | Preconditions table (IPC_CONTRACT §4) for every command | INV-5 |
| U-05 | Scene schema: valid file passes; each required-field removal fails; newer `schemaVersion` yields `E_SCENE_TOO_NEW`; orphan asset dropped; duplicate ids rejected | FR-01 |
| U-06 | Zip-slip: entries like `../x`, `media/../../x`, absolute paths are never extracted | SCENE_FORMAT §5 |
| U-07 | URL normalizer: `watch?v=`, `youtu.be/`, `shorts/` become `/embed/` URLs; `javascript:`, `data:`, `file:` rejected; `http` flagged insecure | FR-10 |
| U-08 | Atomic save: simulated failure mid-write leaves original intact and removes `.tmp` | FR-01 |
| U-09 | Supersede rule: token N+1 before N commits discards N | FR-17, INV-6 |
| U-10 | Preflight evaluation for each display/audio/asset combination | FR-04 |
| I-01 | IPC rejects wrong-sender and invalid payloads | NF-08 |
| I-02 | Save, close, reopen: bin and settings identical | FR-01 |
| I-03 | Push image/video: Stage reports `committed`; failed load leaves content unchanged | INV-6, FR-07 |
| I-04 | Cockpit reload while killed: snapshot restores kill state | FR-05, INV-5 |
| I-05 | Kill Stage renderer process: main shows blackout (once built), reloads, resyncs, stays killed | INV-3 |
| I-06 | Letterbox math at 1024x768, 1280x800, 1920x1080, 3840x2160, 3440x1440 (canvas size and offsets) | FR-11 |

## 3. Requirement to test matrix

| FR | Automated | Manual / HW |
|---|---|---|
| FR-01 | U-05, U-06, U-08, I-02 | Open a scene made on another laptop (devices differ) |
| FR-02 | Unit: dirty tracking | Kill the app while dirty; relaunch offers recovery |
| FR-03 | I-01 | **HW** Start puts Stage on display 2 within 1.5 s without focus change; Stop removes it |
| FR-04 | U-10 | **HW** Win+P Duplicate blocks Start; unplug blocks Start |
| FR-05 | U-01, U-03, I-04, I-05 | **HW** D-3, D-10, D-11; NF-01 latency log |
| FR-06 | U-02 | **HW** D-1, D-6 |
| FR-07 | I-03 | Import each supported format; reject unsupported with reason |
| FR-08 | U-03 | Play/pause/seek/loop/volume; last-frame hold on end |
| FR-09 | Unit: sink policy | **HW** D-2; test tone from the selected device only |
| FR-10 | U-07 | Slido, YouTube, generic site; D-4 |
| FR-11 | I-06 | **HW** 4:3 and 16:10 displays; 4:3 photo pillarboxed |
| FR-12 | none | **HW** PowerPoint slideshow, Chrome, VLC mirrored; D-5 |
| FR-13 | none | **HW** Return click and hotkey; overlay absent from the Stage and from the confidence monitor |
| FR-14 | none | **HW** preview matches Stage within 500 ms; chips correct |
| FR-15 | Unit: flag handling | **HW** held frame correct for video, embed, and mirror; audio unaffected |
| FR-16 | none | **HW** cursor cannot cross; still confined after display change and resume; released on exit (D-12) |
| FR-17 | U-09 | Visual check of crossfade at 0, 400, 2000 ms; audio crossfade for video |
| FR-18 | Unit: registration failure path | Hotkeys work while PowerPoint has focus |
| FR-19 | Unit: rotation | Log contains Kill latency entries and display events |

## 4. Invariant tests

| INV | Test |
|---|---|
| INV-1 | **HW** Across Start, Stop, unplug, replug, Win+P modes, resume from sleep, and DPI changes, the Stage window is never visible on the Cockpit display (record the laptop screen during drills) |
| INV-2 | Screenshot the Stage and the preview during every flow: no Cockpit UI, dialogs, or Return overlay anywhere |
| INV-3 | I-05 and D-3: Kill succeeds with a hung Stage renderer within 250 ms |
| INV-4 | D-2 plus unit test: with the device missing, managed audio is silent and the default device stays silent |
| INV-5 | U-04, I-04: no state lives only in a renderer |
| INV-6 | I-03, U-09, D-4: failed or superseded loads never alter the Stage |
| INV-7 | U-02, D-1: after replug nothing plays until the operator resumes |
| INV-8 | D-12: cursor free after toggle-off, Stop, quit, and process kill (known outcome from S-4) |

## 5. Hardware and environment matrix (manual)

Run the full feature checklist on at least the starred rows; run subsets on the others.

| ID | Environment | Why |
|---|---|---|
| E-1 ★ | Laptop internal 1080p + HDMI TV/projector 1080p (extend) | Baseline |
| E-2 ★ | HDMI projector at 1024x768 (4:3) or 1280x1024 | Aspect enforcer, resolution renegotiation |
| E-3 | 1280x800 (16:10) display | Letterbox math |
| E-4 ★ | Laptop at 125% or 150% scaling + external at 100% | Mixed-DPI bounds, cursor clip rectangle |
| E-5 | 4K external | Capture performance, scaling |
| E-6 ★ | Windows 10 (19041+) and Windows 11 | Platform support |
| E-7 | Low-end laptop (4 GB RAM) | NF-03/04 headroom |
| E-8 | Bluetooth/USB audio devices present | Output enumeration |

## 6. Failure drills (perform physically)

| ID | Drill | Expected |
|---|---|---|
| D-1 | Unplug HDMI while a video with audio plays | Stage disappears from projector; nothing fullscreen on laptop; audio stops; banner; no crash. Replug: banner + Resume; nothing auto-plays |
| D-2 | Remove the selected audio device (unplug HDMI audio/USB) during playback | Managed audio mutes; alert; default device silent; re-select and test tone works |
| D-3 | Hang the Stage renderer (debug hook that busy-loops it) then press Kill | Black on projector ≤ 250 ms via hard path; audio muted |
| D-4 | Push an embed with the network off, and a blocked URL | Stage unchanged; tile error; alert |
| D-5 | Close, then separately minimize, a mirrored app | Stage returns to slate; alert; no stale frame |
| D-6 | Switch Win+P to Duplicate while live | Treated as removal (FR-06) |
| D-7 | Sleep and wake the laptop while live | Displays re-evaluated; cursor re-clipped; nothing auto-plays |
| D-8 | Open a truncated/corrupt `.umveil`, and one with a higher `schemaVersion` | Clear error; no state change; file untouched |
| D-9 | Change the projector's resolution mid-show | Canvas refits; bounds correct; cursor clip re-applied |
| D-10 | Double-click Kill quickly | Ends killed (Restore ignored within 750 ms) |
| D-11 | Kill the Cockpit renderer while killed | Cockpit reloads; still shows killed; Stage unaffected |
| D-12 | With Hide Mouse on, (a) toggle off, (b) Stop Scene, (c) quit, (d) end the process in Task Manager | Cursor free in a-c; d outcome matches S-4 findings |
| D-13 | End the umveil process in Task Manager while live (residual risk R-09) | Document what the projector shows; verify black-wallpaper mitigation |

## 7. Dress rehearsal checklist (PRD §11 success criterion)

Run on two different projectors/displays with a scene containing: 3 images, 2 videos (one with audio), 1 YouTube embed, 1 Slido (or similar) page, a pinned PowerPoint target.

- [ ] Start Scene: Stage on projector only; Cockpit retains focus
- [ ] Test tone plays only from the hall/HDMI output
- [ ] Every item pushes with crossfade; no stretch on this projector's aspect ratio
- [ ] PowerPoint slideshow mirrors; slide changes smooth; Return works; app closed returns the slate
- [ ] Freeze holds the frame during an intentional hiccup; unfreeze is clean
- [ ] Kill/Restore (button and hotkey), including double-click behavior
- [ ] Unplug/replug HDMI: no leakage to laptop, no auto-resume
- [ ] Hide Mouse: pointer cannot reach the projector
- [ ] Save, quit, reopen scene: identical
- [ ] Three first-time users complete the 5-item task with a kill and a recovery in under 10 minutes unaided

## 8. Soak and performance measurement

- **Soak (NF-05):** 4 hours live, pushing a new item every 2 minutes, one mirrored app, one embed; record RSS at 15 min (baseline) and 4 h (≤ +20%), no crash, no Stage hitch.
- **Kill latency (NF-01):** main logs `t_input` (command received) and the Stage reports `presentedAtMs` after the curtain is painted (`requestAnimationFrame` after the DOM change); both in epoch ms on the same machine. Collect 100 samples; p95 ≤ 100 ms. Hard path: induce the hang (D-3) and measure to blackout shown ≤ 250 ms. This excludes projector/display latency; spot-check end-to-end with a 240 fps phone camera.
- **Startup (NF-04):** cold start to interactive Cockpit ≤ 5 s on the E-7 laptop.
- **Push latency (NF-03):** image ≤ 300 ms, local 1080p H.264 start ≤ 500 ms, measured Cockpit click to Stage `committed`.

## 9. Event-day checklist (also the basis for in-app help)

**Before leaving:** latest scene saved on the laptop and a copy elsewhere; HDMI cable and adapter packed; laptop charged and charger packed.

**At the venue (30 minutes before):**
- [ ] Connect the projector; press **Win+P** and choose **Extend**
- [ ] Set the projector display's wallpaper to **solid black** (guards against R-09)
- [ ] Turn on **Do Not Disturb / Focus Assist**; close chat apps; pause Windows updates
- [ ] Power plan: plugged in, never sleep
- [ ] Open the scene → **Start Scene** → clear preflight
- [ ] Pick the HDMI/hall audio output → **Test tone**
- [ ] PowerPoint: Slide Show > Set Up Slide Show: choose window mode or the primary monitor, untick Presenter View
- [ ] Push each item once, confirm the projector, then Kill and Restore once
- [ ] Know the hotkeys: Kill `Ctrl+Alt+K`, Freeze `Ctrl+Alt+F`, Return `Ctrl+Alt+R`

**If something goes wrong:** Kill first, then fix, then Restore. If the cable drops, wait for the banner, re-seat, Resume.
