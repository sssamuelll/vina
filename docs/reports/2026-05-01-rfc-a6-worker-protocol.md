# A6 RFC — Worker message protocol asimétrico (cloth solver clients)

**Fecha:** 2026-05-01
**Eje:** A6 — worker message protocol asimétrico (drift-axis category (c) — RFC scope per `2026-04-28-drift-fase2-classification.md`).
**Branch:** `drift/a6-worker-protocol`.
**Status:** RFC en redacción incremental. Sec 1+2 en este commit; Sec 3+ en commits subsiguientes.

**Cross-refs (input docs + adjacent ejes):**
- `docs/reports/2026-04-28-drift-inventory-fase1.md` § A6 — original entry: "Worker message protocol asimétrico".
- `docs/reports/2026-04-29-drift-inventory-addendum.md` — A6 sin cambios (no commits que lo tocaran en delta).
- `docs/reports/2026-05-01-drift-fase2-a3-cross-boundary-errors.md` — A3 closure. A6 hereda `panic_hook`, `wasmNaNCount` boundary guard, structured error `code` field (currently WASM-only), Result-pattern convention forward-only.
- `docs/reports/2026-05-01-rfc-a7-wasm-cpu-equivalence.md` § 3.2 + § 3.3 — A7 explícitamente difirió interface design a A6 ("§ 3.2 lean: Option B status quo, defer abstraction to A6"). A6 hereda capability surface skeleton (`solverCapabilities.ts`).
- `docs/reports/2026-05-01-rfc-c1-buffer-lifecycle.md` — C1 closure, Pattern 2.5 extend variant 2nd data point (sub-rule established 2/2). A7 fue 3rd data point. A6 outcome may add 4th data point (consolidation a robust 4/4).

---

## 1. Decide / NO-decide

### 1.1 Lo que A6 decide

A6 RFC decide siete cosas, organizadas como sub-decisiones ortogonales en Sec 3:

1. **Interface extraction shape** for the 4 cloth solver clients (CPU + WASM + GPU + Neural): extract `ClothSolverInterface` uniform, status quo per-tier, hybrid minimal core + tier-specific extensions, or capability-based dispatch. **Three load-bearing constraints absorbidos en 3.1** (no son sub-decisiones aparte):
   - **Shared types location.** `SeamInitData` cross-imports WASM ← `clothWorker.ts:19` (drift implícito). Cualquier interface extraction define dónde viven los tipos que cruzan tiers — `solverProtocol.ts` module, re-export desde canónico, o status quo cross-import. La decisión de scope es A6; la decisión de qué semantizan los tipos es A4.
   - **TSL execution model anomaly.** GPU (TSL) corre via `useFrame` (no animation loop en client, no postMessage, no `requestAnimationFrame` self-managed). La interface debe acomodar both animation-loop (CPU/WASM/Neural) y frame-driven (GPU/TSL), o excluir TSL explícitamente (capability gate). Articulado como **constraint**, no como sub-decisión.
   - **NeuralDrapeClient "drop-in replacement" header claim** (verbatim `neuralDrapeClient.ts:14`: "Drop-in replacement for GpuSolverClient / WasmSolverClient / ClothWorkerClient"). Decisión binaria absoluta — **o la interface enforces el contrato (claim becomes real), o el header se reframe (claim becomes by-convention only)**. Aspirational claims sin enforcement = drift; no hay tercera opción.

2. **Init shape uniformity**: force `initMultiPiece(pieces, seams?, config?)` uniform across tiers, accept per-tier divergence, or hybrid (uniform method signature + tier-specific config types via generics).

3. **Error shape uniformity (A3 extend)**: uniform `{ type: 'error'; code: string; message: string }` across 4 tiers (currently WASM-only post-A3), Result-pattern como en A3 § 3.4 forward-only, or status quo divergent.

4. **Capability surface across 4 tiers (A7 extend)**: add `capabilities` getter a GPU + Neural clients (currently CPU + WASM only post-A7), module-level `GPU_CAPABILITIES`/`NEURAL_CAPABILITIES` constants, or capability negotiation API.

5. **Setter divergence per-method classification**. Single sub-decisión pero con per-setter analysis requerido (drivers distintos):
   - `wind` — CPU implementation gap (no live wind), WASM `setWind(force)`, GPU `setWind(force, dragCoefficient)`. **Driver:** CPU feature absence.
   - `pins` — CPU `pinParticle(idx)`/`unpinParticle(idx)` single, WASM `setPins(batch)`/`clearPins()` batch, GPU+Neural NEITHER. **Driver:** API shape choice.
   - `fabric` — CPU `setFabric(fabricId)` resolves fabric → physics config, WASM/GPU/Neural NEITHER (use direct `setConfig`). **Driver:** CPU resolution helper portable to other tiers (or push to consumer).
   - `gravity` — CPU `setGravity(vec)`, WASM via `setConfig({ gravityY })`, GPU+Neural via config. **Driver:** bundled-in-setConfig vs separate setter.

   Forzar uniform shape across todos sería straw-man — distintos drivers requieren distintas resoluciones.

6. **Decoupled vs bundled Fase 3** — A7 § 3.6 decoupling pattern available. Hybrid (c) lean: interface declaration + capability getter extension + CLAUDE.md + NeuralDrapeClient header reframe IN closure; setter unification + error uniform + consumer migration decoupled to follow-ups.

7. **Documentation strategy** — 3-layer ratify-by-default per audit precedent (JSDoc on interface + new methods + CLAUDE.md "Cloth solver client interface" section + dispatch examples on consumers).

### 1.2 Lo que A6 explícitamente NO decide

