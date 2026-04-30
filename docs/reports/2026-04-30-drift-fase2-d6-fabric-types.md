# Drift Fase 2 — D6: Fabric tipos x3 (`Fabric` / `FabricMaterial` / `PhysicalFabric`)

**Fecha:** 2026-04-30
**Eje:** D6 — 3 fabric types coexisting con declared deprecation intent + dead bridge.
**Categoría inventario:** (b) decisión producto/arq.
**Estado:** PROPUESTA. Hybrid scope: ratify 3 ortogonales + cleanup doc-drift + remove dead bridge. Esperando review de Sam.

**Branch:** `drift/d6-fabric-types`.
**Cross-ref inventario:** `docs/reports/2026-04-28-drift-inventory-fase1.md` → D6.
**Cross-ref D7 (closed):** precedent del shape "ratify by lifecycle ortogonal + JSDoc cross-ref + CLAUDE.md section".
**Cross-ref D1-real (closed):** precedent del shape "git blame keywords distinguish migration vs enrichment intent".
**Cross-ref D5 (closed):** precedent del shape "remove doc-drift sin reemplazo".

---

## Sección 1 — Decide / NO decide

### Decide en este eje

1. **Three-type relationship clasificada como 3 roles ortogonales** (NO migration incompleta):
   - `Fabric` (project) — persistent catalog entry. Project state, save/load, BOM, DXF.
   - `FabricMaterial` (basic shape API surface) — public API for plugins + simple copilot tools. In-memory `FABRIC_LIBRARY` registry.
   - `PhysicalFabric` (rich engineering) — engineering-grade parameters for sim, diagnostic, render, modern copilot tools.
2. **Cleanup de doc-drift en `physicalFabric.ts:8`** — el header dice "FabricMaterial remains for backward compatibility / professional-grade version" framing, pero la realidad observable es que `FabricMaterial` NO es deprecating — sirve un rol distinto (basic API surface for plugins). Reframe.
3. **Remove dead bridge `toBasicMaterial`** (`physicalFabric.ts:616`) — 0 runtime callsites externos. Tests unitarios del propio bridge se removerán también (no son runtime usage del bridge en consumers reales).
4. **Documentation strategy:** JSDoc en cada uno de los 3 types + sección CLAUDE.md "Fabric type 3-tier API surface".

### NO decide en este eje

1. **Migration de FabricMaterial consumers a PhysicalFabric.** Out-of-scope. `FabricMaterial` tiene rol legítimo (basic public API surface for plugins); migrate sería API breakage.
2. **Refactor de `FABRIC_LIBRARY` o `PHYSICAL_FABRIC_LIBRARY`.** Las 2 libraries coexisten con consumers distintos. Sin cambio.
3. **Plugin API breakage** (`PluginFabric.material: FabricMaterial`). Mantenido as-is.
4. **Refactor de `Fabric` (project)** ni su consumers (BOM, DXF, project save/load). Out-of-scope.
5. **Recreate cross-cutting bridge** entre los 3 types. Si emerge necesidad real futura, se diseña on-demand con caso de uso concreto.
6. **Migration de tests** del bridge `toBasicMaterial` que se removerán — NO son tests de migration coverage; son tests del bridge function mismo. Removidos junto con la function (Fase 3 Commit 1).

### Por qué importa la línea

Sin la ratification explícita, alguien que vea el header `physicalFabric.ts:8` ("backward compatibility") + el bridge function `toBasicMaterial` puede asumir que FabricMaterial está being deprecated y proponer migrate los 5 callsites. La realidad es que los 3 types tienen roles distintos — el "deprecation intent" del header es doc-drift que nunca se ejecutó porque la realidad descubrió que FabricMaterial tiene niche role legítimo (plugin API surface).

---

## Sección 2 — Estado actual

### 2.1 Pre-existing canonical infrastructure (regla 1 v2)

- **No existe registry/manifest** que enumere los 3 fabric types con sus roles.
- **No hay JSDoc cross-ref** entre los 3 types.
- **`physicalFabric.ts:8` header sí documenta relationship** pero el framing es **doc-drift** ("backward compatibility" implica deprecation que NO se ejecutó).
- **Bridge function `toBasicMaterial`** declarado en `physicalFabric.ts:616` para "backward compatibility" — 0 runtime callsites externos.

**Conclusión:** convention está implícita en el codebase (3 ortogonal roles) pero documentation actual es engañosa. D6 produce ratification doc + cleanup de doc-drift + remove dead bridge.

