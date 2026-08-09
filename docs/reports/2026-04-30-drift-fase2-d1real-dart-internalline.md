# Drift Fase 2 — D1-real: `Dart` entity vs `InternalLine{type:'dart'}`

**Fecha:** 2026-04-30
**Eje:** D1-real — Dart entity (`src/types/types.ts:148`) vs InternalLine{type:'dart'} (`src/types/types.ts:183`).
**Categoría inventario:** (b) decisión producto/arq.
**Estado:** PROPUESTA. Ratify dual representation con bridge module legítimo. Cero refactor de código. Esperando review de Sam.

**Branch:** `drift/d1-real-dart-internalline`.
**Cross-ref inventario:** `docs/reports/2026-04-28-drift-inventory-fase1.md` → D1-real (caracterización original "migración incompleta", reformulada por sweep).
**Cross-ref D7 (closed):** precedent del shape "ratify by lifecycle/role ortogonal + JSDoc cross-ref + CLAUDE.md section".
**Cross-ref D5 (closed):** precedent del shape "ratify by feature ownership + remove doc-drift".
**Cross-ref B10-state Par 2 (closed):** precedent del shape "misclassification por inventario reformulada por git blame intent".

---

> ### ⚠️ Enmienda 2026-08-09 (#1016) — disparó el reopen trigger § 7.1
>
> El trigger 1 (**"un consumer muta `piece.darts` sin re-syncear `piece.internals`"**) se cumplió: aparecieron **dos** consumers así — `transferDart` (`patternOps.ts`) y el tool `adjustDartIntake` (`dartTools.ts`). Ambos movían la pinza en el estado de dominio y el lienzo 2D seguía dibujándola donde estaba, porque el render lee **solo** `piece.internals` (`PieceRenderer.tsx:209`). El copilot reportaba el cambio, María no lo veía.
>
> La afirmación de **§ 2.6** — *"0 dual maintenance accidental observado"* — era cierta al escribir el RFC y dejó de serlo. Queda corregida acá; el texto original se conserva como registro.
>
> **La decisión 3.1.A (dual representation con bridge) se mantiene.** Reabierta y re-evaluada, no revocada: matar `piece.darts` (variante de 3.1.B) sigue costando lo que decía el RFC —`slashAndSpread.ts` produce `Dart[]` como salida real de una transformación geométrica, y `patternRules.ts` / `getPieceDetails.ts` / `uiStateTools.ts` lo leen. La causa del bug no era la dualidad; era que **el bridge no tenía vuelta**. Dos enmiendas cierran eso:
>
> - **Espacio de ids unificado.** `extractDartFromInternal` devuelve `id: line.id` en vez de acuñar un UUID (`dartEntity.ts:88` en la versión vieja). El `Dart` es la vista rica *de una línea concreta*, y ese puntero de vuelta es lo que hace posible escribir el cambio. Efecto lateral buscado: `listDarts` ahora devuelve ids que `segmentDart` y `shapeDartCap` aceptan — las dos mitades de la familia de tools hablaban espacios de ids distintos.
> - **Escritura de vuelta obligatoria.** Nuevo export del bridge `applyDartsToInternals(piece, darts)`, inverso de `extractDarts`. **Toda op que actualice `piece.darts` tiene que pasar el resultado por ahí**; si no, es un no-op visible. `Dart.capShape` se hidrata desde `line.dartOptions?.capShape` para que la vuelta no aplane una punta curva a pico.
>
> El diagrama de **§ 2.6** queda con la flecha de vuelta completa (antes solo `segmentDart` volvía al almacenamiento, y emitiendo líneas nuevas, no actualizando las existentes).
>
> **Límite honesto:** un proyecto viejo con `piece.darts` persistido de antes de la unificación tiene ids que no matchean sus líneas; la primera op sobre él borra esas líneas y las re-crea con el id del dart. La geometría queda igual salvo la punta. No se migró: `piece.darts` solo lo poblaban los tools del copilot, que hasta #1009 eran no-ops.
>
> **Fuera de alcance, sigue abierto:** `patternRules.ts:168/185/207/505` lee `piece.darts` sin el fallback `?? extractDarts(piece)` que usan los tools, así que esas 4 reglas del validador no disparan nunca en piezas dibujadas o importadas. Es el mismo síntoma de "cache opcional tratado como fuente de verdad", pero tocarlo cambia el comportamiento del validador para todo proyecto existente — issue aparte.