- **Tier selection logic across 4 solvers (CPU/WASM/GPU/Neural).** `useSimulationLifecycle.ts` cascade decides current tier (GPU → WASM → CPU → Neural). Cuándo activar cada tier, fallback policy, capability auto-switch — **C4 territory** ("TSL/WebGPU/WASM/CPU coexistence"). A6 binds the **shape of the interface** + **capability surface contract**; C4 binds **orchestration logic**. A6 outcome is direct input to C4.

- **Cross-language type-level synchronization of `ClothSimConfig` / `WasmSolverConfig` / `GpuSolverConfig`.** A6 binds **method signatures** (`setConfig(config: ???): void`); A2 binds **the config shape** (cross-language consistency, ABI WASM, Rust↔TS sync). A2 RFC territory. A6 outcome may introduce generics over config type but does not pre-empt A2.

- **Geometry / mesh ops semantics inside messages.** `SeamInitData`, `PieceMeshData`, mesh data carried in init messages: A6 decides **where these types live** (shared module, cross-import, etc.); A4 decides **what they mean** (mesh adjacency, vertex pairing, etc.). A4 RFC territory.

- **Per-feature physics parity** (self-collision, LRA, pressure, fold, piece stiffness). **A7 territory**, ratified. A6 hereda capability skeleton — extends to GPU + Neural in 3.4, but does NOT decide whether features ports happen.

- **Lifecycle workers (`simulationWorker.ts`, `placementWorker.ts`).** `simulationWorker.ts` (init/meshing phase) + `placementWorker.ts` (drape placement) are **one-shot pre-solver** workers, not steady-state solver clients. Distinct lifecycle — they execute once before solver starts and don't expose ongoing setter/step APIs. **Out of A6 scope.** If a future eje formalizes lifecycle worker protocol, that's a separate RFC.

- **`pieceBuilderWorker.ts` (parametric solver) and its protocol** (`src/workers/workerProtocol.ts`). Parametric solver subsystem is a different domain (B3-state ratified reactive solver middleware). Its protocol is canonical for that domain only. A6 may cite it as **architectural precedent** but does not extend its scope.

- **Auto-trace / autoTrace worker.** Edge detection subsystem, unrelated to solver clients.

### 1.3 Reopen triggers anticipados (preview, formal en Sec 7)

- If a 5th solver tier emerges (e.g., a server-side solver, a CUDA solver) and the chosen interface doesn't accomodate it without ad-hoc extension.
- If C4 RFC selects an orchestration model that conflicts with A6's capability surface (e.g., C4 mandates explicit user tier choice with no capability negotiation).
- If a new solver client lands without going through the interface (drift returns).
- If `NeuralDrapeClient` divergence breaks consumer code post-reframe (would mean the "drop-in" claim was never functionally tested under all consumers).
- If TSL execution model evolves (e.g., TSL gains worker support, or non-TSL paths in GPU client are removed) and constraint articulated in 3.1 no longer holds.

---

## 2. Estado actual

### 2.1 Pre-existing canonical infrastructure check (regla 1 v2)

**Worker protocol canónico — parametric solver only:**

`src/workers/workerProtocol.ts` (162 líneas) ES un worker protocol canónico bien diseñado, pero **scoped al parametric solver** (`pieceBuilderWorker.ts`), no al cloth solver. Provee:

```ts
WORKER_COMMANDS = { BUILD, CANCEL, WARMUP, PING, TERMINATE }
WORKER_RESPONSES = { RESULT, READY, WARMED, PONG, ERROR }
isWorkerCommand(), isWorkerResponse()         // type guards
createBuildCommand(), createResultResponse()  // factories + serialization helpers
```

Plus `arrayBufferCodec.ts` (351 líneas) con `encodePoints`, `decodePoints`, `serializePoint`, `prepareJobData`, `getTransferList`, `detectCapabilities`, `selectStrategy`. **Architectural precedent directo** para cualquier cloth-side protocol unification. A6 puede proponer pattern análogo.

**Capability surface skeleton — post-A7:**

`src/utils/cloth/solverCapabilities.ts` (post-A7 § 3.3 ratificación):

```ts
export interface SolverCapabilities {
  selfCollision: boolean;
  lra: boolean;
  pressure: boolean;
  fold: boolean;
  pieceStiffness: boolean;
}
export const CPU_CAPABILITIES: Readonly<SolverCapabilities>   // all true
export const WASM_CAPABILITIES: Readonly<SolverCapabilities>  // all false (post-closure)
```

Getter `get capabilities(): SolverCapabilities` en CPU + WASM clients. **GAP empírico:** GPU + Neural clients NO tienen capability getter. A7 closure scoped a CPU vs WASM only; A6 amplía a 4 tiers (sub-decision 3.4).

**Búsqueda formal `ClothSolverInterface` o equivalente:**

```bash
grep -rn "ClothSolverInterface\|SolverProtocol\|interface.*Solver\b" src/utils/cloth --include="*.ts"
# Returns: SolverCapabilities (A7), TslSolverConfig, GpuSolverConfig, GpuSolverClientCallbacks, WasmSolverConfig, WasmXpbdSolver, AppliedSolverConfig
# NO ClothSolverInterface ni shared client interface.
```

`NeuralDrapeClient.ts:14` header verbatim:
> Drop-in replacement for GpuSolverClient / WasmSolverClient / ClothWorkerClient.

**Implícito contract por convención**, NO por tipo. Aspiracional. Sub-decisión 3.1 binaria absoluta — enforce con interface, o reframe el claim.

### 2.2 Inventario de los 4 cloth solver clients

| Tier | Worker file | Client file | Lines | Architecture |
|---|---|---|---|---|
| **CPU TS** | `clothWorker.ts` (527L) | `clothWorkerClient.ts` (418L) | 945 | postMessage worker |
| **WASM Rust** | `wasmSolverWorker.ts` (784L) | `wasmSolverClient.ts` (380L) | 1164 | postMessage worker + WASM module |
| **GPU TSL/WebGPU** | *(none — main thread)* | `gpuSolverClient.ts` (770L) | 770 | **NO worker** — GPUDevice main thread, TSL via useFrame |
| **Neural ML** | *(none — main thread)* | `neuralDrapeClient.ts` (310L) | 310 | **NO worker** — ONNX Runtime Web main thread, animation loop |