### 2.2 Shapes verificados

#### `Fabric` (project) — `src/types/types.ts:415`

```ts
export interface Fabric {
  id: string;
  name: string;
  /** Color or texture URL */
  color: string;
  textureUrl?: string;
  /** Physical properties for cloth sim */
  weight: number;       // g/m²
  stretch: number;      // 0-1 (0 = no stretch, 1 = full stretch)
  stiffness: number;    // 0-1 (0 = silk, 1 = denim)
  friction: number;     // 0-1
}
```

Lifecycle: persisted en `pieces[].fabrics[]` como project state. Used by save/load, BOM, DXF.

#### `FabricMaterial` (basic API surface) — `src/utils/cloth/fabricLibrary.ts:15`

```ts
export interface FabricMaterial {
  name: string;
  weight: number;          // GSM
  stretchStiffness: number;
  bendStiffness: number;
  friction: number;
  thickness: number;
  color?: string;
  roughness?: number;
}
```

Lifecycle: in-memory `FABRIC_LIBRARY` registry. Used by simulation tools (copilot) and plugin system as public API contract.

#### `PhysicalFabric` (rich engineering) — `src/utils/cloth/physicalFabric.ts:33`

```ts
export interface PhysicalFabric {
  id, name, nameEs, composition, weaveType,
  weight, thickness,
  // Stretch (anisotropic)
  stretchWarp, stretchWeft, stretchBias, recoveryRate,
  // Bending
  bendingWarp, bendingWeft, drapeCoefficient,
  // Shear
  shearStiffness, shearHysteresis,
  // Surface
  friction, frictionBody, internalDamping, surfaceRoughness,
  // Strength
  tensileStrengthWarp, tensileStrengthWeft, tearStrength, maxStretchBeforeBreak,
  // Metadata
  source, supplier?, articleNumber?, notes?, tags,
  textures?,
}
```

Lifecycle: `PHYSICAL_FABRIC_LIBRARY` (32 fabrics). Used by sim solver, diagnostic, render, modern copilot tools, validation. **60 callsites total — primary modern type.**

### 2.3 Diferencias estructurales (3 ejes ortogonales)

| Eje | Fabric (project) | FabricMaterial (basic) | PhysicalFabric (rich) |
|---|---|---|---|
| **Lifecycle** | Persisted con project | In-memory registry (FABRIC_LIBRARY) | In-memory registry (PHYSICAL_FABRIC_LIBRARY) |
| **Persistence** | yes (project save) | no (rebuilt on load) | no (rebuilt on load) |
| **Rich vs basic** | Basic with `color`/`textureUrl` for project | Basic 8 fields (sim params) | Rich 25+ fields (engineering) |
| **Primary consumers** | Save/load, BOM, DXF | Plugins, simulationTools (copilot) | Sim solver, diagnostic, render, modern copilot tools |
| **Persistence shape** | `pieces[].fabrics[]: Fabric[]` | n/a (in-memory) | n/a (in-memory) |
| **Anisotropic data** | no | no | yes (warp/weft/bias) |

**Conclusión:** los 3 types son **ortogonales por lifecycle + role**. NO son same entity con N representations.

### 2.4 Origen y motivación (git blame)

| Type | Commit | Keywords |
|---|---|---|
| `Fabric` (project) | predates physical fabric work | (older, basic project type) |
| `FabricMaterial` | `915ca32b` "feat(#115): Materials & Fabric **visual system** — Phase 1" | enrichment-leaning ("visual system") |
| `PhysicalFabric` | `0387ac84` "feat: physical fabric library — 32 real-world textiles with **engineering properties**" | enrichment ("engineering properties") |

**Pero header de `physicalFabric.ts:8` declara framing distinto:**

> "The basic FabricMaterial in fabricLibrary.ts **remains for backward compatibility**. PhysicalFabric is the **professional-grade version** used by the diagnostic system."

**Caveat critical:**

- Commit messages de los 2 types newer (FabricMaterial + PhysicalFabric) tienen keywords enrichment.
- Header doc del `physicalFabric.ts` declara migration intent ("backward compatibility").
- Bridge function `toBasicMaterial` exists para soportar dicha migration.
- **Pero verification de consumers revela:** bridge tiene 0 runtime callsites externos. Migration NO se ejecutó.

