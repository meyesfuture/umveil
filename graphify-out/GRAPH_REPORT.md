# Graph Report - umveil  (2026-10-02)

## Corpus Check
- 52 files · ~33,220 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 515 nodes · 674 edges · 35 communities (25 shown, 2 thin omitted)
- Extraction: 100% EXTRACTED · 0% INFERRED · 0% AMBIGUOUS · INFERRED: 2 edges (avg confidence: 0.85)
- Token cost: 0 input · 0 output

## Community Hubs (Navigation)
- CLAUDE.md: working rules for umveil
- Decision log (ADRs)
- PRD: umveil v1.0
- Architecture: umveil
- IPC contract and state model (normative)
- 2. Milestones
- Test plan
- UX specification
- `.umveil` scene file format (normative)
- index.ts
- devDependencies
- stage/main.ts
- ipc.ts
- App.tsx
- state.ts
- package.json
- compilerOptions
- scene-schema.ts
- build
- StageController
- compilerOptions
- url.ts
- embed-guest.ts
- cockpit.ts
- stage.ts
- overlay.ts
- tsconfig.json

## God Nodes (most connected - your core abstractions)
1. `StageController` - 39 edges
2. `electron` - 16 edges
3. `Decision log (ADRs)` - 16 edges
4. `Architecture: umveil` - 15 edges
5. `logger` - 13 edges
6. `Store` - 12 edges
7. `PRD: umveil v1.0` - 12 edges
8. `Test plan` - 10 edges
9. `UX specification` - 10 edges
10. `build` - 9 edges

## Surprising Connections (you probably didn't know these)
- `Services` --references--> `StageController`  [EXTRACTED]
  src/main/ipc-router.ts → src/main/services/stage.ts
- `Services` --references--> `AudioService`  [EXTRACTED]
  src/main/ipc-router.ts → src/main/services/audio.ts
- `Services` --references--> `CaptureService`  [EXTRACTED]
  src/main/ipc-router.ts → src/main/services/capture.ts
- `Services` --references--> `DisplayService`  [EXTRACTED]
  src/main/ipc-router.ts → src/main/services/displays.ts
- `Services` --references--> `SceneService`  [EXTRACTED]
  src/main/ipc-router.ts → src/main/services/scene.ts

## Import Cycles
- None detected.

## Communities (35 total, 2 thin omitted)

### Community 0 - "CLAUDE.md: working rules for umveil"
Cohesion: 0.12
Nodes (15): Architecture rules, CLAUDE.md: working rules for umveil, Code conventions, Definition of done (per feature), Non-negotiable invariants (full text: PRD §5), Project in one line, Where to look, Workflow conventions (+7 more)

### Community 1 - "Decision log (ADRs)"
Cohesion: 0.12
Nodes (16): ADR-001: Electron + TypeScript, ADR-002: Windows-only v1, ADR-003: Main process owns all state, ADR-004: Stage = frameless, non-focusable window at display bounds, ADR-005: App mirroring by window capture, ADR-006: Confidence monitor from real Stage capture, ADR-007: Two-tier Kill, ADR-008: Embeds in `<webview>` (+8 more)

### Community 2 - "PRD: umveil v1.0"
Cohesion: 0.12
Nodes (16): 10. Open questions (defaults let work start now), 11. Success criteria, 1. Summary, 2. Problem, 3. Users, 4. Goals and non-goals, 5. Principles and invariants, 6. Functional requirements (+8 more)

### Community 3 - "Architecture: umveil"
Cohesion: 0.10
Nodes (19): 10. Cursor lock, 11. Security, 12. Failure handling matrix, 13. Repository layout, 14. Observability, 1. Constraints that shape the design, 2. Process and window model, 3. Main-process services (+11 more)

### Community 4 - "IPC contract and state model (normative)"
Cohesion: 0.15
Nodes (12): 1. Rules, 2. State model, 3.1 Cockpit to Main (invoke), 3.2 Overlay to Main (invoke), 3.3 Main to Cockpit (send), 3.4 Main to Stage (send), 3.5 Stage to Main (send), 3. Channels (+4 more)

### Community 5 - "2. Milestones"
Cohesion: 0.15
Nodes (12): 1. Spikes (M-0), 2. Milestones, 3. Risk register, M-0: Spikes and skeleton (M), M-1: Two-window core (L), M-2: Media and scenes (L), M-3: Audio, embeds, disconnect (L), M-4: Freeze and Hide Mouse (M) (+4 more)

### Community 6 - "Test plan"
Cohesion: 0.18
Nodes (10): 1. Strategy, 2. Unit and integration test list (automated), 3. Requirement to test matrix, 4. Invariant tests, 5. Hardware and environment matrix (manual), 6. Failure drills (perform physically), 7. Dress rehearsal checklist (PRD §11 success criterion), 8. Soak and performance measurement (+2 more)

### Community 7 - "UX specification"
Cohesion: 0.11
Nodes (17): 1. Principles, 2. Cockpit layout, 3.1 Kill control, 3.2 Start / Stop, 3.3 Confidence monitor, 3.4 Asset tile (Media / Web / Apps), 3.5 App Switcher, 3.6 Preflight result (inline panel on Start) (+9 more)

