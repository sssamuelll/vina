# Lo que se ve, y cuándo — enmienda de la revisión asistida del 2026-09-09

> **Enmienda 2026-09-13:** la firma D1 posterior reemplaza los largos automáticos de cualquier pieza seleccionada por Al crear/Todas/Ninguna, con supresión por sujeto interno. D3 conserva las inserciones humanas sin aumentar los glifos del DXF y D5 separa spline gestionada de Bézier libre. Mecanismos y pruebas en el [contrato integrado](../../reports/2026-09-13-seis-firmas-maria.md).

> **Estado: decidido, para implementar en la PR #1149.**
> Sale de una revisión asistida en vivo (Samuel probando, Claude guiando) sobre
> la propia rama de la reunión del 07-09. Tres de los nueve pasos dejaron una
> nota de diseño; esto las resuelve.

## 0. La frase que ordena el documento

> **Samuel, 2026-09-09:** *"la información es importante pero es más importante
> saber cuándo mostrarla y hacerle ver al usuario que es editable (accionable)."*

Dos exigencias distintas, y conviene no confundirlas: **cuándo** aparece algo, y
**qué promete** su aspecto. Un chip que parece accionable y no lo es miente peor
que un texto gris que no promete nada.

---

## 1. D1 — Los largos por lado se muestran cuando se trabaja la pieza

**Hoy:** `showLineLengths` nace en `true` (`editorSlice.ts:30`, tanda 4
`dbb78694`) y `PieceRenderer.tsx:489` pinta los largos de **todas** las piezas,
**siempre**. Samuel: *"nunca desaparecen y es un poco anoying… siempre allí
contaminando la vista."*

**Decisión:**

| Situación | Largos por lado |
|---|---|
| La pieza **es el sujeto** | **sí**, los suyos — sin depender del interruptor |
| Hay un sujeto **dentro** de la pieza (un tramo de interna, un piquete) | **no** |
| Ningún sujeto, interruptor apagado | no |
| Interruptor «Largos» encendido | sí, en todas, todo el tiempo |

Y **el interruptor vuelve a nacer apagado**.

> **La segunda fila no estaba en la primera versión de este contrato, y su falta
> costó ocho pruebas rojas.** Decía «pieza seleccionada», y `selectInternalLine`
> deja `selectedPieceIds = [pieceId]` (`editorSlice.ts:123`): clicar **un tramo**
> de una interna marca su pieza anfitriona como seleccionada. Implementado al
> pie de la letra, eso encendía las cuatro lecturas del contorno encima de la
> cota del tramo — la sobresaturación de la causa G, resucitada por la puerta de
> al lado.
>
> **El sujeto no es «la pieza tocada», es lo más fino que se está tocando.** Si
> lo que se trabaja es un tramo, los largos del contorno son ruido. Lo detectó
> el delegado dejando esas pruebas rojas en vez de ajustarlas.

**Esto enmienda la tanda 4 de esta misma PR, a propósito.** Aquella encendió el
interruptor de fábrica para cerrar el fallo 4 — que era que María tuvo el chip
«Largos» delante 25 minutos sin saber que existía. El fallo era que **nunca los
veía**; con la selección los ve cada vez que toca una pieza, que es más
descubrible que un interruptor que no encontró y no cuesta el ruido permanente.

Es además lo que ella pidió, textual [06:55]:

> *"cuando clico esto sí que me sería muy interesante que encima de cada línea
> me dijera cuánto mide cada línea"*

**Cuando clico.** No siempre.

Y es la ley de densidad del contrato de interfaz: *"María trabaja horas viendo
el patrón"*. Cuatro rótulos por pieza × todas las piezas es ruido que compite
con el patrón.

## 2. D2 — Pasan al material de cota, en su variante de lectura

**Hoy** son `<text>` suelto en `--ink-on-light`, sin fondo, sin material
(`LineLengthLabels.tsx:63-77`). El spec de cotas vivas del 30-08 § 89 lo dejó
así por escrito — pero eso se decidió **ocho días antes** de que María dijera
qué prefería, y nadie lo revisó después.

Lo que ella dijo, comparando los dos estilos [07:25]-[07:58]:

> *"Fíjate que los otros están bastante bonitos estos, con ese fondo ahí […]
> todo oscuro y la letra casi ni se lee, pero en verdad me gusta bastante este,
> ¿sabes por qué? […] **más allá de los colores, porque aparece encima de la
> línea**"* — y a *"¿te gusta más eso que lo de la raya al lado?"*: *"creo que
> sí"*.