Aplicando meta-anchor regla 1 (CLAUDE.md "Inventory drift overestimation pattern") + sub-rule emergente (commits enrichment vs header migration intent contradiction): el sweep debe profundizar consumer count.

### 2.5 Consumers count + bridge usage

#### `Fabric` (project): ~11 callsites

- `types.ts:542` (`projectState.fabrics: Fabric[]`).
- `projectSlice.ts:165, 185, 1294, 1297` (defaultFabric, state field, addFabric, updateFabric).
- `formats/zprjExport.ts:11`, `zprjImport.ts:15, 133` (project save/load).
- `export/bomExtractor.ts:160, 364` (BOM generation).

**Distinct lifecycle:** persistent project metadata.

#### `FabricMaterial` (basic API surface): ~15 sites total, 5 active externos

- **Definition + helpers:** `fabricLibrary.ts:15` + `FABRIC_LIBRARY` registry + helpers (`fabricToCompliance`, `getFabricById`, `isValidFabricMaterial`).
- **Plugin system (2 sites):** `copilot/plugins/types.ts:13, 92` — `PluginFabric.material: FabricMaterial` (public API contract for plugin authors); `copilot/plugins/pluginLoader.ts:131, 209` (validates plugin fabric structure).
- **Copilot simulationTools (3 sites):** `simulationTools.ts:28, 55, 94` — uses `FABRIC_LIBRARY` for fabric lookup in simulation tool definitions.
- **Internal:** `physicalFabric.ts:14` (import for bridge function), `cloth/index.ts:42` (re-export).

**Niche role:** basic shape API surface for plugins + simple copilot tools that don't need engineering-grade fields.

#### `PhysicalFabric` (rich): **60 callsites** (most active)

- Definition + 32-fabric library + helpers (getPhysicalFabric, search, filter by weave/weight, etc.).
- `projectValidator.ts:70` — fabric ID validation.
- `copilot/action/tools/definitions/fabricTools.ts` — multiple (search, get details, compare, apply fabric).
- `components/PropertiesPanel/MaterialTab.tsx`, `Sidebar/SimulationView.tsx` — UI fabric pickers.
- `components/Viewport3D/Viewport3D.tsx`, `ClothMesh.tsx`, `GarmentSimulation.tsx` — 3D render.
- `utils/cloth/clothWorker.ts`, `wasmSolverClient.ts` — sim solver.
- Plus ~30+ more sites en diagnostic system, BOM, render.

**Primary modern type:** dominant in all sim, render, diagnostic, and modern copilot paths.

#### Bridge function `toBasicMaterial`

- **Definition:** `physicalFabric.ts:616` — `toBasicMaterial(pf: PhysicalFabric): FabricMaterial`.
- **Runtime callsites externos: 0.**
- **Test files:** 2 (`physicalFabric.test.ts` + `physicalFabricEdgeCases.test.ts`). Tests del bridge function mismo (3+ test cases each). NOT migration coverage tests; son unit tests del bridge.

**Conclusión:** dead code from external usage perspective. Tests son self-referential — testean la function que nadie usa.

### 2.6 Tests asserting cada lado

- **Bridge tests:** `physicalFabric.test.ts:154-178` (4 test cases) + `physicalFabricEdgeCases.test.ts:87-` (edge cases). Removidos junto con la function en Fase 3 Commit 1.
- **PhysicalFabric library tests:** `physicalFabric.test.ts` (otros tests no relacionados al bridge — preserved).
- **FabricMaterial validation tests:** existen (verifican `isValidFabricMaterial`).
- **Fabric (project) tests:** dispersos en project state tests.

### 2.7 Pattern semántico — Pattern 2 hybrid (3 ortogonal roles + cleanup)

Los 3 types son ortogonales por lifecycle + role + consumer audience. NO es migration incompleta — es **3-tier API surface** que el inventario malclasificó como "drift real" porque la documentación interna ("backward compatibility" header) sugería deprecation que NO se ejecutó.

**3-tier API surface:**

