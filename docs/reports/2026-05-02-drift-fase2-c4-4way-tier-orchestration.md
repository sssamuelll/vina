# Drift Fase 2 — C4: 4-way tier orchestration (TSL/WebGPU + WASM + CPU + Neural)

> **Eje:** C4 (último (c) RFC — cierra el bloque (c) 6/6).
> **Inventory framing:** "TSL / WebGPU compute coexiste con WASM/CPU activo. 3 paths activos simultáneamente. `GarmentSimulation.tsx:380-493` bifurca en `if (solver)` y duplica lógica de tools (steam brush, mesh grab) para los dos paths."
> **Reformulación post-sweep (regla 0 + 13):** la realidad post-A6 es **4 tiers** (CPU + WASM + GPU + Neural), no 3. La duplicación de tools tiene **dos ejes** (per-tier + per-input-system), no uno. La tool surface es **GPU + WASM only** por design (CPU + Neural carecen de tool dispatch by intent). El framing "drift real" del inventario sigue válido pero acotado.
> **Cross-refs:** A6 (`docs/reports/2026-05-01-rfc-a6-worker-protocol.md`), A7 (`docs/reports/2026-05-01-rfc-a7-wasm-cpu-equivalence.md`), A2 (`docs/reports/2026-05-02-drift-fase2-a2-cross-boundary-serialization.md`), A4 (`docs/reports/2026-05-02-drift-fase2-a4-cross-language-geometry-mesh.md`), C1 (`docs/reports/2026-05-01-rfc-c1-buffer-lifecycle.md`).
> **Inheritance:** C4 hereda 4-member `ClothSolverClient` lifecycle (A6) + `SolverCapabilities` 4-tier surface con `frameDriven` flag (A7+A6) + `configBridge.ts` CPU↔WASM (A2) + topology cleavage CPU vs GPU/WASM (A4) como surfaces ratificadas.
> **Estado:** Fase 2 doc — pendiente verde de Sam para Fase 3.

---

## Sección 1 — Decide / NO decide

### Decide en este eje

C4 RFC decide cinco cosas, organizadas como sub-decisiones ortogonales en Sec 3:

1. **Tool dispatch shape** for the 11 `if (solver) / else if (wasmClient)` bifurcations en `GarmentSimulation.tsx` (steam brush + mesh grab). Pattern 2.5 lite helper, Pattern 2.5 extend (capability flags only), Pattern 1 (interface `runTool` method), o ratify-as-is.
2. **Tier selection / activation policy** — status quo cascade GPU→WASM→CPU→Neural (`useSimulationLifecycle.ts:297-438`) vs capability-driven cascade vs user-driven explicit selection.
3. **WebGPU feature-flag hierarchy** — TSL/WebGPU está blocked por Three.js 0.183 atomicAdd bug (project memory `webgpu_blocked` verified — package.json sigue en `^0.183.2`). ¿localStorage opt-in (current) vs build-time flag vs auto-disable on detected version?
4. **Deprecation roadmap** — long-term, ¿4 tiers permanentes (cada uno con role distinto) o roadmap a fewer tiers (e.g., WASM reemplaza CPU TS, Neural reemplaza ambos)?
5. **TierCoordinator class introduction** — formalizar el de facto coordinator pattern (3 hooks: `useSimulationLifecycle` + `useCollisionBodies` + `useMeshing`) como class explicit, o ratificar status quo de hook composition.

### NO decide en este eje

- **`ClothSolverClient` interface shape** — A6 § 3.1.C ratificó el 4-member lifecycle subset (`start` / `stop` / `dispose` / `capabilities`). C4 NO extiende el interface (extender re-trigger compile-gate, violaría scope reduction de A6 § 4.5). Capability flags + helpers son surface aditiva, no interface modification.

- **Per-feature physics parity** (self-collision, LRA, pressure, fold, piece stiffness) — A7 § 3.1 ratificado con per-feature decisions + capability flags + UI surface. C4 hereda; los 6 follow-ups #676-681 quedan independientes.

- **Cross-boundary config serialization** — A2 § 3.2.B ratificó `configBridge.ts` Pattern 2.5 lite (CPU↔WASM translation helper); per-tier shape divergence preserved. C4 reopen trigger #4 de A2 fire **only si** sub-decisión 3.5 selecciona class extraction con full config bridging across all 4 tiers (Pattern 1).

