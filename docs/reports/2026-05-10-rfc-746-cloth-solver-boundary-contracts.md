# Epic-746 RFC — Boundary contract tests for cloth solver clients

**Fecha:** 2026-05-10
**Epic:** [#746](https://github.com/sssamuelll/openclo/issues/746) — "Cloth subsystem quality audit (Fase 2 closure) — 18 findings tracked".
**Status:** CLOSED. Test-coverage phase of the audit complete; 5 PRs mergeados a `main`.
**Scope:** boundary contract tests para los 4 cloth solver clients (CPU + WASM + GPU + Neural) + meta-contract `SolverCapabilities` ↔ method-presence + regression coverage para BUG-2 friction kernel.

**Cross-refs (input docs + adjacent ejes):**

- Epic body: [#746](https://github.com/sssamuelll/openclo/issues/746) — Senior Rust/WASM/WebGPU audit run sobre el cloth subsystem (2026-05-10), 18 findings clasificados P0/P1/P2/T.
- Sub-issues T (test-gap) cerradas en este RFC: [#761](https://github.com/sssamuelll/openclo/issues/761), [#762](https://github.com/sssamuelll/openclo/issues/762), [#763](https://github.com/sssamuelll/openclo/issues/763), [#764](https://github.com/sssamuelll/openclo/issues/764).
- Upstream RFC del interface contract: [`docs/reports/2026-05-01-rfc-a6-worker-protocol.md`](./2026-05-01-rfc-a6-worker-protocol.md) — A6 ratificó `ClothSolverClient` 4-member lifecycle subset + capability surface skeleton + `SolverCapabilities.tools.{steamBrush, meshGrab}` flags. Este RFC cierra la **gap de cobertura de tests** que A6 identificó pero no implementó.
- A7 RFC (capability surface ratification): [`docs/reports/2026-05-01-rfc-a7-wasm-cpu-equivalence.md`](./2026-05-01-rfc-a7-wasm-cpu-equivalence.md) § 3.3.
- A3 RFC (cross-boundary errors): [`docs/reports/2026-05-01-drift-fase2-a3-cross-boundary-errors.md`](./2026-05-01-drift-fase2-a3-cross-boundary-errors.md) — origen del `{type:'error', code, message}` shape testeado en #774 contract #2.
- C4 RFC (4-tier orchestration): [`docs/reports/2026-05-02-drift-fase2-c4-4way-tier-orchestration.md`](./2026-05-02-drift-fase2-c4-4way-tier-orchestration.md) — C4 ratificó capability flags `tools.steamBrush` / `tools.meshGrab` + `toolDispatch.ts` Pattern 2.5 lite consumer. #776 lockea el meta-contract que hace seguros esos consumers.
- BUG-2 ([#605](https://github.com/sssamuelll/openclo/issues/605)) — production bug en el WASM worker friction caller side; PR #777 añade el regression-test del kernel directamente.
- E-async-states (audit drift-fase2 cumulative closure): [`docs/reports/2026-05-03-drift-fase2-e-async-states.md`](./2026-05-03-drift-fase2-e-async-states.md) declaró el drift-fase2 audit CLOSED (28 ejes). Epic #746 es un **audit independiente** (Rust/WASM/WebGPU senior pass), NOT un nuevo eje del drift-fase2; este RFC cierra solo el sub-track T (test gaps) del epic.

---

## 1. Problem statement

Pre-epic-746, el cloth solver subsystem tenía **interfaces sólidos pero coverage incompleto** en las superficies de mayor blast radius. Inventario de gaps al kickoff:

### 1.1 WASM bridge (`src/utils/cloth/wasm/wasmSolverClient.ts`, 405 líneas)

Main-thread → Web Worker → WASM bridge. Source de **4 production bugs históricos**:

- BUG-1 ([#604](https://github.com/sssamuelll/openclo/issues/604)) — bridge.
- BUG-2 ([#605](https://github.com/sssamuelll/openclo/issues/605)) — bridge caller side, friction `prevPos` not threaded.
- BUG-3 ([#606](https://github.com/sssamuelll/openclo/issues/606)) — bridge.
- BUG-4 ([#607](https://github.com/sssamuelll/openclo/issues/607)) — bridge.

Pre-#774 había **un único test file** `wasm/__tests__/wasmSolverClient.test.ts` (52 líneas, dos asserts narrow para el setPins typed-array contract de #749). El resto de la superficie — init lifecycle, error path, frame callback, snapshot lifecycle, dispose-during-init, worker `'error'` event — sin cobertura JS-side. Tests Rust-side cubren correctness del crate, no el contract del bridge.

### 1.2 GPU bridge (`src/utils/cloth/gpu/gpuSolverClient.ts`)

Pre-#773, `gpu/__tests__/gpuSolverClient.test.ts` solo tenía **shape-checks** ("expect typeof client.X to be 'function'", 9 tests). La superficie pública existía pero ninguna behavior se ejercitaba — incluyendo `freezePieces`, `setBrushParams`, `grabStart`/`grabMove`/`grabRelease`, dispose mid-readback, y los dispose chains de [#771](https://github.com/sssamuelll/openclo/issues/771)/[#772](https://github.com/sssamuelll/openclo/issues/772) sin regression-proofing.

### 1.3 CPU bridge (`src/utils/cloth/clothWorkerClient.ts`)

Tercer tier de la familia `ClothSolverClient`. Aunque NO enumerado en la priority pick original del epic (solo #761/#762 se filearon como T-issues), simetría con WASM + GPU tiers exigía cobertura paralela: el `Drop-in replacement for ClothWorkerClient` JSDoc claim de `WasmSolverClient` y `GpuSolverClient` no es enforceable mientras el predecesor (CPU) no tenga su contract pinned.

### 1.4 `SolverCapabilities` ↔ runtime method-presence meta-contract

A7 RFC § 3.3 ratificó `SolverCapabilities` como **canonical surface for tier-feature gating**; A6 RFC § 3.1.C ratificó **silent absence** como contract para tier-specific methods (consumer capability-gates antes de dispatch). Pero la unión de ambos — flag value ↔ method presence on the concrete-class prototype — solo estaba enforced por **JSDoc + reviewer attention**. Si un tier declarara `tools.meshGrab: true` sin exponer la API, o un futuro refactor eliminara una API sin actualizar el flag, drift silencioso. C4 RFC anchored `toolDispatch.ts` (Pattern 2.5 lite) sobre estos flags asumiendo la consistencia que NO había contract test pinning.

### 1.5 BUG-2 friction kernel regression

`solveTriangleCollision` gates friction on `friction > 0 && prevPos` (`src/utils/cloth/triangleCollision.ts:312`). El WASM worker pre-fix pasaba `body.friction` pero **no threaded `prevPos`** — gate fall-through silencioso, per-body friction no-op (BUG-2 / #605). El fix wireó `prevView` en `wasmSolverWorker.ts:289`; **ningún test locked it in**. Las happy-path friction tests de `triangleCollision.test.ts:157-192` no exercían el `friction > 0 && prevPos === undefined` shape.

---

## 2. Resolution

5 PRs mergeados; cada uno cierra un slice ortogonal del coverage gap. **Doc-only, mock-based, no real Worker / no real GPUDevice / no WASM binary loaded en ningún test.** Patrón helper-module ratificado y propagado tier-a-tier.

| PR | Tier | Sub-issue | LoC adds | Helper module |
|---|---|---|---|---|
| [#773](https://github.com/sssamuelll/openclo/pull/773) | GPU/TSL | [#762](https://github.com/sssamuelll/openclo/issues/762) | +613 | `src/utils/cloth/gpu/__tests__/fakeDevice.ts` |
| [#774](https://github.com/sssamuelll/openclo/pull/774) | WASM | [#761](https://github.com/sssamuelll/openclo/issues/761) | +375 | `src/utils/cloth/wasm/__tests__/fakeWorker.ts` |
| [#775](https://github.com/sssamuelll/openclo/pull/775) | CPU | (peer of #761/#762) | +576 | `src/utils/cloth/__tests__/fakeClothWorker.ts` |
| [#776](https://github.com/sssamuelll/openclo/pull/776) | meta (4 tiers) | [#764](https://github.com/sssamuelll/openclo/issues/764) | +254 | (uses `vi.mock` directly) |
| [#777](https://github.com/sssamuelll/openclo/pull/777) | kernel | [#763](https://github.com/sssamuelll/openclo/issues/763) | +78 | (no helper — pure TS kernel test) |

**Total:** 91 new test cases distribuidos en 5 archivos; 3 helper modules nuevos compartibles por future tier tests; 0 real-runtime spawns.

**Suite runtime:** todos los archivos cumplen `<3s` por archivo. Aggregate post-epic: 4951 passed, 9 skipped, 310 files (full repo), ~63s total — no degradación material vs pre-epic.

---

## 3. What each peer locks in

### 3.1 PR #773 — `GpuSolverClient` (GPU/TSL tier) + `fakeDevice.ts`

**Closes #762.** Expande `src/utils/cloth/gpu/__tests__/gpuSolverClient.test.ts` de 9 shape tests a **25 tests** (8 behaviors + regression guards). 9 originales preservados verbatim.

Behaviors lockeadas:

1. **Init success path** — `tslBuffers` populated + `numParticles` correct via `FakeGPUDevice`.
2. **Init error path** — device `pushErrorScope` throws → init Promise rejects (sketch del issue era "device throws on `createBuffer`"; el path real es `withErrorScope`/`pushErrorScope` per `gpuSolverClient.ts`. Comment inline en el test).
3. **Dispose mid-readback** — no `console.error`/`console.warn` after `disposed` flag set en WGSL loop catch path.
4. **Re-init disposes prior `TslBufferSet`** via `renderer._attributes.delete` — regression de [#771](https://github.com/sssamuelll/openclo/issues/771).
5. **`freezePieces`** — zeroes invMass entries + bumps `invMassSBA.version`.
6. **`setBrushParams`** — writes `centerX/Y/Z`, `radius`, `strength` uniforms.
7. **`grabStart`/`grabMove`/`grabRelease`** — toggle uniforms correctly.
8. **`setTslCollisionBody` replace + `removeTslCollisionBody` dispose** — per-body atomic scratch SBAs (`bestDist`, `bestTriIdx`) — regression de [#772](https://github.com/sssamuelll/openclo/issues/772).

**`fakeDevice.ts` exports** (63 líneas): `FakeGPUBuffer`, `FakeGPUDevice`, `FakeRenderer`. Mock surface mínima — solo lo que el client efectivamente llama. `three/webgpu` y `three/tsl` mockeados via chain-callable proxy + `StorageBufferAttribute` stub (pattern reusable de `tslCollision.test.ts` / `tslSolver.test.ts`).

### 3.2 PR #774 — `WasmSolverClient` (WASM/Worker tier) + `fakeWorker.ts`

**Closes #761.** Extiende `src/utils/cloth/wasm/__tests__/wasmSolverClient.test.ts` de 52 líneas (#749 setPins narrow) a **320 líneas, 11 test cases en 7 contracts**. Las dos asserts pre-existentes preservadas verbatim bajo `describe('setPins boundary (#5 / #749)')`.

7 contracts lockeados:

1. **Init lifecycle** — `'ready'` postMessage → `onReady` fires + init Promise resolves; init message shape verified (`type: 'init'`, `pieces`, `wasmVersion`).
2. **Init error path** — `{type:'error', code:'wasm_memory_unavailable', message}` → `onError(message)` + Promise rejects con el message. Locks A3 RFC § 3.3 error shape contract.
3. **Frame callback** — `'frame'` postMessage → `onFrame` invoked con la **misma `Float32Array` reference** (no hidden copy). Plus no-`onFrame` guard for optional-chaining contract.
4. **Snapshot lifecycle** — `saveSnapshot` / `restoreSnapshot` / `deleteSnapshot` cada uno emite `{type, id}`; bridge routea `snapshotSaved` / `snapshotRestored` / `snapshotDeleted` ack messages a los `on*` callbacks correspondientes.
5. **setPins boundary** — non-empty: `Uint32Array indices` + `Float32Array positions` + transferList de ambos buffers (no `Array.from`); empty: `{type:'clearPins'}`. Regression preservada de [#749](https://github.com/sssamuelll/openclo/issues/749) / P1-1.
6. **Dispose during init** — `dispose()` mid-init posts exactly `init` then `dispose` (no third post, no double-postMessage), `terminate()` once, init Promise queda **pending** (no settled, no unhandled rejection — `dispose()` nulea ambos `readyResolve` y `readyReject`).
7. **Worker DOM `'error'` event** — synthetic `ErrorEvent` → `onError(message)` + init Promise rejects; empty-message variant cae a `'Wasm worker crashed'` per bridge contract.

**`fakeWorker.ts` exports** (70 líneas): `FakeWorker extends EventTarget` + `stubWorkerGlobal()`. Critical implementation note: `vi.fn(function() {...})`, NOT `vi.fn(() => ...)` — el bridge invoca `new Worker(...)` y arrow functions no son constructibles. `stubWorkerGlobal` returnea function-form mock para que `new` funcione; vi.fn surface for call inspection preservada.

`__BUILD_TIMESTAMP__` stubbed via `vi.stubGlobal` per-test (es un `vite.config.ts` define no cargado por `vitest.config.ts`; el bridge cae a él cuando `VITE_WASM_VERSION` está unset). No vitest.config.ts edit needed.

### 3.3 PR #775 — `ClothWorkerClient` (CPU/Worker tier) + `fakeClothWorker.ts`

**No filed sub-issue** — peer of #761/#762 bajo el mismo charter (third tier of the `ClothSolverClient` family; el `Drop-in replacement for ClothWorkerClient` JSDoc en WASM/GPU clients implica que CPU es el reference contract). New test file `src/utils/cloth/__tests__/clothWorkerClient.test.ts` (498 líneas, **20 it cases en 11 describe blocks**).

11 contracts lockeados:

1. **`init` lifecycle** — `init({vertices, triIds})` posts `'init'` synchronously, resuelve en `'ready'`, wirea `onmessage` + `onerror`.
2. **`initMultiPiece` lifecycle** — posts `'initMultiPiece'` con pieces + seams, resuelve en `'ready'`.
3. **Init error path** — `'error'` postMessage rejects init Promise + dispara `onError`.
4. **DOM `'error'` event** — `worker.onerror` → `preventDefault`, rejects init, `onError`; fallback a `"Cloth worker crashed"` cuando message vacío.
5. **Frame callback** — `'frame'` message dispatches `(positions, numParticles, triIds)`; typed-array identity preservada (no hidden copy); optional-chaining contract.
6. **start / stop / reset / step** — control messages + `isRunning` toggles correctly; `'stopped'` worker message clears `isRunning`.
7. **Snapshot lifecycle** — `save/restore/deleteSnapshot` posts correct `{type, id}` messages; ack messages route a `onSnapshotSaved/Restored/Deleted`.
8. **Transferable buffers** — `setCollisionMesh`, `setCollisionBodies`, `updateCollisionBody`, `updateConstraints` usan direct `worker.postMessage(msg, transferList)` con el right buffer order.
9. **pin/unpin single-arg shape** — documenta la **CPU-vs-WASM divergence** ratificada en A6 [#684](https://github.com/sssamuelll/openclo/issues/684) (CPU es freeze-at-current single-arg, WASM es positional batch). Contract enforced via test, no solo via JSDoc.
10. **`edgeData` round-trip** — `requestEdgeData()` posts `'getEdgeData'`; `'edgeData'` ack routea a `onEdgeData` con typed-array identity.
11. **Dispose during init** — `terminate()` called, `isRunning` cleared, init Promise hangs (no unhandled rejection); subsequent `init()` spawns fresh worker.

**`fakeClothWorker.ts` exports** (78 líneas): `FakeClothWorker` + `stubWorkerGlobal()`. **Helper divergence vs WASM peer** documentada inline: el CPU bridge asigna `worker.onmessage` / `worker.onerror` directamente (`clothWorkerClient.ts:77,81`) en lugar de `addEventListener`. So `EventTarget#dispatchEvent` no invocaría los handlers del bridge. `fakeClothWorker.ts` **invoca los assigned property handlers directamente** en lugar de dispatchear events — divergencia deliberada y documentada vs `wasm/__tests__/fakeWorker.ts`.

### 3.4 PR #776 — `SolverCapabilities` ↔ runtime method-presence matrix (cross-tier meta-contract)

**Closes #764.** Extiende `src/utils/cloth/__tests__/solverCapabilities.test.ts` con **24 nuevos tests** bajo `describe('Capability surface ↔ runtime contract (#764)')`. Los 5 frozen-shape pin tests pre-existentes preservados.

Per A6 § 3.1.C + A7 § 3.3, los flags split en **dos contract shapes** por cómo el tier signaliza presencia:

| Group | Flags | Enforcement shape |
|---|---|---|
| Method-anchored | `tools.steamBrush`, `tools.meshGrab`, `frameDriven` | Flag value ↔ method presence on concrete-class prototype, OR lifecycle no-op semantics. Mismatch = real bug. |
| Config-anchored | `selfCollision`, `bodyCollision`, `lra`, `pressure`, `fold`, `pieceStiffness` | Flow through per-tier `setConfig` / construct-time toggles. Frozen-shape tests ya pinnean los declared values. |

Matrix completa pinneada (4 tiers × method-anchored flags):

| Capability | CPU | WASM | GPU | Neural |
|---|---|---|---|---|
| `tools.steamBrush` | `false` ↔ no `setBrushParams` | `false` ↔ no `setBrushParams` | `true` ↔ `setBrushParams` exists | `false` ↔ no `setBrushParams` |
| `tools.meshGrab` | `false` ↔ no `setPins` / `grabStart` | `true` ↔ `setPins` / `clearPins` (positional, A6 Q2) | `true` ↔ `grabStart` / `grabMove` / `grabRelease` | `false` ↔ no positional pin / grab |
| `frameDriven` | absent (worker loop) | absent (worker loop) | `true` (consumer drives via `useFrame`) | `false` (RAF-managed) |
| Lifecycle (`start` / `stop` / `dispose` / `capabilities`) | present | present | present | present |

Implementation surface for `meshGrab=true` documented inline: GPU expone `grab*` uniforms; WASM usa positional `setPins` per A6 RFC Q2. CPU's freeze-only `pinParticle` / `unpinParticle` asserted present (single-arg, A6 #684 caveat) pero correctly **NOT counted as `meshGrab`**.

Implementation note: capability getter es leído via `Object.getOwnPropertyDescriptor(Class.prototype, 'capabilities').get!.call({})` — los getters retornan constants, `this` no se usa. Method presence es `typeof Class.prototype.method === 'function'`. **No instantiation de ningún client** — pure prototype inspection.

### 3.5 PR #777 — `solveTriangleCollision` friction kernel BUG-2 regression

**Closes #763** (last T-issue del epic). Añade describe block `solveTriangleCollision — friction kernel (regression for BUG-2 #605)` a `src/utils/cloth/__tests__/triangleCollision.test.ts` (existing 18 tests → 22 total).

4 cases lockeados:

1. **`friction > 0` con `prevPos` undefined es silently no-op (BUG-2 shape)** — el killer regression. Same setup que el positive control, pero `prevPos` omitted. Asserts normal push still applies y tangent **no** atenuado.
2. **`friction > 0` con `prevPos` provided atenúa tangent displacement (positive control)** — paired con (1). Asserts tangent reducido (y no over-clamped).
3. **`friction = 0` con `prevPos` provided deja tangent unchanged (gate predicate)** — locks la `friction > 0` half del gate.
4. **`friction` no-op cuando particle outside margin (no contact)** — locks que la friction branch vive **dentro del contact-detected block**, so high friction in free flight no produce drag.

Pure TS kernel test — no mocks, no worker, no GPU. Reusa `makeFloorPlane` fixture y `TriangleSpatialHash` del mismo file.

---

## 4. What this RFC does NOT decide (out-of-scope)

Las 14 sub-issues no-T del epic siguen abiertas o cerradas independientemente; este RFC **NO toca su scope**:

- **P0/P1/P2 findings del epic** (#747, #748, #749, #750, #751, #753, #754, #755, #756, #757, #758, #759, #760, #752 cross-tier parity). Cada uno es un PR independiente per audit charter "Un PR por área coherente". Status tracking en epic body.
- **Setter migrations queued post-A6** ([#683-689](https://github.com/sssamuelll/openclo/issues/683)). Independent follow-ups.
- **Per-feature ports queued post-A7** ([#676-681](https://github.com/sssamuelll/openclo/issues/676)).
- **C4 follow-ups** (#701-707).
- **`SolverError` adoption en CPU + GPU + Neural tiers** — #687 territory explicit. E-async-states ratificó el pattern; implementation queued. Este RFC enforced el `{type:'error', code, message}` shape solo en WASM via #774 contract #2 (current state — A3 ratificó WASM-only).
- **Real-Worker / real-GPUDevice integration tests.** Charter del epic explícito: "Mock-based, no real Worker / WASM binary loaded". E2E coverage es separate concern (Playwright suite).
- **Cross-tier parity test fixture** ([#752](https://github.com/sssamuelll/openclo/issues/752)). Fileado en epic priority pick pero **NOT closed by this RFC** — es un T-issue separate (3h effort) que requiere structurally el output de #747 (anisotropic compliance fix). Tracked como pendiente del audit's Phase-3 pick, no del test-coverage closure.
- **Helper module unification.** 3 helpers (`fakeDevice.ts`, `fakeWorker.ts`, `fakeClothWorker.ts`) tienen shapes deliberadamente divergentes (per-tier event semantics — `addEventListener` para WASM, direct property assignment para CPU, no events para GPU). Unificar forzaría shared API que distorsionaría las 3 semánticas. Out-of-scope per regla 13 (3 ortogonal concerns, not 1 problem).

### Reopen triggers anticipados

- Si emerge un **5th solver tier** (server-side, CUDA, etc.), el contract suite necesita extension al nuevo tier — patrón helper module + describe-per-contract aplica directamente.
- Si **un tier-specific method se elimina sin actualizar capability flag** (drift), #776 fallaría — primary insurance del meta-contract.
- Si **`SolverError` se adopta en CPU/GPU/Neural** ([#687](https://github.com/sssamuelll/openclo/issues/687)), #774 contract #2 generaliza a 4-tier; new tests bajo el mismo describe shape.
- Si emerge un **6th capability flag method-anchored** (no config-anchored), añadir matrix entry en #776 + per-tier tests.
- Si la divergencia helper-module (3.3 — CPU direct-property vs WASM addEventListener) se resuelve en runtime (e.g., CPU bridge migra a `addEventListener`), unificar `fakeClothWorker.ts` ↔ `fakeWorker.ts`.

---

## 5. Operative consequences (post-epic)

1. **Future changes a `ClothSolverClient` impl tiers must respect the boundary contracts** lockeados por estos tests. Modificar init/error/frame/snapshot/dispose semantics requiere actualizar tests deliberadamente, no via override silencioso.
2. **Capability flags must stay in sync con method presence** per #776 meta-matrix. Adding `tools.X = true` a un tier sin exponer la API correspondiente = test failure inmediato. Mismo para remove API sin clear flag.
3. **BUG-2 friction kernel regression is now permanent.** Cualquier futuro caller de `solveTriangleCollision` que omita `prevPos` con `friction > 0` será silently no-op — but the contract is **explicit and tested**, no longer a footgun.
4. **Helper modules son shareable** por future tier tests. New WASM-tier test → import `fakeWorker.ts`. New GPU-tier test → import `fakeDevice.ts`. New CPU-tier test → import `fakeClothWorker.ts`. Helper-module convention ratificada y propagada.
5. **No real-Worker / real-GPUDevice spawns en unit suite** — runtime presupuesto preservado (~63s full repo suite).
6. **Audit charter "Un PR por área coherente" honored**: 5 PRs paralelos (uno por tier + meta + kernel), no monolithic bundle.

---

## 6. Cross-references summary

**Issues:**

- Epic: [#746](https://github.com/sssamuelll/openclo/issues/746) (boundary contract tests for cloth solver clients).
- Sub-issues T cerradas: [#761](https://github.com/sssamuelll/openclo/issues/761) (WASM), [#762](https://github.com/sssamuelll/openclo/issues/762) (GPU), [#763](https://github.com/sssamuelll/openclo/issues/763) (friction kernel), [#764](https://github.com/sssamuelll/openclo/issues/764) (capability matrix).
- Production bug regression coverage: [#604](https://github.com/sssamuelll/openclo/issues/604) (BUG-1), [#605](https://github.com/sssamuelll/openclo/issues/605) (BUG-2 — directly), [#606](https://github.com/sssamuelll/openclo/issues/606) (BUG-3), [#607](https://github.com/sssamuelll/openclo/issues/607) (BUG-4), [#771](https://github.com/sssamuelll/openclo/issues/771) (TSL re-init dispose), [#772](https://github.com/sssamuelll/openclo/issues/772) (TSL collision body dispose), [#749](https://github.com/sssamuelll/openclo/issues/749) (P1-1 setPins typed-array).

**PRs:**

- [#773](https://github.com/sssamuelll/openclo/pull/773) — GPU/TSL.
- [#774](https://github.com/sssamuelll/openclo/pull/774) — WASM.
- [#775](https://github.com/sssamuelll/openclo/pull/775) — CPU.
- [#776](https://github.com/sssamuelll/openclo/pull/776) — capability matrix meta-contract.
- [#777](https://github.com/sssamuelll/openclo/pull/777) — friction kernel regression.

**RFCs upstream:**

- A6 (`ClothSolverClient` interface): [`docs/reports/2026-05-01-rfc-a6-worker-protocol.md`](./2026-05-01-rfc-a6-worker-protocol.md).
- A7 (capability surface): [`docs/reports/2026-05-01-rfc-a7-wasm-cpu-equivalence.md`](./2026-05-01-rfc-a7-wasm-cpu-equivalence.md).
- A3 (cross-boundary errors / `{type, code, message}` shape): [`docs/reports/2026-05-01-drift-fase2-a3-cross-boundary-errors.md`](./2026-05-01-drift-fase2-a3-cross-boundary-errors.md).
- C4 (4-way tier orchestration / `toolDispatch.ts`): [`docs/reports/2026-05-02-drift-fase2-c4-4way-tier-orchestration.md`](./2026-05-02-drift-fase2-c4-4way-tier-orchestration.md).
- E-async-states (drift-fase2 audit cumulative closure — distinct audit, separate scope): [`docs/reports/2026-05-03-drift-fase2-e-async-states.md`](./2026-05-03-drift-fase2-e-async-states.md).

**Test files locked:**

- `src/utils/cloth/gpu/__tests__/gpuSolverClient.test.ts` (602 líneas, 25 tests).
- `src/utils/cloth/gpu/__tests__/fakeDevice.ts` (63 líneas, NEW helper).
- `src/utils/cloth/wasm/__tests__/wasmSolverClient.test.ts` (320 líneas, 11 tests).
- `src/utils/cloth/wasm/__tests__/fakeWorker.ts` (70 líneas, NEW helper).
- `src/utils/cloth/__tests__/clothWorkerClient.test.ts` (498 líneas, 20 tests, NEW).
- `src/utils/cloth/__tests__/fakeClothWorker.ts` (78 líneas, NEW helper).
- `src/utils/cloth/__tests__/solverCapabilities.test.ts` (331 líneas, 24 new + 5 pre-existing tests).
- `src/utils/cloth/__tests__/triangleCollision.test.ts` (271 líneas, +4 new friction tests).

---

**FIN DEL RFC.** Epic [#746](https://github.com/sssamuelll/openclo/issues/746) test-coverage closure — ratificado. Remaining P0/P1/P2 findings del epic continúan tracking independent post-merge per audit charter.
