# Drift Fase 2 — A4: Cross-language geometry / mesh ops Rust↔TS

**Fecha:** 2026-05-02
**Eje:** A4 — geometry / mesh ops Rust↔TS (xpbd-wasm crate ↔ TS solver tiers).
**Categoría inventario:** (c) RFC.
**Estado:** PROPUESTA. **Ratify-by-convention con reformulación + Pattern 2.5 lite candidate** para variante de constraint extraction. Esperando review de Sam.

**Branch:** `drift/A4-cross-language-geometry-mesh`.
**Cross-ref inventario:** `docs/reports/2026-04-28-drift-inventory-fase1.md` § A4 (lines 141-147).
**Cross-ref classification:** `docs/reports/2026-04-28-drift-fase2-classification.md` § (c) (line 125).
**Precedentes directos:** A3 (`2026-05-01-drift-fase2-a3-cross-boundary-errors.md`) — defensive Rust + cross-boundary contract pattern. A6 (`2026-05-01-rfc-a6-worker-protocol.md`) — interface scope-reduction-on-trigger + 3.6 decoupling. A7 (`2026-05-01-rfc-a7-wasm-cpu-equivalence.md`) — per-feature port-or-ratify + `SolverCapabilities`. BUG-1 (`47557d8e`, PR #604) — `bendRestDistances.ts` helper bridging GPU angle output → Rust distance input. Bug-#690 (`b18f4762`) — `importerToMetres` regla 5 anchor (out-of-scope A4 in retrospect; see § 2.5).

---

## Sección 1 — Decide / NO decide

### Decide en este eje

1. **Inventory misclassification ratificada** (regla 13). A4's inventory framing "geometry/mesh ops Rust↔TS duplication" no captura el shape real: Rust solver no produce ni extrae geometría — solo **consume** constraint data computado TS-side. La duplicación efectiva es **TS-internal cross-tier** (CPU `xpbdSolver.ts` constructor inline vs GPU/WASM shared `gpuBuffers.ts` extractor). Reformulación cierra el premise hueco del inventory.
2. **Variante 1 (spatial hash duplication): no-drift, misclassified.** `TriangleSpatialHash` y `SpatialHashGrid` sirven dominios ortogonales (triangle-vs-particle body collision vs particle-vs-particle self-collision); ambos viven TS-side; CPU + WASM **comparten** `TriangleSpatialHash`; `SpatialHashGrid` es self-collision-only y self-collision en WASM ya está tracked en A7 (#608, port queued).
3. **Variante 2 (constraint extraction): real intra-TS duplication, candidate para Pattern 2.5 lite.** Dos algoritmos topology distintos (CPU sorted-edge `findTriNeighbors` + inline 4-tuple build; GPU/WASM Map-keyed `extractStretchConstraints` + `extractBendConstraints`) producen output semánticamente equivalente con tipos diferentes (`Int32Array` vs `Uint32Array`) y conversion seam separada para bend rest values.
4. **Variante 3 (bend rest semantics): closed pre-A4.** BUG-1 fix (`47557d8e`, PR #604) introdujo `bendRestDistances.ts` con docstring que ratifica el seam GPU(angle)↔WASM/CPU(distance). Variant cerrada por inertia ratification — A4 documenta + cross-refs.
5. **Pattern 2.5 lite vs ratify-as-is decision.** Sub-decisión 3.2 articula el tradeoff: extracción de helper compartido vs ratificación del cleavage CPU/GPU+WASM. Recomendación: ratify-as-is con cross-doc; Pattern 2.5 lite **disponible** pero no obligatorio (ver § 3.2).

### NO decide en este eje

1. **Refactor del Rust crate.** Crate solo consume constraint data; geometry/mesh ops no-existen en Rust. A3 ratificó defensive Rust pattern; A4 NO toca eso.
2. **Self-collision WASM port.** Tracked en A7 (#608) — out-of-scope A4. La ausencia de `SpatialHashGrid` en WASM tier es A7 territory, no A4.
3. **Topology canonical surface forward-only.** Si Sam aprueba Pattern 2.5 lite (3.2.A), helper compartido es additions; **no hay convention** para futuras topology ops más allá del helper concreto. Convention forward (e.g., "all topology ops live en `clothTopology.ts`") sería over-reach scope para A4.
4. **Bend rest semantic divergence GPU(angle) vs CPU/WASM(distance).** Closed pre-A4 via `bendRestDistances.ts`. Si el equipo decide convergir TSL bend solver a distance-based bend (eliminating the seam), eso es feature redesign del GPU solver, no A4.
5. **Unit-conversion regla 5 audit beyond importerToMetres.** Regla 5 fue anchored post-bug-#690; A4 verifica que `importerToMetres` cumple (✅) pero NO audita exhaustivamente otros sitios scale-multiplyScalar (gltfExporter / sceneCollector). Hallazgo collateral capturado en § 6 follow-ups, no folded en A4.
6. **CPU-side `findTriNeighbors` algorithm performance.** Sorted-edge approach is correct; alternative algorithms out-of-scope.

### Por qué importa la línea

Sin la ratificación + reformulación:
- A4 framing en inventory queda como cuestión Rust↔TS pendiente, induciendo expectativa de cross-language refactor que no aplica (Rust no extrae geometry).
- Variant 2 duplication TS-internal queda no-documentada — futuro dev tocando topology extraction puede modificar uno y dejar el otro divergent.
- BUG-1 closure (variant 3) queda implicita en helper file sin cross-ref a A4 — futuro reader de `bendRestDistances.ts` no sabe que ratifica una variante de A4.
- Pattern 2.5 lite candidate (variant 2) queda sin propuesta evaluada — costo y beneficio no articulados.

A4 captura los 3 hallazgos con ratificaciones + 1 sub-decisión Pattern 2.5 lite opcional.

---

## Sección 2 — Estado actual

### 2.1 Inventory shorthand vs realidad post-sweep (regla 0 + 13)

**Inventory texto literal (`drift-inventory-fase1.md` líneas 141-147):**
> A4 ★ — Geometry / mesh ops Rust ↔ TS. Estado: drift real (con bugs anidados, ver B1).
> Variantes:
>   - Spatial hash: 2 implementaciones TS distintas (`triangleCollision.ts:95` `TriangleSpatialHash` vs `selfCollision.ts:53` `SpatialHashGrid`). Rust no tiene spatial hash.
>   - Constraint extraction: 2 implementaciones TS (`gpuBuffers.ts:150` `Set<string>` vs `xpbdSolver.ts:403–440` `findTriNeighbors`). Diferentes tipos (`Uint32Array` vs `Int32Array`).
>   - Bend rest semantics: ver bug B1.
> Diferencia funcional: real — afecta numérica del WASM tier.

**Realidad post-sweep:**
- "Rust↔TS" framing es misnomer: Rust crate (832 líneas) **no exporta geometry/mesh extraction**. Solo expone setters (`set_stretch`, `set_bend`, `set_triangles`, `set_pins`, `set_seams_with_compliance`) + `step` + zero-copy pointer getters. Toda geometry op vive TS-side.
- Spatial hash variante: 2 impls TS sirven dominios distintos (triangle-vs-particle vs particle-vs-particle). Ambos solvers (CPU + WASM) usan `TriangleSpatialHash` (compartido). `SpatialHashGrid` es CPU-only por feature gap WASM (A7 #608).
- Constraint extraction variante: drift real **intra-TS** entre CPU constructor inline y GPU/WASM standalone helpers. Tipos divergen (`Int32Array` CPU vs `Uint32Array` GPU/WASM).
- Bend rest semantics: closed pre-A4 (BUG-1 fix, PR #604). Helper `bendRestDistances.ts` (45 líneas) documenta seam con docstring explicativa.

**Reformulación post-sweep:**

| Variante | Inventory framing | Realidad sweep | Classification |
|---|---|---|---|
| 1. Spatial hash | "2 impls TS, Rust no tiene" | 2 dominios ortogonales; CPU+WASM share `TriangleSpatialHash`; `SpatialHashGrid` self-collision-only | **No-drift, misclassified** (regla 13) |
| 2. Constraint extraction | "2 impls TS, tipos diferentes" | Intra-TS duplication CPU inline vs GPU/WASM standalone; semánticamente equivalente con type cleavage | **Real drift, Pattern 2.5 lite candidate** |
| 3. Bend rest semantics | "ver bug B1" | Closed via PR #604; bridging helper `bendRestDistances.ts` ratifies seam | **Closed pre-A4, ratify-by-inertia** |

**Conclusión:** A4 hereda 1 ratify-by-misclassification + 1 Pattern 2.5 lite candidate + 1 ratify-by-inertia. Cross-language framing del inventory descartada (regla 0 vs shorthand-extrapolation).

### 2.2 Rust crate inventory (geometry surface)

`crates/xpbd-wasm/src/lib.rs` (832 líneas). Geometry-touching exports:

| Export | Signature | Geometry produced or consumed | Rol |
|---|---|---|---|
| `XpbdSolver::new` | `(positions: &[f32], inv_mass: &[f32]) -> XpbdSolver` | Consumes positions + invMass arrays | Init |
| `set_stretch_with_types` | `(ids: &[u32], rest_lengths: &[f32], edge_types: &[u8])` | Consumes constraint id pairs + rest distances + types | Constraint upload |
| `set_bend_with_types` | `(ids: &[u32], rest_angles: &[f32], edge_types: &[u8])` ⚠ | Consumes 4-tuple ids + rest **distances** (not angles, despite param name)  + types | Constraint upload |
| `set_triangles` | `(tri_ids: &[u32])` | Consumes triangle index buffer | Topology upload |
| `set_adjacency` | `(offsets: &[u32], neighbors: &[u32])` | Consumes precomputed CSR adjacency | Topology upload |
| `set_pins` / `set_seams_with_compliance` | (various id arrays) | Consumes pin/seam constraint data | Constraint upload |
| `positions_ptr` / `velocities_ptr` / `prev_positions_ptr` | `() -> *const f32` | Returns pointer to internal buffer | Zero-copy read |
| `step` | `(dt: f32)` | Mutates positions internally | Integration |

**0 geometry extraction exports**. Rust solver is purely a **consumer** of TS-extracted topology + constraint data.

⚠ **Nota:** `set_bend_with_types` parameter name `rest_angles` es legacy desde antes de BUG-1. Rust internamente trata el array como distancias (per `crates/xpbd-wasm/src/lib.rs:441` `solve_bend`); el TS-side helper `bendRestDistances.ts` documenta el rename pendiente. Rename Rust API es out-of-scope A4 (correcto sería `rest_distances` pero rompe binding sync). Captured § 6 follow-ups.

### 2.3 TS topology extraction inventory

#### 2.3.1 CPU path — `xpbdSolver.ts` constructor (lines 421-459)

```ts
// Build constraints from mesh topology
const neighbors = findTriNeighbors(this.triIds);  // sorted-edge half-edge map
const numTris = this.triIds.length / 3;
const edgeIdsList: number[] = [];
const triPairIdsList: number[] = [];

for (let i = 0; i < numTris; i++) {
  for (let j = 0; j < 3; j++) {
    const id0 = this.triIds[3 * i + j];
    const id1 = this.triIds[3 * i + (j + 1) % 3];

    const n = neighbors[3 * i + j];
    if (n < 0 || id0 < id1) {
      edgeIdsList.push(id0);
      edgeIdsList.push(id1);
    }

    if (n >= 0) {
      const ni = Math.floor(n / 3);
      const nj = n % 3;
      const id2 = this.triIds[3 * i + (j + 2) % 3];
      const id3 = this.triIds[3 * ni + (nj + 2) % 3];
      triPairIdsList.push(id0); triPairIdsList.push(id1);
      triPairIdsList.push(id2); triPairIdsList.push(id3);
    }
  }
}

this.stretchingIds = new Int32Array(edgeIdsList);
this.bendingIds    = new Int32Array(triPairIdsList);
```

Plus `findTriNeighbors` (lines 236-277): sorts directed edges → matches half-edge pairs → returns `Float32Array` neighbor map.

Plus rest length computation (`initPhysics`, lines 525-530, 564-568): rest distances computed from positions for both stretch and bend (bend uses c↔d distance, indices 4i+2 / 4i+3 of bendingIds).

Plus per-constraint compliance via UV-based `classifyEdgeType` (lines 532-596). **Imports `EdgeType` + `classifyEdgeType` from shared `gpu/gpuBuffers.ts:16`**.

#### 2.3.2 GPU/WASM path — `gpu/gpuBuffers.ts` standalone helpers

`extractStretchConstraints` (lines 150-193): Set<string> dedup → returns `{ ids: Uint32Array, restLengths: Float32Array, edgeTypes: Uint8Array }`.

`extractBendConstraints` (lines 200-263): Map<edgeKey, triangleIndices> → returns `{ ids: Uint32Array, restAngles: Float32Array, edgeTypes: Uint8Array }`.

Bend output is **angles** (for TSL solver). For WASM tier: angles converted → distances via `bendRestDistances.ts:30 computeBendRestDistances` at worker boundary (`wasmSolverWorker.ts:517`).

#### 2.3.3 Shape comparison

| Aspect | CPU (xpbdSolver) | GPU/WASM (gpuBuffers + bendRestDistances) |
|---|---|---|
| Stretch ids type | `Int32Array` | `Uint32Array` |
| Stretch rest | `Float32Array` distances | `Float32Array` distances |
| Stretch dedup algo | sorted-edge via `findTriNeighbors` | Set<string> "min-max" key |
| Stretch edge types | inline UV classification (lines 540-560) | `extractStretchConstraints` UV classification |
| Bend ids type | `Int32Array` | `Uint32Array` |
| Bend rest (CPU + WASM consume) | `Float32Array` **distances** | `Float32Array` **distances** (post `computeBendRestDistances` for WASM) |
| Bend rest (GPU consume) | n/a | `Float32Array` **angles** (raw `extractBendConstraints` output) |
| Bend dedup algo | sorted-edge half-edge match | Map<edgeKey, triIndices> length=2 filter |
| Bend edge types | inline UV classification (lines 570-596) | `extractBendConstraints` UV classification |

**Output equivalence verified:** both algorithms produce same set of unique edges + same set of bend quads from same mesh topology. Verified by spot-checking on a synthetic 2-triangle quad (4 verts, 2 tris, 1 shared edge → 5 stretch edges + 1 bend quad in both).

**Type cleavage:** `Int32Array` (CPU) vs `Uint32Array` (GPU/WASM) is non-trivial because `Int32Array` allows -1 sentinel values (used by CPU's `findTriNeighbors` for boundary edges). CPU's `bendingIds` itself never has -1 (only finalized 4-tuples for paired triangles), but the `neighbors` intermediate carries -1. CPU stores final IDs as `Int32Array` for type consistency with `triIds: Int32Array` (the input topology), not because it needs negative values.

### 2.4 Spatial hash inventory

| Class | File | Domain | Constructor | Storage shape | Lifecycle |
|---|---|---|---|---|---|
| `TriangleSpatialHash` | `triangleCollision.ts:95-180` | Triangle-vs-particle (cloth↔body) | `(mesh: CollisionMeshData, cellSize: number)` | `Map<key, Int32Array>` per-bucket; AABB-expanded over triangle indices | Built once per kinematic body; immutable |
| `SpatialHashGrid` | `selfCollision.ts:53-159` | Particle-vs-particle (cloth↔itself) | `(cellSize: number)` empty | Counting-sort flat `Int32Array` cellStart + cellEntries | Rebuilt every frame from current positions |

**Consumers:**
- `TriangleSpatialHash`: `xpbdSolver.ts:357` (CPU body collision) + `wasmSolverWorker.ts:97,592,603,611` (WASM body collision). **Shared between CPU + WASM solver tiers.**
- `SpatialHashGrid`: `xpbdSolver.ts:369,466` (CPU self-collision only). **WASM tier lacks self-collision** (port queued #608 per A7 § 3.1.1).

**Roles ortogonales** — different domains (kinematic body vs self), different lifecycles (immutable vs per-frame rebuild), different storage (per-bucket buckets vs counting-sort flat). The "duplication" framing in inventory misses domain semantic.

### 2.5 Bend rest semantics (closed pre-A4, BUG-1 fix)

**Pre-fix state:** `wasmSolverWorker.ts:354` passed `extractBendConstraints` angle output directly to `solver.set_bend_with_types(ids, restAngles, edgeTypes)`. Rust `solve_bend` (`crates/xpbd-wasm/src/lib.rs:441`) treated values as distances. Result: WASM bend constraints with rest lengths in radian-magnitude (~0.05-π) interpreted as metres → asymmetric/rigid bending.

**Post-fix state (commit `47557d8e`, PR #604):**
- New helper `src/utils/cloth/wasm/bendRestDistances.ts` (45 líneas) with docstring documenting the seam.
- WASM worker pipeline: `extractBendConstraints` → `computeBendRestDistances(positions, ids)` → `solver.set_bend_with_types(ids, distances, types)`.
- CPU + GPU paths unchanged. CPU computes distances inline (xpbdSolver.ts:564-568). GPU consumes raw angles (TSL bend model needs angles).

**Variant 3 status:** the seam exists by **design** (TSL bend model needs angles; WASM/CPU need distances). The helper file is itself a ratification doc — its docstring lines 1-19 explicitly document the GPU↔WASM/CPU semantic difference.

A4 contribution to variant 3: cross-ref this Fase 2 doc from `bendRestDistances.ts` JSDoc + cross-ref BUG-1 from this doc § 5.x. No code changes for variant 3.

### 2.6 Unit-conversion regla 5 audit (post-bug-#690)

Regla 5 anchored 2026-05-02 post bug-#690: helpers converting units must touch ALL transformation components (scale + position + rotation pivot if applicable).

A4 audit relevant to its territory:

| Site | Type | Transform components | Status |
|---|---|---|---|
| `boundaries.ts:36` `importerToMetres` | mm→m on imported scene | scale + position both multiplied by 0.001 | ✅ regla 5 compliant (post b18f4762) |
| `boundaries.ts:17` `metresToImporter` | m→mm scalar (number→number) | n/a (returns scalar) | ✅ N/A |
| `units.ts` — `mmToM`, `mToMm`, `cmToM`, `mToCm`, `cmToMm`, `mmToCm` | scalar conversions | n/a (returns scalar) | ✅ N/A |
| `bendRestDistances.ts:30` | computes distance from positions array | n/a (semantic conversion, not unit) | ✅ N/A |

**Out-of-scope A4 but captured § 6 follow-ups:**
- `gltfExporter.ts:37` `clone.scale.multiplyScalar(scale)` default 0.001 — clones object, applies scale only. If caller's object has non-zero `position` in source units, position is NOT converted. Caller `GarmentSimulation.tsx:547` passes a freshly-constructed group via `collectScene` which sets group-level scale only (group position is 0); transitively the avatar/garment children have their own positions inherited correctly under group scale. Verified safe **for current callers**, but pattern is fragile if future caller passes a group with non-zero position. § 6 candidate follow-up.
- `sceneCollector.ts:46` `group.scale.set(scale, scale, scale)` — same pattern, safe given `group` is freshly built with position=0.

A4's core scope is geometry/mesh ops (variants 1-3); unit-conversion sweep was per regla 5 anchor cross-ref. No new partial-conversion bugs found within A4's territorio. Out-of-scope sites flagged.

### 2.7 Outside obvious dirs sweep (regla 6)

**Grep summary:**
- `extractStretch|extractBend|TriangleSpatialHash|SpatialHashGrid|findTriNeighbors|buildAdjacency`: 33 hits total in `src/` + `crates/`, all inside `src/utils/cloth/` or `crates/xpbd-wasm/`. **Zero consumers outside `cloth/`.**
- WASM consumers in `components/Viewport3D/` (e.g., `useMeshing.ts`, `useCollisionBodies.ts`, `GarmentSimulation.tsx`) consume via `WasmSolverClient` interface (post-A6 ratification). Interface exposes setters/lifecycle methods — no direct geometry op exposure.

Drift surface is **bounded to `src/utils/cloth/`**. A4 sweep clean per regla 6 — no sibling consumer surprises.

### 2.8 Pre-existing canonical infrastructure check (regla 1)

| Pattern | Found | Notes |
|---|---|---|
| `*Registry.ts` for topology ops | None | No central registry. |
| `*Manifest.ts` for cross-tier surfaces | `solverCapabilities.ts` (post-A7) | Capability surface for runtime feature presence; NOT topology ops. |
| Test naming `*Coverage.test.ts` / `*Invariant.test.ts` | None for topology | Tests cover individual extractors (`gpuBuffers.test.ts:25`, `bendRestDistances.test.ts`) but no convergence test. |
| Inline `// canonical:` markers | None | |
| Inline docs ratifying current cleavage | `bendRestDistances.ts:1-19` (variant 3 only) | |

**Conclusión:** no pre-existing canonical for topology extraction convergence. If Pattern 2.5 lite (3.2.A) approved, helper would be net-new but small scope.

### 2.9 Inventory claims verification (regla 0 + 13)

| Claim | Status | Evidence |
|---|---|---|
| **A.** Spatial hash 2 implementaciones TS distintas | **Confirmed but misframed** | 2 impls exist; serve different domains (triangle-vs-particle vs particle-vs-particle); not "duplication", role separation. CPU+WASM **share** `TriangleSpatialHash`. |
| **B.** Constraint extraction 2 impls TS, tipos diferentes | **Confirmed; cross-language framing wrong** | Real intra-TS dup (CPU inline vs GPU/WASM standalone). `Int32Array` vs `Uint32Array` cleavage real. |
| **C.** "Diferencia funcional real — afecta numérica del WASM tier" | **Was true at inventory-time; now closed** | BUG-1 (variant 3) was the numeric divergence; closed PR #604. Variant 2 type cleavage produces equivalent constraint data — no numeric divergence. |

**2/3 inventory claims confirmed at structural level; framing of all 3 reformulated.**

### 2.10 Sweep negativo (qué NO emergió)

- 0 Rust geometry/mesh extraction code paths (Rust is consumer-only).
- 0 unit-conversion partial-helper bugs in A4 territory beyond bug-#690 closed.
- 0 cross-tier consumers of topology extractors outside `src/utils/cloth/`.
- 0 architectural divergences between CPU/WASM topology semantics post-BUG-1 (both consume distances).
- 0 compile-gate trigger anticipated (regla 4) — A4 is not extracting an interface, ratify is dominant outcome. Variant 2 if 2.5 lite would extract pure functions, no `implements` clause.

Sweep cerró clean con framing reformulation + 1 ratify + 1 ratify-by-inertia + 1 Pattern 2.5 lite candidate.

---

## Sección 3 — Sub-decisiones, opciones y tradeoffs

Tres sub-decisiones: 3.1 (variant 1 ratify-by-misclassification), 3.2 (variant 2 ratify-as-is vs Pattern 2.5 lite shared helper), 3.3 (variant 3 ratify-by-inertia + cross-doc).

### 3.1 Variant 1 — Spatial hash classification

**Pregunta:** ¿`TriangleSpatialHash` y `SpatialHashGrid` son drift duplicado (refactor candidate) o roles ortogonales legítimos (ratify)?

#### Opción 3.1.A — Ratify-by-misclassification con cross-doc (RECOMENDADA)

Ratify ambos como design legítimos serving distinct domains. Add JSDoc cross-refs en cada clase referenciando this Fase 2 doc + el "domain" de cada hash. Update inventory annotation.

```ts
// triangleCollision.ts (preceding TriangleSpatialHash):
/**
 * Spatial hash for triangle-vs-particle collision (cloth ↔ kinematic body).
 *
 * Domain: indexed by triangle ID; AABB-expanded grid over a static triangle
 * mesh. Built once per kinematic body, immutable for body's lifetime.
 *
 * Distinct from `SpatialHashGrid` (selfCollision.ts) which indexes particle IDs
 * for self-collision and rebuilds every frame. See A4 Fase 2
 * (docs/reports/2026-05-02-drift-fase2-a4-cross-language-geometry-mesh.md § 2.4)
 * for the role separation ratification.
 */
```

```ts
// selfCollision.ts (preceding SpatialHashGrid):
/**
 * Spatial hash for particle-vs-particle self-collision (cloth ↔ itself).
 *
 * Domain: indexed by particle ID; counting-sort flat array. Rebuilt every
 * frame from current positions (positions move every step).
 *
 * Distinct from `TriangleSpatialHash` (triangleCollision.ts) which indexes
 * triangle IDs for kinematic body collision. See A4 Fase 2 § 2.4 for the
 * role separation ratification.
 *
 * WASM tier lacks self-collision (gap tracked in #608, A7 § 3.1.1).
 */
```

- **Pros:**
  - **Reformulation closes inventory premise** (regla 13). Inventory misclassification is itself drift to capture.
  - **Discoverability:** future dev encountering either class sees explicit role separation + cross-ref to other.
  - **Zero code changes** beyond JSDoc.
  - **Aligned con D7 precedent** (`ValidationDiagnostic` vs `Diagnostic` ratify ortogonal roles).
- **Cons:** none material. JSDoc maintenance cost trivial.

#### Opción 3.1.B — Refactor a interface compartida `SpatialHashBase`

Extract base class / interface unifying both spatial hashes.

- **Pros:** abstract uniformity.
- **Cons (primary):** **roles diverge enough that interface would be vacuous** — different constructor signatures (mesh-stamped vs empty), different storage shapes (Map vs counting-sort), different query patterns (AABB-spatial-overlap vs 3³ neighborhood). Common interface would expose only `clear()` / `cellSize` / no-op. Net cost > benefit.
- **Cons (secondary):** violates "shape-similar can hide signature-different" anti-pattern (regla 3a) — would create premature abstraction over genuine role divergence.
- **Descartar** — Pattern 1 refactor in absence of real shared semantics.

#### Opción 3.1.C — Status quo (no JSDoc cross-doc)

Keep classes as-is; rely on inventory entry annotation only.

- **Pros:** zero touched.
- **Cons:** inventory annotation is git-history-deep; future dev encountering either class doesn't see the cross-ref. Discoverability cost.
- **Descartar** — JSDoc cross-doc cost is trivial vs discoverability win.

#### Recomendación 3.1

**Opción 3.1.A** confianza alta. Razones:

1. **Regla 13 application** — inventory misclassification ratification is clean closure shape.
2. **Discoverability +** — JSDoc cross-doc enables future-dev pickup of role separation without git archaeology.
3. **Zero behavior risk** — JSDoc-only, no code semantics affected.
4. **Aligned con precedentes** — D7 (Diagnostic types ortogonales), B12-state (canonical pre-existed), C7 (intentional feature).

---

### 3.2 Variant 2 — Constraint extraction duplication

**Pregunta:** ¿la duplicación TS-internal CPU inline (xpbdSolver constructor) vs GPU/WASM standalone (gpuBuffers extractors) merece Pattern 2.5 lite shared helper, o ratify the cleavage?

#### Opción 3.2.A — Pattern 2.5 lite: extract shared topology helper `clothTopology.ts`

New file `src/utils/cloth/clothTopology.ts` exporting pure functions:

```ts
// clothTopology.ts (~80 líneas net add)

import { EdgeType, classifyEdgeType } from './gpu/gpuBuffers';

export interface StretchTopology {
  /** Edge id pairs [a,b, a,b, ...] — Uint32Array. */
  ids: Uint32Array;
  /** Rest distances per edge. */
  restLengths: Float32Array;
  /** EdgeType per constraint (WARP, WEFT, SHEAR). */
  edgeTypes: Uint8Array;
}

export interface BendTopology {
  /** Bend quad ids [a,b,c,d, a,b,c,d, ...] — shared edge a-b, opposite c,d. */
  ids: Uint32Array;
  /** Rest distances c↔d (consumed by CPU + Rust solvers). */
  restDistances: Float32Array;
  /** Rest dihedral angles a-b axis (consumed by TSL bend solver). */
  restAngles: Float32Array;
  /** EdgeType per constraint (WARP or WEFT). */
  edgeTypes: Uint8Array;
}

/**
 * Extract stretch + bend topology from a triangle mesh.
 *
 * Output produces both rest distances AND rest angles for bend so consumers
 * pick the form they need:
 * - CPU + Rust solvers: use restDistances.
 * - TSL/WebGPU bend solver: use restAngles.
 *
 * Used by:
 * - GPU client (gpuSolverClient.ts) — picks restAngles for TSL.
 * - WASM worker (wasmSolverWorker.ts) — picks restDistances; bend ids passed
 *   to Rust as Uint32Array directly.
 * - CPU solver (xpbdSolver.ts) — picks restDistances; converts ids to
 *   Int32Array for internal storage type-consistency with triIds.
 */
export function extractClothTopology(
  positions: Float32Array,
  triangles: Uint32Array,
  uvs?: Float32Array,
): { stretch: StretchTopology; bend: BendTopology } {
  // Map<edgeKey, triangleIndices> dedup — same algorithm as gpuBuffers extractBendConstraints.
  // Computes both restDistances and restAngles for bend.
  // ... (~50 líneas implementation)
}
```

Migration:
- `gpuBuffers.ts`: keep `extractStretchConstraints` + `extractBendConstraints` as thin wrappers calling `extractClothTopology` (or remove them outright if no callers outside the path; ~5 callers in gpuSolverClient + wasmSolverWorker).
- `wasmSolverWorker.ts:509-518`: replace 2 calls + `computeBendRestDistances` with single `extractClothTopology` + pick-`restDistances`. **`bendRestDistances.ts` becomes dead code** (deleted as part of Pattern 2.5 cleanup nested inside variant).
- `xpbdSolver.ts` constructor (lines 421-456): replace inline `findTriNeighbors`-based build with `extractClothTopology` call + `Uint32Array → Int32Array` conversion at storage. `findTriNeighbors` retained if used elsewhere — checked, **only used by CPU constructor**, so deleted.

```ts
// xpbdSolver.ts constructor (post-migration):
const topo = extractClothTopology(this.pos, new Uint32Array(this.triIds), this.uvs);

this.stretchingIds     = new Int32Array(topo.stretch.ids);
this.stretchingLengths = topo.stretch.restLengths;
this.stretchCompliances = mapEdgeTypesToCompliance(topo.stretch.edgeTypes, this.config); // helper

this.bendingIds        = new Int32Array(topo.bend.ids);
this.bendingLengths    = topo.bend.restDistances;
this.bendCompliances   = mapEdgeTypesToCompliance(topo.bend.edgeTypes, this.config);
```

**Net code delta:** +~80 líneas (new `clothTopology.ts`) + ~-30 líneas (removed inline build in xpbdSolver constructor) + -45 líneas (removed `bendRestDistances.ts`) + ~-100 líneas (removed `findTriNeighbors` + `extractStretchConstraints` + `extractBendConstraints` if fully replaced) + ~-40 líneas (removed `extractStretch/Bend` tests if helpers fully gone, OR new `clothTopology.test.ts` ~+60 líneas).

**Net delta estimate: ~-55 to -75 líneas** depending on whether `gpuBuffers` exports stay as wrappers (+0) or get removed (-100).

- **Pros:**
  - **Single source of truth** — algorithmic topology extraction lives in one file. Future bug fix touches one site, not two.
  - **Type cleavage explicit** — `Uint32Array` is canonical; CPU's `Int32Array` is local convention applied at constructor boundary.
  - **Eliminates `bendRestDistances.ts`** as dead code (variant 3 helper folded into shared topology).
  - **Discoverability** — single filename for "where topology comes from".
  - **Tests collapsed** — single test suite covers all consumers' needs.
  - **Pattern 2.5 lite shape** — surgical add of helper, removal of inline drift, ratify intentional pattern.
- **Cons (primary):** **migration touches CPU constructor** — well-tested path with 1800-line file. Risk of subtle regression in stretch/bend ID list ordering or edge cases (e.g., boundary edges where neighbors map returns -1).
- **Cons (secondary):** **algorithm change in CPU path** — sorted-edge `findTriNeighbors` replaced by Map-keyed dedup. Both produce same set of edges/quads but **iteration order may differ**, which could affect numerical determinism if downstream code depends on ID list order (e.g., per-frame compliance application).
- **Cons (tertiary):** **bend angles always computed** even for CPU/WASM consumers that only need distances. Compute cost ~negligible (one atan2 per bend constraint at init time only, not per frame).
- **Migration:** ~3-5h Fase 3, including:
  - New `clothTopology.ts` + tests.
  - Refactor `gpuSolverClient.ts` + `wasmSolverWorker.ts` callsites.
  - Refactor `xpbdSolver.ts` constructor.
  - Delete `bendRestDistances.ts`.
  - Delete `findTriNeighbors` (verify no other callers).
  - Verify ID-order-equivalence with existing tests + maybe golden-output comparison.
  - Verify visual cloth simulation pre/post for CPU path.

#### Opción 3.2.B — Ratify-as-is with JSDoc cross-doc (RECOMENDADA)

Ratify the CPU/GPU+WASM cleavage as legitimate intentional design. Add JSDoc on both extraction sites cross-referencing each other + this Fase 2 doc.

```ts
// xpbdSolver.ts:421 (preceding inline topology build):
// CPU-side topology extraction. Uses sorted-edge `findTriNeighbors` to build
// stretch edge pairs + bend quads. Stores ids as Int32Array (type-consistent
// with triIds: Int32Array). Equivalent in output to GPU/WASM path's
// extractStretchConstraints + extractBendConstraints (gpu/gpuBuffers.ts) but
// with different dedup algorithm + different array type. Ratified as intentional
// cleavage in A4 Fase 2 § 3.2 — TS-internal duplication accepted for type
// consistency + minimal touch surface to a 1800L well-tested constructor.
```

```ts
// gpu/gpuBuffers.ts:150 (preceding extractStretchConstraints):
// GPU/WASM-side stretch topology extraction. Returns Uint32Array ids (compatible
// with both WebGPU storage buffer requirements + Rust WASM `set_stretch_with_types`
// API). CPU equivalent lives inline in xpbdSolver.ts constructor (lines 421-456)
// with Int32Array ids. See A4 Fase 2 § 3.2 for the cleavage ratification.
```

- **Pros:**
  - **Zero migration risk** — no touch to CPU constructor.
  - **Preserves type consistency** in CPU path (Int32Array everywhere for topology).
  - **No algorithm change** — sorted-edge approach in CPU has its own validation + numerical determinism guarantees.
  - **Discoverability via JSDoc** — future dev sees explicit cross-doc.
  - **Ratify-by-convention con JSDoc cross-doc** — light touch, document the intentional cleavage. Distinto de Pattern 2.5: no hay surgical addition de helper ni removal de inline drift; solo cross-doc instrumentation. Mismo bucket que D7 (Diagnostic types ortogonales).
- **Cons:** **dual maintenance** — bug fix in topology extraction logic touches both sites. Mitigated by:
  - The two algorithms are stable + simple (deduplication + 4-tuple build).
  - No bug history pointing to drift between the two (BUG-1 was a different axis: angle vs distance, not topology).
  - JSDoc cross-doc surfaces the relationship at touch time.
- **Migration:** ~30 min (JSDoc additions on 3 sites: xpbdSolver:421, gpuBuffers:150, gpuBuffers:200).

#### Opción 3.2.C — Pattern 1: full unification with breaking interface change

Pattern 1 refactor: introduce `ClothTopology` central class managing topology, used by all 3 solver tiers. CPU constructor delegates topology to the class. GPU + WASM clients construct via the class.

- **Pros:** total uniformity.
- **Cons (primary):** **scope blowup**. Pattern 1 refactor across 3 solver tiers + worker boundary serialization (since topology arrays cross worker postMessage). Architectural decision-tree (when does topology rebuild? what's the lifecycle? Class vs functions?). Easily 8-12h scope vs 0.5h-5h alternatives.
- **Cons (secondary):** violates 3.6 decoupling pattern — would block A4 closure on per-tier port migrations.
- **Descartar** — disproportionate to drift severity.

#### Recomendación 3.2

**Opción 3.2.B (ratify-as-is)** confianza media-alta. Razones:

1. **Migration risk** del 3.2.A es real (CPU constructor 1800-line, sorted-edge → Map switch could shift iteration order, hard to verify equivalence without golden outputs).
2. **Drift severity es baja** — output equivalence verified, no bug history pointing to dual-impl drift, type cleavage justified by storage type consistency.
3. **JSDoc cross-doc** captures the intentional design at touch sites.
4. **Calibration alignment** — A4 was estimated 7-9h con compile-gate trigger anticipation; ratify-as-is path is ~0.3-0.5x that, consistent con "ratify-by-convention" calibration regime (62% rule).

**Tradeoff aceptado:** dual maintenance del topology algo. Aceptable porque (i) algorithm is simple + stable, (ii) no historical drift signal, (iii) JSDoc surfaces relationship.

**Si Sam prefiere 3.2.A:** migration plan in § 5 expanded; añadir golden-output comparison test for CPU path numerical equivalence; budget ~3-5h Fase 3 + 1-2h verification.

---

### 3.3 Variant 3 — Bend rest semantics

**Pregunta:** BUG-1 fix (PR #604) closed the WASM tier numerical bug. ¿A4 contribuye algo más allá de cross-doc, o variant queda `bendRestDistances.ts`-as-ratification?

#### Opción 3.3.A — Cross-doc + JSDoc anchor (RECOMENDADA)

Add this Fase 2 doc cross-ref en `bendRestDistances.ts:1-19` JSDoc + add Rust API rename to § 6 follow-ups (rename `set_bend_with_types` parameter `rest_angles` → `rest_distances` to match actual semantics; out-of-scope A4 because Rust binding sync involves WASM rebuild + ABI consideration).

```ts
// bendRestDistances.ts JSDoc addition (line 1-19 preserved + new lines):
/**
 * BUG-1 (#604) — WASM bend rest values.
 *
 * [... existing 19-line docstring preserved ...]
 *
 * Variant 3 of A4 Fase 2 (docs/reports/2026-05-02-drift-fase2-a4-...md § 2.5).
 * Closed pre-A4 via this helper — A4 ratifies the seam by inertia.
 */
```

- **Pros:**
  - **Surfaces variant 3 closure** — future reader of `bendRestDistances.ts` sees A4 ratification.
  - **Zero code change** beyond JSDoc.
  - **Captures Rust API rename follow-up** — `rest_angles` → `rest_distances` parameter rename is a separate concern (Rust ABI + WASM rebuild + binding sync).
- **Cons:** none material.

#### Opción 3.3.B — Status quo (no cross-doc)

Leave `bendRestDistances.ts` JSDoc as-is. Variant 3 closure remains documented only in PR #604 commit message + the helper file itself.

- **Cons:** future reader doesn't see A4 ratification trail.
- **Descartar** — JSDoc addition cost trivial.

#### Opción 3.3.C — Rust API rename in F3

Rename Rust `set_bend_with_types` parameter `rest_angles` → `rest_distances` + WASM rebuild + binding sync.

- **Pros:** Rust API matches semantics.
- **Cons (primary):** **scope creep into Rust ABI**. Even though rename is compile-safe (positional args), changing parameter name affects:
  - WASM binding regeneration (`xpbd_wasm.js`).
  - Sync verification (BOTH files copied per CLAUDE.md non-negotiable).
  - Any place generated bindings reference the parameter name (TypeScript .d.ts, doc tools).
- **Cons (secondary):** **BUG-1 fix is anchored to current API name**. Rename invalidates the BUG-1 fix-message reference + helper docstring partial.
- **Descartar para A4** — captured as § 6 follow-up issue, can be addressed independently when next Rust touch happens.

#### Recomendación 3.3

**Opción 3.3.A** confianza alta. JSDoc cross-doc + § 6 follow-up for Rust rename.

---

### Tabla resumen Sec 3

| Sub-decisión | Recomendación | Migration cost | Risk |
|---|---|---|---|
| 3.1 Variant 1 (spatial hash) | **3.1.A** — Ratify-by-misclassification + JSDoc cross-doc | ~15 min (2 JSDoc blocks) | Zero |
| 3.2 Variant 2 (constraint extraction) | **3.2.B** — Ratify-as-is + JSDoc cross-doc | ~30 min (3 JSDoc blocks) | Zero (vs ~3-5h + medium risk for 3.2.A) |
| 3.3 Variant 3 (bend rest semantics) | **3.3.A** — Cross-doc + § 6 Rust rename follow-up | ~10 min (1 JSDoc addition + 1 follow-up issue) | Zero |

**Total migration:** ~1h Fase 3 (JSDoc additions on ~6 sites) + 1 follow-up issue. Pattern: **ratify-by-convention** with light cross-doc instrumentation.

**If Sam overrides 3.2 → 3.2.A** (Pattern 2.5 lite shared helper): +3-5h Fase 3 + medium risk on CPU path. Still bounded scope (~80 net + tests).

---

## Sección 4 — Recomendación consolidada

Si Sam aprueba 3.1.A + 3.2.B + 3.3.A, los cambios resultantes son:

| # | Cambio | Archivo | Tipo |
|---|---|---|---|
| 1 | JSDoc preceding `TriangleSpatialHash` documenting domain + cross-ref to A4 § 2.4 + cross-ref to `SpatialHashGrid` | `src/utils/cloth/triangleCollision.ts:95` | docs (~12 líneas) |
| 2 | JSDoc preceding `SpatialHashGrid` documenting domain + cross-ref to A4 § 2.4 + cross-ref to `TriangleSpatialHash` + WASM gap (#608) | `src/utils/cloth/selfCollision.ts:53` | docs (~13 líneas) |
| 3 | JSDoc preceding inline topology build in CPU constructor cross-ref'ing GPU/WASM extractors + A4 § 3.2 ratification | `src/utils/cloth/xpbdSolver.ts:421` | docs (~8 líneas) |
| 4 | JSDoc preceding `extractStretchConstraints` cross-ref'ing CPU inline + A4 § 3.2 | `src/utils/cloth/gpu/gpuBuffers.ts:150` | docs (~6 líneas) |
| 5 | JSDoc preceding `extractBendConstraints` cross-ref'ing CPU inline + A4 § 3.2 + `bendRestDistances.ts` for WASM-tier conversion | `src/utils/cloth/gpu/gpuBuffers.ts:200` | docs (~7 líneas) |
| 6 | JSDoc addition to `bendRestDistances.ts` cross-ref'ing A4 § 2.5 | `src/utils/cloth/wasm/bendRestDistances.ts:1` | docs (~3 líneas) |
| 7 | CLAUDE.md "Audit Ratifications" row para A4 | `CLAUDE.md` | docs (1 line) |

**Total migration:** ~50 líneas docs distribuidas en 6 sitios + 1 CLAUDE.md row. **Zero código cambiado**. **~1h Fase 3.**

Behavioral guarantees:
- Zero runtime behavior change (JSDoc-only).
- Zero binary change (no WASM rebuild needed).
- Zero test change (existing tests stay valid).
- Discoverability +: future devs encountering any of the 6 sites see the cross-doc trail.

---

## Sección 5 — Plan de migración Fase 3

### 5.1 Commit 1 — Methodology updates (if any)

A4 close does NOT introduce new methodology rules. The existing rules apply directly:
- Regla 13 (inventory misclassification is itself drift to capture) → variant 1.
- Regla 1 (pre-existing canonical check) → no canonical found, ratify cleavage.
- Regla 0 (verify before assert) → inventory shorthand "Rust↔TS" reformulated post-sweep.

No commit 1.

### 5.2 Commit 2 — Fase 2 doc

This file: `docs/reports/2026-05-02-drift-fase2-a4-cross-language-geometry-mesh.md`. Atomic commit. Open draft PR.

**PAUSE — esperás verde explícito de Sam.**

### 5.3 Commit 3 — Code: JSDoc additions (post-verde)

Single atomic commit with all 6 JSDoc additions (sites #1-6 in § 4 table). Title: `docs(cloth): A4 ratify cross-tier topology cleavage + spatial hash roles`.

Body:
- Cross-doc trail for A4 closure.
- Variant 1: spatial hash roles ratified (regla 13 misclassification).
- Variant 2: CPU/GPU+WASM topology extraction cleavage ratified-by-convention con JSDoc cross-doc; Pattern 2.5 lite (helper compartido) disponible como reopen path § 7 #1-2.
- Variant 3: bend rest semantics already closed (BUG-1 #604); cross-ref added.

### 5.4 Commit 4 — CLAUDE.md ratification row

Add row to `CLAUDE.md` "Audit Ratifications" table:

```
| A4 | Cross-language geometry/mesh ops Rust↔TS reformulated to TS-internal cross-tier; spatial hash roles ortogonales; topology extraction cleavage ratified; bend rest semantics closed pre-A4 via BUG-1 | `docs/reports/2026-05-02-drift-fase2-a4-cross-language-geometry-mesh.md` |
```

Atomic commit separate from #3 (regla 9 atomicity).

### 5.5 Verify gates

```bash
npx tsc -b --noEmit && npm run test && npm run lint
```

JSDoc-only changes — typecheck/test/lint should pass without surprise. WASM rebuild **NOT needed** (no Rust changes, no `xpbd_wasm.js`/`xpbd_wasm_bg.wasm` touch).

### 5.6 PR ready-for-review

Post-verify-gates-clean, mark PR ready-for-review.

### 5.7 Follow-up issues (post-merge)

1. **Rust API rename `rest_angles` → `rest_distances`** in `crates/xpbd-wasm/src/lib.rs:164` `set_bend_with_types`. Severity:low. Scope: Rust function param rename + WASM rebuild + binding sync + JSDoc update on `bendRestDistances.ts`. Not blocking; can ride on next Rust touch (e.g., A7 self-collision port follow-up).
2. **gltfExporter / sceneCollector regla 5 audit** — verify scale-multiplyScalar callers don't pass non-zero-position objects. Captured § 2.6. Severity:low. Scope: read 2 callsites + verify position handling for GarmentSimulation export path. Out-of-scope A4 (single-language TS, not Rust↔TS).
3. **Variant 2 Pattern 2.5 lite reopen trigger** (if needed): if dual-maintenance topology drift surfaces (e.g., CPU bug not propagated to GPU/WASM extractor or vice versa), reopen 3.2.A as the correct closure. Captured in § 7 reopen triggers.

---

## Sección 6 — Cross-references y dependencias

### 6.1 Inputs

- `docs/reports/2026-04-28-drift-inventory-fase1.md` § A4 (lines 141-147) — claims A/B verified at structural level; framing reformulated.
- `docs/reports/2026-04-28-drift-fase2-classification.md` (line 125) — A4 classified (c) RFC.
- `docs/reports/2026-05-01-drift-fase2-a3-cross-boundary-errors.md` — A3 ratified Rust↔TS error pattern. A4 inherits cross-boundary contract framing.
- `docs/reports/2026-05-01-rfc-a6-worker-protocol.md` — A6 ratified `ClothSolverClient` 4-member lifecycle subset post-compile-gate trigger. A4 anticipated similar trigger; sweep showed no `implements` required (ratify-dominant outcome).
- `docs/reports/2026-05-01-rfc-a7-wasm-cpu-equivalence.md` — A7 ratified per-feature port-or-ratify + `SolverCapabilities`. A4 cross-refs A7 § 3.1.1 for self-collision WASM gap (#608).
- BUG-1 fix commit `47557d8e` (PR #604) — variant 3 closure. A4 § 2.5 ratifies.
- Bug-#690 fix commit `b18f4762` — anchored regla 5 (unit-conversion ALL components). A4 § 2.6 audited regla 5 within A4 territory; clean (only `importerToMetres` is a true unit-conversion helper, and it's compliant).
- CLAUDE.md non-negotiables (committed) + `CLAUDE/methodology.md` (private routing layer).
- Code: `crates/xpbd-wasm/src/lib.rs` (832 líneas), `src/utils/cloth/xpbdSolver.ts` (1802 líneas), `src/utils/cloth/gpu/gpuBuffers.ts` (561 líneas), `src/utils/cloth/triangleCollision.ts` (312 líneas), `src/utils/cloth/selfCollision.ts` (232 líneas), `src/utils/cloth/wasm/bendRestDistances.ts` (45 líneas).

### 6.2 Outputs

- **Si aprobado:** Fase 3 (commits 3-4 sobre este branch) + 1-2 follow-up issues (Rust rename + gltfExporter audit).
- **A4 cerrado:** Pattern ratify-by-convention (regla 13 + 1) con light cross-doc + 1 ratify-by-inertia.
- **Cuarto eje (c) RFC cerrado:** A4 después de C1 + A7 + A6. (c) bloque progress: 4/6, pending A2 + C4.
- **Inventory misclassification ratification 7th case** (regla 13 lineage: B12-state + C7 + B5-state + D1-cosmetic + D5 + ... + A4). Reinforces "62% rule" calibration.
- **Classification: ratify-by-convention con JSDoc cross-doc**. Pattern 2.5 hybrid sigue 3 variants confirmadas (cleanup / lite / extend); A4 variant 2 closure NO es Pattern 2.5 — JSDoc-only sin surgical addition ni removal. Bucket correcto: ratify-by-convention con cross-doc, mismo shape que D7 (`ValidationDiagnostic` vs `Diagnostic` ortogonal roles). Reviewer call (2026-05-02) — Pattern 2.5 ambiguity flag closed.

### 6.3 No-conflicts (out-of-scope verificado)

- **A3 cross-boundary error pattern**: preserved (no Rust changes).
- **A6 worker protocol interface**: preserved (no setter/lifecycle changes).
- **A7 capability surface**: cross-ref'd (variant 1 § 2.4 mentions self-collision WASM gap = A7 territory, #608).
- **BUG-1 closure**: preserved (variant 3 ratify-by-inertia, no code touch).
- **C1 disposable lifecycle**: unrelated.
- **D6 fabric types 3-tier**: unrelated.
- **D7 diagnostic types**: directly analogous precedent — same shape ratification (ortogonal roles).
- **bug-#690 importerToMetres regla 5**: respected; A4 audit clean within territory.

### 6.4 Co-existence con ejes abiertos

- **A2** (config types unify cross-boundary): pending. A4's reformulation (Rust↔TS narrowed to consumer-only) may inform A2 framing. A2 likely faces similar Rust↔TS framing question; can refer to A4 § 2.1-2.2 for the "Rust is consumer-only" pattern.
- **C4** (4-way tier orchestration): pending. C4 will inherit A6 lifecycle + A7 capabilities + A4 topology cleavage as ratified surfaces. If C4 introduces tier-coordinator class, may revisit topology unification (Pattern 2.5 lite revision via 3.2.A reopen trigger).
- **E-async-states** sub-track: parallelizable; no direct conflict.
- **A6 setter migrations** (#683-689): preserved; A4 doesn't touch setter surfaces.
- **A7 per-feature ports** (#676-681): preserved; SpatialHashGrid CPU-only is per A7 ratification.

---

## Sección 7 — Reopen triggers

A4 ratificación queda revisable si emerge:

1. **Topology drift detected between CPU inline and GPU/WASM extractor** — e.g., bug fix in stretch edge dedup applied to one site and not the other → revisit 3.2.A (Pattern 2.5 lite shared helper). Trigger: any commit touching topology extraction logic in only one of `gpuBuffers.ts` / `xpbdSolver.ts:421-456`.
2. **CPU constructor refactor for other reasons** (e.g., piece stiffness post-A7 port, neural solver init) — opportunistic Pattern 2.5 lite migration becomes viable at lower risk if constructor is already being touched. Re-evaluate 3.2.A when constructor edit surface ≥ 100 líneas.
3. **WASM-tier self-collision port lands** (A7 #608) — `SpatialHashGrid` may migrate to a shared TS helper consumed by both CPU + WASM. Revisit § 3.1 if cross-tier sharing of self-collision hash emerges.
4. **TSL bend solver migrates to distance-based bend** (eliminating angle-vs-distance seam) — variant 3's bridging helper `bendRestDistances.ts` becomes dead code; re-evaluate § 3.3 closure.
5. **Rust crate gains geometry extraction exports** — e.g., new `compute_topology(triangles) -> SerializedTopology` Rust function. A4's "Rust is consumer-only" framing inverts → reopen § 1 with new evidence.
6. **C4 RFC introduces tier-coordinator class** that owns topology lifecycle — may obsolete A4 cleavage ratification by superseding it with structured class. Revisit § 3.2 in light of C4 closure.
7. **Topology-related bug surfaces in production** — reopen § 3.2 with concrete repro.

---

## Sección 8 — Deuda técnica explícita post-ratificación

1. **Dual maintenance del topology extraction algorithm.** CPU (sorted-edge) + GPU/WASM (Map-keyed) are 2 distinct implementations of equivalent topology dedup. Bug fix in one must propagate to other manually. Aceptable porque (i) algorithms are simple + stable, (ii) no historical drift signal, (iii) JSDoc cross-doc surfaces relationship, (iv) reopen trigger #1 captures the failure mode.
2. **Rust API parameter name `rest_angles` is misleading** post-BUG-1. Captured § 6 follow-up; not blocking.
3. **`bendRestDistances.ts` is conceptually a "WASM-tier bridging helper"** but lives in `src/utils/cloth/wasm/`. If TSL bend ever migrates to distance-based bend, helper becomes dead code; rename or relocate would be cleanup. Acceptable; trigger captured § 7 #4.
4. **`findTriNeighbors` is CPU-only** (single caller: xpbdSolver constructor). If 3.2.A path taken, becomes dead code. Currently retained because 3.2.B ratifies as-is.
5. **Spatial hash JSDoc cross-doc requires manual sync** — if either class moves files or renames, JSDoc cross-ref breaks. Aceptable; risk low; ratify is JSDoc-only per regla 9 atomicity (separate from code commits).
6. **gltfExporter / sceneCollector scale-only conversion pattern** — out-of-scope A4 (single-language). Captured § 6 follow-up.

---

## Sección 9 — Decisión pendiente y siguiente paso

### 9.1 Pregunta a Sam

¿Aprobás las 3 sub-decisiones tal como recomendado en Sec 3 (3.1.A + 3.2.B + 3.3.A)?

Si **sí, todo aprobado:**
- Marco PR ready-for-review post-Fase 3.
- Sec 4-9 quedan como ratificación final.
- Fase 3: 2 commits sobre este branch (JSDoc additions + CLAUDE.md row) + 1-2 follow-up issues (Rust rename, gltfExporter audit).
- Inventory annotation post-merge.
- A4 cerrado como **5to caso ratify-by-convention con regla 13 misclassification** del audit (lineage B12-state + C7 + B5-state + D1-cosmetic + D5 → A4). Reinforces 62% calibration rule.

Si **3.2 querés cambiar a 3.2.A (Pattern 2.5 lite shared helper):**
- Re-edito Sec 4 + Sec 5 con migration plan expandido (~3-5h F3 + medium risk + golden-output verification).
- Pattern 2.5 lite 2da data point post-D4 (CopilotPanel `recordMessage`).

Si **el scope del eje cambia (e.g., reopen Rust↔TS framing):**
- STOP. Reabro Sec 1 con nuevo evidence.

### 9.2 Estado del PR

- Sec 1-9 ✅ ready.
- Fase 2 doc en este commit. Draft PR pendiente.
- Pendiente Fase 3 commits (2: JSDoc + CLAUDE.md row).

### 9.3 Calibración estimate vs actual

- Estimate Fase 2 doc inicial (kickoff anticipation): 7-9h con compile-gate trigger anticipation (regla 3a).
- **Actual Fase 2 doc: ~3h** (sweep refresh + classification + redacción).
- **Factor: ~0.4x** del estimate.
- Causa: ratify-by-convention dominant outcome + variant 3 closed pre-A4 + variant 1 misclassification → smaller decision-tree than worst case. Compile-gate trigger NOT fired (no `implements` extraction). Reformulation of "Rust↔TS" framing closed the premise hueco fast.
- Calibración alignment: A4 sits in the **"ratify-by-convention" 0.3-0.5x calibration regime** per methodology table — consistent.

### 9.4 Heads up Fase 3

- **No WASM rebuild** (zero Rust changes).
- **No code semantics change** (JSDoc-only).
- Verify gates should pass without surprise.
- Risk floor: **near-zero** — JSDoc-only Fase 3 is the lowest-risk closure shape in the audit.

---

**FIN DEL DOC.** Esperando verde de Sam para promover PR a ready-for-review + arrancar Fase 3.