```
┌─ Project layer (persisted) ──────────────────┐
│  Fabric (types.ts:415)                       │
│  - 11 callsites: save/load, BOM, DXF         │
│  - Project catalog with color/texture        │
└──────────────────────────────────────────────┘

┌─ Basic API surface (in-memory) ──────────────┐
│  FabricMaterial (fabricLibrary.ts:15)        │
│  - 5 active externos: plugins, simTools      │
│  - Public API for plugin authors             │
│  - 8 fields, simple shape                    │
└──────────────────────────────────────────────┘

┌─ Rich engineering (in-memory, primary) ──────┐
│  PhysicalFabric (physicalFabric.ts:33)       │
│  - 60 callsites: sim, diagnostic, render     │
│  - Modern primary type                       │
│  - 25+ fields, anisotropic, full metadata    │
└──────────────────────────────────────────────┘

(Dead bridge: toBasicMaterial — 0 runtime callsites)
```

---

## Sección 3 — Sub-decisiones, opciones y tradeoffs

Tres sub-decisiones: 3.1 (three-type relationship, central), 3.2 (documentation strategy), 3.3 (dead bridge handling).

### 3.1 Three-type relationship

**Pregunta:** ¿unificar los 3 types via migration, ratify 3 ortogonales as-is, o ratify + cleanup doc-drift?

#### Opción 3.1.A — Ratify 3 ortogonales sin cleanup

Mantener los 3 types as-is. Mantener el header doc-drift (`"backward compatibility"`) y el dead bridge `toBasicMaterial` por si emerge necesidad futura.

- **Pros:** zero refactor incluso minimal.
- **Cons (primary):** **doc-drift persistente.** El header sigue sugiriendo deprecation que nunca ocurre. Futuros sweeps re-investigarán el mismo intent question.
- **Cons (secondary):** dead code (bridge) confunde signal de "qué es active vs deprecated".
- **Descartar.**

#### Opción 3.1.B — Kill `FabricMaterial` (Pattern 1, migrate consumers)

Migrate los 5 active externos (3 simulationTools + 2 pluginLoader) a `PhysicalFabric`. Delete `FabricMaterial`, `fabricLibrary.ts` registry, bridge function.

- **Pros:** single fabric type post-migration (excluding `Fabric` project).
- **Cons (primary):** **API breakage para plugin system.** `PluginFabric.material: FabricMaterial` es contract público — plugin authors esperan basic shape (8 fields). Migrar a `PhysicalFabric` obliga a plugin authors a proveer 25+ engineering fields (composition, weaveType, anisotropic stretch warp/weft/bias, recoveryRate, drapeCoefficient, shearStiffness/hysteresis, tensileStrengthWarp/Weft, tearStrength, maxStretchBeforeBreak, source, tags) que no necesitan ni saben.
- **Cons (secondary):** simulationTools simples también pierden conveniencia. Los 3 sites usan `FABRIC_LIBRARY` para basic lookup; migrate fuerza a usar `PHYSICAL_FABRIC_LIBRARY` con shape pesado.
- **Cons (tertiary):** ROI negativo — 5 callsites migrate vs decenas de plugin authors futuros confundidos por richness inecesaria.
- **Descartar:** API breakage para plugins + ROI negativo.

#### Opción 3.1.C — Hybrid: ratify 3 ortogonales + cleanup (RECOMENDADA)

Ratify los 3 types como roles distintos:
- `Fabric` (project) → persistent catalog entry.
- `FabricMaterial` (basic API surface) → **redefinido como public API for plugins + simple consumers**, NO como "backward compatibility legacy".
- `PhysicalFabric` (rich) → primary modern type.

Cleanup:
- **Remove header doc-drift** en `physicalFabric.ts:8`. Reframe sin "backward compatibility" framing.
- **Remove dead bridge `toBasicMaterial`** (`physicalFabric.ts:613-616`) + sus 2 test files (no son migration coverage).
- **JSDoc en cada type** explicitando rol + cross-ref a los otros 2.
- **CLAUDE.md sección "Fabric type 3-tier API surface"** documentando los 3 layers.

##### Pros (3.1.C)

- Refleja la realidad observable: 60/15/11 callsites distribuidos en 3 lifecycles distintos.
- Cleanup de doc-drift previene re-investigation futura.
- Dead code removal mejora signal/noise del codebase.
- Plugin API contract preserved.
- Cost mínimo: ~50 líneas de docs + ~30 líneas de bridge + tests removed.

##### Cons

- Si en el futuro emerge necesidad real cross-cutting (PhysicalFabric → basic shape), el bridge debe recrearse. Aceptable porque (i) recreate trivial; (ii) cost de mantener dead code > cost de recreate cuando se necesite.

##### Migration

0 runtime behavior change. ~50 líneas docs (JSDoc + CLAUDE.md) + ~30 líneas bridge function deleted + ~80 líneas test sections deleted.

