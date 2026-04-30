# Drift Fase 2 — B2-state: Entity collections shape policy

**Fecha:** 2026-04-30
**Eje:** B2-state — Entity collections shape (array vs Record vs EntityAdapter).
**Categoría inventario:** (b) decisión producto/arq.
**Estado:** PROPUESTA. Eje de política transversal — ratify status quo + criterion forward-only. Esperando review de Sam.

**Branch:** `drift/b2-state-entity-collections`.
**Cross-ref inventario:** `docs/reports/2026-04-28-drift-inventory-fase1.md` → B2-state.
**Cross-ref clasificación:** `docs/reports/2026-04-28-drift-fase2-classification.md` → eje (b).
**Cross-ref B10-state Par 1 (closed):** `docs/reports/2026-04-30-drift-fase2-b10state-par1-fabric-write-surfaces.md` — precedent del pattern source-of-truth + cache que B2-state generaliza.
**Cross-ref B4-state (closed):** ratificación de selectors export pattern (bomSlice) — precedent directo para Sub-decisión 3.5.

---

## Sección 1 — Decide / NO decide

### Decide en este eje

1. **Criterio operacional de shape para entity collections.** Cuándo usar `Entity[]`, `Record<id, attribute>`, `Record<key, value>` no-entity, o (potencial) EntityAdapter. Tabla con triggers explícitos.
2. **EntityAdapter adoption policy.** El codebase tiene **0 uso** de Redux Toolkit `createEntityAdapter`. La pregunta es: never, opt-in con triggers, o forward-only mandatory.
3. **Cross-slice references — cuándo son legítimas.** B10-state Par 1 ya ratificó el caso fabric (project source + sim cache). B2-state generaliza: bridge namespace vs denormalization smell, criterio reproducible.
4. **Selector helpers / lookup convention** (forward-only). 400 callsites de `.find(p => p.id === X)` son signal real de boilerplate repetido. La pregunta es si extender el precedent bomSlice (createSelector exports) a otros slices y bajo qué triggers — sin migrar retroactivamente.
5. **Migration policy:** ratify status quo (recomendado por el sweep). Migration solo cuando triggers de Sub-decisión 3.2 o 3.5 emergen para casos concretos.

### NO decide en este eje

1. **Migración retroactiva de los 400 `.find` callsites.** Out-of-scope. El convention forward-only + lint rule (follow-up issue) gradualmente los migra via opportunistic edits.
2. **Refactor de slices existentes con array shape.** El pattern actual es coherente; refactor sin trigger concreto de performance/maintainability es scope creep.
3. **Introducir EntityAdapter en slices existentes.** Even if Sub-decisión 3.2 recommends opt-in, la decisión de migrar slice X específico requiere su propio trigger evaluado per-case.
4. **Refactor de bomSlice selectors export.** Ya ratificado por B4-state. B2-state lo cita como precedent pero no re-litiga.
5. **`pieces[].fabricId` cross-slice pattern.** Ya ratificado por B10-state Par 1. B2-state cita como precedent en Sub-decisión 3.4 pero no re-decide.
6. **Performance optimization de hot paths.** El sweep verificó que no hay frame-loop bottlenecks con `.find` en entity collections. Performance tuning es scope distinto.

### Por qué importa la línea

Sin la convention explícita, la próxima collection nueva (e.g., un slice futuro de algún feature) se decide ad-hoc. La heterogeneidad observada (23 array entity + 15 Record + 0 EntityAdapter) es coherente pero implícita; documentarla previene drift futuro y guía decisiones forward-only.

---

## Sección 2 — Estado actual

### 2.1 Pre-existing canonical infrastructure (regla 1 v2)

- **No existe registry/manifest de entity collections.** Cada slice define su shape.
- **0 uso de Redux Toolkit EntityAdapter** (`grep "createEntityAdapter|EntityAdapter|entityAdapter"` → empty). Ninguna convention canonical existente para EntityAdapter.
- **bomSlice precedent (B4-state ratified):** único slice que exporta selectors via `createSelector`. Resto de slices usan `useSelector` inline. B4-state cerró este axis cosmético; B2-state lo cita como precedent para Sub-decisión 3.5.
- **B10-state Par 1 precedent:** ratificó separación entre array entity (project source-of-truth) y Record cache (sim transient). B2-state generaliza el pattern.

**Conclusión:** convention está implícita en el codebase, no formalizada. B2-state produce convention doc (no canonical pre-existente para esa función).

