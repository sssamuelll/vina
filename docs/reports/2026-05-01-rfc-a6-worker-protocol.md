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

**FIN Sec 1+2.** Sec 3 (sub-decisiones 3.1-3.7) en commit subsiguiente.