---

## Sección 1 — Decide / NO decide

### Decide en este eje

1. **Clasificación final:** `Dart` entity y `InternalLine{type:'dart'}` **NO son drift de migración incompleta**. Son representations ortogonales con bridge module documentado:
   - `InternalLine{type:'dart'}` = storage primitive (path flat).
   - `Dart` entity = rich domain view (intake, apex, legs, foldDirection, capShape).
   - `dartEntity.ts` = bridge module concentrating bidirectional conversion + domain operations.
2. **Cierre:** ratify dual representation con docs anchoring.
3. **Documentation:** JSDoc en cada type explicitando rol + cross-ref al otro + section CLAUDE.md "Dart representation" + JSDoc reforzado en `dartEntity.ts` module header.

### NO decide en este eje

1. **Unificación de los 2 representations.** Descartado por análisis Sec 3.1 (kill cualquiera = pérdida material de expressiveness).
2. **Refactor de `dartEntity.ts` bridge module.** El bridge concentra correctamente conversion + domain ops. Sin cambio.
3. **Refactor de `slashAndSpread.ts`** ni otros consumers de `Dart[]`. Mantienen su shape — `Dart` entity es la representation correcta para domain operations geométricas.
4. **Otros 6 InternalLineType variants** (grainline, notch, fold, pleat, topstitch, reference). Out-of-scope; cada uno tiene shape única para su tipo (e.g., `GrainLine` separate type, `NotchOptions`, etc.). D1-real solo discute el variant `'dart'`.
5. **Migration del entity counter** (`piece.darts` populated via `extractDarts(piece)` lazy vs eagerly cached). Out-of-scope; el actual lazy pattern (`piece.darts ?? extractDarts(piece)` en consumers como `dartTools.ts:31, 73`) es trade-off accepted.
6. **Performance optimization** (memoization de `extractDarts`). Out-of-scope; no hot-path bottleneck reportado.

### Por qué importa la línea

