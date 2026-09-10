# Un gesto, una acción — ningún clic existe solo para despertar la superficie

Continuación directa de `2026-09-10-gestos-sin-clic-design.md`, que cerró el
HOVER sin clic previo en Editar patrón. Samuel, probándolo en vivo el mismo
día, pidió ir más al fondo:

> "para mi es realmente necesario que mantengamos el foco en los canvas en
> ambos. que evitemos la mayor cantidad de clicks posibles, para que no entre
> como un parche me gustaria que evaluaramos la profundidad del fix feature"

Y al preguntarle qué significaba "en ambos":

> "en ambos canvases, tanto el canvas 2d como el 3d [...] el canvas 3d todavia
> le falta mucha construccion, la he detenido para dedicarme a perfeccionar 2d
> primero pero los conceptos son iguales en plan, las acciones que se puedan
> hacer en el canvas 3d quiero que tengan la misma filosofia que las del canvas
> 2d para que el programa sea coherente"

Tamaño medido antes de escribir esto (calibrador de tamaño, 2026-09-10): **L**,
modo brainstorming + spec. Lo que empuja el tamaño no es la línea de código
(~60-90 de producción) sino tres decisiones de bifurcación real. Las tres están
resueltas abajo, con su razón.

## § 0 — La doctrina (aplica a los dos canvases)

**Ningún gesto existe solo para despertar una superficie. Todo clic tiene que
avanzar la intención de la usuaria.**

Corolarios:

1. Una superficie del documento —el lienzo 2D, el visor 3D— nunca pide un clic
   de cortesía antes de responder. El hover habla desde el primer píxel
   (`2026-09-10-gestos-sin-clic-design.md` § 1).
2. Un gesto de dos pasos es legítimo solo cuando los dos pasos son parte de la
   intención: *clic en la pieza → clic en el punto de colocación*, *primer borde
   → segundo borde al coser*, *punto A → punto B de la cinta*. Ahí el segundo
   clic aporta información que el primero no podía. **Un clic que solo cambia
   un `isEditing` de `false` a `true` no aporta ninguna.**
3. El cursor anuncia lo que ESE clic va a hacer, no una categoría genérica.

### El 3D ya cumple — el que está fuera de línea es el 2D

Reconocimiento del 2026-09-10 sobre `src/components/Viewport3D/`: no existe
`enterEdit`, `isEditing` ni `editingPieceId` en el visor. Pin, vapor, agarrar
malla, clic en pieza, clic en anchor, caja de selección, gizmo de pose — todos
actúan en el primer `pointerdown`
(`GarmentSimulation.tsx:1196`, `:1280`, `AnchorPoints.tsx:139`,
`DraggablePiece.tsx:57`, `Viewport3D.tsx:489`, `usePoseDrag.ts:31`).
Los casos de dos pasos que hay ahí son todos del corolario 2 —semánticos, no de
despertar—: seleccionar→arrastrar (`DraggablePiece.tsx:102`), clic
pieza→clic anchor (`Viewport3D.tsx:1052`), coser borde A→borde B
(`Sew3DTool.tsx:203`), cinta A→B (`useAvatarTape.ts:84`).

**Consecuencia para esta tanda:** el 3D no se toca. La doctrina queda escrita
para que la construcción pendiente del visor nazca alineada, no para
refactorizar lo que ya está bien.

