# Fase 2 — C5: Coord systems & transforms

**Status:** decision-only para las dos preguntas abiertas (módulo colocation Q3-D, branded types Q2). Plan de migración bocetado al final, ejecución pendiente del verde sobre las dos decisiones.

**Eje:** C5 — Coord systems / transforms (`drift-inventory-fase1.md` axis C5, classification `(b)` decisión).

**Branch:** `drift/c5-coord-systems-transforms`.

**Iteración:** segunda. La primera iteración del doc se construyó sobre evidencia incompleta — `src/utils/geometry/coords.ts` existe con `screenToPattern` y 4 tests, pero la sección 2.1 inicial categorizó `geometry/` como "no candidate" sin leer su contenido. Adversarial self-review de PR #641 detectó la omisión. Esta versión incorpora la corrección (estructural en Q3) y los conteos corregidos. Ver issue **#642** y commit `001ea93` que ancla la regla 1 v2 en `CLAUDE.md`.

**Pre-requisitos resueltos:**
- C6 (units, `drift-fase2-c6-units.md`) ratificó cm para body, mm para pattern. C5 hereda esa decisión.
- C8 (mesh import, `drift-fase2-c8-mesh-import-bypass.md`) ya aterrizó `importMesh` canónico. Los 4 markers `// C6-impl:` que C8 dejó en `AvatarModel.tsx` + `avatarCollisionMesh.ts` los cierra C5 cuando aterrice.

---

## 1. Qué decide C5 y qué NO decide

### Decide

1. **Cómo expandir `src/utils/geometry/`** (Q3-D): incorporar units conversions + boundary helpers + screenToPatternLength delta-only en hermanos de `coords.ts`, y bajo qué granularidad de archivos. La opción de crear `src/utils/coords/` paralelo queda **descartada** por B1 (ver sección 3).
2. **Si introducir branded types** para distinguir unidades y espacios (Q2): `Cm`/`Mm`/`Metres` y `PatternXY`/`ScreenXY`/`WorldXYZ`, en variantes A/B/C/D.
3. **API canónica** de las conversiones que hoy están scattered:
   - Body cm → world m (cat. A — 5 archivos / 11 conversiones).
   - Pattern mm → world m (cat. B — 3 sites).
   - Avatar boundary m ↔ mm (cat. C — 4 markers).
   - Screen pixels → pattern mm (cat. F — 16 archivos / 20 pares; ratificación de helper existente).
4. **Si los snapping thresholds** (~13 sites con patrón `N / zoom`) entran en el mismo módulo o quedan inline con justificación.

### NO decide

- **Migración de valores persistidos.** Storage formats no cambian; ningún `.openclo` ni `Project` JSON existente se rompe.
- **D3 territory** (forms, `MeasurementInput`, display unit selector). El módulo C5 lo consume D3 cuando aterrice; C5 no diseña D3.
- **D drift (cm↔mm intra-system)** en ease/grading/seamly. Capturado como follow-up en issue **#639** (severity:medium).
- **`units.ts:formatDimension` no usado en 8 sitios.** Display layer drift, capturado en issue **#640** (severity:low).
- **`geometry/coords.ts:screenToPattern` no usado en 20 callsites.** Captured en issue **#642** (severity:medium). Se cierra cuando C5 migra Cat F (parte del plan).
- **mm² ↔ cm² area conversions** (e.g., `bomExport.ts:147 areaMM2 / 100`). Adyacente, distinto axis.

---

## 2. Estado actual del codebase (data, no propuesta)

### 2.1 Pre-existing infra (regla 1 — contenido leído explícitamente)

Auditado al 2026-04-29. Aplicación de regla 1 v2 (leer contenidos, no listar directorios).

#### `src/utils/units.ts`

1 export pública:
```ts
export function formatDimension(valueMm: number, units: UnitSystem): string;
```
Display-only formatter. Sin tests. Cubre el render para UI; no hace coord systems ni branded types. Issue **#640** captura los 8 sitios que duplican el patrón `valueMm / 10` inline.

#### `src/utils/geometry/` — 15 archivos auditados

| Archivo | Exports | Relevante a C5 | Notas |
|---|---|---|---|
| **`coords.ts`** | `screenToPattern(screenX, screenY, svgRect, zoom, pan): Point2D` | **SÍ — Cat F point conversion** | Existe con 4 tests (identity, zoom, pan, svgRect offset). Issue #642 captura los 20 callsites que la duplican inline. |
| **`transform.ts`** | `computeBoundingBox`, `scaleOutline`, `rotateOutline`, `hitTestHandle`, `computeScaleFromDrag`, `computeRotationFromDrag`, `HandleId`, `HandlePosition`, `BBox` | **PARCIAL — 1 snapping site (`ROTATION_ARM_LENGTH / zoom` línea 68)** | Resto del archivo es transform handles, no relevante a C5 directamente. |
| `calibration.ts` | `computePixelsPerMm(p1, p2, realWorldMm): number` | No | Image calibration; no body/pattern measurement. |
| `distance.ts`, `bezier.ts`, `arcLength.ts`, `path.ts`, `hitTest.ts`, `lineIntersect.ts`, `mergeOutline.ts`, `splitOutline.ts`, `slashAndSpread.ts`, `edgeInterpolation.ts` | Geometría pura | No | Puntos, paths, intersections, etc. |
| `index.ts` | Barrel export | Indirecto | Re-exporta `screenToPattern` de coords.ts. Si C5 agrega helpers en `geometry/`, este barrel los re-expone. |

