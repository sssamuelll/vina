# Fase 2 — C5: Coord systems & transforms

**Status:** decision-only para las dos preguntas abiertas (módulo colocation, branded types). Plan de migración bocetado al final, ejecución pendiente de tu verde sobre las dos decisiones.

**Eje:** C5 — Coord systems / transforms (`drift-inventory-fase1.md` axis C5, classification `(b)` decisión).

**Branch:** `drift/c5-coord-systems-transforms`.

**Pre-requisitos resueltos:**
- C6 (units, `drift-fase2-c6-units.md`) ratificó cm para body, mm para pattern. C5 hereda esa decisión.
- C8 (mesh import, `drift-fase2-c8-mesh-import-bypass.md`) ya aterrizó `importMesh` canónico. Los 4 markers `// C6-impl:` que C8 dejó en `AvatarModel.tsx` + `avatarCollisionMesh.ts` los cierra C5 cuando aterrice.

---

## 1. Qué decide C5 y qué NO decide

### Decide

1. **Dónde vive el módulo de conversiones** (Q3): expandir `src/utils/units.ts` o crear `src/utils/coords/` paralelo.
2. **Si introducir branded types** para distinguir unidades y espacios (Q2): `Cm`/`Mm`/`Metres` y `PatternXY`/`ScreenXY`/`WorldXYZ`.
3. **API canónica** de las conversiones que hoy están scattered:
   - Body cm → world m (cat. A en read-only).
   - Pattern mm → world m (cat. B).
   - Avatar boundary m ↔ mm (cat. C, los 4 markers).
   - Screen pixels → pattern mm (cat. F).
4. **Si los snapping thresholds** (`N / zoom2D` en PatternEditor.tsx:283, 324, 364) entran en el mismo módulo o quedan inline con justificación.

### NO decide

- **Migración de valores persistidos.** Storage formats no cambian; ningún `.openclo` ni `Project` JSON existente se rompe (C6 ya decidió no migrar).
- **D3 territory** (forms, `MeasurementInput`, display unit selector). El módulo C5 lo consume D3 cuando aterrice; C5 no diseña D3.
- **D drift (cm↔mm intra-system)** en ease/grading/seamly. Capturado como follow-up en issue **#639** (severity:medium). Migra cuando C5 deja la API estable.
- **`units.ts:formatDimension` no usado en 8 sitios.** Display layer drift, capturado en issue **#640** (severity:low). D3 territory.
- **mm² ↔ cm² area conversions** (e.g., `bomExport.ts:147 areaMM2 / 100`). Adyacente, distinto axis.

---

## 2. Estado actual del codebase (data, no propuesta)

### 2.1 Pre-existing infra (regla 1)

`src/utils/units.ts` — 1 función pública:

```ts
export function formatDimension(valueMm: number, units: UnitSystem): string;
```

Display-only formatter (mm → "X.X cm" / "X.X mm" / "X.X in"). Cubre el render de strings para UI; no tiene helpers para coord systems ni branded types.

`src/utils/geometry/` — directorio existente. Contenido relevante: utilidades puramente geométricas (puntos, paths, distancias). No hace conversiones de unidad ni espaciales sistemáticas. No es candidate para colocation de C5.

**No existen**: `src/utils/coords/`, `src/utils/transforms/`, ni branded types en ningún archivo (verificado por grep).

### 2.2 Drift map completo (consolidado del read-only del 2026-04-29)

#### Categoría A — Body cm → world m (5 archivos, 11 conversiones)

- `src/utils/cloth/garmentPlacement.ts:150-161` — 6 fields (`m.height/100`, `m.chest/100`, `m.hips/100`, `m.waistHeight/100`, `m.shoulder/100`, `m.armLength/100`).
- `src/components/Viewport3D/Mannequin.tsx:136` — `measurements.height * 0.01 * 0.93` (magic constants combinadas: cm→m + 93% factor).
- `src/components/Viewport3D/useSimulationLifecycle.ts:178` — `... .height) / 100`.
- `src/components/Viewport3D/ClothMesh.tsx:240` — `... .height) / 100`.
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

