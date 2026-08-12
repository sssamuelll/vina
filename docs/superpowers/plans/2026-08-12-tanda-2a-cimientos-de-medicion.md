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

Lo que las mediciones establecieron:

| Medición | Resultado |
|---|---|
| Cuadratura GL-5 en curvas de patronaje reales (sisa, escote, cadera, costado) | error de **0,0000 a 0,0012 mm** — el comentario del código («< 0.1mm en curvas típicas») es honesto |
| GL-5 en una cúbica con controles cruzados | error de **22,5 mm** (349,263 contra 371,745) — real, pero el patronaje no produce esa forma |
| Aplanado a 12 subdivisiones contra el arco real, en curvas de patronaje | subestima **0,04 a 0,4 mm** (0,02 % a 0,24 %) |

Esa última fila es la que manda en el diseño. El anillo que usan hoy los piquetes (`ringOf`, `src/utils/notchAnchor.ts:32`) aplana a 12 subdivisiones (`CURVE_RESOLUTION`, `src/utils/seam/index.ts:4`), y **los piquetes de María ya están guardados con esa métrica**. Darle precisión al anillo los movería medio milímetro: poco, pero es su trabajo guardado y no nos toca a nosotros decidir que no importa.

**Decisión (2026-08-12, de Samuel): los datos viejos no se tocan.** El ancla gana una versión de métrica; las que no la llevan se re-derivan con la métrica de siempre, exactamente igual que hoy. Cuesta un campo y una rama; compra que nadie abra un patrón y encuentre los piquetes corridos.

### Las tres formas de medir que hay hoy

| | cierra el contorno | curvas C/Q | arcos `A` | reversible |
|---|---|---|---|---|
| `ringOf` (`src/utils/notchAnchor.ts:32`) | **sí**, wrap-around `(i+1) % n` | aplanado a **12** | **como cuerda**, sin avisar | no |
| `parseSegments` (`src/utils/geometry/arcLength.ts:108`) | **no** — `case 'Z': break` (`:198`) | cuadratura **GL-5** | **longitud cero** + `console.warn` | no |
| `commandTToEdgeT` (`src/components/PatternEditor/useSegmentSewingTool.ts:152`) | n/a (mide un borde) | aplanado a **12** | como cuerda | no |

Ninguna es invertible: `pointAtPathDistance` usa `t = restante / longitud` sobre las Bézier (`arcLength.ts:234`), y el parámetro de una Bézier no avanza con el arco, así que **no es la inversa** de `distanceAlongPath`.

---

## Global Constraints

- **Los piquetes guardados no se mueven.** Es el contrato de esta tanda y se prueba, no se afirma.
- **Los arcos `A` se rechazan explícitamente**, no se aproximan en silencio. Justificación medida: **no hay ningún productor de `type: 'A'` en `src/`** — el único que los toca es el importador SVG (`src/utils/formats/svgImport.ts:436`). Un contorno con `A` es un caso que hoy no se produce, y devolver un número inventado para él es peor que negarse.
- **Cero cambios de comportamiento visible.** Si algo se ve distinto en el lienzo tras esta tanda, es un fallo.
- **TDD obligatorio.** Ningún código de producción sin un test que se haya visto fallar antes por la razón correcta.
- **Typecheck:** `npx tsc -b --noEmit` (modo build), nunca `tsc --noEmit` a secas.
- **`git add` explícito en cada tarea.** `git commit -am` no añade archivos nuevos y aquí casi todas las tareas crean alguno. Revisar `git status` antes de commitear.
- **Sin `--no-verify`.**

### Lo que esta tanda NO hace

- **Ningún gesto ni herramienta.** El contrato del gesto de distancia se descubre mejor con un consumidor real delante; va en 2b, apoyado en esto.
- **No toca el margen de costura** (tanda 2c) ni **la herramienta de punto** (2b) — aunque la conversión inversa de la Task 1 es justo lo que a punto le falta hoy.
- **No unifica los umbrales de enganche** (~18 constantes en 15 archivos). Issue aparte.

---

## Estructura de archivos

| Archivo | Responsabilidad | Tarea |
|---|---|---|
| `src/utils/geometry/outlineRing.ts` | **nuevo.** El anillo, con las dos métricas, el rechazo de `A` y las conversiones en ambos sentidos. | 1 |
| `src/utils/geometry/arcLength.ts` | Exportar `gaussLegendreQuadBezierLength` (hoy es privada, `:58`). Nada más. | 1 |
| `src/types/types.ts` | `NotchAnchor` gana la versión de métrica. | 2 |
| `src/utils/notchAnchor.ts` | `resolveNotchAnchor` enruta por versión; `ringOf` pasa a delegar en el módulo nuevo. | 2, 3 |
| `src/utils/projectSchema.ts` | El campo nuevo en el zod, opcional. | 2 |

---

## Task 1: El anillo, con sus dos métricas

**Files:**
- Create: `src/utils/geometry/outlineRing.ts`
- Create: `src/utils/geometry/__tests__/outlineRing.test.ts`
- Modify: `src/utils/geometry/arcLength.ts:58` (exportar `gaussLegendreQuadBezierLength`)