**Tests existentes en `src/utils/geometry/__tests__/`:** 12 archivos de tests, incluyendo `coords.test.ts` (4 tests sobre `screenToPattern`).

**No existe** en geometry/ ni en otros lados:
- `cmToM`, `mToCm`, `mmToM`, `mToMm`, `cmToMm`, `mmToCm` (units conversions Cat A/B).
- `screenToPatternLength` o equivalente delta-only para snapping.
- m↔mm boundary helpers (Cat C / 4 markers C6-impl).
- Branded types (`Cm`, `Mm`, `Metres`, `PatternXY`, `ScreenXY`, `WorldXYZ`).

### 2.2 Drift map completo (consolidado del read-only del 2026-04-29 + corrección post self-review)

#### Categoría A — Body cm → world m (5 archivos, 11 conversiones)

- `src/utils/cloth/garmentPlacement.ts:150-161` — 6 fields (`m.height/100`, `m.chest/100`, `m.hips/100`, `m.waistHeight/100`, `m.shoulder/100`, `m.armLength/100`).
- `src/components/Viewport3D/Mannequin.tsx:136` — `measurements.height * 0.01 * 0.93` (magic constants combinadas: cm→m + 93% factor).
- `src/components/Viewport3D/useSimulationLifecycle.ts:178` — `measurements.height) / 100`.
- `src/components/Viewport3D/ClothMesh.tsx:240` — `measurements.height) / 100`.
- `src/components/Viewport3D/Viewport3D.tsx:655` — `avatar.measurements.height / 100`.

Patrón: `cmValue / 100`. Una variante combinada en Mannequin (`* 0.01 * 0.93`).

#### Categoría B — Pattern mm → world m (3 sites)

- `src/utils/cloth/garmentPlacement.ts:185` — `pieceGeometry.heightMm / 1000`.
- `src/utils/cloth/layerOffsets.ts:89` — `totalThicknessMm / 1000`.
- `src/utils/cloth/fitMaps.ts:209` — `fabric.thickness / 1000`.

Patrón: `mmValue / 1000`.

#### Categoría C — Avatar boundary m ↔ mm (4 markers C6-impl)

- `src/components/Viewport3D/AvatarModel.tsx:194` — `targetHeightMm: height * 1000` (m→mm).
- `src/components/Viewport3D/AvatarModel.tsx:200` — `result.scene.scale.multiplyScalar(0.001)` (mm→m).
- `src/utils/cloth/avatarCollisionMesh.ts:26` — `targetHeightMm: avatarHeight * 1000`.
- `src/utils/cloth/avatarCollisionMesh.ts:31` — `result.scene.scale.multiplyScalar(0.001)`.

Pattern: `importMesh` es la frontera (in:mm, out:scenes en mm). Los 4 sites convierten porque caller habla en metros. Tres adapter paths posibles (caller convierte, importer expone variante metros, helper en boundary).

#### Categoría F — Screen pixels → pattern mm (16 archivos, 20 pares de coords)

> **Corrección post self-review (2026-04-29)**: la primera iteración del doc reportó 11 archivos / 14 pares. La cuenta correcta es 16 archivos / 20 pares — capturada con grep `rect\.left - pan|svgRect\.left - pan`. Inventario subestimado por ~45%.

Lista completa de callsites X (Y siempre es X+1):

```
PatternEditor.tsx:278, 551, 577                              (3 sites)
useEditorInteractions.ts:241, 439, 612                       (3 sites)
sewingUtils.ts:41                                            (1)
useEditCurve.ts:41                                           (1)
useEditPattern.ts:99                                         (1)
useExtendTrimTool.ts:52                                      (1)
useGrainlineTool.ts:44                                       (1)
useLineTool.ts:35                                            (1)
useMergeTool.ts:39                                           (1)
useNotchTool.ts:104                                          (1)
usePenTool.ts:49                                             (1)
useRectangleTool.ts:45                                       (1)
useScissorsTool.ts:49                                        (1)
useSlashAndSpreadTool.ts:481                                 (1)
useTransformTool.ts:58                                       (1)
useTrimTool.ts:77                                            (1)
```

Variantes detectadas (uniformes en matemática):
- 12 sites usan `(e.clientX - rect.left - pan2D.x) / zoom2D` (caller con `MouseEvent` + Redux state).
- 8 sites usan `(screenX - svgRect.left - pan.x) / zoom` (caller con coords como args; `pan`/`zoom` son local renames).
- `useEditorInteractions.ts:612` usa `svgRect` en vez de `rect` — variante de variable name, misma matemática.

**Cero divergencia semántica verificada.** Migración mecánica usando `screenToPattern` que ya existe en `geometry/coords.ts`.

#### Snapping thresholds — `N / zoom` delta-only (13 sites)

> **Corrección post self-review (2026-04-29)**: la primera iteración afirmó "los 3 callsites son los únicos en el codebase con esa forma" — falso. Cuenta correcta: 13 sites.

- `PatternEditor.tsx:283` — `10 / zoom2D` (seamAllowance vertex menu).
- `PatternEditor.tsx:324` — `SEAM_THRESHOLD = 8 / zoom2D` (seam hit-test).
- `PatternEditor.tsx:364` — `IL_THRESHOLD = 6 / zoom2D` (internal line hit-test).
- `useEditPattern.ts:119` — `HIT_RADIUS_PX / zoom` (8 px hit radius).
- `useMeasureTool.ts:95` — `SNAP_THRESHOLD / zoom`.
- `useSlashAndSpreadTool.ts:123` — `SNAP_THRESHOLD / zoom2D`.
- `useSlashAndSpreadTool.ts:278` — `PIVOT_THRESHOLD / zoom2D`.
- `useTransformTool.ts:69` — `HANDLE_HIT_THRESHOLD / zoom2D`.
- `useTransformTool.ts:185` — `HANDLE_HIT_THRESHOLD / zoom2D`.
- `useExtendTrimTool.ts:63` — `SNAP_THRESHOLD / zoom2D`.
- `useExtendTrimTool.ts:125` — `SNAP_THRESHOLD / zoom2D`.
- `useSegmentSewingTool.ts:49` — `SNAP_THRESHOLD / zoom`.
- `src/utils/geometry/transform.ts:68` — `ROTATION_ARM_LENGTH / zoom`.