#### Recomendación 3.1

**Opción 3.1.C** con confianza alta. Razones (en orden de importancia):

1. **`FabricMaterial` tiene rol legítimo niche (basic API surface for plugins).** Las 5 sites externos no son legacy holdouts — son consumers correctos del basic shape.
2. **Plugin API contract preserved** (3.1.B sería breakage public API).
3. **Doc-drift cleanup** previene re-investigation futura por el shape "deprecation intent declarado pero NO ejecutado".
4. **Dead code removal** mejora codebase clarity.
5. **3-tier API surface** es framing reproducible — la decisión de cuándo usar cuál depende del consumer audience (project save vs plugin author vs modern sim path).

**Tradeoff aceptado:** si emerge necesidad cross-cutting bridge futura, recreate trivialmente. Esa es la única deuda real.

---

### 3.2 Documentation strategy

**Pregunta:** ¿cómo documentar los 3 roles + relationship para que futuros devs no asuman migration intent?

#### Opción 3.2.A — JSDoc en cada type + CLAUDE.md section + remove doc-drift (RECOMENDADA)

Combina:

1. **JSDoc en `Fabric` (types.ts:415)** explicitando rol + cross-ref:

   ```ts
   /**
    * Project fabric catalog entry — persistent project state.
    *
    * Stored in `pieces[].fabrics[]`. Used by save/load, BOM, DXF export.
    * For sim engineering parameters, see `PhysicalFabric` (`src/utils/cloth/physicalFabric.ts`).
    * For plugin/copilot basic shape, see `FabricMaterial` (`src/utils/cloth/fabricLibrary.ts`).
    *
    * Cross-ref: D6 ratification doc, CLAUDE.md "Fabric type 3-tier API surface".
    */
   export interface Fabric { ... }
   ```

2. **JSDoc en `FabricMaterial` (fabricLibrary.ts:15)** redefinido sin "backward compatibility":

   ```ts
   /**
    * Basic fabric shape — public API surface for plugins + simple consumers.
    *
    * Used by:
    * - Plugin system (`PluginFabric.material`) — contract for plugin authors.
    * - Copilot `simulationTools` for simple fabric lookup via `FABRIC_LIBRARY`.
    *
    * For modern sim/render/diagnostic paths, see `PhysicalFabric`
    * (`src/utils/cloth/physicalFabric.ts`). Not a deprecating legacy —
    * intentionally kept as the basic shape that plugin authors can supply.
    *
    * Cross-ref: D6 ratification doc, CLAUDE.md "Fabric type 3-tier API surface".
    */
   export interface FabricMaterial { ... }
   ```

3. **JSDoc en `PhysicalFabric` (physicalFabric.ts:33)** + **header reframed** (remove "backward compatibility" framing):

   ```ts
   // (header reframed)
   /**
    * Physical Fabric Library — engineering-grade textile properties.
    *
    * Anisotropic warp/weft data, shear, tensile strength, composition metadata.
    * Used as the primary fabric type for sim solver, diagnostic, render,
    * and modern copilot tools. The basic `FabricMaterial` (fabricLibrary.ts)
    * remains as a separate, more public API surface for plugin authors —
    * not a deprecating legacy.
    *
    * @module physicalFabric
    */

   /**
    * Engineering-grade fabric properties for cloth simulation, diagnostic,
    * and render. Primary modern type (~60 callsites).
    *
    * For plugin/copilot basic shape, see `FabricMaterial`. For project
    * catalog entries, see `Fabric` (`src/types/types.ts`).
    *
    * Cross-ref: D6 ratification doc, CLAUDE.md "Fabric type 3-tier API surface".
    */
   export interface PhysicalFabric { ... }
   ```

4. **Sección CLAUDE.md "Fabric type 3-tier API surface (D6 ratified)"** con diagrama de 3 layers + decision rule.

##### Pros

- Discoverability multi-nivel.
- **Doc-drift fix:** remove "backward compatibility" framing aclara que NO es deprecation.
- Cross-refs explícitos previenen re-investigation.

##### Cons

- Triple-write si la decisión cambia (JSDoc × 3 + header + CLAUDE.md). Mitigado: 3-tier framing es estable post-D6.

#### Opción 3.2.B — Solo JSDoc, sin remove doc-drift

JSDoc ratifica los 3 roles pero mantiene "backward compatibility" framing en header.

