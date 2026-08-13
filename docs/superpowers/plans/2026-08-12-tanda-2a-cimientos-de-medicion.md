# Tanda 2a — Cimientos de medición sobre el contorno

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que exista una sola forma de medir distancias sobre el contorno de una pieza, precisa y reversible — y que ningún piquete ya guardado se mueva ni un micrón al introducirla.

**Architecture:** No hay herramienta nueva ni gesto nuevo. Esta tanda es suelo. Hoy hay tres formas distintas de medir el mismo contorno y ninguna se puede invertir; encima de eso no se puede construir una medición que se le enseñe a alguien en milímetros. Se unifica en un módulo con **dos métricas explícitas y versionadas**: la de hoy (`v1`, que se conserva bit a bit para los datos existentes) y la precisa (`v2`, para lo que se escriba de aquí en adelante).

**Tech Stack:** TypeScript, tests con vitest. Sin React: todo esto es geometría pura.

**Spec:** `docs/superpowers/specs/2026-08-11-arrastre-unificado-2d-design.md` § 3.2 (la familia DISTANCIA que esto habilita)
**Issues:** #1029 (M-221)

---

## Por qué esta tanda existe, y por qué no trae nada visible

Dos borradores anteriores intentaron entregar el gesto de medir junto con su infraestructura. Los dos pasaron por review adversarial contra el árbol real y los dos fueron rechazados — el segundo con cuatro blockers nuevos verificados uno por uno. La causa común: **el suelo no aguanta el gesto todavía.**

Lo que las mediciones establecieron. Las curvas van con sus puntos de control para que cualquiera pueda repetir el experimento; un número sin su figura no es un dato reproducible.

| Curva (cúbica, desde el origen) | GL-5 | arco real | error |
|---|---|---|---|
| sisa suave — `C 20,60 60,110 110,130` | 175,559 | 175,559 | **0,0000 mm** |
| escote amplio — `C 30,40 90,50 140,20` | 154,896 | 154,896 | **0,0000 mm** |
| cadera en S — `C 40,30 20,90 60,130` | 146,134 | 146,135 | **0,0012 mm** |
| costado casi recto — `C 5,100 8,200 10,300` | 300,178 | 300,178 | **0,0000 mm** |
| patológica — `C 0,300 100,-300 100,0` | 349,263 | 371,745 | **22,4825 mm** |

La cuadratura GL-5 es suficiente para el patronaje: el caso donde falla necesita los controles cruzados de la última fila, una forma que un patrón no produce. El comentario del código («< 0.1mm en curvas típicas», `src/utils/geometry/arcLength.ts:2-6`) es honesto.

Y el aplanado a 12 subdivisiones, que es lo que usan hoy los piquetes:

| Curva | aplanado a 12 | arco real | subestima |
|---|---|---|---|
| sisa suave | 175,520 | 175,559 | 0,039 mm (0,022 %) |
| escote amplio | 154,799 | 154,896 | 0,096 mm (0,062 %) |
| cadera en S | 146,042 | 146,135 | 0,093 mm (0,064 %) |
| curva cerrada — `C 80,10 80,90 0,100` | 170,371 | 170,771 | 0,401 mm (0,235 %) |

Esa última tabla manda en el diseño. El anillo que usan hoy los piquetes (`ringOf`, `src/utils/notchAnchor.ts:32`) aplana a 12 subdivisiones (`CURVE_RESOLUTION`, `src/utils/seam/index.ts:4`), y **los piquetes de María ya están guardados con esa métrica**. Darle precisión al anillo los movería medio milímetro: poco, pero es su trabajo guardado y no nos toca a nosotros decidir que no importa.

**Decisión (2026-08-12, de Samuel): los datos viejos no se tocan.** El ancla gana una versión de métrica; las que no la llevan se re-derivan con la métrica de siempre, exactamente igual que hoy. Cuesta un campo y una rama; compra que nadie abra un patrón y encuentre los piquetes corridos.

### Las tres formas de medir que hay hoy

