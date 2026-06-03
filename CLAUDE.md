# OpenClo.ai

> Cognitive Design Engine for Professional Fashion Engineering

## What This Is

Browser-based garment CAD with AI copilot and real-time XPBD cloth simulation. Built with React, Three.js, and Rust WASM.

## Non-Negotiables

- **WASM sync.** When modifying `crates/xpbd-wasm/src/lib.rs`, copy BOTH `xpbd_wasm.js` AND `xpbd_wasm_bg.wasm` to `public/wasm/`. JS-only copy = silent CPU fallback. CI's `rust` job runs `cargo test` + `cargo clippy -D warnings` + `wasm-pack build` + a Node-side smoke test (`scripts/verify-wasm-smoke.mjs`) that loads the committed binary and runs `XpbdSolver.step()` once (#748). A truly stale binary that fails to load or panics on `step()` is caught here.
- **Typecheck command.** Use `npx tsc -b --noEmit` (build mode), NOT bare `tsc --noEmit`. Root tsconfig has `"files": []` and returns clean vacuously. Pre-commit hook uses `-b`; manual verification must match.
- **IDs.** Use `newId()` from `src/utils/ids.ts` (v4 UUID via `crypto.randomUUID()`). State-encoded composite IDs (e.g., `pin_${vertexIndex}`, `auto-seam-${rankIndex}`) marked `// state-encoded ID` are preserved — do not replace.
- **Persistence.** IDB canonical via `storageSet`/`storageGet` from `src/utils/storage.ts`. Never write LS+IDB in parallel. Inline shape comment required at every `storageSet` callsite: `// shape: <Type> v<N> — opt-in envelope: <yes|no>`. LS-only writes need inline justification.
- **Don't bypass gates.** No `--no-verify`. The Husky pre-commit hook (`.husky/pre-commit`) runs the *fast* gate — `npx tsc -b --noEmit` + `npx lint-staged` (eslint `--max-warnings=0` on staged `*.{ts,tsx}`). It does **not** run the test suite (too slow per commit); run the full gate including tests manually before committing (see "After Every Task"). The hook is tracked: `.husky/` is intentionally NOT gitignored (only the generated `.husky/_/` self-ignores) and `.gitattributes` pins it to LF — do not re-ignore it or the gate silently no-ops.

## Commands

| Task | Command |
|---|---|
| Dev server | `npm run dev` |
| Unit tests | `npm run test` |
| E2E tests | `npm run test:e2e` |
| Lint | `npm run lint` |
| Typecheck | `npx tsc -b --noEmit` |
| WASM rebuild | `cd crates/xpbd-wasm && wasm-pack build --target web --out-dir pkg && cp pkg/xpbd_wasm.{js,_bg.wasm} ../../public/wasm/` |

## Key Directories

```
src/
├── components/      # React UI (CopilotPanel, Toolbar, Viewport)
├── copilot/         # AI copilot (bridge, hooks, tools, features)
├── diagnostics/     # Inspector subsystem (rule engine + agent analyzer)
├── store/           # Redux slices + middleware
├── stores/          # Zustand state
├── types/           # Shared types
├── utils/           # cloth/, import/, mesh/, defaults, ids, storage
└── workers/         # Web Worker pool

crates/xpbd-wasm/    # Rust WASM cloth solver
public/wasm/         # Compiled WASM binaries
docs/                # Specs, plans, research, RFCs (reports/)
```

## Audit Ratifications

Each closed eje has a full RFC in `docs/reports/`. Read the doc before introducing new code in the area.