#### Categoría F — Screen pixels → pattern mm (11 archivos, 14 pares de coords)

`(e.clientX - rect.left - pan2D.x) / zoom2D` literal en:

- `PatternEditor.tsx:278-279, 551-552, 577-578` (3 pares).
- `useEditorInteractions.ts:241-242, 439-440` (2 pares).
- `useRectangleTool.ts:45-46`, `useLineTool.ts:35-36`, `useScissorsTool.ts:49-50`, `useMergeTool.ts:39-40`, `useTransformTool.ts:58-59`, `useExtendTrimTool.ts:52-53`, `useSlashAndSpreadTool.ts:481-482` (7 pares).
- `useEditPattern.ts:99-100` — variante con `pan.x`/`zoom` (rename local del mismo state).

Adicional: `PatternEditor.tsx:283 (10/zoom2D)`, `:324 (8/zoom2D)`, `:364 (6/zoom2D)` — **delta-only conversions** (pixel-distance → pattern-distance) sin pan offset. Semántica distinta (longitud vs punto) pero misma matemática base. Tratamiento decidido en sección 4.

### 2.3 Por qué los `clientX/clientY` no son simplemente `getBoundingClientRect` boilerplate

Los 14 pares no son boilerplate de DOM — son la **conversión de coordinate space**. La fórmula `(client - rect.left - pan) / zoom` codifica:

1. Resta del rect offset (DOM → SVG-local pixels).
2. Resta del pan (SVG-local → world-space pixels with pan).
3. División por zoom (pixels → mm en pattern space).

Cada uno de los 14 pares puede ser silenciosamente roto si alguien:

- Olvida restar `pan2D` (clicks se desplazan al hacer pan).
- Olvida dividir por `zoom2D` (clicks se rompen cuando hay zoom).
- Confunde X con Y al copiar el pattern (pasa).

Los tres bugs son posibles y triviales de introducir. Centralizarlos elimina la clase.

---

## 3. Decisión Q3 — `units.ts` expansion vs nuevo módulo

**No pre-decido.** Tradeoffs explícitos.

### Opción Q3-A: expandir `src/utils/units.ts`

**Forma:**
```
src/utils/units.ts
├── formatDimension (existente, display)
├── cmToM, mToCm
├── mmToM, mToMm
├── cmToMm, mmToCm
├── screenToPatternPoint (event, rect, pan, zoom) → {x, y}
├── screenToPatternLength (px, zoom) → mm
└── (opcional) branded types Cm/Mm/Metres
```

**Pros concretos:**
- Un solo archivo importable: `from '../utils/units'`.
- Discoverability: nuevo dev busca "units" y encuentra todo.
- Bajo costo de file movement: `units.ts` ya existe, solo crece.
- Display formatter y conversión interna comparten conceptos (mm es central) — coherente.

**Contras concretos:**
- `units.ts` se vuelve módulo de ~200-400 líneas con 4-5 responsabilidades distintas (display + conversion + spatial + branded types).
- Mezcla layers: `formatDimension` es presentational (depende de `UnitSystem` que es UI state); `cmToM` es low-level math. Importarse mutuamente no es necesario pero co-habitan.
- Si más adelante D3 quiere modificar `formatDimension` y C5 quiere modificar `cmToM`, ambos tocan el mismo archivo (merge conflicts pequeños pero recurrentes).
- "Where does X go?" se vuelve menos claro al crecer: ¿el nuevo helper de `mm² → cm²` va aquí o en otro lado?

### Opción Q3-B: crear `src/utils/coords/` con submódulos

**Forma:**
```
src/utils/coords/
├── index.ts (re-export)
├── units.ts (cmToM, mmToM, cmToMm + branded types si Q2 sí)
├── pattern.ts (screenToPatternPoint, screenToPatternLength, pattern↔world)
└── boundaries.ts (importer m↔mm para avatar — los 4 markers C6-impl)

src/utils/units.ts (legacy, queda solo formatDimension; o se mueve a src/utils/display/units.ts)
```

