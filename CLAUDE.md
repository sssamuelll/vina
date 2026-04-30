# Claude Code Project Guide

> OpenClo.ai — The Cognitive Design Engine for Professional Fashion Engineering

## Project Overview

OpenClo.ai is a browser-based garment CAD with AI copilot and real-time XPBD cloth simulation. Built with React, Three.js, and Rust WASM.

## Key Directories

```
src/
├── components/           # React UI components
│   ├── CopilotPanel/    # AI assistant chat interface
│   │   └── ProgressMessage/  # Bridge execution progress UI
│   ├── Toolbar/         # 2D/3D tool buttons
│   └── Viewport/        # 2D canvas and 3D viewer
├── copilot/             # AI copilot system
│   ├── bridge/          # Planner + Executor + Reasoner architecture
│   │   ├── types.ts           # Step, ExecutionPlan, StepResult, etc.
│   │   ├── Planner.ts         # LLM planning (JSON output)
│   │   ├── Executor.ts        # Step execution (no LLM)
│   │   ├── Reasoner.ts        # Error recovery (LLM on failure)
│   │   ├── ResultStore.ts     # Result accumulation + variable resolution
│   │   ├── SummaryGenerator.ts # Template-based summaries
│   │   └── ExecutionBridge.ts # Main orchestrator
│   ├── hooks/           # React integration
│   │   └── useBridge.ts       # Bridge state management hook
│   ├── tools/           # Copilot tool definitions
│   └── features.ts      # Feature flags (bridge mode)
├── types/
│   └── collisionBody.ts  # CollisionBody interface
├── utils/
│   ├── cloth/           # XPBD cloth simulation
│   │   ├── physicalFabric.ts    # 32 fabric presets
│   │   ├── xpbdSolver.ts        # TypeScript solver (JS fallback)
│   │   ├── triangleCollision.ts # Triangle mesh collision solver
│   │   ├── collisionMesh.ts     # CollisionMeshData + extraction helpers
│   │   └── wasm/                # WASM worker interface
│   ├── import/          # Mesh import (OBJ/FBX/GLB/GLTF)
│   └── mesh/            # Meshing utilities
├── workers/             # Web Worker pool for reactive solver
├── diagnostics/         # Diagnostic inspector system
│   ├── types.ts               # InspectionTarget, InspectionData, Diagnostic, AgentAnalysis
│   ├── dataCollector.ts       # Pure sync: (target, state) → InspectionData
│   ├── ruleEngine.ts          # 13 deterministic diagnostic rules
│   └── agentAnalyzer.ts       # LLM-powered streaming analysis + suggestions
├── store/               # Redux slices + middleware
│   ├── workflowSlice.ts             # Expert mode, confirm overrides, tool memory
│   ├── confirmationMiddleware.ts    # Destructive action gating + tool memory mirroring
│   ├── inspectorSlice.ts            # Diagnostic inspector state
│   └── reactiveSolverMiddleware.ts  # Parametric rebuild pipeline
└── stores/              # Zustand state management

crates/
└── xpbd-wasm/           # Rust WASM cloth solver
    └── src/lib.rs       # Core physics implementation

public/
└── wasm/                # Compiled WASM binaries
    ├── xpbd_wasm.js     # JS bindings (must sync with Rust)
    └── xpbd_wasm_bg.wasm
```

## Recent Major Features (v0.10.0)

- **Tech Pack & BOM**: Auto-populated Bill of Materials + multi-page PDF tech pack export.
- **Trim Library**: 22 presets (buttons, zippers, snaps, rivets, buckles), click-to-place on pieces.
- **3D Sewing Tool**: Click edges in 3D viewport to create seams (CLO3D-style).
- **Nesting**: Fabric roll mode with consumption calculator and canvas preview.
- **Auto-Trace**: Custom Canny edge detection — scanned patterns to vector outlines.
- **Grading**: Single-axis EU/US/UK sizing (XS-XXL) with staleness detection.
- **Artwork Placement**: Place logos/graphics on pieces with canvas compositing.
- **RAG Knowledge Base**: 65-chunk index with client-side retrieval, integrated into AgenticLoop.
- **231 Copilot Tools**: Every feature registered for AI agent access.
- **Shared Defaults**: `src/utils/defaults.ts` — single source of truth for all feature constants.

## Cloth Simulation Parameters

### ClothSimConfig

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `substeps` | number | 15 | XPBD solver iterations per frame |
| `damping` | number | 0.99 | Global velocity damping |
| `gravityY` | number | -9.81 | Gravity acceleration |
| `dragCoefficient` | number | 1.0 | Air resistance (0-2) |
| `stretchComplianceWarp` | number | 0.0 | Stretch along grain (0 = stiff) |
| `stretchComplianceWeft` | number | 0.0 | Stretch across grain |
| `stretchComplianceShear` | number | 0.001 | Diagonal stretch |
| `bendComplianceWarp` | number | 1.0 | Bend along grain |
| `bendComplianceWeft` | number | 1.0 | Bend across grain |
| `internalDamping` | number | 0.3 | Per-fabric damping (0 = fluid, 1 = heavy) |
| `selfCollision` | boolean | false | Enable self-collision |
| `thickness` | number | 0.002 | Cloth thickness (meters) |

### PhysicalFabric Properties

Each fabric in `physicalFabric.ts` has:

- **Stretch**: `stretchWarp`, `stretchWeft`, `stretchBias` (% elongation)
- **Bending**: `bendingWarp`, `bendingWeft` (mN·cm rigidity)
- **Damping**: `internalDamping` (0.0-1.0)
- **Surface**: `friction`, `frictionBody`, `surfaceRoughness`
- **Strength**: `tensileStrengthWarp/Weft`, `tearStrength`

## WASM Sync Requirement

When modifying `crates/xpbd-wasm/src/lib.rs`:

```bash
cd crates/xpbd-wasm
wasm-pack build --target web --out-dir pkg

# CRITICAL: Copy BOTH files to public/wasm/
cp pkg/xpbd_wasm.js public/wasm/
cp pkg/xpbd_wasm_bg.wasm public/wasm/
```

If only `.wasm` is copied, the worker falls back to CPU solver.

## Gate commands

These are the commands the husky pre-commit hook runs and the commands you should use in any "verify before commit/push" step. Manual gate runs **must** match the hook commands; otherwise verifications can pass vacuously while the hook fails.

```bash
npx tsc -b --noEmit   # Type check — see note on -b below
npm run test          # Unit tests (Vitest)
npm run test:e2e      # E2E tests (Playwright)
npm run lint          # ESLint (eslint --max-warnings=0 enforced in lint-staged)
```

### Why `tsc -b --noEmit` and not `tsc --noEmit`

The repo's root `tsconfig.json` declares `"files": []` and only project references (to `tsconfig.app.json`, `tsconfig.node.json`, `bench/tsconfig.json`). Running bare `tsc --noEmit` against the root config typechecks **nothing** — it returns clean vacuously even when `src/` has compile errors. The husky pre-commit hook uses `tsc -b --noEmit` (build mode), which traverses the project references and actually typechecks `src/`.

If you run `tsc --noEmit` and it passes but the pre-commit hook fails, the bare command is the bug, not the hook. **Always use `tsc -b --noEmit`** when verifying typecheck status manually.

## ID generation

Use `newId()` from `src/utils/ids.ts` for any new entity that needs a unique opaque identifier (pieces, seams, internal lines, trims, construction points, copilot UI ephemera, suggestions, log entries, etc.). Returns a v4 UUID via `crypto.randomUUID()`.

```typescript
import { newId } from '../utils/ids';
const id = newId();  // e.g., "550e8400-e29b-41d4-a716-446655440000"
```

**Do NOT use `newId()` for:**

- **Composite IDs that intentionally encode state** (e.g., `pin_${vertexIndex}`, `ann_${text}`, `${parentId}-clone-${...}`, `auto-seam-${rankIndex}`). Those exist to encode a relationship in the ID itself; replacing with UUID loses information consumers may rely on. Mark them with `// state-encoded ID — see B10-state` and leave alone until B10-state's RFC reviews them.
- **IDs with format contracts** asserted by tests or external specs (e.g., `planTypes.genPlanId/genStepId` whose format is asserted by `planTypes.test.ts`; `bomExtractor.nextId` with deterministic re-extraction reset; `exportAAMA.nextHandle` with DXF AAMA hex format requirement; `ollama.ts` inline IDs asserted by `ollama.test.ts:128`).

The historical `uid()` / `lineId()` / `cid()` / etc. helpers in `pathHelpers.ts`, `patternOps.ts`, `seamlyAdapter.ts`, `copilotUISlice.ts`, `constructionSlice.ts`, etc. are all thin wrappers around `newId()`. New code should call `newId()` directly; the wrappers exist for backward compatibility.

## Persistence policy (B6-state ratified)

