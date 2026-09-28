# Reunión María + Samuel, 2026-09-10 — 14 minutos sobre lo que se desplegó el día anterior, y lo que ella dibuja que Vina no tiene dónde guardar

**Fuente:** `VinaTesting/grabacion_2026-09-10_20-51-12.mp4` — 14:26, 1920×1080 @15fps, audio mono. Contra `vina.sdar.dev`, vista **Split** todo el rato.
**Transcripción íntegra con tiempos:** [`2026-09-10-reunion-maria-transcripcion.md`](2026-09-10-reunion-maria-transcripcion.md) — faster-whisper `large-v3`, español, 262 segmentos, cobertura 00:00→14:23.
**Índice visual:** 87 fotogramas (uno cada 10 s, 1280 px) en `VinaTesting/reunion-2026-09-10/frames/`, nombrados `t_MM-SS.jpg`. Cualquier marca del transcript se redondea a la decena inferior: `[07:37]` → `frames/t_07-30.jpg`.

> **Diferencia con la del 07-09:** aquella se grabó contra un build sin los arreglos. Esta es **la primera medición de los arreglos del 07-09 con la usuaria delante.** La línea de tiempo lo fija: PR #1149 (once fallos, siete causas) se mergeó el 09-09 a las 19:17; PR #1150 (hover sin clic, aviso sobre la pieza, primer gesto actúa) el 10-09 a las 15:55; el build en producción tiene fecha 10-09 **16:16** (+0200, `mtime` de `/var/www/openclo/index.html`); ella grabó a las **20:51**. Probó con todo puesto. Nada de lo que sigue es «no le llegó».

---

## 0. La frase que ordena el documento

María, [13:22]-[13:31], después de doce minutos intentando trazar líneas con la Pluma:

> *"En verdad, claro, una no quiere crear una figura geométrica. **Son las líneas que uno traza para poder seguir dibujando.** Porque yo luego voy a crear más líneas."*

Y la misma idea, un minuto después, ya como pregunta de producto [13:52]-[14:02]: *"me pregunto si se puede hacer como pieza. Solo las piezas cerradas se simulan, pero aún así uno podría llegar a dibujar piezas abiertas y estar allí. No sé hasta qué punto eso sería un problema."*

Eso explica la mitad de la sesión. Vina es **pieza-primero**: la Pluma crea piezas, las internas viven dentro de una pieza, un trazo de tres puntos se cierra solo. María dibuja **líneas-primero**: traza, corta, mide, y la pieza sale al final. Las quejas 20, 21, 24 y 25 no son cuatro quejas: son ella chocando cuatro veces contra el mismo modelo (§ 3, causa N4).