Patrón: `pixelLength / zoom`. Sin pan offset (los thresholds son distancias, no posiciones — pan no afecta deltas).

### 2.3 Por qué los `clientX/clientY` no son simplemente `getBoundingClientRect` boilerplate

Los 20 pares de point conversion + 13 sites de length conversion no son boilerplate de DOM — son **conversión de coordinate space**. La fórmula `(client - rect.left - pan) / zoom` codifica:

1. Resta del rect offset (DOM → SVG-local pixels).
2. Resta del pan (SVG-local → world-space pixels with pan).
3. División por zoom (pixels → mm en pattern space).

Cada uno de los 20 pares puede ser silenciosamente roto si alguien:

- Olvida restar `pan2D` (clicks se desplazan al hacer pan).
- Olvida dividir por `zoom2D` (clicks se rompen cuando hay zoom).
- Confunde X con Y al copiar el pattern (pasa).

Centralizarlos elimina la clase. La infra ya existe (`geometry/coords.ts:screenToPattern`); el problema es de adopción.

### 2.4 Methodology — anti-patrón regla 1 detectado y anclado

La primera iteración del doc cometió la falla estructural que la regla 1 v2 ahora prohíbe: listó `geometry/` como directorio en sección 2.1 y lo categorizó como "no candidate" sin leer contenido. Adversarial self-review detectó el gap. Anclado en `CLAUDE.md` (commit `001ea93` en este branch) como expansión de la regla "Pre-investigation: read contents, don't list directories". Precedente C5 queda documentado allí con cross-ref a este doc + #642.

---

## 3. Decisión Q3 — Granularidad dentro de `geometry/`

> **Cambio estructural post self-review (2026-04-29)**: la primera iteración planteó Q3 como "expandir `utils/units.ts` (Q3-A) vs crear `utils/coords/` paralelo (Q3-B)". B1 invalidó ambas: `geometry/coords.ts` ya es el home natural y `geometry/index.ts` ya hace barrel export. Las opciones reales son sub-granularidades dentro de `geometry/`.

**Opciones descartadas upfront por B1:**
- ❌ Q3-A (expandir `utils/units.ts` con coord helpers): duplicaría lo que `geometry/coords.ts` ya provee.
- ❌ Q3-B (crear `utils/coords/` paralelo): duplicaría `geometry/`, fragmentaría el home semántico.
- ❌ Q3-C (co-locate helpers junto a consumidores, e.g., `utils/cloth/conversions.ts`): genera N homes domain-specific cuando ya hay un home central. Considerado y descartado por inconsistencia con la infra existente.

**Opciones reales (Q3-D-1 vs Q3-D-2): granularidad dentro de `geometry/`.**

### Opción Q3-D-1 — Archivos hermanos en `geometry/`

**Forma:**
```
src/utils/geometry/
├── coords.ts            (existente — screenToPattern; agregar screenToPatternLength)
├── units.ts             (NUEVO — cmToM, mToCm, mmToM, mToMm, cmToMm, mmToCm + branded types si Q2)
├── boundaries.ts        (NUEVO — metresToImporter, importerToMetres para Cat C)
├── (resto de archivos sin cambios)
└── index.ts             (re-export todos los nuevos)
```

**Pros concretos:**
- Layer separation explícita: cada archivo tiene un propósito claro y comentable arriba.
- Tests más localizados: `__tests__/units.test.ts`, `__tests__/boundaries.test.ts` siblings.
- Crecimiento del módulo no obliga a refactorizar — simplemente nuevos archivos.
- D3 territory queda claro: `formatDimension` se queda en `utils/units.ts` legacy hasta que D3 lo mueva. `geometry/units.ts` es internal conversion only, sin display.
- Cada caller importa exactamente lo que usa; el barrel `geometry/index.ts` mantiene la convención existente.

**Contras concretos:**
- 2-3 archivos nuevos en una primera entrega (cost upfront chico, pero no cero).
- "boundaries.ts" como nombre puede ser ambiguo (¿qué boundaries?). Alternativas: `meshUnits.ts`, `importerBridge.ts`. Naming refinable en commit del helper.
- Imports más verbosos si se importa directo: `from '../utils/geometry/units'` vs `from '../utils/geometry'`. El barrel mitiga.

### Opción Q3-D-2 — Todo dentro de `coords.ts` expandido

**Forma:**
```
src/utils/geometry/
├── coords.ts            (existente expandido — screenToPattern + screenToPatternLength + cmToM/mmToM/etc + boundaries)
├── (resto sin cambios)
└── index.ts             (sin cambios — barrel ya re-exporta de coords.ts)
```

**Pros concretos:**
- Un solo archivo. Cero archivos nuevos.
- Discoverability máxima: nuevo dev busca "coords" y encuentra todo.
- Sin barrel work — `index.ts:3` ya re-exporta `screenToPattern`; agregar exports al mismo file es trivial.

