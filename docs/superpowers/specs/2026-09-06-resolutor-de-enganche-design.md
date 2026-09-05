# El resolutor único de enganche — alcance y decisiones

**Fecha:** 2026-09-06
**Sale de:** `docs/superpowers/specs/2026-09-05-gramatica-tanda-6-design.md` § 4 (decisión 18: «es su propio spec, y no entra en la tanda 6»).
**Censo:** contado a mano el 2026-09-06 sobre el código, no heredado.
**Estado:** alcance cerrado; implementación NO hecha, con su corte en § 5.

---

## 0. Qué cambió desde que se decidió sacarlo de la tanda 6

Dos cosas, y las dos abaratan el trabajo:

1. **El módulo existe.** `snapIndex.ts` nació el 06-09 al abrirle enganche a la
   pluma (#1102): `resolveSnap` y sus tres índices salieron de `usePolyPenTool`
   y ya tienen **dos lectores**. La mudanza que este spec propone tiene destino.
2. **Se pagó un adelanto.** `useMergeTool` tenía su propia copia de la caja de
   la pieza, con el bug de rotación de #1064 dentro; se borró entera y se
   cambió por `hitTestPieceBBox`. Uno menos.

---

## 1. El censo, fresco

**Dieciocho archivos** llaman a `screenToPatternLength(...)` para convertir un
radio de pantalla a unidades de patrón. Los umbrales que usan:

| px | Dónde | Qué pregunta |
|---|---|---|
| 5 | `useEditorInteractions.ts:860` (literal) | ¿estoy sobre una línea interna? |
| 6 | `PatternEditor.tsx:542` (literal) | ¿estoy sobre una línea interna? (**el mismo hecho, otro número**) |
| 8 | `useEditPattern.ts:50`, `useMeasureTool.ts:63`, `useScissorsTool.ts:33`, `useSlashAndSpreadTool.ts:84`, `useEditCurve.ts:180` y `:269` (literales), `useEditorInteractions.ts:373` y `:816` (literales) | nodo / punto de enganche |
| 10 | `gestureConstants.VERTEX_HIT_PX`, `sewingUtils.VERTEX_SNAP_THRESHOLD`, `useExtendTrimTool.SNAP_THRESHOLD` | vértice |
| 12 | `gestureConstants.EDGE_HIT_PX` | borde, vértice, extremo de interna, primer nodo — **el único con doctrina escrita** |
| 15 | `sewingUtils.EDGE_HIT_THRESHOLD`, `useTopstitchTool.SNAP_THRESHOLD` | borde |
| 20 | `useTrimTool.EDGE_HIT_THRESHOLD` | borde |

**Seis radios distintos.** Y el reparto no es por clase de objeto: un vértice
vale 8, 10 o 12 según quién pregunte; un borde vale 12, 15 o 20.

Peor que los números: **la misma pregunta tiene dos respuestas en dos archivos**
(5 px y 6 px para «¿estoy sobre una línea interna?»), y **ocho de los sitios son
literales sin nombre**, así que ni siquiera se pueden censar por grep de
constante.

---

## 2. La decisión que NO se toma: reducirlos a dos

La propuesta original quería «dos radios». Se cae, y la razón está medida:

> `EDGE_HIT_PX = 12` es el único con ratificación escrita
> (`2026-08-29-linea-interna-y-medidas-design.md:68`, `:414`), y es el radio de
> la herramienta que **más** lo usa: la línea interna engancha todo con él, y
> desde el 06-09 la pluma también.

Bajarlo a 8 o a 10 para «unificar» no unifica: **cambia el comportamiento de las
dos herramientas de dibujo principales**, en contra de un contrato aprobado y de
una nota de María que ya se cerró. Un resolutor que unifica encogiendo es un
cambio de producto disfrazado de refactor.

**Decisión: el radio no se unifica por decreto. Se unifica por CLASE de
objeto**, y cada clase se queda con el número que hoy usa la herramienta que
mejor lo tiene ratificado:

| Clase | Radio | De dónde sale |
|---|---|---|
| vértice / nodo | **12** | `EDGE_HIT_PX`, ratificado, y ya es el de Punto, pluma y línea interna |
| extremo de línea interna | **12** | idem |
| borde de contorno | **12** | idem |
| línea interna (el trazo, no su extremo) | **6** | hoy hay 5 y 6; se elige el mayor, que es el que ya usa la superficie que la usuaria toca (`PatternEditor`) |
| umbral de ARRASTRE (no es un radio) | **4** | `DRAG_THRESHOLD_PX`, ya unificado y con su propio spec |

Los que suben (los de 8, 10) ganan tolerancia; ninguno baja. **Eso es lo que
hace la migración segura de contar: un enganche más generoso no rompe un gesto
que ya funcionaba, y uno más estrecho sí.**

Las dos excepciones que hay que decidir a mano, no en lote:

- **`useTrimTool` a 20 px.** El avío se coloca sobre un borde y su radio grande
  es probablemente deliberado (un avío no compite con nada más). Bajarlo a 12
  es un cambio de comportamiento: se mide con la herramienta en la mano antes.
- **`useTopstitchTool` a 15 px.** Igual.

---

## 3. Lo que de verdad hay que fusionar: no son radios, son cuatro semánticas

El censo de la tanda 6 lo decía y sigue siendo lo caro. Los hit-tests del lienzo
responden a **cuatro preguntas distintas** que hoy están mezcladas:

1. **¿Qué punto hay aquí?** — vértice, extremo de interna, nodo editable.
   Devuelve un punto exacto al que ENGANCHAR. Es lo que `snapIndex.resolveSnap`
   ya hace.
2. **¿Qué borde hay aquí?** — devuelve un borde SEMÁNTICO (no un comando) y una
   `t` sobre él. Es lo que `findClosestEdge` / `buildEdgeSelection` hacen, y lo
   que el 06-09 se descubrió roto para el tramo de cierre.
3. **¿Qué objeto hay aquí?** — pieza, costura, línea interna, avío. Devuelve una
   IDENTIDAD para seleccionar o abrir un menú. Es lo que `hitTestPieceBBox` y el
   hit-test del menú contextual hacen.
4. **¿Estoy lo bastante cerca para confirmar?** — el release de un arrastre.
   **No es un hit-test**: no elige objeto, solo acepta o niega un valor sobre un
   objeto que el press ya fijó. El #1061 se cerró justo por confundir esta con
   la 1.ª.

**Decisión: se fusionan la 1 y la 2 en `snapIndex`. La 3 se queda aparte y la 4
NO es un hit-test y no entra.** Meter la 3 sería convertir el módulo de enganche
en el despachador de selección, que es otra cosa y tiene otros dueños.

---

## 4. Lo que este trabajo destapa y arregla con él

- Los **ocho radios literales sin nombre** pasan a constante. Hoy no se pueden
  ni contar sin leer archivo por archivo.
- Los **5 px y 6 px para la misma pregunta** se vuelven uno.
- El hit-test de bordes hereda `indiceSegunLosBordes` y `rangoMedibleDeBorde`,
  las dos traducciones que el 06-09 tuvo que escribir a mano en tres sitios
  porque el tramo de cierre se etiqueta con el índice de la `M` y los hit-tests
  devuelven el de la `Z`. Con un resolutor, esa traducción se hace UNA vez.

---

## 5. El corte

| Tramo | Qué | Tamaño | Nota |
|---|---|---|---|
| **R-1** | Censo ejecutable: un trinquete que cuente radios literales y falle si sube. Sin él, la migración se deshace sola. | S | va primero |
| **R-2** | Los ocho literales a constantes con nombre, sin cambiar ningún valor | S | cero riesgo, y hace visible el resto |
| **R-3** | Unificar el 5 y el 6 | XS | |
| **R-4** | Los de 8 y 10 suben a 12, clase por clase, con un e2e por herramienta | M | **el que cambia comportamiento** |
| **R-5** | Fusionar la pregunta 2 (borde semántico) dentro de `snapIndex` | M | |
| **fuera** | Trim (20) y pespunte (15): se miden con la herramienta en la mano | — | decisión de producto |

R-4 es el único que cambia lo que María siente, y por eso lleva un e2e **por
herramienta**, no uno global: «el enganche va bien» no es un oráculo.

---

## 6. Lo que NO se hace

- **No se toca `DRAG_THRESHOLD_PX`.** Ya está unificado y tiene su spec.
- **No se fusiona el hit-test de selección** (pregunta 3). Otro eje, otros
  dueños.
- **No se baja ningún radio en lote.** Cada bajada es un cambio de producto.
- **No se toca el enganche angular del hilo** (0°/45°/90° con Shift): es un
  enganche de VALOR, no de posición, y no comparte nada con esto.
