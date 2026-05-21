# Step 3 — Garment placement fix for #556/#531 (originally labeled "#527")

**Fecha:** 2026-05-19
**Contexto:** tercer paso del programa de cierre del epic #506 (sewing pipeline). Sigue al `2026-05-18-step2-test-flakes-and-e2e-rojo.md` que estableció el baseline DoD (4195 vértices bajo waist en male_shirt.json).

## TL;DR

Lo que el informe ROI listó como **#527 ("Internal Line stores pattern-space coords as piece-local")** estaba **mal diagnosticado** en su mapeo al cluster del DoD. La causa real del baseline 4195 es **#556 ("Garment placement falls back to circle when category=unknown")** manifestándose como **#531 ("pieces fall as loose panels")** — la misma cadena causal, dos números de issue. Fix aplicado en `src/utils/cloth/garmentPlacement.ts`. Verificación pendiente: re-correr el e2e DoD y medir nuevo baseline.

## El viraje de diagnóstico

Empecé a ejecutar #527 confiando en el informe ROI. Después de leer el código:

1. `useLineTool.ts:55-56` **ya hace la conversión** pattern→local (`state.startPoint.x - offX, state.startPoint.y - offY`). El bug como está titulado en #527 no vive ahí. Idem `useNotchTool.ts:85` y `useGrainlineTool.ts:59, 71`.
2. `pieceBuilder.ts:141` inicializa `internals: []` para piezas vía Seamly adapter. **Male shirt no tiene internal lines de origen** — entonces incluso si el bug de #527 viviera en otro lado, no podría producir el síntoma del baseline (4195 vertices below waist).
3. La cadena causal real del baseline:
   - Seamly converter genera names `A1, A2, ..., A36` (técnicos, no semánticos).
   - `seamlyAdapter.ts` no setea `piece.category` ni `piece.side` (verificado: cero matches en grep).
   - `detectBodyRegion(piece)` → `category` undefined → `detectFromName("A1")` → ninguna regex multilingüe (FRONT_RE/BACK_RE/SLEEVE_RE/etc.) matchea → devuelve `'unknown'`.
   - `placeGarmentPieces` líneas 293-309: **todas las piezas** caen al fallback "unknown" → distribuidas en círculo a `midTorso = 1.23 m`.
   - Bajo gravedad, las piezas caen, se atrapan en el cilindro del avatar a Y≈0.84 m. Esto es exactamente el `lowestY=0.837 / waistY=1.044` del baseline.

El informe ROI conflactaba el TÍTULO de #527 (sobre InternalLine) con el RAZONAMIENTO de "pieces que empiezan en coords incorrectas y caen". Esas son dos cosas distintas: internal lines viven dentro de una pieza, no determinan dónde se posiciona la pieza en 3D.

**Implicación para futuras priorizaciones**: cuando un informe te dé un número de issue + un fix-location específico, leé el código antes de ejecutar. El informe ROI tenía buena estructura pero un mismatch en este eje. Lección barata acá; cara si hubiera arrancado el fix antes de leer.

## Fix aplicado

`src/utils/cloth/garmentPlacement.ts` — modificación a `placeGarmentPieces`:

**Antes**: si `region === 'unknown'`, pieza se ubicaba en un círculo a midTorso, distribuida por ángulo según `unknownIndex / unknownCount * 2π`. Cuando TODAS las piezas son unknown (caso Seamly), el círculo completo las distribuye 360° alrededor del avatar; muchas caen sobre los costados donde no hay cilindro para atraparlas → caen hasta el bottom del avatar.

**Después**: detectar el caso "todas son unknown" con `const allUnknown = unknownCount === pieces.length && pieces.length > 0`. Cuando se cumple, alternar:
- Piezas con índice par → `front-torso` placement
- Piezas con índice impar → `back-torso` placement
- X offset staggered dentro de cada grupo (`xOffset = (sideIndex - (halfCount - 1) / 2) * (shoulderWidth / halfCount)`) para que dos piezas del mismo grupo no compartan coords (evita NaN constraints en el solver).

Caso mixto (al menos una pieza clasificada): se preserva el circle fallback. Es UX feedback intencional ("user, please classify these"). El shortcut all-unknown solo aplica al caso patrón-completo-sin-categorías (típicamente Seamly).

### Test coverage

`src/utils/cloth/__tests__/garmentPlacement.test.ts` existía pero asumía el comportamiento de circle como contrato. Lo actualicé:

- Nuevo: `'all-unknown patterns: alternates front/back torso with X stagger (#556 fix)'` — verifica que para 3 unknowns: Z[0] < 0, Z[1] > 0, Z[2] < 0, y `Set(positions).size === 3`.
- Renombrado: `'unknown pieces include X rotation to stand upright'` → `'all-unknown pieces include X rotation to stand upright'` — mismo contrato, nombre más preciso.
- Nuevo: `'mixed-classification patterns keep the circle UX for the lone unknown'` — verifica que el circle sigue funcionando cuando hay piezas clasificadas + alguna desconocida.