### Community 8 - "`.umveil` scene file format (normative)"
Cohesion: 0.22
Nodes (8): 1. Container, 2. `scene.json`, 3. Field rules, 4. Versioning and compatibility, 5. Working copy, import, and save, 6. Security notes, 7. Example migration stub, `.umveil` scene file format (normative)

### Community 9 - "index.ts"
Cohesion: 0.06
Nodes (46): electron, { app, BrowserWindow, desktopCapturer }, gotLock, isCockpit(), isOverlay(), registerIpcHandlers(), Services, setCockpitWindow() (+38 more)

### Community 10 - "devDependencies"
Cohesion: 0.07
Nodes (29): electron-builder, @electron-toolkit/tsconfig, electron-vite, devDependencies, electron, electron-builder, @electron-toolkit/tsconfig, electron-vite (+21 more)

### Community 11 - "stage/main.ts"
Cohesion: 0.11
Nodes (21): canvas, clearLayer(), CompositorState, curtainEl, freezeEl, getActiveLayer(), getHiddenLayer(), handleAudio() (+13 more)

### Community 12 - "ipc.ts"
Cohesion: 0.08
Nodes (22): AppWindowInfo, AppWindowInfoSchema, AudioOutputSchema, CockpitChannel, CockpitPayloads, ErrorCode, ErrorCodeSchema, IPC (+14 more)

### Community 13 - "App.tsx"
Cohesion: 0.11
Nodes (12): App(), AlertBanner(), Props, AssetBin(), Props, Tab, ConfidenceMonitor(), Props (+4 more)

### Community 14 - "state.ts"
Cohesion: 0.10
Nodes (20): Alert, AlertCode, AppAction, appReducer(), AppState, AudioOutput, AudioState, DEFAULT_SCENE_SETTINGS (+12 more)

### Community 15 - "package.json"
Cohesion: 0.06
Nodes (34): koffi, author, dependencies, koffi, react, react-dom, uuid, yauzl (+26 more)

### Community 16 - "compilerOptions"
Cohesion: 0.12
Nodes (17): @electron-toolkit/tsconfig/tsconfig.node.json, electron.vite.config.*, src/main/**/*, src/preload/**/*, compilerOptions, composite, module, moduleResolution (+9 more)

### Community 17 - "scene-schema.ts"
Cohesion: 0.12
Nodes (16): Asset, AssetSchema, checkIntegrity(), CURRENT_SCHEMA_VERSION, ExtSchema, IntegrityError, ItemBaseSchema, migrations (+8 more)

### Community 18 - "build"
Cohesion: 0.12
Nodes (16): build, appId, extraResources, fileAssociations, files, nsis, portable, productName (+8 more)

### Community 19 - "StageController"
Cohesion: 0.11
Nodes (4): pickStageDisplay(), nextToken(), StageController, hwndFromSourceId()

### Community 20 - "compilerOptions"
Cohesion: 0.15
Nodes (14): @electron-toolkit/tsconfig/tsconfig.web.json, src/renderer/**/*, compilerOptions, composite, noUnusedLocals, noUnusedParameters, paths, skipLibCheck (+6 more)

### Community 21 - "url.ts"
Cohesion: 0.36
Nodes (6): ALLOWED_PROTOCOLS, isSafeEmbedNavigation(), normalizeYouTube(), UrlValidationResult, validateEmbedUrl(), YT_PATTERNS

### Community 22 - "embed-guest.ts"
Cohesion: 0.70
Nodes (4): applySink(), getSinkId(), init(), patchExisting()

### Community 23 - "cockpit.ts"
Cohesion: 0.50
Nodes (3): api, UnsubFn, Window

### Community 24 - "stage.ts"
Cohesion: 0.50
Nodes (3): api, UnsubFn, Window

## Knowledge Gaps
- **276 isolated node(s):** `name`, `version`, `description`, `main`, `dev` (+271 more)
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 320 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **2 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `electron` connect `index.ts` to `package.json`, `StageController`, `cockpit.ts`, `stage.ts`, `overlay.ts`?**
  _High betweenness centrality (0.089) - this node is a cross-community bridge._
- **Why does `keywords` connect `package.json` to `index.ts`?**
  _High betweenness centrality (0.077) - this node is a cross-community bridge._
- **Why does `devDependencies` connect `devDependencies` to `package.json`?**
  _High betweenness centrality (0.040) - this node is a cross-community bridge._
- **What connects `name`, `version`, `description` to the rest of the system?**
  _276 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `CLAUDE.md: working rules for umveil` be split into smaller, more focused modules?**
  _Cohesion score 0.11764705882352941 - nodes in this community are weakly interconnected._
- **Should `Decision log (ADRs)` be split into smaller, more focused modules?**
  _Cohesion score 0.11764705882352941 - nodes in this community are weakly interconnected._
- **Should `PRD: umveil v1.0` be split into smaller, more focused modules?**
  _Cohesion score 0.11764705882352941 - nodes in this community are weakly interconnected._