La otra mitad son **dos decisiones tomadas el 09-09 en revisión asistida —sin ella— que ella tumbó al día siguiente** (largos por selección, D1; Pluma cierra siempre, D4), y **una regla que ella misma pidió el 30-08 y que hoy le esconde sus propios puntos** (#1103). Las tres están en § 5, con la cita de cada lado.

Lo que **no** hay en esta sesión: ningún fallo de los once del 07-09 reaparece. Lo que arregló #1149 quedó arreglado. Lo que ella dice tres veces —*"eso se viene"* [02:38], [02:55], [07:42]— es la causa B, que #1149 dejó fuera a propósito y sigue en `2026-09-08-contexto-y-control-numerico-design.md`.

---

## 1. Lo desplegado, medido contra su sesión

| Qué se desplegó | Dónde lo tocó | Qué dijo |
|---|---|---|
| Causa A: la cota se toca (chips «del punto» editables al seleccionar un nodo en `Q`) | [02:15]-[02:40], `t_02-20`, `t_02-40` | *"ah, mover exacto… **wow, eso es una mejora**"* — escribió `100` en el chip y el punto se movió |
| #1150: hover sin clic en `Q`, enganche que se ilumina | [02:07] | *"el punto está muy bien, porque se ilumina"* |
| D4 (09-09): Pluma con ≥3 nodos + Enter cierra sola | [12:10]-[12:26], `t_12-20` | Samuel se lo enseña en vivo → *"claro, te daría un control"* |
| Fallo 4 → D1 (09-09): la pieza seleccionada enseña sus largos, interruptor apagado de fábrica | [03:07]-[03:57], `t_03-10`, `t_03-50` | *"añaden demasiada información en la pantalla y para mí está muy agobiante"* · *"las dos interfaces deberían ser las mismas"* — **lo tumba** (§ 5.1) |
| Fallo 11 → #1150: aviso «abierta: no se puede simular» sobre la pieza | [11:22]-[11:51], `t_11-20` | *"otra vez crea mucho ruido"* — tres trazos de dos nodos = tres avisos superpuestos (§ 3, N4) |
| Causa G: el sujeto es el tramo, sin grupo de creación | [09:32], `t_09-40` | El grupo ya no aparece; **queda el último tramo seleccionado con su chip bajo el cursor** (queja 15) |
| Causa F: Medir engancha al vértice | — | No usó Medir. Sin medir. |
| Cierre: *"está muy cool todo hasta ahora"* [14:19] | | |

Dos de siete decisiones del 09-09 se cayeron con la usuaria delante. No es mala señal del trabajo: es la señal de que **una revisión asistida decide con la mitad de la información**, y conviene tenerlo escrito antes de la próxima.

---

## 2. Las 25, una por una

Veredictos: **no existe** · **existe y no lo encontró** · **existe y está roto** · **existe y está al revés de lo que pide** (decisión escrita que la contradice) · **pendiente conocido** (causa B/D/E, contrato del 08-09 sin implementar). Cada fila trae el fotograma que lo prueba y el mecanismo en código.

| # | Min | Lo que dijo | Veredicto | Mecanismo (verificado) | Causa |
|---|---|---|---|---|---|
| 1 | 00:17-00:32 | *"se han movido los números"* | existe, por diseño | `t_00-10` (Rectángulo: chip Ancho centrado arriba) → `t_00-20` (Seleccionar: el chip salta a la derecha). Las asas del transform box son **estorbos** de los chips a propósito (`PatternEditor.tsx:1040-1056`, medido 04-09: el chip tapaba el asa `e`). Crear no pinta caja; seleccionar sí → el chip huye. | N5 |
| 2 | 00:38-00:44 | *"estos botones de aquí mueven el bichito, se sale de allá, todo se desordena"* | = 1 | `t_00-30`/`t_00-40`: «los botones» son la caja de transformación; «el bichito», el chip. | N5 |
| 3 | 02:01-02:14 | *"si le doy a shift tampoco me deja controlar el ángulo"* (`Q`) | pendiente B | Contrato 08-09 § 3.4: `Shift` → múltiplos de 45°. Sin implementar. **Matiz nuevo** (`t_02-40`): escribió `100` en el chip «del punto» y el punto llegó a 100 pero con el ángulo a pulso — el otro lado quedó en `499,8`. Le falta el ángulo, no el largo. | B |
| 4 | 03:07-03:18 | *"me siguen saliendo todas las medidas… agobiante"* | existe: es D1 del 09-09 | `t_03-10`: trapecio seleccionado, cinco números (Ancho, Alto, y tres lecturas). `piezasConLargos` (`PatternEditor.tsx:215-219`): la pieza seleccionada siempre. | N5 · § 5.1 |
| 5 | 03:45-03:57 | *"funciona cuando no están activadas, pero cuando están activadas se muestra siempre… las dos interfaces deberían ser las mismas"* | **al revés de lo que pide** | D1 fila 1, textual: *"sin depender del interruptor"*. Ella pide que el interruptor mande también sobre la seleccionada. | N5 · § 5.1 |
| 6 | 04:17-04:55 | *"estoy clicando con el izquierdo y no se queda… no se crea"* | **existe y está roto** (para ella) | El punto **sí** se crea — `t_05-10` lo enseña con la Pluma. Nace con rol `smoothSample` (`anchorRoles.ts:81`: ni esquina, ni extremo, ni ancla de bézier) y `PuntosDelContorno.tsx:79` solo pinta `EXTREMOS` (`corner`/`openEndpoint`/`lineEnd`) fuera de una herramienta de curva. Y `EXTREMOS` es también la lista de lo agarrable desde `Z` (`PuntosDelContorno.tsx:46-50`). | **N1** |
| 7 | 05:15-05:23 | *"los crea, pero no te muestra que los crea"* | = 6 | Pluma los pinta porque usa otra lista (`verticesVisibles`: todos los vértices). | N1 |
| 8 | 05:27-05:36 | *"deberían aparecerme con el mismo símbolo, porque es el mismo valor de punto"* | **al revés de lo que pide** | #1103 ejecuta su propia frase del 30-08 [11:38]: *"los de curva igual no, porque son muchos puntos"*. El código no distingue un punto que **ella insertó** de una muestra de curva de un DXF. | N1 · § 5.3 |
| 9 | 05:46-05:53 | *"estos largos me sobran, me están tapando"* (`V`) | **existe y está roto** | D1 fila 2 (sujeto dentro de la pieza → los largos callan) está implementada solo para internas: `haySujetoDentroDeLaPieza = selectedInternalLine !== null` (`PatternEditor.tsx:214`). Un nodo en `V` no cuenta. `t_05-40`: la lectura `509,3` encima del tramo con manejadores. | N5 |
| 10 | 06:03-06:37 | *"curva por puntos… igualmente me crea varios bézier… necesito puntos normales que generen una curva"* | **existe y no lo reconoció** | Reproducido hoy: `convertSegmentToSpline` sobre un tramo entre puntos alineados deja los manejadores **sobre la recta** (test 1/1, `C100,27.1,100,29.2,100,31.3`…). Lo que vio (`t_06-20`): `V` pinta los manejadores derivados como cuadrados rojos, indistinguibles de un bézier; y los puntos de la curva tienen rol `bezierAnchor` → invisibles fuera de `Q`/`V`. Donde se comporta como ella quiere es `Q` (`resmoothAfterMove`, `useEditPattern.ts:716-724`) — y no fue. Las «panzas» de la derecha salen del modo **Bézier** del desplegable de Punto: [06:07] *"creo que puntos de curva es bézier por descarte"*. | **N2** |
| 11 | 07:15-07:29 | *"se paran los puntos, pero no te los están mostrando… uno se siente ciego. Eso es un bug"* | **existe y está roto** | `t_07-20`: el primer nodo de la interna cae en un punto invisible del borde derecho. Tres listas que no coinciden: pintado = agarrable (`EXTREMOS`), enganchable (`snapIndex`: todos), Pluma (`verticesVisibles`: todos). El imán encuentra lo que la pintura esconde. | **N1** |
| 12 | 07:35-07:42 | *"quiero una perpendicular, le estaba dando al shift, no me hace nada"* (`G`) | pendiente B | § 3.4 (45° incluye 90°). `t_07-30`: la píldora marca `-174,1°` mientras ella busca 90. | B |
| 13 | 07:48-07:55 | *"está raro los ángulos… pone menos 179"* | **al revés de lo que pide** | El ángulo es **absoluto** por ratificación: 0° a la derecha, 90° arriba (spec 29-08 § 7.2, cotas vivas § 113, `polarOf` en `polyPenGeometry.ts:117`). `t_07-50`: `91,5 mm · -179,3°` para una línea casi horizontal hacia la izquierda. | **N3** · § 5.2 |
| 14 | 08:42-08:52 | *"debería ser con el punto donde creas el punto inicial"* | hueco de spec | El contrato 08-09 § 3.3 dice *"escribe −90"* sin decir **respecto a qué**. | N3 · § 5.2 |
| 15 | 09:32-09:34 | *"el zoom este me está molestando mucho, porque se pone esto aquí"* | **existe y está roto** | No es el zoom. `t_09-30`/`t_09-40`: al terminar un tramo queda «Editando: el tramo seleccionado» y su chip `57,2 mm · 179,8°` se queda **bajo el cursor**, donde va el siguiente clic. La tanda del 09-09 quitó el grupo de selección (§ 7.2 del informe del 07-09) pero no la selección del último tramo. | N5 |
| 16 | 10:05 | *"¿el patrón lo puedo mover? — no puedes editar las internas — ok, así hay que arreglarlo"* | pendiente E (D3) | `t_10-00`: iba a `Q`. `useEditPattern.ts` no toca `internals` (solo re-ancla piquetes). Contrato 08-09 § 4: `Q` modifica *"del contorno y de las internas"* — sin implementar. Lo que existe hoy es arrastrar extremos desde `Z` (`useEditorInteractions.ts:995`), justo lo que ese contrato retira. | E |
| 17 | 10:11-10:29 | *"quiero decir curva o recta y editar puntos de curva… parece una curva pero son rectas juntas"* | existe y no lo encontró a tiempo | El desplegable «Tipo de punto: Recta / Curva por puntos» de `G` (`t_10-00`: ya lo había cambiado). Arrastrar = bézier, latch = curva por puntos (`usePolyPenTool.ts:27`). | N2 |
| 18 | 10:56-11:02 | *"al mover, que se vayan así las medidas… está raro"* | **existe y está roto** | `t_10-50`: la pieza se arrastra y las cuatro lecturas se quedan **clavadas** en el sitio viejo. El candado de #194 tapa los overlays y vacía `sujeto.cotas` (`PatternEditor.tsx:812`, `1313`), pero `piezasConLargos` (`:215`) no sabe de `isDraggingPiece`. Hermano sin arreglar de #194/#218. | N5 |
| 19 | 11:06-11:18 | *"no puedo controlar ángulos, y el largo lo tengo que poner a pulso"* (Pluma) | **existe y no lo encontró** | `Tab` congela el tramo y abre largo/ángulo (#1129, `usePenTool.ts:284`). La pista inferior lo dice — *"Tab escribe largo y ángulo"*, legible en `t_11-00` — y ella no la lee. El contrato § 3.2 le da el gesto que sí conoce: clic derecho → el mismo chip. | B |
| 20 | 11:22-11:51 | *"dice abierta, no se puede simular… si siempre que me ponen todas abiertas… otra vez crea mucho ruido"* | existe: es #1150 | `t_11-20`: tres trazos de dos nodos → tres piezas abiertas → tres avisos superpuestos (`PieceRenderer.tsx:520-534`, uno por pieza abierta). Funciona como se diseñó. El ruido sale de usar Pluma para **líneas de construcción**. | **N4** |
| 21 | 11:56-12:26 | *"en el tercero te paras… haces ese y le das enter — claro, te daría un control"* | existe, aprendido en vivo | D4 09-09, `usePenTool.ts:337-350`. No es issue. | N4 |
| 22 | 12:39-12:49 | *"que se pare en números redondos… que se pueda elegir a la carta"* | **no existe** | Ni en el contrato: § 3.4 dice que el imán no corrige un número escrito, pero no hay imán a redondos. Hoy lo resuelve `Tab` + escribir (19). `t_12-40`: `70,3 mm` a pulso buscando 70. | B · § 5.6 |
| 23 | 13:10-13:13 | *"perpendicular, que obviamente no está quedando perpendicular"* | = 12 | | B |
| 24 | 13:39-13:47 | *"me gusta que te cree el polígono y lo cierre. Pero no siempre. Que también puedas dejarlo abierto"* | **al revés de lo que pide** | D4 09-09, textual: con ≥3 nodos *"el trazo se cierra solo… Pluma crea piezas, y una pieza abierta no es un panel de prenda. Los trazos de construcción… son de línea interna"*. No hay forma de terminar abierto un trazo de tres o más nodos. | **N4** · § 5.4 |
| 25 | 13:49-14:02 | *"solo las piezas cerradas se simulan, pero aún así uno podría dibujar piezas abiertas y estar allí"* | decisión de producto | Las internas exigen pieza anfitriona (`usePolyPenTool.ts:81`). No hay geometría de construcción fuera de una pieza. | **N4** · § 5.4 |

**Recuento:** 5 rotos (6/7/11 son uno; 9; 15; 18), 5 al revés de lo escrito (5, 8, 13, 24, y 4 como su antesala), 3 que existen y no encontró (10, 17, 19), 1 que no existe (22), 6 pendientes conocidos (3, 12, 16, 19 en parte, 23, y 14 como hueco), 2 que son diseño funcionando (1/2, 20), 1 aprendido (21).

---

## 3. Las causas

### N1. Tres listas de puntos, y solo una se ve

*Quejas 6, 7, 8, 11. Su frase: "no sirve nada si no los muestra, porque uno se siente ciego" [07:26].*

Un vértice del contorno vive en tres listas distintas:

| Lista | Quién la usa | Qué contiene |
|---|---|---|
| `EXTREMOS` (`PuntosDelContorno.tsx:46-50`) | **lo pintado** y **lo agarrable desde `Z`** (a propósito, para que coincidan: #1103 midió 887 agarrables contra 40 pintados) | esquinas, extremos abiertos, extremos de línea |
| `snapIndex` | **el enganche** de Línea interna, Punto, Medir | todos los vértices |
| `verticesVisibles` | **la Pluma** | todos los vértices, deduplicados |

Un punto que ella inserta en un lado recto es colineal: `detectCorners` no lo ve, no es ancla de bézier, no está duplicado → rol `smoothSample` (`anchorRoles.ts:81-93`), **el mismo rol que una muestra de curva de un DXF de CLO**. Y ese rol se esconde por decisión de #1103. Resultado: el punto existe, la Pluma lo enseña (`t_05-10`), el imán se para en él (`t_07-20`), y `Z`/Punto/`G` no lo pintan ni lo dejan agarrar.

Lo que falta no es pintar más: es **la noción de punto intencional**. Un DXF con 300 muestras de sisa no debe pintar 300 glifos (#1103 tiene razón); un punto que María puso con la herramienta Punto a 100 mm de la esquina **es una esquina para ella** [05:34]: *"es el mismo valor de punto"*. Hoy los datos no lo distinguen — ver § 5.3.

### N2. La curva por puntos existe, y se ve como un bézier

*Quejas 10, 17. "Con bézier yo como patronista pierdo control" [06:37].*

El modelo que pidió en la nota #197 está implementado (`splineSegment.ts`): los puntos van **sobre** la curva, mover uno la re-suaviza, y se guarda como `C` para que render y exportadores no cambien. Reproducido hoy: convertir un tramo entre puntos alineados deja los manejadores exactamente sobre la recta (`test 1/1`). No está roto.

Lo que ella vio fue otra cosa, y las dos son de presentación:

1. **`V` (Editar punto de curva) pinta los manejadores derivados** de un tramo gestionado como cuadrados rojos (`t_06-20`), iguales a los de un bézier libre. Arrastrar uno lo convierte en bézier a mano sin aviso (`useEditCurve.ts:383`: `applyNodeMove` sin re-suavizar — por diseño del modelo: *"un bezier movido a mano no se toca nunca más"*). Para ella eso **es** "me crea varios bézier".
2. **Los puntos de la curva por puntos son invisibles fuera de `Q`/`V`** (rol `bezierAnchor`, mismo filtro de N1). El sitio donde el modelo se comporta como ella pide es `Q` (`resmoothAfterMove`) y no lo pisó con la curva.

Y el desplegable de Punto ofrece tres «Tipo de punto» —Punto / Curva por puntos / Bézier— que ella recorrió por descarte [06:07]. Las panzas del borde derecho (`t_06-20`, `t_07-20`) son del modo **Bézier** (`convertSegment(…, true)`, manejadores por defecto), no de la curva por puntos.

### N3. El ángulo es absoluto por ratificación, y ella lo lee como un sinsentido

*Quejas 13, 14; el contexto de 12 y 23.*

`-179,3°` para una línea que sale casi horizontal hacia la izquierda desde un borde vertical (`t_07-50`). Es correcto: 0° a la derecha, 90° arriba, convención **ratificada** el 29-08 § 7.2 y repetida en cotas vivas § 113. Samuel lo explica en vivo [08:11]-[08:37] y ella lo entiende — y aun así pide otra cosa [08:42]: *"debería ser con el punto x, y, en donde creas el punto inicial"*. Lo que ella espera es lo que hace CLO: el ángulo **respecto al borde del que sale** o al tramo anterior, de modo que una perpendicular diga 90.

El contrato del 08-09 § 3.3 hereda el hueco: *"quiere cambiar a −90°: escribe 500, Tab, −90, Enter"* — **menos noventa respecto a qué**, no lo dice. Hay que decidirlo antes de implementar B (§ 5.2), porque el campo de ángulo es el mismo para escribir y para leer.

### N4. Piezas contra líneas de construcción

*Quejas 20, 21, 24, 25. La frase de § 0.*

Ella quiere trazar tres líneas sueltas (una de 200, una perpendicular de 73, otra de 164) y **después** decidir qué es pieza. Vina le responde en cada paso con su modelo:

- Cada trazo de dos nodos se convierte en **una pieza abierta** con su aviso (`t_11-20`: tres avisos superpuestos). #1150 hizo el aviso más visible; ella lo lee como ruido, tres veces [11:22], [11:45], [11:51].
- Con tres o más nodos, Enter **cierra siempre** (D4 09-09). Le gusta como opción [12:26] y la rechaza como regla [13:45]: *"pero no siempre"*.
- Las internas —que es donde D4 manda los *"trazos de construcción"*— exigen pieza anfitriona (`usePolyPenTool.ts:81`). No hay dónde poner una línea que todavía no pertenece a nada.

La decisión D4 del 09-09 dice literalmente *"Pluma crea piezas, y una pieza abierta no es un panel de prenda"*. Es coherente y es lo contrario de su flujo. Ver § 5.4: no se arregla con un aviso mejor.

### N5. Lo que se ve y cuándo, segunda ronda

*Quejas 1, 2, 4, 5, 9, 15, 18.*

El contrato del 09-09 (*"la información es importante, pero es más importante saber cuándo mostrarla"*) se implementó y ella lo probó. Resultado por partes:

| Punto | Estado | Detalle |
|---|---|---|
| D1 fila 1: la pieza seleccionada enseña sus largos siempre | **la tumba** (4, 5) | Quiere que el interruptor mande también sobre la seleccionada — § 5.1 |
| D1 fila 2: un sujeto dentro de la pieza calla los largos | **roto por cobertura** (9) | Solo cuenta la interna; un nodo en `V` no. Y en `Q` con un punto seleccionado (`t_02-10`) salen dos chips «del punto» **más** dos lecturas del contorno — el contrato 08-09 § 5.1 dice *"punto B seleccionado → largos de AB y BC; ninguna de CD"*. Dos contratos, dos respuestas |
| Candado del arrastre (#194) | **roto por cobertura** (18) | Las lecturas de largo no están debajo del candado; se quedan clavadas mientras la pieza se mueve por DOM |
| Asas como estorbos (04-09) | **funciona, y se nota** (1, 2) | El chip huye de la caja al seleccionar. Es el precio de que no tape el asa; el salto entre crear y seleccionar es lo que ella ve como desorden |
| Causa G: el sujeto es el tramo | **residuo** (15) | Al terminar un tramo queda seleccionado con su chip donde va el siguiente clic |

### B, intacta — con tres matices que el contrato no tiene

*Quejas 3, 12, 19, 22, 23.* Seis quejas del 07-09, cinco del 10-09, mismo sitio. Lo que esta sesión añade al contrato del 08-09:

1. **`Shift` es lo primero que prueba**, en `Q` [02:01] y en `G` [07:35]. § 3.4 lo tiene (45°). Que sea lo primero que se implemente de B: es lo que sus manos ya hacen.
2. **`Tab` existe y es invisible.** Está en `usePenTool` desde #1129 y en la pista inferior, y ella pone el largo *"a pulso"* [11:14] con la pista delante. El clic derecho de § 3.2 no es un lujo: es la única puerta que va a encontrar.
3. **Números redondos** [12:41]: *"que se pare en puntos demasiado lógicos… los números que sean psicológicos"*. No está en el contrato — § 5.6.

Y un dato positivo que conviene no perder: el chip «del punto» de la causa A le encantó [02:23], y con él ya mueve un punto a una distancia exacta. Lo que falta para que sea B completa es **el ángulo** al lado del largo, no otra superficie.

---

## 4. Fallos duros (reproducibles hoy, sin decisión pendiente)

1. **Las lecturas de largo se quedan clavadas al arrastrar la pieza** (18) — `t_10-50`. `piezasConLargos` no consulta `isDraggingPiece`. Una condición.
2. **`V` no calla los largos del contorno** (9) — `t_05-40`. `haySujetoDentroDeLaPieza` solo mira `selectedInternalLine`; el nodo/asa de `V` es un sujeto dentro de la pieza por el mismo contrato.
3. **El chip del último tramo queda bajo el cursor al terminar la interna** (15) — `t_09-40`. Al completar el trazo, el tramo no debería quedar seleccionado (o su chip no debería competir con el siguiente clic).
4. **Un punto insertado no se pinta ni se agarra desde `Z`, y el imán sí lo encuentra** (6, 7, 11) — `t_05-10` contra `t_04-50`. Reproducible, pero su arreglo depende de § 5.3.

---

## 5. Lo que la reunión NO decidió (y hay que decidir antes de tocar código)

### 5.1 ¿El interruptor «Largos» manda también sobre la pieza seleccionada?

D1 fila 1 (09-09, Samuel): *"la pieza es el sujeto → sí, los suyos, sin depender del interruptor"*. María (10-09, [03:57]): *"las dos interfaces deberían ser las mismas"*. Son incompatibles. El argumento de D1 era descubribilidad (el fallo 4 del 07-09: nunca los vio); el de ella es densidad (*"cuando tengo una prenda más complicada va a haber muchas piezas"* [03:18]). Una salida que respeta las dos: la selección enseña los largos **solo si el interruptor no los ha apagado explícitamente** (tres estados: auto / siempre / nunca). Es una decisión de Samuel, no de esta nota.

### 5.2 ¿Ángulo respecto a qué?

Absoluto (ratificado 29-08 § 7.2) o relativo al borde de partida / tramo anterior (lo que ella espera y hace CLO). El contrato 08-09 § 3.3 tiene que decirlo, porque el campo de escritura y la lectura de la píldora son el mismo número. Si se cambia, es enmienda a una ratificación, no un ajuste.

### 5.3 ¿Un punto insertado a mano es un extremo?

#1103 (30-08, ella) esconde las muestras de curva; ella (10-09) quiere ver los puntos que insertó. Las dos cosas son correctas y hoy son el mismo rol. Opciones: marcar el punto insertado (cambio de esquema, con los mismos problemas de índice que `notchAnchor`), o derivarlo (un `smoothSample` entre dos `L` es insertado, una muestra de curva está entre `C`). La segunda no toca el esquema. Lo que **no** vale es pintar todos los `smoothSample`: eso deshace #1103 sobre el DXF real.

### 5.4 ¿Pluma puede terminar abierta con tres o más nodos? ¿Hay geometría fuera de una pieza?

D4 09-09 vs [13:47] y [13:58]. Tres caminos, de menor a mayor: (a) un gesto para terminar abierto (`Shift+Enter`, sin aviso, porque lo pidió), (b) internas sin anfitriona —líneas de construcción en el lienzo— que se adoptan cuando nace la pieza, (c) mantener D4 y enseñarle `G`. La (c) ya se probó: lo que ella hace con `G` en [09:05]-[10:05] es exactamente el flujo previsto y sale de él a la Pluma [11:06] porque *"con la de pluma puedo trazar yo las líneas que quiero"*. Esta es la decisión grande de la sesión.

### 5.5 ¿Qué hace `V` sobre una curva por puntos?

Esconder los manejadores derivados y pintar los puntos (la curva se edita desde los puntos), o dejarlos y avisar de que arrastrarlos rompe el gestionado. Hoy no avisa. Y el desplegable de Punto necesita que «Curva por puntos» y «Bézier» se vean distintos después de aplicarlos, no solo antes.

### 5.6 ¿Imán a números redondos?

Nuevo. Compatible con § 3.4 (*"un imán a 499,8 no corrige un 500 escrito"*): sería un imán **mientras arrastra**, a múltiplos de 5 o 10 mm, con tecla. No lo pidió el 07-09.

---

## 6. Cruce con lo abierto

| Causa | Issue / spec | Estado |
|---|---|---|
| B (3, 12, 19, 22, 23) | `2026-09-08-contexto-y-control-numerico-design.md` § 3 | decidido, sin implementar; **§ 3.3 necesita la referencia del ángulo (5.2)** y no tiene los redondos (5.6) |
| E (16) | mismo contrato, § 4 | decidido, sin implementar |
| N1 (6, 7, 8, 11) | #1103 (cerrado) | la regla de #1103 es la causa; reabrir solo con la decisión 5.3 |
| N2 (10, 17) | #197 (curva por puntos, cerrado) | el modelo está; falta la presentación en `V` (5.5) |
| N4 (20, 24, 25) | D4 de `2026-09-09-lo-que-se-ve-y-cuando-design.md` | decisión del 09-09 en conflicto con la usuaria (5.4) |
| N5 (4, 5) | D1 de la misma spec | ídem (5.1) |
| N5 (9, 18, 15) | ninguno | fallos duros, § 4 |
| 1, 2 | `cotas-se-comian-los-mandos-del-transform-box` (04-09) | diseño funcionando; el salto es su efecto visible |

Ninguna de las 25 tiene issue propio hoy. Las que son fallo duro (§ 4) pueden abrirse ya; las demás **dependen de una decisión de § 5** y abrirlas antes es escribir el issue al revés — que es lo que pasó con 5 de 8 en la tanda anterior.

---

## 7. Lo que NO es de esta sesión

- Medir, Tijeras, Coser, Margen, Piquete: no los tocó. Nada que decir.
- Ningún fallo del 07-09 volvió. El cursor no parpadea, el rectángulo no repite, convertir en curva convierte.
- El aviso de pieza abierta **funciona** (`t_11-10`); su problema es de modelo (N4), no de visibilidad.

---

## 8. Firmas — 2026-09-12

Samuel contestó el § 5 en el artefacto «Seis decisiones del 10-09» (`https://claude.ai/code/artifact/96e9033a-f214-4ee4-9773-00342a7467f1`), con las capturas de cada momento delante. Firmas leídas de la base del artefacto el 12-09 a las 11:55 (+0200). Las notas van textuales.

| Decisión | Firmó | Nota de Samuel | Issue |
|---|---|---|---|
| 5.1 Largos | **C** — chip con tres estados | *"la idea es que ella pueda seleccionar qué ver cuando selecciona una pieza, los largos no le sirve que estén allí todo el tiempo. le incomodan para poder trabajar en la pieza, así que idealmente solo cuando se crea la pieza. pero que todo sea configurable"* — el estado de fábrica es **al crear**, no al seleccionar | #1155 |
| 5.2 Ángulo | **B** — relativo al borde de partida / tramo anterior | — | #1156 |
| 5.3 Punto insertado | **A** — entre dos rectas, se pinta y se agarra como esquina | *"a lo que ella se refiere es que estaba creando puntos y no se veían y quiere que el objeto se dibuje igual que como se está dibujando en las esquinas"* | #1157 |
| 5.4 Pluma / líneas | **B** — líneas de construcción fuera de pieza (spec propia) | — (ver la nota de 5.6: *"esa pieza abierta nunca puede ser considerada como una pieza real para simular en el 3D, serían como líneas de construcción"*) | #1158 |
| 5.5 V sobre curva por puntos | **A** — esconde manejadores, enseña puntos | — | #1159 |
| 5.6 Imán a redondos | **B** — sin imán; Tab y clic derecho visibles | *"no queremos números psicológicos que predigan largos, tienen que ser o a mano alzada o editables 100%"* · *"ahora me entero de que podía hacer lo que quería con la tecla TAB y me parece genial, me encanta, lo quiero conservar. Pero entonces tiene que ser más visible"* | #1160, #1161 |

### 8.1 Lo que encontró Samuel al firmar la 5.6

Probó Tab en la Pluma antes de firmar y dejó tres cosas que no estaban en la sesión de María:

1. *"si edito el largo y clico enter no me deja editar el ángulo"*
2. *"si edito el largo, no clico enter y me voy al ángulo, pierde el valor que le di al largo"*
3. *"cuando uno acaba de utilizar esta herramienta utilizando los TAB para editar las líneas, lo que he dibujado desaparece de la pantalla, y debería quedar la pieza abierta dibujada"*

Las tres son de la gramática del tramo congelado (#1129, cotas vivas § 5.4) y van juntas en #1161, **por reproducir antes de tocar**. La tercera enlaza con 5.4: lo que queda al terminar no es una pieza, es construcción.

### 8.2 Un principio que salió de la firma, para no volver a proponerlo

> *"tienen que ser o a mano alzada o editables 100%"*

Vina no adivina números. Ningún imán a valores «bonitos» en ninguna herramienta: el ratón da lo que da, y el número exacto se escribe. Queda como regla de producto, no como opción descartada.

---

## 9. Firma del 23-09 — Shift, respecto a la hoja

Las quejas 3, 12 y 23 (*"le estaba dando al shift, pero no me hace nada"*) tenían la regla escrita desde el 08-09 (§ 3.4: múltiplos de 45° mientras se mantiene), pero no decían **respecto a qué**. Con la firma D2 la píldora ya lee el ángulo desde el borde, y en un borde inclinado «perpendicular al borde» y «vertical de la hoja» son líneas distintas. La pregunta se le puso delante con capturas reales (artefacto «Shift y la perpendicular», `https://claude.ai/artifact/Qyea31bCA895AcJTftLXxE`). Firma leída de la base del artefacto (`firmas/shift`): **B, respecto a la hoja**, el 23-09 a las 10:38 (+0200). El campo «Quién firma» quedó vacío; la nota habla en primera persona como patronista. La nota, textual, con su ortografía:

> *"A ver las dos opciones han sido difíciles para mi, en cuanto a decantarme por una u otra, porque es importante poder hacer ángulo desde borde de  la linea (el punto local) o desde el eje de la hoja. Idealmente cuando uno hace SHIFT podrían salir guías para las dos opciones contemplando que el usuario pueda elegir la que quiera pero si hay que elegir forzadamente por una como standard, creo que me decanto porque sean los ángulos respecto a la hoja o pantalla y te explico porque, es por la perspectiva del patronista, una pieza de patrón siempre lleva un dirección respecto a los bordes de la tela, piensa como se corta, entonces aunque haya lineas curvas e inclinadas todas siempre parten de unas perpendiculares que son las que envuelven el cuerpo y las que guían para la construcción del patrón. pienso yo que era mas frecuente tener las guías de ángulos respecto a la hoja que respecto a un citado [costado] que es inclinado pero respecto al ángulo recto del material y no de ese propio costado, no se si me explico. pero bueno dicho esto, probare esa opción B que he marcado, pero idealmente, se pudieran trazar los ángulos respecto a la hoja y respecto al punto de la linea desde donde se dibuja."*

**Lo que queda hecho:** Shift endereza respecto a la hoja en la Pluma, la Línea interna, al arrastrar puntos y tramos en Editar patrón (`Q`) y en el Hilo, que ahora usa la misma regla. **Todavía no** al arrastrar un punto en Seleccionar o Editar curva, ni los extremos de trazos e internas desde Seleccionar. Los tres primeros reagrupan las anclas frame a frame (el defecto que se corrigió en `Q`): con Shift, pasar por encima de otra ancla y llevársela dejaría de ser raro. El de las internas no gira el delta en una pieza girada (#1068). Consecuencias y razones en la enmienda del contrato del 08-09 § 3.4.

**Lo que queda pendiente:** su ideal de las **dos guías a la vez** (hoja y borde) al pulsar Shift. Lo dijo como «idealmente», no como condición de la firma. Diseño en `docs/superpowers/specs/2026-09-23-shift-hoja-y-borde-design.md`.

**24-09 — hecho:** las dos guías, con **Shift dos veces** para el borde (la tecla no es Alt: Vina tiene que funcionar con cualquier teclado, y Alt+Shift o Ctrl+Shift cambian el idioma del teclado en Windows; spec § 3.5). Shift una vez sigue siendo la hoja que firmó. Queda enseñárselo en su máquina y comprobar allí que alternar de guía no dispara las teclas especiales de Windows (cinco Shift seguidos).

---

## 10. La queja 16, en marcha — 2026-09-24

*"el patrón lo puedo mover? no puedes editar las internas, ok, así hay que arreglarlo"* [10:05].

Decidido por Samuel el 24-09 como la frontera entera del contrato del 08-09 § 4 (spec `docs/superpowers/specs/2026-09-24-frontera-seleccionar-editar-design.md`). Hechas las fases 1 y 2: en `Q` ya se editan las internas de forma propia —mover puntos y tramos, Shift, enganche, insertar, borrar y pasar un tramo a curva por puntos, lo que pidió en [10:16]—, y Supr sobre un tramo quita solo ese tramo. Falta que `Z` deje de editar (fase 4): hasta entonces, su pregunta del 30-08 y del 07-09 —*"¿cuál es la diferencia?"*— sigue con respuesta a medias.