Cross-ref: `docs/reports/2026-04-30-drift-fase2-b6state-persistencia.md` (full Fase 2 doc with 8 sub-decisions, opciones por tradeoffs, exception list).

Cross-ref: `docs/reports/2026-04-30-bug-10-fix-options.md` (the BUG-10 nota that established the canonical IDB pattern adopted by 8 sites).

### Canonical write/read

Use `storageSet` / `storageGet` from `src/utils/storage.ts` for IDB-primary persistence. Use `migrateFromLocalStorage(legacyKey, store, key)` for one-time LS→IDB handover on first read. Never write to both LS and IDB in parallel (the BUG-10 anti-pattern).

```typescript
import { storageSet, storageGet, migrateFromLocalStorage } from '../utils/storage';

// Write
await storageSet('settings', 'my-key', value);

// Read with read-side migration from legacy LS
const existing = await storageGet<MyShape>('settings', 'my-key');
if (existing) return existing;
return (await migrateFromLocalStorage<MyShape>('legacy-ls-key', 'settings', 'my-key')) ?? defaultValue;
```

The 4 IDB stores defined are `projects`, `avatars`, `plugins`, `settings`. New storeNames require version bump in `storage.ts:25`.

### When LS-only is legitimate (orientative criterion, ratify per-site)

LS-only is legitimate IFF **all three** apply:
- shape size ≤ ~1KB
- AND sync access is required for the render path or sub-millisecond user input
- AND per-browser UX (no cross-machine value gain from sync)

This criterion is **orientative, not greppable**. Each LS-only site requires explicit ratification via inline comment so future grep can audit coverage:

```typescript
// shape: SubtoolState ~100B, LS-only: sub-millisecond access during 3D render path
safeSetItem(SUBTOOL_STORAGE_KEY, JSON.stringify(state));
```

```typescript
// shape: AgentConfig ~80B, IDB canonical (B6-state § 5)
await storageSet('settings', 'agent-config', config);
```

If a new write doesn't fit any existing pattern, default to IDB canonical and prove the LS-only case in PR review.

### Schema versioning (opt-in)

Default: shapes persist without an envelope. When a shape changes format and legacy data must coexist, **opt in** to an envelope helper (precedent: `workflowSlice.ts:14-79` with `STORAGE_VERSION = 1` + zod strict envelope).

To mitigate **silent migration debt risk** (a dev changing a persisted shape without knowing the opt-in path exists): every `storageSet` call site should carry an inline comment declaring the shape + version + opt-in status:

```typescript
// shape: AgentConfig v1 — opt-in envelope: no (stable shape, no migrations expected)
await storageSet('settings', 'agent-config', config);
```

```typescript
// shape: WorkflowState v1 — opt-in envelope: yes (zod strict, see workflowSlice.ts:14)
await storageSet('settings', 'workflow', envelopedValue);
```

Any shape change to a persisted type requires either:
- (a) opt-in to the envelope versioning helper if datos legacy must coexist, or
- (b) explicit declaration "breaking change, drop legacy data" with migration removal in the commit message.

The grep pattern `// shape: <Type> v<N> — opt-in envelope: <yes|no>` is the audit hook for this convention.

### zod boundary parsing

Mandatory at IDB read boundary for **user-generated data** (poses, profiles, plugin manifests). Optional for internal config with stable TypeScript-narrow shape (agent-config, provider-config, fallback-provider, ollama-config).

When in doubt: zod-parse on read. The cost is bounded; the bug surface from corrupt data is real.

### Sync API exceptions

The cache-shadowing pattern (module-level cache + sync API + async hydrate + IDB persistence) is ratified as exception in 2 sites: `pluginManager.installedCache`, `providers/ollama.ollamaConfigCache`. Failure modes (order-dependent staleness + silent IDB write failure) are documented inline and accepted as the trade-off for sync API contract preservation.

If a third cache site emerges with the same shape, evaluate canonical helper extraction (B6-state § 3.5 reopen trigger).

### Migration window

`migrateFromLocalStorage` paths are **indefinite — do not remove** post-canonical-adoption. Comment inline: `// Legacy LS migration; permanent per B6-state § 3.7`. Reopen the policy if the codebase accumulates >5 distinct migration paths or telemetry confirms zero legacy reads for >12 months.

### What is out-of-scope of this policy

- **SecureStorage** (encrypted secrets in sessionStorage) — separate concern. Boundary: non-secrets in IDB, secrets in SecureStorage.
- **Plugin sandbox storage** (`PluginBridge.ts:622`) — plugin isolation boundary, intentional.
- **Skill persistence DB** (`openclo_skills_v1`) — separate IDB instance with custom schema/indices. Ratified as deliberate separation.
- **Reference image blob storage** (`openclo-reference-images`) — separate IDB instance for large blobs. Ratified.
- **`projectIO.ts:155` quarantine** — deliberately LS-only for resilience (Safari private mode survival).

### When to update this section

Reopen B6-state Fase 2 (per § 7 reopen triggers) if any persistence drift surfaces a case that the policy doesn't cover, or if observed bugs invalidate one of the ratified opciones.

## Cascade middleware patterns (B3-state ratified)

Cross-ref: `docs/reports/2026-04-30-drift-fase2-b3state-cascade-middleware.md` (full Fase 2 doc with 5 sub-decisiones, 5 cascades inventariadas, 6 primitives, deudas técnicas).

### What counts as cascade middleware

A **cascade middleware** is a middleware in `src/store/*Middleware.ts` that intercepts an action and emits one or more secondary dispatches without the call-site knowing or controlling. The call-site dispatched 1 action; the system ends with N+1 actions.

Cascades are legitimate if they meet **all four** criteria:

1. **Has `@cascade` header** documenting shape, triggers, dispatches, guard, undo policy.
2. **Respects undo grouping criterion**: groups dispatches into a single undo entry **only if** the cascade modifies `project.*` state AND the dispatches represent a single semantic user step. Otherwise does not group.
3. **Depth ≤ 1**: secondary dispatches are not triggers of another cascade middleware. If cascade-of-cascade is needed, rewrite as orchestration.
4. **Listed in this section's index below** (canonical enumeration).

### Header convention

Every middleware in `src/store/*Middleware.ts` whose body contains `dispatch(` must carry a `@cascade` header. For middlewares with multiple sub-cascades (e.g., `confirmationMiddleware` has 3 sub-cascadas), use one header per sub-cascade.

```ts
/**
 * @cascade
 * shape: sym 1↔1 (mirror/instance)
 * triggers: project/updatePiece, project/addInternalLine, ...
 * dispatches: project/updatePiece (partner), project/addInternalLine (partner)
 * guard: module-level boolean isSyncing
 * undo: batch grouped via undo/startBatch/endBatch
 * cap-depth: 1 (isSyncing prevents re-entrance)
 */
export const linkedEditingMiddleware: Middleware = ...
```

A custom lint rule enforcing this header is **deferred to a follow-up issue** (B3-state Sec 4.5). Until that lint lands, enforcement is via review. Grep `@cascade` enumerates the cascade population at any moment.

### Inventory (canonical enumeration)

The codebase has 5 cascade middlewares with 8 sub-cascades total. Any new cascade must be added here as part of the same PR.

| Middleware | Sub-cascades | Shape | Undo grouping | File |
|---|---|---|---|---|
| `linkedEditingMiddleware` | 1 | sym 1↔1 (mirror/instance) | groups (BUG-7) | `src/store/linkedEditingMiddleware.ts` |
| `gradingStalenessMiddleware` | 1 | obs 1→1 idempotent | does not group (metadata) | `src/store/gradingStalenessMiddleware.ts` |
| `confirmationMiddleware` (a) | intercept-defer-replay | replay via `meta.skipConfirmation` | n/a (single action) | `src/store/confirmationMiddleware.ts` |
| `confirmationMiddleware` (b) | tool-memory mirror | obs 1→1 | does not group | `src/store/confirmationMiddleware.ts` |
| `confirmationMiddleware` (c) | tool-memory auto-apply | 1→N fan-out | does not group | `src/store/confirmationMiddleware.ts` |
| `reactiveSolverMiddleware` (a) | removePoint observation | obs 1→1 | does not group | `src/store/reactiveSolverMiddleware.ts` |
| `reactiveSolverMiddleware` (b) | trigger chain (Phase 1 sync + Phase 2 async) | chain multi-stage | does not group (solver state, not user action) | `src/store/reactiveSolverMiddleware.ts` |
| `undoMiddleware` | self-dispatch + control consumer | mechanism | n/a (is the mechanism) | `src/store/undoMiddleware.ts` |

### `batchUndo()` helper

`batchUndo(dispatch, label, fn)` (exported from `src/store/undoMiddleware.ts:102`) wraps multi-dispatch operations from call-sites in a single undo entry via `undo/startBatch`/`endBatch` control actions. 5 callers:

- `src/copilot/action/tools/definitions/trimTools.ts:421, 474`
- `src/components/PatternEditor/useTrimTool.ts:153`
- `src/components/BottomPanel/GradingTab.tsx:174, 238`

Per Cascade vs orchestration distinction below, `batchUndo()` is **orchestration with cascade-adjacent batching** — the caller controls what dispatches; the middleware controls how they group in undo.

### Cascade vs orchestration distinction

The distinction matters because cascade middleware decides undo policy uniformly (in the middleware), while orchestration decides error/loading policy per phase (in the caller). Conflating the two breaks the future E-async-states sub-track decision boundary.

**Cascade middleware:** a middleware in `src/store/*Middleware.ts` intercepts an action and emits one or more secondary dispatches without the call-site knowing or controlling. The call-site dispatched 1 action; the system ends with N+1 actions.

**Orchestration:** a caller (component, hook, thunk, tool implementation) dispatches action A explicitly, awaits a result/state-change, dispatches action B explicitly. The caller controls the sequence. Each dispatch corresponds 1:1 to an intent of the caller.

**Operational test:** does the call-site know that B will be dispatched as a consequence of A?
- Yes + dispatches B explicitly → orchestration.
- No → cascade middleware.

**Resolved case — `batchUndo()`:** the helper exposes the `undoMiddleware`'s control actions to the call-site. The caller dispatches actions explicitly (orchestration), but the wrapping with `undo/startBatch`/`endBatch` is delegation to the middleware (cascade-adjacent). Classification: **orchestration with cascade-adjacent batching**. The caller controls what is dispatched; the middleware controls how it groups in undo. Not "pure cascade middleware" because the middleware does not generate new actions, only controls snapshotting.

**Resolved case — `AgenticLoop` (`src/copilot/reasoning/bridge/AgenticLoop.ts`):** sequential awaits, caller dispatches each tool execution explicitly. **Orchestration.** Out of scope of B3-state cascade convention. Error handling / loading state propagation belongs to E-async-states sub-track when it runs.

### Reopen triggers

Reopen B3-state Fase 2 (per § 7 of the Fase 2 doc) if any of:

1. A new cascade emerges that does not fit any of the 6 inventoried primitives (boolean re-entrance, generation counter, idempotent-no-guard, meta flag, control actions, cross-slice extraReducer).
2. A legitimate cascade-of-cascade case (depth > 1) that cannot be rewritten as orchestration.
3. `meta.cascadeOf` runtime debugging becomes a real need (not addressable via stack trace + Redux DevTools).
4. The lint rule (when implemented) generates persistent false positives after 1 month warning-only.
5. An ambiguous cascade-vs-orchestration case the operational test does not resolve.
6. E-async-states decides error handling for async chains in a way that forces re-evaluation of B3-state convention.

## Action meta flags (B3-state ratified)

Cross-ref: `docs/reports/2026-04-30-drift-fase2-b3state-cascade-middleware.md` § 2.3 (P4 primitive) + § 4.3.

The codebase uses 2 active `meta.*` flags on Redux actions, both consumed by `confirmationMiddleware`:

### `meta.skipConfirmation`

**Purpose:** bypass `confirmationMiddleware` destructive-action gating. Used by call-sites that have already obtained user consent through an alternate path (auto-merge cleanup, split cleanup, copilot rollback, replay after explicit confirm).

**Pattern:**

```ts
dispatch({ ...removePiece(piece.id), meta: { skipConfirmation: true } });
```

**7 callsites** (canonical enumeration; new uses must be added here):

- `src/copilot/action/tools/definitions/patternOpsTools.ts:133, 401, 745` — auto-merge / split cleanup / createPiece rollback.
- `src/components/PatternEditor/useMergeTool.ts:135, 139, 140` — merge result + merge sources.
- `src/components/PatternEditor/useScissorsTool.ts:153` — cut original (with comment-only mention at `:152`).
- `src/components/CopilotPanel/CopilotUIOverlay.tsx:68` — replay after user confirms in dialog.

### `meta.fromToolMemory`

**Purpose:** internal flag used by `confirmationMiddleware` tool-memory cascade (sub-cascade c) to prevent its own re-entrance into the tool-memory mirror cascade (sub-cascade b). The auto-apply re-dispatches `tools/setToolOption` with this flag; the mirror skips when the flag is present.

**Internal only** — not used at call-sites outside `src/store/confirmationMiddleware.ts`.

### Policy for introducing new `meta.*` flags

A new `meta.*` flag requires:

1. Addition to this section with purpose + callsites pattern.
2. Justification of why the flag is needed instead of an alternative (control actions, `@cascade` header, refactor of the consuming middleware).
3. Inline comment at the introduction site explaining the flag's semantic.

If a flag's callsites grow past ~10 sites or a third flag is introduced, reopen B3-state Sec 3.1 to evaluate whether the convention needs hardening (lint rule for flag inventory, type-level enforcement, etc.).

## Fabric assignment patterns (B10-state Par 1 ratified)

Cross-ref: `docs/reports/2026-04-30-drift-fase2-b10state-par1-fabric-write-surfaces.md` (full Fase 2 doc with 3 sub-decisiones, 7 write surfaces clasificadas, deudas técnicas).

Cross-ref: `docs/reports/2026-04-30-drift-fase2-b10state-par2-measurements-ratification.md` (Par 2 — `parametric.baseMeasurements` misclassification).

### Contract: source-of-truth + transient cache + sync hook

Three concerns separated by slice:

```
project.pieces[].fabricId   ← SOURCE OF TRUTH (persistent, source on reload)
        │
        │ + active colorway override
        ▼
useColorwaySync             ← uni-directional sync (project + colorway → sim)
        │
        ▼
simulation.pieceFabrics     ← TRANSIENT CACHE (sim runtime, override-able by colorway)
                              also written directly by transient-preview UI surfaces
```

**Persistent writes:** use `project/setPieceFabric` — single-field, concurrency-safe rollback, source-of-truth update. Sim cache propagates derivativamente via `useColorwaySync`.

**Transient writes:** use `simulation/setFabric` — sim-only, restored to `project.fabricId` when active colorway clears. Used by MaterialTab/SimulationView (preview panels) and useColorwaySync (sync hook itself).

**Reads from sim runtime** (cloth simulation, render): keep reading `simulation.pieceFabrics` — it's the derived cache that reflects current state including colorway overrides.

### Write surface taxonomy

| Surface | Action | Slice | Persistent? | Notes |
|---|---|---|---|---|
| `PieceProperties.tsx:96` | `updatePiece({...piece, fabricId})` | project | yes | Persistent properties panel, batches multiple field changes |
| `groupTools.ts:126` + `setGroupFabric` | `setGroupFabric` | project | yes | Group operation, batches across pieces in group |
| `MaterialTab.tsx:82` | `setFabric` | sim | **no (transient)** | Preview panel, sibling de tint/opacity/UV/textures (all transient by design) |
| `SimulationView.tsx:257` | `setFabric` | sim | **no (transient)** | Sim sidebar, sibling de Per-Piece Freeze |
| `useColorwaySync.ts:40,42` | `setFabric` | sim | **no (sync)** | The sync hook itself |
| `fabricTools.applyFabricToPiece` | `setPieceFabric` | project | yes | Copilot persistent apply with concurrency-safe rollback |
| `actionExecutor.set_fabric` | `setPieceFabric` | project | yes | Legacy copilot action shape |

### When to use which

**`project/setPieceFabric`** — when the user's intent is "this piece should have this fabric persistently" (copilot tools, programmatic apply, group operations done at piece-level).

**`simulation/setFabric`** — when the write is a preview, simulation tweak, or sync result. Sibling of other transient sim properties (tint, opacity, UV, emission, texture overrides). The change is expected to NOT survive page reload or colorway switch unless backed by a persistent write upstream.

**`updatePiece({...piece, fabricId})`** — when fabric is changing alongside other piece fields in a single user action (e.g., PieceProperties panel that batches multiple updates). Persistent equivalent of `setPieceFabric` but full-piece shape.

### Reopen triggers

Reopen B10-state Par 1 (per § 7 of the Fase 2 doc) if:

1. A new copilot tool writes fabric and chooses `setFabric` (transient) — that means the convention from this section was missed; either the tool is misclassified or the convention is unclear.
2. The single-field shape of `setPieceFabric` becomes insufficient (e.g., a tool needs to update fabric + outline atomically with rollback).
3. A new UI surface needs persistent fabric write — verify it uses `setPieceFabric` or `updatePiece`, not `setFabric`.
4. `setFabric` callsites grow past ~5 sites — evaluate if all are legitimate transient or if the convention is being violated.
5. Lint rule for target slice enforcement is implemented (follow-up issue) — reabrir si emerge false positives or new convention edges.

## Entity collections shape policy (B2-state ratified)