Los únicos infractores del corolario 2 en todo el programa son las dos
herramientas de nodos del 2D: `useEditPattern` (Editar patrón, `Q`) y
`useEditCurve` (Editar curva, `V`, donde caes al usar "Convertir en curva por
puntos"). Las dos entran en esta tanda.

## § 1 — Decisión: el gesto fusionado solo cuando hay sujeto bajo el cursor

Hoy, con `Q` activa y una pieza NUNCA entrada, el clic izquierdo va a
`useEditorInteractions.ts:763-782`, que llama `enterEdit(pieceId)` y **retorna
sin llamar `handleMouseDown`**. El clic no mira sobre qué cayó: nodo, tramo o
relleno vacío, todos entran igual. Hace falta un segundo clic para actuar.

**Decisión:** el primer clic actúa de inmediato **cuando hay un sujeto concreto
bajo el cursor** (un nodo, o un tramo) — entra Y arranca la acción en el mismo
gesto. Si no hay sujeto bajo el cursor (el clic cayó en el relleno de la pieza,
lejos de nodos y tramos), el clic solo entra, como hoy.

**Por qué no fusionar también el caso sin sujeto:** ahí la acción que tocaría
sería iniciar un marquee (es lo que hace `handleMouseDown` post-entrada al no
golpear nada, `useEditPattern.ts:494`). Un barrido de selección que arranca en
el mismo clic que entra es indistinguible de un clic perdido, y no es la
fricción que Samuel midió — su queja fue sobre la línea ("hover sobre la
línea"). Se queda fuera a propósito.

## § 2 — Decisión: el cambio de pieza en sesión NO cambia

Con una sesión viva sobre la pieza A, clicar la pieza B ejecuta `enterEdit(B)` y
retorna sin actuar (`useEditorInteractions.ts:754-759`).

**Decisión: eso se queda exactamente como está.**

Tres razones, en orden de peso:

1. **Es contrato ejecutable, y uno de sus tests existe por un bug real.** Tres
   pruebas lo fijan (`useEditorInteractions.grammar.test.tsx:247`, `:255`,
   `:266`): cambiar de sujeto entra, clicar el sujeto actual actúa, clicar fuera
   hace marquee. El guard que las sostiene lleva encima la `nota de María #170`
   y una corrección de la revisión adversarial del 2026-09-06 (el clic derecho
   sobre otra pieza dejaba el menú sin sujeto porque `enterEdit` borra la
   selección de puntos).
2. **Fusionar aquí es destructivo por accidente.** Estás a mitad de sesión sobre
   A con puntos seleccionados; un clic perdido sobre B **mutaría** B al instante
   (agregándole un punto). Entrar es la lectura segura de ese gesto.
3. **No es lo que se pidió.** La fricción medida fue el primer clic sobre una
   pieza nunca entrada. Este caso es otro.

## § 3 — Decisión: la entrada recibe la acción sembrada (precedente del repo)

`handleMouseDown` (`useEditPattern.ts:383`) lee del snapshot de render cinco
campos que `enterEdit` escribe vía `setState`: `isEditing`, `editingPieceId`,
`nodes`, `selectedNodes`, `selectedSegments` (`useEditPattern.ts:326-332`).
Llamar las dos funciones en el mismo evento **no funciona**: por el batching de
React, `handleMouseDown` seguiría viendo `isEditing === false` y abortaría en la
línea 385. No es un detalle de estilo, es una imposibilidad mecánica.

**Decisión: no se llaman dos funciones en un evento — se le pasa la acción a la
entrada.** Y no es un patrón nuevo: ya existe en este repo. En la herramienta
Seleccionar, clicar un ancla llama
`nodeEditor.enterEdit(pieceId, clickedNode)` y el nodo queda sembrado como
selección en ese mismo clic (`useEditorInteractions.ts:895`); `useEditCurve`
acepta ese segundo parámetro desde `useEditCurve.ts:106`. Copiamos lo probado.

El hit-test de la entrada fusionada corre contra `extractNodes(piece)` recién
calculado, **no** contra `state.nodes` (que está vacío antes de entrar).

## § 4 — Contrato técnico

### 4.1 `useEditPattern.ts`

Nueva función exportada por el hook, junto a `enterEdit`:

```
enterEditActuando(pieceId: string, e: React.MouseEvent<SVGSVGElement>): boolean
```

- Resuelve la pieza; respeta el candado igual que `enterEdit`
  (`useEditPattern.ts:300-305`: pieza bloqueada → toast y no entra).
- Calcula `nodes = extractNodes(piece)` y hace el hit-test con el MISMO radio y
  las MISMAS funciones que `handleMouseDown`: `hitTestNode` para nodos,
  `nearestSegment` para tramos, en coordenadas locales vía `toLocal(e, piece)`.
- **Con nodo golpeado:** un solo `setState` que escribe la sesión completa
  (`isEditing`, `editingPieceId`, `nodes`) **y** `selectedNodes` con ese nodo
  (más su grupo de anclas coincidentes, igual que hace hoy `handleMouseDown` con
  `anchorGroupOf`/`coincidentAnchorGroups`), y arma `dragRef.current` con el
  arranque del arrastre exactamente como la rama de nodo de `handleMouseDown`
  (`useEditPattern.ts:394-441`). Retorna `true`.
- **Con tramo golpeado (y ningún nodo):** mismo patrón contra la rama de
  segmento (`useEditPattern.ts:442-493`): sesión + `selectedSegments` + drag de
  segmento. Retorna `true`.
- **Sin nodo ni tramo:** NO actúa. Delega en el `enterEdit` de siempre y retorna
  `false` (§ 1).
- El lote de undo se abre igual que en el arrastre de hoy (`beginDragBatch`), no
  antes: un clic que no llega a mover no puede dejar una entrada de historial
  (es el contrato que fija `useEditPattern.undo.test.tsx`, "does not add history
  for mouse down/up without movement").

`enterEdit` y su contrato de "entrada pura" **no se tocan**: ~30 sitios de test
lo llaman esperando exactamente eso (`editPatternHarness.tsx:27` y los tests
directos del hook). Añadimos una puerta nueva, no reescribimos la vieja.

### 4.2 `useEditCurve.ts`

Dos cambios, porque esta herramienta está un paso más atrás que Editar patrón:

1. **Portar el hover previo al clic**, que hoy no tiene: `handleMouseMove`
   retorna de una si no hay sesión (`useEditCurve.ts:214`). Recibe el mismo
   tratamiento que ya tiene `useEditPattern` (campo `hoveredPieceId`, recorrido
   de piezas no bloqueadas y no ocultas, ordenadas por `zOrder` de arriba hacia
   abajo — ver `useEditPattern.ts:160-171`), pero su sujeto son **anclas y
   manejadores**, no tramos: el hover pre-entrada resalta el nodo bajo el cursor
   y pone el cursor en `move`, igual que post-entrada.
2. **El gesto fusionado**: la rama no-entrada del router
   (`useEditorInteractions.ts:784-797`) hace hit-test de ancla y, si golpea,
   llama `enterEdit(pieceId, nodoGolpeado)` — que ya soporta la semilla
   (`useEditCurve.ts:106`). Si no golpea ancla, entra pelado como hoy.

**No** se le agrega comparación de ids de pieza: hoy `editCurve` no compara y
resuelve el cambio de pieza probando primero el handler sobre la anterior
(`useEditorInteractions.ts:784-797`). Cambiar eso es el § 2 de la otra
herramienta, y aquí tampoco se toca.

### 4.3 `ToolOverlay.tsx` + `NodeEditorOverlay`

`NodeEditorOverlay` se monta hoy solo con sesión viva
(`ToolOverlay.tsx:342`: `nodeEditorIsEditing && nodeEditorEditingPieceId`).
Igual que se hizo con `EditPatternOverlay`, tiene que montarse también para una
pieza meramente sobrevolada, resolviendo la pieza por
`nodeEditorEditingPieceId ?? nodeEditorHoveredPieceId`.

**Tensión con una nota de María, dicha a propósito:** [11:38] "los de curva
igual no, porque son muchos puntos… solo deberían verse cuando uno clica como
el menú curva" (#1103). Enseñar las anclas de la pieza sobrevolada **no** viola
eso: está acotado a que la herramienta Editar curva esté activa —o sea, la
usuaria ya eligió el menú de curva— y a la única pieza bajo el cursor. No se
cambia nada del comportamiento con otras herramientas activas, ni de
`piezaConPuntosDeCurva` (`PatternEditor.tsx:1258`).

### 4.4 `useEditorInteractions.ts`

- Rama no-entrada de `editPattern` (líneas 763-782): antes de `enterEdit`,
  intentar `enterEditActuando(pieceId, e)`; si retorna `true`, listo. Si
  retorna `false`, `enterEdit(pieceId)` como hoy. El caso sin `pieceId`
  (`exitEdit()`) no cambia. El guard de `e.button !== 0` **se queda** — el clic
  derecho nunca entra por aquí, y hay un fix del 2026-09-06 que depende de eso.
- Rama no-entrada de `editCurve` (líneas 784-797): equivalente, con la semilla
  de ancla del § 4.2.
- El enrutado de `mousemove` para `editCurve` tiene que dejar de exigir sesión
  (hoy `nodeEditor.isEditing` gatea; comparar con la línea 978 de `editPattern`,
  que ya no exige nada más que la herramienta activa).
- `getCursor` para `editCurve` (línea 1278 y `:1285` del caso `editPattern`):
  el cursor pre-entrada sale del hover nuevo, sin exigir sesión.

## § 5 — Fuera de alcance (a propósito)

- **El visor 3D no se toca** (§ 0). La doctrina lo cubre para lo que venga.
- **El cambio de pieza en sesión no cambia** (§ 2), en ninguna de las dos
  herramientas.
- **El marquee no se fusiona** con el clic de entrada (§ 1).
- **Hallazgo suelto, no de esta tanda:** `Q` está declarada dos veces en
  `src/shortcuts/defaults.ts` — como `tool.editPattern` (línea 35) y como una
  acción de cámara 3D (línea 76). Gana el primer match
  (`ShortcutRegistry.ts:89`) y hay un test que fija que el contexto combinado
  resuelve `Q` a Editar patrón (`editPatternReachability.test.tsx:41`), así que
  el atajo 3D está muerto cuando los dos contextos están activos. Queda
  anotado; arreglarlo es su propia decisión de atajos.