| | cierra el contorno | curvas C/Q | arcos `A` | reversible |
|---|---|---|---|---|
| `ringOf` (`src/utils/notchAnchor.ts:32`) | **sí**, wrap-around `(i+1) % n` | aplanado a **12** | **como cuerda**, sin avisar | no |
| `parseSegments` (`src/utils/geometry/arcLength.ts:108`) | **no** — `case 'Z'` en `:198`, `break` en `:199` | cuadratura **GL-5** | **longitud cero** + `console.warn` | no |
| `commandTToEdgeT` (`src/components/PatternEditor/useSegmentSewingTool.ts:152`) | n/a (mide un borde) | aplanado a **12** | como cuerda | no |

Y hay una **cuarta copia** del primero: `src/utils/seam/notchMirror.ts:47` tiene su propio `ringOf`, función duplicada literalmente. Entra en el alcance de la Task 3.

Ninguna es invertible: `pointAtDistance` usa `t = restante / longitud` sobre las Bézier (`arcLength.ts:234`, llamada desde la API pública en `:252`), y el parámetro de una Bézier no avanza con el arco, así que **no es la inversa** de `distanceAlongPath`.

---

## Global Constraints

- **Los piquetes guardados no se mueven.** Es el contrato de esta tanda y se prueba contra un oráculo congelado, no se afirma.
- **Los arcos `A` se rechazan en `v2`, con un resultado tipado y nunca con una excepción.** `resolveNotchAnchor` devuelve hoy resultado o `null` (`src/utils/notchAnchor.ts:203`) y **ninguno de sus consumidores captura excepciones** — `notchReanchor.ts:49`, `useNotchTool.ts:207`, `gradingEngine.ts:252`. Lanzar desde ahí abajo tumbaría el lienzo. Justificación de rechazar en vez de aproximar: no hay ningún productor de `type: 'A'` en `src/`; el importador SVG los convierte a cúbicas al leer (`src/utils/formats/svgImport.ts:436`, empuja comandos `C` en `:444-448`). Pero el schema **sí** los admite (`src/utils/projectSchema.ts:82`), así que el caso tiene que estar manejado, no supuesto imposible.
- **Cero cambios de comportamiento visible.** Si algo se ve distinto en el lienzo tras esta tanda, es un fallo.
- **TDD obligatorio.** Ningún código de producción sin un test que se haya visto fallar antes por la razón correcta.
- **Typecheck:** `npx tsc -b --noEmit` (modo build), nunca `tsc --noEmit` a secas.
- **`git add` explícito en cada tarea.** `git commit -am` no añade archivos nuevos y aquí casi todas las tareas crean alguno.
- **Sin `--no-verify`.**

### Lo que esta tanda NO hace

- **Ningún gesto ni herramienta.** El contrato del gesto de distancia se descubre mejor con un consumidor real delante; va en 2b, apoyado en esto.
- **No toca el margen de costura** (tanda 2c) ni **la herramienta de punto** (2b) — aunque la conversión inversa de la Task 1 es justo lo que a punto le falta hoy.
- **No unifica los umbrales de enganche** (~18 constantes en 15 archivos). Issue aparte.

---

## Estructura de archivos

| Archivo | Responsabilidad | Tarea |
|---|---|---|
| `src/utils/geometry/outlineRing.ts` | **nuevo.** El anillo, con las dos métricas y las conversiones en ambos sentidos. | 1 |
| `src/utils/geometry/arcLength.ts` | Exportar `gaussLegendreQuadBezierLength` (hoy privada, `:58`). Nada más. | 1 |
| `src/utils/notchAnchor.ts` | Exportar `ringOf` como oráculo (`:32`); `computeNotchAnchor` acepta métrica (`:126`); `resolveNotchAnchor` enruta (`:203`). | 1, 2 |
| `src/types/types.ts` | `NotchAnchor` (`:248-252`) gana la versión. Afecta también a `PointGradeRule.anchor` (`:280`). | 2 |
| `src/utils/projectSchema.ts` | El campo nuevo en `notchAnchorSchema` (`:111-115`). **Sin esto el campo se borra al guardar.** | 2 |
| `src/utils/dxf/converter.ts` | Preservar la versión al reconstruir el ancla (`:722`). | 2 |
| `src/utils/notchReanchor.ts` | Al recomputar un ancla, conservar SU métrica (`:51`). | 2 |
| `src/copilot/action/tools/definitions/internalTools.ts` | El piquete del copilot declara su métrica (`:279`). | 2 |
| `src/utils/seam/notchMirror.ts` | Su `ringOf` duplicado (`:47`) delega; el ancla espejo hereda métrica (`:184`). | 2, 3 |