**Asymmetry estructural mayor:** 2 de 4 solver tiers (GPU + Neural) NO usan Web Worker — corren en main thread. La pregunta inventarial original "Worker message protocol asimétrico" es framing parcial. La pregunta real de A6 es **client interface protocol**, no solo worker messages. Worker messages son el subset CPU + WASM; el superset cubre method dispatch en main-thread también.

**Lifecycle/aux workers out-of-scope** (per § 1.2):
- `simulationWorker.ts` (79L) + `simulationInitClient.ts` (224L) — init/meshing one-shot.
- `placementWorker.ts` (97L) — drape placement one-shot.

### 2.3 Worker message protocol (CPU + WASM)

#### 2.3.1 Inputs (main → worker)

| Message | CPU `clothWorker` | WASM `wasmSolverWorker` | Notas |
|---|:---:|:---:|---|
| `init` | ✅ (mesh+config) | ✅ (combina init+pieces+seams+config+baseUrl+wasmVersion) | **Shape divergente** — WASM init bundles 5 fields |
| `initMultiPiece` | ✅ | — (consolidado en `init`) | CPU separa, WASM colapsa |
| `setSeams` | ✅ | — | WASM las bundles en init |
| `setElastics` | ✅ | ✅ | parity |
| `start` / `stop` | ✅ / ✅ | ✅ / ✅ | parity |
| `step` | ✅ | — | CPU only |
| `reset` | ✅ | — | CPU only |
| `setFabric` | ✅ | — | CPU only (resolves fabric → config locally) |
| `setGravity` | ✅ | — | WASM via `setConfig({gravityY})` |
| `setConfig` | ✅ `Partial<ClothSimConfig>` | ✅ `Partial<WasmSolverConfig>` | **Tipo distinto — A2 territory** |
| `setSphereColliders` | ✅ | — | CPU only |
| `setCapsuleColliders` | ✅ | — | CPU only |
| `setCollisionMesh` | ✅ | ✅ | parity |
| `setCollisionBodies` / `updateCollisionBody` / `removeCollisionBody` | ✅ | ✅ | parity |
| `applyInitialTriangleCollision` | — | ✅ | WASM only |
| `pinParticle` / `unpinParticle` | ✅ (single) | — | CPU only — single-pin shape |
| `setPins` / `clearPins` | — | ✅ (batch) | WASM only — batch shape |
| `setWind` | — | ✅ | WASM only |
| `saveSnapshot` / `restoreSnapshot` / `deleteSnapshot` | ✅ | ✅ | parity |
| `warmStart` | ✅ | ✅ | parity |
| `updateConstraints` | ✅ | ✅ (TODO no-op stub per A3) | parity nominal |
| `getEdgeData` | ✅ | ✅ | parity |
| `dispose` / `terminate` | (closeWorker via terminate) | ✅ `dispose` msg | shape divergente |

#### 2.3.2 Outputs (worker → main)

| Message | CPU | WASM | Notas |
|---|:---:|:---:|---|
| `ready` | ✅ | ✅ | parity |
| `frame` | ✅ `{ positions, numParticles, triIds }` | ✅ `{ positions }` | CPU carries `numParticles`+`triIds`; WASM does not |
| `edgeData` | ✅ | ✅ | parity |
| `stopped` | ✅ | ✅ | parity |
| `progress` | ✅ | — | CPU only |
| `error` | ✅ `{ message: string }` | ✅ `{ code: string; message: string }` (post-A3) | **Shape divergente** — WASM has structured `code` field |
| `snapshotSaved` / `snapshotRestored` / `snapshotDeleted` | ✅ | ✅ | parity |
| `constraintsUpdated` | ✅ | ✅ (no-op per TODO) | parity nominal |

### 2.4 Client interface convergencia (4 tiers, by convention)

Pattern observado convergente by convention across los 4 clients (sin enforcement vía type):

```ts
// Implícito en CPU + WASM + GPU + Neural — sin interface declarado
class XxxClient {
  // Callbacks (convergent — all 4 have these)
  onFrame?: (positions: Float32Array) => void;
  onReady?: () => void;
  onError?: (error: string) => void;
  onEdgeData?: (...);                          // CPU + WASM only

  // Lifecycle
  async initMultiPiece(pieces, seams?, config?): Promise<void>;  // shape varía per tier
  start(): void;
  stop(): void;
  dispose(): void | Promise<void>;             // Neural async, otros sync

  // Capabilities (post-A7 — CPU + WASM only)
  get capabilities(): SolverCapabilities;
}
```

**Init signature divergence:**

| Tier | Init signature |
|---|---|
| CPU | `init(meshData, config?)` + `initMultiPiece(pieces, seams: SeamInitData[], config?)` (dos métodos) |
| WASM | `initMultiPiece(pieces, seams: SeamInitData[], config?: WasmSolverConfig)` |
| GPU | `initMultiPiece(pieces, seamPairs?: { pieceAId, pieceBId, vertexPairs }[])` + `initMultiPieceTsl(pieces, ?, tslConfig)` |
| Neural | `initMultiPiece(pieces)` (sin seams ni config) |

**Seam type diverge:**
- CPU/WASM: `SeamInitData[]` (defined `clothWorker.ts:19`, cross-imported by WASM `wasmSolverClient.ts:30`).
- GPU: `{ pieceAId: string; pieceBId: string; vertexPairs: Array<[number, number]> }[]` — different shape.
- Neural: NO seams.

**`SeamInitData` cross-import es drift implícito** — WASM client importa from CPU worker file (`from '../clothWorker'`). Indica que ya hay shared types ad-hoc; sub-decisión 3.1 articula dónde viven (load-bearing).