Cross-ref: `docs/reports/2026-04-30-drift-fase2-b2state-entity-collections.md` (full Fase 2 doc with 4 sub-decisiones, 38 collections inventariadas, 0 EntityAdapter usage).

### Shape decision table

For each new entity collection in a Redux slice, choose shape according to triggers:

| Shape | Triggers (all should apply) | Examples (current codebase) |
|---|---|---|
| **Array `Entity[]`** | Entity has lifecycle (CRUD); ordering matters; iteration is dominant access | `pieces`, `seams`, `points`, `bodies` (23 collections) |
| **Record `<entityId, attribute>`** | Per-entity transient attribute; entity lifecycle lives elsewhere; sparse (not all entities have it) | `pieceFabrics`, `pieceTints`, `arrangementOverrides` (~10) |
| **Record `<key, value>` (non-entity key)** | Key is a non-entity (layer number, tool id, size name, plugin id) | `layerNames`, `toolMemory`, `pluginErrors` (~5) |
| **EntityAdapter** | See § "EntityAdapter adoption" below — opt-in with explicit triggers | (0 current; first adoption pioneers the pattern) |

**Operational test for new collections:** does the collection contain entities with their own lifecycle (creation, mutation, deletion, ordering)?

- **Yes + ordering matters** → array.
- **Yes + ordering not load-bearing + lookup ratio is low** → array (default; do not introduce Record solely for lookup speed).
- **No (it's a sparse attribute derived from an entity in another slice)** → `Record<entityId, attribute>`.
- **No (it's config / metadata indexed by a non-entity key)** → `Record<key, value>`.
- **Any of the above + EntityAdapter triggers** → consider EntityAdapter (§ next).

> "Ordering matters" is orientative, not greppable. Edge cases (e.g., a collection where ordering is not load-bearing but conveniente) require judgment. The 38 current collections fit this table without ambiguity.

### EntityAdapter adoption

Redux Toolkit `createEntityAdapter` is **not used** anywhere in the codebase (0 sites). Adopt only when **at least 2** of the following triggers apply for the new collection:

1. **Large size:** typical production count >500 entities.
2. **High lookup ratio:** lookups by id are >10× more frequent than full-array iteration.
3. **Complex CRUD:** add/update/remove/upsert with identical logic across reducers benefits from the prefab.
4. **Ordering + lookup simultaneously:** the collection needs stable order + efficient lookup at once (the `{ ids[], entities{} }` shape provides both).

Without ≥2 triggers, prefer array entity or Record attribute per the shape decision table.

The first slice to adopt EntityAdapter pioneers the pattern — document the migration explicitly so subsequent adopters have a precedent. "Lookup ratio high" is a heuristic; verify post-hoc with profiling if doubtful.

### Cross-slice references

When a slice references entities owned by another slice, three categories are legitimate. Document inline at the introduction site which category applies.

| Category | When to use | Example |
|---|---|---|
| **Cross-slice cache** | Sparse attribute derived from entity, lives in transient slice (sim, render); source-of-truth in another slice; explicit sync mechanism (hook/middleware) | `simulation.pieceFabrics` ← sync from `project.pieces[].fabricId` via `useColorwaySync` (B10-state Par 1) |
| **Cross-namespace bridge** | Two slices manage semantically related entities with their own identity; this slice maps IDs between namespaces; does NOT duplicate entities | `construction.pieceIdentityMap` (construction piece id → project piece id) |
| **Cross-slice ID reference** | This slice maintains array/Record of IDs referencing entities in another slice; lookup via cross-slice selector | `parametric.generatedPieceIds` (refers to `project.pieces`) |

**Anti-pattern (denormalization without coordination):** a slice duplicates fields of entities owned by another slice without sync mechanism or bridge purpose. If observed, treat as smell — coordinate via cache (with explicit sync) or refactor to bridge/ID reference.

### Lookup convention (forward-only)

The codebase has ~400 `.find(p => p.id === X)` callsites against slice entity collections (verified across components, store, copilot). All are off the frame-loop hot path. They are **preserved as-is** — no retroactive migration.

For **new callsites and slices** going forward:

1. Slices with collections of significant size (≥10 readers, or growing usage) **export memoized selectors** using `createSelector` (precedent: `bomSlice.ts` selectors, ratified by B4-state).
2. The convention is `selectXById` returning either the entity or `undefined`:

   ```ts
   // projectSlice.ts (forward-only example)
   export const selectPieceById = createSelector(
     [(state: RootState) => state.project.pieces, (_state, id: string) => id],
     (pieces, id) => pieces.find(p => p.id === id)
   );
   ```

3. New callsites use the exported selector instead of inline `.find()`:

   ```ts
   const piece = useSelector(s => selectPieceById(s, pieceId));
   ```

4. **Existing 400 callsites are NOT migrated retroactively.** Migration is opportunistic — when a callsite is touched for another reason, prefer the selector. A custom eslint rule (follow-up issue) provides gradual enforcement via warning.

5. **First selector export is per-slice deferred.** B2-state Fase 3 does not introduce selectors per-slice. The first slice to export `selectXById` (likely `projectSlice`) does so when the slice is touched for another reason.

### Inventory snapshot (2026-04-30)

23 array entity collections in 9 slices, 15 Record collections (per-entity attribute or non-entity metadata), 0 EntityAdapter. ~400 inline `.find` callsites preserved. 1 cross-slice cache (fabric, B10-state Par 1), 1 cross-namespace bridge (`pieceIdentityMap`), 1 cross-slice ID reference (`generatedPieceIds`). 1 slice with `createSelector` exports (`bomSlice`, B4-state).

### Reopen triggers

Reopen B2-state if:

1. Performance bottleneck verified in an entity collection caused by O(n) lookup. Evaluate per-slice migration to Record or EntityAdapter.
2. A new collection does not fit any of the 4 shapes (e.g., legitimate hybrid, queue/stack semantics).
3. A new cross-slice reference does not fit any of the 3 legitimate categories.
4. Lint rule (follow-up) generates persistent false positives after 1 month warning-only.
5. EntityAdapter first adoption occurs — document explicitly as precedent.
6. Selector exports generalize to >5 slices — evaluate whether mass migration of the 400 sites is now warranted.

## Diagnostic types (D7 ratified)

Cross-ref: `docs/reports/2026-04-30-drift-fase2-d7-validation-diagnostic-types.md` (full Fase 2 doc with 3 sub-decisiones, lifecycle ortogonal verified).

Two diagnostic types coexist with distinct lifecycles. They are **intentionally separate** — not drift.

| Type | File | Lifecycle | Severity set | Type field | Anchors |
|---|---|---|---|---|---|
| `ValidationDiagnostic` | `src/utils/projectValidator.ts` | Boundary parsing during `loadProject` | 3 (`error`/`warning`/`info`) | `code: ValidationCode` enum strict | `pieceId`/`seamId`/`field` (entity-specific) |
| `Diagnostic` | `src/diagnostics/types.ts` | Runtime user inspection (right-click → Inspect) | 4 (adds `critical`) | `category: string` free-form | `detail: string` free-form |

### When to use which

- **`ValidationDiagnostic`** — load-time validation rules; emit during `loadProject` to flag entries that were rejected, quarantined, or need user attention post-load. Persisted in `projectState.loadDiagnostics`.
- **`Diagnostic`** — runtime user-triggered inspection via the Inspector subsystem (`src/diagnostics/ruleEngine.ts`). Transient in `inspectorState.diagnostics` (cleared on target change). Use `'critical'` severity for UX blockers.

### Why not unified

The 2 types have ortogonal lifecycles and **0 cross-type callsites** in the codebase. Severity sets, anchor models, and type field semantics differ intentionally per-lifecycle. Unifying with a base type or discriminated union would force shared fields that are unstable (severity sets diverge) without enabling any real shared utility.

### Reopen triggers

Reopen D7 if:

1. A third Diagnostic-like type emerges with shared fields against one of the 2.
2. A site needs to render `ValidationDiagnostic` in `InspectorTab` (or vice versa) — design adapter shape post-hoc with the concrete use case.
3. A shared utility cross-type emerges (formatter, severity ranker, grouping helper) that requires a union type.
4. Severity sets converge (e.g., loader emits `'critical'`, or inspector drops it).
5. Type fields converge (e.g., `category` becomes strict enum, or `code` becomes free-form).

## Layer policy (D5 ratified)

Cross-ref: `docs/reports/2026-04-30-drift-fase2-d5-layering-violations.md` (full Fase 2 doc with 3 sub-decisiones, 24 archivos cross-layer clasificados).

The codebase organizes code by **feature ownership**, not by formal layered architecture. There is no `eslint boundaries` plugin, no `no-restricted-paths` rule, and no formal layer infrastructure. This is intentional.

### Feature ownership reading

A feature (e.g., copilot, skills, plugins) may have its UI live in `src/components/` AND its logic live in `src/copilot/` (or equivalent). Imports between those directories are legitimate when both belong to the same feature. The split between `components/` and `copilot/` is **organizational** (React convention), not architectural.

24 cross-layer imports from `src/components/*` to `src/copilot/*` exist as of 2026-04-30. All are legitimate under feature ownership:

- **Copilot Panel UI** (~13 files) — `CopilotPanel/*`, `CommandBar/CommandBar.tsx`, `shell/UnifiedBarChat.tsx`, `shell/UnifiedBarSettings.tsx`. Feature-owned by copilot.
- **Skill marketplace UI** (~5 files) — `SkillMarketplace/*`, `ExportSkillModal/`. Sub-feature of copilot.
- **Plugin manager UI** (~1 file) — `PluginManager/PluginManager.tsx`. Sub-feature.
- **Setup/config UI** (~1 file) — `SetupWizard/SetupWizard.tsx`. Provider config.
- **Cross-feature integrations** (~3 files) — `BottomPanel/BottomPanel.tsx` (proactive analysis), `TemplateLibrary/TemplateLibrary.tsx` (garment analyzer), `Workspace/Workspace.tsx` (key handler factory). Explicit entry points where shell/integration code invokes copilot logic.

### Decision rule for new cross-layer imports

When introducing a new `import` from `src/components/*` to `src/copilot/*`:

- **Legitimate:** the importing component is part of a feature that owns code in both directories (e.g., adding a new `CopilotPanel/*` component, or extending `SkillMarketplace/`).
- **Legitimate:** the importing component is the explicit entry point for cross-feature integration (e.g., shell layout invoking copilot via a documented function).
- **Smell:** an unrelated component (e.g., a 2D pattern editor tool, a dialog) imports deep copilot logic without feature ownership justification. Treat as drift signal — refactor to remove the import or document why the cross-feature integration is correct.

### Reopen triggers

Reopen D5 if:

1. A "random violation" emerges — an unrelated component imports deep copilot without feature ownership rationale.
2. Subsystem copilot refactor reorganizes imports significantly.
3. A separate sub-RFC introduces formal layered architecture; that sub-RFC supersedes D5.
4. Cross-layer file count grows past ~40 (currently 24) without convention updates.
5. An eslint plugin like `boundaries` is introduced for another reason (e.g., WASM↔JS layering); evaluate whether TS-side enforcement now applies.

## Dart representation (D1-real ratified)

Cross-ref: `docs/reports/2026-04-30-drift-fase2-d1real-dart-internalline.md` (full Fase 2 doc with 3 sub-decisiones, git blame analysis confirming enrichment intent).

Two representations of a dart coexist with distinct roles. They are **intentionally dual** — not migration drift.

```
storage layer (persisted with project):
  pieces[].internals  ←  InternalLine[] (7 types via discriminated union)
                          │
                          │  (variant 'dart' specifically, path: PathCommand[])
                          ▼
                          dartEntity.extractDartFromInternal() / extractDarts(piece)
                          ▼
domain layer (computed, optionally cached):
  pieces[].darts?     ←  Dart[] (rich semantic structure:
                          intake, apex, legs[2], foldDirection, capShape)
                          │
                          │  domain operations (adjustDartIntake,
                          │  segmentDart, shapeDartCap)
                          ▼
                          new InternalLine{type:'dart'} (back to storage)
```

### When to use which

| Use case | Representation |
|---|---|
| Persistence, project save/load | `InternalLine{type:'dart'}` (storage primitive) |
| 2D render (`PieceRenderer.tsx`) | `InternalLine{type:'dart'}` (path data) |
| DXF import/export | `InternalLine{type:'dart'}` |
| Domain operations (adjust intake, segment, shape cap) | `Dart` entity (rich semantic) |
| Geometric transformations (slashAndSpread rotations/translations/splits) | `Dart` entity |
| Copilot tools that reason about dart structure | `Dart` entity (via `extractDarts`) |

**Decision rule:** if the operation needs `intake`, `apex`, `legs`, `foldDirection`, or `capShape` — use `Dart` entity. If it just needs the path (storage, render, mirror, DXF) — use `InternalLine{type:'dart'}`.

### Bridge module — `src/utils/dartEntity.ts`

All bidirectional conversion + domain operations are concentrated in this module. Consumers should NOT replicate conversion logic locally.

Functions:
- `extractDartFromInternal(line, edges?)` — single InternalLine → Dart.
- `extractDarts(piece)` — bulk extraction; `pieces[].darts ?? extractDarts(piece)` is the lazy-cache idiom.
- `adjustDartIntake(dart, deltaMm)` — domain op.
- `segmentDart(dartLine, segments, ...)` — emits N new InternalLines.
- `shapeDartCap(dart, capShape)` — generates new path.

### Why not unified

The shapes are structurally orthogonal: `path: PathCommand[]` cannot capture intake/apex/legs/foldDirection/capShape semantics. Killing `Dart` entity would lose expressiveness; killing `InternalLine{type:'dart'}` would break consistency with the 6 other internal line variants. The dual representation is the right shape — git blame confirms it was introduced as enrichment (commit `433f8399` "Rich Dart Entity — structured dart data on PatternPiece"), not migration.

### Reopen triggers

Reopen D1-real if:

1. Dual maintenance accidental detected — a consumer mutates `piece.darts` without re-syncing `piece.internals` (or vice versa) bypassing the bridge module.
2. A third dart-like representation emerges (e.g., a copilot tool defining its own `DartView`).
3. The bridge module gets bypassed systematically in new code.
4. `pieces[].darts` becomes required (not optional cache) — evaluate whether `InternalLine{type:'dart'}` can be deprecated.
5. Domain operations emerge for other `InternalLineType` variants (`pleatEntity.ts`, `notchEntity.ts`); evaluate whether the pattern should generalize.

## Drift-axis investigation methodology

When investigating a drift axis that may span multiple naming conventions (e.g., the same kind of helper named `uid` / `cid` / `generateId` / `genXxxId` / etc.), grep on the **underlying primitive**, not on the canonical name. For ID generators specifically:

```bash
# Date.now() in template literals — catches any timestamp-based ID
grep -rn "\`[^\`]*\${Date\.now()" src --include="*.ts" --include="*.tsx" | grep -v test

# Counter increments at module level — catches any counter-based ID
grep -rn "^let [a-zA-Z_][a-zA-Z_0-9]* = 0" src --include="*.ts" --include="*.tsx" | grep -v test

# Tests asserting prefix format — catches load-bearing format contracts
grep -rn "toMatch.*\^[a-z][a-z_-]*-" src --include="*.test.*"
```

**Inventory axis counts are lower bounds, not upper bounds.** The expected multiplier varies by structure:

- **Structured axes** (slices enumerable by `glob('*Slice.ts')`, type-tagged entities, components in a specific dir): ~1.0–1.3x. Inventory tends to be close; refinements are within categories rather than scope expansions.
- **Dispersed axes** (helpers ad-hoc, inline patterns, multi-naming): 1.5–3x. Inventory is a starting point; expect significant expansion via the underlying-primitive grep methodology above.

Surface the discrepancy honestly when it appears mid-investigation; "investigation methodology was too narrow" is a valid and important finding.

### Pre-investigation: check for pre-existing canonical infrastructure

Before proposing a canonical for any drift axis, **first check whether the codebase already has formalized infrastructure that resolves the axis**. Patterns to grep for:

- `src/**/*Registry.ts`, `*Manifest.ts`, `*Catalog.ts` — central registries.
- Tests named `*Coverage.test.ts`, `*Invariant.test.ts`, `*Reset.test.ts` — enforcement of policies.
- Inline comments `// canonical:`, `// invariant:`, `// MUST:` — design ratifications.
- Custom lint rules, schemas, type-level constraints.

The drift inventory is a snapshot of the codebase state at inventory-write time. **Between inventory time and Fase 2 time, the team may have shipped canonical infrastructure that resolves the axis without the inventory being updated.** When pre-existing canonical is found, the right output is a **ratification doc** (5–10 lines documenting the existing canonical + sanity check that it works), NOT a canonical proposal followed by Fase 3 migration.

Triggers indicating "this axis is already resolved":

- Central registry file enumerating the domain of the axis.
- Test asserting completeness (every entity in domain X is in registry Y).
- Documented reasons inline for design decisions (`// reason: ...`).

Add this as the first ~5–10 minute step of every Fase 2 investigation. The cost is trivial; the savings on axes already resolved is large.

#### Read contents, don't list directories

When a directory appears in the initial investigation, **listing it and categorizing by name or intuition is not enough**. Read the relevant contents explicitly.

- **Anti-pattern:** "geometry/ — utilidades puramente geométricas, no es candidate para C5" — when `geometry/coords.ts` inside has exactly the helper that C5 proposes to create.
- **Correct pattern:** "geometry/ — leí coords.ts (`screenToPattern` ya existe), transform.ts (handles, no relevante), distance.ts (geom pura, no relevante); de los 15 archivos, coords.ts y transform.ts:68 son relevantes a C5".

The directory's name and the author's prior beliefs about what's inside are not evidence. Reading the file is.

**Precedente C5 (2026-04-29):** the C5 Fase 2 doc initially categorized `src/utils/geometry/` as "no candidate" without reading its contents. `geometry/coords.ts` exported `screenToPattern` (the exact helper C5 proposed creating) and was unused by 20 callsites in 16 files. Failure structurally identical to issue #640 (`formatDimension` exists but unused, 8 sites). Adversarial self-review of PR #641 detected the failure post-doc-commit; rule anchored here to prevent repetition in upcoming (b) ejes (B3-state, B6-state, A3, D3, etc.). Issue #642 captures the unused-helper drift independently.

The cost of reading the relevant files in the directory at inventory time is minutes. The cost of building a Fase 2 doc on the wrong premise is rebuilding it after a reviewer (or yourself, adversarially) catches the omission. Always read.

#### Verify divergence, don't assume uniformity by grep

When a grep returns N callsites with shape that "looks similar", do NOT assume N uniform implementations. Read the formula in each callsite before classifying as "uniformly migratable". Shape-similar can hide math-different.

- **Anti-pattern:** grep `rect\.left - pan` returns 20 hits across 16 files; conclude "20 uniform sites, mechanical migration". Doc claims "Cero divergencia semántica verificada" without reading each file.
- **Correct pattern:** for each hit, read the surrounding line. Verify operator order (e.g., `(screen - rect - pan) / zoom` vs `(screen - rect) / zoom - pan` are mathematically distinct under zoom != 1 + pan != 0). Classify each as "uniform" or "divergent" with explicit math.

**Precedente C5 (2026-04-29):** the C5 Fase 2 doc claimed "20 callsites uniform" for screen→pattern conversion. Adversarial self-review revealed `usePolyPenTool.ts:48-51` has a shape-similar formula `(screenX - svgRect.left) / zoom - pan.x` that is **mathematically incorrect** for the SVG transform `translate(pan) scale(zoom)` actually used. Pan applied after zoom division produces visible offset = `pan * (zoom - 1) / zoom` under combined pan + zoom. Bug latent for any user with non-zero pan and non-unit zoom — observable but undetected because preview/persistence used the same buggy `toPattern`, masking the divergence in the `CLOSE_THRESHOLD` self-test. Issue #642 split into "20 uniform sites" (commit 8a) + "1 divergent site" (commit 9 fix). The lesson: greps that look uniform may not be — read each match.

#### Look outside the obvious directory

When the drift pattern is **semantic**, not **structural**, consumers may live in directories you wouldn't search. Drift is defined by what code *does*, not where it lives. A grep filtered to the directory where a pattern "naturally appears" misses sibling consumers in adjacent directories.

- **Anti-pattern:** grep `THRESHOLD / zoom` constrained to `src/components/PatternEditor/` because that's where most threshold logic lives; conclude "13 sites" and stop.
- **Correct pattern:** grep `THRESHOLD / zoom` from `src/` root, filter by content (the pattern), not by path. If the eje is "screen-pixel snapping", any consumer of that concept is in scope, regardless of directory.

**Precedente C5 (2026-04-29):** the snapping count progression illustrates location bias. Inventory: 6 sites. Self-review iteration 1: 13 sites (still PatternEditor-centric grep). External reviewer: 18 sites (added some PatternEditor sites missed). Self-review iteration 2 with iterative refinement (after Sam's regla 1 v2): 23 sites. The +5 from the final iteration include `src/hooks/useElasticTool.ts:34` — same threshold semantic, different directory, missed by every prior grep that filtered to PatternEditor. Each iteration was better than the previous; the empirical lower-bound progression `6 → 13 → 18 → 23` is the cost of location bias compounded by primitive specialization.

This corolary co-applies with "Read contents, don't list directories": both are forms of the same parent rule — **inventory counts are lower bounds, and the path to the upper bound is iterative refinement of where you look and what you read.**

#### Sub-sweeps son contextuales, no autoritativos

Sub-sweeps hechos durante investigación de un eje (capturados como Apéndice o sección secundaria del Fase 2 doc de ese eje) son **contextuales al eje en curso**, no autoritativos para el eje futuro al que el sub-sweep apunta. Cuando ese eje futuro abre su propia investigación, debe correr su sweep autoritativo desde cero — el sub-sweep previo es input directo, no inventario cerrado.

**Origen:** D5 Fase 2 (2026-04-30) descubrió +167% más cross-layer archivos (24 vs 9) que el sub-sweep del Apéndice B de D1-cosmetic (2026-04-29). El undercount no invalida D1-cosmetic — el Apéndice B sirvió su propósito en context (sub-investigación de grainLine casing). Pero el sub-sweep narrow-foco no capturó el breadth scan que D5 requería.

**La regla:** el sweep del eje propio es autoritativo. Sub-sweeps son inputs.

Aplicación: cuando un Fase 2 doc futuro afirma "sweep ya pre-done en Apéndice X de eje Y", el refresh contra estado actual del codebase NO es opcional — es validation requerida. Si diverge >50%, declarar el sweep propio como autoritativo y notar la divergencia explícitamente en el doc; no rebuild la metodología del Apéndice X, capturar el delta y proceder.

### Distinguishing re-implementation from intentional feature

When an axis suspects "X re-implements Y", **verify the semantics before assuming drift.** Re-implementation with deliberately different semantics is a feature, not a drift.

Triggers that suggest the suspected re-implementation is actually intentional feature:

- Inline comments documenting the intention (`// keeping orbit target locked on...`, `// custom because we need to...`, `// behaves like X but with Y`).
- Helpers named specifically for the modification (`patchMouseButtons`, `customResize`, etc.) — the naming hints at intent.
- Tests verifying the specific divergent behavior.
- Co-located workarounds for the third-party library (suggesting awareness of the library's default).

When you find any of those near the suspected re-implementation, **pause and read** before proposing a canonical. Replacing intentional behavior with library default rewrites the user-visible behavior — that's a feature change, not a drift fix, and it violates the "comportamiento idéntico antes/después" invariant.

If after reading you confirm the re-implementation is intentional: close the axis as **no-drift, misclassified**. Document the misclassification in the ratification doc and the inventory annotation. Note that this can co-occur with **separate** real drift in the same area (e.g., a workaround pattern alongside intentional behavior) — capture those as their own follow-up issues, NOT folded into the original axis closure. Folding-in by proximity is silent scope creep.

### Process discipline: stop → notify → wait → execute

When a trigger fires mid-investigation or mid-fix, **physically pause**: write the report, list the options, wait for the user's verde, then execute. Do NOT decide-and-notify-post-hoc, even when the decision seems obvious. Speed never justifies relaxing the loop.

Triggers that fire (pause required):

- Scope-invalidating findings (size shift, hidden complexity).
- Class A/B classification ambiguity at specific sites.
- Findings suggesting a different axis is the real concern.
- Architectural decisions emerging where mechanical work was expected.
- Pre-existing canonical infrastructure discovered (per above).

Steps that don't fire (continue without pause):

- Listing → reading → consumer search → test search.
- Migration of declared-in-scope sites.
- Each commit's verification gates.

The line between "obvious decision" and "non-obvious decision" gradually blurs without this discipline. The cost of an extra round-trip is always smaller than the cost of an instilled bad habit.

### Resuming drift work across sessions

Sesiones nuevas que arrancan contra trabajo de drift previo deben empezar con un diff de commits desde el último cierre conocido. La forma de capturar ese delta depende del tamaño:

- **Delta chico** (1–3 commits sin cierres de eje y sin patrones canónicos nuevos en código): **actualización inline** en el doc relevante (`drift-inventory-fase1.md`, `drift-fase2-classification.md`, o el archivo de Fase 2 del eje activo). Sin archivo nuevo.
- **Delta grande** (5+ commits, cierres múltiples de ejes/bugs, patrones canónicos nuevos en código que cambian contexto downstream): emitir un **addendum dedicado** en `docs/reports/drift-inventory-addendum-{fecha}.md`. El addendum no reemplaza el inventario original — lo extiende, anotando solo el delta y reclasificaciones.

Regla anti-fragmentación: el addendum es excepción, no patrón por sesión. Si el delta no justifica un archivo dedicado, va inline.

Cuando el addendum identifica patrones canónicos que aparecieron en código durante el delta, distinguir explícitamente:

- **Precedente válido** — patrón intencional con scope claro, producto de una decisión de diseño explícita (no colateral de otro fix). Entra como input directo al eje correspondiente cuando llegue su Fase 2.
- **Precedente bajo evaluación** — patrón que emergió dentro de un fix puntual sin pasar por decisión de diseño para el eje futuro. Es candidato plausible, no canónico automático. La Fase 2 del eje correspondiente debe evaluarlo como una opción más, no asumirlo. Confundir las dos clases es ratificación por inercia — el anti-patrón que motivó reclasificar BUG-5 al scope de A7 RFC.

### Atomicity by default for unify commits

The unify commit (Fase 3) must be **atomic** — only the code that implements the canonical, nothing else. Documentation (Fase 2 docs, inventory annotations, lessons in CLAUDE.md), follow-up issue cross-links, and methodology updates go in **separate commits within the same branch**. The exception is documentation intrinsic to the code change itself (changelog entries, comment headers that the unify commit touches). Fase 2 docs are external context and always go in their own commit.

Within an audit branch, the typical commit order is:

1. Any methodology updates to CLAUDE.md.
2. Fase 2 doc with canonical proposal (or, for ejes in (b), options + tradeoffs + recommendation).
3. Approval gate from user.
4. Unify commit with code only.
5. Any follow-up issue references or inventory annotations.

Audit branches use the `drift/{ID}-{shortname}` naming convention (e.g., `drift/b5-state-middleware-patterns`). One branch per eje, one PR per eje. PR opens in draft after the Fase 2 doc commit; user approves the canonical via PR comment or chat; PR moves to ready-for-review after the Fase 3 unify commit lands; merged via standard merge commit (preserves all 3+ commits in main history).

### Audit philosophy: when to fix the real problem vs align for consistency

When an eje's investigation reveals that "drift" is the surface manifestation of a deeper architectural problem (e.g., a vestigial pattern, a workaround documenting a smell), there are two viable closures: **fix the real problem** (replace the smell with proper architecture) or **align for consistency** (formalize the existing pattern, accept the smell as documented technical debt). The right choice depends on the eje, with explicit criteria.

**Fix the real problem when** any of:

- The code smell has **observable impact** — bugs, performance degradation, silent regression risk in production.
- The blast radius of the fix is **containable** — does not open sub-ejes in cascade or require an architectural sub-RFC the eje did not anticipate.
- The problem **degrades over time** if not touched (e.g., compounds with new code being added against the smell).

**Prioritize consistency alignment when** any of:

- The smell is **stable** — does not manifest as bugs, does not degrade with time, contained to a known surface (often tests, internal utilities).
- The blast radius of the real fix is **disproportionate to the benefit** (e.g., requires touching many consumers or breaking public APIs for a smell that only affects internal layout).
- The "real fix" requires architectural decisions that **merit their own formal eje** (sub-RFC, dedicated investigation) rather than being bundled into a pattern-alignment commit.

These criteria are **not orthogonal** — they often point in opposite directions, and the closure is judgment. But they are anchorable and reproducible. The cobarde anti-pattern to avoid is **alignment with decorative documentation** (e.g., "by historical reasons" comments that ratify a smell as design without analysis) — that's worse than either real fix or honest pattern alignment.

When choosing alignment over real fix, the Fase 2 doc must capture the technical debt explicitly in a "Deuda técnica explícita post-unify" section, naming the smell and the conditions under which a future eje would be justified to take it on. This preserves the option to revisit when those conditions are met (e.g., the smell starts causing real bugs).

Origin: anchored in B5-state Fase 2 (2026-04-29) when middleware factory pattern was found vestigial. Philosophy applies to all subsequent (b) and (c) ejes where this tension appears.

### Verifying external infrastructure without implicit truncation

When checking the existence of external infrastructure (GitHub labels, files, canonical implementations, registry entries) before assuming a gap, **use commands that don't truncate by default**. The pattern that fails silently is "looked correct, gave false confidence":

- `gh label list | head -30` — caps at 30 labels, silently drops the rest. The correct form is `gh label list --limit 200` (or higher).
- `tsc --noEmit` — typechecks the root tsconfig which has `"files": []`, so it returns clean even when `src/` has compile errors. The correct form is `tsc -b --noEmit` (already documented under "Gate commands").
- `grep -l pattern dir/` — exits on first match per file, can miss multiple-match cases the next pipeline stage needs.
- `find . -name 'X' | head -10` — discards results past 10, hides true scope when the axis is dispersed.

The principle: **before concluding "X doesn't exist" or "the count is N", verify the command exposed the full set rather than a default-truncated slice.** This is the same trap as `tsc --noEmit` vs `tsc -b --noEmit` — the command that looks correct can give false confidence.

Origin: anchored during C8 Fase 2 (2026-04-29) after a `gh label list | head -30` call concluded that `severity:medium` and `follow-up` labels did not exist in the repo, when in fact both were present beyond the 30-line truncation. Issue #635 was opened with incomplete labels as a result, requiring retroactive correction. Apply this rule to any infrastructure check, not only label discovery.

### Inventory misclassification is itself drift to capture

When a Fase 2 investigation reveals that the inventory's classification of an eje is incorrect (drift cosmético that is actually architectural; drift that is actually intentional feature; drift that is actually three roles correctly distinguished; drift that no longer exists because canonical infrastructure pre-existed), close the eje by **ratification with the corrected classification**. Do NOT force the eje to fit the original inventory premise. The Fase 2 doc captures the reclassification as legitimate audit output — the inventory is corrected, not the code.

Repeated cases observed during the 2026-04-28/29 audit:

- **B12-state** — inventory said "drift cosmético, NEW_PROJECT reset coverage". Investigation revealed `newProjectRegistry.ts` + 27 invariant tests pre-existed. Closed by ratification, zero code change.
- **C7** — inventory said "drift, custom pan re-implements OrbitControls". Investigation revealed the custom pan is intentional feature with deliberately different semantics (preserves orbit-around-avatar). Closed as no-drift, misclassified.
- **B5-state** — inventory said "drift cosmético, factory vs const middleware". Investigation revealed factory pattern is vestigial (state at module-level in 5/5 middlewares regardless of pattern), making the question architectural (consistency vs real fix), not cosmetic. Reclassified (a) → (b). Closed via Option 1 (consistency alignment with explicit technical debt captured).
- **D1-cosmetic** — inventory said "drift cosmético, 3 casings of grainLine". Investigation revealed the 3 variants are 3 distinct linguistic roles (PascalCase types, camelCase properties, lowercase compound discriminated-union literals) all following TS standard and codebase precedent (InternalLineType + TopstitchMode siblings). Closed by ratification, zero code change.

Pattern recognized: the inventory was a rapid snapshot; deep investigation reveals real shape. Generalizes prior rule "Inventory axis counts are lower bounds, not upper bounds" → **inventory classifications are also starting points, not conclusions**. Ratification by reclassification preserves audit honesty and avoids forcing artifact-of-classification work.

When the reclassification is itself a useful artifact (e.g., D5 was downgraded from (a) to (b) during D1-cosmetic Fase 2 investigation), capture it as an appendix in the current eje's Fase 2 doc with cross-reference to the affected inventory entry, so the next session reading the inventory sees the correction without losing the original premise.

## Common Tasks

### Add New Fabric Preset

1. Edit `src/utils/cloth/physicalFabric.ts`
2. Add to `PHYSICAL_FABRIC_LIBRARY` array
3. Set realistic values based on textile properties

### Modify Cloth Physics

1. **Rust solver**: `crates/xpbd-wasm/src/lib.rs`
2. **JS fallback**: `src/utils/cloth/xpbdSolver.ts`
3. **Worker interface**: `src/utils/cloth/wasm/wasmSolverWorker.ts`
4. Rebuild WASM and copy both files

### Add Copilot Tool

1. Define tool schema in `src/copilot/tools/`
2. Register in tool registry with `registerTool()`
3. Implement execute handler returning `ToolResult`
4. Add optional rollback function for reversible operations

```typescript
// Example tool with rollback support
const result: ToolResult = {
  success: true,
  data: { /* result data */ },
  rollback: () => dispatch(restorePreviousState(snapshot))
};
```

## Copilot Bridge Architecture

The copilot uses a **Planner + Executor + Reasoner** pattern to minimize hallucination and ensure reliable execution.

### Flow

```
User Request → Planner (LLM) → Executor (no LLM) → Summary
                                    ↓ (on error)
                               Reasoner (LLM)
```

### Components

| Component | LLM? | Purpose |
|-----------|------|---------|
| **Planner** | Yes | Generates JSON execution plan |
| **Executor** | No | Runs steps, collects results |
| **Reasoner** | Yes | Handles errors (retry/ask/abort) |
| **SummaryGenerator** | No | Template-based output |

### Step Types

- **ExecuteStep**: Runs a tool directly, no LLM involvement
- **EvaluateStep**: LLM interprets results (e.g., "Is fit acceptable?")

### Variable References

Steps can reference previous results with `$stepId.field` syntax:

```json
{
  "type": "execute",
  "tool": "modifyEdge",
  "params": { "targetLength": "$measure1.result.length" }
}
```

### Enabling Bridge Mode

```javascript
localStorage.setItem('openclo-use-bridge', 'true');
```

### Key Files

- `src/copilot/bridge/ExecutionBridge.ts` - Main orchestrator
- `src/copilot/hooks/useBridge.ts` - React integration
- `src/copilot/features.ts` - Feature flags
- `docs/plans/2026-03-02-copilot-bridge-architecture-design.md` - Full design doc

## Collision Bodies

Any 3D mesh (OBJ/FBX/GLB/GLTF) can be imported as a collision body alongside the avatar.

### CollisionBody Redux Slice (`src/store/collisionBodySlice.ts`)

State: `{ bodies: CollisionBody[], selectedBodyId: string | null }`

Key actions: `addCollisionBody`, `removeCollisionBody`, `updateCollisionBodyTransform`, `updateCollisionBodyCollision`, `selectCollisionBody`, `setAnimationState`

### Multi-Body Collision Architecture

- Avatar collision mesh is entry `__avatar__` in the collision body array
- Each body gets its own `TriangleSpatialHash` for spatial queries
- Solver iterates all bodies per particle: `for (body of collisionBodies) { solveTriangleCollision(...) }`
- Per-body `friction` (0-1) and `margin`/offset (meters)

### Worker Messages

Both WASM and CPU workers support:
- `setCollisionBodies` — replace entire array
- `updateCollisionBody` — add/update single body by id
- `removeCollisionBody` — remove by id
- `setCollisionMesh` — backward-compatible (wraps as `__avatar__`)

### Key Files

- `src/types/collisionBody.ts` — CollisionBody interface
- `src/store/collisionBodySlice.ts` — Redux CRUD + selection
- `src/components/Viewport3D/CollisionBodyMesh.tsx` — R3F mesh + TransformControls gizmo + animation
- `src/components/Viewport3D/CollisionBodyPanel.tsx` — UI panel (import, friction/offset sliders)
- `src/utils/cloth/triangleCollision.ts` — `solveTriangleCollision` with friction param
- `src/utils/cloth/collisionMesh.ts` — `CollisionMeshData` + `collisionMeshFromBuffers` helper

## Reactive Solver Middleware

Automatically rebuilds pattern pieces when measurements or variables change. Two-phase pipeline with worker pool support.

### Flow

```
Trigger Action → Phase 1: Resolve Points (sync, < 16ms)
               → Phase 2: Build Pieces (debounced, main thread or worker pool)
```

### Trigger Actions

- `project/updateMeasurements` — body measurements changed
- `construction/setVariable` — construction variable changed
- `parametric/setVariableOverride` — slider moved
- `parametric/setVariableOverrides` — batch variable update
- `parametric/activateTemplate` — new template loaded

### Key Concepts

- **Generation tracking**: Each trigger increments `generationId`. Stale work is cancelled.
- **Adaptive debounce**: 50–400ms based on median of recent compute times.
- **Priority scheduling**: Selected piece builds first, then visible, then off-screen.
- **Main thread fallback**: Datasets under 50 points skip workers entirely.
- **Piece identity**: `pieceIdentityMap` in constructionSlice maps construction piece IDs to pattern piece IDs, enabling upsert behavior across rebuilds.

### API

```typescript
import {
  createReactiveSolverMiddleware, // Middleware factory
  getSolverMetrics,               // { totalResolves, computeTimes, cancelledJobs, errors }
  getSolverState,                 // { generationId, poolReady, pendingJobs, debounceMs }
  subscribeToComputingState,      // listener(isComputing: boolean) → unsubscribe
  getIsComputing,                 // Current computing state
  warmupSolver,                   // Pre-initialize worker pool
  shutdownSolver,                 // Cleanup pool + timers
} from './store/reactiveSolverMiddleware';
```

### Key Files

- `src/store/reactiveSolverMiddleware.ts` — Middleware implementation
- `src/types/reactiveSolver.ts` — Types (jobs, results, strategies, metrics)
- `src/workers/workerPool.ts` — Web Worker pool with priority queue
- `src/workers/workerProtocol.ts` — Serialization + transfer strategy
- `src/store/__tests__/reactiveSolverMiddleware.test.ts` — Integration tests

## Expert Mode (Click'n'Go)

Expert mode reduces confirmation dialogs and remembers tool settings for power users.

### State — workflowSlice

```typescript
interface WorkflowState {
  expertMode: boolean;
  confirmOverrides: Record<string, 'default' | 'always' | 'never'>;
  toolMemory: Record<string, Record<string, unknown>>;
}
```

- All fields persisted to `localStorage` key `'openclo-workflow'` with versioned envelope
- `confirmOverrides` keyed by operation name: `removePiece`, `removeSeam`, `removePoint`, `splitPiece`, `mergePieces`

### Confirmation Middleware

Sits first in custom middleware chain (before undoMiddleware). Intercepts destructive Redux actions (`project/removePiece`, `project/removeSeam`, `construction/removePoint`).

- `meta.skipConfirmation` flag bypasses the middleware (used by `useGuardedAction` for inner dispatches)
- `meta.fromToolMemory` flag prevents re-mirroring during auto-apply
- Also mirrors `tools/setToolOption` into `workflow.toolMemory` and auto-applies memory on tool activation

### useGuardedAction Hook

Guards non-Redux destructive operations (split, merge). Module-level `Map<string, () => void>` stores callbacks outside Redux for serializability. `resolveCallback(key)` retrieves and deletes in one call.

### Key Files

- `src/store/workflowSlice.ts` — State, reducers, localStorage persistence
- `src/store/confirmationMiddleware.ts` — Action interception + tool memory mirroring
- `src/hooks/useGuardedAction.ts` — Hook + callback store for non-Redux destructive ops
- `src/components/Toolbar2D/ToolButtonContextMenu.tsx` — Shift+right-click confirmation overrides

## Diagnostic Inspector

Right-click any piece → "Inspect" → instant data collection, rule-based diagnostics, and AI agent analysis in the bottom panel Inspector tab.

### Three-Layer Architecture

```
Right-click → "Inspect" → dispatch(setInspectionTarget)
  → useInspector hook:
      1. collectInspectionData (sync, from Redux)
      2. evaluateRules (sync, 13 checks)
      3. analyzeInspection (async, streams analysis)
  → InspectorTab renders results
```

### Data Collector

`collectInspectionData(target, state)` — pure sync function. Collects piece metadata, fabric properties, edge data, seam connections, internal lines, construction points, simulation metadata.

### Rule Engine

`evaluateRules(data)` — 13 deterministic checks. Severity levels: `error`, `critical`, `warning`, `info`. Checks: missing fabric, SA=0, no seams, body penetration, pressure points, missing grainline, etc.

### Agent Analyzer

`analyzeInspection(data, diagnostics, onChunk, signal)` — v1 uses rule-based analysis (LLM prompt scaffolding ready). Generates summary, explanations, and executable suggestions with `toolCall` objects.

### Key Files

- `src/diagnostics/types.ts` — InspectionTarget, InspectionData, Diagnostic, AgentAnalysis
- `src/diagnostics/dataCollector.ts` — Pure sync data collection
- `src/diagnostics/ruleEngine.ts` — Rule evaluation
- `src/diagnostics/agentAnalyzer.ts` — Agent analysis + prompt builders
- `src/store/inspectorSlice.ts` — Redux state
- `src/hooks/useInspector.ts` — Pipeline orchestration
- `src/components/BottomPanel/InspectorTab.tsx` — Inspector tab UI

## Architecture Notes

- **Solver Selection**: WASM preferred, JS fallback if WASM fails
- **Off-Thread**: Simulation runs in Web Worker
- **Zero-Copy**: WASM memory accessed directly via `positions_ptr()`
- **TSL Zero-Copy**: GPU solver uses TSL (Three Shading Language) for compute.
  `renderer.compute()` writes positions to `StorageBufferAttribute`, which the
  vertex shader reads via `material.positionNode` — no CPU readback per frame.
  Body collision uses CPU-built linearized BVH uploaded as StorageBufferAttribute,
  traversed by TSL collision kernel per particle per substep.
  GPU normals via atomic i32 accumulation (scale 1M) written to `normalNode`.
- **Edge Types**: 0 = WARP, 1 = WEFT, 2 = SHEAR

## References

- [Cloth Simulation Research](docs/research/cloth-simulation-research.md)
- [Fabric Calibration Guide](docs/research/fabric-calibration-guide.md)
- [Copilot Bridge Architecture](docs/plans/2026-03-02-copilot-bridge-architecture-design.md)
- [Architecture Spec](docs/specs/ARCHITECTURE.md)
- [Reactive Solver Middleware Design](docs/plans/2026-02-27-reactive-solver-middleware-design.md)
- [Click'n'Go Design](docs/superpowers/specs/2026-03-18-click-n-go-design.md)
- [Diagnostic Inspector Design](docs/superpowers/specs/2026-03-18-diagnostic-inspector-design.md)