---

## Task 1: El anillo, con sus dos métricas

**Files:**
- Create: `src/utils/geometry/outlineRing.ts`
- Create: `src/utils/geometry/__tests__/outlineRing.test.ts`
- Modify: `src/utils/geometry/arcLength.ts:58` (exportar `gaussLegendreQuadBezierLength`)
- Modify: `src/utils/notchAnchor.ts:32` (exportar `ringOf`, solo para poder usarlo de oráculo)

**La API, con firmas.** El borrador anterior prometía «`buildRing` y cuatro conversiones» sin decir cuáles, y eso obligaría a 2b a inventarse otra parametrización encima. Se fija aquí:

```ts
export type RingMetric = 1 | 2;

export interface RingPoint {
  point: Point2D;
  /** Índice del comando del outline al que pertenece esta posición. */
  commandIndex: number;
  /** Posición DENTRO de ese comando. Ver la nota de abajo: es fracción de
   *  ARCO del comando, no el parámetro nativo de la Bézier. */
  tLocal: number;
}

export interface OutlineRing {
  metric: RingMetric;
  /** Perímetro total, cerrado. */
  totalMm: number;
  /** Cuántos subpaths (comandos `M`) tiene el contorno. */
  subpathCount: number;
}

export type RingResult<T> =
  | { ok: true; value: T }
  | { ok: false; reason: 'arc-unsupported' | 'degenerate' | 'empty'; commandIndex?: number };

export function buildRing(outline: PathCommand[], metric: RingMetric): RingResult<OutlineRing>;
export function distanceAt(ring: OutlineRing, at: { commandIndex: number; tLocal: number }): number;
export function pointAt(ring: OutlineRing, distanceMm: number): RingPoint;
export function projectToRing(ring: OutlineRing, p: Point2D): { distanceMm: number; point: Point2D };
/** Avance cíclico de `from` a `to` en el sentido dado. Nunca la distancia mínima:
 *  el sentido lo fija quien mide, no la geometría. */
export function advance(ring: OutlineRing, fromMm: number, toMm: number, dir: 'cw' | 'ccw'): number;
```

**La ambigüedad de `tLocal`, resuelta aquí porque hoy el repo tiene dos.** El snap devuelve fracción de arco sobre la poligonal aplanada (`src/utils/seam/index.ts:263`), mientras que la evaluación de un punto usa el parámetro nativo de De Casteljau (`src/components/PatternEditor/nodeEditorUtils.ts:365`). No son lo mismo sobre una curva. **En este módulo `tLocal` es siempre fracción de ARCO del comando**, y la conversión al parámetro nativo, si hace falta, es responsabilidad de quien llame a De Casteljau. Está dicho aquí para que 2b no tenga que adivinarlo.

**El tramo de cierre** (el `Z`, o el wrap-around implícito) se representa con `commandIndex = outline.length`, un índice sintético que no colisiona con ningún comando real.

**Las dos métricas, y por qué son dos y no una:**

- **`v1`** reproduce **exactamente** lo que hace `ringOf` hoy. No es la buena; es la que tienen los datos guardados, y por eso tiene que sobrevivir sin un solo bit de diferencia.
- **`v2`** es la correcta: cuadratura para C/Q, cierre explícito, rechazo de `A`.

Que convivan **no** es la incoherencia que el review señaló, porque cada ancla dice con cuál se escribió. Lo incoherente sería medir con una y re-derivar con otra sin saberlo — que es exactamente lo que pasaría si se introdujera el anillo bueno a secas.

**El contrato:**