### 2.5 Setter divergencias en consumer (verbatim de `useSimulationLifecycle.ts:480-511`)

```ts
// Wind dispatch — 4 distinct paths
gpuClient.setWind(force, dragCoefficient);   // 2 args (force + drag)
wasmClient.setWind(force);                   // 1 arg (force only)
// CPU: NO live wind ("CPU solver does not support live wind updates yet" — line 491)
// Neural: NO wind support
```

Tier dispatch en `useSimulationLifecycle` (lines 241-400 cascade) es **hand-rolled per-tier** — 4 ramas de 30+ líneas cada una, sin uniform handle. Cuando se cambia de tier, el código consumer NO es polimórfico.

### 2.6 Per-method asymmetry (consolidated)

Methods divididos por tier coverage:

**Common across all 4 (lifecycle + callbacks):**
- `initMultiPiece(...)` (signature varies), `start()`, `stop()`, `dispose()`, `onFrame`, `onError`, `onReady`.

**CPU + WASM only:**
- Snapshots (save/restore/delete), `warmStart`, `updateConstraints`, `setElastics`, `setCollisionMesh`/Bodies, `requestEdgeData`, `onEdgeData`.

**CPU only:**
- `setSeams` (separate), `setFabric`, `setGravity`, `setSphereColliders`, `setCapsuleColliders`, `pinParticle`/`unpinParticle` (single-pin), `step` (manual step), `reset`.

**WASM only:**
- `setPins`/`clearPins` (batch), `setWind`, `applyInitialTriangleCollision`.

**GPU only:**
- `initMultiPieceTsl`, `setFabricConfig`, `freezePieces`, `setBrushParams`, `grabStart`/`grabMove`/`grabRelease`, `setZeroCopy`, `getPositionStorageAttribute`, `getNormalStorageAttribute`, `getPositionBuffer`, `getNormalBuffer`, `setTslCollisionBody`/`removeTslCollisionBody`, `getTslSolver`, `getPieceVertexRanges`, `readPositionsToCPU`, `readbackPositionsToGeometry`, `setWind(force, dragCoefficient)` (2-arg variant).

**Neural only:**
- (none — minimalist surface).

### 2.7 A3 + A7 patterns leveraged

A6 hereda 4 patterns directos de cierres recientes:

1. **A3 `console_error_panic_hook`** — adopted en `crates/xpbd-wasm/Cargo.toml`. Aplica al Rust crate; A6 hereda sin work nuevo.

2. **A3 NaN guard `wasmNaNCount`** (`wasmSolverWorker.ts:208,288-298,382-388`) — boundary guard module-level counter, collision branch + non-collision branch. A6 puede ratificar pattern para futuras Rust→TS boundaries (currently WASM-only).

3. **A3 structured error `code` field** — `{ type: 'error'; code: 'wasm_memory_unavailable' | ...; message: string }`. **WASM-only post-A3.** A6 sub-decisión 3.3 oportunidad de extend a 4 tiers (ratify uniform shape).

4. **A3 Result-pattern convention forward-only** — `projectSchema.ts:411` precedent (B6-state). A3 § 3.4 ratifies for new fallible Rust→TS exports. A6 sub-decisión 3.3 considera Result-pattern como opción para error shape uniform.

5. **A7 capability surface** (`solverCapabilities.ts`) — skeleton CPU + WASM only. A6 sub-decisión 3.4 amplía a GPU + Neural.

A6 NO re-introduce estos patterns; los cross-references and adopta where applicable.

### 2.8 TSL execution model anomaly (constraint, not sub-decision)

`gpuSolverClient.ts:497-514` (start/stop methods) verbatim:

```ts
start(): void {
  // For TSL solver: don't drive compute() ourselves
  // The TSL solver is driven by useFrame in the React component
  // ...
}

stop(): void {
  if (this.animFrameId) {
    cancelAnimationFrame(this.animFrameId);
    // ...
  }
}
```

Y en `useSimulationLifecycle.ts:302`:
> Don't call `gpuClient.start()` — TSL compute is driven by useFrame.

**TSL execution model:**
- TSL solver compute es driven por `useFrame` hook en React component.
- GPU client NO maneja animation loop self.
- GPU client expone `getTslSolver(): TslSolver | null` para que el render code dispatch `renderer.compute(tslSolver)` per frame.

**CPU + WASM + Neural execution model:**
- Worker (CPU + WASM) o ONNX inference (Neural) corre en su propio loop interno.
- Client recibe `frame` postMessage (CPU/WASM) o callback (Neural) → invoca `onFrame(positions)`.

**Constraint:** any uniform interface debe acomodar both:
- (a) animation-loop client (CPU/WASM/Neural — client manages or receives frames).
- (b) frame-driven client (GPU/TSL — consumer manages frame dispatch via `useFrame`).

O **excluir TSL explícitamente** (capability gate `capabilities.frameDriven: true` o equivalent flag), de modo que consumer code branch entre los dos models.

Esta constraint informa fuertemente sub-decisión 3.1 (interface shape) — excluding TSL del uniform interface es defensible architectural; forzar uniform start/stop semantics rompería el TSL model.

### 2.9 Pre-existing precedente del codebase: `workerProtocol.ts` para parametric solver

`src/workers/workerProtocol.ts` muestra que el codebase tiene **shape capacity** para discriminated-union worker protocol con type guards + factories + serialization helpers + transfer strategy. Si A6 selecciona interface extraction o capability-dispatch, el shape arquitectónico no es inventado from scratch — existe precedente sibling.

Diferencias domain:
- Parametric solver: BUILD/CANCEL/WARMUP/PING/TERMINATE. Job-based, generation-tracked.
- Cloth solver: init/start/stop/setX/step/snapshot. Long-lived stateful clients.