- **Cross-tier worker protocol message shape** — A6 § 2.3 inventario message protocol divergente (CPU `init` vs WASM init bundling 5 fields). Setter migrations queued post-A6 (#683-689). C4 NO toca worker message shape; opera en consumer layer (React hooks + GarmentSimulation).

- **Topology extraction / mesh adjacency** — A4 § 3.2.B ratificado as-is con JSDoc cross-doc (CPU `xpbdSolver:421-456` vs GPU/WASM `gpuBuffers.ts` extractors). C4 reopen trigger #6 de A4 fire **only si** TierCoordinator class supersedes topology lifecycle. Sub-decisión 3.5.A (status quo) preserva A4 cleavage; 3.5.B (class extraction) trigger fire.

- **Setter migrations queued post-A6** (`#683` setWind / `#684` setPins / `#685` setFabric → consumer / `#686` gravity → setConfig / `#687` error uniform / `#688` init factory / `#689` callback adapter). Independent follow-ups; C4 closure observa pero no fuerza.

- **R3F handlers vs manual raycaster duplication** (TSL geometry-sync workaround; ~80 líneas duplicadas entre `handlePointerDown` ↔ raycaster `onDown` y `handlePointerMove` ↔ raycaster `onMove`). Es **rendering layer concern** (CPU geometry lags GPU positions, CPU readback timing), no orchestration. Captured como follow-up issue separado en § 6.5; sub-decisión 3.1.A consolidación helper deduplica los call-sites como side-effect, pero el motivador raíz (geometry sync) no es C4 territory.

- **Steam brush + mesh grab port to CPU/Neural tiers** — porting decisions per tool follow A7 per-feature port-or-ratify pattern. C4 sub-decisión 3.1 ratifica current coverage (steam brush GPU only; mesh grab GPU + WASM); ports queued como follow-ups si UX impact emerge.

### Por qué importa la línea

C4 cierra el último (c) RFC del audit (post-A2 closure 2026-05-02 `d37add43` — bloque (c) 5/6, C4 = 6/6). El framing inicial del inventario "tres solvers activos con duplicación de tool logic" sugiere drift mecánico (uniformizar bifurcaciones). El sweep refresh post-A6/A7/A2/A4 revela:

- **4 tiers, no 3** — Neural agregado post-A6 (Tier 4). 7° caso de inventory misclassification (regla 13 lineage: B12 + C7 + B5 + D1-cosmetic + D5 + A4 + A2 + **C4**).
- **Tool surface es feature-bounded por design** — Steam brush (GPU velocity damping) + mesh grab (GPU uniforms / WASM positional pin) son tier-specific feature manifestations, no drift uniforme. CPU TS + Neural carecen de tool dispatch porque sus models físicos no soportan la operación.
- **Pre-existing canonical hook composition** — `useSimulationLifecycle.ts` (575L) + `useCollisionBodies.ts` (40L) + `useMeshing.ts` (180L) ya orquestran los 4 tiers via composition. NO TierCoordinator class en codebase; NO tool dispatcher helper; SI hook-based pattern canónico.
- **Bifurcation count bounded** — 14 tier-aware dispatch sites en `GarmentSimulation.tsx` (1 archivo); de éstas, **5 son per-tier bifurcations** (`if (solver) ... else if (wasmClient)` shape: `handlePointerDown` grab + `handlePointerMove` grab + `releaseGrab` + raycaster `onDown` grab + raycaster `onMove` grab). Las otras 9 son single-tier dispatch (GPU-only o CPU+WASM-only sin bifurcation interna). Adicionalmente: +7 sites en `useSimulationLifecycle.ts` para setters/cleanup; +2 en `useMeshing` warm-start; +1 en `useCollisionBodies` pin sync. Total **~24 tier-aware dispatch sites en 4 archivos React-layer**, of which ~5 son true bifurcations strictly. Bounded scope.

C4 sin reformulación → Pattern 1 refactor (TierCoordinator class + uniform tool interface), opens cross-eje cascade (reopen A2 § 7 #4 + A4 § 7 #6 + A6 § 7 #2), unbounded blast radius. C4 con reformulación (regla 13 + 14) → Pattern 2.5 extend per-feature + capability flags + UI surface, ~5-7h F2 + ~3-5h F3, mirrors A7 precedent. **Calibration favors Pattern 2.5 extend dominant** (62% rule + Pattern 2.5 extend robust 4/4 post-A6).

---

## Sección 2 — Estado actual

### 2.1 Pre-existing canonical infrastructure check (regla 1)

**Resultado:** `useSimulationLifecycle.ts` ES coordinator hook canónico de facto (post-A6 documented).

```bash
grep -rn "TierCoordinator\|TierOrchestrator\|SolverOrchestrator\|tierCoordinator\|solverRegistry\|TierManifest\|solverManifest" src --include="*.ts" --include="*.tsx"
# (no output — 0 hits)
```

NO TierCoordinator/Orchestrator/SolverRegistry class anywhere. **Hook composition** is the de facto pattern:

- **`src/components/Viewport3D/useSimulationLifecycle.ts:217-575`** — owns 4-tier cascade (`startSim` async function lines 295-439 with GPU→WASM→CPU→Neural cascade), client refs (`gpuClientRef`, `wasmClientRef`, `clientRef` for CPU, `neuralClientRef`), wind/freeze/elastic dispatch (lines 524-561 across 4 useEffects), cleanup cascade (lines 449-457 + 466-474 + 478-483).

- **`src/components/Viewport3D/useCollisionBodies.ts:24-40`** — pin sync (WASM only).

- **`src/components/Viewport3D/useMeshing.ts:144-148`** — warm-start dispatch (CPU OR WASM with priority).

- **`src/utils/cloth/solverProtocol.ts:107-162`** (A6) — `ClothSolverClient` interface (4-member lifecycle subset).

- **`src/utils/cloth/solverCapabilities.ts:23-45`** (A7+A6) — `SolverCapabilities` interface + 4 per-tier constants (`CPU_CAPABILITIES`, `WASM_CAPABILITIES`, `GPU_CAPABILITIES`, `NEURAL_CAPABILITIES`).

- **`src/utils/cloth/configBridge.ts`** (A2) — CPU↔WASM config translation helper.

- **`src/components/Viewport3D/SimulationStatusOverlay.tsx:63-69`** (post-A7) — UI surface for "WASM tier limited features" warning. Mirrors capability-aware silent-absence UX.

Tool dispatcher search:

```bash
grep -rn "runTool\|dispatchTool\|toolDispatcher\|ToolDispatcher" src --include="*.ts" --include="*.tsx"
# Results: src/tools/registry.ts:50 toolRegistry — but for UI tools (PolyPenTool, FabricBrush definitions), not solver tools. Different domain.
```

Conclusion (regla 1): pre-existing canonical for **solver lifecycle + capability surface + config bridging** are present and ratified by A6/A7/A2. Pre-existing canonical for **cross-tier tool dispatch** is **absent** — the 5 per-tier bifurcations (within 14 tier-aware dispatch sites) in `GarmentSimulation.tsx` are inline. Sub-decisión 3.1 articulates the resolution shape.

### 2.2 Inventory claims verification (regla 0 + 13)

| Inventory claim | Reality post-sweep | Verdict |
|---|---|---|
| "3 paths activos simultáneamente (WebGPU/TSL feature-flagged off, WASM default, CPU TS fallback)" | **4 tiers** activos por design: CPU + WASM + GPU + Neural. Cascade GPU→WASM→CPU→Neural en `useSimulationLifecycle.ts:295-438`. Neural agregado post-A6 (`NeuralDrapeClient` 355L `src/utils/cloth/neural/neuralDrapeClient.ts`). | **Outdated — 4 tiers, no 3.** Regla 13 reformulation (7° caso del audit). |
| "WebGPU/TSL feature-flagged off" | Confirmed: `WEBGPU_FEATURE_FLAG_KEY = 'openclo-use-webgpu'` localStorage; `useSimulationLifecycle.ts:130-132 isWebGPUFeatureEnabled() returns localStorage === 'true'` (default false). Comentario JSDoc explica "Three.js 0.183 TSL atomicAdd doesn't propagate isAtomic to StorageBufferNode → WGSL declares array<i32> instead of array<atomic<i32>>. All compute shaders silently fail. WASM XPBD solver is used until a Three.js upstream fix lands." | Confirmed. **Three.js 0.183.2** still active per `package.json`. |
| "WASM default" | Confirmed: cascade fall-through encuentra WASM segundo (línea 360-398). `isWasmSolverAvailable()` async check con timeout 5s. | Confirmed. |
| "CPU TS fallback" | Confirmed: tercer en cascade (líneas 400-428). `ClothWorkerClient` Web Worker tier. | Confirmed. |
| "GarmentSimulation.tsx:380-493" | `useFrame` body actually 379-498. `if (solver) { TSL substeps }` block lines 386-454. CPU readback path 457-498. Inventory cited 380-493 — minor line drift (~2 líneas), substantive shape correct. | **Minor line drift**, framing intact. |
| "duplica lógica de tools (steam brush, mesh grab) para los dos paths: TSL usa uniforms; WASM usa setPins" | Confirmed at the per-tier level: GPU usa `tslSolverRef.current.grabNodes.{grabCenterX,Y,Z, grabActive, grabInitPending}` uniforms (lines 808-815, 870-872, 1024-1031) + `gpuClient.setBrushParams` for steam brush (lines 783-790). WASM usa `wasmClient.setPins(positions)` for mesh grab (lines 841-844, 879-882, 1054-1057). **Adicional:** la duplicación tiene **segundo eje** — R3F handlers `handlePointerDown/handlePointerMove` ↔ manual raycaster `onMove/onDown` (líneas 944-1069) — para resolver TSL geometry-sync (CPU geometry lags GPU positions; manual raycaster reads readback-updated geometry). ~80 líneas duplicadas entre los dos sistemas de input. | **Confirmed con caveat**: dual duplication (per-tier + per-input-system). |
| "Tres handlers afectados (handlePointerDown, handlePointerMove, raycaster)" | Confirmed: `handlePointerDown` (793-848), `handlePointerMove` (850-885), manual raycaster `useEffect` (944-1069 con sub-handlers `onMove` 965 + `onDown` 1010). | Confirmed. |

**Reformulación per regla 13 (7° caso):** "3 paths" → "4 tiers + tool surface es GPU+WASM-only por design." El framing original "drift real" sigue válido (tool dispatch coverage gaps + bifurcations duplicadas en R3F vs raycaster), pero el shape es Pattern 2.5 extend (capability gaps with bounded scope), no Pattern 1 refactor.

Lineage de regla 13 reformulations cumulativas:

| # | Eje | Inventory framing | Reformulación |
|---|---|---|---|
| 1 | B12-state | "drift cosmético" | `newProjectRegistry` + 27 invariant tests pre-existed |
| 2 | C7 | "drift, custom pan re-implements" | Custom pan = intentional feature (orbit-around-avatar) |
| 3 | B5-state | "drift cosmético, factory vs const" | Factory pattern vestigial; consistency alignment |
| 4 | D1-cosmetic | "drift cosmético, 3 casings" | 3 distinct linguistic roles |
| 5 | D5 | "layering violations" | Feature ownership legitimate |
| 6 | A4 | "Rust↔TS cross-language drift" | TS-internal cross-tier; Rust not consumer-facing |
| 7 | A2 | "config types unify cross-boundary" | Variant A/B ratified as-is + Variant C Pattern 2.5 lite |
| **8** | **C4** | **"3 solvers + tool duplication"** | **4 tiers + tool surface tier-feature by design** |

### 2.3 Inventario de los 4 tiers

| Tier | Worker | Client file | Lines | Capabilities (post-A6+A7) | Tool surface |
|---|---|---|---|---|---|
| **CPU TS** | `clothWorker.ts` | `clothWorkerClient.ts` | 418L | All physics true. `frameDriven: undefined` (animation loop internal). | `pinParticle`/`unpinParticle` (single-pin shape). NO steam brush, NO grab. |
| **WASM Rust** | `wasmSolverWorker.ts` | `wasmSolverClient.ts` | 380L | All physics false (post-A7-closure; ports queued #676-681). `frameDriven: undefined`. | `setPins`/`clearPins` (batch shape). USED for mesh grab fallback. NO steam brush. |
| **GPU TSL** | *(none — main thread)* | `gpuSolverClient.ts` | 770L + `tslSolver.ts` 743L | `selfCollision: false` (scaffolded but not dispatched per substep), `lra/pressure/fold/pieceStiffness: false` (no GPU implementation). `frameDriven: true`. | `setBrushParams` (steam brush via uniforms) + `grabStart`/`grabMove`/`grabRelease` methods on client + direct `tslSolverRef.current.grabNodes.*` uniform writes. **Full tool surface** — GPU is the canonical tool tier. |
| **Neural ML** | *(none — main thread)* | `neuralDrapeClient.ts` | 355L | All capabilities false (ML inference, not physics solver). `frameDriven: false`. | NONE — analytical drape doesn't expose per-particle interactivity. |

**Tool coverage matrix (verified per regla 0):**

| Tool | CPU | WASM | GPU | Neural |
|---|:---:|:---:|:---:|:---:|
| **Steam brush** (velocity damping for relaxation) | ✗ | ✗ | ✓ via `setBrushParams` + `tslSolverRef.brushNodes` uniform write | ✗ |
| **Mesh grab** (positional drag) | ✗ | ✓ via `setPins(positional)` + base+delta math in consumer | ✓ via `grabNodes` uniforms | ✗ |
| **Pin** (anchor vertex) | ✓ via `pinParticle(idx)` (single-pin) | ✓ via `setPins(batch)` (positional) | ✗ | ✗ |
| **Snapshot save/restore/delete** | ✓ | ✓ | ✗ | ✗ |
| **Wind** (live force) | ✗ (comment line 539) | ✓ `setWind(force)` 1-arg | ✓ `setWind(force, dragCoefficient)` 2-arg | ✗ |
| **Freeze pieces** | ✗ | ✗ | ✓ `freezePieces(ids)` | ✗ |
| **Elastics** | ✓ | ✓ | ✗ | ✗ |

**Driver analysis (regla 7 — distinguishing re-implementation from intentional feature):**

- **Steam brush GPU only** — TSL kernel `brushNodes` operates per-particle on velocity buffer in GPU memory (zero-copy hot path). CPU port would require velocity buffer access + worker postMessage round-trip. WASM tier could host equivalent in Rust (cost ~6-9h; medium UX value because steam brush is "polish" tool). **Intentional GPU-tier feature** for now.

- **Mesh grab CPU absent** — CPU XPBD has `pinParticle(idx)` (no positional update; freeze-at-current-position semantics per A6 RFC § 4.1 Q2). To support grab, CPU would need positional pin (similar to WASM `setPins(positional)`) — `#684 setPins canonical batch shape with freeze-vs-positional caveat` is the queued follow-up. **Coverage gap acknowledgeable**.

- **Mesh grab Neural absent** — Neural drape predicts vertex positions from rest mesh + body pose (PBNS/HOOD-style ML inference). NO per-particle positional pin in inference contract; grab would force runtime model surgery. **Architectural exclusion** (different domain — ML not physics).

- **Pin fragmented** — CPU `pinParticle` (single-pin freeze) vs WASM `setPins` (batch positional). #684 follow-up captures unification; A6 RFC § 4.1 Q2 ratifies caveat (CPU ignores `position` field even if supplied). C4 NO addresses (out of scope; A6 follow-up territory).

- **Snapshots CPU+WASM** — both tiers have stable simulation state. GPU TSL has GPU memory snapshot complications (sync barrier + device memory copy); Neural has no state. Bounded coverage gap; **acceptable**.

### 2.4 Bifurcation site inventory (regla 0 + 2 + 3)

**Total tier-dispatch sites: ~22 across 4 React-layer files.**

#### 2.4.1 `GarmentSimulation.tsx` (14 tier-aware dispatch sites — tools + rendering + snapshots)

> **Counting note:** of the 14 sites tabulated below, **5 are true per-tier bifurcations** with `if (solver) ... else if (wasmClient)` shape (rows tagged "GPU + WASM" en la tabla: handlePointerDown grab + handlePointerMove grab + releaseGrab + raycaster onMove + raycaster onDown). Las otras 9 son single-tier dispatch (GPU-only o CPU+WASM-only sin bifurcation). Earlier mentions de "11 bifurcations" en este doc se entienden como "tier-aware dispatch sites" (loose), not strict per-tier bifurcation count.


| Site | Lines | Tiers | Driver |
|---|---|---|---|
| `useEffect` substeps config | 332-342 | TSL + CPU + WASM (3-rama via `mapClothSimConfigToWasmSolverConfig`) | Setter (substep mode change) |
| `useFrame` TSL substep dispatch | 386-454 | TSL only (else CPU readback path 457-498) | Rendering loop |
| GPU→CPU position readback | 442-450 | GPU only | Rendering sync |
| `imperative handle` saveSnapshot | 351-365 | CPU + WASM | Snapshot |
| `undo middleware` snapshot callbacks | 519-533 | CPU + WASM | Snapshot |
| `handleBrushStroke` | 783-790 | GPU only (`gpuClient.setBrushParams`) | Steam brush dispatch |
| `handlePointerDown` mesh grab | 793-848 | GPU + WASM (`if (solver) ... else if (wasmClient)`) | Mesh grab init |
| `handlePointerMove` mesh grab | 850-885 | GPU + WASM | Mesh grab move |
| `releaseGrab` | 887-900 | GPU + WASM | Mesh grab release |
| `handlePointerUp` brush cleanup | 902-909 | GPU only | Steam brush cleanup |
| `handlePointerLeave` brush cleanup | 911-919 | GPU only | Steam brush cleanup |
| Global `pointerup` handler | 922-933 | GPU only | Steam brush cleanup |
| Manual raycaster `onMove` mesh grab | 965-1008 | GPU + WASM (duplicates `handlePointerMove`) | Mesh grab move (TSL geometry-sync) |
| Manual raycaster `onDown` mesh grab | 1010-1061 | GPU + WASM (duplicates `handlePointerDown`) | Mesh grab init (TSL geometry-sync) |

**Two duplication axes (regla 3 — verify divergence):**

- **Per-tier axis:** `if (solver) { GPU uniforms } else if (wasmClient) { setPins }` shape. Repeats 6 times en GarmentSimulation. Per-tier semantic divergence is **real** (TSL writes GPU memory uniforms for compute kernel sampling; WASM postMessages positional pin batch to worker). NOT shape-similar with hidden divergence — divergence is **declared and intentional**.

- **Per-input-system axis:** R3F handlers (`handlePointerDown`, `handlePointerMove`) ↔ manual raycaster (`onMove`, `onDown`) duplicate ~80 líneas net. Driver: TSL geometry-sync workaround. R3F raycaster reads `geometry.attributes.position` (CPU side), but TSL renders mesh at GPU-computed positions while CPU geometry may lag (readback timing). Manual raycaster works against readback-updated geometry. **This duplication is rendering-layer concern**, not orchestration. C4 sub-decisión 3.1.A consolidates as side-effect via helper; standalone rendering eje would address root cause (readback frequency, BVH update strategy, etc.).

#### 2.4.2 `useSimulationLifecycle.ts` (~7 sites — cascade + setters + cleanup)

| Site | Lines | Tiers | Driver |
|---|---|---|---|
| Cascade selection (startSim async) | 295-438 | All 4 (sequential fallthrough) | Tier selection |
| Wind GPU dispatch | 524-529 | GPU only | Setter (wind change) |
| Wind WASM dispatch | 532-537 | WASM only | Setter (wind change) |
| Freeze GPU dispatch | 545-548 | GPU only | Setter (freeze pieces) |
| Elastics dispatch | 553-561 | WASM OR CPU (priority) | Setter (elastic constraints) |
| Cleanup running→cleanup | 449-457 | All 4 (`?.dispose()`) | Lifecycle |
| Cleanup idle | 466-474 | All 4 | Lifecycle |
| Pause stop | 478-483 | CPU + GPU + WASM + Neural | Lifecycle |
| Collision rebuild (debounced) | 489-521 | First non-null of GPU/WASM/CPU | Setter (measurement change) |

**Pattern:** `useSimulationLifecycle` IS de facto coordinator. Cascade selection is Pattern 2 ratify (intentional + working). Setter dispatch follows `if (clientRef.current) { ... }` shape consistently. **No drift in this file** — mature canonical hook composition.

#### 2.4.3 `useMeshing.ts` (1 site — warm-start dispatch)

```ts
// Lines 142-148
const clients = clientsRef.current;
if (clients.cpu) {
  clients.cpu.updateConstraints(newRestLengths);
} else if (clients.wasm) {
  clients.wasm.updateConstraints(newRestLengths);
}
```

GPU + Neural absent. Driver: warm-start updates rest lengths after dimension-only edit; CPU + WASM both implement `updateConstraints`; GPU + Neural don't (no equivalent constraint surface). Bounded gap. **No drift** — capability-bounded.

#### 2.4.4 `useCollisionBodies.ts` (1 site — pin sync)

```ts
// Lines 28-39
useEffect(() => {
  if (!clients.wasm) return;
  const pins = Object.values(pinnedVertices);
  if (pins.length === 0) {
    clients.wasm.clearPins();
  } else {
    clients.wasm.setPins(pins.map(p => ({...})));
  }
}, [clients.wasm, pinnedVertices]);
```

WASM only. Driver: pin tool stores `pinnedVertices` in Redux; WASM tier supports positional pin via `setPins`. CPU + GPU + Neural absent (CPU has `pinParticle` single-pin different shape; GPU + Neural no pin surface). Bounded gap.

### 2.5 A6 + A7 + A2 + A4 patterns leveraged

C4 hereda 4 surfaces ratificadas directamente:

1. **A6 `ClothSolverClient` 4-member lifecycle interface** (`solverProtocol.ts:107-162`) — start/stop/dispose/capabilities. C4 does NOT extend this interface. Tool dispatch lives en concrete-class casts + helper layer; capability flags extension is on `SolverCapabilities` (separate type).

2. **A7 `SolverCapabilities` per-tier surface** + 4-tier constants (`solverCapabilities.ts:23-134`). C4 sub-decisión 3.1 propone **adding tool capability flags** (`tools.steamBrush`, `tools.meshGrab`) — additive Pattern 2.5 extend per-feature. Mirror of A7 § 3.3 Option C (tier-based capability surface) extended to interactivity domain.

3. **A6 `frameDriven: true` flag** (GPU only) — already enables capability-aware lifecycle dispatch (`if (capabilities.frameDriven) { useFrame manages }`). C4 ratifies as substrate; tool capability flags follow same shape.

4. **A2 `configBridge.ts` Pattern 2.5 lite helper** — CPU↔WASM config translation. Sub-decisión 3.1.A propone **analogous helper `toolDispatch.ts`** (Pattern 2.5 lite mirror): canonical tool action input + per-tier dispatch internally.

5. **A7 `SimulationStatusOverlay` UI surface** for "WASM tier limited features" warning (lines 63-69). C4 sub-decisión 3.1 amplía con tool-aware silent-absence warning ("Steam brush requires GPU tier", "Mesh grab requires GPU/WASM tier") — additive.

6. **A4 topology cleavage** ratified — CPU `xpbdSolver:421-456` vs GPU/WASM `gpuBuffers.ts` extractors as ortogonal. C4 NO toca topology lifecycle. Sub-decisión 3.5 (TierCoordinator class) reopen trigger #6 de A4 fire **only si** class supersedes topology lifecycle.

### 2.6 Outside obvious dirs sweep (regla 6)

```bash
grep -rn "setBrushParams\|grabNodes\|grabActive\|setPins\b" src --include="*.ts" --include="*.tsx" | grep -v "Viewport3D\|cloth/"
# (no output — 0 hits)
```

**0 hits outside Viewport3D and cloth/.** Tool dispatch is bounded — no copilot tool consumers, no other components reaching into solver tiers, no test infrastructure dispatching tools.

```bash
grep -rln "tslSolverRef\|gpuClient\.\|wasmClient\.\|clientsRef\.current\." src --include="*.ts" --include="*.tsx"
# Returns: useSimulationLifecycle.ts, GarmentSimulation.tsx (only 2 files)
```

65 callsites of tier-client refs across **only 2 files**. Bounded scope.

UI tools registered en `src/tools/definitions/{steamBrush,meshGrab}.tsx` are **registry entries only** (icon, cursor, shortcut, options panel, copilot keywords). NO tier dispatch logic. The actual dispatch reside en `GarmentSimulation.tsx` exclusively.

Conclusion: tier orchestration is **architecturally bounded to 4 React-layer files** in Viewport3D. C4 closure scope is well-defined.

### 2.7 Compile-gate trigger anticipation (regla 3a + 8)

**Risk class:** sub-decisión 3.1.C (Pattern 1 — extend `ClothSolverClient` interface with `runTool(toolName, args)` method) WOULD trigger compile-gate. Anticipated TS2416 errors:

- **Tool args shape divergence:** GPU steam brush args `{center: [number,number,number], radius: number, strength: number}` vs WASM mesh grab args `{indices: number[], positions: Float32Array}` vs Neural (none) — structurally divergent.
- **Tool method presence:** GPU has `setBrushParams`, `grabStart/Move/Release`; WASM has only mesh grab via `setPins`; CPU + Neural have NEITHER. Forcing uniform `runTool('brush', ...)` requires runtime translation in CPU/Neural (no-op stubs) or interface marks tools as `?` optional (defeating type-system enforcement).

**Mitigation:** sub-decisión 3.1.A (Pattern 2.5 lite helper) and 3.1.B (Pattern 2.5 extend capability flags only) AVOID interface extension entirely. No compile-gate trigger.

A6 § 4.5.5 sub-rule "Compile-gate convergence verification" applies forward: anticipate the failure class for any sub-decisión proposing interface extraction, NOT just for tools. Sub-decisión 3.5 (TierCoordinator class extraction) does NOT extend `ClothSolverClient` either — class would compose existing tiers via dependency injection (refs), not by `implements`.

### 2.8 WebGPU upstream status verification (regla 0)

```bash
grep "\"three\"" package.json
# "three": "^0.183.2",
```

Three.js still on `^0.183.2`. Project memory `webgpu_blocked` (per `MEMORY.md` line 21) still applies. No upstream fix landed. Sub-decisión 3.3 anchors localStorage opt-in con comment + reopen trigger if Three.js 0.184+ ships fix.

### 2.9 Sweep negativo (qué NO emergió)

- **0** alternative orchestration libraries (no Mediator, no Saga, no event bus for solver coordination).
- **0** test infrastructure for cross-tier orchestration (no integration test asserting "GPU fallback to WASM works").
- **0** copilot tool dispatching to solver tiers (UI tools registered but registry entries only).
- **0** generic solver-tool registry pattern (the existing `toolRegistry` is for UI tool definitions, not solver methods).
- **0** tier-aware feature flags beyond `WEBGPU_FEATURE_FLAG_KEY` (no per-feature tier opt-out).
- **0** solver tier metrics / telemetry beyond `solverTier` Redux state + `frameTimeMs` FPS counter (no error tracking, no tool-dispatch counters).

Sweep cerró clean — no surprise pre-existing infrastructure, no hidden cross-tier consumers, no third-party orchestration deps. Pre-condition para Pattern 2.5 extend dominant outcome confirmada.

### 2.10 Estimated F2 + F3 scope

| Component | Estimate |
|---|---|
| F2 doc (this) — sweep + classification + redacción | ~5-7h |
| F3 if 3.1.A + 3.1.B + 3.2.A + 3.3.A + 3.4.A + 3.5.A (recommended) | ~3-5h |
| F3 if 3.1.B (capability flags only, no helper) | ~2-3h |
| F3 if 3.1.D (ratify-as-is + cross-doc only) | ~1-2h |
| F3 if 3.5.B (TierCoordinator class extraction) | ~8-12h + cross-eje cascade reopen |

Calibration regime (per Pattern 2.5 extend robust 4/4 + Pattern 2.5 lite 3 data points):
- Recommended path = Pattern 2.5 extend per-feature + Pattern 2.5 lite helper = **hybrid 0.7-0.9x** of nominal C4 estimate (8-12h F2 + 5-7h F3 from kickoff anticipation).

---

## Sección 3 — Sub-decisiones, opciones y tradeoffs

Cinco sub-decisiones ortogonales. § 3.1 (tool dispatch) es load-bearing — su outcome cascadea sobre sub-decisiones 3.4-3.5. § 3.2-3.3 son substrate (cascade policy + WebGPU flag) menos load-bearing.

### 3.1 Tool dispatch shape

**Pregunta:** ¿cómo resolver las 11 bifurcaciones en `GarmentSimulation.tsx` para steam brush + mesh grab? Pattern 1 interface extension, Pattern 2.5 lite helper, Pattern 2.5 extend capability flags only, o ratify-as-is con cross-doc?

#### Opción 3.1.A — Pattern 2.5 lite helper `toolDispatch.ts` + capability flags (RECOMENDADA)

**Shape:** crear `src/utils/cloth/toolDispatch.ts` con función `dispatchClothTool(action, args, tiers)` que internaliza la 2-rama bifurcación (GPU uniforms / WASM setPins) + capability gating. Ampliar `SolverCapabilities` con `tools` sub-shape. UI surface en `SimulationStatusOverlay` para silent-absence warning.

```ts
// src/utils/cloth/toolDispatch.ts (NEW, ~120-150L)

import type { ClothSolverClient } from './solverProtocol';
import type { GpuSolverClient } from './gpu/gpuSolverClient';
import type { WasmSolverClient } from './wasm/wasmSolverClient';
import type { TslSolver } from './gpu/tslSolver';

export interface ClothToolTiers {
  gpu: GpuSolverClient | null;
  wasm: WasmSolverClient | null;
  tslSolver: TslSolver | null;
  positions: Float32Array | null;
}

export interface BrushStrokeArgs {
  point: [number, number, number];
  radius: number;
  strength: number;
}

export interface GrabInitArgs {
  point: [number, number, number];
  radius: number;
  strength: number;
}

export interface GrabMoveArgs {
  point: [number, number, number];
}

export interface GrabState {
  indices: number[];
  basePositions: Float32Array | null;
  startPoint: [number, number, number];
}

/**
 * Apply a steam brush stroke at the given point.
 *
 * Tier coverage:
 * - GPU: writes brush uniforms to TSL kernel (zero-copy hot path).
 * - WASM/CPU/Neural: silent no-op (steam brush is GPU-tier feature post-C4).
 *   UI surface in SimulationStatusOverlay communicates absence.
 *
 * @returns true if dispatch landed, false if no tier supports steam brush.
 */
export function dispatchBrushStroke(
  args: BrushStrokeArgs, tiers: ClothToolTiers,
): boolean {
  if (tiers.gpu) {
    tiers.gpu.setBrushParams(args.point, args.radius, args.strength);
    return true;
  }
  return false;
}

/**
 * Initialize a mesh grab at the given point. Updates `state` with selected
 * particle indices + base positions for subsequent move calls.
 *
 * Tier coverage:
 * - GPU: writes grab uniforms to TSL kernel.
 * - WASM: queries positions, finds particles within radius, calls setPins
 *   with positional pin shape.
 * - CPU/Neural: silent no-op (mesh grab requires positional pin —
 *   queued as #UUU-cpu-grab follow-up).
 *
 * @returns true if dispatch landed, false otherwise.
 */
export function dispatchGrabInit(
  args: GrabInitArgs, tiers: ClothToolTiers, state: GrabState,
): boolean {
  if (tiers.tslSolver) {
    const g = tiers.tslSolver.grabNodes;
    g.grabCenterX.value = args.point[0];
    g.grabCenterY.value = args.point[1];
    g.grabCenterZ.value = args.point[2];
    g.grabRadius.value = args.radius;
    g.grabStrength.value = args.strength;
    g.grabActive.value = 1;
    g.grabInitPending.value = 1;
    return true;
  }
  if (tiers.wasm && tiers.positions) {
    const positions = tiers.positions;
    const rSq = args.radius * args.radius;
    const indices: number[] = [];
    const N = positions.length / 3;
    for (let i = 0; i < N; i++) {
      const dx = positions[i * 3] - args.point[0];
      const dy = positions[i * 3 + 1] - args.point[1];
      const dz = positions[i * 3 + 2] - args.point[2];
      if (dx * dx + dy * dy + dz * dz < rSq) indices.push(i);
    }
    if (indices.length === 0) return false;
    state.indices = indices;
    state.startPoint = args.point;
    const base = new Float32Array(indices.length * 3);
    for (let j = 0; j < indices.length; j++) {
      const i = indices[j];
      base[j * 3] = positions[i * 3];
      base[j * 3 + 1] = positions[i * 3 + 1];
      base[j * 3 + 2] = positions[i * 3 + 2];
    }
    state.basePositions = base;
    tiers.wasm.setPins(indices.map((idx, j) => ({
      vertexIndex: idx,
      position: [base[j * 3], base[j * 3 + 1], base[j * 3 + 2]] as [number, number, number],
    })));
    return true;
  }
  return false;
}

export function dispatchGrabMove(
  args: GrabMoveArgs, tiers: ClothToolTiers, state: GrabState,
): boolean {
  if (tiers.tslSolver) {
    tiers.tslSolver.grabNodes.grabCenterX.value = args.point[0];
    tiers.tslSolver.grabNodes.grabCenterY.value = args.point[1];
    tiers.tslSolver.grabNodes.grabCenterZ.value = args.point[2];
    return true;
  }
  if (tiers.wasm && state.indices.length > 0 && state.basePositions) {
    const dx = args.point[0] - state.startPoint[0];
    const dy = args.point[1] - state.startPoint[1];
    const dz = args.point[2] - state.startPoint[2];
    const base = state.basePositions;
    tiers.wasm.setPins(state.indices.map((idx, j) => ({
      vertexIndex: idx,
      position: [base[j * 3] + dx, base[j * 3 + 1] + dy, base[j * 3 + 2] + dz] as [number, number, number],
    })));
    return true;
  }
  return false;
}

export function dispatchGrabRelease(
  tiers: ClothToolTiers, state: GrabState,
): void {
  if (tiers.tslSolver) {
    tiers.tslSolver.grabNodes.grabActive.value = 0;
  } else if (tiers.wasm && state.indices.length > 0) {
    tiers.wasm.clearPins();
    state.indices = [];
    state.basePositions = null;
  }
}
```

```ts
// src/utils/cloth/solverCapabilities.ts (extended)

export interface SolverCapabilities {
  // ... existing flags ...
  /** Steam brush + mesh grab support. Optional sub-shape per A7 + C4 ratification. */
  tools?: {
    steamBrush: boolean;
    meshGrab: boolean;
  };
}

// Per-tier constants extended:
export const CPU_CAPABILITIES = Object.freeze({
  /* ... */
  tools: { steamBrush: false, meshGrab: false },
});
export const WASM_CAPABILITIES = Object.freeze({
  /* ... */
  tools: { steamBrush: false, meshGrab: true },
});
export const GPU_CAPABILITIES = Object.freeze({
  /* ... */
  tools: { steamBrush: true, meshGrab: true },
});
export const NEURAL_CAPABILITIES = Object.freeze({
  /* ... */
  tools: { steamBrush: false, meshGrab: false },
});
```

```tsx
// SimulationStatusOverlay.tsx (extended) — add tool-aware warning
{(solverTier === 'cpu-worker' || solverTier === 'neural-drape')
 && (activeTool3D === 'steamBrush' || activeTool3D === 'meshGrab') && (
  <div style={{ color: '#fb923c', fontSize: 10, ... }}
       title="Steam brush + mesh grab require GPU tier (or WASM tier for mesh grab). ...">
    ⚠️ Active tool not supported on this tier
  </div>
)}
```

Consumer call-sites en `GarmentSimulation.tsx` collapse de 6 inline dispatch blocks (handlePointerDown/Move/releaseGrab + raycaster onMove/onDown + handleBrushStroke) a 6 helper invocations. Math: ~150-180L consumer reduction + ~120-150L helper addition = **~0-30L net (approximately neutral)**. **Net neutral; surface organization improved** + capability flags + UI surface = real value of 3.1.A is in organization + UX (capability + warning), not in raw line count.

**Pros:**
- **Dedupe both axes:** per-tier dispatch consolidated en helper; R3F handlers ↔ raycaster helper-call duplication reduced from ~80 lines to ~6 helper calls.
- **Mirrors `configBridge.ts` precedent (A2 § 3.2.B):** Pattern 2.5 lite robust 4° data point post-A2 (D4 + B10 Par 1 + A2 + **C4**). Same shape: surgical helper for cross-tier semantic translation.
- **Capability flags + UI surface** address silent-absence (regla 11 — "real fix" for UX gap on CPU/Neural tiers).
- **Compile-gate clean:** helper exports functions, no `implements` extension. Risk floor near-zero.
- **Forward-compat:** new tools (e.g., crease tool, dart manipulation) follow helper pattern; capability flags grow incrementally.

**Cons:**
- ~150L net code addition (helper + capability extension + UI surface) — F3 ~3-5h.
- Helper internalizes per-tier branching (the bifurcation moves from consumer to helper layer). Doesn't ELIMINATE branching, just relocates + isolates.
- R3F vs raycaster duplication root cause (TSL geometry-sync) NOT addressed — helper-call duplication instead of full bifurcation duplication. Marginal improvement on rendering layer; full rendering-layer eje captured as separate follow-up (§ 6.5).
- Adds abstraction layer between consumer and tier client — small cognitive cost.

**Confidence:** medium-high. Pattern 2.5 lite robust 3 data points (A2 + D4 + B10 Par 1); 4° data point with C4 stable.

#### Opción 3.1.B — Pattern 2.5 extend (capability flags only, ratify bifurcations)

**Shape:** add `tools` sub-shape to `SolverCapabilities` + UI surface for silent-absence; ratify the 5 per-tier bifurcations + 9 single-tier dispatch sites as-is with JSDoc cross-doc to C4 RFC. NO helper. R3F vs raycaster duplication queued as separate eje.

**Pros:**
- Smaller F3 (~2-3h): capability flags + UI surface + JSDoc only.
- Per-tier dispatch divergence preserved at consumer (transparent — reader sees the divergence inline).
- Mirrors A7 § 3.3 Option C (tier-based capability surface) without abstraction layer.
- Compile-gate clean.

**Cons:**
- 14 tier-aware dispatch sites remain (5 per-tier bifurcations + 9 single-tier blocks). R3F ↔ raycaster ~80-line duplication remains.
- "Real fix" weight (regla 11) less satisfied for code-organization concern; capability flags address UX silent-absence but bifurcation visibility persists.
- Future tool additions add per-site bifurcations (no helper to consolidate).

**Confidence:** medium. Bounded scope, smaller intervention, but doesn't address main inventory framing ("duplicación de tools").

#### Opción 3.1.C — Pattern 1: extend `ClothSolverClient` with `runTool(toolName, args)` method

**Shape:** add optional method `runTool?(toolName: 'brush' | 'grab', args: ToolArgs): void` to `ClothSolverClient`. Each tier implements (GPU dispatches uniforms, WASM dispatches setPins, CPU + Neural no-op stubs).

**Pros:**
- True polymorphic tool dispatch: consumer calls `client.runTool('grab', {...})` without bifurcation.
- Capability surface implicit via method presence.

**Cons:**
- **Re-triggers compile-gate (regla 3a + 8 + A6 § 4.5.5)**: tool args structural divergence (GPU `{center, radius, strength}` for brush + grab vs WASM stateful grab `{indices, positions, basePositions}`). Forcing uniform `ToolArgs` type → discriminated union with tier-specific variants → each tier branches inside `runTool` on tier identity → bifurcation moves inside tier method, NOT eliminated.
- **Violates A6 § 3.1.C ratification scope reduction**: A6 explicitly ratified 4-member subset (`start/stop/dispose/capabilities`) with init + callbacks + setters intentionally NOT in interface due to tier-divergent shapes. Tools have same divergence class. A6 reopen trigger #1 fires (per § 7).
- **Cross-tier semantic translation hidden**: GPU uniforms write GPU memory; WASM postMessages worker; the runtime cost asymmetry hidden behind uniform method.
- **Cross-eje cascade**: A6 reopen #1 + capability flag explosion if per-tool flag added (`runToolBrush?`, `runToolGrab?`) — Pattern 2.5 extend convention emergent (Option C de A6 § 3.4 reopen).
- **F3 cost open-ended:** ~6-9h interface change + 4 tier implementations + cross-eje review.

**Confidence:** low. Anti-pattern per A6 § 4.5 precedent — interface scope reduction is the audit philosophy stance.

#### Opción 3.1.D — Ratify-as-is with JSDoc cross-doc (no helper, no capability flags)

**Shape:** document the 14 tier-aware dispatch sites (5 bifurcations + 9 single-tier) + tool tier coverage matrix in C4 RFC + JSDoc on `GarmentSimulation.tsx` tool sites referencing C4. No code change.

**Pros:**
- Minimal F3 (~1-2h): docs only.
- Zero risk floor — documentation only.
- Acknowledges current shape as intentional + bounded.

**Cons:**
- Silent-absence UX gap NOT addressed (regla 11 weight unsatisfied — CPU + Neural tier users get no signal that brush/grab don't work).
- Future tool additions repeat bifurcation pattern; no architectural anchor.
- Inventory framing "drift real" closes as "drift bounded + documented" — accurate but minimal value.

**Confidence:** medium-low. Defensible shape, but leaves UX gap.

#### Recomendación 3.1

**Lean: Opción 3.1.A (Pattern 2.5 lite helper + capability flags + UI surface).** Confidence: **medium-high**.

Razones:
- Addresses both inventory framing concerns (per-tier dispatch + UX silent-absence) with bounded F3 cost (~3-5h).
- Mirrors A2 `configBridge` precedent — Pattern 2.5 lite robust 4° data point.
- Mirrors A7 § 3.3 capability surface + UI surface precedent.
- Compile-gate clean; A6 ratification scope preserved.
- Forward-compat for future tools (crease, dart manipulation, etc.).

**Counter-argument (cuándo cambiar a 3.1.B):**
- Si Sam prefiere "no abstractions" stance (helper is a layer overhead) → 3.1.B sufficient.
- Si C4 closure timebox tight → 3.1.B reduces F3 to ~2-3h sin perdiendo capability flags + UI surface.

**Si Sam selects 3.1.B:** R3F vs raycaster duplication permanece como follow-up (§ 6.5). Tool capability flags + UI surface land en F3; helper deferred.

**Si Sam selects 3.1.D:** silent-absence UX gap remains. Acknowledge as deuda técnica explícita en § 8.

### 3.2 Tier selection / activation policy

**Pregunta:** ¿status quo cascade (canonical hook), capability-driven cascade, o user-driven explicit selection?

#### Opción 3.2.A — Status quo cascade GPU→WASM→CPU→Neural (RECOMENDADA)

**Shape:** ratificar `useSimulationLifecycle.ts:295-438` cascade as-is. Tier selection: WebGPU feature flag enabled + WebGPU available → GPU; else WASM available → WASM; else CPU worker → CPU; else Neural fallback. JSDoc cross-doc to C4 RFC.

**Pros:**
- Pre-existing canonical (regla 1) — hook composition pattern ratified by A6 + verified working en producción.
- Cascade order reflects perf hierarchy: GPU zero-copy > WASM Rust > CPU TS > Neural ML inference.
- **No code change** — pure ratification.

**Cons:**
- User cannot force tier (if user wants to test feature parity on CPU explicitly, must opt-out via Redux dev).
- Cascade hides why a particular tier was selected (logs do indicate, but no UI selector).

**Confidence:** high. 8th ratify-by-convention case.

#### Opción 3.2.B — Capability-driven cascade

**Shape:** extend cascade gate logic to consult `capabilities.tools` / `capabilities.physics.{lra, fold, ...}`. Example: if `surfaceMode === 'physics'` and user has fold pieces → prefer CPU (full feature parity); else prefer GPU. Capability auto-switch.

**Pros:**
- Smarter selection based on actual feature requirements per project.
- Forward-compatible with per-feature ports (#676-681).

**Cons:**
- **Reopens A7 § 3.3 reopen trigger** (capability-aware tier auto-switch is Option C extension de A7).
- Significant logic addition (capability evaluation + decision tree).
- User experience surprise: tier may switch silently mid-session if project state changes.
- F3 ~5-8h + cross-eje review.

**Confidence:** low. Out of bounded C4 scope.

#### Opción 3.2.C — User-driven explicit tier selection

**Shape:** add UI selector "Solver: GPU / WASM / CPU / Neural / Auto" with localStorage persistence; remove cascade auto-fallthrough.

**Pros:**
- User has explicit control.
- Useful for QA/dev (force CPU to verify parity).

**Cons:**
- **Reopens A6 § 7 reopen trigger #2** ("C4 RFC selects orchestration model that conflicts with capability surface — explicit user tier choice with no capability negotiation").
- UX complexity for users who don't know tier semantics.
- Requires UI surface + persistence + Redux state — F3 ~6-10h.

**Confidence:** low. Cross-eje cascade + UX complexity.

#### Recomendación 3.2

**Lean: Opción 3.2.A (status quo ratify).** Confidence: **high**.

Razones:
- Pre-existing canonical hook composition working + post-A6 documented.
- C4 closure scoped to 4° (c) RFC; capability-driven cascade (3.2.B) and user-driven (3.2.C) are post-C4 evolution territory.
- Zero code change — F3 docs only.

### 3.3 WebGPU feature-flag hierarchy (TSL/WebGPU blocked state)

**Pregunta:** ¿status quo localStorage opt-in, build-time flag, o auto-disable on detected blocking version?

#### Opción 3.3.A — Status quo localStorage opt-in (RECOMENDADA)

**Shape:** ratify `WEBGPU_FEATURE_FLAG_KEY = 'openclo-use-webgpu'` localStorage. Default false. JSDoc explanation lines 125-132 explica Three.js 0.183 atomicAdd bug. Add tracking follow-up issue para Three.js 0.184+ upstream fix.

**Pros:**
- Pre-existing canonical (regla 1) — `webgpuDetect.ts` + JSDoc explanation in `useSimulationLifecycle.ts:130-132`.
- User can opt-in to test WebGPU path locally.
- When upstream fix lands, flip default + remove flag in single commit.
- Zero code change.

**Cons:**
- User who opts-in encounters silent compute shader failures (atomicAdd bug). Cascade falls through to WASM, but TSL solver init time is wasted.
- Inconsistency entre `isWebGPUFeatureEnabled` (`=== 'true'`) en useSimulationLifecycle y `isWebGPUAvailable` (`!== 'false'`) en webgpuDetect — dual semantics. Documented but cognitive cost.

**Confidence:** high.

#### Opción 3.3.B — Build-time flag

**Shape:** replace localStorage with `import.meta.env.VITE_USE_WEBGPU`. Dev/prod separation explicit.

**Pros:**
- Build-time flag avoids per-user storage variance.
- Easy to enable for staging build con upstream fix.

**Cons:**
- Less flexible for individual user testing (requires rebuild).
- Adds env var docs + Vite config.
- Out of scope for C4 closure.

**Confidence:** medium. Tractable but adds complexity sin benefit immediate.

#### Opción 3.3.C — Auto-disable on detected blocking version

**Shape:** detect Three.js version + WebGPU bug version range; auto-disable y warning UI surface si user opted in but version mismatch.

**Pros:**
- User-friendly (no surprise silent failures).

**Cons:**
- Requires version detection logic + bug range table + UI surface.
- ~4-6h F3 sin clear benefit (user can read JSDoc explanation if they opt-in).

**Confidence:** low. Engineering overkill for current state.

#### Recomendación 3.3

**Lean: Opción 3.3.A (status quo ratify).** Confidence: **high**.

Razones:
- Three.js still 0.183.2 (verified package.json) — bug active.
- Documentation in JSDoc + project memory `webgpu_blocked` + this RFC sufficient.
- Add follow-up issue to track Three.js upstream fix (severity:low; scope: flip default + remove flag when upstream resolves).

**Inconsistency note:** `isWebGPUFeatureEnabled` vs `isWebGPUAvailable` dual semantics is a small code smell. Out-of-scope C4; captured como nota en § 8.

### 3.4 Deprecation roadmap — 4 tiers permanentes?

**Pregunta:** ¿long-term, 4 tiers permanentes o roadmap a fewer (WASM reemplaza CPU, Neural reemplaza ambos)?

#### Opción 3.4.A — Ratify 4 tiers permanentes (RECOMENDADA)

**Shape:** declarar en C4 RFC + CLAUDE.md que los 4 tiers tienen roles distintos y permanecen:

| Tier | Role | When |
|---|---|---|
| **CPU TS** | Full feature parity (LRA, fold, all setters, snapshots). Reference impl. | Default fallback; QA reference; full-fidelity simulation when WASM ports incomplete. |
| **WASM Rust** | Perf path with port-or-ratify per A7 features. Most setters parity. | Default tier when WebGPU blocked; primary perf tier. |
| **GPU TSL/WebGPU** | Zero-copy compute + advanced tools (steam brush, mesh grab). | Opt-in when Three.js fixes atomicAdd bug; high-end machines. |
| **Neural ML** | Instant analytical/ML preview (no physics setters, no tools). | Static drape preview when interactivity not needed; loading states; lightweight clients. |

**Pros:**
- Each tier serves distinct use case — orthogonal roles, not redundant.
- Closure stable (regla 11 alignment).
- **No code change**.

**Cons:**
- 4 tier maintenance cost permanente (capability matrix grows 4 columns wide).

**Confidence:** high.

#### Opción 3.4.B — Deprecate CPU TS (WASM ports complete → drop CPU)

**Shape:** roadmap declares CPU TS as transitional; once A7 ports #676-681 land + WASM has full feature parity, deprecate CPU.

**Cons:**
- **Premature** — A7 explicitly ratified LRA + fold as **CPU-only-by-design** (`lra: false` + `fold: false` permanent en `WASM_CAPABILITIES`). Deprecating CPU would lose those features.
- Reopens A7 § 3.1.2 (LRA) + § 3.1.4 (fold) ratifications.

**Confidence:** very low. Anti-pattern.

#### Opción 3.4.C — Add 5th tier (server-side / CUDA)

**Shape:** roadmap leaves room for server-side or CUDA tier.

**Cons:**
- Out-of-scope para C4 closure.
- Captured as A6 § 7 reopen trigger #1 (5th tier emergence).

**Confidence:** N/A (not C4 territory).

#### Recomendación 3.4

**Lean: Opción 3.4.A (ratify 4 tiers permanentes).** Confidence: **high**.

### 3.5 TierCoordinator class introduction

**Pregunta:** ¿formalizar de facto coordinator (3 hooks) como class explicit, o ratificar hook composition status quo?

#### Opción 3.5.A — Status quo hook composition (RECOMENDADA)

**Shape:** ratificar `useSimulationLifecycle` + `useCollisionBodies` + `useMeshing` como canonical hook composition. JSDoc cross-doc en cada hook + CLAUDE.md row.

**Pros:**
- Pre-existing canonical (regla 1) — hooks ratified by A6 documented in JSDoc lines 14-60 of `useSimulationLifecycle.ts`.
- React-idiomatic: hooks compose via dependency refs + Redux state.
- **No cross-eje cascade** — A2 § 7 #4, A4 § 7 #6, A6 § 7 #2 reopen triggers do NOT fire.
- **No code change**.

**Cons:**
- Class extraction (3.5.B) might give a single ownership locus (currently distributed across 3 hooks + GarmentSimulation).

**Confidence:** high.

#### Opción 3.5.B — Refactor to TierCoordinator class

**Shape:** create `class TierCoordinator { tiers: SimulationClients; tslSolver; capabilities; ... start(), stop(), dispose(), runTool(...), setConfig(...), setWind(...), ... }`. Hooks become thin wrappers around class instance.

**Pros:**
- Single ownership: class owns lifecycle + tool dispatch + capability gating + cleanup.
- Class-based testing (mock individual tier methods).

**Cons:**
- **Cross-eje cascade — three reopen triggers fire**:
  - **A2 § 7 reopen #4** ("TSL/GPU `TslSolverConfig` integration — if C4 RFC introduces tier-coordinator that needs full config bridging across all 4 tiers, reopen § 3.2 with Pattern 1 evaluation"). Pattern 1 config unification adds Rust ABI break + 4-tier shared struct + auto-derive bindings.
  - **A4 § 7 reopen #6** ("C4 RFC introduces tier-coordinator class that owns topology lifecycle — may obsolete A4 cleavage ratification by superseding it with structured class. Revisit § 3.2"). Topology cleavage unification.
  - **A6 § 7 reopen #2** ("C4 RFC selects orchestration model that conflicts with capability surface — e.g., explicit user tier choice with no capability negotiation. Reopen 3.4"). Class might subsume capability surface API.
- React idiom break (class managed via `useRef<TierCoordinator>` instead of hooks composing).
- F3 ~10-15h aggregate + 3 cross-eje reviews + risk of follow-on Pattern 1 escalation in A2/A4.
- **Open-ended blast radius** — Pattern 1 in C4 cascades to Pattern 1 in A2 (config unification) + A4 (topology unification).

**Confidence:** very low. Anti-pattern per audit philosophy (regla 11 — real fix vs consistency alignment, weighted toward consistency given bounded scope).

#### Opción 3.5.C — Pattern 2.5 lite: hook composition + helpers (current state + 3.1.A helper)

**Shape:** ratify hooks + introduce `toolDispatch.ts` helper (sub-decisión 3.1.A). Hooks remain coordinator surface; helpers are surgical additions.

**Pros:**
- Pre-existing canonical preserved.
- Surgical extension via helpers (Pattern 2.5 lite).
- No cross-eje cascade.

**Cons:**
- (Same as 3.1.A trade-offs already discussed.)

**Confidence:** medium-high — equivalent to 3.1.A + 3.5.A combined.

#### Recomendación 3.5

**Lean: Opción 3.5.A (status quo hook composition ratify).** Confidence: **high**.

If sub-decisión 3.1 selects 3.1.A, that's effectively 3.5.C (hooks + helpers — same outcome as 3.5.A with surgical helper addition). 3.5.B (class extraction) explicitly out-of-scope per cross-eje cascade risk.

### Tabla resumen Sec 3

| Sub-decisión | Pregunta | Recomendación | Pattern | F3 cost | Confidence |
|---|---|---|---|---|---|
| **3.1** | Tool dispatch shape | **3.1.A** Pattern 2.5 lite helper + capability flags + UI surface | 2.5 lite + 2.5 extend | ~3-5h | medium-high |
| **3.2** | Tier selection policy | **3.2.A** Status quo cascade ratify | Pattern 2 ratify | ~0.5h docs | high |
| **3.3** | WebGPU feature flag | **3.3.A** Status quo localStorage + tracking issue | Pattern 2 ratify | ~0.5h docs | high |
| **3.4** | Deprecation roadmap | **3.4.A** Ratify 4 tiers permanentes | Pattern 2 ratify | ~0.5h docs | high |
| **3.5** | TierCoordinator class | **3.5.A** Hook composition status quo ratify | Pattern 2 ratify | ~0.5h docs | high |

**Aggregate F3 (recommended path):** ~5-7h (driven mostly by 3.1.A helper + capability flags + UI surface).

**Aggregate F3 (minimal path 3.1.B):** ~3-4h (capability flags + UI surface + JSDoc, no helper).

**Aggregate F3 (ratify-only path 3.1.D):** ~1-2h (docs only across all sub-decisions).

---

## Sección 4 — Recomendación consolidada

**Path consolidada (recommended):** **3.1.A + 3.2.A + 3.3.A + 3.4.A + 3.5.A.**

C4 closes as **8° caso de regla 13 reformulation** (3 paths → 4 tiers; tools tier-specific by design) + **Pattern 2.5 hybrid combining 2.5 lite (`toolDispatch.ts`) + 2.5 extend (capability flags + UI surface)**. 4 ratify-by-convention sub-decisions (3.2 + 3.3 + 3.4 + 3.5) closing the orchestration framing as canonical hook composition + ratified 4-tier roles.

**Pattern detection ratification:**

- **Pattern 2.5 lite** — 4° data point (post-D4 + B10 Par 1 + A2). Robust 4/4 stable.
- **Pattern 2.5 extend** — 5° data point (post-A3 + C1 + A7 + A6). Robust 5/5 stable.
- **Regla 13 reformulation** — 8° caso (B12 + C7 + B5 + D1-cosmetic + D5 + A4 + A2 + **C4**). Sub-pattern dominante en (b) y (c) ejes.
- **Hook composition canonical** — 1° anchored case (`useSimulationLifecycle` + `useCollisionBodies` + `useMeshing` as de facto coordinator). Captured in CLAUDE.md ratification row.

**Bloque (c) cierre:** post-C4, bloque (c) RFCs cerrados completo 6/6 (C1 + A7 + A6 + A4 + A2 + **C4**). Pendiente solo E-async-states sub-track + per-feature ports (#676-681) + setter migrations (#683-689).

**Audit cumulative state post-C4:** **27 ejes ratificados**.

### Cross-eje boundaries (explicit non-overlap)

| Boundary | C4 (this) | Adjacent eje |
|---|---|---|
| Solver lifecycle interface | NO change — A6 ratificado | A6 (start/stop/dispose/capabilities subset) |
| Per-feature physics | NO touch — A7 ratificado | A7 (#676-681 ports queued) |
| Cross-boundary serialization | NO touch — A2 ratificado | A2 (`configBridge` helper) |
| Topology / mesh adjacency | NO touch — A4 ratificado | A4 (CPU vs GPU/WASM extractors) |
| Three.js disposable | NO touch — C1 ratificado | C1 (`useDisposable` hook) |
| Cross-boundary errors | NO touch — A3 ratificado | A3 (defensive Rust + CPU fallback + NaN guards) |
| Worker setter migrations | NO touch — A6 follow-ups | #683-689 |
| Tool surface tier coverage | RATIFY current + capability flags + UI surface | This eje (C4) |
| Tier selection cascade | RATIFY current hook | This eje (C4) |
| WebGPU feature flag | RATIFY current localStorage + tracking issue | This eje (C4) |

### Risk floor

- **3.1.A helper:** ~150L code addition; helper is pure function (no side effects beyond solver dispatch). Test coverage straightforward (mock tiers + assert dispatch). Risk: low.
- **3.1.A capability flags:** 4 constants update + interface extension with optional sub-shape. Backward-compatible (existing consumers reading old flags continue working). Risk: very low.
- **3.1.A UI surface:** `SimulationStatusOverlay` adds tool-aware warning. Cosmetic + read-only. Risk: very low.
- **3.2.A + 3.3.A + 3.4.A + 3.5.A:** docs only. Risk: zero.

**Total observable behavior change:** zero (except UI surface adds new warning panel during tool-tier mismatch). **Risk floor near-zero.**

---

## Sección 5 — Plan de migración Fase 3

### 5.1 Branch + PR

Branch existente: `drift/C4-4way-tier-orchestration` (creado de `main` `d37add43` pre-Fase 2).

PR: draft post-Fase 2 doc commit; promote to ready-for-review post-Fase 3 closure commits.

### 5.2 Commit 1 — Fase 2 doc (this commit)

Atomic: doc-only, no code.

```bash
git add docs/reports/2026-05-02-drift-fase2-c4-4way-tier-orchestration.md
git commit -m "$(cat <<'EOF'
docs(c4): Fase 2 — 4-way tier orchestration

Sweep refresh + classification + sub-decisiones articuladas. Reformulación
per regla 13: 3 paths → 4 tiers post-A6 (Neural agregado). Tool surface
es GPU+WASM-only por design (CPU + Neural absent intentionally).
Pre-existing canonical: useSimulationLifecycle hook composition.

Recomendación consolidada: 3.1.A Pattern 2.5 lite helper (toolDispatch.ts)
+ capability flags + UI surface; 3.2-3.5 ratify-by-convention
(cascade + WebGPU flag + 4 tiers permanentes + hook composition).

8° caso regla 13 reformulation. Pattern 2.5 lite 4° data point.
Pattern 2.5 extend 5° data point.

Pendiente verde de Sam para Fase 3.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

**PAUSA — esperar verde explícito de Sam vía reviewer.**

### 5.3 Commit 2 — Tool dispatch helper (post-verde, if 3.1.A approved)

File: `src/utils/cloth/toolDispatch.ts` (NEW).

Estimated: ~120-150L TS + JSDoc.

Content (per § 3.1.A spec): `dispatchBrushStroke`, `dispatchGrabInit`, `dispatchGrabMove`, `dispatchGrabRelease` exports + types `ClothToolTiers`, `BrushStrokeArgs`, `GrabInitArgs`, `GrabMoveArgs`, `GrabState`.

JSDoc:
- Module header cross-ref to C4 RFC.
- Per-function tier coverage table.
- Caveat for CPU + Neural silent no-op (capability flag protects consumer; UI surface communicates).

Refactor `GarmentSimulation.tsx` callsites to invoke helper:
- Lines 783-790 → `dispatchBrushStroke(...)`.
- Lines 800-846 → `dispatchGrabInit(...)`.
- Lines 859-883 → `dispatchGrabMove(...)`.
- Lines 887-900 → `dispatchGrabRelease(...)`.
- Lines 985-1006 (raycaster onMove) → `dispatchGrabMove(...)`.
- Lines 1015-1060 (raycaster onDown) → `dispatchGrabInit(...)`.

Math: consumer ~150-180L → ~30-40L (~120-150L reduction); helper ~120-150L addition. **Net approximately neutral**; organizational improvement + capability flags + UI surface are the real deliverables.

**Compile-gate verification (regla 4 + 8):** `npx tsc -b --noEmit` post-helper + post-callsite refactor. Anticipa zero issues — helper exports functions, no `implements` extension. Si fire (e.g., type narrowing entre `clientsRef.current.gpu` vs `tiers.gpu`), **resolver IN F3 commit**, no post-merge amendment.

### 5.4 Commit 3 — Capability flags extension (post-verde, if 3.1.A or 3.1.B approved)

File: `src/utils/cloth/solverCapabilities.ts`.

Add `tools?: { steamBrush: boolean; meshGrab: boolean }` sub-shape to `SolverCapabilities` interface. Update 4 per-tier constants:

- `CPU_CAPABILITIES.tools = { steamBrush: false, meshGrab: false }`
- `WASM_CAPABILITIES.tools = { steamBrush: false, meshGrab: true }`
- `GPU_CAPABILITIES.tools = { steamBrush: true, meshGrab: true }`
- `NEURAL_CAPABILITIES.tools = { steamBrush: false, meshGrab: false }`

JSDoc on `tools` field referencing C4 RFC + tier coverage rationale.

Estimated: ~25-40L TS + JSDoc.

### 5.5 Commit 4 — UI surface for silent-absence (post-verde, if 3.1.A or 3.1.B approved)

File: `src/components/Viewport3D/SimulationStatusOverlay.tsx`.

Add tool-aware warning panel. Activate when `activeTool3D` is `'steamBrush'` or `'meshGrab'` AND current solverTier doesn't support it (lookup via capability flags).

```tsx
{(activeTool3D === 'steamBrush' || activeTool3D === 'meshGrab') && /* tier doesn't support */ && (
  <div style={{ color: '#fb923c', fontSize: 10, ... }}
       title="Steam brush requires GPU tier; mesh grab requires GPU or WASM tier. ...">
    ⚠️ Active tool not supported on this tier
  </div>
)}
```

Estimated: ~20-30L TSX.

### 5.6 Commit 5 — JSDoc cross-doc en hooks + GarmentSimulation

Files:
- `src/components/Viewport3D/useSimulationLifecycle.ts` — extend existing JSDoc lines 14-60 with C4 cross-ref + ratification anchor.
- `src/components/Viewport3D/useCollisionBodies.ts` — JSDoc cross-ref to C4 + tier coverage note.
- `src/components/Viewport3D/useMeshing.ts` — JSDoc cross-ref to C4 + warm-start tier coverage note.
- `src/components/Viewport3D/GarmentSimulation.tsx` — JSDoc on tool dispatch sites referencing helper + capability flags.

Estimated: ~30-50L docs total.

### 5.7 Commit 6 — CLAUDE.md ratification row

File: `CLAUDE.md` — add row to "Audit Ratifications" table:

| C4 | 4-way tier orchestration: hook composition canonical (`useSimulationLifecycle` + `useCollisionBodies` + `useMeshing`) + 4 tiers permanentes + tool capability flags + `toolDispatch.ts` helper Pattern 2.5 lite | `docs/reports/2026-05-02-drift-fase2-c4-4way-tier-orchestration.md` |

Estimated: 1 row.

### 5.8 Commit 7 — `CLAUDE/context/audit-state.md` closure delta (gitignored, not in PR)

Post-merge update:
- Move C4 from "Pending ejes" to "Closed ejes" (Bloque (c) 6/6).
- Update Pattern 2.5 lite shipping rate table (+ C4 data point).
- Update Pattern 2.5 extend shipping rate table (+ C4 data point).
- Update regla 13 reformulation count (8° case).
- Add tool capability flag pattern note.

Estimated: ~30-50L doc updates.

### 5.9 Verify gates

```bash
npx tsc -b --noEmit && npm run test && npm run lint
```

**No WASM rebuild needed** — C4 is TS-tier orchestration, no Rust ABI touched.

**Smoke test críticos** (if 3.1.A approved + helper landed):
1. `npm run dev` + simulation in CPU tier (default cascade fallthrough) — verify steam brush + mesh grab silent no-op + warning panel surface.
2. Simulation in WASM tier — verify steam brush silent + mesh grab works.
3. Simulation in GPU tier (opt-in via localStorage) — verify both tools work, no regressions vs pre-helper.

### 5.10 PR ready-for-review

Post-Commit-6 + verify gates passing → mark PR ready. Reviewer ronda final → merge via standard merge commit.

### 5.11 Follow-up issues (post-merge)

1. **R3F handlers vs manual raycaster duplication root cause** (rendering layer eje) — separate from C4 closure. Driver: TSL geometry-sync (CPU readback timing). Severity: medium. Scope: investigate readback frequency, BVH update strategy, or replace manual raycaster with R3F custom raycaster.
2. **Three.js 0.184+ upstream fix tracking** — flip `WEBGPU_FEATURE_FLAG_KEY` default + remove flag when fix lands. Severity: low; depends on upstream timeline.
3. **Steam brush CPU port** (queued; opt-in) — port velocity damping kernel to CPU XPBD. Severity: low; UX impact bajo (steam brush is polish tool). Estimate: ~6-9h.
4. **Mesh grab CPU port** (queued; opt-in) — extend CPU `pinParticle` to positional pin shape (or new `setPositionalPins` method). Severity: low. Folds with `#684` setPins canonical batch shape post-A6.
5. **`isWebGPUFeatureEnabled` vs `isWebGPUAvailable` semantic dual** — tiny code smell (`=== 'true'` vs `!== 'false'`). Captured como nota, no PR. Severity: very low.

---

## Sección 6 — Cross-references y dependencias

### 6.1 Inputs

- `docs/reports/2026-04-28-drift-inventory-fase1.md` § C4 (lines 289-292) — original inventory framing.
- `docs/reports/2026-04-28-drift-fase2-classification.md` § C4 (line 129) — RFC classification.
- `docs/reports/2026-05-01-rfc-a6-worker-protocol.md` — `ClothSolverClient` interface ratification + capability surface extension to 4 tiers + `frameDriven` flag + setter migrations queued (#683-689).
- `docs/reports/2026-05-01-rfc-a7-wasm-cpu-equivalence.md` — `SolverCapabilities` per-tier surface + per-feature port-or-ratify.
- `docs/reports/2026-05-02-drift-fase2-a2-cross-boundary-serialization.md` — `configBridge.ts` Pattern 2.5 lite (CPU↔WASM config translation, helper precedent for `toolDispatch.ts`).
- `docs/reports/2026-05-02-drift-fase2-a4-cross-language-geometry-mesh.md` — topology cleavage CPU vs GPU/WASM ratified; reopen trigger #6 ties to C4 sub-decisión 3.5.
- `docs/reports/2026-05-01-rfc-c1-buffer-lifecycle.md` — Three.js disposable lifecycle pattern (Viewport3D rendering surface; verified no conflict).
- `docs/reports/2026-05-01-drift-fase2-a3-cross-boundary-errors.md` — Cross-boundary error pattern (capability flags inherit Result-pattern forward-only convention).
- `CLAUDE/methodology.md` — reglas 0, 1, 2, 3, 3a, 6, 8, 9, 11, 13, 14, 16.

### 6.2 Outputs

- `CLAUDE.md` — "Audit Ratifications" row updated.
- `CLAUDE/context/audit-state.md` — closure delta + calibration data point.
- `src/utils/cloth/toolDispatch.ts` (NEW, if 3.1.A approved) — Pattern 2.5 lite helper.
- `src/utils/cloth/solverCapabilities.ts` — `tools` sub-shape extension (if 3.1.A or 3.1.B approved).
- `src/components/Viewport3D/SimulationStatusOverlay.tsx` — tool silent-absence warning (if 3.1.A or 3.1.B approved).
- `src/components/Viewport3D/{useSimulationLifecycle, useCollisionBodies, useMeshing, GarmentSimulation}.{ts,tsx}` — JSDoc cross-doc updates.

### 6.3 No-conflicts (out-of-scope verificado)

- **A6 `ClothSolverClient` interface** — C4 NO extiende. Capability flags + helper son surface aditiva. ✓
- **A7 per-feature ports (#676-681)** — preserved; capability flags follow A7 § 3.3 Option C convention. ✓
- **A2 `configBridge.ts`** — preserved; `toolDispatch.ts` helper sibling. ✓
- **A4 topology cleavage** — NO touched; sub-decisión 3.5.A preserva. ✓
- **C1 disposable lifecycle** — Viewport3D file touched only via JSDoc additions; `useDisposable` callsites not modified. ✓
- **A3 error patterns** — preserved; tool dispatch errors use existing `console.warn` shape. Future: forward-only convention to Result-pattern if errors become consumer-facing.
- **Setter migrations #683-689** — preserved as A6 follow-ups. C4 closure observes them as parallel work. ✓

### 6.4 Co-existence con ejes abiertos

- **E-async-states** sub-track (B8 + D2 + D8 fusion) — parallelizable; no direct conflict. C4 closure does not touch async state shape.
- **A6 setter migrations** (#683-689) — independent; C4 helper doesn't gate setter shapes. `#684 setPins canonical batch shape with freeze-vs-positional caveat` is the closest cousin (mesh grab dispatch in WASM tier uses `setPins` directly; helper would migrate when canonical batch shape lands).
- **A7 per-feature ports** (#676-681) — independent; capability flag pattern aligned. When ports land, capability constants flip per A7 closure protocol.
- **R3F vs raycaster duplication follow-up** — separate eje captured § 5.11 #1; rendering-layer concern.

### 6.5 Follow-up issues queued post-merge

1. **R3F handlers vs manual raycaster duplication** (rendering eje, severity:medium): TSL geometry-sync workaround drives ~80L duplication in `GarmentSimulation.tsx:944-1069`. C4 helper consolidates dispatch shape but root cause (CPU readback timing) remains. Severity: medium. Scope: independent eje.

2. **Three.js 0.184+ upstream fix tracking** (severity:low): flip `WEBGPU_FEATURE_FLAG_KEY` default to opt-out + remove flag when atomicAdd bug resolves upstream. No code change today.

3. **Steam brush CPU port** (severity:low): opt-in port if UX impact emerges. Velocity damping kernel ~150L Rust or ~80L TS. Estimate ~6-9h.

4. **Mesh grab CPU port** (severity:low): folds with `#684` setPins canonical batch shape. Estimate +~3h on top of #684.

5. **`isWebGPUFeatureEnabled` vs `isWebGPUAvailable` semantic dual** (severity:very-low): consolidate to single source-of-truth flag. Cosmetic.

### 6.6 Methodology rules applied

- **Regla 0** (Verify before assert): inventory claims verified — line drift confirmed minor, "3 paths" reformulated to 4 tiers, tool dispatch counts measured.
- **Regla 1** (Pre-existing canonical): hook composition canonical confirmed via grep + read; tool dispatcher absent confirmed.
- **Regla 2** (Read contents not directories): all 4 React-layer files read in full (575 + 1148 + 180 + 40 = 1943L total).
- **Regla 3** (Verify divergence): per-tier dispatch divergence verified semantically (TSL uniforms vs WASM setPins are NOT shape-similar — different physics models).
- **Regla 3a** (Compile-gate convergence verification): anticipated for sub-decisión 3.1.C (Pattern 1) — anti-pattern per A6 § 4.5.5 precedent.
- **Regla 6** (Look outside obvious dirs): verified 0 hits outside Viewport3D + cloth/.
- **Regla 8** (stop → notify → wait → execute): F2 doc commit + draft PR + pause for verde before F3.
- **Regla 9** (Atomicity by default): unify commits planned atomic per § 5.
- **Regla 11** (Real fix vs consistency alignment): selected mid-path — capability flags + UI surface (real fix UX gap) + helper consolidation (real fix code organization), preserving canonical hook composition (alignment).
- **Regla 13** (Inventory misclassification is itself drift): 8° case — "3 paths" reformulated to 4 tiers + tools tier-feature-by-design.
- **Regla 14** (62% rule): predicted ratify-by-convention dominant; 4 of 5 sub-decisiones close as ratify (3.2 + 3.3 + 3.4 + 3.5); only 3.1 has Pattern 2.5 hybrid component.
- **Regla 16** (Pattern 2.5 hybrid 4 variants): 3.1.A combines 2.5 lite (helper) + 2.5 extend (capability flags + UI surface).

---

## Sección 7 — Reopen triggers

C4 ratificación queda revisable si emerge:

1. **5° solver tier (e.g., server-side, CUDA, distributed)** — verify cascade + capability surface accommodate without ad-hoc extension. Reopen § 3.4 ratification (4 tiers → 5 tiers reformulation).

2. **Tool surface expands** (e.g., crease tool, dart manipulation tool, sleeve roll tool) — verify `toolDispatch.ts` helper pattern absorbs new dispatcher without restructuring. If new tool requires interface-level method (e.g., synchronous result), reopen § 3.1 evaluating Pattern 1 (Option 3.1.C revisit).

3. **CPU + Neural tier tools requested empirically** — if user feedback signals "I want steam brush on CPU" — reopen § 3.1 evaluating per-tool port-or-ratify (mirror A7 § 3.1 self-collision pattern).

4. **Three.js 0.184+ ships atomicAdd fix** — flip `WEBGPU_FEATURE_FLAG_KEY` default + remove flag. Reopen § 3.3 trivially.

5. **Cascade selection conflict** with capability requirements (e.g., user has fold pieces but cascade selects WASM tier silently — fold not supported) — reopen § 3.2 evaluating capability-driven cascade (Option 3.2.B revisit). Anchor in audit-state.

6. **TierCoordinator class extraction requested** by future architectural eje (e.g., E-async-states sub-track requires single-instance owner) — reopen § 3.5 evaluating Pattern 1 (Option 3.5.B revisit). Cross-eje cascade implications: A2 § 7 #4 + A4 § 7 #6 + A6 § 7 #2 fire.

7. **R3F vs raycaster duplication root cause addressed** (separate rendering eje closes) — verify helper pattern still optimal post-rendering refactor. May obviate raycaster dispatch site (if R3F custom raycaster replaces manual). Reopen § 3.1.A consumer call-site count.

8. **Capability flag explosion** (>3 tool flags or >10 total `SolverCapabilities` flags) — reopen § 3.1.A evaluating capability negotiation API (A6 § 3.4 Option C revisit).

9. **GPU steam brush + mesh grab fail in production** (e.g., new Three.js version breaks TSL grabNodes) — reopen § 3.4.A (4-tier permanence) evaluating tier prioritization or temporary disable.

10. **`toolDispatch.ts` helper test coverage proves insufficient** (mock dispatch behaviour drifts from real tier client behaviour) — reopen § 3.1.A evaluating direct-dispatch revert (3.1.B fallback).

---

## Sección 8 — Deuda técnica explícita post-ratificación

1. **R3F handlers ↔ manual raycaster ~80L duplication.** TSL geometry-sync workaround. C4 helper reduces consumer call-site duplication but rendering-layer eje captures root cause. Captured § 6.5 #1 follow-up. Aceptable porque (i) bounded scope (1 file), (ii) drift is rendering-not-orchestration, (iii) C4 closure consolidates dispatch shape via helper.

2. **Tool capability flags don't enforce dispatch path.** Capability flag `tools.steamBrush: true` is documentary; consumer code (helper or inline) MUST check + branch. Lint rule deferred. Aceptable porque (i) helper centralizes the check, (ii) capability flag is communicated via UI surface.

3. **CPU + Neural tools silently absent** despite full feature parity in CPU TS for other operations. Steam brush + mesh grab don't port to CPU/Neural by design (port effort vs UX value tradeoff). Captured § 6.5 #3-4 follow-ups for opt-in. Aceptable porque (i) UI surface communicates absence, (ii) cascade gives user immediate feedback (tier label visible), (iii) precedent A7 § 3.1.2 (LRA) + § 3.1.4 (fold) — same shape.

4. **`isWebGPUFeatureEnabled` vs `isWebGPUAvailable` semantic dual.** `useSimulationLifecycle.ts:130` uses `=== 'true'` (default false); `webgpuDetect.ts:91` uses `!== 'false'` (default true). Consolidation deferred. Aceptable porque (i) compound check `isWebGPUFeatureEnabled() && isWebGPUAvailable()` always coherent in cascade gate, (ii) cosmetic-only.

5. **Cascade hard-codes order GPU→WASM→CPU→Neural.** No user override, no runtime reordering. Aceptable porque (i) order reflects perf hierarchy + project memory `webgpu_blocked` informs gate, (ii) reopen trigger #5 captures empirical conflict cases.

6. **Helper test coverage requires tier client mocks.** `toolDispatch.ts` tests must mock `GpuSolverClient` + `WasmSolverClient` + `TslSolver`. Reasonable scope (~50-80L test, 1-2h). Aceptable.

7. **Tool capability flag growth.** New tools require update across 4 constants + helper signature + UI surface + JSDoc. Discipline-bound. Lint rule deferred. Aceptable porque (i) similar discipline applied for physics flags post-A7, (ii) frequency low (1-2 new tools per year), (iii) review surface visible.

8. **R3F custom raycaster as alternative to manual raycaster** — captured § 6.5 #1 as rendering eje. Aceptable porque C4 doesn't re-architect rendering layer.

9. **`SimulationStatusOverlay` UI surface accumulating warnings** — post-A7 + post-C4, the overlay carries 2 warnings (LRA/self-coll absence, no body collision) + post-C4 +1 (tool absence). If counter grows >5, refactor to collapsible expandable UI. Aceptable porque (i) deferred, (ii) current overlay is dense but readable, (iii) follow-up if growth signals trigger.

10. **`steamBrush.cursor: 'crosshair'`** + `meshGrab.cursor: 'grab'` declared in tool registry (`src/tools/definitions/{steamBrush,meshGrab}.tsx`) but NO change when tool dispatch silent-absent on CPU/Neural tier. Cursor still indicates active tool. UX inconsistency (cursor says "grab" but tool no-ops). Aceptable porque (i) UI surface in `SimulationStatusOverlay` complements, (ii) cursor change requires tier-aware tool registry — out-of-scope C4 (would touch tool registry pattern).

---

## Sección 9 — Decisión pendiente y siguiente paso

### 9.1 Pregunta a Sam

¿Aprobás las 5 sub-decisiones tal como recomendado en Sec 3 (3.1.A + 3.2.A + 3.3.A + 3.4.A + 3.5.A)?

Si **sí, todo aprobado:**
- Marco PR ready-for-review post-Fase 3.
- Sec 4-9 quedan como ratificación final.
- Fase 3: 6 commits sobre este branch (helper + capability + UI surface + JSDoc + CLAUDE.md row + audit-state delta) + 1-2 follow-up issues opened (Three.js tracking + R3F/raycaster eje).
- Inventory annotation post-merge.
- C4 cerrado como **6° (c) RFC** (después C1 + A7 + A6 + A4 + A2) + **8° caso regla 13 reformulation** + **4° data point Pattern 2.5 lite** + **5° data point Pattern 2.5 extend** (Pattern 2.5 hybrid combining ambas variantes en una closure).
- Bloque (c) cerrado completo 6/6.
- 27 ejes ratificados total.

Si **alguna sub-decisión querés cambiar:**
- **3.1.B (capability flags only, no helper):** drop `toolDispatch.ts`, keep capability flags + UI surface + JSDoc. F3 reduce a ~2-3h. R3F vs raycaster duplication permanece como follow-up.
- **3.1.C (Pattern 1 interface extension):** anti-pattern per A6 § 4.5.5; reabro Sec 3 si confirmás strong preference.
- **3.1.D (ratify-as-is + cross-doc only):** drop helper + capability flags + UI surface, JSDoc only. F3 reduce a ~1-2h. Silent-absence UX gap permanece.
- **3.2.B (capability-driven cascade):** reopens A7 § 3.3 + A6 § 7 #2; F3 ~5-8h + cross-eje.
- **3.2.C (user-driven explicit):** reopens A6 § 7 #2; F3 ~6-10h + UX work.
- **3.5.B (TierCoordinator class extraction):** reopens A2 § 7 #4 + A4 § 7 #6 + A6 § 7 #2 cross-eje cascade; F3 open-ended (~10-15h aggregate). **Anti-pattern per audit philosophy.**

Si **el scope del eje cambia (e.g., reopen "tools deben portearse a CPU + Neural fully"):**
- STOP. Reabro Sec 1 con nuevo evidence; per-tool port-or-ratify mirror de A7.

### 9.2 Estado del PR

- Sec 1-9 ✅ ready (este commit).
- Fase 2 doc commit pendiente. Draft PR pendiente post-commit.
- Pendiente Fase 3 commits (6: helper + capability + UI surface + JSDoc × multiple files + CLAUDE.md row + audit-state delta).

### 9.3 Calibración estimate vs actual

- Estimate Fase 2 doc inicial (kickoff anticipation): 8-12h (consistent con (c) RFC + 4-tier scope + Pattern 2.5 hybrid).
- **Actual Fase 2 doc: ~5-7h** (sweep refresh + classification + redacción).
- **Factor: ~0.6-0.7x** del estimate.
- Causa:
  - Pre-existing canonical hook composition (regla 1) eliminó class-extraction option early.
  - Bifurcation count bounded (~22 sites, 4 archivos, sin copilot/test consumers).
  - Tool surface coverage tier-feature-by-design clear (regla 7 — distinguishing re-implementation from intentional feature) eliminó "should we port everywhere" debate.
  - Reformulación regla 13 (3 → 4 tiers) reduced sub-decision tree.
  - A6 + A7 + A2 + A4 ratifications gave clear inheritance surfaces — no re-derivation needed.
  - Pattern 2.5 hybrid (lite + extend) outcome aligned with calibration regime; Pattern 1 path (3.1.C, 3.5.B) easily ruled out via cross-eje cascade analysis.
- **Calibración alignment:** C4 sits in **"Pattern 2.5 hybrid mid-path" 0.6-0.8x calibration regime** — F2 actual ~0.6-0.7x consistent.
- **Total esperado Fase 3:** ~5-7h con helper + capability + UI surface + JSDoc + CLAUDE.md/audit-state.

### 9.4 Pattern 2.5 hybrid confirmación

C4 confirma **Pattern 2.5 hybrid combining 2.5 lite + 2.5 extend** en single closure:
- **2.5 lite** (4° data point post-A2): `toolDispatch.ts` helper Pattern. Robust 4/4 stable (D4 + B10 Par 1 + A2 + **C4**).
- **2.5 extend** (5° data point post-A6): tool capability flags + UI surface. Robust 5/5 stable (A3 + C1 + A7 + A6 + **C4**).
- **Hybrid combining both variants en single eje** is novel sub-pattern — captured for future eje observation. Predict: post-C4 robust (b)/(c) ejes may combine variants when both surgical helper + capability extension fit (e.g., E-async-states sub-track has potential).

CLAUDE.md sub-rule update post-merge:
- Pattern 2.5 lite shipping rate: D4 + B10 Par 1 + A2 + **C4** = 4 data points.
- Pattern 2.5 extend shipping rate: A3 + C1 + A7 + A6 + **C4** = 5 data points (robust 5/5 stable anchor).
- Pattern 2.5 hybrid (lite + extend in single closure): C4 = 1° anchor case. Track post-C4.

### 9.5 Heads up Fase 3

Critical paths:
- **Compile-gate verification** (regla 4 + 8) post-helper + post-callsite refactor. Anticipate clean (helper exports functions, no `implements` extension), but verify with `npx tsc -b --noEmit` IN F3 commit, no post-merge amendment.
- **Smoke test** post-helper land: simulation in CPU + WASM + GPU (opt-in) tiers; tools work where supported, silent + warning UI where not.
- **No WASM rebuild** — TS-only territory (zero Rust changes).
- **Risk floor near-zero** — all changes additive (helper + capability sub-shape + UI warning + JSDoc); cascade selection unchanged; existing call-sites refactor preserves behavior.

Risk floor:
- Helper is pure function — straightforward unit tests.
- Capability flag is additive sub-shape — backward-compat reads.
- UI surface is read-only display — no Redux mutation.
- JSDoc + CLAUDE.md + audit-state delta are documentation.
- **Total observable behavior change:** +1 warning panel during tool-tier mismatch. Otherwise identical to pre-C4.

### 9.6 Audit cumulative state post-C4

**Closed ejes:** 27 total (26 pre-C4 + C4).
- **Bloque (a) mecánicos:** 8 ejes (cleanup-shape ratify + surgical mechanical fixes).
- **Bloque (b) decisión:** 12 ejes (Pattern 2.5 hybrid variants + ratify-by-convention).
- **Bloque (c) RFCs:** **6/6 cerrados completo** (C1 + A7 + A6 + A4 + A2 + C4).
- **Meta-eje:** #691 CLAUDE.md reorg.

**Pending ejes:** 1 (E-async-states sub-track — B8 + D2 + D8 fusion).

**Robust patterns (≥3 data points post-C4):**
- Pattern 2.5 hybrid 4 variants: cleanup (D6) + lite (D4 + B10 Par 1 + A2 + C4 = 4) + extend (A3 + C1 + A7 + A6 + C4 = 5) + extend bounded (A6).
- 3.6 decoupling pattern: B6-state + A7 + A6 (3 data points robust).
- Inventory drift overestimation 62%: dominante en (b)/(c) ratify outcomes.
- Regla 13 reformulation (8° case post-C4): B12 + C7 + B5 + D1-cosmetic + D5 + A4 + A2 + **C4**.
- Hook composition canonical: 1° anchored case (C4). Track post-future-React-layer ejes.

---

**FIN DEL DOC.** Esperando verde de Sam para promover PR a ready-for-review + arrancar Fase 3.