- **Cons:** doc-drift persistente. Re-investigation futura inevitable.
- **Descartar.**

#### Recomendación 3.2

**Opción 3.2.A.** Standard shape (D7 + D1-real precedent) + remove doc-drift en `physicalFabric.ts:8` header.

---

### 3.3 Dead bridge `toBasicMaterial` handling

**Pregunta:** ¿remove dead bridge function o keep for future use?

#### Opción 3.3.A — Remove dead bridge (RECOMENDADA)

Delete `physicalFabric.ts:613-616` (`toBasicMaterial` function + comment header). Delete sus tests en `physicalFabric.test.ts:154-178` + `physicalFabricEdgeCases.test.ts:87-` (4+ test cases removidos).

##### Pros

- 0 runtime callsites externos. Dead code from consumer perspective.
- Tests son self-referential — testean function que nadie usa.
- Signal noise reduction.
- Si emerge necesidad real futura, recreate trivialmente con use case concreto.

##### Cons

- Si en el futuro alguien necesita PhysicalFabric → FabricMaterial conversion, debe recrearla. Aceptable per Sec 3.1.C tradeoff.

##### Migration

~30 líneas function deleted + ~80 líneas tests deleted. Verify post-delete: `git grep toBasicMaterial` retorna 0 (incluyendo tests).

#### Opción 3.3.B — Keep bridge but document como "available for future use"

- **Pros:** disponibilidad futura sin re-implementation.
- **Cons (primary):** **dead code que invita re-discovery + maintenance overhead** (tests must keep passing). Confunde signal de "qué es active". Anti-pattern: "no se debe mantener código por si acaso".
- **Descartar.**

#### Opción 3.3.C — Keep bridge AND implement actual usage

Out-of-scope. No hay use case concreto que justifique implementarla.

- **Descartar.**

#### Recomendación 3.3

**Opción 3.3.A.** Remove dead bridge + tests.

**Verification post-delete (Fase 3 Commit 1):** `git grep toBasicMaterial` debe retornar 0. Si revela callsite escondido (dynamic import, string-based reference), STOP — significa que el bridge tiene usage no-greppable y la decisión 3.3 cambia.

---

### Tabla resumen Sec 3

| Sub-decisión | Recomendación | Migration cost |
|---|---|---|
| 3.1 Three-type relationship | **3.1.C** — Ratify 3 ortogonales + cleanup | ~30 líneas bridge deleted + ~80 líneas tests deleted |
| 3.2 Documentation | **3.2.A** — JSDoc × 3 + header reframed + CLAUDE.md | ~50 líneas docs |
| 3.3 Dead bridge | **3.3.A** — Remove (0 runtime callsites) | (incluido en 3.1) |

**Total migration:** ~110 líneas code/tests deleted + ~50 líneas docs added. Net ~-60 líneas. Zero runtime behavior change.

---

## Sección 4 — Recomendación consolidada

Si Sam aprueba 3.1.C + 3.2.A + 3.3.A, los 4 cambios resultantes son:

| # | Cambio | Archivo | Tipo |
|---|---|---|---|
| 1 | Remove `toBasicMaterial` function + tests | `src/utils/cloth/physicalFabric.ts:613-616` + `__tests__/physicalFabric.test.ts:154-178` + `__tests__/physicalFabricEdgeCases.test.ts:87-` | code (~110 líneas deleted) |
| 2 | Reframe header `physicalFabric.ts:8` (remove "backward compatibility" framing) | `src/utils/cloth/physicalFabric.ts:1-12` | docs |
| 3 | JSDoc en 3 types (Fabric + FabricMaterial + PhysicalFabric) | `types.ts:415`, `fabricLibrary.ts:15`, `physicalFabric.ts:33` | docs (~25 líneas) |
| 4 | Section CLAUDE.md "Fabric type 3-tier API surface (D6 ratified)" | `CLAUDE.md` | docs (~40 líneas) |

Sin issue follow-up.

---

## Sección 5 — Plan de migración Fase 3

### 5.1 Commit 1 — Remove dead bridge + tests

Atomic commit:
- Delete `toBasicMaterial` function (`physicalFabric.ts:613-616` ~30 líneas).
- Delete test sections (`physicalFabric.test.ts:154-178` describe block + `physicalFabricEdgeCases.test.ts:87-` describe block).

**Verification post-delete:**

```bash
git grep toBasicMaterial
# Expected: 0 results
```