Cloth solver NO se ajusta directamente al BUILD-job pattern — es stateful, no per-job. Pero el shape de `WORKER_COMMANDS` constants + `WORKER_RESPONSES` constants + type guards + factories es transferible.

### 2.10 Inventory honest framing

10 asymmetry hot spots cuantificados (per readonly sweep report):

1. GPU + Neural sin capability getter (post-A7 gap).
2. Init message shape divergente (esp. WASM init bundles 5 fields).
3. Seam type divergente CPU/WASM (`SeamInitData[]`) vs GPU (`{pieceAId, pieceBId, vertexPairs}[]`) vs Neural (none).
4. `setConfig` tipo distinto per tier (overlap A2: `ClothSimConfig` vs `WasmSolverConfig` vs `GpuSolverConfig`).
5. Pin handling: single (CPU) vs batch (WASM) vs none (GPU/Neural).
6. Error message shape: `{ message }` vs `{ code, message }` post-A3.
7. GPU + Neural NO worker — mismo client surface, distinto execution model.
8. NeuralDrapeClient "drop-in replacement" claim sin enforcement.
9. `dispose()` sync (CPU/WASM/GPU) vs async (Neural).
10. CPU `init` vs `initMultiPiece` doble método (vestigial?).

**Pattern detection prediction:** Pattern 2.5 hybrid extend (4to data point). Reasoning:
- Pattern existing legitimate: 4 client surfaces by convention work, NeuralDrapeClient drop-in claim observed empirically functional in tier cascade.
- Drift = gaps en uniformity (capability getter en GPU/Neural ausente, error code field WASM-only, init shape divergente, setter shape divergente, claim sin enforcement).
- Resolution shape: extract canonical interface (or capability-dispatch convention) + add coverage to gaps + ratify pattern + decoupled F3 per § 3.6.

Si confirmed post-Sec 3, **4/4 robust pattern consistent shape** — anchor consolidation post-merge.

### 2.11 Sweep negativo (qué NO emergió)

- 0 alternative interface library (no fp-ts, no abstract base class hierarchy).
- 0 message-passing infrastructure (RxJS, EventEmitter wrapper) en cloth/.
- 0 retroactive `unsafeAs` casts del NeuralDrapeClient drop-in claim — el "drop-in" funciona en tier cascade pero NO hay test que verifique compatibilidad de surface.
- 0 cross-tier integration test que enforce que los 4 clients respondan a método X with shape Y.

Sweep cerró clean con framing 2.5 extend probable confirmado pre-Sec 3.

---

## 3. Sub-decisiones (parte 1 — § 3.1 + § 3.2)

Siete sub-decisiones ortogonales. § 3.1 (interface extraction) es load-bearing — su outcome cascadea sobre 3.2-3.7. Por eso este commit articula 3.1 + 3.2 (interface shape + init shape, profundamente correlacionados); 3.3-3.5 vienen en commit subsiguiente para review granular; 3.6+3.7 closure en commit final.

### 3.1 Interface extraction shape

**Pregunta:** ¿extraer `ClothSolverInterface` uniform across 4 tiers, status quo per-tier, hybrid minimal core, o capability-based dispatch?

**Constraints absorbidos** (per § 1.1 — load-bearing, no son sub-decisiones aparte):

#### Constraint A — Shared types location

`SeamInitData` define en `src/utils/cloth/clothWorker.ts:19`. WASM client cross-importa via `wasmSolverClient.ts:30` (`import type { SeamInitData } from '../clothWorker'`). Drift implícito: tipos solver-protocol viven en archivo de un tier específico (CPU worker), no en módulo canónico.

Cualquier interface extraction (Options A/C/D below) debe decidir:
- (i) **`solverProtocol.ts` module dedicado** para tipos cross-tier (`SeamInitData`, `PieceMeshData`, init message shapes).
- (ii) **Re-export from canónico** (e.g., `cloth/index.ts` re-exports types).
- (iii) **Status quo cross-import** — tipos viven donde caigan, consumers importan from origen.

Decisión de **dónde viven los tipos** es scope A6; **qué semantizan** los tipos (mesh adjacency, vertex pairing) es scope A4. Boundary explícita.

#### Constraint B — TSL execution model anomaly

GPU client corre TSL solver via `useFrame` hook en React component (`gpuSolverClient.ts:497-514` + `useSimulationLifecycle.ts:302` `// Don't call gpuClient.start() — TSL compute is driven by useFrame`).

CPU + WASM + Neural corren animation loop interno (worker en CPU/WASM, `requestAnimationFrame` en Neural).

**Constraint:** any uniform interface debe acomodar both:
- (a) animation-loop client (CPU/WASM/Neural — client manages or receives frames).
- (b) frame-driven client (GPU/TSL — consumer manages frame dispatch via `useFrame`).

O excluir TSL explícitamente (capability gate `frameDriven: true` o equivalent flag), de modo que consumer code branch entre los dos models.

Esta constraint es **constraint estructural**, no Sub-decision aparte — informa fuertemente las opciones de 3.1.

#### Constraint C — NeuralDrapeClient "drop-in replacement" claim — decisión binaria absoluta

`neuralDrapeClient.ts:14` header verbatim:
> Drop-in replacement for GpuSolverClient / WasmSolverClient / ClothWorkerClient.

Aspirational claim sin enforcement por tipo. **Decisión binaria:**
- (a) **Enforce** — interface extraction (Options A/C/D below) hace el claim real. Neural client implementa el contract (interface o capability surface); cualquier divergence rompe compile.
- (b) **Reframe** — header se rewrite a "minimalist client by-convention compatible with the lifecycle subset of solver clients" o similar. Claim becomes by-convention only, sin enforcement.

