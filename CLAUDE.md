# CLAUDE.md: working rules for umveil

Read `README.md` for the doc map. This file is the short list of rules to apply every session.

## Project in one line
Windows desktop app (Electron + TypeScript, proposed) with an operator **Cockpit** and an audience **Stage** on a second display. Reliability on stage matters more than features.

## Non-negotiable invariants (full text: PRD §5)
- **INV-1** The Stage never appears on the Cockpit's display.
- **INV-2** The Stage never shows operator UI, dialogs, or the Return overlay.
- **INV-3** Kill always works (soft path, then hard fallback).
- **INV-4** umveil-managed audio plays only through the selected output; if it is unavailable the audio is muted, never rerouted to the default device.
- **INV-5** The main process owns all state. Renderers are views and send commands.
- **INV-6** Nothing reaches the Stage until it is ready (preroll gate).
- **INV-7** After a disconnect nothing auto-resumes.
- **INV-8** Cursor confinement is always released on exit.

## Architecture rules
1. Main process = single source of truth (`AppState`, revisioned snapshots). Cockpit/Stage/Overlay never talk to each other directly.
2. Renderers: `contextIsolation: true`, `sandbox: true`, `nodeIntegration: false`. No Node APIs in any renderer.
3. Every IPC channel is declared in `src/shared/ipc.ts` per `docs/IPC_CONTRACT.md`. Validate payloads with zod in main. Check the sender's window identity on every handler.
4. Win32 access goes only through `Win32Bridge` (`src/main/services/win32.ts`). Nothing else imports `koffi`.
5. Scene file I/O goes only through `SceneService`. Follow `docs/SCENE_FORMAT.md` exactly (atomic save, zip-slip-safe extraction).
6. The Stage is dumb: it executes commands and reports status. It holds no policy.
7. Any failure path must end in a safe state (slate/black, paused, muted) plus a Cockpit alert. Never "best guess" content onto the Stage.

## Code conventions
- TypeScript `strict: true`; no `any` (use `unknown` + narrowing); no default exports in `src/main` and `src/shared`.
- Exhaustive `switch` on discriminated unions (`never` check).
- Pure logic (reducer, URL normalizer, scene schema) lives in `src/shared` and is unit-tested.
- Timestamps UTC ISO-8601; durations in milliseconds; IDs are UUID v4 strings except display ids (numbers from Electron).
- Log through `Logger` (JSON lines). No `console.log` in committed code.

## Workflow conventions
- **Atomic git commits**: one logical change per commit, each commit builds and passes tests. Message format: `type(scope): summary`, e.g. `feat(stage): add curtain layer`. Types: `feat fix refactor test docs chore spike`.
- CLI-only toolchain: Node/npm scripts, `tsc`, `vite`, `git`. No reliance on IDE-specific features.
- **Run and build on the Windows host**, not inside WSL2. Electron installed from WSL2 downloads the Linux binary, and the app needs real displays/HDMI. Keep the repo on a Windows path (e.g. `C:\dev\umveil`). WSL2 is fine for `git`, grep, and reading docs.
- Spikes live in `spikes/<id>-<name>/`, are throwaway, and end by recording findings in `docs/DECISIONS.md`.
- Do not add behavior that is not in the PRD. Propose it as a PRD change first.

## Definition of done (per feature)
1. Acceptance criteria in the PRD pass.
2. Mapped tests in `docs/TEST_PLAN.md` exist and pass (unit/integration automated; manual items checked on real hardware where listed).
3. Failure paths from `docs/ARCHITECTURE.md` §12 for that feature are handled.
4. Docs updated in the same commit if behavior or interfaces changed.

## Where to look
| Need | File |
|---|---|
| Requirement or acceptance criteria | `docs/PRD.md` |
| Window/process/state design | `docs/ARCHITECTURE.md` |
| Channel names and payload types | `docs/IPC_CONTRACT.md` |
| Saved-file shape | `docs/SCENE_FORMAT.md` |
| Copy, layout, hotkeys | `docs/UX_SPEC.md` |
| What to do next | `docs/ROADMAP.md` |