**Interfaces:**
- Consumes: `PathCommand[]`; `gaussLegendreCubicBezierLength` (ya exportada, `arcLength.ts:45`) y `gaussLegendreQuadBezierLength` (**hoy privada** — hay que exportarla; el borrador anterior decía importarla sin darse cuenta de que no se podía).
- Produces: `buildRing(outline, metric)` y las cuatro conversiones. La Task 2 y la 3 lo consumen; el gesto de 2b también.

**Las dos métricas, y por qué son dos y no una:**

- **`v1`** reproduce **exactamente** lo que hace `ringOf` hoy: aplanado a 12 subdivisiones, cierre por wrap-around, arcos `A` como cuerda. No es la buena; es la que tienen los datos guardados, y por eso tiene que sobrevivir sin un solo bit de diferencia.
- **`v2`** es la correcta: cuadratura para C/Q, cierre explícito, y **rechazo** de `A`.

Que convivan **no** es la incoherencia que el review señaló, porque cada ancla dice con cuál se escribió. Lo incoherente sería medir con una y re-derivar con otra sin saberlo — que es exactamente lo que pasaría si se introdujera el anillo bueno a secas.

**El contrato:**

1. **`v1` es idéntico a `ringOf`.** Sobre las mismas figuras de `src/utils/__tests__/notchAnchor.test.ts`, mismo perímetro y mismos puntos. Éste es el test que sostiene toda la tanda.
2. **`v2` cierra.** El perímetro de un rectángulo 100×200 es 600, no 500.
3. **`v2` mide el arco de las curvas, no su cuerda ni su poligonal.** En las cuatro curvas de patronaje medidas arriba, coincide con la integración de alta resolución dentro de 0,01 mm.
4. **`v2` rechaza los arcos `A`** con un error que nombra el comando y el índice. No devuelve cero (como `arcLength`) ni la cuerda (como `ringOf`).
5. **La ida y vuelta es la identidad** dentro de 0,01 mm, en recta y en Bézier — y **no se valida contra sí misma**: el oráculo es la integración de alta resolución, no la propia función. Una parametrización por cuerda internamente consistente pasaría un test que se mira al espejo.
6. **Mapeo comando↔arco en los dos sentidos.** `(commandIndex, tLocal) → ringMm` y `ringMm → (commandIndex, tLocal)`. **La vuelta no existe hoy en ninguna parte del repo.** Lo más cercano, `getPointOnEdge` (`src/copilot/action/tools/definitions/patternOpsTools.ts:27`), interpola por índice del array (`idx = t * (pts.length - 1)`, `:81`) y solo recoge endpoints de comandos: en una curva ni siquiera tiene los puntos intermedios. Es una cuarta medida que miente, en el camino del copilot; no se hereda y queda anotada para su propio issue.
7. **El anillo es cíclico.** De 990 a 10 sobre un anillo de 1000 hay 20, no 980.
8. **Identidad de subpath.** Con varios `M`, el anillo sabe a qué subpath pertenece cada distancia y no mide a través de un salto inexistente. Si los agujeros no se soportan, lo dice y rechaza.

- [ ] **Step 1: Escribir los tests que fallan.** Figuras: el rectángulo 100×200; las cuatro curvas de patronaje ya medidas (sisa, escote, cadera S, costado casi recto), con sus longitudes reales como constantes citadas en el test; un contorno con `A`; uno de dos subpaths.

- [ ] **Step 2: Verlos fallar.** `npx vitest run src/utils/geometry/__tests__/outlineRing.test.ts` — el módulo no existe.

- [ ] **Step 3: Exportar `gaussLegendreQuadBezierLength`** (`arcLength.ts:58`) y nada más de ese archivo.

- [ ] **Step 4: Implementar.** Lo nuevo es el cierre, el rechazo de `A`, la tabla de arco acumulado que hace reversible la parametrización, la identidad de subpath, y el modo `v1` que replica el aplanado.

- [ ] **Step 5: Correr y verlo pasar.**

- [ ] **Step 6: Gates y commit**

```bash
npx tsc -b --noEmit && npm run lint && npm run test
git add src/utils/geometry/outlineRing.ts src/utils/geometry/__tests__/outlineRing.test.ts src/utils/geometry/arcLength.ts
git status
git commit -m "feat(geom): un anillo del contorno con métrica versionada y reversible (#1029)"
```

---

## Task 2: El ancla dice con qué se midió

**Files:**
- Modify: `src/types/types.ts:248-252` (`NotchAnchor`)
- Modify: `src/utils/notchAnchor.ts:203` (`resolveNotchAnchor`)
- Modify: `src/utils/projectSchema.ts`
- Modify: `src/utils/__tests__/notchAnchor.test.ts`

**La forma.** `NotchAnchor` tiene hoy tres campos exactos (`types.ts:248-252`): `refPoint`, `direction`, `distanceMm`. Gana un cuarto **opcional**:

```ts
/** Con qué métrica se midió `distanceMm`. Ausente = 1, la de los proyectos
 *  guardados antes de #1029: el contorno aplanado a 12 subdivisiones. Nunca
 *  se rellena retroactivamente — un ancla sin este campo se re-deriva con la
 *  métrica vieja para que el piquete no se mueva del sitio donde ella lo dejó. */
metric?: 1 | 2;
```

Ausente significa `1`, y **no se migra**. Rellenar el campo en los datos viejos sería reescribir su historia con una medida que no es la suya.

- [ ] **Step 1: Los tests que fallan**

1. **El contrato de la tanda:** un ancla **sin** `metric`, sobre un contorno con curvas, resuelve exactamente en el mismo punto que hoy. Con tolerancia cero: es el mismo código por debajo, así que debe dar el mismo número.
2. Un ancla con `metric: 2` se resuelve con la métrica precisa.
3. En la misma figura y la misma `distanceMm`, las dos métricas dan puntos **distintos** — y la diferencia está en el rango medido (< 0,5 mm). Si dieran lo mismo, el versionado no haría nada y sobraría.
4. Round-trip por zod: un proyecto viejo **sin** el campo carga y sigue sin él; uno nuevo con `metric: 2` lo conserva.
5. El zod **rechaza** un `metric` que no sea 1 ni 2. Ojo: el esquema de bordes usa `.loose()`, así que un campo desconocido sobrevive al parseo solo por serlo — el test tiene que exigir validación de verdad, no supervivencia.

- [ ] **Step 2: Verlos fallar. Step 3: Implementar.**

`resolveNotchAnchor` enruta: `anchor.metric === 2` usa `v2`, cualquier otra cosa (incluida la ausencia) usa `v1`. La rama por defecto es la vieja **a propósito** — si un día aparece un `metric: 3` mal escrito, el peor caso es que un piquete se resuelva como siempre.

- [ ] **Step 4: Correr, gates y commit.**

---

## Task 3: Un solo anillo vivo

**Files:**
- Modify: `src/utils/notchAnchor.ts:32` (`ringOf` delega en `outlineRing` modo `v1`)
- Modify: sus tests

**Por qué.** Con la Task 1 hecha, `ringOf` y el modo `v1` del módulo nuevo son dos implementaciones del mismo aplanado. Dos copias de lo mismo derivan: alguien arregla una y no la otra. `ringOf` pasa a ser una línea que delega.

Es refactor puro: **si algún test cambia de resultado, el refactor está mal**, no el test.

- [ ] **Step 1: Correr los tests de `notchAnchor` y guardar la salida.** Es la línea base literal.

- [ ] **Step 2: Sustituir el cuerpo de `ringOf` por la delegación.**

- [ ] **Step 3: Volver a correr y comparar contra la línea base.** Cero diferencias, o se revierte.

- [ ] **Step 4: Comprobar los otros consumidores del anillo viejo.** `resolveNotchAnchor` (`:203`), `notchReanchor.ts:74`, `detectCorners` (`:53`), y los de `dxf/converter.ts`, `grading/gradingEngine.ts`, `seam/notchMirror.ts`. Correr sus tests. Ninguno debería moverse.

- [ ] **Step 5: Gates y commit.**

---

## Task 4: Verificar con un patrón de María, no con una fixture

**Files:** ninguno de producción. Un script de verificación desechable, y el hallazgo escrito.

**Por qué existe.** Los tests usan figuras que elegimos nosotros. El riesgo de esta tanda no está en el rectángulo: está en un contorno real, con sus curvas, sus piezas rotadas y sus piquetes puestos a mano.

- [ ] **Step 1: Abrir un patrón real** de los que ya están en el repo o en la carpeta de entregas, con piquetes guardados.

- [ ] **Step 2: Para cada piquete, resolver su posición con `v1` y con `v2`, y tabular la diferencia.** En milímetros, con dos decimales.

- [ ] **Step 3: Comprobar el contrato.** Con la métrica ausente (que es lo que tienen), la posición resuelta es **idéntica** a la de antes de esta tanda. Diferencia cero, no «pequeña».

- [ ] **Step 4: Escribir el resultado** en `docs/reports/`, con la tabla. Es el dato que sostiene la decisión de no migrar, y el que hará falta el día que alguien proponga migrar de verdad.

---

## Cierre de la tanda

- [ ] Gate completo con la skill `gates-locales`, derivándolo del workflow y no de memoria.
- [ ] **Nada visible cambió.** Si el lienzo se ve distinto, hay un fallo — esta tanda es suelo.
- [ ] Anotar en el spec, como sub-sección de § 3.2, la tabla de las tres métricas y la decisión de versionar. Es el contexto que necesita 2b.
- [ ] Abrir el issue de `getPointOnEdge` (interpola por índice, en el camino del copilot) — no es de esta tanda pero es una medida que miente y ya está localizada.
- [ ] Abrir el issue de la unificación de umbrales (~18 constantes en 15 archivos).
- [ ] **#1029 sigue abierto.** Cierra al terminar 2b y 2c.