### Lo que NO hizo este fix

- **No agregó inferencia de categoría en el seamlyAdapter.** Las piezas siguen llegando con `category: undefined`. El fix es mitigación en el placement, no upstream. Follow-up natural.
- **No tocó #527 strict-as-titled.** Si el bug InternalLine vive en otro lado (DXF converter, patternOps, dartEntity), sigue vivo. No bloquea el DoD; debería ser un sub-issue separado.
- **No mejoró la regex semántica.** `detectFromName` sigue dependiendo de palabras como "front" / "delantero" / etc. Si un patrón usa nombres en otro idioma o convención (e.g., "1", "2", "P1"), sigue cayendo al fallback.

## Expectativa del nuevo baseline

Con el fix:
- Las 17 piezas de male_shirt se distribuyen ~8 front + ~9 back (alternadas por índice).
- Posiciones iniciales: tangentes al avatar a 3 cm de gap.
- Bajo gravedad, el avatar collider debería atraparlas antes de que caigan bajo waist.

**Predicción**: `N` (vertices below waist) debería bajar significativamente. No necesariamente a 0 — sleeves siguen sin lugar correcto y posiblemente caen — pero de 4195 a una fracción.

Posibles resultados:
- **N ≈ 0**: hipótesis confirmada al 100%. #556 era el bottleneck único. Faltaría tocar #527 strict + #518 para casos no-male-shirt + sleeves correctas.
- **N entre 500 y 2000**: hipótesis parcialmente confirmada. Bajó pero no a 0 — probablemente las pieces de manga (sleeves) siguen cayendo porque también van a torso en vez de a la posición correcta de manga. Iterar.
- **N todavía ~4000**: hipótesis incorrecta. El fix no movió la aguja → revisar si el fix se está aplicando (¿allUnknown es true para male_shirt?), si el placement se está usando, etc.
- **N > 4195**: el fix introdujo regresión. Revertir y rethink.

Cualquier resultado es señal útil. Esa era la razón de tener el baseline.

## Verificación pedida

```bash
# 1) Confirmar que los tests unitarios pasan (incluyendo los nuevos)
npm run test -- src/utils/cloth/__tests__/garmentPlacement.test.ts

# 2) Confirmar que no se rompió nada del suite
npm run test

# 3) Medir el nuevo baseline DoD — esperado: N < 4195
npm run test:e2e -- dress-avatar-dod.spec.ts
```

Reportar:
- ¿Pasan los tests unitarios? (esperado: sí)
- ¿Pasa el resto del suite? (esperado: sí, aunque revisar si algún consumer de garmentPlacement asumía el círculo)
- Nuevo N del baseline + lowestY + waistY.

Si N baja sustantivamente → hipótesis confirmada, próximo paso es decidir si #506 ya está cerrado o si quedan piezas (probablemente sleeves) por arreglar.

Si N no se mueve o sube → reportar y paramos a rethink.

## Follow-up issues sugeridos

1. **`seamlyAdapter: infer piece.category from catalog metadata or piece geometry`** — el fix proper. Cuando la app carga un patrón del catálogo (vía Template Library), el catalog entry probablemente conoce el tipo de garment ("male_shirt" → categoría "shirt"); con eso se puede mapear pieces a categorías concretas. Alternativa: heurísticas geométricas (pieza grande+ancha = torso, larga+angosta = sleeve, etc.).
2. **`detectFromName: support Seamly-style technical names via heuristics`** — si la regex semántica falla, intentar inferir por bbox, número de nodos, etc. Más rebuscado que (1) pero útil para patrones de otras fuentes.
3. **`#527 strict: audit other creators of InternalLine for pattern→local conversion`** — barrer `dxf/converter.ts`, `patternOps.ts`, `dartEntity.ts` para verificar que la conversión se hace consistentemente. Probablemente cerrar #527 después del barrido (sea fix o confirmación).
4. **`seamlyAdapter: extract production properties (darts/notches/grainlines/seam-types)`** — ya documentado en `docs/plans/2026-05-18-seamly-adapter-production-properties.md`. Relacionado pero independiente.

## Addendum 2026-05-19 v2 — el fix v1 no movió el baseline; gap real era semántico, no estructural

Verificación post-v1: unit tests 28/28 OK, suite 9929/9929 OK, **e2e bit-idéntico** (4195/0.837/1.044). Determinismo perfecto → el fix `allUnknown` no se está ejerciendo en el path real del e2e.