**Contras concretos:**
- `coords.ts` crece de 17 a ~80-120 líneas con 4-5 responsabilidades distintas (point conversion, length conversion, units conversion, boundary mapping).
- "Where does X go?" se vuelve menos claro al crecer: ¿el helper de Cat C va aquí o en otro lado? Si todo va aquí, `coords.ts` deja de ser específicamente "coordinate space conversion" y se vuelve "all conversions".
- Tests del archivo crecen junto: `coords.test.ts` cubre múltiples conceptos en un solo file.
- Si más adelante D3 quiere agregar display formatters, hay tentación de meterlos también acá → drift dentro del unify.

### Cómo se ve el caller después

Comparación concreta de `garmentPlacement.ts:150` (`m.height / 100`):

```ts
// Q3-D-1:
import { cmToM } from '../geometry/units';      // o
import { cmToM } from '../geometry';             // con barrel
const h = cmToM(m.height);

// Q3-D-2:
import { cmToM } from '../geometry/coords';     // o
import { cmToM } from '../geometry';             // con barrel
const h = cmToM(m.height);
```

Diferencia material en el callsite: solo el path si se importa directo. Con barrel, son idénticos.

### Dónde cae la documentación

- Q3-D-1: cada submódulo tiene su propio header doc + `geometry/README.md` opcional con overview.
- Q3-D-2: header doc de `coords.ts` describe múltiples áreas + comentarios por sección.

Q3-D-1 se autodocumenta vía estructura; Q3-D-2 requiere disciplina de comments para mantener el archivo legible.

### Recomendación

**Q3-D-1 con confianza media-alta.**

Razonamiento:
1. La separación de concerns (point conversion / units / boundaries) es genuina, no estética. Cada uno tiene tests propios y consumers distintos.
2. `geometry/` ya tiene granularidad de archivos (15 archivos por concept). Q3-D-1 sigue la convención del módulo.
3. Si Q2 elige branded types, `units.ts` se vuelve home natural para los type definitions; meterlos en `coords.ts` rompe la lectura.
4. Q3-D-2 ahorra ~1 file en upfront cost pero acumula deuda de "where does X go?" en cada nuevo helper.

**Pero no pre-decido.** Vos decidís entre D-1 y D-2.

---

## 4. Decisión Q2 — Branded types

**No pre-decido.** Tradeoff escrito (per tu instrucción explícita: "no podemos seguir difiriendo").

### Qué cuesta el boilerplate

#### 4.1 Construction friction

Cada literal numérico que entra al sistema branded necesita un constructor o cast:

```ts
// Hoy
const defaultHeight = 170;
const margin: number = 10;

// Con branded types
const defaultHeight: Cm = cm(170);
const margin: Mm = mm(10);
```

Sites afectados (estimación tras grep): ~80-150 callsites donde un literal pasa a una función o se asigna a un campo de measurement. La mayoría en defaults, tests, copilot tool definitions.

#### 4.2 Library interop friction

Three.js y Math no entienden branded types:

```ts
const h: Metres = mToCm(170 as Cm);
const halfH = h / 2;                 // FAIL — h/2 returns number, not Metres
camera.position.y = h;               // FAIL — Three.js espera number
```

Cada operación aritmética devuelve `number` plano, hay que re-brand. Sites afectados: ~20-40 ops aritméticas que hoy compilan implícitamente.

Mitigaciones posibles:
- Helpers `add(a: Cm, b: Cm): Cm`, `scale(a: Cm, k: number): Cm`. Verboso pero type-safe.
- Cast pattern `unwrap()` / `as number`. Type-safe roto en cada cast — pero localizable y greppeable.
- `// eslint-disable-next-line` por site que sea library interop.

#### 4.3 Test ergonomic friction

Tests que assertean `expect(piece.length).toBe(150)` necesitan adapter pattern. ~30-50 sites en `*.test.ts` que comparan measurements directamente.

### Qué atrapa el compiler

#### 4.4 Bugs reales que se eliminan

**Categoría 1: cm/mm cross-mixing.** ~10-15 sites donde puede pasar (mayoría en `easeTracking.ts` y `garmentPlacement.ts`).

