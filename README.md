# umveil

> A two-window live-event display controller for Windows. The operator works in the **Cockpit** on the laptop; the audience sees only the **Stage** on the projector. Operator UI can never leak onto the projector.

| | |
|---|---|
| **Status** | Pre-implementation. Planning docs complete; spikes (M-0) are next. |
| **Doc set version** | 0.1 (2026-10-02) |
| **Platform (v1)** | Windows 10 (version 2004 / build 19041+) and Windows 11, x64 |
| **Proposed stack** | Electron + TypeScript; React (Cockpit); vanilla TypeScript (Stage); Win32 calls via `koffi`. Stack is *proposed*, not final: see ADR-001 in `docs/DECISIONS.md`. |

## What umveil does (one paragraph)

umveil runs two windows. The **Cockpit** (operator dashboard) lives on the laptop screen. The **Stage** (borderless, fullscreen, non-interactive) lives on the secondary display, usually an HDMI projector. The operator pushes photos, videos, web embeds, or a live mirror of another app (e.g. PowerPoint) to the Stage with one click, and can instantly kill the feed, freeze the frame, or recover from an unplugged cable without anything unplanned reaching the audience. Scenes are saved as portable `.umveil` files for recurring events.

## Documentation map

| Doc | Answers | Read it when |
|---|---|---|
| [`docs/PRD.md`](docs/PRD.md) | **What** we build and how we know it's done: requirements (FR-xx), non-functional requirements (NF-xx), invariants (INV-x), scope, assumptions, open questions | First. Before any design or code. |
| [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) | **How** it is built: processes, windows, state machines, Stage compositor, capture, audio, failure handling, repo layout | Before implementing any module. |
| [`docs/DECISIONS.md`](docs/DECISIONS.md) | **Why** (ADR-xxx): each major choice, alternatives rejected, which are spike-gated | When tempted to change a foundation. |
| [`docs/SCENE_FORMAT.md`](docs/SCENE_FORMAT.md) | The `.umveil` file format (normative) | M-2 (scene files) and any change to saved data. |
| [`docs/IPC_CONTRACT.md`](docs/IPC_CONTRACT.md) | Typed state model and every IPC channel (normative) | Whenever a window and the main process talk. |
| [`docs/UX_SPEC.md`](docs/UX_SPEC.md) | Cockpit layout, states, copy, hotkeys, operator flows | Building or reviewing any UI. |
| [`docs/ROADMAP.md`](docs/ROADMAP.md) | Spikes (S-1 to S-6), milestones (M-0 to M-6), risk register (R-xx) | Planning the next work session. |
| [`docs/TEST_PLAN.md`](docs/TEST_PLAN.md) | Test strategy, FR-to-test matrix, hardware matrix, failure drills, event-day checklist | Before calling anything "done". |
| [`CLAUDE.md`](CLAUDE.md) | Working rules and conventions for contributors and AI assistants | Every session. |

## Document precedence (if two docs disagree)

1. `PRD.md` (behavior)
2. `IPC_CONTRACT.md` and `SCENE_FORMAT.md` (interfaces)
3. `ARCHITECTURE.md` (design)
4. `UX_SPEC.md`, `ROADMAP.md`, `TEST_PLAN.md`
5. `DECISIONS.md` records *why*; it never overrides the above, but a changed decision must update them.

**Rule:** a behavior change updates the PRD first, then the affected docs, in the same commit.

## Stable IDs used across the docs

| Prefix | Meaning | Defined in |
|---|---|---|
| `FR-xx` | Functional requirement | PRD |
| `NF-xx` | Non-functional requirement | PRD |
| `INV-x` | Invariant (must hold in every state) | PRD |
| `ADR-xxx` | Architecture decision | DECISIONS |
| `S-x` | Spike (time-boxed experiment) | ROADMAP |
| `M-x` | Milestone | ROADMAP |
| `R-xx` | Risk | ROADMAP |
| `D-x` | Failure drill | TEST_PLAN |

## Glossary

| Term | Meaning |
|---|---|
| **Cockpit** | Operator dashboard window on the laptop display. |
| **Stage** | Borderless audience window on the secondary display. Shows only audience content. |
| **Scene** | A saved set of items plus settings, stored as a `.umveil` file. |
| **Item** | One entry in the Asset Bin: an image, a video, a web embed, or an app target. |
| **App target** | A description (process name + window-title hint) of an external app to mirror to the Stage. Never launches anything. |
| **Slate** | The holding visual shown when nothing is pushed: black or the event logo. |
| **Curtain** | The top-most Stage layer used by Kill (black or logo). |
| **Preroll** | Loading new content into the hidden layer first; it is shown only when ready. |
| **Confidence monitor** | The Cockpit's live preview of what the Stage is actually showing. |
| **Return overlay** | Tiny operator-only button window that brings the Cockpit back while an app is being mirrored. |

## Planned commands (created in M-0; do not exist yet)

```text
npm run dev       # electron-vite dev (run from Windows, see CLAUDE.md)
npm run build     # production build
npm run dist      # electron-builder: portable .exe + NSIS installer
npm test          # unit tests (Vitest)
npm run test:e2e  # Playwright for Electron
```