Diagnosticé agregando una línea de instrumentación al e2e que captura el classification snapshot de las pieces post-load + pre-Dress. Resultado:

```json
{
  "total": 17,
  "withCategory": 0,
  "withSide": 0,
  "categories": {},
  "sampleNames": ["Yoke", "FrontPanel", "BackPanel", "Pocket", "PocketRound"]
}
```

**Tres revelaciones**:

1. **Mi inferencia inicial sobre los nombres estuvo mal**. Mi primer grep capturó nombres de PUNTOS de construcción (A1...A36), no de PIEZAS. Las piezas del male_shirt tienen nombres semánticos en inglés (Yoke, FrontPanel, BackPanel, Pocket×4, Cuff×2, Sleeve×2, Collar×4, Placket×2).

2. **El LLM (`analyzeGarment`) NO está corriendo** en el dev env (probablemente sin API key). Categories quedan undefined, sólo el `autoSew` fallback corre (que no asigna category).

3. **Algunas piezas SÍ matchean** la regex existente: FrontPanel, BackPanel, Cuff×2, ShortSleeve, FullSleeve, Collar×4 → 10 clasificadas correctamente. **Pero 7 no**: Yoke, Pocket×4, Placket×2. Esas 7 caen al circle fallback. Caso mixto → mi `allUnknown` no aplica → 7 piezas caen → 4195 vertices below waist.

### Fix v2 aplicado

`garmentPlacement.ts` — agregadas 3 regex multilingües que faltaban:

```ts
const YOKE_RE = /\b(yoke|canes[uú]|sprone|empi[èe]cement|sattel)/i;
const POCKET_RE = /\b(pocket|bolsillo|tasca|poche|tasche)/i;
const PLACKET_RE = /\b(placket|tapeta|patta|patte|knopfleiste)/i;
```

Más checks en `detectFromName`:
- `Pocket*` → front-torso (honors `BACK_RE` para BackPocket → back-torso).
- `Placket*` → front-torso (siempre).
- `Yoke` → back-torso por default (yoke típico de camisa va atrás); honors `FRONT_RE` para FrontYoke.

Order matters: chequeos de sub-piece (pocket/placket/yoke) van ANTES del genérico FRONT/BACK para preservar la semántica original (no perdés "esto es un pocket" si por casualidad "FrontPocket" matchearía FRONT_RE primero).

### Test coverage v2

3 tests nuevos en `garmentPlacement.test.ts`:
- `'detects yoke, pocket, and placket sub-pieces from name (#506 baseline fix)'` — cobertura básica de los 3 patrones + variantes Front/Back.
- `'multilingual sub-piece detection (yoke/pocket/placket)'` — Spanish/Italian/German equivalents.
- `'classifies all 17 pieces of male_shirt.json (regression for baseline #506)'` — checkpoint contra los nombres reales del template; bloquea regresión específica.

El fix `allUnknown` v1 sigue siendo útil para patrones genuinamente no-semánticos (e.g., archivos importados con names tipo "Piece1"); se mantiene.

### Expectativa renovada del baseline

Con v2: 0/17 piezas en male_shirt deberían devolver `unknown`. Todas pasan por `computePlacement(region, ...)` con su región real. **Predicción**: N debería bajar significativamente respecto del baseline 4195.

Si N → ~0: hipótesis confirmada al 100%, #506 muy cerca de cerrarse. Próximo paso obvio es decidir si quedan otros patrones (DXF, Skirts, etc.) por barrer o si el male shirt era suficiente baseline.

Si N baja pero queda alto (e.g., 1000-3000): probablemente las sleeves toggle L/R están mandando ambas al mismo lado, o el collar (4 piezas a misma posición) está stackeando. Iterar.

Si N no se mueve o sube: el nombre semántico no era el bottleneck. Rethink desde cero.

### Verificación pedida v2

```bash
# Tests unitarios — debe pasar 28 (originales) + 3 nuevos = 31 en cada proyecto
npm run test -- src/utils/cloth/__tests__/garmentPlacement.test.ts

# Suite completo (sin regresión)
npm run test

# El número que importa
npm run test:e2e -- dress-avatar-dod.spec.ts
```

Capturar de nuevo el classification snapshot (lo dejé instrumentado en el e2e). Esperado:
- `withCategory: 0` (sigue igual — la fix no toca category, solo body region) — está bien.
- N en el verdict debería ser distinto de 4195. Cualquier cambio es señal de que el fix activa.

## Addendum 2026-05-19 v3 — camelCase fix + el bit-identity sigue, 3 hipótesis

Verificación post-v2: 2 unit tests FAIL (ShortSleeve, FullSleeve siguen unknown), e2e **bit-idéntico otra vez** (4195/0.837/1.044).

### Bug del camelCase (cosa 1, arreglado)

