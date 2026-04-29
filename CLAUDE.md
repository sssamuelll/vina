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
├── core/                # Semantic garment engine
│   ├── geometry/        # Constraint-based geometry
│   └── pattern/         # Pattern piece operations
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