### 2.2 Inventario completo de entity collections

#### Array shape (entity source-of-truth) — 23 collections en 9 slices

| Slice | Collection | Comments |
|---|---|---|
| projectSlice | `pieces: PatternPiece[]` ★ | ≥25 readers, eje principal del project |
| projectSlice | `seams: Seam[]` | seams entre pieces |
| projectSlice | `pleats: Pleat[]` | pleats por piece |
| projectSlice | `elastics: Elastic[]` | elastics |
| projectSlice | `trims: Trim[]` | buttons, zippers, snaps, etc. |
| projectSlice | `fabrics: Fabric[]` | fabrics del project (distinct de PHYSICAL_FABRIC_LIBRARY) |
| projectSlice | `groups: PieceGroup[]` | named piece groups |
| projectSlice | `seamGroups: SeamGroup[]` | M:N seam groups |
| projectSlice | `poms: PointOfMeasure[]` | points of measure |
| projectSlice | `referenceImages: ReferenceImage[]` | referencia para tracing |
| projectSlice | `colorways: Colorway[]` | colorway palette |
| projectSlice | `loadDiagnostics: ValidationDiagnostic[]` | diagnostics del último loadProject |
| constructionSlice | `points: CPoint[]` | construction points (parametric) |
| constructionSlice | `lines: CLine[]` | construction lines |
| constructionSlice | `curves: CCurve[]` | construction curves |
| constructionSlice | `pieces: CPiece[]` | construction pieces (distinct de project pieces) |
| avatarSlice | `ikTargets: IKTarget[]` | inverse kinematics targets |
| avatarSlice | `avatarProfiles: AvatarProfile[]` | saved avatar profiles |
| collisionBodySlice | `bodies: CollisionBody[]` | meshes para collision (avatar + extras) |
| copilotUISlice | `toasts: CopilotToast[]` | UI toasts |
| bomSlice | `entries: BOMEntry[]` ★ | único con createSelector exports (B4-state) |
| inspectorSlice | `diagnostics: Diagnostic[]` | diagnostics del inspector |
| pluginSlice | `installedPlugins: PluginInfo[]` | plugins instalados |

**Total: 23 collections, todas array.** Lookup pattern dominante: `collection.find(x => x.id === id)`.

#### Record shape (per-entity attribute / cache / metadata) — 15 collections

| Slice | Collection | Tipo |
|---|---|---|
| simulationSlice | `pieceFabrics: Record<string, string>` | per-entity attribute (B10-state ratified) |
| simulationSlice | `pieceParticleDistance: Record<string, number>` | per-entity attribute |
| simulationSlice | `pieceTints: Record<string, string>` | per-entity attribute |
| simulationSlice | `pieceUVTransforms: Record<string, UVTransform>` | per-entity attribute |
| simulationSlice | `pieceOpacity: Record<string, number>` | per-entity attribute |
| simulationSlice | `pieceEmission: Record<string, EmissionData>` | per-entity attribute |
| simulationSlice | `pieceTextureOverrides: Record<string, TextureOverrides>` | per-entity attribute |
| simulationSlice | `pinnedVertices: Record<string, PinData>` | per-entity attribute |
| simulationSlice | `positions: Record<string, [number, number, number]>` | per-entity attribute |
| projectSlice | `arrangementOverrides: Record<string, [number, number, number]>` | per-entity attribute (cross-slice cache) |
| projectSlice | `layerNames: Record<number, string>` | metadata (key=layer number, no-entity) |
| projectSlice | `layerLocked: Record<number, boolean>` | metadata (key=layer number, no-entity) |
| gradingSlice | `quantities: Record<string, number>` | per-key metadata |
| gradingSlice | `generatedPieces: Record<string, string[]>` | per-size piece-id mapping |
| workflowSlice | `toolMemory: Record<string, Record<string, unknown>>` | per-tool config (key=tool id) |
| pluginSlice | `pluginErrors: Record<string, string>` | per-plugin error |

**Total: 15 Record collections.** Lookup pattern dominante: `record[id]` (O(1)).

#### EntityAdapter shape — 0 sites

Ningún slice usa `createEntityAdapter` ni el shape `{ ids: string[]; entities: Record<string, T> }`.

#### String array (IDs/identifiers, no entities) — 4 collections

`simulationSlice.hiddenPieceIds: string[]`, `toolSlice.recentTools: string[]`, `avatarSlice.availableMorphTargets: string[]`, `parametricSlice.generatedPieceIds: string[]`. **Out-of-scope** de B2-state — son referencias a entities en otros slices, no entities propias.