| Eje | What it ratifies | Doc |
|---|---|---|
| B2-state | Entity collections shape (array vs Record vs EntityAdapter); ~400 inline `.find` preserved forward-only | `docs/reports/2026-04-30-drift-fase2-b2state-entity-collections.md` |
| B3-state | Cascade middleware convention (`@cascade` header, depth ≤ 1, inventory of 5 middlewares) + action `meta.*` flag policy | `docs/reports/2026-04-30-drift-fase2-b3state-cascade-middleware.md` |
| B6-state | IDB canonical persistence (`storageSet`/`storageGet`); LS-only exceptions inline-justified; opt-in zod envelope versioning | `docs/reports/2026-04-30-drift-fase2-b6state-persistencia.md` |
| B10-state Par 1 | Fabric assignment: `project.pieces[].fabricId` source-of-truth, `simulation.pieceFabrics` transient cache, `useColorwaySync` bridge | `docs/reports/2026-04-30-drift-fase2-b10state-par1-fabric-write-surfaces.md` |
| C1 | Three.js disposable lifecycle via `useDisposable` hook (BufferGeometry, Material in `useMemo`) | `docs/reports/2026-05-01-rfc-c1-buffer-lifecycle.md` |
| D1-real | Dart representation: `InternalLine{type:'dart'}` storage + `Dart` rich entity domain, bridged by `dartEntity.ts` | `docs/reports/2026-04-30-drift-fase2-d1real-dart-internalline.md` |
| D3 | zod scope: boundary parsing + persistence versioning + tool args. UI form validation out-of-scope (HTML attrs sufficient) | `docs/reports/2026-05-01-drift-fase2-d3-forms-inputs-zod.md` |
| D4 (superseded 2026-05-28) | CopilotPanel composition RFC; superseded by MVP v1 Opt C partial port — AgentSettings re-homed in UnifiedBar `settings` mode; CopilotPanel host deleted in `1c6e4238`. **Honest scope:** Opt C closed the *referent-cleanup* axis, not the *distance-to-user* axis. ProjectMemory UI binding / CostManager / recordMessage / project-switch context guard not ported. AgentSettings now gates Budget + Token Usage on the host wiring `onBudgetChange` (UnifiedBar does not — section hidden there to avoid a "$0.00" surface). `memoryTools.ts` registrations remain active → agent can write `openclo_memory_<projectId>` LS; **no user-reachable clear UI in MVP v1 (dark surface)** — queued for M2+. | `docs/reports/2026-05-01-drift-fase2-d4-copilotpanel-composition.md` |
| D5 | Layer policy: feature ownership (`components/` ↔ `copilot/` imports legitimate when same feature) | `docs/reports/2026-04-30-drift-fase2-d5-layering-violations.md` |
| D6 | Fabric 3-tier API surface: `Fabric` (project) + `FabricMaterial` (plugin API) + `PhysicalFabric` (engineering) | `docs/reports/2026-04-30-drift-fase2-d6-fabric-types.md` |
| D7 | Diagnostic types: `ValidationDiagnostic` (load-time) + `Diagnostic` (runtime inspector) intentionally separate | `docs/reports/2026-04-30-drift-fase2-d7-validation-diagnostic-types.md` |
| A3 | Cross-boundary error handling Rust↔TS: defensive Rust + CPU fallback + TS NaN guards + Result-pattern for new fallible exports | `docs/reports/2026-05-01-drift-fase2-a3-cross-boundary-errors.md` |
| A6 | Cloth solver client interface (`ClothSolverClient`): 4-member lifecycle subset; init/callbacks tier-specific | `docs/reports/2026-05-01-rfc-a6-worker-protocol.md` |
| A7 | WASM vs CPU solver capabilities: per-feature port-or-ratify; `SolverCapabilities` surface; per-feature ports queued (#676-681) | `docs/reports/2026-05-01-rfc-a7-wasm-cpu-equivalence.md` |
| A4 | Cross-language geometry/mesh ops Rust↔TS reformulated to TS-internal cross-tier; spatial hash roles ortogonales; topology extraction cleavage ratified; bend rest semantics closed pre-A4 via BUG-1 | `docs/reports/2026-05-02-drift-fase2-a4-cross-language-geometry-mesh.md` |
| A2 | Cross-boundary serialization Rust↔TS: variant A (zero-copy reads) + variant B (init copies) ratified-as-is; variant C (config field-by-field) Pattern 2.5 lite — `configBridge` helper for shared subset CPU↔WASM + per-tier divergence ratified for non-shared fields; `bendCompliance` defaults aligned (latent → eliminated) | `docs/reports/2026-05-02-drift-fase2-a2-cross-boundary-serialization.md` |
| C4 | 4-way tier orchestration (TSL/WebGPU + WASM + CPU + Neural): hook composition canonical (`useSimulationLifecycle` + `useCollisionBodies` + `useMeshing` ratified as de facto coordinator, NO TierCoordinator class); 4 tiers permanentes (distinct roles); tool capability flags `SolverCapabilities.tools.{steamBrush, meshGrab}`; `toolDispatch.ts` Pattern 2.5 lite helper consolidating per-tier semantic divergence (TSL uniforms vs WASM positional setPins); `SimulationStatusOverlay` UI surface for tool silent-absence; status-quo cascade GPU→WASM→CPU→Neural + WebGPU localStorage opt-in (Three.js 0.183 atomicAdd bug ongoing) | `docs/reports/2026-05-02-drift-fase2-c4-4way-tier-orchestration.md` |
| E-async-states | B8 + D2 + D8 fusion sub-track: per-feature state location convention (Redux for cross-feature persistent / `useState` local for transient / state machine for multi-step UX / hook + Redux for lifecycle / ErrorBoundary tree / silent variant for storage degradable); D2 6-variant error propagation table (`ToolResult` / `throw` / `console` / silent catch / return null / `showToast`) — Variant F canonical refuted "infrautilizado" claim; ErrorBoundary tree (App + Panel + Viewport3D + Simulation) + Toast slice (`showToast` / `showSuccessToast` / `showErrorToast` / `showInfoToast` / `showUndoToast` + auto-cleanup + 5-toast limit) ratified as canonical UI surfaces; 3 surgical D8 gap closures via Pattern 2.5 extend (CollisionBodyMesh import error toast + validator diagnostics aggregator post-load + worker pool errors slice field + rate-limited toast); SolverError coordination with #687 (decoupling preserved per A6 § 3.6.C); state machine pattern ratified as emerging convention (2 sites today). **9° caso regla 13 reformulation** (3 axes son ortogonal concerns + canonical infra pre-existente + bounded gaps, NO sub-track de scope grande). **2° anchor case Pattern 2.5 hybrid combining variants single closure** (post-C4 1°). **Audit cumulative CLOSED** (28 ejes total). | `docs/reports/2026-05-03-drift-fase2-e-async-states.md` |
| Epic-746 (boundary contracts) | Cloth solver client boundary-contract test suite locks 4-tier `ClothSolverClient` family (CPU + WASM + GPU + Neural): `WasmSolverClient` 7 contracts (init lifecycle / `{type:'error', code, message}` per A3 / frame typed-array identity / snapshot lifecycle / setPins boundary per #749 / dispose-during-init / DOM `'error'` event), `GpuSolverClient` 8 behaviors (init success+error / dispose mid-readback / re-init disposes #771 / freezePieces invMass+version / setBrushParams / grab toggles / collision body scratch SBA dispose #772), `ClothWorkerClient` 11 contracts (init+initMultiPiece / DOM error / control messages / snapshot / transferable buffers / pin single-arg per A6 #684 / edgeData / dispose-during-init), `SolverCapabilities` ↔ method-presence cross-tier matrix (method-anchored: `tools.steamBrush` / `tools.meshGrab` / `frameDriven`; lifecycle subset universal — pinned via `Object.getOwnPropertyDescriptor` prototype inspection, no instantiation), and BUG-2 (#605) `solveTriangleCollision` friction kernel regression (4 cases including `friction > 0` + `prevPos === undefined` silent no-op shape). Helper-module convention ratified and propagated tier-a-tier with deliberate per-tier divergence (`fakeDevice.ts` / `fakeWorker.ts` addEventListener / `fakeClothWorker.ts` direct property assignment per CPU bridge); mock-based throughout (no real Worker / no real `GPUDevice` / no WASM binary loaded). | `docs/reports/2026-05-10-rfc-746-cloth-solver-boundary-contracts.md` |

## Common Tasks

- **Add fabric preset** → append to `PHYSICAL_FABRIC_LIBRARY` in `src/utils/cloth/physicalFabric.ts`.
- **Modify cloth physics** → Rust solver `crates/xpbd-wasm/src/lib.rs` + JS fallback `src/utils/cloth/xpbdSolver.ts`. Rebuild WASM (see Commands above).
- **Add copilot tool** → define schema + `registerTool()` in `src/copilot/tools/`. Implement execute returning `ToolResult` with optional `rollback`.

## Architecture

- Spec: `docs/specs/ARCHITECTURE.md`
- Cloth simulation: `docs/research/cloth-simulation-research.md`, `docs/research/fabric-calibration-guide.md`
- Copilot bridge (AgenticLoop + planner/): `docs/plans/2026-03-02-copilot-bridge-architecture-design.md`
- Reactive solver middleware: `docs/plans/2026-02-27-reactive-solver-middleware-design.md`
- Click'n'Go (expert mode): `docs/superpowers/specs/2026-03-18-click-n-go-design.md`
- Diagnostic Inspector: `docs/superpowers/specs/2026-03-18-diagnostic-inspector-design.md`

## After Every Task

- Run gates before commit: `npx tsc -b --noEmit && npm run test && npm run lint`.
- If you closed an audit eje, add a row to "Audit Ratifications" above pointing to the new `docs/reports/` doc.

## Navigation

If `CLAUDE/ROUTER.md` exists locally, read it at session start before any task. Otherwise this file plus `docs/reports/` is sufficient.
