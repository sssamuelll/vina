# Issue proposal: Seamly adapter — extract production properties (darts, notches, grainlines, seam types)

**Fecha:** 2026-05-18
**Tipo:** enhancement / technical-debt
**Relación:** follow-up de `#582` (Seamly deprecation epic), follow-up post-`#506` (sewing pipeline epic). Ver `docs/plans/2026-05-18-seamly-deprecation-epic-clarification.md` para el contexto que originó este issue.

---

## Texto listo para publicar como issue en GitHub

**Title**
Seamly adapter: extract production properties (darts, notches, grainlines, seam types)

**Labels**
`enhancement`, `area:adapter`, `area:seamly`, `severity:medium`, `follow-up:#582`, `non-blocking-for:#506`

**Body**

### Context

El `seamlyAdapter.ts` actual (`src/utils/seamly2d/seamlyAdapter.ts`, 370 LoC) mapea correctamente la **geometría** de los patrones Seamly2D — puntos, splines, splinePaths, arcs, operaciones (rotation/flip/move), fórmulas condicionales — y produce `CPiece[]` con outline cerrado de nodos (`PieceNode[]`). El audit del 2026-04-23 (`docs/audits/2026-04-23-codex-refactor-audit.md`, PR #576) lo calificó 8.3/10, 16/16 tests Seamly + e2e en verde.

Pero **no extrae propiedades constructivas de producción**, que son las que distinguen un patrón profesional cosible de un outline geométrico:

1. **Darts con propiedades**: `dartIntake`, `dartLeg1`, `dartLeg2`, apex, fold direction, cap shape. Seamly2D representa darts como series de puntos+líneas con metadata; el adapter las trata como puntos genéricos y descarta el rol "dart".
2. **Notches**: marcas de alineación entre piezas adyacentes (cruciales para el cosido). Seamly2D las codifica como nodos especiales en el outline de la pieza con tipo + geometría; el adapter las ignora.
3. **Grainlines**: dirección del hilo (lengthwise / crosswise / bias). Determinante para el comportamiento físico de la simulación y para el nesting al cortar. Seamly2D las define como líneas con flag especial; el adapter no las extrae.
4. **Seam types**: French / flat-felled / overlocked / lapped, etc. Per edge, no global. Seamly2D los almacena como metadata por edge; el adapter solo capta el `seamAllowance` global de la pieza.
5. **Internal vs construction lines**: Seamly distingue líneas de construcción (auxiliares, no se cortan) vs líneas internas (pliegues, costuras decorativas, que sí afectan la pieza final). El adapter trata ambas como nada — solo usa el outline cerrado.

### Por qué importa (y por qué NO es bloqueante de #506)

**Por qué importa:** el cosido producido por #506 sin estas propiedades produce dress con:
- Telas planas donde el patrón tenía darts modelados (silueta incorrecta).
- Alineación de costuras impredecible (sin notches el sewing algorithm tiene que adivinar correspondencias edge-a-edge).
- Drape físico incorrecto cuando la grainline no coincide con la asunción default del solver.
- Tipos de costura uniformes que en el patrón original eran intencionalmente distintos.

**Por qué NO bloquea #506:** el bug actual del demo (#531: "pieces fall as loose panels") sucede *antes* de cualquiera de estas consideraciones. Las pieces caen porque las coordenadas pattern-space están mal (#527), los edges son genéricos (#518) y el placement por categoría falla (#556). Cuando #506 quede verde con el DoD propuesto ("Dress Avatar produce un shirt drapeado sobre el torso"), el resultado **todavía no será** un dress de calidad profesional — pero será **un dress**. Este issue eleva la calidad después.

Cronología propuesta:
1. **Primero** #506 (resolver #527 + #518 + #556 + #531 + estabilizar #623).
2. **Después** este issue, en paralelo con audit Q2 / preparación v1.0.

### El dominio OpenClo ya tiene los tipos — el gap es solo en el adapter

Esto es clave para el dimensionamiento. El dominio interno ya soporta estas propiedades (no hay que inventar tipos):

| Propiedad | Tipo en dominio | Bridge / extracción | Tool UI | Ratificado en |
|---|---|---|---|---|
| Dart | `Dart` (`src/types/types.ts`) con `intake`, `apex`, `leg1Base`, `leg2Base`, `foldDirection`, `capShape` | `extractDartFromInternal` en `src/utils/dartEntity.ts` | — | Eje D1-real (`docs/reports/2026-04-30-drift-fase2-d1real-dart-internalline.md`) |
| GrainLine | `GrainLine` con `direction` (`lengthwise`/`crosswise`/`bias`), `angle`, `referenceEdge`, `path` | `extractGrainLine` en `src/utils/grainLine.ts` | `src/components/PatternEditor/useGrainlineTool.ts` | — |
| Notch | tipo existe (search `notch` en `src/types/types.ts`) | tests en `src/__tests__/notches.test.ts` | `src/components/PatternEditor/useNotchTool.ts` | — |
| InternalLine (storage) | `InternalLine` con `type: 'dart' \| 'grainline' \| ...` y `path: PathCommand[]` | almacenado en `PatternPiece.internals[]` | — | Eje D1-real |
| SemanticEdge | `SemanticEdge` con `name`, `edgeType` (`fold`, `hem`, `neckline`, ...) | usado por `extractGrainLine` para `referenceEdge` | — | — |

**Implicación:** este issue no requiere diseño de tipos nuevos en el dominio. Es exclusivamente trabajo de extracción en el adapter + propagación hasta el modelo OpenClo (`PatternPiece`), respetando el patrón storage-bridge ya ratificado en D1-real.

### Acceptance criteria

1. **El adapter extrae darts** desde construcciones Seamly que representen darts (típicamente: 3 puntos formando triángulo con metadata o naming convention). El output incluye `dartInfo` propagado al `PatternPiece` via `InternalLine{type:'dart'}` o equivalente. Cobertura mínima: `male_shirt.json` (probable: 0–2 darts), `gent_jacket_with_tummy.json` (probable: 4+ darts) producen darts correctamente extraídos.

2. **El adapter extrae notches**. Identifica nodos del outline que Seamly marca como notches y los emite como metadata por edge en el `PatternPiece` (no como nodos del outline). Test: un patrón con notches conocidos roundtripea sin perderlos.

3. **El adapter extrae grainline**. Encuentra la línea con flag de grainline en el XML/JSON Seamly y la propaga como `InternalLine{type:'grainline'}`, de modo que `extractGrainLine()` del dominio devuelva un `GrainLine` con `direction` válida (no `null`).

4. **El adapter extrae seam types por edge**. El `seamAllowance` deja de ser solo numérico global; por edge se propaga `seamType` cuando Seamly lo define. Estructura: extender el modelo de `CPiece` con `edges: { name, seamAllowance, seamType }[]` o equivalente.

5. **El adapter distingue internal vs construction lines**. Las líneas con flag `construction` se descartan; las `internal` se propagan como `InternalLine` con el tipo correcto.

6. **Sin regresión** en los 16 tests Seamly + e2e pipeline existentes.

7. **Test fixture nuevo**: un patrón Seamly de complejidad media-alta (puede ser `male_shirt.json`) con assertions explícitas sobre cuántos darts/notches/grainlines/edges-con-seamtype debería contener el `PatternPiece` resultante. Si en `male_shirt.json` no hay darts, escoger otro patrón del repo (`gent_jacket_with_tummy.json` casi seguro tiene).

### Archivos a tocar (estimación)

- `src/utils/seamly2d/seamlyAdapter.ts` (líneas ~280–329 del piece building; necesita un segundo paso después del outline para extraer internals; nuevo path para detectar darts/notches/grainlines en el `pattern.construction` y `pattern.pieces`).
- `src/utils/seamly2d/constructionResolver.ts` (probable: añadir tipos de step para `dart`, `notch`, `grainline` si no existen).
- `src/types/construction.ts` (extender `CPiece` con `internals?`, `edges?` para seam types per edge).
- `src/utils/seamly2d/__tests__/seamlyAdapter.test.ts` (cobertura nueva).
- `tools/seamly2d-converter/` (verificar que el converter de `.val` → JSON preserva la metadata necesaria; si no, este issue se extiende a tocar el converter también).

### Estimación

- Spike de 1 día para inspeccionar el XML/JSON Seamly de `gent_jacket_with_tummy` y mapear qué metadata de darts/notches/grainlines/seam-types está presente, qué está perdida por el converter actual, y qué hay que recuperar.
- 2–3 días por propiedad para implementación + tests (darts y notches son los más complejos; grainline y seam types más mecánicos).
- Total: **≈8–12 días-persona**. Paralelizable si el spike confirma que las propiedades son independientes en el XML.

### Risks

- **El converter `.val` → JSON podría haber perdido la metadata** en la fase de conversión upstream. Si es así, este issue se extiende al converter y la estimación sube. Mitigación: spike inicial confirma esto en horas.
- **Algunos patrones Seamly del catálogo público no marcan darts explícitamente** — los dibujan a mano como triángulos sin tag. En esos casos no se pueden extraer; documentar como limitación conocida.
- **Cambio de schema `CPiece`** rompe consumers de la API interna. Mitigación: campos opcionales (`internals?`, `edges?`), migración no-breaking.

### Non-goals

- **No** modificar el algoritmo de cosido (#506) en este issue. Este issue produce la *data*; el consumo de esa data por el sewing pipeline es trabajo aparte (probablemente un sub-issue).
- **No** redefinir los tipos del dominio (`Dart`, `GrainLine`, `InternalLine`, `SemanticEdge`) — usar los existentes, ratificados en eje D1-real.
- **No** soportar formato `.val` directamente; el flujo sigue siendo `.val` → JSON (vía `tools/seamly2d-converter/`) → adapter.

### Definition of Done

> Cargar `gent_jacket_with_tummy.json` (o equivalente con darts/notches/grainlines/seam-types reales) → el `PatternPiece` resultante tiene `internals` con darts y grainline correctamente clasificados, edges con seam types per edge cuando aplica, notches como metadata por edge; `extractGrainLine(piece)` y `extractDarts(piece)` del dominio devuelven entidades no-`null`. Cobertura ≥80% en el código nuevo del adapter. Test e2e que carga un patrón complejo y assert sobre estos campos verde tres ejecuciones consecutivas en CI.

### Referencias cruzadas

- Epic original: #582 (Seamly deprecation)
- Clarificación de scope: `docs/plans/2026-05-18-seamly-deprecation-epic-clarification.md`
- Sewing pipeline epic (que este issue NO bloquea): #506
- Audit del adapter actual: `docs/audits/2026-04-23-codex-refactor-audit.md` § PR #576
- Eje D1-real (dart entity bridge pattern a respetar): `docs/reports/2026-04-30-drift-fase2-d1real-dart-internalline.md`
- Adapter actual: `src/utils/seamly2d/seamlyAdapter.ts`
- Dominio dart: `src/utils/dartEntity.ts`
- Dominio grainline: `src/utils/grainLine.ts`
- Tool notch (UI): `src/components/PatternEditor/useNotchTool.ts`