### 2.3 Pattern semántico observado

| Shape | Uso característico | Ejemplo |
|---|---|---|
| **Array `Entity[]`** | Entity source-of-truth con lifecycle, ordering, mutación rich (CRUD + reorder) | `project.pieces`, `construction.points` |
| **Record `<entityId, attribute>`** | Per-entity transient attribute / cache / override; sparse; lifecycle externo | `simulation.pieceFabrics`, `project.arrangementOverrides` |
| **Record `<key, value>` (no-entity key)** | App config / metadata; key es non-entity (layer number, tool id, size name) | `project.layerNames`, `workflow.toolMemory` |

**La separación array entity vs Record attribute es coherente y refleja semántica distinta — NO es drift.** B10-state Par 1 ya ratificó este pattern para el caso fabric. B2-state generaliza: el pattern es transversal.

### 2.4 Performance signals (verificación de hot paths)

#### 2.4.1 Conteo de `.find(p => p.id === X)`

**400 callsites totales:**
- src/components: 113
- src/store: 99
- src/copilot: 163

#### 2.4.2 Frame-loop verification

**Ningún `.find(p => p.id === X)` está dentro de `useFrame` o `requestAnimationFrame` loops.**

Frame loops localizados:
- `src/utils/cloth/gpu/gpuSolverClient.ts:734,768` — opera en `Float32Array` numéricos.
- `src/utils/cloth/neural/neuralDrapeClient.ts:300` — opera en `Float32Array` numéricos.
- `src/components/Viewport3D/PinRenderer.tsx:88` — useFrame sin `.find`.

Los frame loops NO operan sobre entity collections con `.find`. **O(n) por lookup NO es bottleneck en hot paths.**

#### 2.4.3 Hot path samples (post-action / setup, no frame)

- `Viewport3D/useMeshing.ts:83,152` — re-mesh on pieces change (1 lookup por trigger).
- `Viewport3D/Viewport3D.tsx:877` — context menu open (1 lookup por interaction).
- `Viewport3D/Sew3DTool.tsx:170-171` — sew tool action (2 lookups por sew).
- `Viewport3D/useCameraPresets.ts:96` — camera preset action (1 lookup por preset).
- `Viewport3D/ClothMesh.tsx:351` + `GarmentSimulation.tsx:476` — fabric library lookup en module-level array, NO entity slice.

**Performance argument para migrate es weak.** El boilerplate de los 400 sites es DRY signal, no performance signal.

### 2.5 Cross-slice patterns observados (3 casos)

1. **`pieces[].fabricId` (project) ↔ `pieceFabrics` (simulation).** Source-of-truth + transient cache. **Ratificado por B10-state Par 1.** Sync via `useColorwaySync`.
2. **`pieceIdentityMap` (constructionSlice).** Maps construction piece id → pattern piece id. **Bridge entre dos namespaces** (construction y project), NO duplicate. Caso legítimo distinto de denormalization.
3. **`generatedPieceIds` (parametric) referencia `project.pieces`.** Array de IDs como bridge — el parametric slice NO duplica las pieces, solo referencia.

**Sin nuevos casos de denormalization smell** detectados en sweep.

### 2.6 Module-level entity caches (4 sites, B6-state ratified context)

- `pluginRegistry.ts:435` — `_defaultPluginRegistry`.
- `pluginManager.ts:85` — `installedCache: InstalledPlugin[] | null` (B6-state ratified exception).
- `ollama.ts:60` — `ollamaConfigCache` (B6-state ratified exception).
- `tools/registry.ts:396` — `_defaultRegistry`.

**Out-of-scope** de B2-state — son singleton caches al nivel de módulo, no entity collections en Redux state.

---

## Sección 3 — Sub-decisiones, opciones y tradeoffs

Cuatro sub-decisiones (3.3 folded into 4): 3.1 (criterio shape, central), 3.2 (EntityAdapter adoption), 3.4 (cross-slice references), 3.5 (selector helpers forward-only).

### 3.1 Criterio operacional de shape

**Pregunta:** ¿bajo qué triggers se decide entre `Entity[]`, `Record<entityId, attribute>`, `Record<key, value>` no-entity, y EntityAdapter? Sin criterio explícito, la próxima collection nueva se decide ad-hoc; con criterio, la decisión es reproducible.