**Decisión:** los largos por lado usan el material de cota en su variante
**`.cota--lectura`**, que ya existe (`cotas.css:89`, spec 2026-09-02 § 4.2 R2):
`opacity: 0.8`, sin sombra, `pointer-events: none`.

**No se vuelven editables, y es deliberado.** Escribir el largo de un lado
cualquiera de un contorno curvo no es una operación definida hoy —
`cotasDePieza` solo produce Ancho y Alto, y su `apply` llama a `resizePieceTo`,
que sabe de la **caja**, no de un lado. Prometer edición con la piel de un chip
editable sería la mentira que este documento abre reprochando.

La variante de lectura es justo el modo que este repo ya declaró para eso, y su
propio comentario dice por qué pesa menos: *"por opacidad y sin sombra, no solo
por tono"* — contrato § 4, `seleccionado > hover > reposo`.

> **Queda dicho lo que NO se hace:** que el largo de un lado sea editable es una
> decisión geométrica pendiente (¿qué se mueve al escribirlo: el nodo, el lado,
> la pieza?). Es hermana de la del largo de una curva, que el contrato del 08-09
> § 122 ya dejó en solo lectura *"mientras no se decida cómo deformarla"*. Las
> dos esperan la misma decisión.

## 3. D3 — Un lado que ya lleva chip no lleva además su lectura

Esto es lo que Samuel fotografió: en un rectángulo seleccionado, el lado de
arriba enseña el chip **«100 mm»** (Ancho, editable) y justo debajo **«100.0
mm»** en gris. **El mismo número, dos veces, en dos idiomas visuales.**

Es la causa C de la reunión —*"he creado dos cuadros para una misma
información"*— viva sobre el contorno de la pieza, después de haberla dado por
cerrada para las internas.

**Decisión:** un lado cuyo chip de cota ya está anclado sobre él **no** recibe
además su lectura de largo. Se compara por los extremos del anclaje.

En un rectángulo seleccionado eso deja: Ancho (arriba), Alto (derecha), y
lecturas solo en izquierda y abajo. **Cuatro números, ninguno repetido.** En una
pieza curva, los anclajes de Ancho/Alto son esquinas de la caja envolvente y
generalmente no caen sobre ningún lado del contorno, así que salen todas las
lecturas — que es exactamente lo que ella pedía en [06:34]:

> *"ya no tengo un rectángulo, pero me siguen apareciendo solo dos medidas de
> dos líneas […] y cada línea mide una cosa"*

## 4. D4 — Pluma: Enter cierra, y deshacer es la salida

**Hoy** Enter termina el trazo tal como esté; si quedó abierto, se crea la pieza
y sale un aviso (`PieceRenderer.tsx:532`). El aviso funciona — se verificó a
mano el 09-09 y aparece. El problema no es que falle: es que **avisar de algo
que se puede resolver solo es peor que resolverlo**.

**Decisión de Samuel, y coincide con una ley ya escrita:**

> Contrato de interfaz § 4: *"Para algo destructivo, prefiere **actuar y ofrecer
> deshacer** antes que preguntar."*

| Nodos al pulsar Enter (o doble clic) | Qué pasa |
|---|---|
| **≥ 3** | el trazo **se cierra solo**, como si el último clic hubiera caído sobre el punto 1. Sin aviso. `Ctrl+Z` deshace la pieza entera si no era eso |
| **2**, o Esc con ≥ 2 | no hay pieza: queda un **trazo** (línea de construcción). La Pluma no crea piezas abiertas — `2026-09-12-trazos-lineas-de-construccion-design.md` § 3 |

El aviso no se borra del código: se le retira el caso que ya no ocurre.

**Por qué no rompe el BLOCKER de Serrano.** Aquel exigía que no se pudiera
llegar en silencio a una pieza que no simula. Con esto no se llega: con tres o
más nodos ya no se produce, y con dos nodos queda un trazo, no una pieza
abierta de la que advertir (spec `2026-09-12-trazos-lineas-de-construccion`). La
superficie que él protegía queda cubierta por construcción en vez de por
advertencia.

