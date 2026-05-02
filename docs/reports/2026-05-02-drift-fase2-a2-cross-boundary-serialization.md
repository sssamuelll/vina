# Drift Fase 2 — A2: Cross-boundary serialization Rust↔TS (config surface)

**Fecha:** 2026-05-02
**Eje:** A2 — config types + serialization (xpbd-wasm Rust crate ↔ TS workers/clients).
**Categoría inventario:** (c) RFC.
**Estado:** PROPUESTA. **Pattern 2.5 hybrid lite + ratify-by-convention con cross-doc.** Cuarta data point Pattern 2.5 lite (precedentes: D4, A4 § 3.2 declined as 2.5 lite, B10-state Par 1). Esperando review de Sam.

**Branch:** `drift/A2-cross-boundary-serialization`.
**Cross-ref inventario:** `docs/reports/2026-04-28-drift-inventory-fase1.md` § A2 (lines 122-128).
**Cross-ref classification:** `docs/reports/2026-04-28-drift-fase2-classification.md` § A2.
**Precedentes directos:**
- A3 (`2026-05-01-drift-fase2-a3-cross-boundary-errors.md`) — defensive Rust + cross-boundary contract Result-pattern forward-only.
- A4 (`2026-05-02-drift-fase2-a4-cross-language-geometry-mesh.md`) — "Rust↔TS" framing reformulation when Rust is consumer-only.
- A6 (`2026-05-01-rfc-a6-worker-protocol.md`) — `ClothSolverClient` 4-member lifecycle subset post compile-gate trigger; **explicitly defers setConfig/setters to A2** (`solverProtocol.ts:41`).
- A7 (`2026-05-01-rfc-a7-wasm-cpu-equivalence.md`) — per-feature port-or-ratify; `SolverCapabilities` surface; substeps semantic ratified per-tier-divergent.
- BUG-4 (`a164ea9c`) — historical "apply all setConfig fields to runtime, not just substeps". Fix introduced `currentConfig: AppliedSolverConfig` + `applySolverConfig()` centralization.
- bug-#690 (`b18f4762`) — regla 5 anchor (unit-conversion helpers must convert ALL components). A2 audit clean within territory (config layer is unit-pure SI).

---

## Sección 1 — Decide / NO decide

### Decide en este eje

1. **Inventory framing reformulación parcial (regla 0 + 13).** Inventory texto "Cross-boundary serialization Rust↔TS" es **parcialmente correcto** (no aplicación pura del A4 reframing): Rust SÍ exporta una real `configure()` ABI con 16 args posicionales (no consumer-only como A4). Pero el principal duplication shape es **TS-internal cross-tier** post-BUG-4 — la Rust ABI ya está centralizada vía `wasmSolverWorker.ts:applySolverConfig()`, mientras que la duplicación que persiste y que necesita decisión es cleavage de **field names + tipos + defaults** entre 4 superficies TS.
2. **Variante A (zero-copy reads) — ratify, no-drift.** ~8+ usages confirmed (`wasmSolverWorker.ts:248-250, 358-359, 386-387, 404-406, 421-422`). Per A4 § 2.2 + A3 ratification, zero-copy `Float32Array` views over WASM memory son legitimate consumer-only state queries. Pattern intencional. Ratify-as-is.
3. **Variante B (init copies) — ratify, ABI-required.** `wasmSolverWorker.ts:505, 510, 518, 521, 552` upload paths require copy at WASM boundary because Rust `to_vec()` clones the input (lib.rs:136-137, 143-144, 158-159, 165-166, 195-197, 202, 207-208, 224-225). Bounded, intentional ABI shape. Ratify-as-is.
4. **Variante C (config field-by-field) — Pattern 2.5 hybrid lite + ratify-by-convention con cross-doc.** Real cleavage entre 4 surfaces (CPU `ClothSimConfig`, WASM client `WasmSolverConfig`, WASM worker `AppliedSolverConfig`, Rust `configure()` ABI). Sub-decisiones articuladas en Sec 3:
   - **3.1** defaults convention: align WASM `bendCompliance` global y `selfCollision` to CPU values (latent divergences, prevent future regression when per-edge fallback path changes).
   - **3.2** type unification path: Pattern 2.5 hybrid lite (UI bridge helper) vs ratify-as-is.
   - **3.3** dead code cleanup: `clampSimConfig` en `simulationSlice.ts:790` sin callers.
   - **3.4** #686 follow-up disposition: gravity bundled into setConfig vs separate `setGravity` setter.

### NO decide en este eje