**No hay tercera opción.** Aspirational claims sin enforcement = drift; A6 closure debe ratificar uno de los dos. El lean depende del Option seleccionado en 3.1 — si 3.1.A/C/D enforce contract, automáticamente cierra (a); si 3.1.B status quo, requiere (b) explícito.

#### Option 3.1.A — Extract `ClothSolverInterface` uniform

**Shape:**

```ts
// src/utils/cloth/solverProtocol.ts (nuevo)
export interface ClothSolverInterface {
  // Lifecycle (uniform)
  initMultiPiece(
    pieces: PieceMeshData[],
    seams?: SeamInitData[],
    config?: SolverConfig,
  ): Promise<void>;
  start(): void;
  stop(): void;
  dispose(): void | Promise<void>;

  // Callbacks (uniform — by convention en 4 tiers)
  onFrame?: (positions: Float32Array) => void;
  onReady?: () => void;
  onError?: (msg: string) => void;
  onEdgeData?: (ids: Int32Array, lengths: Float32Array) => void;

  // Capabilities
  readonly capabilities: SolverCapabilities;

  // Config
  setConfig(config: Partial<SolverConfig>): void;

  // Collision (CPU+WASM+GPU)
  setCollisionMesh?(mesh: { vertices: Float32Array; normals: Float32Array; triCount: number }): void;
  setCollisionBodies?(bodies: CollisionBody[]): void;
  updateCollisionBody?(body: CollisionBody): void;
  removeCollisionBody?(id: string): void;

  // Optional methods (capability-gated):
  setWind?(force: [number, number, number], dragCoefficient?: number): void;
  setPins?(pins: Array<{ vertexIndex: number; position: [number, number, number] }>): void;
  clearPins?(): void;
  setElastics?(elastics: Elastic[]): void;
  saveSnapshot?(id: string): void;
  restoreSnapshot?(id: string): void;
  deleteSnapshot?(id: string): void;
  warmStart?(positions: Float32Array): void;
  updateConstraints?(restLengths: Float32Array): void;
  requestEdgeData?(): void;
}
```

Plus `SolverConfig` generic'd o discriminated-union sobre `ClothSimConfig | WasmSolverConfig | GpuSolverConfig` (boundary A2 issue).

**Pros:**
- Forces consistent API shape across 4 tiers — type system enforces uniformity para non-optional methods.
- NeuralDrapeClient drop-in claim becomes real (Constraint C → enforce path).
- Future tier (server-side, CUDA) plugs in cleanly.
- Cross-tier consumer code becomes polymorphic — `useSimulationLifecycle` 4-rama dispatch reducible.

**Cons:**
- **Optional methods (`?`)** make interface a leaky abstraction — consumers must check capability anyway. ~12 of 22 listed methods serían optional (capability-gated). Lo que queda non-optional: `initMultiPiece`, `start`, `stop`, `dispose`, callbacks, `setConfig`, `capabilities`. Eso es ~10 métodos non-optional vs ~12 optional — leaky.
- **Constraint B (TSL execution) forces:** interface debe definir `start()`/`stop()` semantics que GPU client no respeta puramente (client `start()` es no-op para TSL). Workaround: GPU client implements `start()` as no-op + adds `getTslSolver()` non-interface method. La uniformidad es ya parcial.
- **Per-tier optimizations risk:** zero-copy WASM positions reads, GPU StorageBuffer attribute exposure (`getPositionStorageAttribute`), ONNX tensor inference pipeline son tier-specific. Forzar uniform method shape over these requires either escape hatches (e.g., `getPositionStorageAttribute` non-interface method on GPU client) or generic broad signature que dilutes typing.
- Refactor cost: existing 4 client classes need to declare `implements ClothSolverInterface`; consumer call sites en `useSimulationLifecycle` may switch a polymorphic dispatch.
- **A2 territory blur:** `SolverConfig` generic implies cross-tier config shape decision. A6 § 1.2 explicitly defers config shape uniformity a A2. Option 3.1.A inherits A2 dependency.

#### Option 3.1.B — Status quo (no interface, per-tier classes)

**Shape:** current state. Each consumer (`useSimulationLifecycle`, `ClothMesh`, etc.) picks tier explicitly via concrete class (`new WasmSolverClient`, `new GpuSolverClient`, etc.) and uses tier-specific API.

**Pros:**
- Zero refactor cost.
- Tier-specific behavior stays explicit at call sites — no leaky abstraction.
- A2 RFC keeps full design space open for config shape decision (no inherit dependency).
- Per-tier optimizations preserved as-is (zero-copy WASM, GPU StorageBuffer, ONNX tensor).

**Cons:**
- Divergence over time as new methods land — pattern (drift) reproduces.
- Consumers duplicate tier-aware logic — `useSimulationLifecycle` 4-rama dispatch persists.
- NeuralDrapeClient drop-in claim STAYS aspirational (Constraint C → reframe path required).
- Adding a new tier (CUDA, server-side) touches many call sites.
- Capability surface (post-A7) sin extension a GPU + Neural — gap persists.
- A6 closes as **ratify-by-convention** + cleanup deuda (capability extension + claim reframe), pero NO addresses interface drift root.

#### Option 3.1.C — Hybrid: minimal core interface for shared lifecycle only

**Shape:** extract interface covering ONLY the methods convergent across all 4 tiers (lifecycle + callbacks + capabilities). Tier-specific methods stay on concrete classes.

```ts
// src/utils/cloth/solverProtocol.ts (nuevo)
export interface ClothSolverClient {
  // Lifecycle
  initMultiPiece(pieces: PieceMeshData[], seams?: SeamInitData[], config?: unknown): Promise<void>;
  start(): void;
  stop(): void;
  dispose(): void | Promise<void>;

  // Callbacks
  onFrame?: (positions: Float32Array) => void;
  onReady?: () => void;
  onError?: (msg: string) => void;

  // Capabilities (A7 inherits + A6 extends)
  readonly capabilities: SolverCapabilities;
}
```

