# Fase 2 — C5: Coord systems & transforms

**Status:** decision-only para Q3-D-1 vs Q3-D-2 y Q2 (sub-options A/B/C/D). Plan de migración bocetado, ejecución pendiente del verde sobre las dos decisiones abiertas.

**Eje:** C5 — Coord systems / transforms (`drift-inventory-fase1.md` axis C5, classification `(b)` decisión).

**Branch:** `drift/c5-coord-systems-transforms`.

**Iteración:** tercera. Las primeras dos iteraciones se construyeron sobre evidencia incompleta. Hallazgos:
- Iter 1 → 2 (post adversarial self-review): `src/utils/geometry/coords.ts` ya existe con `screenToPattern` y 4 tests. Q3 colapsa a Q3-D (expandir `geometry/`). Issue #642 abierto.
- Iter 2 → 3 (post review externo + nueva self-review): conteos subestimados (Cat F: 20 vs 16 originalmente; snapping: 23 vs 13). Bug latente detectado en `usePolyPenTool.ts:48-51` (fórmula divergente para SVG transform `translate(pan) scale(zoom)`). Caveat 4 verificado limpio (cero pieces persistidas afectadas). Plan split a 10 commits con commit 9 = bug fix dedicado.

**Commits methodology anclados en este branch:**
- `001ea93` — CLAUDE.md regla 1 v2 (read contents, don't list directories).
- `36ba16b` — CLAUDE.md regla 1 v3 (verify divergence + look outside obvious directory).

**Pre-requisitos resueltos:**
- C6 (units) ratificó cm para body, mm para pattern. C5 hereda esa decisión.
- C8 (mesh import) aterrizó `importMesh`. Los 4 markers `// C6-impl:` los cierra C5 en commit 7.

---

## 1. Qué decide C5 y qué NO decide

### Decide

1. **Cómo expandir `src/utils/geometry/`** (Q3-D): incorporar units conversions + boundary helpers + `screenToPatternLength` delta-only en hermanos de `coords.ts`, y bajo qué granularidad de archivos. La opción de crear `src/utils/coords/` paralelo queda **descartada** por B1 (ver sección 3).
2. **Si introducir branded types** para distinguir unidades y espacios (Q2): variantes A/B/C/D evaluadas explícitamente.
3. **API canónica** de las conversiones que hoy están scattered:
   - Body cm → world m (cat. A — 5 archivos / 11 conversiones).
   - Pattern mm → world m (cat. B — 3 sites).
   - Avatar boundary m ↔ mm (cat. C — 4 markers).
   - Screen pixels → pattern mm (cat. F — 16 archivos uniformes / 20 pares + 1 archivo divergente / 1 par).
   - Length conversions: snapping thresholds + drag deltas (13 archivos / 31 sites).
4. **Si los snapping thresholds entran al módulo** (Q-snapping): sí, como `screenToPatternLength` sibling de `screenToPattern`.
5. **Decisión sobre `usePolyPenTool.ts:48-51` divergencia** (B1): fix en commit 9 (a-split), caveat 4 verificado limpio. Ver sección 4.7.

### NO decide

- **Migración de valores persistidos.** Storage formats no cambian; ningún `.openclo` ni `Project` JSON existente se rompe.
- **D3 territory** (forms, `MeasurementInput`, display unit selector). El módulo C5 lo consume D3 cuando aterrice; C5 no diseña D3.
- **D drift (cm↔mm intra-system)** en ease/grading/seamly. Capturado como follow-up en issue **#639** (severity:medium).
- **`units.ts:formatDimension` no usado en 8 sitios.** Display layer drift, capturado en issue **#640** (severity:low).
- **`geometry/coords.ts:screenToPattern` no usado en 20 callsites.** Captured en issue **#642** (severity:medium). Cierre dentro del scope de C5: commits 8a, 8b, 9.
- **mm² ↔ cm² area conversions.** Adyacente, distinto axis.

---

## 2. Estado actual del codebase (data, no propuesta)

### 2.1 Pre-existing infra (regla 1 v3 — contenido leído explícitamente, divergencia verificada, ubicación expandida)

Auditado al 2026-04-29 con tres pasadas:
- **Pasada 1 (regla 1 v2):** leer contenidos, no solo listar.
- **Pasada 2 (regla 1 v3a):** verificar divergencia donde greps lookean uniformes.
- **Pasada 3 (regla 1 v3b):** mirar fuera del directorio obvio.

#### `src/utils/units.ts`

1 export pública: `formatDimension(valueMm, units): string`. Display-only formatter. Sin tests. Issue **#640** captura los 8 sitios que duplican el patrón `valueMm / 10` inline.

#### `src/utils/geometry/` — 15 archivos auditados

| Archivo | Exports | Relevante a C5 | Notas |
|---|---|---|---|
| **`coords.ts`** | `screenToPattern(screenX, screenY, svgRect, zoom, pan): Point2D` | **SÍ — Cat F point conversion** | Existe con 4 tests (identity, zoom, pan, svgRect offset). Issue #642 captura los 20 callsites uniformes que la duplican inline + 1 callsite divergente (B1, ver §2.2 + §4.7). |
| **`transform.ts`** | `computeBoundingBox`, `scaleOutline`, `rotateOutline`, `hitTestHandle`, etc. + `ROTATION_ARM_LENGTH / zoom` (línea 68) | **PARCIAL — 1 length conversion (línea 68)** | Resto del archivo es transform handles, no relevante a C5. |
| `calibration.ts` | `computePixelsPerMm(p1, p2, realWorldMm): number` | No | Image calibration; no body/pattern measurement. |
| `distance.ts`, `bezier.ts`, `arcLength.ts`, `path.ts`, `hitTest.ts`, `lineIntersect.ts`, `mergeOutline.ts`, `splitOutline.ts`, `slashAndSpread.ts`, `edgeInterpolation.ts` | Geometría pura | No | Puntos, paths, intersections, etc. |
| `index.ts` | Barrel export | Indirecto | Re-exporta `screenToPattern`. C5 amplía el barrel. |

#### `src/hooks/` — fuera del directorio obvio (regla 1 v3b)

| Archivo | Sites relevantes |
|---|---|
| `useElasticTool.ts:34` | `EDGE_HIT_THRESHOLD / zoom` — site #22 de length conversions. **Fuera de `src/components/PatternEditor/`**. Greps centrados en PatternEditor missean este site; la 2ª iteración del doc lo sub-contó. |

#### Tests existentes en `src/utils/geometry/__tests__/`

12 archivos de tests, incluyendo `coords.test.ts` (4 tests sobre `screenToPattern`).

**No existe** en geometry/ ni en otros lados:
- `cmToM`, `mToCm`, `mmToM`, `mToMm`, `cmToMm`, `mmToCm` (units conversions Cat A/B).
- `screenToPatternLength` o equivalente delta-only para length conversions.
- m↔mm boundary helpers (Cat C / 4 markers C6-impl).
- Branded types.

### 2.2 Drift map completo (consolidado iter 3)

Progresión histórica de los conteos (confirma "inventory counts are lower bounds"):

| Categoría | Inv. Fase 1 | Doc iter 1 | Self-review iter 2 | Reviewer externo | Self-review iter 3 (final) |
|---|---|---|---|---|---|
| Cat A | ~5 sites | 11 | 11 | (no tocado) | 11 (line 160 ternario explicit) |
| Cat F point | ≥6 | 14 pares | 20 pares (16 archivos) | 20 + B1 divergent | 20 uniform + 1 divergent (PolyPen) |
| Snapping/length | ≥6 | 3 | 13 | 18 | 23 thresholds + 8 drag deltas = 31 |

#### Categoría A — Body cm → world m (5 archivos, 11 conversiones)

> **M2 verificación post review externo (2026-04-29):** `garmentPlacement.ts:160` tiene ternario con dos `/100` (`m.shoulderWidth ? m.shoulderWidth / 100 : (m.shoulder / 100)`). Otros 4 archivos (Mannequin, useSimulationLifecycle, ClothMesh, Viewport3D) verificados sin ternarios adicionales. Conteo final = 11 conversiones (7 en garmentPlacement + 4 en otros).

- `src/utils/cloth/garmentPlacement.ts` — 7 conversiones:
  - `:150` `m.height/100`
  - `:151` `m.chest/100`
  - `:152` `m.hips/100`
  - `:155` `m.waistHeight/100` (rama true del ternario; rama false `h * 0.55` deriva de `h` ya convertido, no es conversión adicional).
  - `:160` `m.shoulderWidth/100` (rama true)
  - `:160` `m.shoulder/100` (rama false del mismo ternario)
  - `:161` `m.armLength/100` (rama true; rama false `h * 0.33` deriva de `h`).
- `src/components/Viewport3D/Mannequin.tsx:136` — `measurements.height * 0.01 * 0.93` (1 conversión `* 0.01` + factor de proporción `* 0.93` que no es unit).
- `src/components/Viewport3D/useSimulationLifecycle.ts:178` — `... .height) / 100`.
- `src/components/Viewport3D/ClothMesh.tsx:240` — `... .height) / 100`.
- `src/components/Viewport3D/Viewport3D.tsx:655` — `avatar.measurements.height / 100`.

#### Categoría B — Pattern mm → world m (3 sites, 3 archivos)

- `src/utils/cloth/garmentPlacement.ts:185` — `pieceGeometry.heightMm / 1000`.
- `src/utils/cloth/layerOffsets.ts:89` — `totalThicknessMm / 1000`.
- `src/utils/cloth/fitMaps.ts:209` — `fabric.thickness / 1000`.

#### Categoría C — Avatar boundary m ↔ mm (2 archivos, 4 markers C6-impl)

- `src/components/Viewport3D/AvatarModel.tsx:194` — `targetHeightMm: height * 1000` (m→mm).
- `src/components/Viewport3D/AvatarModel.tsx:200` — `result.scene.scale.multiplyScalar(0.001)` (mm→m).
- `src/utils/cloth/avatarCollisionMesh.ts:26` — `targetHeightMm: avatarHeight * 1000`.
- `src/utils/cloth/avatarCollisionMesh.ts:31` — `result.scene.scale.multiplyScalar(0.001)`.

#### Categoría F — Screen pixels → pattern mm

##### F.1 — Sitios uniformes (16 archivos / 20 pares)

`(e.clientX - rect.left - pan2D.x) / zoom2D` con la operación canónica:

```
PatternEditor.tsx:278, 551, 577                        (3 pares)
useEditorInteractions.ts:241, 439, 612                 (3 pares)
sewingUtils.ts:41                                      (1)
useEditCurve.ts:41                                     (1)
useEditPattern.ts:99                                   (1)
useExtendTrimTool.ts:52                                (1)
useGrainlineTool.ts:44                                 (1)
useLineTool.ts:35                                      (1)
useMergeTool.ts:39                                     (1)
useNotchTool.ts:104                                    (1)
usePenTool.ts:49                                       (1)
useRectangleTool.ts:45                                 (1)
useScissorsTool.ts:49                                  (1)
useSlashAndSpreadTool.ts:481                           (1)
useTransformTool.ts:58                                 (1)
useTrimTool.ts:77                                      (1)
```

Variantes detectadas (mismo math):
- 12 sites con `(e.clientX - rect.left - pan2D.x) / zoom2D`.
- 8 sites con `(screenX - svgRect.left - pan.x) / zoom` (rename local).
- `useEditorInteractions.ts:612` con `svgRect` en vez de `rect` (rename de variable).

**Cero divergencia matemática verificada en estos 20 sites** (regla 1 v3a aplicada — formula leída en cada uno).

##### F.2 — Sitio divergente (1 archivo / 1 par) — B1

- `src/components/PatternEditor/usePolyPenTool.ts:48-51` — fórmula `(screenX - svgRect.left) / zoom - pan.x` (pan después de zoom).

**Bug latente** para SVG transform `translate(pan) scale(zoom)` actualmente aplicado en `PatternEditor.tsx:605`. Análisis completo en §4.7. Resolución: commit 9 dedicado (a-split per Sam, post-caveat-4 limpio).

#### Length conversions (13 archivos / 31 sites)

Patrón: `pixelLength / zoom` sin pan offset. Sub-grupos:

##### F.3 — Snapping thresholds (constantes / zoom) — 23 sites

```
PatternEditor.tsx:283, 324, 364, 409                            (4 sites)
useEditCurve.ts:79, 139                                          (2 sites)
useEditPattern.ts:119                                            (1)
useEditorInteractions.ts:249, 452, 496, 657                      (4 sites — CLICK_THRESHOLD, EP_THRESHOLD, LINE_THRESHOLD, MIN_DRAG)
useExtendTrimTool.ts:63, 125                                     (2)
useMeasureTool.ts:95                                             (1)
useScissorsTool.ts:82                                            (1)
useSegmentSewingTool.ts:49                                       (1)
useSlashAndSpreadTool.ts:123, 278                                (2 — SNAP, PIVOT)
useTopstitchTool.ts:109                                          (1)
useTransformTool.ts:69, 185                                      (2)
src/hooks/useElasticTool.ts:34                                   (1 — fuera del PatternEditor/)
src/utils/geometry/transform.ts:68                               (1 — ROTATION_ARM_LENGTH)
```

##### F.4 — Drag deltas runtime (4 pares = 8 sites)

`(e.clientX - startMouse.x) / zoom` aplicado a deltas runtime:

```
useEditCurve.ts:113-114                  (1 par)
useEditPattern.ts:320-321                (1 par)
useEditorInteractions.ts:554-555         (1 par)
useEditorInteractions.ts:592-593         (1 par)
```

Mismo helper canónico (`screenToPatternLength`) aplicado a runtime values en vez de constantes.

##### Total length sites: 23 + 8 = 31, en 13 archivos distintos.

#### Total Cat F + length

- Cat F point: 20 uniform + 1 divergent = **21 sites en 17 archivos**.
- Length conversions: 31 sites en 13 archivos.
- Distinct files (con overlap): ~22-25 archivos a tocar para Cat F + length.
- Sites totales: 52.

### 2.3 Por qué los `clientX/clientY` no son simplemente `getBoundingClientRect` boilerplate

Los pares de point conversion + sites de length conversion no son boilerplate de DOM — son **conversión de coordinate space**. La fórmula `(client - rect.left - pan) / zoom` codifica:

1. Resta del rect offset (DOM → SVG-local pixels).
2. Resta del pan (SVG-local → world-space pixels with pan).
3. División por zoom (pixels → mm en pattern space).

Cada uno puede ser silenciosamente roto si alguien:

- Olvida restar `pan2D` (clicks se desplazan al hacer pan).
- Olvida dividir por `zoom2D` (clicks se rompen cuando hay zoom).
- Aplica pan después de zoom **(B1, usePolyPenTool case)** — produce offset = `pan*(zoom-1)/zoom` bajo combined pan + zoom.
- Confunde X con Y al copiar el pattern.

Centralizar elimina las clases. La infra ya existe (`screenToPattern`); el problema es de adopción + 1 divergencia arquitectónica.

### 2.4 Methodology — anti-patrones detectados y anclados

Tres lecciones progresivas anclados en `CLAUDE.md` durante esta auditoría:

| Lección | Commit | Anti-patrón | Origen |
|---|---|---|---|
| Read contents, don't list directories | `001ea93` | "geometry/ — no candidate" sin leer | C5 iter 1 → 2 |
| Verify divergence, don't assume uniformity by grep | `36ba16b` | "20 callsites uniformes" sin leer fórmula de cada uno | C5 iter 2 → 3 (B1) |
| Look outside the obvious directory | `36ba16b` | Grep filtrado a PatternEditor/ pierde useElasticTool en hooks/ | C5 iter 2 → 3 (B2 +5) |

Las tres son corolarios del parent rule "**inventory counts are lower bounds**". La progresión empírica del conteo de snapping en este eje (6 → 13 → 18 → 23) es evidencia cuantitativa del costo del location bias y del primitive specialization.

---

## 3. Decisión Q3 — Granularidad dentro de `geometry/`

> **Cambio estructural iter 1 → 2**: Q3-A/B/C descartadas por B1 (geometry/coords.ts ya es el home natural). Las opciones reales son sub-granularidades dentro de `geometry/`.

**Opciones descartadas upfront por B1:**
- ❌ Q3-A (expandir `utils/units.ts`): duplicaría `geometry/coords.ts`.
- ❌ Q3-B (crear `utils/coords/` paralelo): duplicaría `geometry/`.
- ❌ Q3-C (co-locate junto a consumidores): genera N homes domain-specific cuando ya hay un home central.

**Opciones reales: Q3-D-1 vs Q3-D-2.**

### Opción Q3-D-1 — Archivos hermanos en `geometry/`

```
src/utils/geometry/
├── coords.ts            (existente — screenToPattern; agregar screenToPatternLength)
├── units.ts             (NUEVO — cmToM, mToCm, mmToM, mToMm, cmToMm, mmToCm + branded types si Q2)
├── boundaries.ts        (NUEVO — metresToImporter, importerToMetres para Cat C)
└── index.ts             (re-export todos los nuevos)
```

**Pros:**
- Layer separation explícita.
- Tests más localizados.
- Crecimiento del módulo no obliga a refactorizar.
- D3 territory queda claro: `formatDimension` se queda en `utils/units.ts` legacy; `geometry/units.ts` es internal-only.

**Contras:**
- 2-3 archivos nuevos en una primera entrega.
- Naming refinable ("boundaries.ts" puede ser ambiguo).
- Imports más verbosos sin barrel.

### Opción Q3-D-2 — Todo dentro de `coords.ts` expandido

```
src/utils/geometry/
└── coords.ts            (existente expandido — todas las conversions)
```

**Pros:**
- Un solo archivo. Cero archivos nuevos.
- Discoverability máxima.

**Contras:**
- `coords.ts` crece de 17 a ~80-120 líneas con 4-5 responsabilidades distintas.
- "Where does X go?" se vuelve menos claro al crecer.
- Tests del archivo crecen junto.

### Recomendación

**Q3-D-1 con confianza media-alta.** Razonamiento:
1. La separación de concerns (point / length / units / boundaries) es genuina.
2. `geometry/` ya tiene granularidad de archivos (15 archivos por concept).
3. Si Q2 elige branded types, `units.ts` es home natural; meterlos en `coords.ts` rompe la lectura.
4. Q3-D-2 ahorra ~1 file en upfront cost pero acumula deuda de "where does X go?" en cada nuevo helper.

**No pre-decido.** Vos decidís.

---

## 4. Decisión Q2 — Branded types

**No pre-decido.** Cuatro sub-opciones evaluadas.

### 4.1 — 4.4 Friction y bugs (sin cambios respecto a iter 2)

Construction friction (~80-150 callsites para Q2-A), library interop (~20-40 ops aritméticas), test ergonomic friction (~30-50 sites). Tres clases de bugs reales que branded types eliminan: cm/mm cross-mixing (~10-15 sites), pattern XY vs screen XY swap, m↔mm at avatar boundary (4 markers).

### 4.5 Bugs documentables (M1 reformulado)

> **M1 reformulación post review externo (2026-04-29)**: la versión iter 2 contó el cast en `avatarLibrary.ts:70` como evidencia para Q2-D ("5 of 6 documentables"). Reformulación honesta:

El cast `out as unknown as BodyMeasurements` en `src/utils/avatar/avatarLibrary.ts:70` **evade incompatibilidad estructural**, no de unidades. La interface `BodyMeasurements` tiene campos nombrados (`height: number`, `chest: number`, ...); el output del runtime de Zod-like es `Record<string, number>`. El TS no reconoce el shape genérico como la interface tipada. Branded types **per-field** (`height: Cm`, `chest: Cm`, etc.) **NO eliminan este cast** — la incompatibilidad estructural sobrevive. Lo que lo eliminaría es:
- Un schema validator alineado con el shape de la interface (sin necesidad de cast post-validation), o
- Un branded `BodyMeasurements` opaco (sin acceso a campos individuales).

**Ninguno está en scope de Q2.** Por lo tanto este cast NO cuenta como evidencia para Q2-D.

#### Conteo corregido de bugs documentables

- ~~`avatarLibrary.ts:70`~~ — desclasificado (estructural, no unit).
- Los 4 markers `// C6-impl:` (`AvatarModel.tsx:193,199`, `avatarCollisionMesh.ts:24,30`).
- D drift (issue #639) — 5 sitios `* 10` en `easeTracking.ts`.

**Total: ~5 ocasiones (no 6) documentadas en comments / issues.**

Q2-D ahora atrapa **4 de 5** sitios documentables (los 4 markers C6-impl), no 5 de 6. Sigue siendo una proporción alta a costo bajo, pero la cuenta se ajusta.

### 4.6 Sub-opciones (con conteos M1-corregidos)

#### Q2-A: branded types completos (Cm + Mm + Metres + PatternXY + ScreenXY + WorldXYZ)
- Atrapa todas las clases.
- Cost: ~80-150 callsites.

#### Q2-B: solo unit-level (Cm + Mm + Metres)
- Atrapa cm/mm + meters-at-boundary, NO pattern XY vs screen XY.
- Cost: ~40-60% de Q2-A.

#### Q2-C: helpers nombrados, sin branded types
- Bugs por convención, no por compiler.
- Cost: ~10-20 sites por categoría.

#### Q2-D: branded solo en boundaries críticos (Mm + Metres en importMesh + BodyMeasurements storage)
- Atrapa **4 de 5** sitios documentables (los 4 markers C6-impl).
- NO atrapa cm/mm cross-mixing (Cat 1) ni pattern XY vs screen XY (Cat 2).
- NO elimina el cast en `avatarLibrary.ts:70` (es estructural, ver §4.5).
- Cost: ~5-10 callsites de boilerplate.

### Recomendación: Q2-C con confianza media

Razonamiento (post M1-corrección):
1. **Bugs documentables son pocos relativos al costo.** ~5 sitios contables vs 80-150 callsites para Q2-A. Helpers nombrados + grep capturan ~80% del valor a fracción del costo.
2. **Q2-B es middle ground sin ganancia.** Si pagás boilerplate, paga el completo (Q2-A); si no, Q2-C.
3. **Q2-D es tentador pero introduce inconsistencia estructural.** Atrapa solo 4 sitios al costo de dos lenguajes en el codebase. Y NO elimina el cast estructural de avatarLibrary que motivó parte del análisis.
4. **Posponer no preserva opcionalidad gratis.** Pero sin telemetry de bug-history y sin roadmap de copilot expansion, Q2-A es paid based on hunch.

**Pero confianza media** porque no conozco bug-history ni roadmap. Si decidís Q2-A/B/D, el doc se ajusta y la migración cambia.

### 4.7 — B1 resolved: usePolyPenTool divergencia → commit 9 fix (a-split)

#### Análisis matemático

**SVG transform en `PatternEditor.tsx:605`:**
```jsx
<g data-pan-zoom-group transform={`translate(${pan2D.x}, ${pan2D.y}) scale(${zoom2D})`}>
```

Inversa correcta (screen → pattern):
- Forward: `screenX = svgRect.left + pan.x + zoom * patternX`.
- Inverse: `patternX = (screenX - svgRect.left - pan.x) / zoom` ← **canónica**.

**Fórmula divergente en `usePolyPenTool.ts:48-51`:**
```ts
const toPattern = useCallback((screenX, screenY, svgRect): Point2D => ({
  x: (screenX - svgRect.left) / zoom - pan.x,
  y: (screenY - svgRect.top) / zoom - pan.y,
}), [zoom, pan]);
```

Esta es la inversa de un transform diferente (`scale(zoom) translate(pan)`, no el actual). Diferencia: `canónico - buggy = pan * (zoom - 1) / zoom`.

**Bug observable** bajo `pan != 0 AND zoom != 1` (caso típico de uso). Por qué nunca surfaceó en tests:
- Cero tests sobre `usePolyPenTool` (verificado).
- `CLOSE_THRESHOLD` logic (líneas 80-84) compara dos puntos pattern bajo la misma fórmula buggy → diferencia idéntica al canónico → close threshold funciona correctamente.
- Self-similar buggy reads enmascaran la divergencia visualmente en preview (preview también usa toPattern, no hay assertion external).

#### Caveat 4 verificado limpio (gating de Sam, 2026-04-29)

```bash
grep -rn "polyPen|PolyPen" --include="*.openclo" --include="*.json" .   # vacío
grep -rn "polyPenMode" src --include="*.test.*"                          # vacío
ls src/**/__tests__/fixtures/                                            # no existe
grep -rn "Poly Pen Piece" --include="*.openclo" --include="*.json" .     # vacío
```

**Cero pieces persistidas trazables, cero tests asseverando coords post-toPattern.** El fix en commit 9 es seguro respecto a user data — no rompe `.openclo` files existentes (no los hay con Poly Pen pieces).

#### Decisión: a-split

**Por qué no (a) puro:** mezclar refactor mecánico (commits 8a/8b) con bug fix en un solo commit viola atomicity y oscurece el "comportamiento idéntico antes/después" invariant.

**Por qué no (c) puro:** caveat 4 es limpio. No hay user data afectada. Posponer el fix sería deuda gratuita.

**a-split:** commits 8a (uniform Cat F point), 8b (length conversions), 9 (PolyPen fix). Cada uno reverteable independientemente. Detalle en §7.

---

## 5. Snapping thresholds — clarificación (conteos iter 3)

> **Cuenta corregida iter 2 → 3:** 13 → 23 thresholds + 8 drag deltas = 31 length sites total. Lista completa en §2.2.F.3 + F.4.

### Semántica

Son **delta conversions** (pixel-distance → pattern-distance), no point conversions. La fórmula `N / zoom` traduce "N screen pixels" a "N/zoom pattern mm". No tienen `pan` offset porque no son una posición sino una longitud.

### Decisión: incluir como helper sibling en el módulo C5

```ts
screenToPatternPoint(e, rect, pan2D, zoom2D): { x: Mm, y: Mm }   // = screenToPattern existente
screenToPatternLength(px: number, zoom2D): Mm                     // NUEVO
```

**Razón ahora más fuerte:** 31 sites distribuidos en 13 archivos, no 3 sites en 1 archivo (cuenta original). El commit dedicado vale su peso en consistencia visible.

---

## 6. Estimación

**Estimación: XL chico (~52 sites en ~22-25 archivos, 13-17h).**

> **Re-estimación iter 3:** la cuenta subió 22-25 sites (iter 2) → 52 sites (iter 3). Sites = 21 Cat F point + 31 length + 11 Cat A + 3 Cat B + 4 Cat C = 70 sites totales si contamos boundaries y units; pero los archivos distintos son ~22-25 considerando overlap. Estimado 13-17h con buffer.

### Breakdown

#### Files touched (Q2-C + Q3-D-1)

- **Created:** ~3 (`geometry/units.ts`, `geometry/boundaries.ts`, opcional `__tests__/*` separados).
- **Modified Cat A:** 5 archivos.
- **Modified Cat B:** 3 archivos.
- **Modified Cat C:** 2 archivos.
- **Modified Cat F point uniform:** 16 archivos (20 sites).
- **Modified Cat F divergent (PolyPen):** 1 archivo (1 site, commit 9).
- **Modified length:** ~9 archivos adicionales (snapping no superpuesto con Cat F point) + 4 archivos drag-delta-only.
- **`geometry/coords.ts`** extendido con `screenToPatternLength`.
- **`geometry/index.ts`** updated.
- **Tests:** ~3-4 archivos nuevos + actualización de `coords.test.ts`.

**Total: ~30-35 archivos modificados/creados.**

#### Tiempo estimado (rough, con buffer)

- **Q2-C + Q3-D-1: 13-17h** trabajo continuo.
  - 3 helpers nuevos con tests (1.5-2h).
  - Adopción `screenToPattern` existente en 20 callsites (1.5-2h).
  - 5 commits de migración por categoría con gates (5-7h).
  - Commit 9 (PolyPen fix) con 4 tests de regresión (1-1.5h).
  - Buffer test fixing (2-3h).
  - Anchor docs (0.5h).
- **Q2-A + Q3-D-1: 22-30h** (XL claro).
- **Q2-D + Q3-D-1: 16-22h.**

---

## 7. Plan de migración bocetado (a-split, 10 commits)

> **Plan iter 3:** commit 8 original split en 8a + 8b + 9 (a-split). Total 10 commits (incluyendo CLAUDE.md ya commiteados).

**Branch:** `drift/c5-coord-systems-transforms` (existente). Commits ya en branch: `bc2be60`, `2a69f60`, `001ea93`, `e4e5158`, `36ba16b`, este commit (iter 3).

Commits de Fase 3 (atómicos, cada uno pasa gates):

1. ✅ **docs methodology** (CLAUDE.md regla 1 v2 — `001ea93`).
2. ✅ **docs methodology** (CLAUDE.md regla 1 v3 — `36ba16b`).
3. ✅ **docs Fase 2** (este commit — iter 3 con todos los fixes).
4. **feat**: `src/utils/geometry/units.ts` (cmToM, mToCm, mmToM, mToMm, cmToMm, mmToCm) + tests sibling. Re-export desde `geometry/index.ts`.
5. **feat**: extender `geometry/coords.ts` con `screenToPatternLength(px: number, zoom: number): number` + tests.
6. **feat**: `src/utils/geometry/boundaries.ts` (`metresToImporter(m: number): number` returns mm, `importerToMetres(scene: THREE.Scene): void` mutates scale) + tests sibling con mock.
7. **refactor**: migrar Cat B (3 sites mm→m).
8. **refactor**: migrar Cat A (5 archivos / 11 conversiones cm→m).
9. **refactor**: migrar Cat C (4 markers C6-impl). Cierra los markers de C8.
10. **refactor (8a)**: migrar Cat F point uniform (16 archivos / 20 sites) a `screenToPattern` existente. **EXCLUYE** `usePolyPenTool.ts:48-51` con comment inline:
    ```ts
    // C5: divergent formula fix in commit 9 (latent pan/zoom bug — see Fase 2 doc §4.7)
    ```
    Comportamiento idéntico pre/post. Cierra parte de #642.
11. **refactor (8b)**: migrar length conversions (23 thresholds + 8 drag deltas = 31 sites en 13 archivos) a `screenToPatternLength`. Comportamiento idéntico pre/post. Cierra el resto del scope length de #642.
12. **fix (9)**: `usePolyPenTool` corregir fórmula divergente. Reemplazar `toPattern` local por import de `geometry/coords.ts:screenToPattern`. Tests de regresión 4 casos:
    - `screenToPattern(100, 200, {left:0, top:0}, 1, {x:0, y:0}) === {x:100, y:200}` (identity).
    - `screenToPattern(100, 200, {left:0, top:0}, 2, {x:0, y:0}) === {x:50, y:100}` (zoom).
    - `screenToPattern(100, 200, {left:0, top:0}, 1, {x:10, y:20}) === {x:90, y:180}` (pan).
    - `screenToPattern(200, 300, {left:0, top:0}, 2, {x:50, y:100}) === {x:75, y:100}` (combined pan+zoom — el caso del bug).
    Commit message documenta:
    ```
    Pre-fix, los nodos del Poly Pen aparecían offset bajo pan + zoom
    simultáneos (offset = pan*(zoom-1)/zoom). Post-fix aparecen donde
    el cursor está. Caveat 4 verificado limpio:
      grep "polyPen" --include="*.openclo" --include="*.json" → vacío
    No hay pieces persistidas afectadas. Fix safe wrt user data.
    Cierra #642.
    ```

> **Política de mid-flight discoveries (M4):** si un commit revela necesidad de cambio en helper signature, **stop, no improvisar**. Abrir nuevo commit `feat: extend <helper>` con tests sibling antes del commit de migración. Mantener atomicidad. NO amend de commits anteriores. Reportar a Sam si el cambio implica cambio en Q2/Q3.

Cada commit pasa `npx tsc -b --noEmit && npx eslint --max-warnings=0 <archivos> && npx vitest run <relevantes>`.

---

## 8. Comportamiento idéntico antes/después

Verificación obligatoria por commit. La equivalencia matemática es trivial salvo en commit 9 (PolyPen fix) que es **explicitamente** comportamiento distinto pre/post.

### Categoría A — Body cm → world m
Cobertura: helper unit test en commit del helper es la garantía primaria. Test inline en `garmentPlacement.test.ts:84-87` agrega cobertura **incidental** (computa `168 * 0.55 / 100` como expected literal para skirt-position assertion, no valida `cmToM` directamente).

### Categoría B — Pattern mm → world m
No tiene test end-to-end. El unit test del helper en commit 4 cubre el contrato.

### Categoría C — Avatar boundary m ↔ mm (4 markers C6-impl)
Tests existentes cubren `detectFormat`, `detectUnit`, `isSupportedFormat`, file size limits. **NO** cubren el flujo `targetHeightMm = height * 1000` + `scene.scale.multiplyScalar(0.001)`.

**Acción requerida:** en commit 6 (helper boundaries), agregar tests:
- `metresToImporter(1.7) === 1700`.
- `importerToMetres(scene)` aplica `scale.multiplyScalar(0.001)` (mock de `THREE.Scene`).

### Categoría F point — Screen → pattern (uniform)
`screenToPattern` existente tiene 4 tests en `coords.test.ts`. Los 20 callsites uniformes se migran a importarlo. Si la fórmula del helper cambia, tests existentes regresionan.

### Categoría F point — usePolyPenTool (commit 9)
**Comportamiento explícitamente cambia.** Tests de regresión nuevos en commit 9 (los 4 casos arriba). Documentado en commit message.

### Length conversions
No cubierta por tests existentes. **Acción:** en commit 5 (extender `coords.ts`), tests:
- `screenToPatternLength(10, 2) === 5`.
- `screenToPatternLength(8, 1) === 8`.

---

## 9. Issues out-of-scope linkeadas

- **#639** (severity:medium) — D drift (cm↔mm intra-system, 9 sites). Migrará cuando C5 deje API estable.
- **#640** (severity:low) — `units.ts:formatDimension` no usado en 8 sitios. D3 territory; migración separada.
- **#642** (severity:medium) — `geometry/coords.ts:screenToPattern` no usado en 20+1 callsites. **Cierre dentro del scope de C5** (commits 10, 11, 12). Si C5 mergea con migración completa, #642 cierra automáticamente.

---

## 10. Decisiones tomadas (2026-04-29, post-Sam)

### Q3 — Module colocation: **Q3-D** (expandir `geometry/`)

`coords.ts` ya es el home natural. Q3-A/B/C descartadas.

**Sub-opción Q3-D-1 vs Q3-D-2: pendiente** (recomendación Q3-D-1).

### Q2 — Branded types: **Q2-C recomendado**

Helpers nombrados, sin branded types. M1 corrigió la cuenta de bugs documentables a 5 (no 6); el cast `avatarLibrary.ts:70` es estructural, no de unidades.

### Q-snapping: incluir como `screenToPatternLength`

31 sites de length conversions (no 3 como afirmó la primera iteración). Helper sibling.

### B1 — usePolyPenTool divergencia: **(a-split) post-caveat-4 limpio**

Commit 9 dedicado al fix. Caveat 4 verificado limpio (cero pieces persistidas). Fix safe wrt user data.

---

## 11. Decisión revisable: criterios para reabrir Q2 como RFC

Q2-C cierra **hoy** sin quemar la opción de Q2-A en el futuro. Criterios para reabrir Q2 como RFC dedicado:

1. **≥3 bugs nuevos por unit-mismatch reportados en los próximos 6 meses** (a partir del 2026-04-29).
2. **Expansión material del roadmap de copilot tool generation.**
3. **C6-impl o D drift (#639) revela patrones de bug que branded types habrían atrapado.**

Cualquiera reabre Q2 como RFC dedicado, no automáticamente como sub-task de C5.

---

## 12. Lo que NO sigue de este doc

- Fase 3 arranca cuando este commit + `36ba16b` están en main vía PR ready/merged.
- No hay branded types introducidos (Q2-C).
- No hay tocado D drift (#639) ni display formatters (#640).
- #642 cierra dentro del scope de C5 (commits 10-12).

**FIN.**
