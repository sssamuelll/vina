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

[Sec 3-9 pendientes — incremental push.]