`SLEEVE_RE = /\b(sleeve|...)/i` no matchea "ShortSleeve" porque en camelCase no hay word-boundary entre "Short" y "Sleeve". Afecta a cualquier keyword que no esté al inicio del nombre. Fix: `splitCamelCase()` inserta espacios en transiciones camelCase + letra/dígito antes de matchear ("ShortSleeve" → "Short Sleeve"). Aplicado en `detectFromName`. Esto arregla los 2 unit tests y es robusto para todos los nombres camelCase futuros.

### El bit-identity (cosa 2, sin resolver — punto de inflexión)

`placeGarmentPieces` SÍ alimenta las posiciones iniciales (verificado leyendo GarmentSimulation.tsx:211-314: el output va tanto a la geometría de render como a `placedMeshes` que entran al solver). Entre v1 y v2 cambió drásticamente cuántas piezas van al círculo (v1: 9, v2: 2). Sin embargo el N final es **bit-idéntico**. Tres explicaciones:

1. **Vite stale** (`reuseExistingServer: true` en playwright.config.ts). Si había un vite corriendo en :5174 desde antes de v1, el e2e corre contra bundle viejo y ninguno de los cambios llegó al browser. Vitest sí los ve (de ahí que los unit tests cambien). **Barato de descartar: matar vite + re-correr.**
2. **La sim converge al mismo equilibrio sin importar init.** Significaría que nada sostiene la tela (pinning/colisión rota) — el placement es irrelevante porque cae igual. Bug real, pero en la capa física, no en placement.
3. **El criterio del DoD está mal.** Una camisa cubre hasta la cadera; "vértices debajo de waist" puede ser drape normal. lowestY=0.837 (no es piso Y=0) es consistente con camisa colgando a nivel cadera. Si es esto, hemos estado persiguiendo un no-bug.

### Próximo paso de verificación (descarta hipótesis 1)

```bash
# Matar cualquier vite stale en :5174 antes de correr
# (Linux/Mac):
lsof -ti:5174 | xargs -r kill -9
# (o en Windows): netstat -ano | findstr :5174  → taskkill /PID <pid> /F

# Unit tests — ahora deberían pasar los 3 nuevos (camelCase fix)
npm run test -- src/utils/cloth/__tests__/garmentPlacement.test.ts

# E2E con server fresco
npm run test:e2e -- dress-avatar-dod.spec.ts
```

Si N se mueve → era vite stale, los fixes v1/v2/v3 funcionan, seguir.
Si N sigue 4195 con server fresco → hipótesis 2 o 3. Decisión estratégica:
- Investigar la capa física (pinning/colisión): ¿qué sostiene la tela contra gravedad?
- Revisar el criterio del DoD: capturar el bounding box completo de la tela (no solo "below waist") para distinguir "camisa drapeada con hem en cadera" de "paneles caídos al piso".

## Addendum 2026-05-19 v4 — CONCLUSIÓN: el male shirt YA se viste; el bug era el criterio del test

Diagnóstico geométrico decisivo (server fresco, screenshot + JSON):

```json
{
  "total": 30306, "torsoRadius": 0.153, "offBodyThreshold": 0.608,
  "waistY": 1.044,
  "bbox": { "x": [-0.796, 0.796], "y": [0.837, 1.786], "z": [-0.183, 0.183] },
  "offBody": 1404, "offBodyPct": 4.6,
  "nearFloor": 0,
  "belowWaist": 3912, "belowWaistPct": 12.9
}
```

**Screenshot (visto directamente por el agent)**: avatar masculino en T-pose con una camisa oscura reconocible envuelta sobre el torso (pecho, hombros, parte superior de espalda). Cero paneles en el piso, cero tela amontonada abajo. Drape no perfecto (algún overlap/sombra irregular) pero es claramente una camisa puesta, no paneles colapsados.

### Veredicto

El male shirt **se viste correctamente**. La evidencia es inequívoca:
- `nearFloor = 0` (0/30306) — nada colapsado al piso.
- `offBodyPct = 4.6%` — y ese 4.6% son las puntas de manga extendidas en T-pose (bbox x llega a ±0.796m = a lo largo de los brazos abiertos), no dispersión.
- `bbox y [0.837, 1.786]` — hombro/cuello a cadera, exactamente el rango de una camisa.

Los 3912 "vértices debajo de waist" (12.9%) son **el dobladillo normal de la camisa**, no paneles cayendo. El criterio original del DoD (`belowWaist === 0`) era incorrecto: una camisa de hombre cubre hasta media cadera, así que ~10-25% de sus vértices están naturalmente debajo de la línea de cintura.

### Implicación estratégica (importante)