> **Enmendado el 2026-09-12.** Con dos nodos ya no se avisa **porque ya no se
> crea la pieza**: queda un trazo. El BLOCKER sigue cubierto, y por el lado
> fuerte — de la Pluma no sale ninguna pieza abierta, así que no hay nada de qué
> advertir. El aviso (`PieceRenderer.tsx`) se queda para las piezas abiertas que
> vengan de un DXF o de otra puerta. Spec de trazos § 3.1.

**Por qué Pluma sí y las internas no.** Pluma crea **piezas**, y una pieza
abierta no es un panel de prenda. Los trazos de construcción y las líneas de
referencia son de la herramienta de **línea interna** (`g`), que vive dentro de
una pieza y no tiene por qué cerrar. No se toca.

> **Enmendado el 2026-09-12.** Los trazos de construcción ya no van por Línea interna: son `Trazo`, sueltos en el lienzo, y nacen de la Pluma al terminar abierta. María [13:31]: *"son las líneas que uno traza para poder seguir dibujando"*. Spec de trazos § 1.

## 5. D5 — Un tramo convertible se ve convertible

Samuel, sobre el paso previo al clic derecho en «Convertir en curva»:

> *"me gustaría que el usuario entienda que es accionable."*

**Decisión:** con **Editar patrón** activo, el tramo del contorno bajo el puntero
se resalta. Es una señal de *hover*, así que pesa **menos** que un tramo
seleccionado (contrato § 4) y no cambia de contexto por sí sola (contrato del
08-09 § 2: *"el hover anticipa, nunca cambia de contexto"*).

Si el resalte se escribe en CSS con `:hover`, la misma regla lleva su
`:focus-visible` — el trinquete R5 empareja línea a línea y hoy está en 35.

## 6. Fuera de alcance, dicho

- Que el largo de un lado sea editable (§ 2, decisión geométrica pendiente).
- Tocar la paleta ni los tokens de la cota: María dijo *"más allá de los
  colores"*, y la familia azul está aprobada y cubierta por
  `cotas-contraste.test.ts`.
- Las causas **B**, **D** y **E** del 07-09, que siguen decididas y sin
  implementar en `2026-09-08-contexto-y-control-numerico-design.md`.

## 7. Pruebas de aceptación

1. Proyecto recién abierto, sin selección: **ningún** largo por lado a la vista,
   y el chip «Largos» apagado.
2. Clic en una pieza: aparecen los largos de **sus** lados, con material de cota
   en variante de lectura, y no reciben el clic (`pointer-events: none`).
3. Rectángulo seleccionado: **ningún número repetido** — el lado de Ancho no
   lleva además su lectura.
4. Interruptor «Largos» encendido sin selección: salen en todas las piezas.
5. Pluma, tres clics, Enter: la pieza **cierra** (su contorno tiene `Z`) y **no**
   sale el aviso.
6. Pluma, dos clics, Enter: ~~la pieza queda abierta y **sí** sale el aviso~~ →
   **enmendado el 2026-09-12**: queda un **trazo**, ninguna pieza y ningún
   aviso (`tests/e2e/trazos.spec.ts`, recorrido 1).
7. Editar patrón, puntero sobre un tramo del contorno: el tramo se resalta; al
   salir, vuelve a reposo.
8. El trinquete de UI no sube ningún contador.

## 8. Enmiendas a specs anteriores

| Documento | Qué cambia |
|---|---|
| `2026-08-30-cotas-vivas-design.md` § 89 | «Largos de línea… sigue igual, sin interacción» deja de valer: pasan a material de cota en variante de lectura (§ 2) y a mostrarse por selección (§ 1) |
| Tanda 4 de la PR #1149 (`dbb78694`) | `showLineLengths` vuelve a nacer apagado; el fallo 4 lo cierra la selección, no el interruptor (§ 1) |
| `2026-09-08-contexto-y-control-numerico-design.md` | § 5.1 gana la fila del contorno: un lado con chip no lleva lectura (§ 3) |

**Enmendado el 2026-09-12** (#1158) por
`2026-09-12-trazos-lineas-de-construccion-design.md`: la fila de **2 nodos** de
D4 y el párrafo *"Por qué Pluma sí y las internas no"* de § 4 (ver las dos notas
de enmienda ahí) y el recorrido 6 del plan de pruebas de § 7. El motivo es el de
María [13:31] — *"son las líneas que uno traza para poder seguir dibujando"*—:
una raya suelta no es una pieza abierta, es un **trazo**, y la Pluma dejó de
poder crear piezas abiertas.