Si revela callsite escondido (dynamic import, string-based reference): STOP, reabrir 3.3.

Type check + tests verdes (los tests removidos no son referenciados desde otro lado).

### 5.2 Commit 2 — Doc-drift fix en header `physicalFabric.ts:8`

Atomic commit. Reframe header:

**Antes:**

```ts
/**
 * Physical Fabric Library — real-world textile properties with engineering units.
 *
 * This extends the basic FabricMaterial with anisotropic properties (warp/weft),
 * shear data, tensile strength, and composition metadata. Values are sourced from
 * textile engineering literature (Kawabata KES, FAST system, ISO standards).
 *
 * The basic FabricMaterial in fabricLibrary.ts remains for backward compatibility.
 * PhysicalFabric is the professional-grade version used by the diagnostic system.
 *
 * @module physicalFabric
 */
```

**Después:**

```ts
/**
 * Physical Fabric Library — engineering-grade textile properties.
 *
 * Anisotropic warp/weft data, shear, tensile strength, composition metadata.
 * Used as the primary fabric type for sim solver, diagnostic, render, and
 * modern copilot tools (~60 callsites).
 *
 * The basic `FabricMaterial` in fabricLibrary.ts remains as a separate, more
 * public API surface for plugin authors and simple copilot tools — NOT a
 * deprecating legacy. The two types serve distinct consumer audiences.
 *
 * Values sourced from textile engineering literature (Kawabata KES, FAST
 * system, ISO standards).
 *
 * Cross-ref: D6 ratification doc, CLAUDE.md "Fabric type 3-tier API surface".
 *
 * @module physicalFabric
 */
```

### 5.3 Commit 3 — JSDoc en 3 types

Atomic commit tocando 3 archivos:
- `types.ts:415` — JSDoc en `Fabric` interface.
- `fabricLibrary.ts:15` — JSDoc en `FabricMaterial` interface (redefinido sin "backward compatibility").
- `physicalFabric.ts:33` — JSDoc en `PhysicalFabric` interface.

Total ~25 líneas docs.

### 5.4 Commit 4 — CLAUDE.md anchoring

Section "Fabric type 3-tier API surface (D6 ratified)" agregada a CLAUDE.md. ~40 líneas.

Contenido:
- ASCII diagram 3 layers (Project / Basic API / Rich engineering).
- Decision rule table: cuándo usar cuál.
- Cross-ref a archivos + a este doc.
- Reopen triggers.

### 5.5 No otros commits

Sin follow-up issue. Sin lint rule (FabricMaterial role es discoverable via JSDoc + CLAUDE.md; no enforcement automation needed).

---

## Sección 6 — Cross-refs y dependencias

### 6.1 Inputs