El informe ROI declaró el cluster #506/#531 como "el blocker #1 del MVP — pieces fall as loose panels". **Para el male shirt, eso no es cierto con el código actual** — la camisa se drapea. El símbolo "#531 panels falling" o (a) fue arreglado en algún momento de los 40 PRs recientes sin cerrar el issue, o (b) nunca aplicó a este patrón, o (c) era una mala interpretación de un drape con hem bajo waist.

Esto NO invalida todo el cluster:
- Puede manifestarse en OTROS patrones (trousers, jacket, dress) que no probamos.
- El drape no es perfecto (overlaps visibles) — hay margen de calidad.
- Pero la afirmación "la camisa cae como paneles sueltos" es falsa para el escenario que el propio informe usó como ejemplo canónico.

### Fix v4 aplicado — criterio del DoD corregido

`dress-avatar-dod.spec.ts` assertion (b) reescrita. Antes: `belowWaist === 0`. Ahora tres condiciones que distinguen "vestida" de "caída":
1. `nearFloorPct < 5` — casi nada colapsado al piso.
2. `offBodyPct < 25` — la tela abraza el cuerpo (lenient para mangas en T-pose).
3. `maxY >= shoulderHeight * 0.85` — el garment llega a los hombros (cuelga del cuerpo, no apilado abajo).

Con los números actuales (nearFloor=0%, offBody=4.6%, maxY=1.786 vs shoulder*0.85=1.255), **el test ahora debería pasar (verde)**.

Esto convierte el test de "rojo intencional que documenta un bug" a "guard de regresión que pasa hoy y fallaría si las piezas vuelven a caer". Es exactamente lo que el DoD del #506 debería ser, solo que descubrimos que el estado actual YA lo cumple para el male shirt.

### Trabajo del paso 3 — balance

Aunque el "bug principal" resultó ser un criterio mal diseñado, el paso produjo valor real:
- Bug de clasificación camelCase arreglado (`splitCamelCase`) — afectaba ShortSleeve/FullSleeve y cualquier nombre camelCase. Real y con impacto medible (N 4195→3912).
- 3 categorías de regex faltantes agregadas (yoke/pocket/placket, multilingüe).
- Fix del fallback all-unknown (alternation+stagger) — útil para patrones sin nombres semánticos.
- Tests unitarios nuevos (34 pass) + regression del male_shirt.
- Harness de verificación con diagnósticos geométricos ricos.
- Criterio del DoD corregido a algo defendible.

### Verificación pedida v4 (debería ser verde)

```bash
npm run test:e2e -- dress-avatar-dod.spec.ts
```

Esperado: **PASS**. El garment cumple las 3 condiciones. Si pasa, el DoD del male shirt está cumplido y el test queda como guard de regresión.

### Próximos pasos posibles (decisión de Samuel)

1. Promover el test a CI gate (flip `continue-on-error: false`, agregar `e2e` a `ci-success.needs`) ahora que pasa.
2. Probar el DoD con OTROS patrones (trousers, jacket) — ahí #531 podría sí manifestarse.
3. Atacar la calidad del drape (overlaps visibles) — sub-issue de pulido, no de "se viste o no".
4. Re-evaluar todo el cluster #506 a la luz de que su ejemplo canónico ya funciona.

## Addendum 2026-05-19 v5 — multi-patrón: el bug SÍ es real (para patrones que no son el male shirt)

Generalicé el e2e a 5 patrones (Male Shirt, T-Shirt, Blouse, Jacket, Keiko Skirt) con criterio region-aware + screenshot por patrón. Resultado:

| Patrón | Status | seams | verts | offBody% | bbox.x | Veredicto real |
|---|---|---|---|---|---|---|
| Male Shirt | PASS | 29 | 30306 | 4.6% | ±0.796 | **drape real** (camisa reconocible, mangas extendidas) |
| T-Shirt | PASS* | 3 | 17963 | 0% | ±0.281 | **falso positivo** — panel suelto, sin mangas/espalda |
| Blouse | PASS* | 2 | 5146 | 0% | ±0.098 | **falso positivo** — pieza flotante minúscula |
| Jacket (Size 52) | FAIL | — | — | — | — | bug de test: regex `(Size 52)` sin escapar |
| Keiko Skirt | FAIL | — | — | — | — | overlay no cierra tras click — handleGenerate colgó/falló |

### El giro (otra vez)

En v4 concluí "el male shirt se viste, el informe ROI estaba equivocado". **Ahora con más patrones, la conclusión se invierte parcialmente**: el male shirt es el ÚNICO que se ensambla bien. T-Shirt (3 seams) y Blouse (2 seams) NO forman un garment — sus piezas caen sueltas cerca del torso y el criterio de geometría las deja pasar por casualidad (offBody=0% porque están cerca del eje, pero no porque estén cosidas).

