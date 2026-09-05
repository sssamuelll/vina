# Medir — diseño

**Fecha:** 2026-09-06
**Issue:** #1104 (María, audio del 30-08). Sale de la tanda 6, tramo 6-6.
**Hereda:** `2026-08-11-arrastre-unificado-2d-design.md` (familia DISTANCIA, § 3.2), `2026-08-30-cotas-vivas-design.md` (la gramática del número), `2026-09-06-resolutor-de-enganche-design.md`.
**Estado:** decisiones cerradas; implementación NO hecha, con su corte en § 6.

---

## 0. Lo que ella dijo, y en qué orden

> [16:54] «aparece el punto de donde empezará a medir, pero me faltaría
> visualizar por los extremos de mi pieza, porque cómo sé que estoy en la punta
> del extremo o a una milésima… **esto es patronaje**.»
>
> [17:30] «estaría guay que al clicar aquí sepa que estoy clicando a tres
> milímetros de este punto.»
>
> [18:03] «si clico una línea, podría medir una línea; al clicar la línea
> aparece la medida de la línea entera.»
>
> [18:36] «ahora desaparecen. Estaría muy bien un botón en la pantalla 2D que
> pudiera decirme borrar mediciones… **porque igual la quiero recordar durante
> un rato**.»
>
> [20:36] «me faltan opciones… medir ángulos, todo tipo de mediciones
> geométricas que un patronista puede necesitar.»

Son cinco peticiones y **cuatro de las cinco son sobre confianza, no sobre
capacidad**: saber que estás en la punta, saber a cuánto estás de ella, que la
medida no se evapore. «Esto es patronaje» es la frase que las ordena.

---

## 1. Qué hay hoy, medido

`useMeasureTool.ts` (405 líneas) ya tiene **tres modos**, derivados de la
herramienta activa y no de un selector (`:170-173`):

| Herramienta | Modo | Qué hace |
|---|---|---|
| `measure` | `point-to-point` | dos clics, distancia recta |
| `measureCurve` | `along-curve` | un clic en un borde → largo de arco, con marcas cada N mm |
| `compareCurves` | `compare` | dos bordes → comparación |

Las tres tienen puerta desde el 05-09. Y el `along-curve` **ya cumple la
petición [18:03]**: clicar una línea da su largo entero, por arco y no por
cuerda. Lo que faltaba era que se pudiera alcanzar y que midiera bien el tramo
de cierre — las dos cosas se cerraron el 05-09 y el 06-09.

**Lo que NO hay:**

- Enganche a vértices con anillo de aviso. Hoy `useMeasureTool` tiene su propio
  `SNAP_THRESHOLD = 8` (`:63`) y su propio enganche, distinto del de la línea
  interna.
- El readout «a 3 mm de este punto» mientras se acerca.
- Persistencia: `useEditorInteractions.ts:387` **borra las mediciones al cambiar
  de herramienta**. Ese es el «ahora desaparecen» literal de [18:36].
- Ángulos. `Measurement` ya tiene un campo `angle?` (`:24`) y nadie lo escribe.

---

## 2. Las decisiones

### D1 — El enganche de Medir es el de todos: `snapIndex`

Decisión 7 de la gramática de la tanda 6, y ahora tiene destino: el módulo
existe y lo leen la pluma y la línea interna. Medir es su tercer lector.

Con eso, [16:54] se cumple sin escribir geometría: el anillo de aviso sobre el
vértice ES «cómo sé que estoy en la punta del extremo». Y el radio sube de 8 a
12, que es el ratificado (ver el spec del resolutor, § 2: los que suben ganan
tolerancia y no rompen nada).

### D2 — «A 3 mm de este punto» es un readout junto al cursor, NO un chip

Decisión 9, y la razón se sostiene sola: **un chip promete escritura**, y ahí no
hay nada que escribir. «A 3 mm de este punto» es realimentación de un clic que
todavía no ha ocurrido; convertirlo en campo sería ofrecer editar un hecho que
aún no existe.

Va donde ya vive esa clase de número: junto al cursor, con el patrón de
`PolyPenToolOverlay.tsx:56-66` (`+22, −18` px), que es la tercera fila de la
gramática del número («gesto vivo → readout junto al cursor»).

**Qué punto nombra:** el vértice enganchado o, si no hay enganche, el vértice
más cercano dentro de un radio de lectura mayor que el de enganche. Sin eso, el
readout solo aparecería cuando ya está enganchada, que es cuando ya no hace
falta.

### D3 — Las mediciones PERSISTEN, y se borran desde la tira

Decisión 8. Dos mitades:

- **Persisten** al cambiar de herramienta. Se quita el `clear()` de
  `useEditorInteractions.ts:387`. «Igual la quiero recordar durante un rato» es
  literal, y el motivo de que hoy no persistan no es una decisión: es el
  reflejo de limpiar estado al desmontar.
- **Se borran con un botón en la tira de herramienta**, no con uno flotante en
  el lienzo. Un botón flotante nuevo sobre el patrón es el defecto F1 otra vez;
  la tira es la cabina de la herramienta y es donde ya viven sus mandos.