Optional methods en interface = NONE (avoid leaky abstraction). Concrete classes add tier-specific methods directly (snapshots, setWind, setPins, getTslSolver, etc.).

Consumer code que toca lifecycle uniform usa el interface; consumer code que toca tier-specific casts a concrete class.

**Pros:**
- Captures the parity that already exists (NeuralDrapeClient drop-in claim concretized para lifecycle subset).
- Bounded scope — ~7 methods + capabilities en interface.
- Doesn't pre-empt A2 (config type es `unknown` en interface, concrete classes type-narrow).
- Per-tier optimizations preserved on concrete classes.
- Lifecycle dispatch en `useSimulationLifecycle` becomes polymorphic (start/stop/dispose) while setter dispatch remains tier-specific.
- Constraint B (TSL) accommodated — `start()`/`stop()` semantics interface-uniform, GPU client implementation no-ops (or nominal).
- Constraint C — Neural drop-in claim **half-real** for the lifecycle subset; reframe header to clarify "drop-in for lifecycle subset; tier-specific features via capability".

**Cons:**
- Two-tier API surface (interface + concrete) adds slight cognitive complexity.
- Setter divergencias (wind, pins, fabric, gravity, snapshots) NOT addressed by interface — sub-decision 3.5 still relevant.
- Newly-ported features post-A7 follow-ups (self-collision, pressure, piece stiffness) become concrete-class methods on `WasmSolverClient`, NOT interface methods — same shape as current.

#### Option 3.1.D — Capability-based dispatch convention

**Shape:** NO formal interface. Instead, **convention** that:
- All 4 clients expose `capabilities: SolverCapabilities`.
- Consumer code branches on capability flags before calling tier-specific methods.
- Lifecycle methods (`start`, `stop`, `dispose`, `initMultiPiece`) are convention-uniform (by signature) but NOT type-enforced.

```ts
// Consumer pattern:
if (client.capabilities.lra) {
  client.setLRAConstraints?.(...);  // optional method check
}
if (client.capabilities.frameDriven) {
  // GPU/TSL path — manage frame in useFrame
} else {
  client.start();
}
```

**Pros:**
- Zero interface declaration cost.
- Per-tier optimizations preserved.
- Capability surface formalizes the dispatch matrix consumers already do hand-rolled.
- Constraint B (TSL) cleanly encoded as `frameDriven` capability flag.
- Forward-extensible — new capability flags added incrementally.

**Cons:**
- **No type-level enforcement.** Convention compliance via review only.
- NeuralDrapeClient drop-in claim REMAINS aspirational (Constraint C → reframe path required).
- Consumer code burden — capability checks proliferate at every dispatch site.
- Capability surface grows organic; risk of capability flag explosion (mitigation: review threshold).

#### Recommendation per § 3.1

**Lean: Option 3.1.C (hybrid minimal core interface) con Constraint C → enforce path para lifecycle subset.** Confidence: **medium-high**.