Sin la ratification explícita, alguien que vea `piece.internals[i].type === 'dart'` Y `piece.darts[i]` puede asumir migration intent y proponer unify. El git blame revela que es enrichment intencional desde commit `433f8399` (#75 "Rich Dart Entity — structured dart data on PatternPiece"). Documentar previene re-investigation y unify intent erróneo.

---

## Sección 2 — Estado actual

### 2.1 Pre-existing canonical infrastructure (regla 1 v2)

- **No hay registry/manifest** que enumere los 7 InternalLineType variants con sus rich domain views.
- **`dartEntity.ts` ES el bridge module canonical** para Dart specifically. Header dice "Rich Dart Entity — extract, manipulate, and reason about darts. Converts flat InternalLine dart paths into structured Dart entities".
- **Otros InternalLineType variants** tienen rich type separate (e.g., `GrainLine` interface en `types.ts:171`) pero NO tienen bridge module dedicated equivalente a `dartEntity.ts`. **Out-of-scope** de D1-real.

**Conclusión:** convention está parcialmente formalizada (Dart específicamente). D1-real ratifica el shape para Dart + documenta para discoverability. No expande a otros variants.

### 2.2 Shapes verificados

#### `Dart` entity (`src/types/types.ts:148`)

```ts
/** A dart with full geometric and semantic data */
export interface Dart {
  id: string;
  /** Intake (width absorbed) in mm */
  intake: number;
  /** Apex point (dart vertex) */
  apex: Point2D;
  /** Two dart legs: arrays of points from edge to apex */
  legs: [Point2D[], Point2D[]];
  /** Which SemanticEdge the dart sits on */
  edgeId?: string;
  /** Fold direction */
  foldDirection: 'left' | 'right' | 'toward-center';
  /** Dart depth (length from edge to apex) in mm */
  depth?: number;
  /** Cap shape at the apex */
  capShape?: DartCapShape;
}
```

#### `InternalLineType` (`src/types/types.ts:183`)

```ts
export type InternalLineType = 'dart' | 'grainline' | 'notch' | 'fold' | 'pleat' | 'topstitch' | 'reference';
```

`InternalLine` interface (genérica para los 7 variants) — campo principal `path: PathCommand[]`. La `'dart'` variant carga el path flat sin metadata de intake/apex/legs.

### 2.3 Diferencias estructurales

| Eje | Dart entity | InternalLine{type:'dart'} |
|---|---|---|
| **Shape** | Rich semantic (`intake`, `apex`, `legs[2]`, `foldDirection`, `depth?`, `capShape?`) | Generic flat (`path: PathCommand[]`) |
| **Lifecycle** | Domain view derivable lazy via `extractDarts(piece)` | Storage primitive persisted with project |
| **Persistence** | Optional cache (`pieces[].darts?: Dart[]`) | Required (part de `pieces[].internals: InternalLine[]`) |
| **Operations supported** | Domain ops: `adjustDartIntake`, `segmentDart`, `shapeDartCap`, geometric `slashAndSpread` rotations/translations/splits | Generic: render via `path`, DXF export, mirror sync |
| **Capture power** | Captures dart-specific concepts (legs as point arrays, foldDirection, capShape) | Cannot capture without lossy reconstruction |

### 2.4 Origen y motivación (git blame)

| Type | Commit | Motivación |
|---|---|---|
| `InternalLineType = 'dart' | ...'` | `3671de9d` v0.1.0 init | Storage representation desde el principio. Discriminated union para 7 internal line types. |
| `Dart` interface + `pieces[].darts` + `dartEntity.ts` | `433f8399` "feat(#75): **Rich Dart Entity — structured dart data on PatternPiece**" | **Enrichment** del storage primitive. Commit message keyword: "structured dart data" = rich view ON TOP of flat storage. |
| `segmentDart`, `shapeDartCap` ops | `678c7498` "feat: **dart enhancements** — segment darts & shape dart cap (#366)" | **Pattern de enrichment continúa** post-#75. No deprecation, no migration commit. |

**Conclusión git blame:** la inventario malclasificó como "migración incompleta". El commit message de #75 es load-bearing — **enrichment intent**, no migration intent.

### 2.5 Consumers (sweep refresh 2026-04-30)

#### Consumers de `Dart` entity / `pieces[].darts` (rich domain layer)

| Consumer | Site | Operación |
|---|---|---|
| `copilot/action/tools/definitions/dartTools.ts` | 4 copilot tools | `getDarts`, `adjustDartIntake`, `extractDarts`, `segmentDart` |
| `utils/dartEntity.ts` | módulo bridge | `extractDartFromInternal`, `extractDarts`, `adjustDartIntake`, `segmentDart`, `shapeDartCap` |
| `utils/patternOps.ts:37, 194, 405, 929` | piece transformations | clone/merge/split preserve `piece.darts`; `relocateDart` muta piece.darts en transformation immutable |
| `utils/geometry/slashAndSpread.ts` | 8+ functions | `Dart[]` rotations, translations, splits (transformaciones geométricas) |
| `copilot/reasoning/bridge/meta-tools/types.ts:107` | copilot view | `darts: Array<{id, position}>` |

#### Consumers de `InternalLine{type:'dart'}` (storage primitive)

| Consumer | Site | Operación |
|---|---|---|
| `copilot/action/tools/definitions/internalTools.ts:117` | copilot tool | `addInternalLine` con `type: 'dart'` |
| `utils/dartEntity.ts:226` | bridge module | `segmentDart` escribe N nuevos InternalLines |
| `utils/dxf/converter.ts:434` | DXF import | Importar dart paths como InternalLine{type:'dart'} |
| `store/linkedEditingMiddleware.ts:193` | mirror sync | Mirror linked piece dart paths |
| `components/PatternEditor/renderers/PieceRenderer.tsx:267` | render | Color `#ff9800` para dart lines en 2D |

### 2.6 Bridge module — `dartEntity.ts`

`src/utils/dartEntity.ts` concentra el bridge bidirectional + domain operations:

```
InternalLine{type:'dart'}                   Dart entity
        │                                        │
        │  extractDartFromInternal(line)         │
        ├──────────────────────────────────────►│
        │  extractDarts(piece)                   │  domain ops:
        │                                        │   - adjustDartIntake(d, deltaMm)
        │                                        │   - shapeDartCap(d, capShape)
        │                                        │
        │              ◄────────────────────────┤  segmentDart() emits N
        │                                        │  new InternalLine{type:'dart'}
```

**0 dual maintenance accidental observado:** los únicos archivos using both son `types.ts` (define ambos) y `dartEntity.ts` (bridge by design). Ningún consumer mantiene los dos lados manualmente — los consumers leen UN lado (storage o domain) y delegan al bridge para conversion.

### 2.7 Tests asserting cada lado

**Bridge module:** `src/utils/__tests__/dartEntity.test.ts` (dedicated, asserta conversion correctness).

**Storage tests** (assert `InternalLine{type:'dart'}`):
- `__tests__/protocol.test.ts:19, 70` (project state shape).
- `copilot/__tests__/proactiveAnalysis.test.ts:97-125` (`auditDartAlignment` reads `piece.internals`).

**Domain tests** (assert `Dart` entity / domain ops):
- `copilot/__tests__/teachingContext.test.ts:58` (`addDart` snippet).
- `copilot/__tests__/bodiceSkill.test.ts:80-89` (bust/waist dart semantic computation usa `intake`, `depth` concepts).

**Tests separan correctamente los 2 roles.** No hay tests que assert "los dos deben unificarse" ni "uno es legacy del otro".

### 2.8 Pattern semántico — Pattern 2 (dual representation legítimo)

```
storage layer (persisted):
  pieces[].internals  ←  InternalLine[] (7 types via discriminated union)
                          │
                          │  (variant 'dart' specifically)
                          ▼
                          dartEntity.extractDartFromInternal()
                          dartEntity.extractDarts(piece)
                          ▼
domain layer (computed):
  pieces[].darts?     ←  Dart[] (rich semantic structure)
                          │
                          │  domain ops mutate/regenerate
                          │  via dartEntity helpers
                          ▼
                          dartEntity.segmentDart() / shapeDartCap()
                          ▼
                          new InternalLine{type:'dart'} (back to storage)
```

**El dual representation NO es drift** — es enrichment pattern intencional con bridge module concentrado. La caracterización "migración incompleta" del inventario es misclassification.

---

## Sección 3 — Sub-decisiones, opciones y tradeoffs

Tres sub-decisiones: 3.1 (representation policy, central), 3.2 (documentation strategy), 3.3 (bridge module discoverability).

### 3.1 Representation policy

**Pregunta:** ¿unificar a un single representation, o ratify dual con bridge module?

#### Opción 3.1.A — Ratify dual representation con bridge module (RECOMENDADA)

`InternalLine{type:'dart'}` y `Dart` entity coexisten as-is. `dartEntity.ts` queda como bridge module canonical. Documentar via JSDoc + CLAUDE.md.

- **Pros:**
  - Preserva semantics distintas: storage flat (path) + domain rich (intake/apex/legs/foldDirection/capShape).
  - Zero refactor.
  - Bridge module ya concentra conversion bi-direccional + domain ops.
  - Consistency con git blame intent ("Rich Dart Entity — structured dart data" = enrichment, no migration).
- **Cons:** discoverability de "cuándo usar cada uno" requiere docs explícitas (Sec 3.2 cubre).
- **Migration:** 0 código + JSDoc + CLAUDE.md.

#### Opción 3.1.B — Kill `Dart` entity (forzar todas las ops a `InternalLine`)

Eliminar `pieces[].darts`, `interface Dart`, y `dartEntity.ts` rich operations. Forzar todos los domain ops a operar directamente sobre `InternalLine{type:'dart'}`.

- **Pros:** single representation simplifica mental model.
- **Cons (primary):** **pérdida material de semantics.** `path: PathCommand[]` NO captura `intake`, `apex`, `legs[2]`, `foldDirection`, `capShape`. Domain ops como `adjustDartIntake`, `shapeDartCap`, `segmentDart` tendrían que **re-derivar esos concepts cada call** desde el path. Performance regression + complexity regression — cada operación recomputes structure que el Dart entity ya tiene cached.
- **Cons (secondary):** rewrite de `slashAndSpread.ts` (8+ funciones que toman `Dart[]`), `dartTools.ts` (4 copilot tools), `patternOps.ts` (preservar darts en transformations), `meta-tools/types.ts:107`. ~7+ archivos refactor.
- **Cons (tertiary):** invalida tests del bridge module (`dartEntity.test.ts`) + tests domain (`bodiceSkill.test.ts`). Re-write semantic-bearing tests.
- **Descartar:** pérdida material de expressiveness sin gain.

#### Opción 3.1.C — Kill `InternalLine{type:'dart'}` (forzar storage en `Dart` shape)

Eliminar `'dart'` del `InternalLineType` union. Forzar storage de darts directamente en `pieces[].darts: Dart[]`.

- **Pros:** rich shape persistido directamente.
- **Cons (primary):** **rompe consistency con los 6 otros internal types** (grainline, notch, fold, pleat, topstitch, reference) que viven en `pieces[].internals`. `Dart` shape NO es genérico — `intake`/`apex` no aplica a grainline (que usa `direction` + `angle`) ni a notch (que usa `shape`/`subType`/`length`/`width`/`angle`). Forzar todos al `Dart` shape sería distorsión inversa de B.
- **Cons (secondary):** DXF import (`converter.ts:434`), storage layer persistence, render layer (`PieceRenderer.tsx:267`) todos cambian.
- **Cons (tertiary):** **rompe el patrón de `InternalLineType` discriminated union** que ya es canonical para 6 types. La consistency del storage shape sería sacrificada.
- **Descartar:** rompe el patrón consolidado.

#### Recomendación 3.1

**Opción 3.1.A** con confianza alta. Razones (en orden de importancia):

1. **Git blame intent confirma enrichment**, no migration (commit `433f8399` "Rich Dart Entity — structured dart data" + subsequent `678c7498` "dart enhancements").
2. **0 dual maintenance accidental** — bridge module `dartEntity.ts` concentra conversion correctly. Solo 2 archivos using both, ambos esperables.
3. **Shapes son estructuralmente ortogonales** — `path: PathCommand[]` no captura semantic info que `Dart` requiere. Pérdida en B inviable.
4. **InternalLineType discriminated union es canonical** para los otros 6 types. Romper en C destruiría consistency.
5. **Tests separan correctamente** — domain tests assert Dart, storage tests assert InternalLine. No hay test pressure for unify.

**Tradeoff aceptado:** discoverability depende de docs (Sec 3.2). Sin lint rule que enforce "use Dart entity for domain ops, InternalLine for storage" — pero el bridge module concentration mitigates.

---

### 3.2 Documentation strategy

**Pregunta:** ¿cómo documentar el dual representation + bridge module para que futuros devs no asuman unify intent?

#### Opción 3.2.A — JSDoc en cada type + CLAUDE.md section + bridge module header reforzado (RECOMENDADA)

Combina:

1. **JSDoc en `Dart` interface** (`types.ts:148`) explicitando role + cross-ref a `InternalLine{type:'dart'}` + bridge module:

   ```ts
   /**
    * Rich domain view of a dart, derived from `InternalLine{type:'dart'}`.
    *
    * Storage layer uses `InternalLine{type:'dart'}` (path data only) in
    * `pieces[].internals`. This Dart entity captures dart-specific semantics
    * (intake, apex, legs, foldDirection, capShape) for domain operations.
    *
    * Convert via `extractDartFromInternal` / `extractDarts` from
    * `src/utils/dartEntity.ts`. See CLAUDE.md "Dart representation".
    */
   export interface Dart { ... }
   ```

2. **JSDoc en `InternalLineType`** (`types.ts:183`) clarificando the `'dart'` variant:

   ```ts
   /**
    * Discriminated union for internal line types. The 'dart' variant
    * is the **storage shape**; rich domain view is `Dart` entity
    * (`src/types/types.ts:148`). See bridge module
    * `src/utils/dartEntity.ts` for conversion. Other variants have
    * their own rich types (e.g., `GrainLine`) or are storage-only.
    */
   export type InternalLineType = ...
   ```

3. **JSDoc reforzado en `dartEntity.ts` module header** explicit "bridge module" status (already present per current header; refinar para cross-ref D1-real doc).

4. **Sección CLAUDE.md "Dart representation (D1-real ratified)"** con:
   - Diagrama storage layer ↔ bridge ↔ domain layer.
   - 4 categorías de consumers (operations/copilot tools/geometry/DXF&render).
   - Decision rule: "cuándo usar Dart entity vs InternalLine{type:'dart'}".
   - Reopen triggers.

##### Pros (3.2.A)

- Discoverability multi-nivel: JSDoc cerca del código (para edits), CLAUDE.md como índice (para onboarding).
- Bridge module status explicit en header → un dev tocando dartEntity.ts ve immediately el role.
- Zero código modification — solo doc anchors.

##### Cons

- Triple-write si la decisión cambia (JSDoc × 2-3 + CLAUDE.md). Mitigado: pattern enrichment es estable post-#75 + #366.

#### Opción 3.2.B — Solo JSDoc, sin CLAUDE.md

Solo doc-comments en types + bridge module. CLAUDE.md no tiene sección dedicada.

- **Pros:** single source of truth (los archivos).
- **Cons:** discoverability initial requiere conocer los archivos. Nuevo dev haciendo onboarding puede no saber dónde buscar.
- **Descartar** (consistente con D7 mismo razonamiento).

#### Opción 3.2.C — Solo CLAUDE.md, sin JSDoc

Solo sección CLAUDE.md, sin comentarios en types/bridge.

- **Pros:** un solo lugar para mantener.
- **Cons:** dev editando los types no ve la convention sin abrir CLAUDE.md.
- **Descartar** (consistente con D7).

#### Recomendación 3.2

**Opción 3.2.A.** Mismo shape que D7 — JSDoc autoritativo + CLAUDE.md índice + bridge module header.

---

### 3.3 Bridge module discoverability

**Pregunta:** ¿mantener `dartEntity.ts` como bridge concentrado, o distribuir operations?

#### Opción 3.3.A — Mantener `dartEntity.ts` concentrated + JSDoc explicit (RECOMENDADA)

Status quo: todas las domain ops + bridge functions viven en `dartEntity.ts`. Header doc-comment refuerza "bridge module" status.

- **Pros:** cohesion alta. Un dev buscando "cómo trabajo con darts a nivel domain" tiene un único archivo. Single source of truth.
- **Cons:** archivo crece con cada nueva operation (segmentDart fue añadida en #366). Pero scope bounded — domain ops para Dart son finitas.

#### Opción 3.3.B — Distribuir operations across multiple files

Ej: `dartExtraction.ts`, `dartTransformations.ts`, `dartGeometry.ts`.

- **Pros:** archivos más chicos.
- **Cons:** **cohesion lost.** Un dev tiene que conocer 3+ archivos para domain ops de Dart. Discoverability worse.
- **Descartar.**

#### Recomendación 3.3

**Opción 3.3.A.** Status quo + header reforzado.

---

### Tabla resumen Sec 3

| Sub-decisión | Recomendación | Migration cost |
|---|---|---|
| 3.1 Representation policy | **3.1.A** — Ratify dual con bridge | 0 código |
| 3.2 Documentation | **3.2.A** — JSDoc × 2-3 + CLAUDE.md section | 0 código + ~12-15 líneas JSDoc + ~30-40 líneas CLAUDE.md |
| 3.3 Bridge discoverability | **3.3.A** — Mantener `dartEntity.ts` concentrated + header refuerzo | 0 código |

**Total migration:** 0 código + ~45-55 líneas docs + 0 follow-up issue. **Zero behavior change.** D1-real cementa convention via documentation only.

---

## Sección 4 — Recomendación consolidada

Si Sam aprueba 3.1.A + 3.2.A + 3.3.A, los cambios resultantes son:

| # | Cambio | Archivo | Tipo |
|---|---|---|---|
| 1 | JSDoc en `Dart` interface (rol + cross-ref + bridge ref) | `src/types/types.ts:148` | docs (~7 líneas) |
| 2 | JSDoc en `InternalLineType` (clarificar `'dart'` variant + cross-ref) | `src/types/types.ts:183` | docs (~5 líneas) |
| 3 | JSDoc reforzado en `dartEntity.ts` module header (bridge module status + cross-ref D1-real doc) | `src/utils/dartEntity.ts:1-9` | docs (~3-5 líneas added/refined) |
| 4 | Section CLAUDE.md "Dart representation (D1-real ratified)" | `CLAUDE.md` | docs (~30-40 líneas) |

Sin issue follow-up (lint rule custom para "use Dart entity for domain ops" queda como reopen trigger condicional, no action item inmediato).

---

## Sección 5 — Plan de migración Fase 3

**Nota:** Fase 3 mínima.

### 5.1 Commit 1 — JSDoc en types + bridge module

Atomic commit tocando 2 archivos:
- `src/types/types.ts` — JSDoc en `Dart` interface (líneas ~148) + JSDoc en `InternalLineType` (líneas ~183).
- `src/utils/dartEntity.ts` — refinar header doc-comment (bridge module status explicit + cross-ref D1-real doc).

Total ~12-15 líneas docs. Tests verdes (zero behavior change).

### 5.2 Commit 2 — CLAUDE.md anchoring

Sección "Dart representation (D1-real ratified)" agregada a CLAUDE.md. ~30-40 líneas.

Contenido:
- Diagrama storage ↔ bridge ↔ domain.
- 4 categorías de consumers (operations/copilot tools/geometry/DXF&render).
- Decision rule: cuándo usar cada uno.
- Cross-ref a archivos + a este doc.
- Reopen triggers.

### 5.3 No otros commits ni follow-up issues

D1-real cierra completo con los 2 commits.

---

## Sección 6 — Cross-refs y dependencias

### 6.1 Inputs

- `docs/reports/2026-04-28-drift-inventory-fase1.md` § D1-real (caracterización original "migración incompleta", reformulada).
- `docs/reports/2026-04-28-drift-fase2-classification.md` (eje (b)).
- D7 ratificación (PR #665 merged) — precedent del shape "ratify by lifecycle ortogonal + JSDoc cross-ref + CLAUDE.md section".
- D5 ratificación (PR #666 merged) — precedent del shape "ratify by feature ownership".
- B10-state Par 2 ratificación (PR #660 merged) — precedent del shape "misclassification por inventario reformulada por git blame intent".
- Git history: commits `3671de9d` (InternalLineType v0.1.0), `433f8399` (#75 Rich Dart Entity), `678c7498` (#366 dart enhancements).
- `src/types/types.ts:148` (Dart interface).
- `src/types/types.ts:183` (InternalLineType).
- `src/utils/dartEntity.ts` (bridge module).

### 6.2 Outputs

- **Si aprobado:** Fase 3 (~45-55 líneas docs + 0 código).
- **D1-real cerrado:** ratification con docs anchoring. Sin follow-up issue.
- **Décima ratify-by-convention del audit** (C7, B12, B5, D1-cosmetic, B6 partial, B10-Par2, B2, D7, D5, D1-real).

### 6.3 No-conflicts (out-of-scope verificado)

- **Subsystem dart operations** sigue funcionando como hoy. Sin refactor.
- **Other 6 InternalLineType variants** no afectados — D1-real solo discute `'dart'` variant.
- **Bridge module `dartEntity.ts`** mantiene shape concentrated.
- **Tests** mantienen separation correcta (storage assertions vs domain assertions).

### 6.4 Co-existence con ejes abiertos

- **D6 (3 fabric types)** — eje similar shape (rich vs flat) pero distinto domain. D6 puede beneficiar de D1-real precedent si la estructura es comparable. Cross-ref desde D6 doc cuando se redacte.
- **A3 (cross-boundary errors Rust↔JS)** — no relacionado.
- **D3, D4** — no relacionados.

---

## Sección 7 — Reopen triggers

D1-real ratificación queda revisable si emerge:

1. **Dual maintenance accidental detectado:** un consumer muta `piece.darts` directamente sin re-syncear `piece.internals` (o vice versa) sin pasar por bridge module. Eso indicaría que el dual representation está siendo usado incorrectly como "duplicate state". Reabrir 3.1 evaluando si bridge module está siendo bypass.
2. **Tercer dart-like representation emerges** (e.g., un copilot tool que define su propio `DartView` interface). Reabrir 3.1 evaluando si N=3 justifica unify.
3. **Bridge module se bypassea sistemáticamente** — consumers que prefer mutar storage primitive skipping `dartEntity.ts`. Reabrir 3.3 evaluando refactor o lint enforcement.
4. **Dart entity adopted como storage primitive** (e.g., `pieces[].darts: Dart[]` se vuelve required, no optional cache). Reabrir 3.1 evaluando si InternalLine{type:'dart'} se puede deprecar safely.
5. **Domain operations de otros InternalLineType variants** emergen (ej. `pleatEntity.ts`, `notchEntity.ts`). Reabrir 3.0 (out-of-scope hoy) evaluando si patrón debe generalizarse a otros variants.

---

## Sección 8 — Deuda técnica explícita post-ratificación

1. **Bridge module sin lint enforcement.** Convention vive en CLAUDE.md + JSDoc. Si emerge un dev que escribe domain op skipping `dartEntity.ts`, depende de review humano. Mitigado: bridge module concentration es structural enforcer (las domain ops viven solo ahí).

2. **Otros 6 InternalLineType variants sin bridge module dedicated.** `GrainLine` interface existe pero no hay `grainLineEntity.ts` con domain ops. Notch, fold, pleat, topstitch, reference no tienen rich type ni bridge. **No es deuda real** — esos variants son storage-only por design (no requieren rich domain operations equivalentes a Dart's intake/segment/cap). Mention para completitud.

3. **`pieces[].darts` opcional cache vs eagerly populated.** Currently consumers usan pattern lazy `piece.darts ?? extractDarts(piece)`. Memoization sería opt para hot paths si se reportan. **No es deuda real** — la lazy pattern es correct trade-off (compute only when needed). Out-of-scope D1-real.

4. **`patternOps.ts:405` mutation de `result.darts`.** Verified inside transformation function (`relocateDart`) que produce new piece immutable. NO es dual maintenance. Mention para clarity.

5. **Documentation triple-write riesgo (JSDoc × 3 + CLAUDE.md).** Si la decisión cambia (e.g., reopen trigger fires), 4 lugares a sincronizar. Mitigado por estabilidad del enrichment pattern (commits desde 2024 sin reversals).

---

## Sección 9 — Decisión pendiente y siguiente paso

### 9.1 Pregunta a Sam

¿Aprobás las 3 sub-decisiones tal como recomendado en Sec 3 (3.1.A + 3.2.A + 3.3.A)?

Si **sí, todo aprobado:**
- Marco PR ready-for-review.
- Sec 4-9 quedan como ratificación final.
- Fase 3 (2 commits: JSDoc en types + bridge + CLAUDE.md section) sobre este branch.
- Inventory annotation post-merge.
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

- Estimate Fase 2 doc: ~3-4h. Actual: ~2.5h.
- **Factor ~0.6-0.8x del estimate.** Causa: scope chico + sweep refresh ya pre-cerró space de decisión + git blame revelando enrichment intent eliminó ambiguity.
- **Total esperado Fase 3 (no en este PR):** ~30min para JSDoc + CLAUDE.md.

---

**FIN DEL DOC.** Esperando verde de Sam para promover PR a ready-for-review + arrancar Fase 3.