1. **`v1` es idéntico a `ringOf`, y se prueba contra `ringOf` mismo**, no contra una descripción suya. Por eso se exporta. Comparación **exacta** (`toBe`), no `toBeCloseTo`: la equivalencia bit a bit es el punto.
2. **Los fixtures de `v1` cubren todos los comandos**, no solo M/L/Z como los de hoy (`src/utils/__tests__/notchAnchor.test.ts`). Hay detalles del comportamiento heredado que un reimplementador pasa por alto y que solo salen con el comando delante:
   - C/Q producen exactamente las muestras `i = 1..12` con el orden algebraico de `src/utils/seam/index.ts:374`. Agrupar las multiplicaciones distinto cambia el último bit IEEE-754.
   - H/V conservan el cursor; **S/T/A caen al `default` y se vuelven cuerda** al último par de valores (`:409`).
   - `Z` añade el punto inicial **solo si** `|dx| > 0.001 || |dy| > 0.001` (`:402`).
   - La deduplicación consecutiva usa `> 1e-9` (`notchAnchor.ts:35`) mientras que la eliminación del primero/último usa `< 1e-9`: la igualdad exacta recibe tratamientos opuestos en los dos sitios.
   - Perímetro y proyección acumulan **secuencialmente**; `arcPositionOf` desempata con `<` (`:103`). Cambiar a una tabla o a búsqueda binaria puede conservar el punto y mover la normal.
3. **`v1` mide los puentes falsos entre subpaths, y eso se conserva.** Hoy cada `M` añade un punto al mismo array (`seam/index.ts:354`) y `ringOf` mide todos los pares más el wrap final: `M(0,0) L(10,0) M(100,0) L(110,0)` da 220, incluidos dos puentes que no existen. Es incorrecto, y **`v1` lo replica igual** porque su única razón de ser es no mover los datos. El contrato 8 (identidad de subpath) aplica **solo a `v2`**.
4. **`v2` cierra.** El perímetro de un rectángulo 100×200 es 600, no 500.
5. **`v2` mide el arco de las curvas.** En las cuatro curvas de patronaje de la tabla de arriba, coincide con la integración de alta resolución dentro de 0,01 mm.
6. **`v2` rechaza los arcos `A`** devolviendo `{ ok: false, reason: 'arc-unsupported', commandIndex }`. No lanza, no devuelve cero, no devuelve la cuerda.
7. **La ida y vuelta es la identidad** dentro de 0,01 mm — y **el oráculo es externo**, la integración de alta resolución, no la propia función. Una parametrización `s = t·L` con inversa `t = s/L` hace round-trip perfecto y parametriza mal la Bézier: por eso el test compara la **longitud parcial en varios `t` intermedios** contra la integración numérica, no solo los extremos.
8. **Identidad de subpath en `v2`:** con varios `M`, `pointAt` no devuelve nunca una posición dentro de un puente inexistente, y `totalMm` no lo incluye.
9. **El anillo es cíclico.** `advance(ring, 990, 10, 'cw')` sobre un anillo de 1000 da 20.

- [ ] **Step 1: Escribir los tests que fallan.** Figuras: el rectángulo 100×200; las cuatro curvas de patronaje de la tabla, con sus longitudes de referencia como constantes citadas; un contorno con cada tipo de comando (M/L/H/V/C/Q/S/T/Z) para el contrato 2; uno con `A`; uno de dos subpaths.

- [ ] **Step 2: Verlos fallar.** `npx vitest run src/utils/geometry/__tests__/outlineRing.test.ts`

- [ ] **Step 3: Exportar lo que hace falta como oráculo.** `gaussLegendreQuadBezierLength` (`arcLength.ts:58`) y `ringOf` (`notchAnchor.ts:32`). Nada más de esos archivos.

- [ ] **Step 4: Implementar.**

- [ ] **Step 5: Correr y verlo pasar.**

- [ ] **Step 6: Gates y commit.**

---

## Task 2: El ancla dice con qué se midió — y todos los escritores lo respetan

**Files:** los nueve de la tabla de estructura. Es la tarea grande.