**Pros concretos:**
- Layer separation explícita: low-level units, spatial transforms, integration boundaries.
- Cada archivo tiene un propósito claro y documentable arriba.
- `formatDimension` queda en display layer (D3 territory natural). C5 no toca display.
- Crecimiento del módulo no obliga a refactorizar — simplemente nuevos archivos en `coords/`.
- Tests más localizados: cada archivo tiene su `__tests__/` sibling con scope claro.

**Contras concretos:**
- 4-5 archivos nuevos en una primera entrega (cost upfront).
- Imports más verbosos: `from '../utils/coords/units'` o `from '../utils/coords'` (con index re-export).
- Si `formatDimension` se mueve, ~8+ callers existentes (pero ya están migrando per issue #640, así que pasa de paso).
- Inicial puede sentirse over-engineered si C5 termina con solo 3-4 helpers.
- "coords" como nombre puede no cubrir bien `mm↔cm` (que es unit, no coord). Posibles names alternativos: `units/`, `space/`, `geometry/units`, `transforms/`.

### Cómo se ve el caller después

Comparación concreta de `garmentPlacement.ts:150` (`m.height / 100`):

```ts
// Q3-A:
import { cmToM } from '../utils/units';
const h = cmToM(m.height);

// Q3-B:
import { cmToM } from '../utils/coords/units';      // o
import { cmToM } from '../utils/coords';            // con index re-export
const h = cmToM(m.height);
```

La diferencia material en el callsite es solo el path de import. Ambas opciones eliminan el `/100` literal igual.

### Dónde cae la documentación

- Q3-A: arriba de `units.ts`, sección comentada por área.
- Q3-B: cada submódulo tiene su propio header + `coords/README.md` opcional con overview.

Q3-B se autodocumenta vía estructura; Q3-A requiere disciplina de comments.

### Recomendación con confianza media

**Q3-B**, confianza **media-alta**.

El factor decisivo: si C5 incluye branded types (Q2 sí), el módulo crece a un nivel donde la separación de concerns paga. Si C5 NO incluye branded types (Q2 no), Q3-A es más liviano y suficiente. **Q3 depende parcialmente de Q2** — vale resolverlas juntas.

Si tu decisión sobre Q2 es "branded types sí" → recomiendo Q3-B con alta confianza.
Si tu decisión sobre Q2 es "branded types no" → la elección entre Q3-A y Q3-B baja a preferencia estilística; ambas son defendibles.

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
const defaultHeight: Cm = cm(170);   // o cm`170` con tagged template
const margin: Mm = mm(10);
```

Sites afectados (estimación tras grep): ~80-150 callsites donde un literal pasa a una función o se asigna a un campo de measurement. La mayoría en defaults, tests, copilot tool definitions.

#### 4.2 Library interop friction

Three.js y Math no entienden branded types:

```ts
const h: Metres = mToCm(170 as Cm);  // OK
const halfH = h / 2;                 // FAIL — h/2 returns number, not Metres
                                      // Necesita: metres(h / 2) o unwrap helper

camera.position.y = h;               // FAIL — Three.js espera number
                                      // Necesita: camera.position.y = unwrap(h) o (h as number)
```

Cada operación aritmética devuelve `number` plano, hay que re-brand. Sites afectados: ~20-40 ops aritméticas que hoy compilan implícitamente.

Mitigaciones posibles:
- Helpers `add(a: Cm, b: Cm): Cm`, `scale(a: Cm, k: number): Cm`. Verboso pero type-safe.
- Cast pattern `unwrap()` / `as number`. Type-safe roto en cada cast — pero localizable y greppeable.
- `// eslint-disable-next-line` por site que sea library interop.

#### 4.3 Test ergonomic friction

Tests que assertean `expect(piece.length).toBe(150)` necesitan:

```ts
expect(piece.length).toBe(mm(150));   // o
expect(unwrap(piece.length)).toBe(150);
```

Existing tests: ~30-50 sites en `*.test.ts` que comparan measurements directamente. Cada uno necesita una de las dos formas.

### Qué atrapa el compiler

#### 4.4 Bugs reales que se eliminan

**Categoría 1: cm/mm cross-mixing.**

```ts
// Hoy (compila):
const seamAllowance = 10;             // (mm)
const margin = bodyMeasurements.chest; // (cm)
const gap = seamAllowance + margin;    // BUG — silently mixes units
```

Sites donde esto puede pasar (grep manual): ~10-15. La mayoría en `easeTracking.ts` y `garmentPlacement.ts`. Los autores conocen las unidades; pero un refactor o lectura cruzada lo rompe.

**Categoría 2: pattern XY vs screen XY swap.**

```ts
// Hoy (compila):
const click = { x: e.clientX, y: e.clientY };  // ScreenXY
findNearestVertex(piece.outline, click, snapDist); // espera PatternXY
```

Sites: el inventario reporta TS error #627 que es exactamente esta clase. La aritmética que coincide en shape (`{x: number, y: number}`) no se distingue por nombre. Hoy: drift documentada en comments. Con branded types: compiler error inmediato.

**Categoría 3: meters vs millimeters at avatar boundary.**

Los 4 markers C6-impl nacen porque `targetHeightMm` es mm pero el caller piensa en metros. Cualquiera puede pasar `height * 1` (asumiendo implícitamente ya está en mm) y crashear silenciosamente.

```ts
// Con branded types:
type ImporterOptions = { targetHeightMm: Mm };
importMesh(url, file, { targetHeightMm: height });  // FAIL si height es Metres
                                                     // OK con: targetHeightMm: mToMm(height)
```

#### 4.5 Bugs documentables ahora pero no contados

Sin telemetry de bugs históricos por causa unit-mismatch, no puedo cuantificar el ROI. Lo que sí sé:

- `avatarLibrary.ts:70` es un cast vergonzoso (`Record<string, number> as BodyMeasurements`) que existe porque el TS no reconoce que el mapping es cm. Branded types lo eliminan.
- TS error #627 lo causa.
- Los 4 markers `// C6-impl:` son comments documentando lo que branded types harían automáticamente.
- D drift (issue #639) tiene 5 sitios `* 10` en `easeTracking.ts` que documentan inline lo que branded types harían explícito.

Indicios cualitativos: 3+ ocasiones documentadas en comments / issues / casts que branded types resolverían por construcción.

### Qué se gana en doc / mental load

- Los `// cm → mm` comments dejan de ser necesarios. La firma `cmToMm(x: Cm): Mm` lo dice.
- Refactoring es safe: cambiar la unidad de un campo lanza compile errors en cada caller, fix-then-compile loop guides.
- LLM-coding-friendly: copilot tools tienen menos forma de generar código que mezcla unidades silenciosamente.
- Onboarding: nuevos devs leen tipo, no comments inline desactualizables.

### Qué se pierde

- ~80-150 sitios cambian signature en una sola pasada (cost upfront medido en horas, no días, pero significativo).
- Boilerplate visible en cada arithmetic op aritmética cruzada. ~20-40 sites ganan helpers o casts.
- Tests fixing pass.

### Recomendación con confianza media-baja

Tres lecturas posibles, en orden de costo/beneficio:

#### Q2-A: branded types completos (Cm + Mm + Metres + PatternXY + ScreenXY + WorldXYZ)

- Atrapa todas las clases de bugs descritos.
- Cost upfront: alto (~6-10 archivos modificados solo para definiciones, ~80-150 callsites).
- Long-term: drift de unidad desaparece como clase.

#### Q2-B: solo unit-level branded types (Cm + Mm + Metres), sin spatial

- Atrapa cm/mm cross-mixing y meters-at-boundary.
- NO atrapa pattern XY vs screen XY (la clase del TS error #627).
- Cost: ~40-60% del costo de Q2-A.

#### Q2-C: sin branded types, solo helpers nombrados

- Atrapa bugs por **convención** (developer ve `cmToMm` y entiende que el target es mm), no por compiler.
- Cost: bajo (~10-20 sites por categoría).
- Es el costo "puro" del unify de las conversiones inline.

**Mi recomendación: Q2-C con confianza media.**

Razonamiento:

1. **El audit no es momento de imponer un refactor de tipos del tamaño que requiere Q2-A.** Branded types se introducen mejor cuando hay decisión consciente del equipo de pagar el boilerplate, no como side effect de un drift unify. Imponerlos en C5 es mezclar dos decisiones (centralizar conversiones + introducir branded types) en una; cada una merece su evaluación.
2. **Los bugs documentables son pocos.** TS error #627 + 4 markers C6-impl + cast en avatarLibrary.ts. ~6 sitios totales. Branded types valen su costo cuando los bugs son recurrentes y caros, no cuando son evitables con grep.
3. **Q2-B es middle ground sin gran ganancia.** Si pagás boilerplate, paga el completo (Q2-A); si no querés pagarlo, helpers nombrados ya son 80% de la disciplina. Q2-B atrapa solo mitad de las clases sin ahorrar mitad del cost.
4. **Branded types son additive.** Si en 6 meses la drift de unidad reaparece o aparece nueva, el equipo puede introducir branded types entonces, sobre la base limpia que C5 deja con Q2-C. No quemamos opcionalidad.

**Pero** mi confianza es **media-baja** específicamente porque:

- No conozco bug-history del proyecto. Si en el último año hubo 5+ bugs por unit-mismatch, mi recomendación se invierte hacia Q2-A.
- Si el roadmap del equipo incluye más copilot tool generation (LLM-written code), branded types compran mucho más (LLMs son particularmente susceptibles a unit-mixing).
- La "introducción gradual" que propongo es genuinamente más fácil de prometer que ejecutar — los costos crecen con el código.

Vos sabés lo que yo no sé acá. Si decidís Q2-A o Q2-B, el doc se ajusta y la migración cambia. Mi número de S/M/L (sección 6) asume Q2-C; si la decisión es Q2-A, el size sube de L a XL.

---

## 5. Snapping thresholds (`PatternEditor.tsx:283, 324, 364`) — clarificación

Sites:
- `:283` — `const snapDist = 10 / zoom2D` (seamAllowance tool, vertex menu).
- `:324` — `const SEAM_THRESHOLD = 8 / zoom2D` (seam hit-test).
- `:364` — `const IL_THRESHOLD = 6 / zoom2D` (internal line hit-test).

### Semántica

Son **delta conversions** (pixel-distance → pattern-distance), no point conversions. La fórmula `N / zoom` traduce "N screen pixels" a "N/zoom pattern mm". No tienen `pan` offset porque no son una posición sino una longitud (pan no afecta distancias).

Conceptualmente: misma operación que la division por zoom en `(e.clientX - rect.left - pan2D.x) / zoom2D`, pero aplicada solo al delta (sin step de rect/pan).

### Decisión: incluir como helper sibling en el módulo C5

**Razón:**

1. La matemática es la misma (división por zoom). Codificarla como helper independiente es trivial (~3 líneas).
2. Los 3 callsites son los únicos en el codebase con esa forma. Centralizarlos elimina la duda de "¿por qué este `/zoom2D` no tiene pan?".
3. Documenta la diferencia point/length explícitamente vía dos helpers nombrados:

```ts
screenToPatternPoint(e, rect, pan2D, zoom2D): { x: Mm, y: Mm }   // point conversion
screenToPatternLength(px: number, zoom2D): Mm                     // length conversion
```

4. Si Q2 elige branded types con `Mm`, la firma de `screenToPatternLength` lo ata explícitamente — los snapping thresholds dejan de ser numbers anónimos.

### Por qué no quedarse fuera con justificación

Considerado y descartado. Justificación: si los snapping son delta-only por semántica, esa información es útil capturada como helper, no como inline. Dejarlos fuera con comment ("`/zoom2D` sin pan porque es delta") sería deuda explícita; meterlos como helper es zero deuda.

---

## 6. Estimación S/M/L

**Estimación: L (Large).**

### Razonamiento

Asumiendo Q2-C (helpers nombrados, sin branded types) y Q3-B (módulo `coords/`):

#### Files touched

- **Created:** ~3-4 (`coords/units.ts`, `coords/pattern.ts`, `coords/boundaries.ts`, opcional `coords/index.ts` o `coords/__tests__/*`).
- **Modified:**
  - Categoría A (5 archivos).
  - Categoría B (3 archivos).
  - Categoría C (2 archivos, los 4 markers).
  - Categoría F (11 archivos PatternEditor + 1 con snapping = 11 + 0 si snapping en mismo file = 11).
  - Tests (~3-4 nuevos archivos + actualización de existing tests donde se asserta sobre conversions).
- **Total: ~22-25 archivos creados/modificados.**

#### Conceptual change

- 4-5 helpers nuevos exportados con signatures definidas.
- Si Q3-B: estructura de directorio nueva.
- 18+ sitios cambian de `/100`, `/1000`, `(client - rect.left - pan)/zoom` a llamadas nombradas.

#### Risks

- Comportamiento idéntico antes/después: alto-confianza si los tests cubren bien (Categoría A tiene tests indirectos via simulation; Categoría F tiene cobertura via tool tests). Necesita verificación gates por commit.
- Performance: las conversiones inline son una división; helpers son una función call. JIT-compiled, idéntico. No risk.
- Type errors: si Q2-A o Q2-B, riesgo material; si Q2-C, mínimo.

#### Si Q2-A (branded types completos)

- Se vuelve **XL**.
- ~40-60 archivos adicionales modificados (callsites con literals que pasan a measurements).
- Tests refactor: ~30-50 sites.
- TS error count puede subir temporalmente durante migration; cada sub-commit cierra una clase.

#### Comparación con tu lectura inicial

Tu lectura: "L (~25 archivos tocados, 4 helpers nuevos, posibles branded types)". Mi número coincide sin branded types; con branded types completos sale XL. La discrepancia depende solo de Q2.

### Tiempo estimado (rough)

- Q2-C + Q3-B: 3-5 commits unify, ~4-6 horas de trabajo continuo (incluyendo tests). Cada commit pasa gates.
- Q2-A + Q3-B: 8-12 commits unify, ~10-15 horas. Branded types se introducen primero (enable type-checking errors), después se migran callsites por categoría.

---

## 7. Plan de migración bocetado (post-decisión)

Asumiendo Q2-C + Q3-B como ejemplo. Si decisión cambia, el plan se ajusta.

**Branch:** `drift/c5-coord-systems-transforms` (existente).

Commits propuestos (atómicos, cada uno pasa gates):

1. **docs**: este Fase 2 doc + cross-refs a #639 y #640.
2. **feat**: crear `src/utils/coords/units.ts` con `cmToM`, `mToCm`, `mmToM`, `mToMm`, `cmToMm`, `mmToCm`. Tests en `src/utils/coords/__tests__/units.test.ts`.
3. **feat**: crear `src/utils/coords/pattern.ts` con `screenToPatternPoint(e, rect, pan, zoom)` y `screenToPatternLength(px, zoom)`. Tests sibling.
4. **feat**: crear `src/utils/coords/boundaries.ts` con `metresToImporter(m): Mm` y `importerToMetres(scene): void` (o nombres equivalentes). Tests sibling.
5. **refactor**: migrar Categoría B (3 sites mm→m) — `garmentPlacement.ts:185`, `layerOffsets.ts:89`, `fitMaps.ts:209`.
6. **refactor**: migrar Categoría A (5 archivos cm→m) — `garmentPlacement.ts:150-161`, `Mannequin.tsx:136`, `useSimulationLifecycle.ts:178`, `ClothMesh.tsx:240`, `Viewport3D.tsx:655`.
7. **refactor**: migrar Categoría C (4 markers C6-impl) — `AvatarModel.tsx`, `avatarCollisionMesh.ts`. Marker comments se eliminan en este commit.
8. **refactor**: migrar Categoría F point conversions (11 archivos PatternEditor, 14 pares) — uno o dos commits según volumen.
9. **refactor**: migrar snapping thresholds (`PatternEditor.tsx:283, 324, 364`) a `screenToPatternLength`.
10. **docs**: anchor regla en CLAUDE.md "Units & coords" (pointer al módulo + convención cm body / mm pattern / m world).

Cada commit pasa `npx tsc -b --noEmit && npx eslint --max-warnings=0 <archivos> && npx vitest run <relevantes>`.

---

## 8. Comportamiento idéntico antes/después

Verificación obligatoria por commit:

- Sites de Categoría A: floats producidos por `m.height/100` deben ser idénticos a `cmToM(m.height)`. Ambos son `value/100`. Trivialmente equivalente.
- Sites de Categoría B: `mm/1000 === mmToM(mm)`. Trivial.
- Sites de Categoría C: los `* 1000` y `* 0.001` se sustituyen por `mToMm` y `mmToM`. Trivial.
- Sites de Categoría F: `(client - rect - pan) / zoom === screenToPatternPoint(e, rect, pan, zoom)`. Trivial pero requiere verificar que la firma del helper recibe `pan2D` y `zoom2D` como están en el caller (no `pan2D.x` desestructurado).
- Snapping: `N / zoom === screenToPatternLength(N, zoom)`. Trivial.

Tests existentes en `src/utils/cloth/__tests__/`, `src/components/PatternEditor/__tests__/` y simulation integration tests deben pasar sin modificación. Tests de los helpers nuevos en sus siblings.

---

## 9. Issues out-of-scope linkeadas

- **#639** (severity:medium) — D drift (cm↔mm intra-system en ease/grading/seamly, 9 sites). Migrará cuando C5 deje API estable.
- **#640** (severity:low) — `units.ts:formatDimension` no usado en 8 sitios. D3 territory; migración separada.

Ambas referenciadas explícitamente en sus respectivos README; cualquier futura iteración de C5 debe verificar que estos issues siguen abiertos antes de cerrar el branch.

---

## 10. Preguntas concretas para vos

Antes de pasar a Fase 3 (migración), necesito tres respuestas:

### Q3 — Module colocation: A o B?

- **Q3-A**: expandir `src/utils/units.ts`.
- **Q3-B**: crear `src/utils/coords/` con submódulos.

Mi recomendación: **Q3-B con confianza media-alta**, especialmente si Q2 elige branded types.

### Q2 — Branded types: A, B o C?

- **Q2-A**: completos (`Cm`/`Mm`/`Metres`/`PatternXY`/`ScreenXY`/`WorldXYZ`).
- **Q2-B**: solo unit-level (`Cm`/`Mm`/`Metres`).
- **Q2-C**: sin branded types, solo helpers nombrados.

Mi recomendación: **Q2-C con confianza media**. Con caveats: si tenés bug-history que sugiere unit-mismatch recurrente, o roadmap de copilot tool generation pesado, mi recomendación se inverta hacia Q2-A.

### Q-snapping — confirmás o redirigís?

Mi proposal: snapping thresholds **entran al módulo** como helper sibling `screenToPatternLength`. Justificación en sección 5.

Si preferís dejarlos fuera con justificación inline, decímelo.

---

## 11. Lo que NO sigue de este doc

- No hay código tocado todavía (working tree limpio post-doc commit).
- No hay PR pusheado todavía (esperando tu verde sobre Q2 + Q3 antes de Fase 3).
- No hay commits unify (Fase 3 viene después, atómicos por categoría).

**FIN.**