**Lo que hay que decidir con esto, y se decide aquí:**

| Pregunta | Decisión | Razón |
|---|---|---|
| ¿Sobreviven al cambio de PROYECTO? | **no** | una medida es sobre una geometría concreta; con otro patrón debajo, las coordenadas mienten |
| ¿Sobreviven a recargar? | **no**, de momento | persistir en IDB abre versionado y limpieza; el «rato» que ella nombra es una sesión |
| ¿Sobreviven a que se borre la pieza que medían? | **sí, y se ven apagadas** | borrarlas en silencio sería el defecto de las cotas colgantes que #1117 ya cerró en otra superficie |
| ¿Se pueden borrar una a una? | **no en la v1** | Supr con una medida elegida es el peldaño 3 de la escalera de Escape, que está sin implementar. El botón «Borrar mediciones» las quita todas, y eso es lo que ella pidió |

### D4 — El ángulo son TRES clics enganchados

Decisión 10. Convención universal (CAD, Illustrator, CLO): vértice → centro →
vértice. Se escribe en `Measurement.angle`, que ya existe y nadie llenaba.

**No** se hace «ángulo entre dos bordes» en la v1: elegir dos bordes que no se
tocan no tiene ángulo definido sin decidir dónde se cruzarían, y eso es una
pregunta de producto que ella no hizo.

### D5 — La medición hecha es de SOLO LECTURA

Decisión 11. Escribir «150» entre dos esquinas de dos piezas distintas no tiene
respuesta única: ¿se mueve una pieza? ¿las dos? ¿cuál? Una cota viva promete que
escribir el número cambia el objeto, y aquí no hay un objeto: hay dos, y una
relación.

Esto es la frontera entre Medir y las cotas vivas, y conviene decirla: **las
cotas vivas miden un objeto y lo escriben; Medir mide una relación y la lee.**

### D6 — NO hay selector de modo en la tira

Decisión 3 de § 1 de la gramática. El modo ya se deriva de la herramienta
activa; un `select` sería **un segundo escritor del mismo hecho**, que es
textualmente el fallo que el repo tiene escrito con su nombre en
`toolActivation.ts:10-12`. Y su premio declarado —darle puerta a `measureCurve`
y `compareCurves`— ya se cobró: las dos tienen botón desde el 05-09.

---

## 3. Lo que NO se hace

- **«Todo tipo de mediciones geométricas»** [20:36] no es un requisito: es una
  puerta abierta. Se hacen las tres que nombró (punto a punto, largo de línea,
  ángulo) y se para. Perpendicularidad, tangencia, radios de curvatura y área
  esperan a que pida una.
- **No se persiste en disco.** Ver D3.
- **No se hace editable una medición.** Ver D5.
- **No se le da modo a Medir por opción de la tira.** Ver D6.

---

## 4. El hueco que este spec NO cierra

**Qué es «una medición» cuando la pieza se mueve.** Hoy `Measurement` guarda
`startPoint`/`endPoint` en coordenadas de PATRÓN (`:19-20`). Si María mide entre
dos esquinas y luego arrastra la pieza, la medida se queda donde estaba y pasa a
medir aire.

Las dos salidas —anclar a la pieza y recalcular, o dejarla en el lienzo como una
anotación— son decisiones de producto distintas, y la segunda es defendible («la
puse ahí para acordarme»). **No se decide aquí porque ella no lo nombró**, y
decidirlo sin dato es exactamente lo que este documento existe para no hacer.
Se pregunta con la herramienta en la mano.

---

## 5. La ley de puertas, aplicada

Las tres herramientas tienen botón. Lo que este trabajo añade y necesita puerta:

| Función | Puerta |
|---|---|
| Borrar mediciones | botón en la tira de Medir (D3) |
| Medir ángulo | **decidir**: ¿cuarta herramienta con su botón, o un tercer clic que el motor de `point-to-point` interpreta? |

La segunda es la única pregunta de emplazamiento abierta, y la respuesta barata
es la segunda opción: un tercer clic sobre una medición recién hecha la convierte
en ángulo. Cero superficie nueva, y la pista al pie lo dice. Se propone eso.

---

## 6. El corte

| Tramo | Qué | Tamaño |
|---|---|---|
| **M-1** | Medir adopta `snapIndex` + anillo de aviso | S |
| **M-2** | Readout «a N mm de este punto» junto al cursor | S |
| **M-3** | Persistencia en sesión + botón «Borrar mediciones» en la tira | M |
| **M-4** | Ángulo por tercer clic | M |

M-1 y M-2 son la mitad de [16:54] y [17:30] y van juntos: los dos son sobre el
mismo instante, el de antes del clic. M-3 es independiente. M-4 va al final
porque es lo único que añade una capacidad en vez de arreglar una confianza, y
ella lo pidió en último lugar.

---

**Insumos.** Audio de María del 2026-08-30, transcripción íntegra en
`docs/reports/2026-08-30-feedback-maria-video-transcripcion.md`. Censo del
código: 2026-09-06.