**El agujero que esta tarea tapa.** Añadir la lectura versionada sin tocar a los escritores dejaría la tanda sin efecto: `computeNotchAnchor` (`src/utils/notchAnchor.ts:126`) construye anclas de tres campos y es el escritor común de **cuatro** rutas — el clic de piquete (`useNotchTool.ts:113`), el copilot (`internalTools.ts:279`), el espejo (`notchMirror.ts:184`) y el reanclaje tras transformar (`notchReanchor.ts:51`). Ejecutado al pie de la letra, después de 2a **nadie produciría nunca `metric: 2`**.

**La forma.** `NotchAnchor` (`types.ts:248-252`) gana un cuarto campo **opcional**:

```ts
/** Con qué métrica se midió `distanceMm`. Ausente = 1, la de los proyectos
 *  guardados antes de #1029: el contorno aplanado a 12 subdivisiones. Nunca
 *  se rellena retroactivamente — un ancla sin este campo se re-deriva con la
 *  métrica vieja para que el piquete no se mueva del sitio donde ella lo dejó. */
metric?: RingMetric;
```

**La política, escritor por escritor.** Cada uno tiene que estar decidido, porque el que se olvide crea datos que mienten sobre sí mismos:

| Escritor | Qué métrica escribe |
|---|---|
| `computeNotchAnchor` (`:126`) | Gana un parámetro. Por defecto **`2`**: un ancla nueva se mide bien. |
| Clic de piquete (`useNotchTool.ts:113`) | `2` — es un ancla nueva. |
| Copilot (`internalTools.ts:279`) | `2` — ídem. |
| Espejo (`notchMirror.ts:184`) | **Hereda la del ancla de origen.** Un espejo de un piquete viejo sigue siendo viejo. |
| Reanclaje tras transformar (`notchReanchor.ts:51`) | **Conserva la del ancla que recomputa.** Es el caso peligroso: recomputar con `v2` un ancla vieja la movería, que es justo lo que la decisión prohíbe. |
| DXF (`dxf/converter.ts:722`) | **Preserva el campo.** Hoy reconstruye el objeto campo por campo y lo descartaría. |

**Y el schema, que es donde el plan anterior se equivocaba.** `notchAnchorSchema` (`src/utils/projectSchema.ts:111-115`) es un `z.object({...})` **sin** `.loose()` — el `.loose()` está en el padre `internalLineSchema` (`:117-128`) y no se propaga al objeto anidado. Zod **elimina** las claves desconocidas de un objeto estricto: si el campo se añade al tipo pero no al schema, **se borra al guardar y el versionado no sobrevive a un guardar-y-cargar**. Va al schema sí o sí.

**El segundo uso persistido.** `PointGradeRule.anchor` (`types.ts:280`) reutiliza `NotchAnchor`, y `patternPieceSchema` no declara `gradeRules`: los deja pasar por `.loose()` (`:147`). Ahí un `metric` inválido sobreviviría sin validar y se degradaría a `v1` en silencio. Declararlo o dejar escrito por qué no.

- [ ] **Step 1: Los tests que fallan**

1. **El contrato de la tanda:** un ancla **sin** `metric`, sobre un contorno con curvas, resuelve en el mismo punto que hoy. Diferencia **cero**, `toBe`, no `toBeCloseTo`.
2. Un ancla con `metric: 2` se resuelve con la métrica precisa.
3. **Las dos métricas dan puntos distintos, y por la cantidad esperada.** No vale «distintos»: con la curva cerrada de la tabla (que subestima 0,401 mm en 170,771) y una distancia conocida, la separación tiene su valor calculado, con cota inferior y superior. Un `v2` que devolviera el punto de `v1` desplazado 10⁻¹² pasaría un test de «distintos».
4. **Round-trip por zod:** un proyecto viejo **sin** el campo carga y sigue sin él; uno con `metric: 2` **conserva el 2 tras guardar y volver a cargar**. Este último es el test que caza el borrado silencioso del objeto anidado.
5. El zod **rechaza** un `metric` que no sea 1 ni 2.
6. **Un ancla vieja recomputada por `reanchorTransformedNotches` sigue siendo vieja.** Se transforma la pieza, se recomputa, y el `metric` sigue ausente.
7. **El espejo hereda:** el piquete espejo de uno viejo no lleva `metric: 2`.
8. **DXF ida y vuelta** conserva el campo.
9. **Grading:** una pieza graduada con factor uniforme conserva la métrica del original — ausente sigue ausente, `2` sigue `2` — y `distanceMm` escala. `gradingEngine.ts:165` ya lo preserva por el spread; el test lo fija para que nadie lo rompa.