**Categoría 2: pattern XY vs screen XY swap.** La aritmética que coincide en shape `{x: number, y: number}` no se distingue por nombre. La clase de bug emparentada — el cast `as unknown as BodyMeasurements` en `src/utils/avatar/avatarLibrary.ts:70` — fue parte de los errores capturados en [#627](https://github.com/sssamuelll/openclo/issues/627) (closed) y **sigue presente como workaround**.

**Categoría 3: meters vs millimeters at avatar boundary.** Los 4 markers C6-impl nacen porque `targetHeightMm` es mm pero el caller piensa en metros.

#### 4.5 Bugs documentables ahora pero no contados

Sin telemetry de bugs históricos por causa unit-mismatch, no puedo cuantificar el ROI. Lo que sí sé, verificado:

- `src/utils/avatar/avatarLibrary.ts:70` — `return out as unknown as BodyMeasurements` (vigente en main al 2026-04-29). Branded types lo eliminan por construcción.
- Los 4 markers `// C6-impl:` (`AvatarModel.tsx:193,199`, `avatarCollisionMesh.ts:24,30`) son comments documentando lo que branded types harían automáticamente.
- D drift (issue #639) tiene 5 sitios `* 10` en `easeTracking.ts` que documentan inline lo que branded types harían explícito.

Indicios cualitativos: ~6 ocasiones documentadas en comments / issues / casts.

### Sub-opciones evaluadas

#### Q2-A: branded types completos (Cm + Mm + Metres + PatternXY + ScreenXY + WorldXYZ)

- Atrapa todas las clases de bugs descritos.
- Cost upfront: alto (~6-10 archivos modificados solo para definiciones, ~80-150 callsites).
- Long-term: drift de unidad desaparece como clase.

#### Q2-B: solo unit-level branded types (Cm + Mm + Metres), sin spatial

- Atrapa cm/mm cross-mixing y meters-at-boundary.
- NO atrapa pattern XY vs screen XY (la clase del cast `avatarLibrary.ts:70`).
- Cost: ~40-60% del costo de Q2-A.

#### Q2-C: sin branded types, solo helpers nombrados

- Atrapa bugs por **convención** (developer ve `cmToMm` y entiende que el target es mm), no por compiler.
- Cost: bajo (~10-20 sites por categoría).
- Es el costo "puro" del unify de las conversiones inline.

#### Q2-D: branded types solo en boundaries críticos (Mm + Metres) — **NUEVA opción agregada post self-review**

> **Contexto**: el adversarial self-review identificó que Q2-A/B/C son tres puntos en una recta de "ningún branded → todos los branded", pero hay un punto orthogonal: branded **solo donde la clase de bug es documentable**.

**Forma:**
- `Mm` y `Metres` brand para la API de `importMesh` (`targetHeightMm: Mm`) y para `BodyMeasurements` storage (`height: Cm`).
- Los 4 markers C6-impl + el cast en `avatarLibrary.ts:70` se cierran por construcción.
- Nada más en el codebase usa branded types — los 16 archivos de Cat F operan en `number` plano via helpers nombrados.

**Pros:**
- Atrapa **5 de los 6 sitios documentables** (Cat 3 completa + el cast del cast `avatarLibrary.ts:70`).
- Cost upfront mínimo: ~5-10 callsites de boilerplate (los que cruzan los boundaries).
- No paga por las áreas donde no hay evidencia de bug recurrente.

**Contras:**
- Inconsistencia visible: parte del codebase con types, parte sin. Onboarding cognitive load alto.
- Boundary entre branded y non-branded queda como "donde hay convention", lo cual es exactly el problema que branded types intentan resolver.
- Si la decisión revisable de Q2 dispara y eventualmente vamos a Q2-A, Q2-D fue un detour: no preserva todo el valor de la migration completa.
- No atrapa Cat 1 (cm/mm cross-mixing en `easeTracking.ts`) ni Cat 2 (pattern XY vs screen XY swap).

**Versus Q2-C:** Q2-D atrapa 1 clase más (Cat 3 completa) al costo de inconsistencia. Versus Q2-A: Q2-D paga ~5% del costo y captura ~30% del valor (5 de 6 sitios documentables, pero sin las 2 clases sistémicas).

### Mi recomendación: Q2-C con confianza media

Razonamiento:

1. **Los bugs documentables son pocos relativos al costo.** ~6 sitios contables vs ~80-150 callsites para Q2-A, ~5-10 para Q2-D. Con la evidencia actual, helpers nombrados + grep capturan el ~80% del valor a una fracción del costo.
2. **Q2-B es middle ground sin gran ganancia.** Ya descartado: si pagás boilerplate, paga el completo (Q2-A); si no querés pagarlo, Q2-C ya es el 80%.
3. **Q2-D es tentador pero introduce inconsistencia estructural.** El argumento "branded solo donde duele" es razonable pero crea dos lenguages en el mismo codebase (branded en avatar boundary, plain en pattern editor). El cognitive load del onboarding sube — exactamente lo que Q2-C buscaba evitar.
4. **Posponer no preserva opcionalidad gratis.** Introducir branded types en 6 meses cuesta lo mismo o más; el codebase crece. Lo que ganamos posponiendo es no comprar certeza falsa hoy. Sin telemetry de bug-history y sin roadmap de copilot expansion, Q2-A o Q2-D serían pagados based on hunch. Q2-C deja la opción abierta a un costo realista posterior.

**Pero** mi confianza es **media** específicamente porque:
- No conozco bug-history del proyecto.
- Si el roadmap incluye más copilot tool generation (LLM-written code), branded types compran mucho más.
- Si Q2-D se elige por su localización de cost, la sección 11 (Decisión revisable) podría reabrir Q2 cuando la inconsistencia se vuelva problema.

Vos sabés lo que yo no sé acá. Si decidís Q2-A, Q2-B, o Q2-D, el doc se ajusta y la migración cambia. Mi número de S/M/L (sección 6) asume Q2-C; si la decisión es Q2-A → XL, Q2-D → L+, Q2-B → L grande.

---

## 5. Snapping thresholds — clarificación

> **Corrección post self-review (2026-04-29)**: la primera iteración afirmó "los 3 callsites son los únicos en el codebase". Cuenta corregida: **13 sites** (lista en sección 2.2).

### Semántica

Son **delta conversions** (pixel-distance → pattern-distance), no point conversions. La fórmula `N / zoom` traduce "N screen pixels" a "N/zoom pattern mm". No tienen `pan` offset porque no son una posición sino una longitud (pan no afecta distancias).

Conceptualmente: misma operación que la división por zoom en `(e.clientX - rect.left - pan2D.x) / zoom2D`, pero aplicada solo al delta (sin step de rect/pan).

### Decisión: incluir como helper sibling en el módulo C5

**Razón:**

1. La matemática es la misma (división por zoom). Codificarla como helper independiente es trivial.
2. **13 callsites distribuidos en 9 archivos** — centralizarlos elimina la clase de bugs "el threshold no escala con zoom" cuando alguien copia y olvida dividir.
3. Documenta la diferencia point/length explícitamente vía dos helpers nombrados:

```ts
screenToPatternPoint(e, rect, pan2D, zoom2D): { x: Mm, y: Mm }   // point conversion (= screenToPattern existente)
screenToPatternLength(px: number, zoom2D): Mm                     // length conversion (NUEVO)
```

4. Si Q2 elige branded types con `Mm`, la firma de `screenToPatternLength` lo ata explícitamente — los snapping thresholds dejan de ser numbers anónimos.

### Por qué no quedarse fuera con justificación

Considerado y descartado. Justificación: si los snapping son delta-only por semántica, esa información es útil capturada como helper, no como inline. Dejarlos fuera con comment ("`/zoom2D` sin pan porque es delta") sería deuda explícita; meterlos como helper es zero deuda. Con 13 sites, el commit de migración del snapping vale su peso en consistencia visible.

---

## 6. Estimación S/M/L

**Estimación: L grande (Large+, tirando a XL).**

### Razonamiento

Asumiendo Q2-C (helpers nombrados, sin branded types) y Q3-D-1 (archivos hermanos en `geometry/`):

#### Files touched

- **Created:** ~2-3 (`geometry/units.ts`, `geometry/boundaries.ts`, opcional `__tests__/*` separados).
- **Modified:**
  - Categoría A (5 archivos).
  - Categoría B (3 archivos).
  - Categoría C (2 archivos, los 4 markers).
  - **Categoría F: 16 archivos** (corregido post self-review, no 11).
  - **Snapping: 9 archivos** (corregido post self-review, no 1).
  - `geometry/coords.ts` extendido con `screenToPatternLength`.
  - `geometry/index.ts` actualizado con nuevos exports.
  - Tests (~3-4 archivos nuevos + actualización de `coords.test.ts`).

**Total: ~33-37 archivos creados/modificados.**

> **Corrección post self-review**: la primera iteración estimó ~22-25 archivos basado en conteo subestimado de Cat F (11 vs real 16) y de snapping (3 vs real 13 distribuidos en 9 archivos). El conteo correcto sube el size de L a L+/XL chico.

#### Conceptual change

- 4-5 helpers nuevos exportados con signatures definidas (units cmToM/mmToM family + boundaries metresToImporter/importerToMetres + screenToPatternLength).
- Si Q3-D-1: 2-3 archivos nuevos en `geometry/`.
- 33+ sitios cambian de `/100`, `/1000`, `(client - rect.left - pan)/zoom`, `N/zoom` a llamadas nombradas.
- `screenToPattern` existente se ratifica + adopta en 20 callsites (cierre parcial de #642).

#### Risks

- Comportamiento idéntico antes/después: alta confianza en Cat A (test indirecto + helper unit test), alta confianza en Cat B (helper unit test cubre contrato), media en Cat C (no test end-to-end, agregar test mínimo en helper commit), media en Cat F (helper existente + tests + adoption mecánica), alta en snapping (matemática trivial).
- Performance: las conversiones inline son una división; helpers son una función call. JIT-compiled, idéntico. No risk.
- Type errors: si Q2-A o Q2-B/D, riesgo material; si Q2-C, mínimo.

#### Si Q2-A (branded types completos)

- Se vuelve **XL claro**.
- ~40-60 archivos adicionales modificados (callsites con literals).
- Tests refactor: ~30-50 sites.
- TS error count puede subir temporalmente durante migration; cada sub-commit cierra una clase.

#### Si Q2-D (branded en boundaries)

- Se vuelve **L+/XL chico**.
- ~10-15 archivos adicionales (boundary callsites + adapter at `BodyMeasurements` storage).
- Tests: ~5-10 sites adicionales.

### Tiempo estimado (rough, con buffer explícito)

- **Q2-C + Q3-D-1: 9-13 horas** de trabajo continuo.
  - 3 helpers nuevos con sus tests (1.5-2h).
  - Adopción de `screenToPattern` existente en 20 callsites (1h).
  - 5 commits de migración por categoría con gates (vitest + tsc + eslint) entre cada uno (5-7h).
  - Buffer explícito para test fixing: si algún test existente falla por sutilezas (precisión float, mock paths, signatures), se respeta el principio "stop, reportá, no improvises". Suma 1-2h en el peor caso.
  - Anchor docs en CLAUDE.md (0.5h, ya commiteado).
  - El conteo previo de 6-9h asumía Cat F = 11 archivos y snapping = 3 sites. La corrección a 16 archivos + 13 sites + adopción de helper existente sube el rango realista a 9-13h.
- **Q2-A + Q3-D-1: 16-22 horas, 10-14 commits.** Branded types se introducen primero, después se migran callsites por categoría. Buffer del 30-40% sobre la estimación nominal por la volatilidad de TS errors en cascada.
- **Q2-D + Q3-D-1: 12-16 horas, 9-12 commits.** Branded types contenidos a boundary; resto es Q2-C.

---

## 7. Plan de migración bocetado (post-decisión)

Asumiendo Q2-C + Q3-D-1 como ejemplo. Si decisión cambia, el plan se ajusta.

> **Cambio post self-review**: el plan original tenía 10 commits, incluyendo "feat: crear coords/pattern.ts con screenToPatternPoint". Ese commit se elimina porque `geometry/coords.ts:screenToPattern` ya existe con tests. Plan baja a **8 commits**.

**Branch:** `drift/c5-coord-systems-transforms` (existente, ya tiene `bc2be60` + `2a69f60` + `001ea93` + este commit del doc).

Commits propuestos (atómicos, cada uno pasa gates):

1. **docs (este commit, segunda iteración)**: doc Fase 2 corregido + cross-refs a #639, #640, #642.
2. **feat**: crear `src/utils/geometry/units.ts` con `cmToM`, `mToCm`, `mmToM`, `mToMm`, `cmToMm`, `mmToCm`. Tests en `src/utils/geometry/__tests__/units.test.ts`. Re-export desde `geometry/index.ts`.
3. **feat**: extender `src/utils/geometry/coords.ts` con `screenToPatternLength(px, zoom): number`. Tests siblings en `coords.test.ts` (caso aritmético simple).
4. **feat**: crear `src/utils/geometry/boundaries.ts` con `metresToImporter(m): number` (returns mm) y `importerToMetres(scene): void` (mutates scale). Tests sibling con mock de `THREE.Scene`. Re-export desde index.
5. **refactor**: migrar Categoría B (3 sites mm→m) — `garmentPlacement.ts:185`, `layerOffsets.ts:89`, `fitMaps.ts:209`.
6. **refactor**: migrar Categoría A (5 archivos cm→m) — `garmentPlacement.ts:150-161`, `Mannequin.tsx:136`, `useSimulationLifecycle.ts:178`, `ClothMesh.tsx:240`, `Viewport3D.tsx:655`.
7. **refactor**: migrar Categoría C (4 markers C6-impl) — `AvatarModel.tsx`, `avatarCollisionMesh.ts`. Marker comments se eliminan en este commit. Cierra parte del scope de #642 (los avatares no son Cat F, pero la regla "use canonical helper" se aplica).
8. **refactor**: migrar Categoría F + snapping (16 archivos point + 13 sites length). Adopta `screenToPattern` existente y `screenToPatternLength` nuevo. Cierra #642. Por volumen, puede ser commit único o dividirse en dos (point primero, length después). Decisión a tomar al ejecutar — pero ambos pasan gates idénticos.

> **Política de mid-flight discoveries (M4 — agregada post self-review):** si un commit de migración revela que un helper signature necesita ajuste, **stop, no improvisar**. Abrir un commit nuevo `feat: extend <helper>` (con tests sibling) antes del commit de migración que lo necesitaba. Mantener atomicidad. NO amend de commits anteriores en el branch (regla del workflow). Reportar a Sam si el cambio de signature implica cambio en la decisión de Q2/Q3.

Cada commit pasa `npx tsc -b --noEmit && npx eslint --max-warnings=0 <archivos> && npx vitest run <relevantes>`.

> **CLAUDE.md anchor** (regla 1 v2): ya commiteado separadamente como `001ea93` antes de este commit del doc — atomicidad rule 8.

---

## 8. Comportamiento idéntico antes/después

Verificación obligatoria por commit. La equivalencia matemática es trivial en todas las categorías; lo no-trivial es **qué tests existentes la cubren end-to-end**. Auditado al 2026-04-29 + corregido post self-review.

### Categoría A — Body cm → world m

**Cobertura honesta:** el helper unit test (`cmToM(168) === 1.68`) en commit 2 es la garantía primaria del contrato. El test inline en `garmentPlacement.test.ts:84-87` (`'skirt is at waist height'`):

```ts
const waistH = 168 * 0.55 / 100; // ~0.924
expect(p.position[1]).toBeLessThan(waistH + 0.1);
```

…computa `waistH` localmente como expected literal; **valida la posición Y de la skirt, no la conversión cm→m directamente**. Si yo introduzco un bug compensatorio en `cmToM` Y en la fórmula `h * 0.55` simultáneamente, el test pasa. La cobertura de `cmToM` es **incidental**, no **dirigida**.

> **Reformulado post self-review (Sam preguntó precisamente por esto)**: lo que sostiene la confianza en Cat A es el **unit test directo del helper en commit 2**. El test inline en `garmentPlacement.test.ts:86` agrega cobertura incidental como bonus, no como garantía primaria.

### Categoría B — Pattern mm → world m

**No tiene test end-to-end existente** que valide `mm/1000 === mmToM(mm)` integrado. Pero la fórmula es la más simple del set y el unit test del helper en commit 2 cubre el contrato directamente. Suficiente.

### Categoría C — Avatar boundary m ↔ mm (4 markers C6-impl)

**Parcialmente cubierta.** `src/utils/import/__tests__/meshImporter.test.ts` cubre `detectFormat`, `detectUnit`, `isSupportedFormat`, `DEFAULT_IMPORT_LIMITS`, file size limits. **NO** hay test directo del flujo integrado `targetHeightMm = height * 1000` + `scene.scale.multiplyScalar(0.001)` en `AvatarModel.tsx` ni `avatarCollisionMesh.ts`.

**Acción requerida:** en commit 4 (helper boundaries), agregar tests:
- `metresToImporter(1.7) === 1700` (returns number; signature unificada — ver B4 abajo).
- `importerToMetres(scene)` aplica `scale.multiplyScalar(0.001)` y verifica con un mock de `THREE.Scene` (assert `scene.scale.x === 0.001` post-call).

> **Signature unificada (B4 fix):** la primera iteración tenía signature inconsistente entre sección 7 (`metresToImporter(m): Mm`) y sección 8 (`metresToImporter(1.7).valueMm === 1700`). Resuelto a `metresToImporter(m: number): number` que returns mm como number plano (Q2-C). Si Q2 cambia a A/B/D, la signature se ata a `Mm` brand consistentemente en commit 4.

### Categoría F — Screen → pattern (point conversion)

**El helper existente tiene tests.** `src/utils/geometry/__tests__/coords.test.ts` cubre `screenToPattern` con 4 casos (identity, zoom, pan, svgRect offset). Los 20 callsites que hoy reproducen la fórmula inline **se migran a importar este helper**. Si la fórmula del helper cambia, los tests existentes regresionan.

**No se requieren tests adicionales para Cat F point**. La adopción del helper existente cierra el contrato.

### Categoría F — Snapping length

**No cubierta por tests existentes.** Auditado: ningún test en `geometry/__tests__/` cubre el patrón `N/zoom` aislado.

**Acción requerida:** en commit 3 (extender `coords.ts`), agregar test mínimo:
- `screenToPatternLength(10, 2) === 5`.
- `screenToPatternLength(8, 1) === 8` (identity).

### Resumen de gates por commit

- **Commits 2-4** (helpers): cada uno trae sus tests sibling. Los tests cubren el contrato del helper.
- **Commits 5-8** (migración por categoría): existing tests de `garmentPlacement.test.ts`, `Mannequin.test.tsx`, `meshImporter.test.ts`, `useSlashAndSpreadTool.test.ts`, `coords.test.ts` deben pasar sin modificación. Si rompen: stop, reportá, no improvisás fix (per Sam, política reforzada en M4 arriba).

---

## 9. Issues out-of-scope linkeadas

- **#639** (severity:medium) — D drift (cm↔mm intra-system en ease/grading/seamly, 9 sites). Migrará cuando C5 deje API estable.
- **#640** (severity:low) — `units.ts:formatDimension` no usado en 8 sitios. D3 territory; migración separada.
- **#642** (severity:medium) — `geometry/coords.ts:screenToPattern` no usado en 20 callsites. **Cierre parcial dentro de C5** (commits 7-8 del plan migran Cat F). Si C5 mergea con migración completa de F, #642 cierra automáticamente.

Las tres referenciadas explícitamente; cualquier futura iteración de C5 debe verificar que estos issues siguen abiertos antes de cerrar el branch (excepto #642 que C5 cierra).

---

## 10. Decisiones tomadas (2026-04-29, post-Sam)

### Q3 — Module colocation: **Q3-D** (expandir `geometry/`)

El home natural ya es `src/utils/geometry/` con `coords.ts` exportando `screenToPattern` desde el 2026-03-05. La opción de crear `utils/coords/` paralelo (Q3-B original) o expandir `utils/units.ts` (Q3-A original) queda descartada por B1 — duplicarían la infra existente.

**Sub-opción Q3-D-1 vs Q3-D-2: pendiente de decisión por Sam** (ver sección 3). Recomendación: D-1 con confianza media-alta.

El display formatter `formatDimension` queda en `src/utils/units.ts` (legacy) — eventualmente se moverá a `src/utils/display/units.ts` cuando D3 entre en scope, pero ese movimiento es trabajo de D3, no de C5.

### Q2 — Branded types: **Q2-C** (recomendado)

Helpers nombrados, sin branded types. Los ~6 sitios documentables no justifican el costo de ~80-150 callsites de boilerplate. Helpers nombrados + grep capturan el ~80% de la disciplina por convención.

Q2-D (branded en boundaries) evaluado y recomendado descartar por inconsistencia estructural — pero queda como alternativa documentada si decidís escoger un middle ground.

### Q-snapping: incluir como `screenToPatternLength`

13 sites del patrón `N/zoom` (no 3 como afirmó la primera iteración). Entran al módulo como helper sibling. La separación point/length es semántica genuina, no overhead.

---

## 11. Decisión revisable: criterios para reabrir Q2 como RFC

Q2-C cierra **hoy** sin quemar la opción de Q2-A en el futuro. La adopción posterior de branded types cuesta lo mismo o más, pero hoy no compramos certeza falsa. Para evitar deferir indefinidamente, fijamos triggers objetivos que reabren Q2 como RFC dedicado:

1. **≥3 bugs nuevos por unit-mismatch reportados en los próximos 6 meses** (a partir del 2026-04-29). Cuenta cualquier bug donde la causa raíz documentada sea mezcla cm/mm, screen↔pattern coord swap, o m↔mm cross al borde de `importMesh`.
2. **Expansión material del roadmap de copilot tool generation.** Si entra en scope generar código LLM-written que toque measurements, `BodyMeasurements`, o coord systems, el ROI de branded types sube significativamente (LLMs son particularmente susceptibles a unit-mixing silencioso).
3. **C6-impl o D drift (#639) revela patrones de bug que branded types habrían atrapado.** Si durante la implementación o el follow-up de #639 surge un bug que branded types prevendrían por construcción, ese hallazgo cuenta como evidencia.

Cualquiera de los tres triggers reabre Q2 con un RFC dedicado, no automáticamente como sub-task de C5. El RFC reevalúa con la nueva evidencia y decide entre Q2-A, Q2-B, Q2-D, o "mantener Q2-C con triggers actualizados".

Esta sección es **load-bearing**: sin estos triggers, Q2-C sería deferral cobarde. Con ellos, es decisión informada con camino de regreso.

---

## 12. Lo que NO sigue de este doc

- Fase 3 (migración) arranca cuando este commit del doc + `001ea93` están en main vía PR ready/merged.
- No hay branded types introducidos.
- No hay tocado D drift (#639) ni display formatters (#640) — ambos son follow-ups separados.
- #642 cierra dentro del scope de C5 (commits 7-8 del plan) — único follow-up que C5 cierra directamente.

**FIN.**
