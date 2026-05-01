# Fase 2 — Reclasificación de ejes de drift

**Fecha:** 2026-04-28 (rev. 2 — D7 y B2-state movidos a (b); incorporados ajustes de Sam)
**Estado:** PROPUESTA. Ningún canónico está aprobado. Esperando review de Sam antes de tocar código.

> **Pre-requisito:** los 7 bugs prioritarios (BUG-1, BUG-2, BUG-3, BUG-5, BUG-7, BUG-9, BUG-11) tienen que estar fixed **antes** de empezar Fase 2 de los ejes mecánicos. El invariante "comportamiento idéntico antes/después" no es defendible mientras el comportamiento actual esté roto.

---

## Renombrado de bugs

Para evitar la colisión `B11` (bug) vs `B11-state` (eje), a partir de ahora:

- **Bugs:** `BUG-1` … `BUG-15` (referencia issues de GitHub #604–#618).
- **Ejes de drift:** mantienen `A1..A7`, `B1-state..B12-state`, `C1..C8`, `D1..D8`.

Ver `docs/reports/2026-04-28-drift-inventory-fase1.md` para mapeo completo.

---

## Eje compuesto: estados de loading/error/empty (E-async-states)

Sam identificó que **B8-state + D2 + D8** son el mismo problema visto desde tres ángulos:

- **B8-state** — dónde vive el estado de loading/error en el store (Redux vs useState local vs nada).
- **D2** — taxonomía y propagación de errores en JS (`ToolResult`, `throw`, `console`, swallow, `null`, toast).
- **D8** — cobertura del rendering de loading/error/empty en la UI.

**Tratamiento:** **un solo eje compuesto `E-async-states`**, abordado como **sub-track de scope grande con spec previo** (no es un mini-spec — es probablemente el eje más grande de toda la auditoría):

1. Inventario de cada operación async en la app (mesh import, WASM init, copilot loop, RAG, BOM extraction, nesting, grading, DXF export, file save/load, ...).
2. Para cada una: ¿quién la dispara? ¿quién consume el estado? ¿es localizada o global?
3. Diseñar la taxonomía de errores antes que el sistema de UI.
4. Después: canónico de almacenamiento + canónico de propagación + canónico de render.

Cuando lleguemos: tratarlo como sub-track que probablemente toma múltiples sesiones.

---

## Criterio para notas previas a fix de bugs

(Acordado con Sam.)

**Nota previa requerida sólo cuando:** el fix mínimo viable inherentemente elige entre arquitecturas que interactúan con un eje futuro de la cola.

**Plumbing puntual NO cementa nada → sin nota:**
- Agregar un campo a un mensaje del worker.
- Llamar a un setter existente.
- `dispose()` inline en sitios localizados.

**Introducir un patrón nuevo SÍ cementa → nota previa:**
- Crear helper / hook / abstracción.
- Cambiar la convención de `meta.*` flags.
- Diseñar política de persistencia.

### Aplicación a los 7 bugs prioritarios

| Bug | Fix mínimo | Cementa eje futuro? | Nota previa? |
|---|---|---|---|
| BUG-1 (bend angles) | Compute distances en extracción WASM (mismo cálculo que CPU) | No — paridad de valores | **No** |
| BUG-2 (friction) | Plumbing `prevPos` al call de `solveTriangleCollision` | No — plumbing puntual | **No** |
| BUG-3 (seam alpha=0) | Agregar campo de compliance al mensaje + setter en Rust | No — plumbing puntual | **No** |
| BUG-5 (self-collision) | Llamar `set_adjacency` desde el worker (setter existe) | No — plumbing puntual | **No** |
| BUG-7 (linkedEditing+undo) | Elige entre 3+ arquitecturas (cascade flag, single-reducer mutación, batch undo) | **Sí — interactúa con B3-state** | **Sí** |
| BUG-9 (geom leaks) | **Opción A — inline `.dispose()`** confirmada por Sam | No con A; sí con B | **No** (con condición ↓) |
| BUG-11 (storage prefix) | Migrar `webclo-use-webgpu` → `openclo-use-webgpu` con read-old-write-new | No — plumbing puntual | **No** |

**BUG-10** (no prioritario pero agendado) — **nota previa requerida**: la decisión IDB-primary vs double-write inherentemente toca B6-state. **Timing:** la nota se emite **justo antes** de fixear BUG-10 (Paso 6 del plan secuencial), no junto con la de BUG-7. Razón: BUG-10 no se usa hasta después de los mecánicos y posiblemente Fase 2 de varios (b); el codebase habrá cambiado y la nota debe reflejar ese código, no el actual.

### Condición sobre BUG-9

El fix debe ser efectivamente `.dispose()` inline. **Si en pleno fix la repetición empieza a pedir un helper, paro y aviso a Sam antes de extraerlo** — eso cruzaría a Opción B y pre-emptaría C1. Dos o tres sitios sin helper, ok.

---

## Reclasificación

### (a) Mecánicos — flujo Nido funciona, canónico → migración

8 ejes. Output de Fase 2 = canónico propuesto + archivos a tocar + tamaño. Sam aprueba/rechaza eje por eje.

| Orden | ID | Eje | Tamaño | Comentario |
|---|---|---|---|---|
| 1 | **B11-state** | ID generation (Date.now+random vs uuid vs uid) | S | Canónico evidente: `crypto.randomUUID`. |
| 2 | **B12-state** | `NEW_PROJECT` reset coverage | S | Decidir si plugin/renderSettings reset es bug o intencional, documentar. |
| 3 | **C7** | Pan manual de Viewport3D (re-implementa OrbitControls) | S | Limpieza directa. |
| 4 | **B4-state** | Selectors export pattern | S | Solo `bomSlice` exporta; alinear o documentar como ad-hoc. |
| 5 | **B5-state** | Middleware patterns (factory vs const) | S | Mayormente cosmético. |
| 6 | **C8** | Routear AvatarModel por `importMesh` canónico | S | **Depende de C6 decidido primero** (unidad canónica). |
| 7 | **D1-cosmetic** | Casing `grainLine`/`grainline`/`GrainLine` | S | Alinear casing en `InternalLineType`. |
| 8 | **D5** | Layering violations puntuales | S | Mover imports de `copilot/hooks/` desde `components/ProgressMessage`, etc. |

**Calibración (primeros 5):** B11-state → B12-state → C7 → B4-state → B5-state. Después: C8 (post-C6), D1-cosmetic, D5.

---

### (b) Requieren decisión de producto/arquitectura

12 ejes. Output de Fase 2 = contexto + opciones + tradeoffs + recomendación + preguntas. Sam decide, después se propone canónico.

| ID | Eje | Decisión pendiente |
|---|---|---|
| **A3** | Cross-boundary error handling | ¿Agregar `console_error_panic_hook`? ¿Convertir `panic!` a `Result<_, JsValue>`? ¿NaN guard reportar o seguir silente? |
| **B2-state** | Entity collections shape (array vs Record vs EntityAdapter) | ¿Cuál es el criterio? ¿Usar EntityAdapter en algún caso? Definir regla, no patrón único. |
| **B3-state** | Mutaciones / cascada middleware | ¿Cascade dispatches son legítimos? Si sí, ¿cómo se relacionan con undo (BUG-7 fix)? ¿Convención `meta.cascadeOf`? |
| **B6-state** | Persistencia (3 strategies + double-write) | ¿IDB primary y localStorage fallback? ¿Cuándo se justifica double-write? Versionado obligatorio. |
| **B10-state** | Fuente de verdad superpuesta | `pieces[].fabricId` vs `pieceFabrics`: ¿el legacy se elimina? `avatar.measurements` vs `parametric.baseMeasurements`: ¿cuál muere? |
| **C5** | Coord systems / transforms | ¿Módulo `src/utils/coords/`? ¿Branded types `Mm`/`PatternSpace`/`WorldSpace`? Scope. |
| **C6** | Unidades & medidas (mm canónico, BodyMeasurements en cm) | ¿Migrar `BodyMeasurements` a mm? Eso rompe display y persistencia de avatares. ¿O documentar excepción y branded types? **→ Decisión PRIMERO, antes de mecánicos.** |
| **D1-real** | Dart vs InternalLine{type:'dart'} (migración incompleta) | Misma pregunta para grainLine. ¿Completar migración o aceptar dualidad permanente con adapter? |
| **D3** | Forms / inputs (zod, MeasurementInput) | ¿Adoptar zod en UI? ¿Crear componente `MeasurementInput` reutilizable? Scope. |
| **D4** | Composición (CopilotPanel 11 useState) | ¿Extraer `useCopilotChat`? ¿Mover historial a Redux para persistencia? Scope. |
| **D6** | Fabric tipos x3 (Fabric, PhysicalFabric, FabricMaterial) | ¿Plan de migración hacia `PhysicalFabric`? ¿O diseñar mapper formal y aceptar los 3? |
| **D7** | `ValidationDiagnostic` vs `Diagnostic` | ¿Tipo común para campos compartidos + adaptador? ¿Mantener separados? Decisión de tipos compartidos. |

---

### (c) Requieren RFC propio

6 ejes. Output de Fase 2 = borrador de RFC con opciones, tradeoffs, recomendación. Sam discute y decide. Después se migra.

| ID | Eje | Por qué RFC |
|---|---|---|
| **A2** | Cross-boundary serialization | Tipo central compartido `ClothSimConfig` Rust↔TS afecta ABI WASM, requiere consenso cross-language. |
| **A4** | Geometry/mesh ops duplicación Rust↔TS | Decidir qué vive donde tiene impacto perf significativo y altera responsabilidades del crate. |
| **A6** | Worker message protocol asimétrico | Diseñar interface común `ClothSolverInterface` afecta ambos clientes; toda feature futura depende. **CLOSED 2026-05-01 (PR #682 merged commit `48430062`)** — Pattern 2.5 extend **4to data point bounded variant**. Interface scope reduced post-compile-gate trigger: `ClothSolverClient` declares only lifecycle subset (`start`/`stop`/`dispose`/`capabilities`). Init + callbacks remain by-convention per-tier (structural divergence GPU `seamPairs` vs CPU/WASM `SeamInitData[]`; CPU `FrameCallback` 3-arg vs single-arg). Capability surface extended A7 § 3.3 to 4 tiers + `frameDriven` flag. NeuralDrapeClient drop-in claim partial enforce (lifecycle) + partial reframe (init/callbacks/setters by-convention). 7 follow-up issues queued: #683 setWind / #684 setPins / #685 setFabric→consumer / #686 gravity→setConfig / #687 error uniform 4 tiers / #688 #UUU-init factory / #689 #UUU-callbacks. Methodology sub-rule "Compile-gate convergence verification" anchored in CLAUDE.md (post-merge). Doc 1861 líneas (RFC + § 4.5 amendment IN F3 per Sam non-negotiable directive). Cross-ref: `docs/reports/2026-05-01-rfc-a6-worker-protocol.md`. |
| **A7** | WASM vs CPU equivalence | Post-bugs: ¿WASM debe alcanzar paridad de features con CPU (LRA, pressure, fold, piece stiffness) o son CPU-only por diseño? |
| **C1** | Buffer lifecycle Three.js | Post-BUG-9: patrón canónico (`useDisposableGeometry` o equivalente) tiene varios shapes válidos con tradeoffs distintos. |
| **C4** | TSL/WebGPU/WASM/CPU coexistence | Tres solvers activos con duplicación de tool logic. ¿Solver-agnostic interface? ¿Feature-flag jerárquico? ¿Deprecation roadmap? |

---

## Tabla resumen

| Categoría | Ejes | Output Fase 2 |
|---|---|---|
| **(a) Mecánicos** | **8 ejes** (S cada uno) | Canónico propuesto + archivos + tamaño |
| **(b) Decisión producto/arq** | **12 ejes** | Opciones + tradeoffs + recomendación + preguntas |
| **(c) RFC** | **6 ejes** | Borrador de RFC formal |
| **Compuesto E-async-states** | sub-track propio (B8-state + D2 + D8) | Spec previo de scope grande, después tres canónicos |

**Total:** 27 outputs (8 + 12 + 6 + 1 sub-track; el compuesto absorbe 3 ejes; D1 se split en cosmetic/real).

---

## Convención de archivos para Fase 2

(Acordado con Sam.)

- Cada Fase 2 va en archivo propio: **`docs/reports/2026-04-28-drift-fase2-{ID}-{shortname}.md`**
  - Ejemplo: `drift-fase2-c6-units.md`, `drift-fase2-b11state-ids.md`, `drift-fase2-a2-serialization.md`.
- Notas de fix-options previas a bugs van en archivos separados: **`docs/reports/2026-04-28-bug-{N}-fix-options.md`**
  - Ejemplo: `bug-7-fix-options.md`, `bug-10-fix-options.md`.

---

## Plan secuencial

```
[1. Reclasificación actualizada]              ← este archivo (rev. 2)
        ↓ ⏸ Sam aprueba
[2. Nota BUG-7 (fix-options)]
        ↓ ⏸ Sam aprueba la nota antes del fix
[3. Fix 7 bugs prioritarios]
    BUG-1, BUG-2, BUG-3, BUG-5, BUG-9, BUG-11 en serie sin parar
    BUG-7 con su nota aprobada
    ⏸ Pará al final del bloque
        ↓
[4. Fase 2 de C6 (unidades, decisión únicamente)]
        ↓ ⏸ Sam decide C6
[5. Fase 2 mecánicos arrancando con B11-state]
    B11-state → B12-state → C7 → B4-state → B5-state
    [C8, D1-cosmetic, D5 después; C8 ya con C6 decidido]
        ↓
[5b. Nota BUG-10 (fix-options) — emitida ahora contra el código actualizado]
        ↓ ⏸ Sam aprueba la nota antes del fix
[6. Bugs no-prioritarios: BUG-4, 6, 8, 10, 12, 13, 14, 15]
    BUG-10 con nota recién emitida (Paso 5b)
        ↓
[7. Fase 2 de los (b) restantes en orden a discutir]
        ↓
[8. RFCs (c) en paralelo: A2, A6 (bridge); C1, C4 (rendering); A4, A7]
        ↓
[9. E-async-states sub-track]
```

El orden de los bloques 6+ se ajusta cuando lleguemos. Las paradas (⏸) son explícitas: no avanzo sin confirmación.