1. **Pattern 1 — full canonical Rust struct + auto-derive bindings.** Out-of-scope porque (i) compile-gate trigger anticipated TS2416 con 8 CPU-only fields + field name divergence (regla 3a, A6 precedent), (ii) Rust ABI cost (struct vs positional args + WASM rebuild + binding sync), (iii) GPU/TSL/Neural tiers ya ratified per-tier per A6 RFC § 3.1.C — full canonical conflictúa con esa ratificación. Captured § 7 reopen triggers si signal cambia.
2. **GPU `GpuSolverConfig` / `TslSolverConfig` integration.** Per A6 § 3.1.C, GPU tier config shape diverge intencionalmente (TSL substeps loop, no internalDamping, no thickness — TSL collision in fragment shader). A2 scope narrowed per kickoff to CPU + WASM + Rust. GPU tier ratified in A6.
3. **Neural drape config.** `NeuralDrapeClient` (`neuralDrapeClient.ts:106`) implements `ClothSolverClient` minimal interface only — no setConfig per current implementation. Out-of-scope A2.
4. **Rust API field rename ABI break.** Renaming `set_bend_with_types` parameter `rest_angles` → `rest_distances` (per A4 § 6 follow-up) is a separate concern; A2 doesn't touch Rust public ABI.
5. **`updateConstraints` not yet supported para WASM solver.** TODO comment en código (worker:763-768); out-of-scope A2 (feature gap, no config layer).
6. **Adaptive substeps / maxVelocity per-tier divergence.** Per A7 § 3.1.6 + § 3.1.7, both ratified CPU-only (architectural location difference). A2 doesn't touch.
7. **Self-collision WASM port.** Tracked en A7 #608. WASM worker forces `selfCollision: false` (BUG-5). A2's defaults convention sub-decision aligns the **default** but doesn't unblock the feature port.
8. **`setFabric` polymorphic resolution (A6 #685).** Per A6 RFC, fabric resolution moved to consumer. A2 doesn't decide this — just notes #685 sigue queued.
9. **Setter capability gates beyond config (A6 #683-684, #687-689).** A6 follow-ups touching setWind / setPins / error uniform / init factory / callback adapter live on concrete classes. A2 closes the **config layer** ratification only.
10. **`AnimationFrame` / `requestAnimationFrame` semantics.** WASM worker uses `setTimeout` for adaptive scheduling (worker:436-437). Out-of-scope.

### Por qué importa la línea

Sin la ratificación + sub-decisiones:
- **#686 follow-up (gravity bundled into setConfig)** queda bloqueado: A6 § 3.1.C explicitly defers setConfig shape to A2.
- **Latent defaults divergence** (`bendCompliance: 1.0` CPU vs `0.01` WASM) puede convertirse en active bug si un dev cambia per-edge population logic y de pronto se usa el global fallback. Today silent (per-edge wins); tomorrow diff observable.
- **Dual-write callsite** `GarmentSimulation.tsx:337-338` queda como tech debt — futuro UI control que cambie config tendrá que recordar `numSubsteps` (CPU) vs `substeps` (WASM). Predictable bug surface.
- **Dead code `clampSimConfig`** queda en `simulationSlice.ts` sin callers, induciendo expectativa de bridge layer that doesn't exist.
- **Cross-doc gap:** futuro dev mirando los 4 surfaces no ve la decisión articulada — solo el código diverso. Encuentra la divergencia, asume drift, abre PR cobarde.

A2 captura los hallazgos con sub-decisiones articuladas + cross-doc + 1 small forward-only convention.

---

## Sección 2 — Estado actual

### 2.1 Pre-existing canonical infrastructure (regla 1)

| Pattern | Found | Notes |
|---|---|---|
| `*Registry.ts` for config | None | No central config registry. |
| `*Manifest.ts` for cross-tier surfaces | `solverCapabilities.ts` (post-A7) | Capability surface for runtime feature presence; NOT config types. |
| Test `*Coverage.test.ts` / `*Invariant.test.ts` for config | None | Tests cover individual solver behavior; no convergence test across tiers. |
| Inline `// canonical:` markers | None for config | |
| `solverProtocol.ts:41` cross-doc | Yes — pre-marks A2 territory | "setConfig / setters: per-tier shape (A2 territory)." Indicates A6 ratified the cleavage with deferred unification. |
| Centralization post-BUG-4 | `wasmSolverWorker.ts:117 AppliedSolverConfig` + `applySolverConfig()` | Worker-side centralization completed via BUG-4 fix. CPU side inline via `solver.config` + `updateConfig`. |

**Conclusión:** post-BUG-4 there's **partial canonical** (worker-internal centralization), but no shared cross-tier types, no codegen layer, no convention for new fields. A2 extends the partial canonical with documentation + helper (Pattern 2.5 lite path) OR ratifies the cleavage with cross-doc (ratify-by-convention path).

### 2.2 Inventory claims verification (regla 0 + 13)

Inventory texto literal (`drift-inventory-fase1.md` líneas 122-128):

> A2 ★ — Cross-boundary serialization. Estado: drift real.
> Variantes:
>   A. Zero-copy via `new Float32Array(mem.buffer, ptr, n)` (~8 usos en `wasmSolverWorker.ts:133-135, 276`).
>   B. Copia completa en init / snapshots (~10 usos).
>   C. Config campo a campo, 16 args posicionales (`wasmSolverWorker.ts:395-412`, `lib.rs:226`).
> Diferencia funcional: Variante C no tiene tipo compartido. CPU worker acepta `Partial<ClothSimConfig>` tipado; WASM acepta objeto plano con defaults hardcoded. Agregar parámetro al `configure()` Rust requiere tocar el worker manualmente — propenso a desincronizar.
> Detalle adicional: `bendCompliance` default difiere entre workers (WASM=0.01, CPU=1.0).

| Claim | Status | Evidence |
|---|---|---|
| **A.** Zero-copy 8 usos | **Confirmed structural** | `wasmSolverWorker.ts:248-250, 358-359, 386-387, 404-406, 421-422` — Float32Array views. Inventory line 133-135 drift to 248-250 (refactor since 2026-04-28). Pattern intencional. |
| **B.** Init/snapshot copies ~10 usos | **Confirmed** | Init: `505, 510, 518, 521, 552` (5 setter uploads + constructor). Snapshots: `694-705, 709-724, 727-731, 733-743` (saveSnapshot/restoreSnapshot/deleteSnapshot/warmStart). Total ~9-10 sites. ABI-required clones in Rust (`to_vec()` calls). |
| **C.** Config 16 args posicionales | **Confirmed; line drift** | `lib.rs:253` (inventory citó 226, drift +27). `wasmSolverWorker.ts:173` (inventory citó 395-412, drift -222 — refactor centralized via `applySolverConfig`). 16 args verified in lib.rs:253-260, generated bindings xpbd_wasm.d.ts:17, worker interface line 64-71. |
| **C.b** "Tipo compartido no existe" | **Confirmed** | 4 surfaces inventoried in 2.4. Zero shared types between Rust and any TS surface; zero shared types between CPU and WASM TS surfaces. |
| **C.c** "Agregar parámetro requiere tocar worker manualmente" | **Confirmed** | Per BUG-4 history — `setConfig` handler dropped fields silently until `currentConfig: AppliedSolverConfig` introduced. Adding new field today: (i) Rust struct + constructor + configure() arg, (ii) regenerate bindings, (iii) WASM worker `WasmXpbdSolver` interface + `AppliedSolverConfig` + `DEFAULT_SOLVER_CONFIG` + `applySolverConfig` + `WasmSolverConfig` client, (iv) optionally CPU `ClothSimConfig` + defaults. ~6-7 touch points minimum. |
| **D.** `bendCompliance` default WASM=0.01, CPU=1.0 | **Confirmed; latent** | CPU `xpbdSolver.ts:389` `bendingCompliance: 1.0`; WASM worker `wasmSolverWorker.ts:140` `bendCompliance: 0.01`; Rust `lib.rs:117` `bend_compliance: 0.01`. Both tiers populate per-edge compliances from `bendComplianceWarp/Weft = 1.0` (matching across all 3 surfaces) — global fallback never used in practice. **Latent divergence**, not active bug. Reopen trigger if per-edge population logic changes. |

**3/3 + 2 sub-claims confirmed.** Inventory framing accurate at structural level. **Reformulation post-sweep:**

> **A2 reformulado:** drift es real, but the principal axis is **TS-internal cleavage post-BUG-4** + **latent defaults divergence**:
> - **C1.** Field name divergence (CPU `numSubsteps` vs WASM `substeps`, CPU `clothThickness` vs WASM `thickness`, CPU `bendingCompliance` vs WASM `bendCompliance`, etc.).
> - **C2.** Field set divergence (CPU has 8 extra fields: `groundFriction`, `adaptiveSubsteps`, `minSubsteps`, `maxSubsteps`, `maxVelocity`, `enableLRA`, `dt`, `windForce`; WASM has 1 extra: `collisionMargin`).
> - **C3.** Defaults divergence latent (`bendCompliance` 1.0 vs 0.01; `selfCollision` true vs false; `collisionMargin` field absent CPU side).
> - **C4.** Dual-write callsite (`GarmentSimulation.tsx:337-338`) — UI bridge layer must remember field name cleavage. Bug surface.
> - **C5.** Dead code `clampSimConfig` (`simulationSlice.ts:790`) — 0 callers. Either historical or speculative.
> - **C6.** Rust ABI 16 args positional — adding field still requires manual touch propagation; BUG-4 fix centralized worker side, but Rust↔worker boundary is still positional.

Variants A + B closed by inventory claim verification (intentional patterns ratified). Variant C is the principal sub-decision tree.

### 2.3 Rust crate ABI inventory (config surface)

`crates/xpbd-wasm/src/lib.rs` (832 líneas). Config-touching exports:

| Export | Signature | Args count | Surface |
|---|---|---|---|
| `XpbdSolver::new` | `(positions: &[f32], inv_mass: &[f32]) -> XpbdSolver` | 2 | Constructor; defaults inline (lines 113-130). |
| `configure` | `(substeps: u32, damping: f32, gravity_y: f32, stretch_compliance: f32, bend_compliance: f32, self_collision: bool, thickness: f32, collision_margin: f32, ground_y: f32, drag_coefficient: f32, stretch_compliance_warp: f32, stretch_compliance_weft: f32, stretch_compliance_shear: f32, bend_compliance_warp: f32, bend_compliance_weft: f32, internal_damping: f32)` | **16** | Bulk config update. Snake_case Rust convention. |
| `set_wind` | `(wx: f32, wy: f32, wz: f32)` | 3 | Vector setter. NOT in `configure()`. |
| `set_pins` / `clear_pins` / `set_seams_with_compliance` / etc. | n/a | varies | Setter cluster (A6 § 3.6 follow-ups #683-684). |

**Generated TS bindings** (`crates/xpbd-wasm/pkg/xpbd_wasm.d.ts:17`):

```ts
configure(substeps: number, damping: number, gravity_y: number, stretch_compliance: number, bend_compliance: number, self_collision: boolean, thickness: number, collision_margin: number, ground_y: number, drag_coefficient: number, stretch_compliance_warp: number, stretch_compliance_weft: number, stretch_compliance_shear: number, bend_compliance_warp: number, bend_compliance_weft: number, internal_damping: number): void;
```

**Auto-bindings preservation:** wasm-bindgen passes positional args as-is; field names are documentation in Rust source + JSDoc on the binding. No struct serialization at this surface. Adding a parameter requires:

1. Rust signature change (`configure(... new_arg: f32)`).
2. Body assignment (`self.new_arg = new_arg`).
3. Constructor default initialization (`new_arg: <default>`).
4. Struct field declaration (`pub struct XpbdSolver { ... new_arg: f32 }`).
5. WASM rebuild + sync (CLAUDE.md non-negotiable: BOTH `xpbd_wasm.js` + `xpbd_wasm_bg.wasm`).
6. TS-side `WasmXpbdSolver` interface (`wasmSolverWorker.ts:53-81`).
7. TS-side `AppliedSolverConfig` (`wasmSolverWorker.ts:117`).
8. TS-side `DEFAULT_SOLVER_CONFIG` (`wasmSolverWorker.ts:135`).
9. TS-side `applySolverConfig` configure() call (worker:173-190).
10. TS-side `WasmSolverConfig` client (`wasmSolverClient.ts:44`).
11. Optional: CPU `ClothSimConfig` if cross-tier shareable.
12. Optional: CPU defaults at `xpbdSolver.ts:383-407`.
13. Optional: TSL/GPU `TslSolverConfig` / `GpuSolverConfig`.

**Touch surface to add 1 field: 6-13 sites depending on cross-tier scope.** This is the structural cost the inventory texto called "propenso a desincronizar".

### 2.4 TS config surfaces inventory

#### 2.4.1 CPU `ClothSimConfig` (xpbdSolver.ts:107-173)

23 fields, named (camelCase), defaults at constructor (lines 383-407):

```ts
export interface ClothSimConfig {
  numSubsteps: number;          // default 15
  gravity: [number, number, number];  // default [0, -9.81, 0]
  dt: number;                    // default 1/60
  damping: number;               // default 0.99
  stretchingCompliance: number;  // default 0.0
  bendingCompliance: number;     // default 1.0  ← divergent from WASM/Rust
  groundY: number;               // default 0.0
  groundFriction: number;        // default 0.5  ← CPU-only
  selfCollision: boolean;        // default true ← divergent (latent)
  clothThickness: number;        // default 0.002
  adaptiveSubsteps: boolean;     // default true ← CPU-only (A7 § 3.1.6)
  minSubsteps: number;           // default 10   ← CPU-only
  maxSubsteps: number;           // default 30   ← CPU-only
  maxVelocity: number;           // default 5.0  ← CPU-only (A7 § 3.1.7)
  enableLRA: boolean;            // default true ← CPU-only (A7 ratified)
  dragCoefficient: number;       // default 1.0
  stretchComplianceWarp: number;  // default 0.0
  stretchComplianceWeft: number;  // default 0.0
  stretchComplianceShear: number; // default 0.001
  bendComplianceWarp: number;     // default 1.0
  bendComplianceWeft: number;     // default 1.0
  internalDamping: number;        // default 0.3
  windForce: [number, number, number]; // default [0,0,0] ← CPU-only API (WASM uses setWind separately)
}
```

CPU-only fields: 8 (groundFriction + adaptiveSubsteps + min/maxSubsteps + maxVelocity + enableLRA + dt + windForce). All ratified by A7 (substeps adaptive + maxVelocity location) o tier-specific feature (LRA, windForce, dt, groundFriction).

CPU lacks: `collisionMargin` (uses `clothThickness` for both purposes per `xpbdSolver.ts:730 margin: this.config.clothThickness ?? 0.005`).

Update via `xpbdSolver.ts:1523 updateConfig(partial: Partial<ClothSimConfig>)` — `Object.assign` merge.

#### 2.4.2 WASM client `WasmSolverConfig` (wasmSolverClient.ts:44-67)

16 fields, all optional (camelCase, NO defaults — caller must pass):

```ts
export interface WasmSolverConfig {
  substeps?: number;             // ← divergent name from CPU `numSubsteps`
  damping?: number;
  gravityY?: number;             // ← scalar; CPU has gravity[3]
  stretchCompliance?: number;    // ← divergent name from CPU `stretchingCompliance`
  bendCompliance?: number;       // ← divergent name from CPU `bendingCompliance`
  selfCollision?: boolean;
  thickness?: number;            // ← divergent name from CPU `clothThickness`
  collisionMargin?: number;      // ← WASM-only
  groundY?: number;
  dragCoefficient?: number;
  stretchComplianceWarp?: number;
  stretchComplianceWeft?: number;
  stretchComplianceShear?: number;
  bendComplianceWarp?: number;
  bendComplianceWeft?: number;
  internalDamping?: number;
}
```

#### 2.4.3 WASM worker `AppliedSolverConfig` (wasmSolverWorker.ts:117-152)

Same 16 fields, all required (no `?`), with defaults in `DEFAULT_SOLVER_CONFIG`:

```ts
const DEFAULT_SOLVER_CONFIG: AppliedSolverConfig = {
  substeps: 15,                  // matches CPU 15 ✓
  damping: 0.99,                 // matches CPU 0.99 ✓
  gravityY: -9.81,               // matches CPU gravity[1] -9.81 ✓
  stretchCompliance: 0.0,        // matches CPU 0.0 ✓
  bendCompliance: 0.01,          // ← DIVERGENT from CPU 1.0 (latent)
  selfCollision: false,          // ← DIVERGENT from CPU true (latent)
  thickness: 0.002,              // matches CPU 0.002 ✓
  collisionMargin: 0.005,        // ← CPU lacks field
  groundY: 0.0,                  // matches CPU 0.0 ✓
  dragCoefficient: 1.0,          // matches CPU 1.0 ✓
  stretchComplianceWarp: 0.0,    // matches CPU 0.0 ✓
  stretchComplianceWeft: 0.0,    // matches CPU 0.0 ✓
  stretchComplianceShear: 0.001, // matches CPU 0.001 ✓
  bendComplianceWarp: 1.0,       // matches CPU 1.0 ✓
  bendComplianceWeft: 1.0,       // matches CPU 1.0 ✓
  internalDamping: 0.3,          // matches CPU 0.3 ✓
};
```

Module-scoped `currentConfig` (line 153) holds the merge of `DEFAULT_SOLVER_CONFIG ∪ msg.config`. `setConfig` message merges partial updates into `currentConfig` and re-applies via `applySolverConfig()` (worker:559, 661, 666). **Post-BUG-4 canonical worker shape.**

#### 2.4.4 Surface comparison

```
                  CPU   WASM client   WASM worker   Rust constructor
                  ───   ───────────   ───────────   ────────────────
fields            23    16            16            16 (in struct)
required          all   none (?)      all           all (positional)
defaults          inline initializer  DEFAULT_SOLVER_CONFIG (worker)  inline (lib.rs:113)
update API        updateConfig(p)     setConfig(p)  setConfig(p)→applySolverConfig→solver.configure(...positional)
naming            camelCase, "ing"    camelCase, no "ing"             snake_case
shareable types   no                   no            no
```

**4 surfaces, 0 shared types.** Translation is implicit at every call boundary.

### 2.5 Defaults convention audit

| Field | CPU default | WASM worker default | Rust constructor | Match status |
|---|---|---|---|---|
| substeps / numSubsteps | 15 | 15 | 15 | ✓ |
| damping | 0.99 | 0.99 | 0.99 | ✓ |
| gravity[1] / gravityY | -9.81 | -9.81 | -9.81 | ✓ |
| stretch[ing]Compliance | 0.0 | 0.0 | 0.0 | ✓ |
| **bend[ing]Compliance** (global) | **1.0** | **0.01** | **0.01** | **✗ latent** |
| **selfCollision** | **true** | **false** | **false** | **✗ latent** |
| thickness / clothThickness | 0.002 | 0.002 | 0.002 | ✓ |
| collisionMargin | (n/a) | 0.005 | 0.005 | ✗ field-absent CPU |
| groundY | 0.0 | 0.0 | 0.0 | ✓ |
| dragCoefficient | 1.0 | 1.0 | 1.0 | ✓ |
| stretchComplianceWarp | 0.0 | 0.0 | 0.0 | ✓ |
| stretchComplianceWeft | 0.0 | 0.0 | 0.0 | ✓ |
| stretchComplianceShear | 0.001 | 0.001 | 0.001 | ✓ |
| bendComplianceWarp | 1.0 | 1.0 | 1.0 | ✓ |
| bendComplianceWeft | 1.0 | 1.0 | 1.0 | ✓ |
| internalDamping | 0.3 | 0.3 | 0.3 | ✓ |

**13/16 shared fields aligned. 2 latent divergences + 1 field absence.**

**`bendCompliance` global divergence latent because:**
- WASM worker init pipeline always calls `solver.set_bend_with_types(bend.ids, bendRestDistances, bend.edgeTypes)` (worker:518) — this populates `bend_compliances` per-constraint array from `bend_compliance_warp/weft = 1.0` (lib.rs:165-174).
- CPU constructor populates `bendCompliances[i]` from `bendComplianceWarp/Weft = 1.0` (xpbdSolver.ts:598-600).
- Rust `solve_bend` uses `bend_compliances[c]` if available, else fallback `self.bend_compliance` (lib.rs:438-442).
- **Per-edge always populated → global never used.**

**`selfCollision` divergence latent because:**
- WASM worker forces `selfCollision: false` regardless of `currentConfig.selfCollision` (worker:162-167, 179): `solver.configure(... false, ...)`. BUG-5 / A7 RFC #608 — feature gap WASM tier.
- CPU `selfCollision: true` triggers actual self-collision in solve loop (xpbdSolver.ts:1151-1156).

**`collisionMargin` field absence:**
- CPU uses `clothThickness` for both inflation and collision margin (xpbdSolver.ts:730 `margin: this.config.clothThickness`).
- WASM/Rust have separate `collision_margin` field that defaults to `0.005` (vs `clothThickness: 0.002`).
- Behavioral consequence: WASM has slightly more permissive collision (margin > thickness) than CPU when defaults are used. Subtle, mostly unobservable in practice (5mm vs 2mm collision tolerance).

### 2.6 Variant A — zero-copy reads (ratify)

Locations confirmed:

| Site | Operation |
|---|---|
| `wasmSolverWorker.ts:248` | `posView = new Float32Array(mem.buffer, posPtr, n3)` (collision branch) |
| `wasmSolverWorker.ts:249` | `velView = new Float32Array(mem.buffer, velPtr, n3)` |
| `wasmSolverWorker.ts:250` | `prevView = new Float32Array(mem.buffer, prevPtr, n3)` |
| `wasmSolverWorker.ts:359` | `posView = new Float32Array(...)` (no-collision branch) |
| `wasmSolverWorker.ts:386, 387` | NaN guard views (post-A3) |
| `wasmSolverWorker.ts:404, 406` | Velocity clamp views |
| `wasmSolverWorker.ts:421` | Frame postMessage view (`.slice()` for transfer) |
| `wasmSolverWorker.ts:440-444` | `readPositions()` helper |
| `wasmSolverWorker.ts:625, 754, 718` | Initial collision / edge data / restoreSnapshot |

**Pattern intencional, ratified.** Per A4 § 2.2 (Rust crate is consumer-only of geometry; positions are state queried via zero-copy) + A3 § 2.7 (zero-copy hot path preserved as performance-critical).

JSDoc at top of `wasmSolverWorker.ts:1-29` (post-A3) already documents the cross-boundary contract including zero-copy semantics. **No A2 contribution needed for variant A** beyond cross-doc reference.

### 2.7 Variant B — init / setter copies (ratify)

Locations confirmed (init path):

| Site | Operation | ABI requirement |
|---|---|---|
| `wasmSolverWorker.ts:505` | `new wasmModule.XpbdSolver(merged.vertices, invMass)` | Constructor `to_vec()` (lib.rs:87-91) |
| `wasmSolverWorker.ts:510` | `solver.set_stretch_with_types(stretch.ids, stretch.restLengths, stretch.edgeTypes)` | `to_vec()` x3 (lib.rs:143-153) |
| `wasmSolverWorker.ts:518` | `solver.set_bend_with_types(bend.ids, bendRestDistances, bend.edgeTypes)` | `to_vec()` x3 (lib.rs:165-174) |
| `wasmSolverWorker.ts:521` | `solver.set_triangles(triangles)` | `to_vec()` (lib.rs:202) |
| `wasmSolverWorker.ts:552` | `solver.set_seams_with_compliance(ids, restLengths, compliances)` | `to_vec()` x3 (lib.rs:195-197) |

Plus snapshot path (`saveSnapshot/restoreSnapshot/deleteSnapshot/warmStart`):

| Site | Operation | Reason |
|---|---|---|
| `wasmSolverWorker.ts:444` | `readPositions().slice()` | Detachment from WASM memory for postMessage transfer |
| `wasmSolverWorker.ts:715` | `target.set(saved)` (restoreSnapshot writes Float32Array into WASM memory) | Required write-back to internal buffer |
| `wasmSolverWorker.ts:739` | `target.set(incoming)` (warmStart) | Same |

**Pattern intencional, ABI-required.** Rust `to_vec()` is necessary for ownership transfer at WASM boundary — pointer-based zero-copy works for reads but not writes (positions internal buffer requires populated `Vec<f32>` ownership). Snapshot saves require detached copies (`.slice()`) for transferable postMessage.

**No A2 contribution needed for variant B.** Pattern is documented implicitly via Rust source + worker source. Ratify as ABI requirement.

### 2.8 Variant C — config field-by-field (real cleavage)

#### 2.8.1 Surface inventory (4 surfaces, 0 shared types)

See § 2.4.4 comparison table. Critical observations:
- **Field name divergence** is structural (CPU `numSubsteps` vs WASM `substeps`).
- **Field set divergence** is structural (8 CPU-only fields, 1 WASM-only).
- **Defaults divergence** is latent (2 fields) + 1 field-absence.
- **Update API divergence:** CPU `updateConfig` direct merge; WASM `setConfig` postMessage→merge→`applySolverConfig`→positional `solver.configure(...)`.

#### 2.8.2 Dual-write callsite — `GarmentSimulation.tsx:329-339`

```ts
useEffect(() => {
  const mode = SIMULATION_MODES[simulationMode];
  substepsRef.current = mode.substeps;
  // GPU/TSL path
  if (tslSolverRef.current) {
    tslSolverRef.current.updateConfig({ substeps: mode.substeps });
  }
  // WASM / CPU-Worker paths
  clients.wasm?.setConfig({ substeps: mode.substeps });
  clients.cpu?.setConfig({ numSubsteps: mode.substeps });
}, [simulationMode, tslSolverRef, clients]);
```

**3 different APIs (`updateConfig` / `setConfig` × 2) + 2 different field names (`substeps` / `numSubsteps`) for the same UI control** (simulation mode quality preset).

This is the smoking gun for variant C drift. Future UI bridge that touches another shared config field (e.g., damping) will face the same triple-write pattern. Today only this single callsite — bounded.

#### 2.8.3 BUG-4 historical context

Pre-BUG-4 fix (`a164ea9c`, 2026-04-30, 2 days before A2 sweep):
- Worker `setConfig` handler extracted only `msg.config.substeps` from `Partial<WasmSolverConfig>` and passed to `solver.configure(substeps, /* hardcoded defaults for everything else */)`.
- All other fields silently dropped. Damping/gravity/drag/thickness/etc. couldn't be updated at runtime via `setConfig`.

Post-BUG-4 fix:
- Introduced `interface AppliedSolverConfig` (worker:117) — fully typed, all 16 fields required.
- Introduced `DEFAULT_SOLVER_CONFIG` (worker:135) — reference defaults.
- Introduced module-scoped `currentConfig: AppliedSolverConfig` (worker:153) — last-applied state.
- Introduced `applySolverConfig()` helper (worker:157) — single point for `solver.configure(...positional)` call, sources from `currentConfig`.
- `setConfig` handler (worker:656-667) now merges `Partial<WasmSolverConfig>` into `currentConfig` and re-applies.
- Init handler (worker:559) populates `currentConfig` from `{ ...DEFAULT_SOLVER_CONFIG, ...msg.config }`.

**This is the canonical post-fix shape.** A2 doesn't refactor this — it documents it as Pattern 2.5 lite candidate canonical for the worker layer + extends defaults convention to align latent divergences.

#### 2.8.4 Cross-tier consumer producers

Outside `cloth/`, config-touching code:

| Site | Operation |
|---|---|
| `simulationSlice.ts` (Redux state) | Holds physics knobs: `windForce`, `windEnabled`, `dragCoefficient`, `particleDistance`, `simulationMode`, etc. |
| `simulationSlice.ts:790 clampSimConfig` | **Dead code (0 callers).** Function name suggests bridge layer but never wired. |
| `GarmentSimulation.tsx:337-338` | Dual-write callsite (variant C smoking gun). |
| `useColorwaySync.ts` | Per project memory + B10-state Par 1: bridges `project.fabricId` to sim. Calls `setFabric` not `setConfig`. Out-of-scope variant C. |
| Settings panels / sliders | Verify: no direct `setConfig` callers found via grep. UI knobs flow through Redux → `useEffect` → client. |

**Single dual-write callsite confirmed.** Other config flows route through Redux state + side-effect hooks that compose specific shapes for each client. The cleavage is bounded; expansion would require new dual-write effects.

### 2.9 Cross-language vs TS-internal framing (A4 reframing applicability)

A4 § 2.1 ratificó "Rust crate is consumer-only — 0 geometry extraction exports". A2 inverts:

| Aspect | A4 reality | A2 reality |
|---|---|---|
| Rust exports geometry | No | n/a |
| Rust exports config setters | n/a | **Yes — `configure()` 16 args + `set_wind`/`set_pins`/etc.** |
| Rust ABI is real cross-language coupling | No (geometry consumer-only) | **Yes (16-arg positional ABI must be maintained sync with TS)** |
| TS-internal cross-tier cleavage | Yes (CPU vs GPU/WASM extractor algorithms) | Yes (CPU `ClothSimConfig` vs WASM `WasmSolverConfig` types) |
| Reformulation: "Rust↔TS" → "TS-internal" | **Full** | **Partial** |

**A2 is BOTH cross-language and TS-internal.** Reformulation is partial:
- Cross-language part is **bounded** (Rust ABI is well-defined, BUG-4 already centralized worker side, generated bindings are auto-derived).
- TS-internal part is **the principal axis post-BUG-4** (4 surfaces, divergent field names, latent defaults).

Per regla 13 + 0: A2's framing reformulated to recognize the partial reframing. Inventory framing "drift real" is correct; the **shape** of the drift is principally TS-internal post-BUG-4 with Rust ABI as the structural floor.

### 2.10 Outside obvious dirs sweep (regla 6)

Grep summary:
- `ClothSimConfig|WasmSolverConfig|AppliedSolverConfig|DEFAULT_SOLVER_CONFIG`: 7 files (all in `src/utils/cloth/` + `src/store/simulationSlice.ts`).
- `setConfig\b`: 5 callsite locations (`GarmentSimulation.tsx:337-338` is the only outside-cloth/ callsite).
- `clampSimConfig`: 1 site (definition in simulationSlice.ts; **0 callers**).
- `Partial<ClothSimConfig>`: 4 sites (all in `cloth/` — `clothWorker.ts:42, 43, 52`, `clothWorkerClient.ts:67, 109, 210`, `xpbdSolver.ts:382, 1523`).

**Drift surface bounded.** Outside `cloth/`:
- `simulationSlice.ts` holds Redux state with physics knobs + dead `clampSimConfig`.
- `GarmentSimulation.tsx` is the bridge layer (single dual-write callsite + per-frame coordinator).

A2 sweep clean per regla 6 — no sibling consumer surprises.

### 2.11 Compile-gate trigger anticipation (regla 3a + 8)

Per A6 precedent (TS2416 on `implements ClothSolverClient` for GPU `initMultiPiece` + CPU `FrameCallback`), Pattern 1 path (full canonical) for A2 would face:

| Pattern 1 attempt | Compile-gate symptom |
|---|---|
| Shared `interface SimConfig` extends both | TS2416 on `numSubsteps` vs `substeps`, `clothThickness` vs `thickness`, `bendingCompliance` vs `bendCompliance`, `gravity` (vector) vs `gravityY` (scalar), missing CPU-only fields. |
| Rust struct → JsValue serialization | wasm-bindgen `serde_wasm_bindgen` works but breaks zero-copy semantics elsewhere; positional → struct is ABI break for callers. |
| Codegen layer (proc-macro Rust → TS types) | Adds build-time tool (e.g., `ts-rs`); requires Cargo dep + build pipeline integration. |
| CPU drops 8 fields | Breaks A7 ratification (LRA, adaptive substeps, maxVelocity location). Out-of-scope. |
| WASM adds 8 fields | Requires Rust ABI expansion + WASM rebuild + 8 new tier-divergent semantics decisions. Out-of-scope. |

**Pattern 1 carries compile-gate trigger risk + Rust ABI cost + scope blowup beyond A2.** Per regla 3a + A6 precedent, scope-reduction-on-trigger should be primary path consideration — but for A2 the better bet is **Pattern 2.5 hybrid lite** path that surgically targets the bug surface (defaults latent + UI bridge dual-write) without forcing convergence.

If Sam decides Pattern 1 anyway, anticipate compile-gate at sweep dry-run + budget scope-reduction-on-trigger doc amendment IN F3.

### 2.12 Sweep negativo (qué NO emergió)

- 0 lint rules en repo enforcing config field-name convention.
- 0 codegen/proc-macro infrastructure (no `ts-rs`, `tsync`, `wasm-bindgen-derive` for struct serialization).
- 0 partial-conversion bugs (regla 5 anchored bug-#690) within A2 territory — config layer is unit-pure SI (m, m/s², s, dimensionless). `dt` is seconds, `gravity` is m/s², `thickness` is metres, etc. No mm⇄m or deg⇄rad translation occurs at config layer.
- 0 active bugs from defaults divergence — both confirmed latent.
- 0 silent-failure surfaces beyond A3 NaN guard (already extended via wasmNaNCount).
- 0 GPU/TSL config consumers outside `gpu/` directory (TSL `updateConfig` callers all in `gpuSolverClient.ts` or tests).
- 0 telemetry/usage signals on `setConfig` frequency (would inform whether dual-write helper is worth the abstraction).

Sweep cerró clean con framing reformulation (partial) + 3 variants + 4 sub-decisiones for variant C.

---

## Sección 3 — Sub-decisiones, opciones y tradeoffs

Cuatro sub-decisiones for variant C: 3.1 (defaults convention), 3.2 (type unification path), 3.3 (`clampSimConfig` cleanup), 3.4 (#686 follow-up disposition).

### 3.1 Defaults convention

**Pregunta:** Latent divergences `bendCompliance` (1.0 CPU vs 0.01 WASM/Rust) + `selfCollision` (true CPU vs false WASM/Rust) + `collisionMargin` field-absent CPU. ¿Fix or ratify?

#### Opción 3.1.A — Align WASM defaults to CPU: `bendCompliance: 1.0` + leave `selfCollision: false` (RECOMENDADA)

Change `wasmSolverWorker.ts:140` `bendCompliance: 0.01` → `1.0`. Change `lib.rs:117` `bend_compliance: 0.01` → `1.0`. Leave `selfCollision: false` because BUG-5 forces it false anyway (WASM tier ratified-no-self-collision per A7 #608).

Aligning bendCompliance:
- **Pros:**
  - **Latent → eliminated.** If future per-edge population logic changes (e.g., edge type detection produces uncategorized edge → fallback to global), CPU and WASM will produce equivalent results.
  - **Defensive convention for new fields:** documents Rust constructor as ABI source-of-truth (CLAUDE.md anchor).
  - **Trivial migration:** 2 single-line changes (Rust + worker) + WASM rebuild.
  - **Aligned con BUG-4 spirit** (centralize, don't diverge).
- **Cons:**
  - Requires WASM rebuild + sync (CLAUDE.md non-negotiable: BOTH `xpbd_wasm.js` + `xpbd_wasm_bg.wasm`).
  - Behavior change if anyone is currently relying on global fallback being 0.01 — but per § 2.5 this is empirically not happening.

Leaving `selfCollision`:
- **Pros:**
  - WASM forces false anyway (BUG-5, worker:162-167). Aligning default to true would be cosmetic only, then immediately overridden.
  - Rust constructor + worker default reflect actual capability state. CPU `true` reflects actual CPU capability.
  - **Per-tier-truthful** defaults — caller-visible state matches reality.
- **Cons:**
  - "Latent divergence" persists at the level of declared defaults.
- **Tradeoff aceptado:** divergence is faithful to reality, not drift.

Leaving `collisionMargin`:
- **Pros:**
  - CPU's pattern of using `clothThickness` for both purposes is documented in code (xpbdSolver.ts:730).
  - Adding `collisionMargin` to CPU would require migration of `xpbdSolver.ts` constructor + initialization + solver paths — out-of-scope A2.
- **Cons:**
  - Subtle tier-divergent collision tolerance (5mm WASM vs 2mm CPU when defaults used).
- **Tradeoff aceptado:** existing per-tier semantic; A2 documents not refactors.

#### Opción 3.1.B — Align CPU to WASM (`bendingCompliance: 0.01`)

Change CPU `xpbdSolver.ts:389` `bendingCompliance: 1.0` → `0.01`.

- **Pros:** uniform default downward.
- **Cons (primary):** **CPU side has more usage history** — changing CPU default may break existing workflows or test fixtures. WASM side is newer (BUG-4 fix recent) and less load-bearing.
- **Cons (secondary):** Rust constructor `bend_compliance: 0.01` was likely set by inertia (initial WASM port copied original CPU value, but CPU evolved). Aligning CPU to inertia is wrong direction.
- **Descartar** — wrong direction.

#### Opción 3.1.C — Status quo (ratify latent divergence)

Document the latent divergences in CLAUDE.md / this doc; no code change.

- **Pros:** zero change.
- **Cons (primary):** **future regression vector.** If per-edge population logic changes (new edge type, new fallback path, edge-classification refactor), the latent divergence becomes active divergence. Cheap to fix today (~3 lines) vs hard-to-debug numerical bug tomorrow.
- **Cons (secondary):** ratify-by-convention without anchor convention is documentary-only — no enforcement.
- **Descartar** — preventive insurance is cheap.

#### Opción 3.1.D — Pattern 2.5 extend convention: Rust constructor as defaults canonical

Beyond 3.1.A, anchor a forward-only convention in CLAUDE.md: "**Rust constructor (lib.rs:113-130) is canonical for cross-tier defaults.** WASM `DEFAULT_SOLVER_CONFIG` MUST match field-by-field. CPU `ClothSimConfig` defaults MUST match for shared fields; CPU-only fields independent. Future fields added: declare in Rust first, propagate to WASM worker, optionally to CPU."

- **Pros over 3.1.A alone:**
  - **Enforcement guidance** for future contributors. New field added to Rust struct → WASM worker default must match.
  - **Aligned con A6 § 3.6 decoupling** (closure principle + per-feature ports follow-up).
  - **JSDoc anchor** in `wasmSolverWorker.ts:135` cross-references convention.
- **Cons:**
  - Convention not enforced via lint — discoverability via CLAUDE.md + JSDoc only.
- **Migration:** 3.1.A + ~10 lines CLAUDE.md + ~5 lines JSDoc.

#### Recomendación 3.1

**Opción 3.1.A + D combined** confianza alta. Razones:

1. **Latent → eliminated** for `bendCompliance` (cheap insurance against future regression).
2. **Faithful divergence** preserved for `selfCollision` (per-tier capability reality, BUG-5 forced).
3. **Convention anchored** (Rust as ABI defaults source-of-truth) for future field additions.
4. **Aligned con audit philosophy regla 11** — fix real (bendCompliance) when cheap; align for consistency (selfCollision, collisionMargin) when divergence reflects reality.

**Tradeoff aceptado:**
- WASM rebuild required (Rust source change). Per CLAUDE.md non-negotiable: BOTH `xpbd_wasm.js` + `xpbd_wasm_bg.wasm` synced.
- `selfCollision: false` divergence preserved as faithful, not silent.
- `collisionMargin` field absence in CPU preserved as architectural cleavage; documented inline.

---

### 3.2 Type unification path

**Pregunta:** ¿Pattern 1 (full canonical), Pattern 2.5 hybrid lite (UI bridge helper), Pattern 2.5 extend (per-tier translation), or ratify-as-is con cross-doc?

#### Opción 3.2.A — Pattern 1: shared Rust struct + auto-derive bindings

Refactor Rust `configure()` from 16 positional args → struct param: `pub fn configure(&mut self, config: SolverConfig)`. Use `serde_wasm_bindgen` for JsValue serialization. TS-side derives types from generated bindings.

- **Pros:**
  - Single source of truth at Rust layer.
  - Adding field: Rust struct + 1 line. No multi-touch propagation.
  - Forward-only enforcement via type system.
- **Cons (primary):** **Rust ABI break + scope blowup.**
  - Existing positional `configure` callers (worker:173-190) must migrate.
  - WASM rebuild + sync required.
  - serde_wasm_bindgen adds Cargo dep + bundle size.
  - Compile-gate likely TS2416 if forced into shared interface (CPU has 8 extra fields).
- **Cons (secondary):** **GPU/TSL/Neural tiers ratified per-tier shapes per A6 § 3.1.C.** Pattern 1 conflicts with A6 ratification — would require A6 § 3.1.C reopen.
- **Cons (tertiary):** **Calibration regime mismatch.** Pattern 1 is open-ended (Rust ABI + codegen integration + cross-tier compile-gate). Per audit-state.md Pattern 2.5 calibration: per-feature 1.0x, uniform 0.6-0.8x. Pattern 1 floor is ~1.5-2x pero ceiling is open. A2 estimate budget per audit-state.md: 6-9h F2 (consistent con (c) RFC scope). Pattern 1 would explode beyond budget.
- **Descartar para A2** — scope risk + A6 ratification conflict. Captured § 7 reopen trigger if codegen layer gets adopted elsewhere in repo.

#### Opción 3.2.B — Pattern 2.5 hybrid lite: UI bridge helper + JSDoc cross-doc (RECOMENDADA)

Add `mapClothSimConfigToWasmSolverConfig` helper in `src/utils/cloth/configBridge.ts` (~50 líneas) that translates the **shared subset** between CPU and WASM:

```ts
// configBridge.ts (new file, ~50 líneas)

import type { ClothSimConfig } from './xpbdSolver';
import type { WasmSolverConfig } from './wasm/wasmSolverClient';

/**
 * Translate a partial CPU ClothSimConfig to the equivalent WasmSolverConfig
 * shape. Used at UI bridge layer when same UI control affects both tiers.
 *
 * **Cleavage ratified by A2 § 3.2 — see Fase 2 doc:**
 * - 16/23 fields shareable (renamed): numSubsteps→substeps,
 *   clothThickness→thickness, stretchingCompliance→stretchCompliance,
 *   bendingCompliance→bendCompliance, gravity[1]→gravityY.
 * - 8 CPU-only fields skipped: groundFriction, adaptiveSubsteps,
 *   minSubsteps, maxSubsteps, maxVelocity, enableLRA, dt, windForce
 *   (windForce uses separate setWind() WASM API; A6 § 3.6 #683).
 * - 1 WASM-only field absent: collisionMargin (CPU uses clothThickness for
 *   both inflation + margin per xpbdSolver.ts:730).
 *
 * Forward-only: new shared field added to ClothSimConfig should also be
 * mapped here. Tier-specific fields stay in their own surface.
 */
export function mapClothSimConfigToWasmSolverConfig(
  cpu: Partial<ClothSimConfig>,
): Partial<WasmSolverConfig> {
  const out: Partial<WasmSolverConfig> = {};
  if (cpu.numSubsteps !== undefined) out.substeps = cpu.numSubsteps;
  if (cpu.gravity !== undefined) out.gravityY = cpu.gravity[1];
  if (cpu.damping !== undefined) out.damping = cpu.damping;
  if (cpu.stretchingCompliance !== undefined) out.stretchCompliance = cpu.stretchingCompliance;
  if (cpu.bendingCompliance !== undefined) out.bendCompliance = cpu.bendingCompliance;
  if (cpu.selfCollision !== undefined) out.selfCollision = cpu.selfCollision;
  if (cpu.clothThickness !== undefined) out.thickness = cpu.clothThickness;
  if (cpu.groundY !== undefined) out.groundY = cpu.groundY;
  if (cpu.dragCoefficient !== undefined) out.dragCoefficient = cpu.dragCoefficient;
  if (cpu.stretchComplianceWarp !== undefined) out.stretchComplianceWarp = cpu.stretchComplianceWarp;
  if (cpu.stretchComplianceWeft !== undefined) out.stretchComplianceWeft = cpu.stretchComplianceWeft;
  if (cpu.stretchComplianceShear !== undefined) out.stretchComplianceShear = cpu.stretchComplianceShear;
  if (cpu.bendComplianceWarp !== undefined) out.bendComplianceWarp = cpu.bendComplianceWarp;
  if (cpu.bendComplianceWeft !== undefined) out.bendComplianceWeft = cpu.bendComplianceWeft;
  if (cpu.internalDamping !== undefined) out.internalDamping = cpu.internalDamping;
  return out;
}
```

Refactor `GarmentSimulation.tsx:337-338` to single helper call:

```ts
// BEFORE:
clients.wasm?.setConfig({ substeps: mode.substeps });
clients.cpu?.setConfig({ numSubsteps: mode.substeps });

// AFTER:
const cpuPartial: Partial<ClothSimConfig> = { numSubsteps: mode.substeps };
clients.cpu?.setConfig(cpuPartial);
clients.wasm?.setConfig(mapClothSimConfigToWasmSolverConfig(cpuPartial));
```

- **Pros:**
  - **Single bridge point** — UI surface code uses CPU-shape (canonical per `ClothSimConfig` 23 fields); helper translates to WASM shape.
  - **Forward-only:** new shared UI knob → caller writes `Partial<ClothSimConfig>`, helper translates. No need to remember field-name cleavage at every callsite.
  - **Eliminates dual-write at smoking gun callsite** (GarmentSimulation.tsx:337-338).
  - **Bounded code** (~50 líneas helper + ~10 line refactor at callsite + ~10 lines tests).
  - **Pattern 2.5 lite shape** per audit calibration (~10-20L net + helper extract + JSDoc cross-doc). Same shape as D4 (`recordMessage`) and B10-state Par 1 (fabric write surfaces).
  - **Discoverability:** future dev adding UI knob sees helper, follows pattern. JSDoc explains cleavage.
- **Cons (primary):** **CPU-only fields silently dropped** in translation. Not a bug (no WASM equivalent), but an asymmetric behavior. Mitigated by:
  - JSDoc explicitly enumerates which fields are skipped + why.
  - Caller intent is to set shared subset; CPU-only setting via separate explicit `setConfig({ adaptiveSubsteps: false })` direct call (not via helper).
  - Lint rule could enforce "CPU-only fields use CPU client only" — out-of-scope A2, follow-up.
- **Cons (secondary):** **Helper maintenance** when adding new shared field. ~3 lines per field (`if (cpu.X !== undefined) out.Y = cpu.X`). Acceptable cost given alternative is per-callsite remembering.
- **Cons (tertiary):** **No translation reverse direction** (WASM → CPU). Today no callsite needs it. If future need emerges (e.g., reading WASM client's last-applied config), add `mapWasmSolverConfigToClothSimConfig` — symmetric helper.
- **Migration:** ~50 líneas helper + ~10 line callsite refactor + ~30 lines test (`configBridge.test.ts`) + ~15 lines JSDoc. **Total ~110 lines net add.** Bounded F3 scope.

#### Opción 3.2.C — Pattern 2.5 extend per-tier: bidirectional translation + per-tier capability gate

Beyond 3.2.B helper, add capability-gated dispatch:

```ts
// hypothetical
const cpuPartial: Partial<ClothSimConfig> = { numSubsteps: mode.substeps };
clients.cpu?.setConfig(cpuPartial);
if (clients.wasm?.capabilities.acceptsSetConfig) {
  clients.wasm.setConfig(mapClothSimConfigToWasmSolverConfig(cpuPartial));
}
```

- **Pros:** explicit capability check before dispatch.
- **Cons (primary):** **Capability flag is redundant** — `setConfig` exists on `WasmSolverClient` (line 244) unconditionally. Gating is cosmetic.
- **Cons (secondary):** Adds capability flag to `SolverCapabilities` interface for no behavioral payoff. A7 § 3.3 ratified the capability surface for **physics features**, not **method existence**. Method gating is consumer-nullable check (`clients.wasm?.setConfig(...)`).
- **Descartar** — premature abstraction.

#### Opción 3.2.D — Ratify-as-is with JSDoc cross-doc (no helper)

Add JSDoc on each config type (CPU + WASM client + WASM worker) referencing each other + this Fase 2 doc + cleavage rationale. Document field-name mapping table inline. Preserve dual-write callsite.

- **Pros:**
  - Zero code change.
  - Lowest risk.
  - Documents intentional cleavage.
- **Cons (primary):** **Dual-write callsite preserved.** Future similar UI bridge has to re-read JSDoc + remember mapping. Predictable bug surface.
- **Cons (secondary):** **No surgical helper** — Pattern 2.5 lite calibration suggests modest helper is the right shape when:
  - Single bug surface visible (smoking gun callsite found).
  - Future expansion plausible (if any new shared UI knob added).
  - Cost is bounded (~50 líneas).
  - Same calibration regime as D4 / B10 Par 1.
- **Descartar** — JSDoc-only is under-fit for the discoverable bug surface.

#### Recomendación 3.2

**Opción 3.2.B (Pattern 2.5 hybrid lite)** confianza media-alta. Razones:

1. **Targeted bug surface:** dual-write callsite is bounded but discoverable. Helper closes it cleanly.
2. **Pattern 2.5 lite calibration:** matches D4 / B10 Par 1 shipping shape. ~50-100L net add.
3. **Forward-only convention:** new shared UI knob → caller uses CPU-shape, helper translates. Reduces cognitive overhead.
4. **Rust ABI preserved:** no struct refactor, no wasm-bindgen changes, no codegen integration. Bounded scope.
5. **Cross-doc + JSDoc anchored** per audit philosophy.

**Tradeoff aceptado:** CPU-only fields silently skipped in translation (acceptable per JSDoc enumeration + intent: caller using helper means "set shared subset"; CPU-only caller uses `clients.cpu.setConfig` directly).

**If Sam prefers 3.2.D (ratify-as-is):** drop helper, keep JSDoc cross-doc + defaults convention only. Migration shrinks to ~30 líneas docs.

---

### 3.3 `clampSimConfig` dead code disposition

**Pregunta:** `simulationSlice.ts:790 clampSimConfig` has 0 callers. Removal candidate o wire as bridge?

```ts
// simulationSlice.ts:786-806
/**
 * Clamp sim config values to documented safe ranges before sending to the worker.
 * Safe to call on any partial or full ClothSimConfig object.
 */
export function clampSimConfig(config: Record<string, unknown>): Record<string, unknown> {
  const c = { ...config };
  if (typeof c.damping === 'number') c.damping = Math.max(0, Math.min(1, c.damping));
  if (typeof c.thickness === 'number') c.thickness = Math.max(0.0001, Math.min(0.05, c.thickness));
  if (typeof c.substeps === 'number') c.substeps = Math.max(1, Math.min(100, Math.round(c.substeps)));
  if (typeof c.internalDamping === 'number') c.internalDamping = Math.max(0, Math.min(1, c.internalDamping));
  for (const key of [/* compliance keys */]) {
    if (typeof c[key] === 'number') c[key] = Math.max(0, Math.min(100, c[key] as number));
  }
  return c;
}
```

**Field name observation:** uses `thickness` and `substeps` (WASM-style names), not `clothThickness` or `numSubsteps` (CPU-style). Header docstring says "ClothSimConfig" but body checks WASM names. Either:
- Half-translated at some point (CPU→WASM in progress, abandoned).
- Speculative for future bridge that never landed.
- Originally CPU-named, refactored to WASM-named without callsite update.

#### Opción 3.3.A — Remove dead code (RECOMENDADA)

Delete `clampSimConfig` from `simulationSlice.ts`. Document removal in commit message.

- **Pros:**
  - Removes confusion (function name suggests bridge layer that doesn't exist).
  - Reduces reader cognitive overhead.
  - Aligned con regla 9 atomicity — separate cleanup commit from main A2 commits.
- **Cons:**
  - **If wire-up was planned but forgotten,** removal closes the door. Sam decision per intent.
- **Migration:** ~22 lines deleted (function + JSDoc).

#### Opción 3.3.B — Wire up at bridge layer

Use `clampSimConfig` in `mapClothSimConfigToWasmSolverConfig` (3.2.B helper) as a clamping pass before translation. Or use directly at `setConfig` callsite as input validation.

- **Pros:**
  - Defensive validation before solver receives config.
  - Helper has actual purpose.
- **Cons (primary):** **Validation duplication.** Both CPU and WASM solvers should be defensive against invalid config (already are: NaN guards in cloth solver tier; WASM Rust defensive coding). Adding clamping at TS boundary is belt-and-suspenders.
- **Cons (secondary):** **Field name confusion.** Function checks WASM names but type signature is `Record<string, unknown>`. Either rename to `clampWasmConfig` or fix to handle both name schemas.
- **Descartar** — unless Sam confirms wiring was intent. Without explicit need, defensive validation is over-engineering at TS layer.

#### Opción 3.3.C — Status quo (leave dead code)

- **Pros:** zero change.
- **Cons:** confusion persists.
- **Descartar** — explicit cleanup is cheap.

#### Recomendación 3.3

**Opción 3.3.A** confianza alta. Razones:

1. **0 callers verified via repo-wide grep** (per § 2.10).
2. **Field name confusion** suggests historical orphan, not active spec.
3. **Removal is reversible** — git history preserves; future need can re-introduce.
4. **Aligned con regla 9** — atomic separate commit for cleanup.

**If Sam confirms 3.3.B (wire up was intent):** rename function to `clampWasmSolverConfig`, fix type signature to `Partial<WasmSolverConfig>`, integrate at helper boundary.

---

### 3.4 #686 follow-up disposition (gravity bundled into setConfig)

**Pregunta:** A6 follow-up #686 says "gravity bundled into setConfig". Currently CPU has separate `setGravity([x, y, z])` API; WASM doesn't — uses `setConfig({ gravityY })` workaround. ¿Bundle, separate, or ratify per-tier divergence?

#### Opción 3.4.A — Ratify per-tier divergence (RECOMENDADA)

CPU keeps `setGravity([x, y, z])` (vector, full direction). WASM keeps `setConfig({ gravityY })` (scalar, Y component only). Document #686 closure as "ratified per-tier divergence reflecting underlying API capabilities":
- CPU `XPBDClothSolver.config.gravity` is `[number, number, number]` and `pre_solve` integrates all 3 components.
- WASM Rust `configure()` only accepts `gravity_y`; X and Z components stay 0 in `self.gravity` (lib.rs:113 default `[0.0, -9.81, 0.0]`). Rust `pre_solve` (lines 365-367) does integrate all 3 components but only Y can be runtime-changed.

- **Pros:**
  - **Per-tier API truth.** Each tier exposes what it actually supports.
  - **WASM tier feature gap captured** as out-of-scope follow-up: "Rust `configure()` should expand to `gravity_x, gravity_y, gravity_z` for full direction support" — future ABI expansion candidate. Captured § 6.
  - **Polymorphic dispatch via consumer choice:** caller checks `clients.wasm` vs `clients.cpu` and uses tier-specific API.
  - **Aligned con A6 § 3.1.C ratification** ("setters live on concrete classes, gated by capability flags").
- **Cons:**
  - #686 follow-up gets resolved as "ratified divergent" rather than unified — partial closure.
  - Future caller dispatching polymorphically must handle CPU `setGravity` vs WASM `setConfig`.
- **Migration:** 0 código + ~10 lines docs in solverProtocol.ts + this doc.

#### Opción 3.4.B — Bundle: deprecate CPU `setGravity`, route through `setConfig`

CPU `clothWorkerClient.setGravity` becomes a thin wrapper for `setConfig({ gravity })`. Worker `setGravity` message path also wraps `updateConfig({ gravity })`.

- **Pros:**
  - Single setter pattern across both tiers (`setConfig`).
- **Cons (primary):** **WASM still can't accept full gravity vector** without Rust ABI expansion. Bundle is cosmetic only (CPU bundles, WASM still scalar Y-only).
- **Cons (secondary):** Migration affects existing CPU `setGravity` callers — backwards-compat shim or breaking rename.
- **Descartar** — cosmetic change without underlying capability convergence.

#### Opción 3.4.C — Bundle + Rust ABI expansion (full vector)

3.4.B + expand Rust `configure(... gravity_x, gravity_y, gravity_z)` from 16 → 18 args. WASM tier gains full vector gravity.

- **Pros:**
  - True convergence: both tiers accept vector gravity via setConfig.
- **Cons (primary):** **Rust ABI break** + WASM rebuild + 2 new positional args propagated through worker.
- **Cons (secondary):** **Out-of-scope A2 per § 1.** Rust ABI changes belong in feature-add ejes, not config unification.
- **Cons (tertiary):** **Calibration mismatch** — pushes A2 budget beyond Pattern 2.5 lite.
- **Descartar para A2** — feature gap, not config drift. Captured § 6.4 follow-up.

#### Recomendación 3.4

**Opción 3.4.A** confianza alta. Razones:

1. **Per-tier API truth** preserves caller intent + matches underlying capability.
2. **Aligned con A6 § 3.1.C** (setters live on concrete classes).
3. **#686 closure as "ratified divergent"** is a legitimate audit output (regla 13 lineage).
4. **Future Rust gravity expansion** captured as separate follow-up issue; A2 doesn't block it.

**Tradeoff aceptado:** future caller dispatching polymorphically over `setGravity` must handle two shapes. JSDoc on `solverProtocol.ts` documents the divergence (similar to existing pin semantics divergence note line 80-94).

---

### Tabla resumen Sec 3

| Sub-decisión | Recomendación | Migration cost | Risk |
|---|---|---|---|
| 3.1 Defaults convention | **3.1.A + D** — Align WASM `bendCompliance: 1.0` + leave selfCollision/collisionMargin divergent + anchor convention | ~3 lines code + ~15 lines docs + WASM rebuild | Low (latent → eliminated, faithful preserved) |
| 3.2 Type unification path | **3.2.B** — Pattern 2.5 hybrid lite (configBridge helper + JSDoc cross-doc) | ~50 lines new + ~10 lines callsite + ~30 lines test + ~30 lines JSDoc = ~120 lines | Low (forward-only convention; surgical helper) |
| 3.3 `clampSimConfig` cleanup | **3.3.A** — Remove dead code | ~22 lines deleted | Zero (verified 0 callers) |
| 3.4 #686 (gravity bundled) | **3.4.A** — Ratify per-tier divergence | 0 code + ~15 lines docs (solverProtocol.ts + this doc) | Zero (per-tier API truth preserved) |

**Total migration:**
- **Rust + WASM rebuild:** 1 default value change + sync BOTH js + wasm files.
- **TS code:** ~50 lines new (`configBridge.ts`) + ~10 line refactor (`GarmentSimulation.tsx`) + ~30 lines test + ~22 lines deletion (`clampSimConfig`) ≈ **~70 net lines added**.
- **Docs:** ~80 lines JSDoc (configBridge + xpbdSolver + wasmSolverClient + wasmSolverWorker + solverProtocol) + CLAUDE.md row.
- **F3 estimate:** ~3-4h (consistent con Pattern 2.5 lite calibration ~0.6-0.8x × 6-9h baseline).

---

## Sección 4 — Recomendación consolidada

Si Sam aprueba 3.1.A+D + 3.2.B + 3.3.A + 3.4.A, los cambios resultantes son:

| # | Cambio | Archivo | Tipo |
|---|---|---|---|
| 1 | Align WASM default `bend_compliance: 0.01` → `1.0` | `crates/xpbd-wasm/src/lib.rs:117` | Rust (1 line) |
| 2 | Align WASM worker default `bendCompliance: 0.01` → `1.0` | `src/utils/cloth/wasm/wasmSolverWorker.ts:140` | TS (1 line) |
| 3 | WASM rebuild + sync BOTH `xpbd_wasm.js` + `xpbd_wasm_bg.wasm` | `public/wasm/` | build artifact |
| 4 | New `configBridge.ts` with `mapClothSimConfigToWasmSolverConfig` helper + JSDoc | `src/utils/cloth/configBridge.ts` | TS (~50 lines new) |
| 5 | Test for `mapClothSimConfigToWasmSolverConfig` (renames + dropped fields + edge cases) | `src/utils/cloth/__tests__/configBridge.test.ts` | TS test (~30 lines new) |
| 6 | Refactor dual-write callsite to use helper | `src/components/Viewport3D/GarmentSimulation.tsx:337-338` | TS (~10 line refactor) |
| 7 | Remove dead code `clampSimConfig` | `src/store/simulationSlice.ts:786-806` | TS (~22 lines deleted) |
| 8 | JSDoc cross-doc on config surfaces | `xpbdSolver.ts:107`, `wasmSolverClient.ts:44`, `wasmSolverWorker.ts:117`, `solverProtocol.ts:41` (extend), `crates/xpbd-wasm/src/lib.rs:111` (preceding configure) | docs (~50 lines distributed) |
| 9 | CLAUDE.md "Audit Ratifications" row para A2 | `CLAUDE.md` | docs (1 line) |
| 10 | Document #686 closure as "ratified per-tier divergence" + follow-up Rust gravity vector expansion | `src/utils/cloth/solverProtocol.ts:73` + § 6 below | docs (~15 lines) |

**Total migration:**
- Rust: 1 default value change + WASM rebuild + sync.
- TS: ~70 net lines (50 new helper + 30 test + 10 refactor − 22 deleted).
- Docs: ~80 lines distributed across 5 sites + 1 CLAUDE.md row.

**F3 estimate: ~3-4h.** Pattern 2.5 lite calibration regime (D4 + B10-state Par 1 + A4 § 3.2 declined as 2.5 lite). Consistent con audit-state.md calibration table (Pattern 2.5 extend uniform: 0.6-0.8x).

Behavioral guarantees:
- **Zero observable behavior change.** WASM `bendCompliance: 0.01 → 1.0` only matters if per-edge population logic changes (latent → still latent post-fix, but now aligned values).
- **Dual-write callsite eliminated.** Future shared UI knob: 1 helper call instead of 2 client calls with different field names.
- **Dead code removed.** `clampSimConfig` cleanup.
- **Cross-doc trail.** Future devs encountering any of 5 config surfaces sees A2 ratification + cross-tier mapping.

---

## Sección 5 — Plan de migración Fase 3

**Critical:** Per CLAUDE.md "WASM Sync Requirement" non-negotiable — Rust source change requires **BOTH** `xpbd_wasm.js` AND `xpbd_wasm_bg.wasm` copied to `public/wasm/`. JS-only copy = silent CPU fallback (the exact pattern A3 § 3.2 addressed).

### 5.1 Commit 1 — Methodology updates (if any)

A2 close does NOT introduce new methodology rules. Existing rules apply:
- Regla 0 (verify before assert) → inventory line drift verified (16 args, line 226→253), defaults divergence verified.
- Regla 1 (pre-existing canonical check) → BUG-4 fix already centralized worker side; A2 extends.
- Regla 13 (inventory misclassification) → "Rust↔TS" framing partial reformulation.
- Regla 3a (compile-gate convergence) → anticipated for Pattern 1, NOT fired for chosen path 3.2.B.
- Regla 9 (atomicity) → cleanup commits separate from helper commits.

No methodology commit needed.

### 5.2 Commit 2 — Fase 2 doc

This file: `docs/reports/2026-05-02-drift-fase2-a2-cross-boundary-serialization.md`. Atomic commit. Open draft PR.

**PAUSE — esperás verde explícito de Sam.**

### 5.3 Commit 3 — Defaults alignment (Rust + WASM worker + WASM rebuild)

Atomic commit titled `fix(wasm): align bendCompliance default 0.01→1.0 to match CPU + per-edge tier consensus`.

```rust
// crates/xpbd-wasm/src/lib.rs:117
- bend_compliance: 0.01,
+ bend_compliance: 1.0,
```

```ts
// src/utils/cloth/wasm/wasmSolverWorker.ts:140
- bendCompliance: 0.01,
+ bendCompliance: 1.0,
```

WASM rebuild:

```bash
cd crates/xpbd-wasm
wasm-pack build --target web --out-dir pkg

# CRITICAL: Copy BOTH files
cp pkg/xpbd_wasm.js public/wasm/
cp pkg/xpbd_wasm_bg.wasm public/wasm/
```

**Verification post-build:**

```bash
ls -la public/wasm/xpbd_wasm.js public/wasm/xpbd_wasm_bg.wasm
# Both should have recent timestamps.

git diff public/wasm/
# Should show BOTH files modified.
```

**Smoke test:**
- `npm run dev`
- Open app, trigger cloth simulation.
- Verify no `[WasmSolver] CPU fallback active` or `[WasmWorker] Could not access WebAssembly.Memory` warnings in console.
- Cloth visual: should be identical to pre-change (per-edge wins; global fallback unused).

### 5.4 Commit 4 — `configBridge.ts` helper + test

Atomic commit titled `feat(cloth): add configBridge helper for CPU↔WASM type translation (A2)`.

New file `src/utils/cloth/configBridge.ts`:
- `mapClothSimConfigToWasmSolverConfig(partial)` function.
- JSDoc enumerating shared fields + dropped CPU-only fields + WASM-only fields.
- Forward-only convention note.

New file `src/utils/cloth/__tests__/configBridge.test.ts`:
- Test all field name renames (numSubsteps→substeps, gravity[1]→gravityY, etc.).
- Test CPU-only fields silently dropped.
- Test undefined values not propagated.
- Test empty input → empty output.
- Test full input → full WASM-shape output.

### 5.5 Commit 5 — Refactor dual-write callsite

Atomic commit titled `refactor(viewport): single bridge call for sim mode substeps (A2)`.

```tsx
// src/components/Viewport3D/GarmentSimulation.tsx
import { mapClothSimConfigToWasmSolverConfig } from '../../utils/cloth/configBridge';

useEffect(() => {
  const mode = SIMULATION_MODES[simulationMode];
  substepsRef.current = mode.substeps;
  // GPU/TSL path (per-tier shape ratified A6)
  if (tslSolverRef.current) {
    tslSolverRef.current.updateConfig({ substeps: mode.substeps });
  }
  // CPU + WASM via shared CPU shape + bridge translation (A2 § 3.2.B)
  const cpuPartial: Partial<ClothSimConfig> = { numSubsteps: mode.substeps };
  clients.cpu?.setConfig(cpuPartial);
  clients.wasm?.setConfig(mapClothSimConfigToWasmSolverConfig(cpuPartial));
}, [simulationMode, tslSolverRef, clients]);
```

### 5.6 Commit 6 — Remove dead `clampSimConfig`

Atomic commit titled `chore(state): remove dead clampSimConfig function (A2)`.

Delete lines `simulationSlice.ts:786-806` (`clampSimConfig` function + JSDoc).

### 5.7 Commit 7 — JSDoc cross-doc

Atomic commit titled `docs(cloth): A2 ratify config surface cleavage + cross-doc trail`.

Sites:
- `xpbdSolver.ts:107` — preceding `ClothSimConfig`: cross-ref to A2 § 2.4.1, mapping to `WasmSolverConfig`, CPU-only fields enumerated.
- `wasmSolverClient.ts:44` — preceding `WasmSolverConfig`: cross-ref to A2 § 2.4.2, mapping to `ClothSimConfig`.
- `wasmSolverWorker.ts:117` — preceding `AppliedSolverConfig`: cross-ref to BUG-4 fix + A2 § 2.4.3 + Rust constructor as defaults canonical.
- `crates/xpbd-wasm/src/lib.rs:111` (preceding configure or defaults block): cross-ref to A2 § 2.3 + 16-arg ABI + Rust defaults canonical convention.
- `solverProtocol.ts:41` — extend existing comment with A2 closure: "ratified per-tier shape per A2 § 3.4 (gravity bundled in setConfig WASM-side, separate setGravity CPU-side); cross-ref `docs/reports/2026-05-02-drift-fase2-a2-cross-boundary-serialization.md`".

### 5.8 Commit 8 — CLAUDE.md ratification row + convention anchor

Atomic commit titled `docs(claude): add A2 to Audit Ratifications table + Rust defaults convention`.

Add row to `CLAUDE.md` "Audit Ratifications" table:

```
| A2 | Cross-boundary serialization Rust↔TS: variant A (zero-copy reads) ratified; variant B (init copies) ABI-required ratified; variant C (config field-by-field) Pattern 2.5 lite — `configBridge` helper for shared subset + per-tier divergence ratified for non-shared fields; defaults convention anchored (Rust constructor canonical for cross-tier shared field defaults) | `docs/reports/2026-05-02-drift-fase2-a2-cross-boundary-serialization.md` |
```

Anchor convention in CLAUDE.md non-negotiables (light addition):
> **Solver config defaults.** Rust constructor (`crates/xpbd-wasm/src/lib.rs:113-130`) is canonical for cross-tier shared field defaults. WASM worker `DEFAULT_SOLVER_CONFIG` (`wasmSolverWorker.ts:135`) MUST match field-by-field. CPU `ClothSimConfig` defaults (`xpbdSolver.ts:383-407`) MUST match for shared fields; CPU-only fields (LRA, adaptiveSubsteps, etc.) independent. Per A2 § 3.1.

### 5.9 Verify gates

```bash
npx tsc -b --noEmit && npm run test && npm run lint
```

Plus Rust check (since lib.rs touched):

```bash
cd crates/xpbd-wasm && cargo check
```

Plus smoke test (since defaults changed and WASM rebuilt):
- `npm run dev`
- Trigger cloth simulation.
- Verify no console warnings re WASM init or CPU fallback.
- Visual check: cloth simulates as pre-A2 (no observable change expected).

### 5.10 PR ready-for-review

Post-verify-gates-clean, mark PR ready-for-review.

### 5.11 Follow-up issues (post-merge)

1. **Rust API expansion: gravity vector** — `configure()` extend `gravity_y` → `gravity_x, gravity_y, gravity_z`. Out-of-scope A2 (Rust ABI break); enables WASM tier full-direction gravity. Severity:low. Captured § 6.4.
2. **Lint rule for config field-name discipline** (optional) — ESLint rule that flags `setConfig` callsites mixing CPU and WASM names. Out-of-scope A2.
3. **#686 closure note** — link this Fase 2 doc to A6 follow-up #686 closure description. (May not need a separate issue if Sam closes #686 with cross-ref to this doc.)

---

## Sección 6 — Cross-references y dependencias

### 6.1 Inputs

- `docs/reports/2026-04-28-drift-inventory-fase1.md` § A2 (lines 122-128) — claims A/B/C all confirmed at structural level; framing reformulated.
- `docs/reports/2026-04-28-drift-fase2-classification.md` § A2 — A2 classified (c) RFC.
- `docs/reports/2026-05-01-drift-fase2-a3-cross-boundary-errors.md` — A3 ratified Rust↔TS error pattern + Result-pattern forward-only convention.
- `docs/reports/2026-05-02-drift-fase2-a4-cross-language-geometry-mesh.md` — A4 reformulated "Rust↔TS" → "TS-internal cross-tier" when Rust is consumer-only. A2 inherits the framing question; concludes partial reformulation.
- `docs/reports/2026-05-01-rfc-a6-worker-protocol.md` — A6 explicitly excluded setConfig from interface; § 3.1.C ratified per-tier setConfig shape; § 3.6 deferred setter migrations to follow-up issues #683-689; § 3.1 line 41 marked A2 territory.
- `docs/reports/2026-05-01-rfc-a7-wasm-cpu-equivalence.md` — A7 ratified WASM substeps=1 + JS-side outer loop (§ 3.1.6); ratified maxVelocity location CPU-only (§ 3.1.7); enumerated #608 self-collision feature gap.
- BUG-4 fix commit `a164ea9c` — historical fix for "apply all setConfig fields to runtime, not just substeps". Introduced `currentConfig: AppliedSolverConfig` + `applySolverConfig()` worker centralization. A2 § 2.8.3 documents.
- bug-#690 fix commit `b18f4762` — anchored regla 5 (unit-conversion ALL components). A2 § 2.12 audited regla 5 within A2 territory; clean (config layer unit-pure SI).
- CLAUDE.md non-negotiables (committed) + `CLAUDE/methodology.md` (private routing layer).
- `solverProtocol.ts:41` — A6 RFC's pre-mark of A2 territory ("setConfig / setters: per-tier shape (A2 territory)").
- Code: `crates/xpbd-wasm/src/lib.rs` (832 líneas), `crates/xpbd-wasm/pkg/xpbd_wasm.d.ts` (160 líneas, generated), `src/utils/cloth/xpbdSolver.ts` (1808 líneas), `src/utils/cloth/wasm/wasmSolverWorker.ts` (784 líneas), `src/utils/cloth/wasm/wasmSolverClient.ts` (381 líneas), `src/utils/cloth/clothWorker.ts` (528 líneas), `src/utils/cloth/clothWorkerClient.ts` (419 líneas), `src/utils/cloth/solverProtocol.ts` (193 líneas), `src/components/Viewport3D/GarmentSimulation.tsx` (config callsite), `src/store/simulationSlice.ts` (Redux state + dead `clampSimConfig`).

### 6.2 Outputs

- **Si aprobado:** Fase 3 (commits 3-8 sobre este branch) + 1 follow-up issue (Rust gravity vector expansion).
- **A2 cerrado:** Pattern 2.5 hybrid lite (helper + JSDoc) + ratify-by-convention defaults + ratify-per-tier divergence #686.
- **Quinto eje (c) RFC cerrado:** A2 después de C1 + A7 + A6 + A4. (c) bloque progress: 5/6, pending C4.
- **Cuarto data point Pattern 2.5 lite** (precedentes: D4 `recordMessage`, B10-state Par 1 fabric write surfaces, A4 § 3.2 declined as 2.5 lite). Pattern 2.5 lite robust 4/4 if A2 ships as 3.2.B.
- **#686 (gravity bundled into setConfig)** closed as "ratified per-tier divergence" with follow-up captured § 6.4.
- **Sub-rule meta-anchor update post-merge:** none required (existing methodology rules cover).

### 6.3 No-conflicts (out-of-scope verificado)

- **A3 cross-boundary error pattern:** preserved (no Rust changes beyond defaults values).
- **A4 cross-tier topology cleavage:** preserved (no topology touched).
- **A6 worker protocol interface:** preserved + extended (solverProtocol.ts:41 cross-doc updated; A2 closes the deferred setConfig question).
- **A6 § 3.1.C "setters live on concrete classes":** preserved (configBridge helper is utility, not interface method).
- **A7 capability surface:** preserved (no capability flags changed).
- **A7 § 3.1.6 substeps semantic per-tier-divergent:** preserved (CPU `numSubsteps` vs WASM `substeps` cleavage ratified, helper translates).
- **A7 § 3.1.7 maxVelocity location CPU-only:** preserved (CPU-only field in helper's silent-drop set).
- **BUG-4 worker centralization:** preserved + extended (helper sits at TS bridge; worker centralization unchanged).
- **C1 disposable lifecycle:** unrelated.
- **D6 fabric types 3-tier:** unrelated.
- **bug-#690 importerToMetres regla 5:** respected; A2 audit clean within territory.
- **Pattern 2.5 lite calibration:** consistent (D4 + B10 Par 1 + this).

### 6.4 Co-existence con ejes abiertos

- **C4** (4-way tier orchestration): pending. C4 will inherit A2 config bridge + A6 lifecycle + A7 capabilities + A4 topology cleavage as ratified surfaces. If C4 introduces tier-coordinator class, may revisit config translation (Pattern 1 reopen via 3.2.A reopen trigger).
- **E-async-states** sub-track: parallelizable; no direct conflict.
- **A6 setter migrations** (#683-689):
  - **#683 setWind:** already exists on both clients. A6 follow-up may add capability gate + uniform signature; A2 doesn't block.
  - **#684 setPins:** already exists on both clients. A6 follow-up canonical batch shape; A2 doesn't block.
  - **#685 setFabric:** CPU-only API (`clothWorkerClient.ts:192 setFabric(fabricId)`); WASM tier doesn't expose. Per A6 follow-up "fabric resolution moved to consumer" — out-of-scope A2.
  - **#686 setGravity:** **A2 closes via § 3.4** as "ratified per-tier divergence". CPU keeps `setGravity([x,y,z])`; WASM uses `setConfig({ gravityY })`. Rust gravity vector expansion captured § 6.4 follow-up.
  - **#687 error uniform:** unrelated to A2 closure.
  - **#688 #689** init factory + callback adapter: unrelated.
- **A7 per-feature ports** (#676-681): preserved; SpatialHashGrid CPU-only is per A7 ratification; A2 helper drops `enableLRA` correctly.

### 6.5 Follow-up issues queued post-merge

1. **Rust API expansion: gravity vector** — Rust `configure()` extend `gravity_y` → `gravity_x, gravity_y, gravity_z` (16 → 18 args). Severity:low. Scope: Rust signature + body assignment + WASM rebuild + binding sync + WasmXpbdSolver interface + AppliedSolverConfig + DEFAULT_SOLVER_CONFIG + WasmSolverConfig + applySolverConfig call + helper update. ~6-7 touch points. Enables WASM tier full-direction gravity (today only Y component). Riding on next Rust touch (could be A2 follow-up or independent).
2. **Lint rule for config field discipline** (optional): ESLint rule flagging `setConfig` callsites mixing CPU and WASM field names without using helper. Out-of-scope A2. Severity:low.
3. **#686 GitHub issue closure note**: link this Fase 2 doc + § 3.4 ratification to A6 follow-up #686 (gravity bundled into setConfig). Closes #686 as "ratified per-tier divergent".

---

## Sección 7 — Reopen triggers

A2 ratificación queda revisable si emerge:

1. **Per-edge population logic refactor** — e.g., new edge type detection that produces uncategorized edges → fallback to global compliance. Today latent (per-edge always wins); tomorrow active divergence if `bendCompliance` 0.01 vs 1.0 wasn't aligned. Sub-decisión 3.1.A mitigates by aligning to 1.0; if Sam approves 3.1.C (status quo) instead, this becomes a high-priority reopen trigger.
2. **CPU constructor / `ClothSimConfig` refactor** — e.g., CPU adds `collisionMargin` field (currently uses `clothThickness`) → defaults convention need re-audit. § 3.1 reopen.
3. **Rust ABI expansion** — e.g., new `configure()` arg added → helper needs new field + per-tier semantic decision. Forward-only convention applies; helper update is mechanical.
4. **TSL/GPU `TslSolverConfig` integration** — if C4 RFC introduces tier-coordinator that needs full config bridging across all 4 tiers, reopen § 3.2 with Pattern 1 evaluation.
5. **Codegen layer adoption elsewhere in repo** — e.g., `ts-rs` or similar Rust→TS type generation. Pattern 1 (3.2.A) becomes more viable; reopen § 3.2.
6. **Multiple new dual-write UI bridges** — if 3+ callsites emerge that need both clients with shared CPU shape, validates Pattern 2.5 lite path; if cleavage spreads, reopen with Pattern 1 evaluation.
7. **A6 follow-up #686 gravity vector full-direction need surfaces** — production user request, viewport gravity tilt feature, etc. Reopen § 3.4 with concrete repro + capture as feature eje.
8. **Lint rule for config field discipline implemented** — reopens § 3.2 to evaluate if helper still needed (lint rule may obviate it).
9. **`setConfig` semantic change** — e.g., adopting Result-pattern for fallible config validation (per A3 forward-only convention). Reopen § 3.2 evaluating helper signature.
10. **Production telemetry signal on config drift** — e.g., setConfig errors increase, or specific field name mismatch caught in production logs. Reopen § 3.2.

---

## Sección 8 — Deuda técnica explícita post-ratificación

1. **`selfCollision` default divergence preserved as latent + faithful.** CPU default `true` reflects actual capability; WASM default `false` reflects actual capability gap (BUG-5, A7 #608). Aceptable porque (i) per-tier API truth, (ii) WASM forces false anyway. Reopen trigger #1.
2. **`collisionMargin` field absence in CPU** — CPU uses `clothThickness` for both inflation + margin. Subtle architectural cleavage. Aceptable porque (i) matches CPU constructor semantics, (ii) refactor would require xpbdSolver constructor migration (out-of-scope A2). Reopen trigger #2.
3. **`configBridge.mapClothSimConfigToWasmSolverConfig` silently drops 8 CPU-only fields.** Asymmetric translation. JSDoc enumerates dropped fields. Aceptable porque (i) caller intent using helper is "set shared subset", (ii) CPU-only setters via direct `clients.cpu.setConfig` call (no helper). Lint rule could enforce — out-of-scope A2.
4. **Helper not bidirectional** — only CPU→WASM. No `mapWasmSolverConfigToClothSimConfig` reverse helper. Today no callsite needs reverse. Trivial to add when needed.
5. **Helper maintenance cost** — adding new shared field = ~3 lines in helper + new field in both ClothSimConfig + WasmSolverConfig. Convention forward-only documented in CLAUDE.md anchor (§ 5.8).
6. **Rust ABI 16-arg positional** preserved as ABI floor. Adding field still requires touch propagation (~6-13 sites depending on cross-tier scope). Pattern 1 reopen trigger captures if codegen adoption emerges.
7. **WASM gravity Y-only** — Rust `configure()` only accepts `gravity_y`; full vector would need ABI expansion. Captured § 6.4 follow-up. Today no production surface needs full-direction gravity in WASM tier.
8. **`solverProtocol.ts` setConfig exclusion** is interface design choice — A6 § 3.1.C ratified. A2 closes the cleavage but does NOT add `setConfig?(config)` to interface. Polymorphic dispatch via consumer concrete-class casting + helper. Aceptable; reopen trigger #4 if cleavage spreads.
9. **Pin semantics divergence** (per A6 RFC § 4.1 Q2 / `solverProtocol.ts:80-94`) — preserved. CPU ignores pin position; WASM uses pin position. Out-of-scope A2.
10. **No lint rule enforcement** for defaults convention or helper usage. Convention is documentary (CLAUDE.md + JSDoc). Future contributor could violate. Aceptable porque (i) review humano + this Fase 2 doc visible, (ii) lint rule cost > benefit at current cleavage scale.

---

## Sección 9 — Decisión pendiente y siguiente paso

### 9.1 Pregunta a Sam

¿Aprobás las 4 sub-decisiones tal como recomendado en Sec 3 (3.1.A+D + 3.2.B + 3.3.A + 3.4.A)?

Si **sí, todo aprobado:**
- Marco PR ready-for-review post-Fase 3.
- Sec 4-9 quedan como ratificación final.
- Fase 3: 6 commits sobre este branch (defaults align + WASM rebuild + helper + refactor callsite + dead code cleanup + JSDoc cross-doc + CLAUDE.md row) + 1 follow-up issue (Rust gravity vector expansion).
- Inventory annotation post-merge.
- A2 cerrado como **5to (c) RFC del audit** (después C1 + A7 + A6 + A4) + **4to data point Pattern 2.5 lite** (precedentes D4 + B10 Par 1 + A2; A4 § 3.2 declined as 2.5 lite — counted as evaluation, not data point).

Si **alguna sub-decisión querés cambiar:**
- **3.1.B (CPU→WASM align):** wrong direction — CPU has more usage history, WASM is newer. Re-edito Sec 4 + Sec 5 si confirmás esa preferencia.
- **3.1.C (status quo):** captures latent as documentary only. Reopens trigger #1 if per-edge logic changes. Reduce migration to ~30 lines docs only.
- **3.2.A (Pattern 1):** Rust ABI break + struct refactor + serde_wasm_bindgen + cross-tier compile-gate trigger. ~8-12h F3 + open-ended risk. Re-edito Sec 4 + Sec 5 con expanded migration plan.
- **3.2.D (ratify-as-is + JSDoc only):** drop helper, JSDoc cross-doc only. Reduce migration to ~30 lines docs.
- **3.3.B (wire `clampSimConfig`):** rename + integrate. Re-edito with helper boundary integration plan.
- **3.4.B/C (bundle gravity):** cosmetic-only or Rust ABI expansion. Out-of-scope para A2 per § 1.

Si **el scope del eje cambia (e.g., reopen Rust↔TS framing as cross-language Pattern 1):**
- STOP. Reabro Sec 1 con nuevo evidence.

### 9.2 Estado del PR

- Sec 1-9 ✅ ready.
- Fase 2 doc en este commit. Draft PR pendiente.
- Pendiente Fase 3 commits (6: defaults + WASM rebuild + helper + refactor callsite + dead code cleanup + JSDoc + CLAUDE.md row).

### 9.3 Calibración estimate vs actual

- Estimate Fase 2 doc inicial (kickoff anticipation): 6-9h (consistent con (c) RFC + Pattern 2.5 hybrid scope).
- **Actual Fase 2 doc: ~3.5h** (sweep refresh + classification + redacción).
- **Factor: ~0.4-0.5x** del estimate.
- Causa:
  - Pattern 2.5 hybrid lite dominant outcome (62% rule + 4 data points calibration).
  - A6 § 3.1 + solverProtocol.ts:41 pre-marked scope, eliminando ambiguity.
  - BUG-4 fix already centralized worker side, reducing decision tree.
  - Cross-language framing closed quickly (partial reformulation, not full).
  - Compile-gate trigger anticipated but not fired (no `implements` extraction).
  - Sub-decisiones articuladas con clear options + tradeoffs.
- Calibración alignment: A2 sits in the **"Pattern 2.5 lite uniform" 0.6-0.8x calibration regime** — F2 actual ~0.4-0.5x is LOW edge; suggests A2 was over-budgeted in initial kickoff anticipation given the partial reformulation closed framing question fast.
- **Total esperado Fase 3:** ~3-4h con WASM rebuild + sync verification + helper + tests + JSDoc cross-doc.

### 9.4 Heads up Fase 3

Critical paths:
- **WASM rebuild + sync** (Commit 3): Rust source change requires `wasm-pack build` + copy BOTH files. Per CLAUDE.md non-negotiable. Smoke test post-rebuild verifies no console warnings.
- **Verification post-WASM-rebuild:** `npm run dev` + cloth simulation should run without `[WasmSolver] CPU fallback active` warning. If WASM bindings stale (only `.wasm` copied), STOP and re-do — silent fallback is the exact pattern A3 § 3.2 addresses.
- **Helper test coverage** (Commit 4): all 16 shared fields × 2 (defined/undefined) = 32 combinations. Plus 8 CPU-only fields silently dropped. Plus edge cases (empty input, undefined, full input).
- **Cross-doc JSDoc** must be load-bearing per regla 3a (post-A6 precedent) — not just CLAUDE.md/methodology.md anchor.
- **Anti-pattern protection:** ironic Fase 3 Commit 3 is exactly the silent fallback pattern A3 Sec 3.2 addresses. Don't fall into it during your own implementation.

Risk floor:
- Defaults change is latent (per-edge wins) — observable behavior unchanged.
- Helper is forward-only — no migration of existing CPU callsites.
- Dead code cleanup is verified safe (0 callers).
- Cross-doc JSDoc is documentation only.
- Total observable behavior: zero change. **Risk floor near-zero.**

---

**FIN DEL DOC.** Esperando verde de Sam para promover PR a ready-for-review + arrancar Fase 3.