Irónico: el informe ROI usó el male shirt como ejemplo CANÓNICO de "pieces fall as loose panels", y es justo el que funciona. Pero su tesis de fondo (hay un bug real de ensamblaje #518/#531) **es correcta** — solo que se manifiesta en los patrones simples, no en el complejo.

### Por qué el criterio de geometría daba falso verde

`offBodyPct` + `nearFloorPct` miden "¿está cerca del cuerpo?" pero NO "¿se ensambló en un garment?". Un puñado de piezas que spawnean cerca del torso y caen poquito pasan ambos. La señal que faltaba es **seams relativo a piezas** (assemblyRatio): male shirt 29/17≈1.7, blouse 2/N≈0.

### Fixes aplicados en v5

1. **Regex escaping en `pickTemplate`** — `name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')`. Arregla Jacket y cualquier nombre con paréntesis (Pants (Size 52), etc.).
2. **pieceCount + assemblyRatio en el diagnóstico** — para diseñar el umbral de ensamblaje con números reales (no adivinando como el MIN_SEAMS=15 original, que era shirt-specific).

### Pendiente de decisión (umbral de ensamblaje)

NO agregué todavía el gate de ensamblaje porque necesito los piece counts reales (T-Shirt/Blouse) para elegir un umbral defendible. La próxima corrida los revela. Candidato: `assemblyRatio >= 0.5` (cada pieza participa en ~1 seam en promedio) o `seams >= pieceCount - interfaceCount - 1`.

### Keiko Skirt — posible bug real

El overlay no cerró tras clickear la skirt → `handleGenerate` no completó. Puede ser: (a) el adapter falla para el patrón de falda, (b) hay un step de confirmación extra para bottoms, (c) el patrón es inválido. Requiere investigación aparte — es un dato interesante (¿el load de bottoms está roto?).

### Próxima corrida (data-gathering)

```bash
npm run test:e2e -- dress-avatar-dod.spec.ts 2>&1
```

Esperado: Jacket ahora carga (regex fixed) → da datos. Piece counts + assemblyRatio aparecen para todos. Skirt probablemente sigue fallando (overlay). Con esos números diseñamos el gate de ensamblaje y sabemos si Jacket se ensambla o no.

## Addendum 2026-05-19 v6 — CUADRO CONSOLIDADO: ambos bugs reales y reproducibles

Corrida data-gathering (regex fixed + pieceCount/assemblyRatio):

| Patrón | pieces | seams | ratio | Estado | Diagnóstico |
|---|---|---|---|---|---|
| Male Shirt | 17 | 29 | **1.71** | ✅ ensambla + drapea | (FAIL solo por timeout 35s>30s — flake, fix: bump a 60s) |
| T-Shirt | 5 | 3 | **0.6** | ❌ no ensambla | #518 — seams no se forman |
| Blouse | 2 | 2 | **1.0** | ❌ no ensambla | #518 |
| Jacket | 5 | — | — | ❌ cloth nunca mesha | **#527 REPRODUCIBLE** — coords en millones, viewport overflow |
| Keiko Skirt | — | — | — | ❌ overlay no cierra | bug aparte — handleGenerate cuelga (load de bottoms) |

### Diagnóstico final del cluster #506

Los dos bugs centrales del informe ROI **son reales** y ahora tienen síntoma reproducible y aislado:

**#527 (normalización de coordenadas)** — el Jacket lo muestra textbook: piezas en coords pattern-space crudas (millones de unidades), el 2D canvas se desborda, la geometría es tan grande que el CDT mesher no completa en 30s → cloth nunca aparece. **Importante**: NO es el bug que el informe ubicó en `useLineTool.ts` (esa conversión ya está bien). Es un bug de normalización a nivel de pieza que afecta a ciertos patrones (Jacket seguro, Skirt probable). El `male_shirt` no lo tiene porque sus coords salen normalizadas del converter; el Jacket no.

**#518 (formación de seams)** — T-Shirt (ratio 0.6) y Blouse (ratio 1.0) no cosen sus piezas. El `assemblyRatio` (seams/pieces) lo cuantifica limpiamente; ≥1.5 = ensamblado.

**#531 (drape)** — es downstream: solo el male_shirt llega a drapear porque es el único que pasa #527 (coords OK) Y #518 (seams OK). Los demás fallan antes.

### Por qué el informe ROI acertó en el fondo y erró en el ejemplo

El informe usó el male_shirt como ejemplo canónico de "pieces fall as loose panels". Es el ÚNICO patrón que NO tiene ese problema. Pero su tesis — que el sewing pipeline tiene bugs reales que bloquean el MVP — es correcta. Los bugs existen, solo que se manifiestan en los patrones simples (T-Shirt, Blouse) y en el complejo distinto (Jacket), no en el male_shirt.

### Fixes v6 aplicados

1. `test.setTimeout(60_000)` por test — elimina el flake del male_shirt (timeout wall-clock, no bug).
2. **Gate de ensamblaje** `assemblyRatio >= 1.5` como assertion separada de la geometría. Ahora el test:
   - Male Shirt: PASS (ensambla 1.71 + drape OK).
   - T-Shirt / Blouse: FAIL en assembly (ratio < 1.5) con mensaje que apunta a #518.
   - Jacket: FAIL en waitForClothMeshOrFail (coords → no mesh) con mensaje que apunta a #527.
   - Skirt: FAIL temprano (overlay no cierra).

El test ahora es un **mapa de regresión del cluster #506**: cada patrón que falla apunta a su bug específico con un mensaje accionable.

### Recomendación de re-priorización (con datos, no narrativa)

Orden sugerido para cerrar el cluster, por dependencia causal:
1. **#527 (coords)** primero — es el más upstream. Sin coords normalizadas no hay mesh (Jacket no llega ni a empezar). Síntoma reproducible: cargar Jacket, ver el 2D canvas desbordado. Target: encontrar dónde se normalizan las coords del adapter (el male_shirt sale bien, el jacket no → comparar los dos JSON o el path de adaptación).
2. **#518 (seams)** después — con coords OK, el problema es que los seams no se forman para patrones simples. Métrica: subir assemblyRatio de T-Shirt/Blouse a ≥1.5.
3. **Keiko Skirt / bottoms** — investigar por qué handleGenerate cuelga (puede ser #527 también).
4. **#531** se cierra solo cuando 1+2 estén bien para más de un patrón.

## Notas para el agent con GitHub access

Acciones sugeridas (opcionales):

1. **Comentar en #527**: "Investigado en step3. El título de este issue describe un bug en useLineTool.ts:55-56, pero la conversión pattern→local YA existe ahí. El bug listado como bottleneck del DoD #506 era en realidad #556/#531 manifestándose vía garmentPlacement fallback. Fix aplicado en step3 doc. Si #527 strict (InternalLine coords) sigue viviendo en otros sitios — DXF/patternOps/dartEntity — habría que auditar; sino, candidato a cerrar."
2. **Comentar en #556/#531**: "Fix aplicado en step3 — garmentPlacement.ts ahora alterna front/back-torso cuando TODAS las piezas son unknown (caso Seamly puro). Esto cierra el síntoma 'pieces fall as loose panels' para male_shirt. Falta upstream: inferencia de categoría en seamlyAdapter (#follow-up nuevo)."
3. **Crear el follow-up** sobre inferencia de categoría en seamlyAdapter (item 1 de la lista arriba).

## Addendum 2026-05-21 v7 — #527 RESUELTO: era escalado de unidad, no normalización de InternalLine

Retomé el #527 partiendo del cuadro consolidado v6 (el Jacket como síntoma reproducible: coords gigantes → CDT mesher cuelga → cloth nunca meshea). Diagnóstico **guiado por dato**, midiendo el bounding box que produce `adaptSeamlyPattern` antes de asumir nada.

### Medición empírica (avatar por defecto: chest 96 / waist 80 / hips 100 / height 180 / shoulder 40 / armLength 60)

| Patrón | `unit` | bbox (mm, post-adapter) | Veredicto |
|---|---|---|---|
| Male Shirt | `cm` | 1480 × 1065 | normal (~1.5 m) |
| **Jacket (Size 52)** | `mm` | **10071 × 7886** | **10× inflado (~10 m)** |
| Keiko Skirt | `cm` | **NaN × NaN** | bug distinto (coordenada NaN) |

El Jacket÷10 ≈ 1007 × 789 mm — mismo orden de magnitud que el shirt. Eso aisló la causa a un factor ×10 espurio.

### Causa raíz

`src/utils/seamly2d/seamlyAdapter.ts`, bloque de normalización al final de `adaptSeamlyPattern`, hardcodeaba:

```ts
// Seamly2D coordinates are in cm — convert to mm (OpenClo standard)
const CM_TO_MM = 10;
```

La premisa "todo patrón Seamly viene en cm" es **falsa**. Varios patrones reales declaran `"unit": "mm"`: `jacket1_52-176`, `jacket2-6`, `pants1_52-176`. Multiplicar coords que YA están en mm por 10 las infla a ~10 m. El 2D canvas se desborda y el CDT mesher (`cdtMesher.ts`) no termina en el presupuesto del e2e → la tela nunca meshea. El `male_shirt` (cm) nunca tuvo el problema porque ×10 es correcto para él — por eso el bug solo aparecía en ciertos patrones.

**Nota sobre el título histórico del #527**: el informe ROI lo ubicó en `useLineTool.ts` (conversión InternalLine pattern→local). Eso ya estaba bien (confirmado en v1). El bug real era de escalado de unidad a nivel de adapter, no de InternalLine. Mismo número de issue, sitio distinto — consistente con el patrón de mismatches del ROI documentado en v1.

### Fix aplicado

`seamlyAdapter.ts` — escala según la unidad declarada en vez de hardcodear 10:

```ts
const unit = (pattern.unit ?? 'cm').toLowerCase();
const TO_MM = unit === 'mm' ? 1 : (unit === 'inch' || unit === 'in') ? 25.4 : 10;
```

`TO_MM` reemplaza a `CM_TO_MM` en todo el bloque (puntos, `resolvedCommands`, y valores numéricos de las curve definitions). Unit-less default a cm (×10) para preservar el comportamiento de los fixtures sintéticos de los tests. Esto refleja la convención que `seamlyTools.ts:235` ya usaba (`patternData.unit === 'cm' ? 10 : 1`) — el adapter simplemente no la seguía. La ruta del e2e (`TemplateLibrary.handleGenerate` → `adaptSeamlyPattern` → `buildPiece`, sin escalado extra) hace del adapter el único punto canónico de normalización.

### Patrones que se benefician

Todos los `unit: mm`: `jacket1_52-176`, `jacket2_40-146`, `jacket3_40-146`, `jacket4_40-146`, `jacket5_30-110`, `jacket6_30-110`, `pants1_52-176`. Antes salían 10× inflados; ahora caen a rango físico (~1 m). Los patrones cm (male_shirt, tshirt, blouse, trousers, etc.) quedan **idénticos**.

### ¿La Keiko Skirt comparte la causa? — NO

La Keiko Skirt es `unit: cm`, así que el factor ×10 no la afecta. Su bbox sale **NaN** (al menos un punto de construcción resuelve a NaN), y en el e2e su síntoma es que el overlay no cierra (`handleGenerate` cuelga/falla). Es un bug **distinto** del #527 — probablemente una fórmula o un step de construcción que produce NaN, no escalado de unidad. Queda como follow-up aparte.

### Test de blindaje

Nuevo: `src/utils/seamly2d/__tests__/coordinateNormalization.test.ts`. Carga `jacket1_52-176` vía `adaptSeamlyPattern` y verifica bbox < 5000 mm por dimensión (falla con el código viejo a ~10 m, pasa con el fix). Casos extra: el jacket no debe ser >3× el shirt una vez ambos en mm; el shirt (cm) no debe colapsar (guarda contra regresión del path cm). `testTimeout` a 15 s + `console.warn` silenciado para no flake bajo carga paralela del suite (comparte worker con `e2ePipeline.test.ts` de ~40 s).

### Verificación (gates + e2e, corridos en entorno con npm/terminal nativo)

- `npx tsc -b --noEmit` → limpio.
- `npm run lint` → 0 errores (de paso limpié 2 unused-vars pre-existentes en `dress-avatar-dod.spec.ts`: `MIN_SEAMS_FOR_DRESS` y la función `waitForSimulationToSettleOrTimeout`, sobras de los gates v4-v6).
- `npm run test` → 9941 passed / 0 failed / 18 skipped. Incluye el suite completo de `seamly2d/__tests__/` (137 tests) + el nuevo de normalización.
- `npm run test:e2e -- dress-avatar-dod.spec.ts`, caso "Jacket (Size 52)": **el cloth ahora SÍ meshea**. Pasa `waitForClothMeshOrFail` y llega al diagnostic snapshot:
  ```
  pieces=5, seams=3, assemblyRatio=0.6,
  geometry={"total":3320, "bbox":{"x":[-0.639,0.492],"y":[0.547,1.285]}, "offBodyPct":1.3, "nearFloorPct":0, "maxY":1.285}
  ```
  3320 verts, bbox ~1.13 m × 0.74 m — rango físico correcto, sin overflow. Luego FALLA en el assert `assemblyRatio >= 1.5` con `assemblyRatio 0.6 < 1.5 — pieces did not sew into a garment`. **Ese fallo es el #518 (formación de seams), NO el #527.** El objetivo del #527 — que el Jacket llegue a producir un mesh con coordenadas razonables — está cumplido.

### Estado del cluster #506 tras este paso

- **#527 (coords)** → CERRADO. Escalado unit-aware en el adapter. Jacket + pants + jackets 2-6 desbloqueados a nivel meshing.
- **#518 (seams)** → sigue abierto. Ahora es el bloqueante del Jacket (ratio 0.6), T-Shirt (0.6) y Blouse (1.0). Próximo en la cadena causal.
- **Keiko Skirt** → bug aparte (NaN / overlay), no #527. Follow-up independiente.
- **#531 (drape)** → downstream; solo el male_shirt llega hoy porque es el único que pasa #527 + #518.