- `docs/reports/2026-04-28-drift-inventory-fase1.md` § D6 (caracterización original "3 fabric types coexisting, drift real").
- `docs/reports/2026-04-28-drift-fase2-classification.md` (eje (b)).
- D7 ratificación (PR #665 merged) — precedent del shape ratify-by-convention.
- D1-real ratificación (PR #667 merged) — precedent del shape git blame keywords + bridge module.
- D5 ratificación (PR #666 merged) — precedent del shape "remove doc-drift sin reemplazo".
- Meta-anchor "Inventory drift overestimation pattern" (commit `95b2e2de`) — precedent compounded.
- Git history: `915ca32b` (FabricMaterial Phase 1), `0387ac84` (PhysicalFabric library).
- `src/types/types.ts:415` (Fabric).
- `src/utils/cloth/fabricLibrary.ts:15` (FabricMaterial).
- `src/utils/cloth/physicalFabric.ts:33, 613-616` (PhysicalFabric + dead bridge).

### 6.2 Outputs

- **Si aprobado:** Fase 3 (4 commits: bridge removal + header reframe + JSDoc + CLAUDE.md). 0 runtime change.
- **D6 cerrado:** ratification + cleanup. Sin follow-up issue.
- **Décima primera ratify-by-convention del audit** (C7, B12, B5, D1-cosmetic, B6 partial, B10-Par2, B2, D7, D5, D1-real, D6).
- **Sub-cláusula meta-anchor** post-cierre: "declared deprecation intent + bridge unused → hybrid scope" anchored como sub-rule de la regla 1 v3 del meta-anchor.

### 6.3 No-conflicts (out-of-scope verificado)

- **Plugin API** (`PluginFabric.material: FabricMaterial`) preserved. Sin breakage.
- **Project lifecycle** (`Fabric` save/load + BOM + DXF) sin cambio.
- **Sim solver** (`PhysicalFabric` consumers) sin cambio.
- **Other CLAUDE.md sections** no afectadas.

---

## Sección 7 — Reopen triggers

D6 ratificación queda revisable si emerge:

1. **Plugin author reporta** que basic `FabricMaterial` shape es insuficiente para su use case y necesita rich `PhysicalFabric` fields. Reabrir 3.1 evaluando si Plugin API debe upgrade a richer shape.
2. **simulationTools migra a PhysicalFabric** orgánicamente (e.g., como part de feature work). Eso reduce active externos de FabricMaterial a 2 (solo plugin system). Reabrir 3.1 si plugin system también migra: legacy candidate.
3. **Bridge function emerge necesidad real** (caso concreto donde PhysicalFabric → FabricMaterial conversion sea needed). Recreate `toBasicMaterial` con caso de uso documentado; reabrir 3.3.
4. **Cross-cutting consumer emerge** que necesita ambos PhysicalFabric AND FabricMaterial coordinated. Reabrir 3.1 evaluando bridge module pattern (similar a `dartEntity.ts` para D1-real).
5. **`Fabric` (project) merge con un de los otros** — e.g., decisión de embed PhysicalFabric en project state. Reabrir 3.1 con scope ampliado.

---

## Sección 8 — Deuda técnica explícita post-ratificación

1. **Fabric (project) tiene `weight/stretch/stiffness/friction` overlap con FabricMaterial.** El `Fabric` project shape tiene 4 fields de sim parameters que duplican FabricMaterial. **No es deuda crítica** — los `Fabric` field son project-level summary; consumers reales (sim, diagnostic) usan `PhysicalFabric` via fabric ID lookup. Mention para clarity.

2. **Header `physicalFabric.ts:8`** dice "used by **the diagnostic system**" pero PhysicalFabric se usa en 60 sites total (sim, diagnostic, render, BOM, copilot tools). Sub-fix incluido en Commit 2 (header reframed).

3. **Dead bridge tests** se removerán junto con la function. NO son tests de migration coverage; son unit tests del bridge function mismo. Mention para clarity en commit message.

4. **No lint rule** que prevent un dev de import `FabricMaterial` en context donde `PhysicalFabric` es appropriate. Discoverability depende de JSDoc + CLAUDE.md. Aceptable porque (i) los 5 active externos son site-specific (plugins + simulationTools); (ii) plugin API contract es explicitly basic shape.

5. **Documentation triple-write riesgo** (JSDoc × 3 + header + CLAUDE.md). Si la decisión cambia, 5 lugares a sincronizar. Mitigado por estabilidad del 3-tier framing.

---

## Sección 9 — Decisión pendiente y siguiente paso

### 9.1 Pregunta a Sam

¿Aprobás las 3 sub-decisiones tal como recomendado en Sec 3 (3.1.C + 3.2.A + 3.3.A)?

Si **sí, todo aprobado:**
- Marco PR ready-for-review.
- Sec 4-9 quedan como ratificación final.
- Fase 3 (4 commits: bridge removal + header reframe + JSDoc + CLAUDE.md) sobre este branch.
- Inventory annotation post-merge.
- Sub-cláusula meta-anchor post-cierre (commit aparte).
- Sin follow-up issue.

Si **alguna sub-decisión querés cambiar:**
- Indicame cuál (3.1, 3.2, 3.3) y qué opción preferís.

Si **el scope del eje cambia:**
- STOP. Reabro Sec 1.

### 9.2 Estado del PR

- Sec 1-9 ✅ ready.
- PR draft pending creation.
- Pendiente Fase 3 commits.

### 9.3 Calibración estimate vs actual

- Estimate (per Sam post-sweep refresh): ~4-5h Fase 2 doc + ~1h Fase 3.
- Actual Fase 2: ~3h (factor ~0.6-0.75x).
- **Total Fase 2: ~3h vs estimate 4-5h.** Causa: hybrid scope clarificó rápido + 3 sub-decisiones (vs anticipadas más complejas) + meta-anchor pre-anclado redujo tiempo de framing.
- **Total esperado Fase 3:** ~1h (4 commits atómicos).

---

**FIN DEL DOC.** Esperando verde de Sam para promover PR a ready-for-review + arrancar Fase 3.