#### Opción 3.1.A — Criterio operacional con tabla de triggers (RECOMENDADA)

Documentar en CLAUDE.md una tabla operacional. Para cada nueva collection:

| Shape | Triggers (todos deben aplicar) | Ejemplos del codebase actual |
|---|---|---|
| **Array `Entity[]`** | Entity con lifecycle propio (CRUD + ordering importa) | `pieces`, `seams`, `points`, `bodies` (23 collections actuales) |
| **Record `<entityId, attribute>`** | Per-entity transient attribute + lifecycle externo (entity vive en otro array) + sparse (no todos los entities tienen el atributo) | `pieceFabrics`, `pieceTints`, `arrangementOverrides` (15 collections) |
| **Record `<key, value>` (no-entity)** | Key es non-entity (layer number, tool id, size name, plugin id) | `layerNames`, `layerLocked`, `toolMemory`, `pluginErrors` |
| **EntityAdapter** | Ver Sub-decisión 3.2 (opt-in con triggers concretos) | (0 actuales) |

**Test operacional para nuevas collections:** ¿la collection contiene entities con lifecycle (creación, mutación, deletion, ordering)?

- **Sí + ordering importa** → array.
- **Sí + ordering no importa + el lookup ratio es bajo (sparse access)** → array (default; no introducir Record solo por lookup speed).
- **No (es atributo sparse derivado de un entity en otro slice)** → Record `<entityId, attribute>`.
- **No (es config / metadata indexada por non-entity key)** → Record `<key, value>`.
- **Cualquiera de los anteriores + triggers de Sub-decisión 3.2** → considerar EntityAdapter.

##### Pros (3.1.A)

- Convention reproducible sin ambiguity. La tabla cubre los 3 shapes existentes + EntityAdapter como cuarta opción.
- 0 migration cost — las 38 collections actuales (23 array + 15 Record) ya cumplen el criterio.
- Discoverability: nueva collection → consultar tabla → decisión.

##### Cons

- "Ordering importa" puede ser ambiguo en bordes (e.g., una collection donde ordering es no-load-bearing pero conveniente). El criterio es orientativo, no greppable. Aceptable porque el código actual ratifica el patrón en 38/38 casos sin ambiguity observada.

##### Migration

Zero código. Sección CLAUDE.md ~80 líneas.

#### Opción 3.1.B — Convention implícita (status quo, no formalizar)

Dejar la convention implícita. Confiar en que un nuevo dev observe el pattern al leer slices existentes.

- **Pros:** zero docs.
- **Cons:** convention rot. La heterogeneidad observada (23 array + 15 Record) puede ser tomada como permission para shape ad-hoc. El boilerplate de 400 `.find` calls es síntoma de convention sin documentation que guíe alternativas.
- **Descartar.**

#### Opción 3.1.C — Single shape mandatorio (e.g., todo Record o todo array)

Forzar todas las collections a un único shape.

- **Pros:** uniformity.
- **Cons (primary):** la heterogeneidad observed es **intencional, no drift**. Array entity y Record attribute reflejan semántica distinta (lifecycle vs sparse cache). Forzar uno solo distorsiona la representación. Migration cost masivo (38 collections).
- **Descartar.**

#### Recomendación 3.1

**Opción 3.1.A.** Criterio operacional con tabla de triggers, documentado en CLAUDE.md. Las 38 collections actuales pasan el criterio; B2-state cementa convention sin migration.

---

### 3.2 EntityAdapter adoption policy

**Pregunta:** Redux Toolkit ofrece `createEntityAdapter` que devuelve shape canonical `{ ids: string[]; entities: Record<string, T> }` con CRUD reducers prefab. El codebase tiene 0 uso. ¿Adoptar nunca, opt-in con triggers, o forward-only mandatory?

#### Opción 3.2.A — Never (excluir explícitamente)

Documentar "no usar EntityAdapter". Mantener pattern actual array entity + Record attribute.

- **Pros:** simplicidad. Ningún slice tiene que aprender la API. Pattern actual es coherente.
- **Cons:** cierra preemptivamente una opción que puede ser útil para casos futuros (e.g., un slice nuevo con 1000+ entities y lookup ratio alto + ordering relevante).
- **Aceptable pero overly restrictive.**

#### Opción 3.2.B — Opt-in con triggers concretos (RECOMENDADA)

Documentar criterio: usar EntityAdapter SOLO cuando emergan **al menos dos** de los siguientes triggers:

1. **Size grande:** la collection típica tiene >500 entities en producción.
2. **Lookup ratio alto:** los lookups por id son >10× más frecuentes que iteraciones full-array.
3. **CRUD complejo:** la collection tiene operaciones add/update/remove/upsert frecuentes con lógica idéntica que se beneficia del prefab.
4. **Ordering importa pero no es trivial:** la collection necesita orden estable + lookup eficiente simultáneamente (el shape `{ ids[], entities{} }` da las dos).

Sin al menos 2 triggers, mantener pattern actual (array entity o Record attribute).

##### Pros

- Mantiene la opción abierta para casos genuinos.
- Triggers son verificables, no subjetivos.
- Forward-only — sin migration de slices existentes.

##### Cons

- "Lookup ratio alto" es difícil de medir empíricamente sin profiling. Aceptable como heurística + check post-hoc.

#### Opción 3.2.C — Forward-only mandatory (todas las nuevas collections usan EntityAdapter)

Cualquier slice nuevo MUST use EntityAdapter para entity collections.

- **Pros:** uniformity en código nuevo.
- **Cons (primary):** introduce overhead conceptual + API learning curve para casos donde array simple sería suficiente (e.g., un slice futuro con 5 entities). Convention demasiado rígida para benefit marginal.
- **Descartar.**

#### Recomendación 3.2

**Opción 3.2.B** — opt-in con triggers concretos. Las 23 collections array existentes NO migran. Slices nuevos consideran EntityAdapter cuando >=2 triggers aplican; de lo contrario default array.

---

### 3.4 Cross-slice references — bridge vs denormalization

**Pregunta:** ¿cuándo un slice puede referenciar entities de otro slice (cross-slice reference) vs cuándo es denormalization smell?

Casos observados:

1. **`pieces[].fabricId` (project) ↔ `pieceFabrics` (sim).** Source-of-truth + transient cache. Ratificado por B10-state Par 1 con sync hook explícito.
2. **`pieceIdentityMap` (constructionSlice).** Maps construction piece id → pattern piece id. Bridge entre dos namespaces (construction y project pieces).
3. **`generatedPieceIds` (parametric) referencia `project.pieces`.** Array de IDs como bridge — referencia, no duplicación.

#### Opción 3.4.A — Criterio operacional con clasificación bridge vs cache vs denormalization (RECOMENDADA)

Documentar 3 categorías legítimas:

- **Cross-slice cache:** atributo derivado del entity, vive en slice runtime/transient (sim, render). Source-of-truth en otro slice. Sync mechanism explícito (hook, middleware). **Ejemplo:** `pieceFabrics`. **Cuándo usar:** cuando el atributo es lifecycle distinto (transient, override-able) y el sync es bounded.
- **Cross-namespace bridge:** un slice mantiene mapping de IDs entre dos namespaces independientes (e.g., construction pieces ↔ project pieces). NO duplica entities; solo IDs. **Ejemplo:** `pieceIdentityMap`. **Cuándo usar:** cuando dos slices manejan entities semánticamente relacionadas pero con identity propia.
- **Cross-slice ID reference:** un slice mantiene array/Record de IDs que referencian entities en otro slice. Lookup vía selector cross-slice. **Ejemplo:** `parametric.generatedPieceIds`. **Cuándo usar:** cuando un subset de entities de otro slice tiene relevancia agrupada.

**Anti-pattern (denormalization sin coordinación):** un slice duplica fields de entities de otro slice sin sync mechanism o bridge claro. Ejemplo hipotético: si un slice futuro guardara `pieceNamesCache: Record<string, string>` paralelo a `project.pieces[].name` sin sync hook ni razón estructural — eso sería smell.

##### Pros

- Las 3 categorías cubren los 3 casos observados sin re-decisión.
- Anti-pattern explícito previene drift futuro.

##### Cons

- "Bridge legítimo" puede ser ambiguo en bordes. Aceptable porque los 3 casos actuales son claros y futuros casos pueden evaluarse contra la tabla.

#### Opción 3.4.B — No criterio (decisión per-case)

Cada nuevo cross-slice reference se decide caso por caso.

- **Pros:** flexibilidad.
- **Cons:** convention rot. Re-investigación en cada caso futuro.
- **Descartar.**

#### Recomendación 3.4

**Opción 3.4.A.** Documentar 3 categorías legítimas + anti-pattern. Los 3 casos observados quedan ratificados (cache, bridge, ID reference).

---

### 3.5 Selector helpers / lookup convention forward-only