Reasoning:
- Captures the parity that already exists (4 clients converge on lifecycle by convention) WITHOUT forcing leaky-abstraction (Option A's ~12 optional methods).
- Pre-emptive Sam directive: hybrid (c) lean confirmed; per-tier optimizations preserved.
- NeuralDrapeClient drop-in claim concretized para lifecycle subset; header reframes a "drop-in for lifecycle interface; tier-specific features via capability + concrete-class methods".
- Constraint B (TSL): `start()`/`stop()` interface-uniform, GPU client implementation may be no-op for TSL path; capability flag `frameDriven: true` (en SolverCapabilities) signals consumer to dispatch frames via `useFrame`.
- Constraint A (shared types): `solverProtocol.ts` module dedicado para `ClothSolverClient` interface + `PieceMeshData` + `SeamInitData` re-export. Tipos cross-tier viven canonically en este módulo.
- Setter divergencias (wind, pins, fabric, gravity, snapshots) NOT addressed by interface — handled by sub-decision 3.5 + capability flags.

**Counter:**
- (a) Option 3.1.A defensible si team prioritizes single-source uniform contract over per-tier optimizations. **Pushback risk per Sam directive:** "Hard uniform interface que rompa per-tier perf es donde voy a pushback duro." Option A's optional-methods leaky shape is exactly el pushback target.
- (d) Option 3.1.D defensible si team prefers convention over type-level enforcement. Neural drop-in claim no concretiza (reframe path); consumer code burden grows.
- (b) Option 3.1.B defensible si team prefers ratify-by-convention closure. Pero deja capability extension + claim reframe + setter divergencias todos como deuda — A6 closes but with 4 unresolved drifts.

**Tradeoff aceptado para 3.1.C:** dual API surface (interface + concrete). Interface captures lifecycle uniform; concrete classes carry tier-specific methods. Cognitive cost manageable per audit precedent (Pattern 2.5 hybrid lite — D4 `recordMessage` helper similar dual-pair shape).

**Capability surface integration:** SolverCapabilities (post-A7) extends with:
- `frameDriven: boolean` — TSL execution model flag (Constraint B).
- (existing) `selfCollision`, `lra`, `pressure`, `fold`, `pieceStiffness`.

Sub-decision 3.4 ratifies the extension.

#### Decision sub-table

| Constraint | Resolution per 3.1.C |
|---|---|
| A — Shared types location | New `solverProtocol.ts` module; re-export `SeamInitData` from there (origen sigue siendo `clothWorker.ts` for now, A6 doesn't move it; just re-exports canonical) |
| B — TSL execution model | `frameDriven: true` capability flag; GPU client `start()`/`stop()` no-op on TSL path |
| C — Neural drop-in claim | Enforce — Neural implementa `ClothSolverClient` interface (lifecycle subset). Header reframe: "drop-in for `ClothSolverClient` interface; tier-specific features via capability surface" |

---

### 3.2 Init shape uniformity

**Pregunta:** ¿force `initMultiPiece(pieces, seams?, config?)` uniform across tiers, accept per-tier divergence, o hybrid (uniform method signature + tier-specific config types via generics)?

#### Option 3.2.A — Force uniform `initMultiPiece(pieces, seams: SeamInitData[], config?: ClothSimConfig)`

Force CPU-style canonical signature. WASM, GPU, Neural conform.

```ts
async initMultiPiece(
  pieces: PieceMeshData[],
  seams?: SeamInitData[],
  config?: ClothSimConfig,
): Promise<void>;
```

**Pros:**
- Maximum uniformity — type system enforces single shape.
- Consumer code single dispatch path.

**Cons:**
- **Forces WASM init dis-bundling.** WASM init message bundles `baseUrl + wasmVersion + pieces + seams + config` (5 fields needed for WASM module loading). Forcing CPU-style signature splits init into a sequence (`initMultiPiece` followed by setters) — adds latency, breaks atomicity of init contract con WASM module load.
- **Forces GPU seamPairs reshape.** GPU currently uses `{pieceAId, pieceBId, vertexPairs}[]` — different shape than `SeamInitData[]`. Force uniformity = either GPU adapts internally (translation per init) or all tiers adopt the simpler GPU shape (rich CPU/WASM SeamInitData fields lost).
- **Forces Neural to accept seams + config it doesn't use.** Neural interface bloat.
- Pre-emptive Sam pushback: "force WASM init dis-bundle sin benefit claro" — Option 3.2.A is straw-man.

#### Option 3.2.B — Accept per-tier divergence (status quo)

No interface decision on init shape. Each client defines its own init signature.

**Pros:**
- Zero refactor cost.
- Per-tier shape preserved (WASM bundles WASM-specific init fields; Neural minimalist).

**Cons:**
- Drift (current state) reproduces. NeuralDrapeClient drop-in claim sin enforcement on init signature.
- Cross-tier consumer code (`useSimulationLifecycle`) hand-rolled per tier.

#### Option 3.2.C — Hybrid: uniform signature + tier-specific config via generics

Interface declares `initMultiPiece` with generic config type:

```ts
// solverProtocol.ts
export interface ClothSolverClient<TConfig = unknown, TInitOptions = unknown> {
  initMultiPiece(
    pieces: PieceMeshData[],
    seams?: SeamInitData[],
    config?: TConfig,
    options?: TInitOptions,  // tier-specific extras (e.g., WASM { baseUrl, wasmVersion })
  ): Promise<void>;
  // ...
}

// Concrete classes:
class WasmSolverClient implements ClothSolverClient<WasmSolverConfig, { baseUrl: string; wasmVersion: string }> {
  async initMultiPiece(
    pieces: PieceMeshData[],
    seams: SeamInitData[] = [],
    config?: WasmSolverConfig,
    options?: { baseUrl: string; wasmVersion: string },  // optional, internal default
  ): Promise<void> { ... }
}

class NeuralDrapeClient implements ClothSolverClient<NeuralDrapeConfig, never> {
  async initMultiPiece(
    pieces: PieceMeshData[],
    _seams?: SeamInitData[],   // ignored
    _config?: NeuralDrapeConfig,
  ): Promise<void> { ... }
}
```

**Pros:**
- Uniform method signature — consumer can call `client.initMultiPiece(pieces, seams, config)` polymorphically.
- Tier-specific config types preserved via generics — no A2 pre-emption.
- WASM-specific init fields (`baseUrl`, `wasmVersion`) carried via `options` parameter (optional + tier-typed).
- Neural's minimalist init compatible — `_seams`/`_config` ignored, no API surface bloat.
- GPU seamPairs reshape: GPU client adapts internally via translation `SeamInitData[] → seamPairs` at init time (single conversion vs forcing all tiers).

**Cons:**
- Generic types add modest cognitive overhead.
- `options` parameter as escape hatch may grow over time (mitigation: review threshold).
- GPU translation overhead at init (one-shot, negligible per-frame impact).

#### Option 3.2.D — Hybrid keep dual init en CPU (vestigial?) + uniform on others

CPU has `init(meshData)` + `initMultiPiece(pieces, seams, config)`. Hot spot #10 questions if `init(meshData)` is vestigial (single-piece path no longer used). Investigation:

- `init(meshData)` consumers: `ClothMesh.tsx:287` (single-piece test path?). Verify if production code uses it.
- If vestigial: deprecate + remove en F3 commit.
- If load-bearing: document as legitimate single-piece variant.

This is sub-decision adjacent — handle in Sec 8 deuda explícita post-recomendación.

#### Recommendation per § 3.2

**Lean: Option 3.2.C (hybrid uniform signature + generic config + optional tier-specific options).** Confidence: **medium-high**.

Reasoning:
- Per Sam directive pre-emptive lean confirmed.
- Preserves per-tier optimizations (WASM bundling via `options`, GPU internal translation, Neural minimalist).
- Avoids A2 pre-emption (config type via generic, not unified across tiers).
- Consumer code becomes polymorphic on init dispatch.
- Constraint A (shared types): `PieceMeshData` + `SeamInitData` canonicalized en `solverProtocol.ts`.

**Counter:**
- 3.2.A forced uniform: pushback per Sam directive. WASM bundling has performance + atomicity rationale (WASM module load needs paths + version atomic with init).
- 3.2.B status quo: leaves init drift. Pattern 2.5 extend's "add coverage" goal not met.

**Open question for Sec 4:** dual init en CPU (`init` + `initMultiPiece`) — vestigial or load-bearing? Defer detection a Sec 4 recomendación.

---

**FIN Sec 3.1 + 3.2.** Sec 3.3-3.5 (error shape + capability extension + setter per-method) en commit subsiguiente. Sec 3.6-3.7 (F3 + docs) en commit closure.