- [ ] **Step 2: Verlos fallar. Step 3: Implementar. Step 4: Correr, gates y commit.**

---

## Task 3: Un solo anillo vivo, de verdad

**Files:**
- Modify: `src/utils/notchAnchor.ts:32` (`ringOf` delega en `outlineRing` modo `v1`)
- Modify: `src/utils/seam/notchMirror.ts:47` (**la copia duplicada**, ídem)
- Modify: sus tests

**Por qué las dos.** El plan anterior solo migraba `notchAnchor`, y con eso «un solo anillo» habría sido falso: `notchMirror.ts:47` tiene su propio `ringOf`, función duplicada literalmente, que no consume el otro. Dos copias del mismo aplanado derivan — alguien arregla una y no la otra.

Es refactor puro: **si algún test cambia de resultado, el refactor está mal**, no el test. Ninguno de los dos `ringOf` escapa ni se muta, así que delegar es seguro por identidad.

- [ ] **Step 1: Congelar la línea base.** Correr los tests de `notchAnchor`, `notchReanchor`, `notchMirror`, `dxf`, `grading` y guardar la salida a un archivo. Es el oráculo literal del refactor.

- [ ] **Step 2: Sustituir los dos cuerpos por la delegación.**

- [ ] **Step 3: Volver a correr y comparar contra la línea base.** Cero diferencias, o se revierte.

- [ ] **Step 4: Gates y commit.**

---

## Task 4: Verificar con un patrón real, no con una fixture

**Files:** ninguno de producción. Un script de verificación desechable, y el hallazgo escrito.

**Por qué existe.** Los tests usan figuras que elegimos nosotros. El riesgo no está en el rectángulo: está en un contorno real, con sus curvas y sus piquetes puestos a mano.

**El baseline se captura ANTES de tocar nada.** Si se mide «el antes» después de haber reemplazado el código, `v1` se estaría comparando consigo misma y el test no probaría nada. Este step va primero, antes de la Task 1.

- [ ] **Step 0 (antes de la Task 1): capturar el baseline.** Con el código actual, cargar un patrón con piquetes — `tests/fixtures/garments/maria_patrones_samuel_2M.dxf` es el material real disponible; si no hay un proyecto guardado con anclas, generarlas importando el DXF y guardando la salida. Volcar, por piquete, su posición resuelta con dos decimales. Ese archivo es el oráculo.

- [ ] **Step 1: Tras las Tasks 1-3, repetir la medición** y comparar contra el baseline. **Diferencia cero**, no «pequeña».

- [ ] **Step 2: Tabular `v1` contra `v2`** en los mismos piquetes, para tener el número real del desplazamiento que se evitó.

- [ ] **Step 3: Escribir el resultado** en `docs/reports/`, con las dos tablas. Es el dato que sostiene la decisión de no migrar, y el que hará falta el día que alguien proponga migrar de verdad.

---

## Cierre de la tanda

- [ ] Gate completo con la skill `gates-locales`, derivándolo del workflow y no de memoria.
- [ ] **Nada visible cambió.** Si el lienzo se ve distinto, hay un fallo — esta tanda es suelo.
- [ ] Anotar en el spec, como sub-sección de § 3.2, la tabla de las tres métricas, la decisión de versionar y el significado de `tLocal` que fija la Task 1.
- [ ] Abrir el issue de `getPointOnEdge` (`src/copilot/action/tools/definitions/patternOpsTools.ts:27`): interpola por índice del array (`idx = t * (pts.length - 1)`, `:81`) y solo recoge endpoints de comandos, así que en una curva ni siquiera tiene los puntos intermedios. Es una quinta medida que miente, en el camino del copilot.
- [ ] Abrir el issue de la unificación de umbrales (~18 constantes en 15 archivos).
- [ ] **#1029 sigue abierto.** Cierra al terminar 2b y 2c.