**Pregunta:** 400 `.find(p => p.id === X)` callsites son boilerplate repetido. Convention forward-only para nuevos sites: ¿usar selectors exportados con `createSelector` (precedent bomSlice / B4-state) o ratificar inline `.find` como pattern actual?

#### Opción 3.5.A — Convention forward-only para nuevos sites (RECOMENDADA)

Documentar: slices con collections de tamaño relevante exportan selectors per-id usando `createSelector` (siguiendo precedent `bomSlice`). **Nuevos sites** usan el selector exportado en lugar de inline `.find()`. **Los 400 sites existentes NO se migran retroactivamente** — la migración es opt-in cuando un site se modifica por otra razón.

Ejemplo de selector per-slice:

```ts
// projectSlice.ts (forward-only example)
export const selectPieceById = createSelector(
  [(state: RootState) => state.project.pieces, (_state, id: string) => id],
  (pieces, id) => pieces.find(p => p.id === id)
);

// callsite (nuevo)
const piece = useSelector(s => selectPieceById(s, pieceId));
```

##### Pros

- DRY — el lookup pattern queda formalizado.
- Memoization via `createSelector` → re-renders óptimos.
- Precedent bomSlice / B4-state ratificado existe — extensión natural.
- Forward-only: zero migration cost para los 400 sites existentes.

##### Cons

- Discoverability: un dev escribiendo nuevo callsite puede no saber que el selector existe. Mitigación: lint rule (follow-up issue) advierte cuando `.find(p => p.id ===)` se usa donde existe selector.

##### Migration

Zero código en B2-state. Cada slice exporta su `selectXById` cuando el slice se modifica por otra razón (opportunistic). El first slice candidate es `projectSlice` (`pieces` con ≥25 readers) — pero NO en B2-state Fase 3.

##### Follow-up issue (severity:medium)

Custom eslint rule: warn cuando `.find(p => p.id === X)` se usa en callsite donde existe `selectXById` exportado por el slice correspondiente. Mirror semántico de #659 (@cascade lint) y #662 (fabric target slice lint). Severity:medium per nota tactical de B3-state.

#### Opción 3.5.B — Migrate los 400 sites en Fase 3 mass migration

Migrar todos los sites a selectors en una serie de commits.

- **Pros:** consistency inmediata.
- **Cons (primary):** scope creep masivo. 400 sites en components + store + copilot. Riesgo de regression alto sin tests E2E que cubran cada flow. Cost ~10-15h Fase 3 mínimo.
- **Cons (secondary):** los selectors per-slice no existen aún; introducirlos requiere decisión per-slice (cuáles exportar selectors). El work se balcaniza.
- **Descartar** — viola "ratify status quo + criterion forward-only" framing del eje.

#### Opción 3.5.C — Ratify inline `.find` como pattern (no introducir selectors)

Convention: usar inline `.find()` en todos los callsites, sin selectors.

- **Pros:** simplicidad. No abstraction overhead.
- **Cons:** ignora el precedent bomSlice ratificado por B4-state. La uniformidad imposed sería contra el codebase actual.
- **Descartar.**

#### Recomendación 3.5

**Opción 3.5.A** — convention forward-only + lint rule follow-up issue.

**Tradeoff aceptado:** el eje cierra con 400 sites pre-existentes intactos. La convention vive en CLAUDE.md y se enforce gradualmente vía lint warning (follow-up issue) + nuevos sites usando selectors. Migration es opportunistic, no mandate.

---

### Tabla resumen Sec 3

| Sub-decisión | Recomendación | Migration cost |
|---|---|---|
| 3.1 Criterio shape | **3.1.A** — tabla operacional con triggers | 0 código, ~80 líneas CLAUDE.md |
| 3.2 EntityAdapter adoption | **3.2.B** — opt-in con triggers (>=2 de size/lookup/CRUD/ordering) | 0 código, ~30 líneas CLAUDE.md |
| 3.4 Cross-slice references | **3.4.A** — 3 categorías legítimas + anti-pattern | 0 código, ~50 líneas CLAUDE.md |
| 3.5 Selector helpers | **3.5.A** — forward-only convention + lint follow-up | 0 código, ~40 líneas CLAUDE.md + 1 issue |

**Total migration:** 0 código, ~200 líneas CLAUDE.md, 1 follow-up issue. **Zero behavior change.** B2-state cementa convention transversal sin tocar slices existentes.

[Sec 4-9 pendientes — incremental push.]

