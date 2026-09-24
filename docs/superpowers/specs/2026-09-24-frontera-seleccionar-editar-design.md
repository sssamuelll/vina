# Seleccionar selecciona, Editar patrón edita — la frontera del § 4, entera

**Fecha:** 2026-09-24 · **Estado:** decidido por Samuel el 24-09, sin implementar. María no lo ha visto funcionando: las decisiones salen de sus palabras del 30-08, el 07-09 y el 10-09.
**Construye sobre:** `main` en `72f0ad9d` (#1211, Shift dos veces).
**Contratos que toca:** `2026-09-08-contexto-y-control-numerico-design.md` § 2.1 (fila «Edición de pieza»), § 2.2 (quién gana), § 3.4 (dónde actúa Shift), **§ 4 (D3), que es lo que esta spec implementa**, y § 5 (Supr por tramo); `2026-09-12-trazos-lineas-de-construccion-design.md` § 5.3; `2026-09-18-editar-los-largos-de-una-pieza-design.md` § 3.1; #1103; el contrato de interfaz (`.claude/skills/contrato-de-interfaz/`).

---

## 1. De dónde sale

Tres sesiones, la misma queja contada desde los dos lados de la frontera:

| Sesión | Lo que dijo | Qué señala |
|---|---|---|
| 30-08 [12:48] | *"es curioso que estos puntos los puedo mover con el comando seleccionar o con el de editar, creo, y esto es mi pregunta, es cuál es la diferencia, ahí está un poco raro, se duplica y es como que no está bien definido para qué es cada comando"* | Z edita el contorno |
| 07-09 [23:02]-[23:26] | *"el de seleccionar me selecciona al cuadrado, bueno selecciona la interna, y también me deja editarla, o sea es como este botón está multifunción […] no sé cuál es la diferencia entre el de editar y el de seleccionar"* | Z edita las internas |
| 10-09 [10:05] | *"el patrón lo puedo mover? no puedes editar las internas, ok, así hay que arreglarlo"* | Q no edita las internas |

Y en la misma respuesta del 10-09 [10:11]-[10:29], lo que quería hacer con la interna una vez dentro: *"decir que ahora quiero hacer curva o hacer una recta y editar puntos de curva"*.

El contrato del 08-09 lo decidió en su § 4 —**Z selecciona e inspecciona; Q modifica puntos y tramos, del contorno y de las internas**— y quedó «decidido, sin implementar». El informe de la reunión del 10-09 (§ 6) lo lista como la causa E pendiente. La spec de trazos (§ 5.3) añadió que, cuando Q toque las internas, tocará los trazos por la misma puerta.

**Lo que hay hoy (leído en el código el 24-09):**

- Q solo conoce el contorno. `useEditPattern.ts` extrae nodos, hace hit-test, arrastra, borra e inserta sobre `piece.outline`; de las internas solo re-ancla los piquetes.
- Z deforma por tres vías:
  1. **Extremos de la interna seleccionada** (`useEditorInteractions.ts`, `internalLineDragRef`): solo el primero y el último, sin Shift, sin enganche y sin girar el delta en una pieza girada (#1068).
  2. **Puntas del trazo seleccionado** (`trazoDragRef`, spec de trazos § 5.3).
  3. **Vértices del contorno:** clicar un punto visible de la pieza seleccionada, o hacer doble clic sobre ella, abre el editor de curvas (`useEditCurve`) **sin salir de Z**, con sus asas.
- La spec de #1167 da por hecho que *"ningún arrastre desde Z deforma nada"* (§ 3.1). Hoy no es verdad.
- La pista del pie de Z dice lo contrario del contrato: *"Seleccionar mueve la pieza, y un punto si pinchas encima · Editar patrón además añade, borra y curva"* (`HintText.tsx`). Se escribió como respuesta a su [12:48].

**Éxito:** en Q, María mueve puntos y tramos de una interna que dibujó, inserta y borra puntos y cambia un tramo de recta a curva, con Shift y con números como en el contorno; y lo mismo con un trazo. En Z el ratón ya no deforma nada, así que la diferencia entre las dos herramientas se ve.

**Restricciones que siguen vigentes:** su firma del 13-09 (*"no quiero opciones"*): nada de interruptores ni desplegables nuevos. Vina funciona con cualquier teclado (Samuel, 24-09): ningún gesto nuevo pide Alt o Ctrl con Shift. Y el contrato de interfaz.

---

## 2. Decisiones tomadas en el diseño

Todas de Samuel, el 24-09, con el código delante.

| # | Pregunta | Decisión | Descartado |
|---|---|---|---|
| 1 | ¿Qué alcance? | **La frontera entera:** Q edita contorno, internas y trazos; Z deja de deformar por las tres vías; V trabaja también sobre internas y trazos | Solo internas en Q, o internas y trazos sin tocar el contorno en Z: los dos dejan en pie su queja del 30-08, que es el «media nota cerrada como nota entera» de #1035 |
| 2 | ¿Qué internas edita Q? | **Las de forma propia:** referencia, doblez dibujado, pespunte, costura del DXF, hilo y pinza | Solo las de dibujo (el hilo y la pinza se quedarían sin ratón al retirarlo de Z); todas con aviso (la edición de un piquete o de un doblez de pliegue se pierde sola) |
| 3 | ¿Cuándo se ven sus puntos? | **Al entrar en la pieza** (o al pasar el ratón antes de entrar), junto con los del contorno | Al elegir la interna (dos gestos para mover un punto); al pasar el ratón por la interna |
| 4 | Un extremo de interna sobre un punto del contorno: ¿qué agarra el clic? | **El contorno, salvo que la interna esté elegida** | Se mueven juntos (un anclaje a medias: solo en esquinas, no a mitad de lado); la interna manda |
| 5 | ¿Cómo se construye? | **Una sola vía de edición para toda línea** (contorno, interna, trazo), sacada primero sin cambiar nada | Hooks aparte (las dos listas que se desincronizan, otra vez); solo mover (ella pidió convertir en la misma frase) |
| 6 | Supr sobre un tramo de interna | **Borra solo ese tramo**, en Q y en Z | Seguir borrando la interna entera: contradice «lo que se ve es lo que se borra» y el § 5 del 08-09 |
| 7 | Esc en Q sin nada elegido | **Vuelve a Z con la pieza seleccionada** (tabla del § 2.1 del 08-09) | Salir de la pieza y quedarse en Q, como hoy |
| 8 | La pista del pie de Z | **La frase de § 5.4** | Dejar la de hoy, que pasaría a ser falsa |

---

## 3. Q: lo que se ve y lo que se agarra

### 3.1 Objetos y líneas

Q sigue editando **un objeto a la vez**, y un objeto tiene una o varias **líneas**:

| Objeto | Sus líneas | Marco de coordenadas |
|---|---|---|
| Pieza | su contorno y cada una de sus internas editables | el local de la pieza (posición y giro) |
| Trazo | el trazo | el del patrón |

Se entra en un objeto como hoy se entra en una pieza: sin nada en edición, el primer press sobre algo suyo entra y actúa (`enterEditActuando`). Con un objeto en edición, clicar otro distinto —pieza o trazo— lo pone en edición sin actuar, que es el contrato verde de hoy entre piezas.

### 3.2 Qué internas

| Tipo | En Q | Por qué |
|---|---|---|
| Referencia, doblez dibujado, pespunte | se editan | su `path` es su verdad; son las que crea la Línea interna |
| Costura (`seam`, del DXF) | se edita | ídem |
| Hilo | se edita | dos puntos; Shift lo endereza a la hoja |
| Pinza | se edita | con la copia `piece.darts` al día (§ 7) |
| Piquete | **no** | se ancla al borde (`notchAnchor`) y se recoloca al editar el contorno: un punto movido a mano volvería a su sitio en la edición siguiente. Se edita con Piquete |
| Doblez generado por un pliegue (`foldOptions.pleatId`) | **no** | `updatePleat` lo regenera y la edición se perdería sin aviso. Se edita desde el pliegue |

Una sola función decide esta lista, `esInternaEditable(line)`, junto a `seSeleccionaPorTramo` en `types.ts`. La consultan todos los caminos: lo que se pinta, lo que se agarra y lo que engancha. Es la lección de #1103 (887 agarrables contra 40 pintados): si pintar y agarrar no leen la misma lista, se separan.

### 3.3 Lo que se ve

- Con una pieza en edición, o bajo el ratón antes de entrar, se pintan a la vez los puntos del contorno y los de sus internas editables, con los glifos de `AnchorGlyph` que ya usa el contorno: cuadrado es esquina, redondo es punto de curva, rombo es extremo abierto. La pista del pie de Q ya lo explica.
- Los roles de una línea abierta:
  - sus dos puntas son **extremo abierto**;
  - un punto interior es **esquina** si el recorrido quiebra (el criterio de `detectCorners`) o si lo insertó ella sobre una recta (`authoredAnchor`, firma D3 del 12-09);
  - es **ancla de curva** si toca un tramo `C` o `Q`;
  - si no, es **muestra**.

  Una interna cerrada (la Línea interna puede cerrar la forma) se clasifica como el contorno.
- Q pinta todos los roles, como hoy con el contorno. Los piquetes y los dobleces de pliegue se pintan igual que siempre, sin puntos.
- El tramo bajo el ratón y el tramo elegido llevan el mismo resalte de acento que un lado del contorno. Elegido > hover > reposo (ley 4 del contrato de interfaz).
- Un trazo bajo el ratón, o en edición, enseña sus puntos igual.

### 3.4 Quién gana el clic

| Competencia | Gana | Fuente |
|---|---|---|
| Punto contra tramo, a 8 px | el punto | § 2.2 del 08-09 |
| Dos puntos que coinciden, uno del contorno y otro de una interna | **el del contorno, salvo que esa interna esté elegida** | decisión 4 |
| Dos puntos coincidentes de dos internas | la elegida; si ninguna lo está, la pintada encima (la última de `internals`) | § 2.2: «empate: el seleccionado, luego orden de dibujo» |
| Dos tramos | el más cercano; si empatan, el elegido y luego el de encima | § 2.2 |
| Algo de la pieza en edición contra algo de otro objeto | lo de la pieza en edición | § 2.2: «en `Q`, la que se está editando» |
| Nada en edición: punta de trazo sobre un vértice de pieza | el trazo, que está encima | spec de trazos § 5.2 |

Todas son la misma idea, que ya recorre el 08-09: **lo que ya es sujeto gana.** Por eso el clic se puede predecir sin aprender reglas nuevas.

Mover la esquina deja la interna donde estaba, como hoy al editar el contorno. Para llevarse su extremo, se elige la interna (un clic en uno de sus tramos) y se arrastra. Para volver a pegarlo a la esquina basta arrastrarlo cerca: engancha (§ 4.3).

### 3.5 «La interna elegida» tiene una sola fuente

Es `editor.selectedInternalLine` (y `editor.selectedTrazo` para un trazo), la misma que ya usan Z, las cotas, el resalte de `PieceRenderer`, Supr y el menú contextual.

- Q la **lee** para la precedencia de § 3.4.
- Q la **escribe** cuando elige algo de una interna: un tramo → `{ pieceId, lineId, segmentIndex }`; un punto → `{ pieceId, lineId }`, sin tramo, y qué punto es lo guarda el hook. Con un punto elegido, Supr y las cotas del punto los atiende Q antes que nadie (su manejador de Supr va en captura, CF-1), así que esa selección de línea entera no borra la línea.
- Elegir algo del contorno la vacía, y soltar lo elegido (Esc, clic en vacío) también.

Así, el doble clic desde Z (§ 5.3) entra con la interna ya elegida sin código propio. El estado local de Q guarda solo lo que la selección global no puede decir: qué puntos, y la selección de varias líneas que deja el marco.

Nada de esto cambia el esquema: `InternalLineSelection.segmentIndex` ya existe.

---

## 4. Q: lo que se hace

Todo es lo que el contorno ya hace hoy, aplicado a cualquier línea. Donde el contorno tiene una regla, la línea la hereda; lo nuevo va dicho.

### 4.1 Arrastrar

- **Un punto:** se mueve él con su grupo de anclas coincidentes **dentro de la misma línea** (`anchorGroupOf`, calculado al empezar el gesto, como corrigió la enmienda del § 3.4). Nunca arrastra puntos de otra línea: esa era la decisión 4 descartada.
- **Un tramo:** se trasladan sus dos extremos.
- **Varios:** Shift+clic añade y quita, y el marco coge los puntos de **todas** las líneas visibles del objeto en edición. Un arrastre los mueve todos con el mismo vector (§ 3.1 del 08-09, «mover varios»).
- **Pieza girada:** el delta se gira al marco local, como ya hace Q (`patternToPieceLocalDirection`). El punto va hacia donde va el puntero.

### 4.2 Shift

La regla no cambia (§ 3.4 del 08-09 y su enmienda del 24-09): Shift una vez, la hoja; Shift dos veces, el borde. En una interna o un trazo, «el borde» de un punto es **el tramo de su línea que llega a él**; para el primer punto, que no tiene tramo que le llegue, **el que sale**. En un tramo, su propia recta. Las dos guías se ven con `GuiasShiftOverlay`, como hoy.

### 4.3 Enganche

**Solo** al arrastrar **un** punto (con su grupo coincidente) de una interna o de un trazo; arrastrar un tramo o varios puntos no engancha, porque no hay un punto que decida adónde. Engancha a lo mismo que la Línea interna —vértices, puntas de internas y de trazos, cruces y recorrido del contorno— con el mismo anillo de aviso (`snapIndex`, `resolveSnap`). El índice se construye al empezar el gesto y **sin la propia línea**: un punto no engancha a sí mismo ni a sus vecinos.

Precedencia, la del § 3.4: número escrito > Shift > enganche > ratón.

Los puntos del contorno siguen sin enganche, como hoy (§ 11).

### 4.4 Insertar y convertir

- **Doble clic** sobre un tramo de interna o de trazo inserta un punto (`splitSegmentAt`, que ya lo marca `authoredAnchor`), igual que en el contorno.
- **Clic derecho** sobre un tramo ofrece los mismos verbos que en el contorno: convertir en curva, en recta, en curva por puntos y en Bézier (`convertToCurve`, `convertToLine`, `convertSegmentToSpline`, `toManualBezier`). Es lo que pidió en [10:16]: *"decir que ahora quiero hacer curva o hacer una recta"*.

### 4.5 Cotas

| Elegido | Cotas | Fuente |
|---|---|---|
| un punto de una línea | los largos de sus dos tramos (uno si es una punta), editables | § 5.1 del 08-09; `cotasDelNodo`, generalizado a una línea |
| un tramo | su largo · ángulo, editable | la cota de tramo que ya tienen interna y trazo (`cotasDeLineaInterna`, `cotasDeTrazo`) |
| varios puntos | ninguna | como hoy en el contorno |

Mientras dura un arrastre, las vecinas se apagan (§ 5.1 del 08-09).

### 4.6 Supr

| Elegido | Supr hace |
|---|---|
| puntos de una interna o de un trazo | los quita; los tramos vecinos se unen |
| … y a la línea le queda un solo punto | **se borra entera**, con deshacer, como ya hacen los trazos (spec de trazos § 5.4) |
| un tramo de una interna de dibujo o de un trazo | **borra solo ese tramo**; si era del medio, la línea queda partida en dos (dos ids, una entrada de deshacer) |
| un tramo de hilo o de pinza | la entidad entera, como hoy: no se parten |
| una mezcla con puntos del contorno | todo o nada: si el contorno se quedara con menos de tres puntos, no se borra nada y sale el aviso de hoy |

El reparto por tramo vale también en **Z**: `resolverBorrado` pasa a recibir el `segmentIndex` de la interna, y Supr deja de llevarse la línea entera cuando en pantalla solo está resaltado un tramo. Es «lo que se ve es lo que se borra», la ley de su propia cabecera, y el § 5 del 08-09 (*"Supr borra solo BC"*). El reductor nuevo, `removeTramoDeInterna`, es el gemelo de `removeTramoDeTrazo` y parte la línea con la misma `quitarTramo`.

### 4.7 Deshacer

Un gesto, una entrada: la misma puerta de lotes que hoy (`beginUndoBatch`). Si la línea cambia desde fuera (deshacer, el copiloto, el menú), los puntos se vuelven a leer de la línea y la sub-selección se suelta, igual que hace hoy `resyncStateToPiece` con el contorno: un índice guardado podría estar señalando otra geometría.

---

## 5. Z: selecciona e inspecciona

### 5.1 Lo que se retira

| Hoy en Z | Pasa a |
|---|---|
| Clic sobre un punto visible de la pieza seleccionada: editor de curvas dentro de Z | un clic sobre la pieza: la elige y, si se arrastra, la mueve entera |
| Doble clic sobre una pieza: editor de curvas dentro de Z | abre Q (§ 5.3) |
| Arrastrar un extremo de la interna seleccionada | el press elige la interna, como cualquier clic sobre ella; arrastrar no deforma nada |
| Arrastrar una punta del trazo seleccionado | el press elige el tramo, como cualquier clic sobre el trazo; arrastrar no deforma nada |

Los extremos que `PieceRenderer` pinta a una interna elegida entera (`internal-line-endpoints`) se quedan como lectura, sin el cursor de mover. Los puntos del contorno se siguen viendo en Z (#1103, *"extremos siempre visibles"*), pero no se agarran.

### 5.2 Lo que Z conserva

- Mover la pieza entera.
- La caja de transformar: escala y giro del objeto entero.
- **Escribir en las cotas:** la de un tramo elegido (D5 del 08-09: *"la cota del sujeto es editable, incluidas las de una interna ya dibujada"*) y Tab para los largos de la pieza (#1167, la excepción que ella firmó).

La regla cabe en una línea: **en Z el ratón no deforma nada; lo que se escribe en una cota, sí.** Es la frase que la spec de #1167 ya daba por cierta.

### 5.3 Ida y vuelta

| Gesto | Resultado |
|---|---|
| Doble clic en Z sobre una pieza | Q, con esa pieza en edición |
| … sobre un tramo o un punto de interna | Q, con esa interna elegida (el primer clic ya la eligió en Z; § 3.5) |
| … sobre un trazo | Q, con el trazo en edición |
| … sobre una pieza bloqueada | el aviso de siempre (`enterEdit`); es lo que exige `maria-204-mover-bloqueada.spec.ts` |
| Esc en Q con algo elegido | suelta lo elegido, también la interna o el tramo de trazo elegidos (el peldaño de hoy) |
| Esc en Q sin nada elegido | **Z, con la pieza seleccionada** (tabla del § 2.1); con un trazo en edición, Z sin selección |

Es el recorrido que el 08-09 escribió en su tabla de contextos (*"`Q`, o doble clic desde `Z`"* · *"Esc vuelve a `Z` conservando la pieza"*) y que hoy no existe.

### 5.4 La pista del pie

Z dice hoy lo contrario del contrato. Pasa a:

> **«Seleccionar mueve la pieza entera · doble clic o Editar patrón para mover, añadir, borrar y curvar sus puntos»**

Tiene que caber a 1366×643 en Split, que es su laptop. La de la Pluma ya no cabe a ese tamaño (§ 3.4 del 08-09, enmienda del 23-09). Se mide con un e2e, no a ojo.

---

## 6. V: las asas de internas y trazos (fase 5)

El mismo modelo que Q: se entra en un objeto y se ven las asas de las curvas de todas sus líneas. En una curva por puntos, V esconde las asas que se calculan solas y enseña los puntos (#1159), también en internas y trazos. V sigue sin Shift, como anota la enmienda del § 3.4. Es la última fase y se puede quitar sin que cambie el resto.

---

## 7. Casos de datos

- **Pinzas.** `piece.darts` es una copia de dominio (`dartEntity.ts`, enmienda de D1-real por #1016). Si la pieza la tiene, la pinza editada en Q se vuelve a leer de su línea (`extractDartFromInternal`) conservando lo que no es dibujo: `foldDirection` y `capShape`. Sin esto, la siguiente operación sobre esa pinza (`adjustDartIntake`, transferir) leería la copia vieja y la escribiría de vuelta, y la edición de María desaparecería sin aviso.
- **Piezas vinculadas** (simetría o instancia): copian la edición igual que hoy copian la del contorno, porque las internas se escriben por el mismo camino (`updatePiece` → `linkedEditingMiddleware`).
- **Piezas giradas:** § 4.1. El defecto de #1068 en los extremos arrastrados desde Z desaparece con la mudanza.
- **Bloqueos:** una pieza o capa bloqueada no entra en Q, con el aviso de hoy (`enterEditActuando`). Lo que está en una capa oculta no se agarra.
- **Construcción apagada:** los trazos ni se pintan, ni se agarran, ni enganchan en Q (la misma lista `trazosVisibles`).
- **Una línea que desaparece mientras se edita** (deshacer, Supr por otra puerta): se cancela lo pendiente y sus mandos desaparecen (§ 2.3 del 08-09).
- **Caja negra.** Cada agarre en Q registra qué tomó —`edicion:agarre { objeto: 'pieza' | 'trazo', linea: 'contorno' | 'interna' | 'trazo', que: 'punto' | 'tramo', lineId? }`— y, al soltar, si movió (`edicion:suelta { movio }`). En la próxima grabación con ella se podrá leer qué cogió cada clic, que es lo primero que habrá que mirar si dice que agarró otra cosa.

---

## 8. Piezas de código

| Pieza | Qué |
|---|---|
| `lineaEditable.ts` (nuevo, puro) | `Linea = { kind: 'contorno', pieceId } \| { kind: 'interna', pieceId, lineId } \| { kind: 'trazo', trazoId }`: su clave; cómo se lee su `path`; cómo se escribe (la acción a despachar, con la compensación de pivote y el re-anclado de piquetes **solo** para el contorno, y la copia de la pinza para una pinza); su marco (pieza o patrón); su mínimo de puntos (3 el contorno, 2 una línea abierta) y su referencia de Shift |
| `nodeEditorUtils.ts` | `extractNodes` sobre un `path` y una línea, no sobre una pieza. El resto ya es puro sobre `PathCommand[]` |
| `anchorRoles.ts` | roles de una línea abierta (§ 3.3) |
| `types.ts` | `esInternaEditable(line)`, junto a `seSeleccionaPorTramo` |
| `useEditPattern.ts` | el objeto en edición (pieza o trazo), la sub-selección por línea, el hit-test con la precedencia de § 3.4, arrastre, Shift, enganche, Supr, doble clic y verbos por línea, y la escritura de `selectedInternalLine` / `selectedTrazo` de § 3.5 |
| `EditPatternOverlay.tsx` | glifos y resaltes de todas las líneas del objeto. Los colores escritos a mano que tiene hoy (`#4A9EFF`, `rgba(…)`) pasan a tokens: el trinquete de UI tiene que bajar, no subir |
| `cotas/nodo.ts`, `cotas/sujeto.ts` | cotas del punto de cualquier línea; `nodoSeleccionado` lleva su línea |
| `actionCuration.ts` y el menú contextual | el objetivo `point.segment` gana su línea |
| `borradoDeSeleccion.ts`, `projectSlice.ts` | `segmentIndex` en el sujeto de interna; `removeTramoDeInterna` |
| `useEditorInteractions.ts` (fase 4) | se retiran las tres vías de § 5.1; doble clic a Q; Esc de Q a Z |
| `HintText.tsx` (fase 4) | la pista de § 5.4 |
| `PieceRenderer.tsx` | los extremos de la interna elegida, sin cursor de mover; en Q no se duplican con los glifos del overlay |
| `useEditCurve.ts` (fase 5) | V sobre cualquier línea |

---

## 9. Fases

Una PR por fase, y cada una deja la aplicación usable. Por eso Z se retira **después** de que Q sepa editar todo lo que Z deja de editar.

| Fase | Qué | Sale cuando |
|---|---|---|
| 1 | Núcleo común (`lineaEditable`), **sin cambiar nada** | los tests del contorno en verde sin tocar sus expectativas |
| 2 | Q edita internas: §§ 3-4 y § 7, y Supr por tramo también en Z | e2e 1, 2 y 5 de § 10.3 |
| 3 | Q edita trazos | e2e 4 |
| 4 | Z deja de deformar: § 5 entera | e2e 3 y 6; el recorrido del 07-09 en 13 de 13 |
| 5 | V sobre internas y trazos (opcional) | e2e 7 |

---

## 10. Pruebas

jsdom no ve apilamiento ni layout: lo de gestos y lo de la pista va en navegador.

### 10.1 Unitarias (puras)

- `lineaEditable`: leer y escribir las tres clases de línea; el contorno conserva pivote y piquetes; la pinza refresca su copia sin perder `foldDirection` ni `capShape`; el doblez de pliegue y el piquete no son editables.
- Roles de una línea abierta, de una cerrada y de una con `authoredAnchor`.
- Supr: quitar puntos, la línea de un solo punto que se borra, el tramo del medio que parte la línea en dos, hilo y pinza enteros, la mezcla todo-o-nada.

### 10.2 De hooks

- `useEditPattern` sobre una interna: las seis filas de precedencia de § 3.4, Shift en su marco, enganche sin la propia línea, el marco que coge contorno e internas, un lote de deshacer por gesto, resync tras un deshacer externo y la pieza girada.
- `resolverBorrado` con un tramo de interna.

### 10.3 E2e

1. **Su secuencia del 10-09 [09:59]-[10:29].** Línea interna con un tramo Bézier (arrastrando) → Q → arrastrar un punto del medio → clic derecho en el tramo → Curva por puntos → arrastrar su punto. Cada gesto se deshace de una vez.
2. **Esquina a esquina.** Una interna de esquina a esquina: arrastrar la esquina mueve solo la esquina; elegir la interna y arrastrar su extremo mueve solo el extremo; acercarlo a la esquina engancha exacto.
3. **Z no deforma.** Arrastrar desde el extremo de una interna no la cambia; arrastrar desde un vértice de la pieza seleccionada mueve la pieza entera, y sus internas quedan igual respecto a ella. Doble clic → Q con la pieza en edición. Esc sin nada elegido → Z con la pieza seleccionada.
4. **Trazo.** Un trazo abierto de la Pluma, editado en Q: mover su punto del medio; Supr sobre un tramo lo parte en dos.
5. **Pieza girada.** El punto de una interna va hacia donde va el puntero.
6. **La pista de Z cabe** a 1366×643 en Split.
7. **V (fase 5).** En una interna con un tramo Bézier, arrastrar un asa cambia la curva; en una curva por puntos no hay asas a la vista y se ven los puntos.

### 10.4 Lo que cambia de los tests de hoy, con su razón

- `useEditorInteractions.botonDerechoNoArmaExtremos.test.tsx` prueba que el botón derecho no arma el arrastre de extremos en Z. Con la fase 4 no hay arrastre que armar con ningún botón: se reescribe para afirmar eso.
- `trazos.spec.ts`, «el vértice de una pieza gana a la punta de un trazo en el mismo sitio»: lo que afirma sigue valiendo (con la pieza seleccionada, el clic no coge el trazo), pero su comentario dice *"entra a editar su nodo"*. Pasa a decir que el clic es sobre la pieza.
- `maria-204-mover-bloqueada.spec.ts`: el doble clic en Z sobre una pieza bloqueada sigue sin abrir editor y sigue avisando. No cambia.

### 10.5 El gate

El de siempre: `npx tsc -b --noEmit && npm run test && npm run lint && npm run lint:ui`, más los e2e nuevos en la lista del gate de deploy (`scripts/deploy-prod.sh`).

---

## 11. Lo que NO se hace

- **Las internas no siguen al contorno** cuando se mueve una esquina. Anclar una interna a un punto o a un borde es su propia spec, con los problemas de índice que ya tuvo `notchAnchor`. Si María lo pide al verlo, se escribe entonces.
- **Enganche para los puntos del contorno:** no cambia (hoy no tiene).
- **Shift en V:** sigue anotado como pendiente.
- **Ctrl suspende el enganche:** sigue sin implementar (§ 3.4 del 08-09).
- **Punto** sigue trabajando sobre el contorno; en Q, el doble clic inserta en cualquier línea.
- **Marco entre objetos:** el marco coge las líneas del objeto en edición, no las de otras piezas ni las de trazos sueltos.
- Los piquetes y los dobleces de pliegue no se editan en Q (§ 3.2).

---

## 12. Enmiendas a lo escrito (al implementar)

| Documento | Qué cambia |
|---|---|
| `2026-09-08-contexto-y-control-numerico-design.md` | § 4 pasa a implementado; la fila «Edición de pieza» del § 2.1 deja de ser una promesa; la lista de «dónde no, todavía» de la enmienda del § 3.4 se queda en V |
| `2026-09-12-trazos-lineas-de-construccion-design.md` § 5.3 | las puntas ya no se arrastran desde Z; los vértices y las curvas se editan en Q y V, como anunciaba |
| `2026-09-18-editar-los-largos-de-una-pieza-design.md` § 3.1 | *"ningún arrastre desde Z deforma nada"* pasa a ser verdad; nota con la fecha |
| `docs/reports/2026-09-10-reunion-maria.md` | la causa E (queja 16), hecha |

No cierra un eje de auditoría: `CLAUDE.md` no cambia.

---

## 13. Riesgos

- **La fase 1 es la delicada.** `useEditPattern.ts` tiene 1249 líneas y cinco invariantes aprendidas a golpes: el lote de deshacer abierto durante el gesto, el resync por identidad del contorno, la compensación de pivote, el re-anclado de piquetes y la selección que sobrevive a un arrastre. Por eso la fase 1 no cambia comportamiento y sale solo con los tests de hoy en verde.
- **Dos fuentes de «elegida».** § 3.5 lo evita escribiendo en la global; el riesgo es un camino que se olvide de hacerlo. Lo fijan los tests de § 10.2.
- **Rendimiento.** El hit-test de hover recorre contorno e internas en cada `mousemove`. Con el patrón más denso del repo (`male_shirt.dxf`: hasta 12 internas por pieza y 11 nodos por línea) son decenas de puntos; se precalculan por identidad del `path`, no por evento.

---

## 14. Registro

- **2026-09-24.** Escrito tras la sesión con Samuel. Las ocho decisiones de § 2 se tomaron una a una con el código delante, y las tres partes del diseño (Q; Z y V; datos, fases y pruebas) se aprobaron antes de escribir. Sale del informe del 10-09 (queja 16, causa E) y del contrato del 08-09 § 4.
