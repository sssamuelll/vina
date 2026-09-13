# Cotas vivas — las cotas son el formulario (diseño)

> **Enmienda 2026-09-13:** el [contrato integrado de las seis firmas](../../reports/2026-09-13-seis-firmas-maria.md) rige §5.4: pareja Largo–Ángulo agrupada; Tab/Shift+Tab/clic interno conservan borrador; Enter coloca una vez y no rearma (firmado por María el 13-09: Enter traza, Tab continúa; la pareja lo dice al lado). El ángulo declara su referencia y la conserva al escribir. Los largos de los lados son un interruptor apagado de fábrica, sin vínculo con crear ni seleccionar (firma de María del 13-09).

**Fecha:** 2026-08-30
**Tarjetas de María:** #223, #225 (la barra), #226 (línea interna: distancia a los puntos), y el rastro de #191, #193, #195, #205, #209
**Hereda y enmienda:** `docs/superpowers/specs/2026-08-16-barra-opciones-herramienta-design.md` (§ 3 canal permanente — **revertido**), `docs/superpowers/specs/2026-08-29-linea-interna-y-medidas-design.md` (§ 6 "sin panel para el rectángulo" y § 7.2 "Tab abre Siguiente punto" — **reemplazados**), `.claude/skills/contrato-de-interfaz/SKILL.md` (§ 2 materiales — **enmienda declarada**, ver § 10)
**Mockups aprobados por Samuel (2026-08-30):** `assets/2026-08-30-cotas-vivas/mockup-cotas-vivas-linea-interna.png` (el 5b, la dirección) y `mockup-rectangulo-2026.png`; el formulario descartado queda en `mockup-panel-formulario-descartado.png` para que se vea qué se rechazó y por qué. Prompts en la misma carpeta.
**Trazado técnico con file:line:** `_trazado-cotas-vivas.md` (temporal; se borra al mergear).

---

## 0. Qué pidió María, y qué medimos

Tres tarjetas del 30 de agosto, textuales:

- **#225:** *"El nuevo menú que aparece arriba de la parte 2D … se ve cortado por el menú de los comandos del 2D … este menú me gusta pero creo que no debería estar allí fijo, creo que debería aparecer cuando el usuario clica un comando como una barra flotante que el usuario puede utilizar o no pero que de verdad tenga la posibilidad de editar y manejar ese menú flotante … con el rectángulo no hay manera de utilizarlo, una vez que clicas en la pantalla si vas a editarlo el rectángulo ya se forma y luego no se puede editar."*
- **#223:** *"ese menú del tamaño de arriba solo aparece con el comando crear cuadrado pero con el comando editar no aparece nada. El objetivo es que ese menú de controlar las medidas de verdad sea funcional porque ahora se ve pero no sirve."*
- **#226:** *"Necesito más control cuando creo líneas internas para decidir desde dónde creo la línea interna respecto al punto del cuadrado, también es muy útil que diga el largo y ángulo, pero entonces que hubiera una manera en la que yo puedo editar eso y no solo ver el valor a la hora de crearlo … necesito gestionar la distancia respecto a los puntos de la línea externa y el ángulo, largo, etc."*

Samuel, sobre la barra: *"sacrificaba la belleza por la funcionalidad, pero ni una cosa ni otra"*; y sobre el primer panel propuesto: *"es un form. ¿podemos hacerlo más dinámico, más fácil, más visual, más intuitivo?"*. Y de María, por él: *"que la línea interna se pueda ver a cuánto de distancia está de cada punto, **en la misma línea**, o sea que el objeto venga más enriquecido de información"*.

**Medido en el navegador (Playwright contra Vite en 5177, 2026-08-30):**

| Qué | Resultado |
|---|---|
| Rectángulo: clic suelto | crea 100×100 y la deja **seleccionada** (`editor.selectedPieceIds = [id]`) |
| Escribir 300×150 en la barra después | `toolOptions.rectangle = {300,150}`; la pieza creada **sigue 100×100** |
| "Editar patrón" | la barra dice "Editar patrón · Q", 0 controles |
| Viewport 1366×643 (su laptop: 768 menos cromo de Chrome y barra de tareas) | el dock (596 px, `top:50%`) **tapa 35,5 px de los 41 px** de la barra; `elementFromPoint` sobre el nombre devuelve `dock dock--left`. A 620 px la tapa entera. En 1920×1080 no pasa — por eso nadie lo vio |
| Su foto (#225, Toshiba 13") | se lee "le costura O": "Margen de" quedó bajo el dock; la barra de IA pisa el final de la pista |

**El e2e `maria-191` pasaba en verde** porque medía que la barra alimenta el *siguiente* rectángulo — la promesa que escribimos nosotros. Ella esperaba editar *el que tiene delante*. Memoria: `test-mide-nuestra-promesa-no-la-de-maria`.

---

## 1. Diagnóstico: la barra no está mal puesta, está mal atada

`ToolOptionsBar2D.tsx:42` despacha `setToolOption` — el default del siguiente objeto. `useRectangleTool.ts:51-52` lo lee al crear. La pieza ya creada no tiene ancho ni alto en ninguna parte: es `outline: PathCommand[]`. Mover la misma barra a flotante y dejarla escribiendo en el mismo sitio reproduce #223 desde otra posición.

Y hay un patrón en el repo que ya hace lo que ella pide, para un solo caso: `NotchPrecisionModal` — *"el clic ya colocó el piquete; este panel ofrece colocación numérica exacta … deliberadamente no bloqueante"* (`useNotchTool.ts:325` lo abre al colocar; `confirmRefine` escribe en el objeto). Ese es el sujeto correcto: **el objeto que tiene delante.**

Dos superficies propuestas y descartadas antes de esta:

1. **La misma barra, flotante** — repite #223. Descartada.
2. **Un panel-formulario en la esquina** con filas etiqueta→valor ("Izq. arriba 120 mm…"). Correcto pero opaco: los números en la esquina y el objeto en el centro; María tiene que leer "Izq. abajo" y adivinar qué esquina es. Samuel lo vio y pidió otra cosa. Revisión adversarial de codex (Serrano/Halberg/Vex, 2026-08-30) sobre esa versión: 1 BLOCKER (la "creación caliente" no tiene identidad en el store) y 14 premisas falsas; casi todas siguen aplicando aquí y se recogen en § 12.

---

## 2. La decisión

> **Las cotas son el formulario.** El objeto seleccionado o en curso muestra sus medidas sobre el lienzo, y esas medidas se editan ahí mismo: clic para escribir, arrastrar para ajustar, Tab para recorrerlas. El panel de la esquina se queda con lo único que no tiene sitio en el lienzo — herramienta, sujeto y los defaults no numéricos — y se vuelve una tira.

Tres consecuencias que cierran las tres tarjetas:

- **#223/#225:** no hay canal fijo arriba (nada que el dock tape); lo que se edita es la pieza que acaba de crear, en sus propias cotas.
- **#226:** la línea interna enseña, en la misma línea, a cuánto está cada extremo de cada esquina del contorno, y ese número se escribe.
- **"Más 2026":** superficies por tono y sombra, un solo acento, riel de foco, números tabulares — la gramática que Atrium validó lado a lado (§ 9).

---

## 3. Las tres superficies y sus cotas

| Sujeto | Cuándo | Cotas (cada una es un chip editable) | Motor |
|---|---|---|---|
| **Línea interna seleccionada** (`editor.selectedInternalLine`) | herramienta `select` o `internalShape` con una interna seleccionada; también justo al terminar de trazarla (§ 3.3) | Por cada **tramo recto**: `largo · ángulo` en el punto medio, desplazado perpendicular. Por cada **extremo que está sobre el contorno**: dos cotas de **arco por el borde** hasta las dos esquinas adyacentes (`ccw` y `cw`), dibujadas paralelas al borde, por fuera de la pieza | `edgeDistances` + `segmentPolar` (§ 4) |
| **Pieza seleccionada única** o **recién creada por Rectángulo** | `select`/`transform`/`rectangle` con `selectedPieceIds.length === 1`; en `rectangle`, tras el clic que crea | `Ancho` sobre el lado superior del bbox y `Alto` sobre el lado derecho, en el marco de la caja (rota con la pieza) | `resizePieceTo` (§ 4) |
| **Tramo en curso** (pluma, línea interna) | trazo vivo con ≥ 1 nodo | `largo · ángulo` de la goma elástica; **Tab lo congela** y lo vuelve campo (reemplaza a "Siguiente punto") | `polarOf` / `placePolar`, ya existen |

Lo que NO muestra cotas en esta tanda: extremos interiores de una interna (no están sobre el contorno), tramos curvos (C/Q), piquetes (siguen con `NotchPrecisionModal`), multi-selección, costuras y márgenes. Todo en § 11.

### 3.1 Regla del sujeto

Un sujeto a la vez, y **gana el más reciente**: trazo vivo > pieza recién creada por esta herramienta > selección. No hay heurística de "acción ajena": `handlePieceComplete` devuelve el id y `useRectangleTool` lo guarda como `hotId`; la pieza está caliente mientras `hotId === selectedPieceIds[0]` y la herramienta siga siendo `rectangle`. **El enfriamiento es irreversible**: `hotId` se borra (a `null`) en cuanto la selección deja de ser esa pieza, cambia la herramienta, o la pieza desaparece del proyecto (undo). Volver a seleccionarla, volver a Rectángulo o rehacerla la encuentra **fría** — nunca vuelve a escribir el default por su cuenta (revisión § 13.2, #1). Solo en ese estado, confirmar una cota **también escribe el default** del próximo rectángulo (`setToolOption`), como Blender *Adjust Last Operation*. Con una pieza simplemente seleccionada, no: seleccionar un DXF de 892 mm no puede volver 892 el ancho del próximo rectángulo.

### 3.2 Piezas bloqueadas

Una pieza `locked` muestra sus cotas **apagadas** (sin hover, sin edición, `aria-disabled`), la misma regla que el transform box (`useEditorInteractions.ts:263`). El panel no es un bypass del candado.

### 3.3 Al terminar de trazar una interna

Hoy `handleInternalShapeComplete` añade la línea y **no la selecciona** (`PatternEditor.tsx:206`). Pasa a despachar `selectInternalLine({pieceId, lineId})` al terminar, para que las cotas aparezcan sin un clic extra: es la "creación caliente" de la línea interna, y es lo que #226 describe ("a la hora de crearlo").

### 3.4 Jerarquía y densidad (lo que el panel de jueces marcó primero)

Seis chips con el mismo peso sobre una pieza chica a 1366 px es "seis primarios simultáneos" (Iris Tane) y las condiciones del trabajo real de una patronista — pinzas de 12 mm, piquetes a 10 mm — no las de la demo (jueza-María, Halberg). Reglas:

- **Dos pesos.** Las cotas **primarias** (largo · ángulo del tramo; Ancho/Alto de la pieza) van en chip relleno (`--cota-bg-2d` + tinta blanca). Las cotas de **borde** (extremo → esquina) van en chip **hueco** (fondo `--cota-edit-bg-2d`, tinta `--accent-2d`, borde de 1 px del mismo acento): se leen como verificación, no como el mando principal. Mismo acento, dos pesos.
- **Las cotas de borde aparecen por extremo, bajo demanda:** al **pasar el ratón** sobre un extremo o sobre su chip de tramo, o al **enfocar** por Tab. En reposo, una interna seleccionada muestra **solo** su largo · ángulo (una cota por tramo). Así el reposo es sobrio y el detalle llega cuando se mira ahí.
- **Colapso medido, no adivinado:** una cota de borde cuyo hilo mide menos de 56 px en pantalla no se pinta. El e2e 8.3.5 lo mide en una pieza real (pinza de 12 mm a zoom 1 y a zoom 4).
- **`Largos de línea` (menú Vina → `showLineLengths`, `LineLengthLabels.tsx`) sigue igual:** pinta el largo de cada lado del contorno en `--ink-on-light` / `--font-mono-2d`, sin interacción. Las cotas vivas usan la misma familia mono y **no** repiten el largo de un lado del contorno; si María tiene los dos encendidos, un lado con extremo enganchado muestra su largo (gris, de `LineLengthLabels`) y las dos distancias parciales (huecas, de las cotas) — información distinta, no duplicada.
- **Qué extremo se mueve, dicho con un píxel** (idea que los tres jueces robarían): al pasar el ratón por un chip, el extremo **que se va a mover se rellena** (punto de 8 px) y el **ancla se vacía** (anillo de 6 px). Largo/ángulo mueven el nodo final; una distancia de borde mueve *ese* extremo por el contorno; Ancho/Alto mueven el lado derecho/inferior con la esquina superior izquierda plantada.

### 3.5 Con una interna seleccionada, la pieza no compite

`selectInternalLine` deja `selectedPieceIds = [pieceId]` (`editorSlice.ts:117-123`), así que hoy con `select` aparecen **también** el transform box y la `FloatingActionBar` de la pieza (`shouldShowTransformBox`, `useEditorInteractions.ts:281`). Con `selectedInternalLine !== null` se **suprimen los dos**: el sujeto es la línea, y sus cotas son la única superficie viva. Un clic en el cuerpo de la pieza (fuera de la línea) vuelve a la selección de pieza de siempre. Es una línea en `shouldShowTransformBox` y en la compuerta de la barra; se fija en el e2e 8.3.1.

---

## 4. Los motores (funciones puras, con tests)

### 4.1 `edgeDistances(outlineLocal, endpointLocal, metric = 2)`

Para un extremo de interna en coordenadas locales de pieza:

1. `buildRing(outline, 2)` (`src/utils/geometry/outlineRing.ts:370`); si falla (`arc-unsupported` / `degenerate`), la interna no tiene cotas de borde — solo de tramo.
2. `projectToRing(ring, endpoint)` → `{ distanceMm: s, point }`. Si `|point − endpoint| > 0,5 mm` el extremo **no está sobre el contorno**: sin cotas de borde. (El enganche del trazo escribe el punto exacto del contorno, así que un extremo enganchado pasa siempre.)
3. Esquinas: `detectCorners(outline)` (`src/utils/notchAnchor.ts:68`) proyectadas al anillo → arcos ordenados `s_i`. Adyacentes: la última `s_i ≤ s` (`ccw`) y la primera `s_i ≥ s` (`cw`), cerrando el anillo.
4. Devuelve `{ ccw: { cornerIndex, corner: Point2D, mm }, cw: {...} }` con `mm = advance(ring, s_corner, s, dir)`.

**Escribir** una cota `mm'` desde la esquina `c` en dirección `dir`: `pointAt(ring, s_c ± mm')` → nuevo extremo → nuevo `path` (se reescribe el primer o el último comando, igual que hace hoy el arrastre de extremo en `useEditorInteractions.ts:846-861`). Rango válido: `0 < mm' < arco hasta la esquina siguiente` (el extremo no salta de borde). Es la misma familia de `NotchAnchor` (`distanceMm` desde `refPoint` en `direction`), sin persistir el ancla — ver § 11.

### 4.2 `segmentPolar(path)` → `{ from, to, lengthMm, angleDeg }[]` por tramo recto

Usa `polarOf` (`polyPenGeometry.ts:117`, 0° a la derecha, 90° arriba en pantalla — la convención ratificada en el spec 29-ago § 7.2). **Escribir** largo o ángulo de un tramo mueve su nodo **final** con `polarPoint(from, L, θ)`; el inicial queda plantado. En un tramo intermedio eso también cambia el tramo siguiente — es lo que hace CLO *Change Length*, y es lo esperable. Si el nodo final es un extremo sobre el contorno, moverlo lo **despega** del borde: las cotas de borde de ese extremo desaparecen hasta que vuelva a engancharse. Se dice en la pista.

### 4.3 `resizePieceTo(piece, bbox, wMm, hMm)`

No es `scaleOutline` a secas. El flujo real del arrastre (`useTransformTool.ts:207-269`) des-gira el ancla, la baja al local de la pieza, escala el contorno alrededor, **compensa la posición** por el cambio de pivote y **transforma internas y re-ancla piquetes** (`transformInternals`). Ese bloque se **extrae** a una función pura `scalePiecesAroundAnchor(snapshot, bbox, scaleX, scaleY, anchorUnrotated)` que usan los dos caminos — el handle y la cota — y `resizePieceTo` es `scaleX = w/bbox.width`, `scaleY = h/bbox.height`, ancla = `scaleAnchorForHandle('se', bbox)` (la esquina superior izquierda queda plantada: "como si arrastraras el manejador inferior derecho", que es la definición que María ya conoce por maria-198). Test de igualdad: el resultado coincide con el de `scalePiecesAroundAnchor` para el mismo `scaleX/scaleY` y ancla — **mismo motor**, no mismo gesto: el arrastre de una esquina sin Shift fuerza escala uniforme y clampa a 0,01; la cota escrita es no uniforme por definición.

### 4.4 `parseMedida(texto)`

`"300"`, `"300,5"`, `"300.5"`, `" 12 "` → número; `""`, `"abc"`, `"1e3"` → `null`. Sin unidades en esta tanda: **los chips leen y escriben en mm** aunque `editor.units` sea cm o pulgadas (el resto de etiquetas sigue con `formatDimension`). Convertir el chip a la unidad de la usuaria es una decisión aparte (§ 11): no se mezcla "30,0 cm" en el botón con "300" en el campo.

---

## 5. Los chips: anatomía y gramática

### 5.1 Dos capas, un solo origen

- **Las líneas de cota** (1 px con ticks) son SVG dentro de `<g data-pan-zoom-group>`, con grosor `1/z` como el readout actual (`PolyPenToolOverlay.tsx:141-148`).
- **Los chips** son HTML: un `<div class="cotas">` hermano del `<svg>` dentro de `.pattern-editor` (`position: relative`, `PatternEditor.tsx:860`), posicionado con la fórmula pan + patrón × zoom de `FloatingActionBar.tsx:54-61` **aplicada a los extremos ya girados de la cota** (`cotasDePieza` rota `a`, `b` y `outward` con el pivote de la caja, como `computeHandlePositions`; la barra, que no gira, no sirve de molde para eso). Cada chip es un `<button>` en reposo y un `<input>` en edición. Razones: son inputs nativos (el guard de CF-1 `isEditableTarget` los respeta sin tocar nada), Tab entre chips es el orden nativo del DOM, y el foco se maneja con `.focus()` de verdad — lo que un `<foreignObject>` bajo `scale(1/z)` no da limpio.
- Las dos capas leen `pan2D`/`zoom2D` de Redux en el mismo render: no hay "sincronizar".
- **La capa HTML no tapa el lienzo:** el `<div class="cotas">` lleva `pointer-events: none` y solo los chips `pointer-events: auto`. El `wheel` del pan/zoom está atado **al nodo `<svg>`** (`useEditorInteractions.ts:575`), así que sobre un chip la rueda no hace zoom — son 56×22 px por chip; se acepta y se dice. Un chip **no** consume el clic derecho (menú contextual de siempre) ni el botón medio.

### 5.2 Emplazamiento

| Cota | Línea | Chip |
|---|---|---|
| Borde (extremo→esquina) | paralela al borde, **por fuera** de la pieza, a 18 px de pantalla; ticks en la esquina y en el extremo | en el punto medio de su línea, centrado |
| Tramo | ninguna (la línea es el propio tramo) | en el punto medio del tramo, desplazado 14 px perpendicular hacia el lado exterior de la pieza (o arriba si no se sabe) |
| Ancho / Alto de pieza | paralela al lado superior / derecho de la caja, a 18 px, en el marco girado de la caja | en el punto medio |
| Tramo en curso | ninguna | junto al cursor (`+22, −18` px como el readout de hoy); **congelado** al pulsar Tab: se queda donde estaba |

**Colapso por densidad:** si la línea de una cota de borde mide menos de **56 px** en pantalla (el ancho de un chip), esa cota **no se pinta**. La cota de tramo se pinta siempre. Cap: si una interna tiene más de 8 cotas visibles, se pintan solo los dos extremos y el largo total.

**Se ocultan** mientras: se arrastra el objeto o un extremo (`internalLineDragRef` / `transformTool.isDragging`), el menú contextual está abierto, o hay calibración — la misma compuerta de `FloatingActionBar.tsx:51`. Vuelven al soltar. Sin volteo, sin temporizadores.

**Capa:** el `<div class="cotas">` va después del `<svg>` en el DOM y sin `z-index` (orden de pintado); `FloatingActionBar` (verbos sobre el bbox) y las cotas (números) tienen anclas distintas y no compiten. Nada de `zIndex: 90` literal — ese literal de `FloatingActionBar.tsx:71` es deuda aparte.

### 5.3 Gramática

**Chip en reposo (`<button>`)**

| Gesto | Qué pasa |
|---|---|
| hover | se levanta 1 px, cursor `ew-resize`: "esto se arrastra" |
| **clic** (< 4 px, `DRAG_THRESHOLD_PX`) | entra en **edición**: el chip se vuelve `<input>` con el valor en texto, seleccionado |
| **arrastre** (≥ 4 px) | **scrub**: `setPointerCapture`; `Δvalor = Δx_pantalla / zoom2D` mm (o grados para ángulo) — el número sigue al cursor 1:1 con la geometría; **`Shift` ×10 (grueso), `Alt` ×0,1 (fino)**, una sola escala para scrub y flechas (Figma). Cada movimiento se deriva del **snapshot** de la cota al empezar (valor absoluto sobre la pieza de partida: sin deriva), y se despacha **como máximo una vez por frame** (`requestAnimationFrame`). Cada frame despacha la mutación real **dentro de un batch de deshacer** (`beginUndoBatch` al empezar, `withUndoBatchToken` en cada acción, `endUndoBatch` al terminar — el patrón de `useEditCurve.ts:78`): **una entrada** por scrub, independiente de los 500 ms. **Terminales del scrub, todos:** `pointerup`, `pointercancel`, `lostpointercapture`, desmontaje del chip o de la capa, cambio de sujeto o de herramienta, y token invalidado por un undo ajeno (`isUndoBatchTokenActive`) — en cualquiera de ellos se cierra el batch y no se despacha más |
| `Enter` / `Espacio` con el foco en el botón | entra en edición (a11y nativa del botón); el chip **detiene la propagación** de esas dos teclas para que `Espacio` no llegue al atajo global de simular (`ShortcutProvider` escucha en `document`) |
| `Tab` / `⇧Tab` | siguiente / anterior chip — orden **fijo** del DOM: largo → ángulo (por tramo, en orden del trazo) → extremo A hacia atrás → A hacia adelante → B atrás → B adelante → el select "Tipo de línea" de la tira → sale. Tab desde un extremo hace aparecer sus cotas de borde (§ 3.4) |
| clic derecho / botón medio | **nada**: un evento sobre el chip HTML no llega al `<svg>` hermano (burbujea por `.cotas` y `.pattern-editor`, no lateralmente). Se evita el menú nativo del navegador con `preventDefault`; son 56×22 px por chip y se acepta |

**Chip en edición (`<input type="text" inputMode="decimal">`)**

| Tecla | Qué pasa |
|---|---|
| dígitos, `,` `.` `-`, Retroceso, Supr, flechas ←→ | edición nativa del campo. Ninguna llega al lienzo (`isEditableTarget`, `useEditorInteractions.ts:496`) — Retroceso **no** borra la pieza, `S` **no** cambia de herramienta |
| `↑` / `↓` | ±1; con `Shift` ±10; con `Alt` ±0,1 — la misma escala que el scrub |
| **`Enter`** | **confirma**: **una acción `project/*`** (= una entrada de deshacer) y, solo en caliente, además un `tools/setToolOption` (fuera del historial, como Blender); el chip vuelve a reposo **con el foco en el botón** (Tab sigue al siguiente) |
| **`Tab`** / `⇧Tab` | confirma y **mueve el foco al chip siguiente/anterior por su cuenta** (`preventDefault`): el input se desmonta en el mismo tick y la navegación nativa perdería el punto de partida (revisión § 13.2, #4). El "300 Tab 150 Enter" de María |
| **`Escape`** | descarta el borrador, vuelve a reposo con el foco en el botón. Un segundo `Escape` es el de siempre (deselecciona) |
| blur (clic fuera) | **descarta**, siempre. La selección cambia en `mousedown`, antes del blur, y a veces el input se desmonta sin blur: confirmar ahí sería una carrera con dos resultados (revisión § 13.2, #10). Solo Enter y Tab confirman — lo que ya hace "Siguiente punto"; la pista lo dice |
| rueda | nada (no es `type="number"`) |

**Desde el lienzo (foco en `svg`/`body`, sin campo editable):**

| Tecla | Qué pasa |
|---|---|
| `Tab` | **solo si `e.target` es el `<svg>` o `document.body`** (desde el dock o desde un chip en reposo, Tab es el nativo — si no, un Tab desde un chip volvería al primero en bucle): con cotas visibles, **enfoca el primer chip** (`preventDefault`); en trazo vivo, **congela el chip del tramo en curso** y lo abre en edición (Largo). Va en CF-1 (`routeKey`), donde hoy `Tab` abre "Siguiente punto" (`usePolyPenTool.ts:380`, `usePenTool.ts:263`): una tecla, un significado, más alcance |
| dígitos | **no se capturan** (el visor 3D escucha `0-9` desde `body`, `inputBindings.ts:44`; y hay overrides de la usuaria). Se descarta el "teclear sin clicar" |
| resto | lo de siempre |

**Validación:** valor inválido → el campo lee inválido (borde `--destructive`) y no se confirma; largo ≤ 0 inválido; cota de borde fuera de `(0, arco a la siguiente esquina)` inválida; ancho/alto en `[1, 3000]`.

**Previsualización:** en edición por teclado **no hay** previsualización por tecla (sale de la tanda: no existe canal de render sombra; § 11). El scrub sí es en vivo porque escribe la geometría real dentro del batch.

### 5.4 Tramo en curso (lo que era "Siguiente punto")

- La goma elástica sigue pintando `largo · ángulo` junto al cursor (hoy SVG, `PolyPenToolOverlay.tsx:56-66`; la pluma solo largo, `PenToolOverlay.tsx:116` — pasa a `largo · ángulo` también).
- `Tab` congela: el hook devuelve `nextPoint` como hoy; en vez de `NextPointPanel` se montan **dos chips en edición** (Largo enfocado, Ángulo al lado) en la posición donde estaba el readout. `Enter` = `placePolar` (coloca y **se queda** en edición con el foco en Largo, re-anclado al nuevo nodo — el encadenado 80/−90, Enter, 50/0, Enter del spec 29-ago). `Escape` = `closeNextPoint` (vuelve a seguir al cursor). `Tab` dentro = Largo ↔ Ángulo (nativo).
- `NextPointPanel.tsx` y su CSS **mueren**; sus tests se reescriben contra los chips (§ 8).

---

## 6. La tira (lo que queda del panel)

`ToolStrip2D` monta **dentro de `.pattern-editor`** (no `fixed`: el "Siguiente punto" de hoy flota a 24 px del borde de la **ventana**, o sea sobre el visor 3D o el panel derecho — `NextPointPanel.css:5-8`), `position: absolute; top: 28px; right: 12px` (20 px de regla + 8), `width: min(300px, calc(100% − 24px))`, `z-index: var(--z-menu)` solo por si un tooltip la pisa; material `overlay` en su variante sin borde (§ 10).

Contenido, siempre presente mientras haya herramienta 2D activa (ley de puertas: la puerta que hoy da `ToolOptionsBar2D.tsx:53-56` no se pierde):

1. **Nombre de la herramienta** (`ToolDefinition.name`) + **atajo efectivo** (`useShortcutRegistry().getBinding`, `displayShortcutBinding`) — lo mismo que ya resuelve `ToolOptionsBar2D.tsx:32-38`.
2. **Línea de sujeto:** "Editando: la línea seleccionada · 5 cotas" / "Editando: la pieza nueva" / "Editando: la pieza seleccionada" / y sin sujeto, para rectángulo: "Un clic crea 300 × 150 mm · arrastra para dibujar" (lee el default vigente). Letra final por `solace-wren`.
3. **Los `ToolOption` de la herramienta**, con los cuatro controles de `ToolOptionsBar2D` **movidos** a `ToolOptionControls.tsx` (no reescritos): select, toggle, color, y `number` (deslizador o `control: 'input'`) para las 17 herramientas que siguen editando defaults (piquete, tijeras, costura…). **Excepción:** `rectangle.width/height` siguen existiendo en `toolSlice` como default del próximo clic, pero **no se pintan** en la tira — su puerta son las cotas de la pieza; la línea de sujeto los enseña.

Sin botón "Aplicar" (el mockup lo dibuja; Enter confirma en el chip y la tira no tiene números). Sin plegado, sin arrastre de la tira, sin volteo. Si María pide quitarla, es un chip de una línea y se añade entonces.

---

## 7. Lo que se desmonta

| Qué | Cómo |
|---|---|
| `ToolOptionsBar2D` en `AppShell.tsx:293` | se quita; `.canvas-area__2d` deja de ser columna flex (`layout.css:36-54` vuelve a `position: relative; overflow: hidden`) — **el dock ya no tiene qué tapar** |
| `ToolOptionsBar2D.tsx` | sus `NumberInput`/`Control` se mudan a `ToolOptionControls.tsx`; el archivo muere |
| `NextPointPanel.tsx` + `.css` | mueren; su gramática vive en los chips del tramo en curso |
| `HintText.tsx` | `rectangle`: "Arrastra para dibujar · un clic crea con el último tamaño · escribe en sus cotas para cambiarlo · Esc cancela"; `internalShape`/`pen` trazando: "… Tab escribe largo y ángulo …" se queda (sigue siendo verdad); nueva pista con interna seleccionada: "Clic en una cota para escribirla · arrástrala para ajustar · Tab pasa a la siguiente · Esc suelta" |

---

## 8. La red

TDD estricto: test primero, verlo fallar por la razón correcta, mínimo, verde. Los tests los escribe Claude; la implementación puede ir por codex en sandbox con el hash de los tests verificado antes y después.

### 8.1 Unitarios (motores)

- `edgeDistances`: pieza rectangular (4 esquinas) con extremo enganchado en el lado izquierdo → `ccw`/`cw` correctos y suman el largo del lado; pieza **girada** (la función trabaja en local: la rotación no la toca); contorno con curvas (`metric 2`, arco ≠ cuerda: el caso del DXF de María, 215,75 vs 194,94); extremo interior → sin cotas de borde; escribir `mm'` → `pointAt` cae sobre el borde y `projectToRing` lo confirma.
- `segmentPolar`: tramos rectos de una interna de 3 nodos; escribir largo mueve el nodo final y conserva el ángulo; escribir ángulo conserva el largo; tramo C/Q → no produce cota.
- `resizePieceTo` = arrastre: para una pieza girada 30° con dos internas y un piquete, `resizePieceTo(w', h')` y el bloque del handle `se` con el `scaleX/scaleY` equivalente dan **el mismo** `outline/position/internals` (con `toBeCloseTo` a 1e-9). Es la prueba de que se extrajo sin cambiar nada.
- `parseMedida`: los ocho casos de § 4.4.
- Guardia de idioma existente (`idiomaDeOpciones.test.ts`) se ajusta: `rectangle.width/height` siguen declarados.

### 8.2 Componente (RTL, jsdom)

- Chip: reposo → clic → input con el texto seleccionado; `Enter` → **exactamente un** dispatch y vuelve a reposo con el foco en el botón; `Escape` → cero dispatch; `Tab` → un dispatch y el foco pasa al siguiente chip; blur con texto igual → cero dispatch; blur con inválido → cero dispatch y valor restaurado; `↑` → +1; `Shift+↑` → +10; Retroceso dentro del input **no** llega a `window` (el guard).
- Scrub: `pointerdown` + 3 px → nada; + 10 px → dispatches dentro de un batch (se ve `undo/startBatch` … `undo/endBatch` en el store de prueba y **una** entrada en el historial).
- Tira: pinta nombre + atajo efectivo; línea de sujeto según el estado; los `ToolOption` de `notch` se pintan y despachan `setToolOption`; para `rectangle` no pinta `width/height`.
- Pieza bloqueada: chips `aria-disabled`, sin edición.

### 8.3 E2E (Playwright, navegador de verdad — jsdom no ve layout ni foco)

1. **La promesa de María, línea interna (#226):** activar `G`, dibujar una interna enganchada del lado izquierdo al inferior de una pieza; terminar → queda seleccionada y se ven cotas; clic en la cota `ccw` del extremo izquierdo → escribir `100` → `Enter` → en el store el extremo está a **100 mm** de esa esquina por el arco (medido con `buildRing` en el test) y sigue sobre el contorno; **una** entrada de deshacer; `Ctrl+Z` lo devuelve.
2. **La promesa de María, rectángulo (#223):** `S`, clic → pieza 100×100 seleccionada con cotas; clic en `Ancho` → `300` → `Tab` → `150` → `Enter` → **la misma pieza** mide 300×150 (una pieza en total); segundo clic → otra de **100×100** (el default de fábrica: la creación caliente se retiró, ver § 15); seleccionar la primera con `Z` y escribir `200` en Ancho → cambia esa pieza y el default **sigue** en 100.
3. **Scrub:** arrastrar el chip de Ancho 50 px a zoom 1 → la pieza mide 150 → **una** entrada de deshacer.
4. **Teclas reales** (memoria: `listener-re-registrado-en-medio-del-dispatch`): con el foco en un chip en edición, `Backspace` no borra la pieza y `s` no cambia de herramienta; `Tab` desde el lienzo enfoca el primer chip; en trazo vivo `Tab` congela el chip y `Enter` coloca a `80 / 90`.
5. **Emplazamiento a 1366×643:** `elementFromPoint` sobre la tira nunca devuelve el dock; el `<svg>` ocupa toda `.canvas-area__2d` (sin canal arriba); las cotas se ocultan mientras se arrastra la interna y vuelven al soltar.
6. **Pieza girada:** las cotas de Ancho/Alto siguen los lados de la caja girada (la línea de cota no es horizontal) y escribir `Ancho` conserva la esquina superior izquierda plantada.
7. Los e2e de la barra (`barra-opciones-herramienta.spec.ts`), de "Siguiente punto" (`maria-195`, `medidas-escritas-gramatica.spec.ts:68-75`) y `maria-191` se **reescriben** contra esta gramática — no se borran: sus casos de la gramática de teclado (§ 8 del spec 29-ago) siguen vigentes.

### 8.4 Gates

`npx tsc -b --noEmit && npm run test && npm run lint && npm run lint:ui`. R3 (color literal) y R5 (`:hover` sin `:focus-visible`) no pueden subir; los tokens nuevos van en `tokens.css` (§ 9). Y la caja negra (memoria `caja-negra-debe-verlo-todo`): cada commit de cota entra a la bitácora como acción; el scrub, como un gesto `cota:scrub` con `n` y valor final.

---

## 9. Acabado 2026 (lo visual, con tokens)

La gramática que Atrium validó lado a lado (`Atrium/docs/superpowers/specs/2026-08-29-inicio-personalizable-design.md § 9`) y que el mockup 5b dibuja:

1. **Bordes → tono.** La tira y los chips se separan por color de fondo y sombra en capas; el borde de 1 px queda para los inputs.
2. **Un acento.** Indigo, el `--accent` existente para el cromo y `--accent-2d` para la tinta sobre el papel. Nada de un tercer color.
3. **Foco = riel** de 3 px a la izquierda del campo, no anillo; en los chips, `:focus-visible` conserva un anillo de 2 px porque flotan sobre el papel (contraste).
4. **Mono solo en números**, tabulares (`font-variant-numeric: tabular-nums`), unidad en gris dentro del campo.
5. **Sin pastillas ni mayúsculas con tracking.** El atajo es texto mono apagado, no un keycap.
6. **Movimiento con significado, mínimo:** el chip entra con 120 ms de `opacity`+`translateY(2px)`; el scrub no anima (sigue al cursor). Nada de resortes ni NumberFlow en esta tanda.
7. **El papel no cambia.** María trabaja horas mirando el patrón; lo que se moderniza es el cromo.

**Tokens nuevos en `src/styles/tokens.css`** (un solo archivo de definición, ley de tokens):

| Token | Valor | Para |
|---|---|---|
| `--surface-overlay-border-flush` | `1px solid transparent` | la variante sin borde del material overlay (tira y chips); la sombra separa |
| `--surface-overlay-shadow-sheet` | `0 1px 2px rgba(0,0,0,.3), 0 12px 32px rgba(0,0,0,.35)` | sombra en capas de la tira |
| `--cota-bg-2d` / `--cota-ink-2d` | `var(--accent-2d)` / `#ffffff` | chip en reposo |
| `--cota-line-2d` | `var(--accent-2d)` | líneas de cota y ticks |
| `--cota-edit-bg-2d` / `--cota-edit-ink-2d` | `#ffffff` / `var(--ink-on-light)` | chip en edición (campo blanco sobre el papel) |
| `--focus-rail` | `3px solid var(--accent)` | riel de foco en la tira |

`--readout-bg-2d`/`--readout-ink-2d` (el readout gris de hoy) se **reemplazan** por `--cota-*` en `PolyPenToolOverlay`/`PenToolOverlay`: un solo lenguaje para "número sobre el papel".

---

## 10. Enmiendas escritas (no tácitas)

1. **Spec 16-ago § 3** ("canal permanente acoplado; flotar haría saltar el patrón"): **revertido**. El propio párrafo decía que el componente original flotaba y no saltaba nada; y acoplado es lo que el dock tapa.
2. **Spec 29-ago § 6** ("sin panel ni fila de menú para el rectángulo; Ancho/Alto en la barra"): **reemplazado** por las cotas de la pieza. La razón de aquella decisión era evitar duplicidad; ahora no hay barra que duplicar.
3. **Spec 29-ago § 7.2** ("Tab abre Siguiente punto"): **reemplazado** por "Tab congela el chip del tramo y lo abre en edición". El gesto sobrevive; el panel fijo no.
4. **Contrato de interfaz § 2**: el material `overlay` gana la variante declarada `--surface-overlay-border-flush` (bordes → tono), y **una excepción dicha**: la tira es un `overlay` **persistente** mientras hay herramienta 2D activa (el contrato define overlay como lo que "flota y se va"). Se escribe en el SKILL.md junto a las variantes existentes (`-pill`, `-recessed`). Manda el usuario; queda dicho.
5. **Contrato § 3** ("un panel nuevo no se abre encima de la regla ni del patrón"): la tira va **bajo** la regla (28 px) y las cotas van **sobre** el patrón por definición — son parte del objeto, como los handles del transform box, no un panel. Se anota como precisión, no como excepción.
7. **§ 3.1 y § 8.3 caso 2 de esta misma spec** (la «creación caliente» escribe el default del próximo rectángulo): **retirada** por la reunión del 07-09. Ver § 15.
6. **§ 9 de esta misma spec** ("`--readout-*` se reemplazan por `--cota-*`"): **invertido en su dirección, conservado en su intención** por la reunión del 07-09. Sigue habiendo *un solo lenguaje*, pero lo toma del readout, no de la píldora. Ver § 14.

---

## 11. Lo que no entra (dicho, con su tanda)

| Fuera | Por qué | Cuándo |
|---|---|---|
| Distancia **perpendicular** al borde para extremos interiores ("a 30 mm del borde") | necesita la familia DISTANCIA del spec 11-ago § 3.2 y una decisión de qué borde | tanda 2 |
| **Ancla paramétrica persistente** en `InternalLine` (que la cota se conserve cuando se edita el contorno, como `NotchAnchor`) | es la generalización de `notchAnchor.ts`; cambia el modelo de datos y el DXF | tanda 2; hoy la cota se **deriva** de la geometría cada vez |
| Tramos **curvos** (C/Q) con cota | operan sobre `path` con manejadores sin infraestructura de nodos | tanda 2 |
| Piquetes en chips | `NotchPrecisionModal` funciona y tiene su gramática; dos dueños es el BLOCKER #2 de la revisión | tanda 2, cuando el chip de borde esté probado |
| Multi-selección, costuras, pinzas con cotas | un sujeto a la vez | después |
| ~~Márgenes~~ — **enmendado 2026-09-02:** el margen de un borde entra como cota viva (lectura al pasar, edición al clicar, sin scrub) | tanda 5b-3, pedido literal de María [25:44] | `docs/superpowers/specs/2026-09-02-margen-en-el-borde-design.md` |
| Previsualización **por tecla** | sin canal de render sombra; el scrub ya da lo vivo | si María la pide |
| Teclear dígitos sin clicar (VCB) | colisión con el visor 3D desde `body` y con overrides | no |
| Plegar / arrastrar la tira; volteo por oclusión | estado y ciclo de vida extra | si María lo pide |
| Gemelo 3D (`<Html>` de drei sobre `CollisionBodyMesh`) | otro host; la brecha existe y está documentada | tanda 3 |
| "A 3 cm del borde y paralela" (pregunta 12 de la NOTA 24) | otro modelo (declarativo) | decide María |
| Motion / NumberFlow | pulido; después de que funcione | después |

---

## 12. Riesgos (del código y de la revisión adversarial) y cómo se cubren

| Riesgo | Cobertura |
|---|---|
| **Creación caliente sin identidad** (BLOCKER de la revisión) | `lastCreatedId` local al hook + igualdad con la selección; sin heurística de "acción ajena"; test 8.3.2 |
| `resizePieceTo` corrompe piezas giradas si no sigue el flujo real | se **extrae** el bloque del arrastre y los dos caminos lo comparten; test de igualdad 8.1 |
| Coalescencia de 500 ms del undo pega dos `Enter` seguidos | aceptado y dicho: dos confirmaciones en < 500 ms son un paso; el scrub va en batch explícito |
| `setToolOption` (default) no entra al snapshot de undo | aceptado: deshacer devuelve la geometría, no el default (Blender igual) |
| Blur vs cambio de selección/herramienta | el commit comprueba que el sujeto siga vivo; al desmontar, el borrador se pierde = descarte |
| `Tab` desde `body`/dock | CF-1 captura en `window` sin mirar el target (salvo editables): funciona desde el botón del dock también |
| Dos fuentes de herramienta activa (`editor.activeTool` vs `tools.activeTool2D`) | las cotas y la tira leen `editor.activeTool` (la autoridad de `PatternEditor`); la tira lee las opciones por `toolRegistry.getTool(activeTool)` |
| Arrastre de extremo de una interna tipo `notch` desincroniza `notchAnchor` (riesgo 2 del trazado) | las internas `notch` **no** reciben chips en esta tanda (§ 11) |
| `--text-*` sobre el papel es invisible (1.05:1) | los chips usan solo `--cota-*` / `--ink-on-light-*`; `HintText.legibilidad.test.tsx` es el patrón |
| jsdom ciego al layout y al foco real | todo emplazamiento y toda tecla real van en e2e (8.3) |
| Densidad a 1366 px | colapso por 56 px y cap de 8 (5.2); e2e 8.3.5 |
| Tamaño | **L.** Motores (3) + capa de cotas (SVG + HTML) + chip con scrub + congelado del tramo + tira + mudanza de controles + desmontaje + 7 e2e. Se entrega en **dos PR**: A) motores + cotas de pieza (rectángulo, #223/#225) + tira + desmontaje **de la barra** — `NextPointPanel` se conserva en A (pasa de `fixed` a `absolute` dentro de `.pattern-editor` y la tira se oculta mientras está abierto: el gesto vivo gana la esquina); B) cotas de línea interna (#226) + congelado del tramo, que es cuando `NextPointPanel` muere. La revisión (§ 13.2, #15) tasa A como XL si se mide por superficie tocada; el núcleo M es resize + cotas de pieza, y la tira/desmontaje van en commits separables para poder partir el PR |

---

## 13. Registro de revisión

### 13.1 Panel de jueces (2026-08-30, workflow `panel-vs-cotas-vivas`, 12 agentes)

Tres propuestas independientes (Petra Haft — manipulación directa; ángulo Bret Victor — el número como instrumento; ángulo producto 2026 — Onshape/Figma/Shapr3D/Gumball/Blender) convergieron en la misma tesis: **la cota es el campo**; ninguna conservó el formulario. Jueces: Iris Tane (visual), Marcus Halberg (runtime en Vina), jueza-María (patronista no técnica). Medias: 7,5 / 6,7 / 5,2.

Lo que este documento **toma** de ellas:

| De quién | Qué | Dónde quedó |
|---|---|---|
| los tres jueces, unánime | el chip de dos estados: la misma píldora es lectura en reposo y control al tocarla; muere "Aplicar" | § 5.3 |
| Iris, jueza-María | el extremo que se mueve se **rellena** y el ancla se **vacía** al pasar el ratón por la cota | § 3.4 |
| Iris | dos pesos: primarias rellenas, de borde huecas — "seis primarios simultáneos" era la falla | § 3.4 |
| jueza-María, Halberg | la densidad es el riesgo real (pinzas de 12 mm), no la demo; colapso **medido** en navegador y cotas de borde bajo demanda | § 3.4, e2e 8.3.5 |
| Halberg (juicio 7, puntaje 3 a la propuesta con chips SVG) | el chip interactivo **tiene que ser HTML** anclado como `FloatingActionBar`; un `<g role="button">` con `stopPropagation` no escapa al router en captura ni al `wheel` atado al `<svg>` | § 5.1 |
| Halberg (juicio 5) | al seleccionar una interna, `selectedPieceIds` trae el transform box y la barra de verbos: hay que suprimirlos | § 3.5 |
| Halberg (juicio 8) | la rueda sobre una capa HTML no llega al `<svg>`: `pointer-events: none` en la capa, `auto` solo en chips | § 5.1 |
| Petra | ganancia del scrub 1 px = 1/zoom mm, Shift ×10, Alt ×0,1; ángulo 1 px = 0,5°; orden fijo del Tab; `type="text" inputMode="decimal"` | § 5.3 |
| jueza-María (juicio 4) | el mínimo viable: la píldora que ya sigue al cursor se queda anclada sobre la línea y se vuelve clicable — es el PR B en su forma más chica | § 12 |

Lo que **no** toma: la previsualización por tecla mientras se escribe (las tres la proponían; sin canal de render sombra queda para después de medir el scrub, § 11); las etiquetas "Izq. arriba…" como texto (mueren; sobreviven como `aria-label`); el arco de ángulo dibujado (ruido; el chip dice los grados); la ficha plegable estilo Blender (la tira no se pliega en esta tanda).

### 13.2 Revisión adversarial (codex `ultra`, Serrano/Halberg/Vex, 2026-08-30, 21 min)

Veredicto: *"la v2 no está lista como contrato de implementación"* — 7 BLOCKER, 8 HIGH, 3 MEDIUM, 15 premisas falsas. Cada hallazgo, su decisión y dónde se fija:

| # | Hallazgo | Decisión | Dónde |
|---|---|---|---|
| 1 | La creación caliente no enfría de forma irreversible: reseleccionar la pieza o volver a Rectángulo la volvía caliente | `hotId` en el hook, se borra al cambiar selección/herramienta o al desaparecer la pieza; nunca vuelve | § 3.1; test 8.3.2 con reselección e ida y vuelta de herramienta |
| 2 | `cw`/`ccw` invertidos en § 4.1 y coincidencia exacta con una esquina devuelve dos ceros | **PR B**: `cw` = orden almacenado (`notchAnchor.ts:12`); la esquina "anterior" es `advance(corner, s, 'cw')` con `corner ≤ s`; en coincidencia exacta la esquina propia no cuenta, se toman las dos vecinas | § 4.1 (reescribir en PR B) |
| 3 | El scrub cerraba el batch solo al soltar | Terminales completos: `pointerup`, `pointercancel`, `lostpointercapture`, desmontaje, cambio de sujeto/herramienta, token invalidado | § 5.3; tests de `CotaChip` (cancel, lost capture, unmount) |
| 4 | Tab: CF-1 capturaba desde el dock y desde un chip (bucle); el input se desmonta antes del Tab nativo; `Space` en el botón dispara simular; `Escape` desde inputs es excepción del guard global | Tab en CF-1 **solo** con target `svg`/`body`; el chip mueve el foco al vecino por su cuenta; `Space`/`Enter` en el botón detienen la propagación; el input detiene todo `keydown` | § 5.3; tests de `CotaChip` |
| 5 | PR A borraba `NextPointPanel` antes de su reemplazo | Se conserva en A: pasa a `absolute` dentro de `.pattern-editor`; la tira se oculta mientras está abierto | § 12 |
| 6 | Contornos multi-subpath sin dominio de adyacencia; `detectCorners` (v1) vs anillo metric 2 | **PR B**: `subpathCount > 1` → sin cotas de borde (dicho); esquinas proyectadas al anillo metric 2 y ordenadas por arco | § 4.1 (PR B) |
| 7 | Dispatch por movimiento sin presupuesto de frame; invalida el memo de anillos de `usePolyPenTool` | rAF: una acción por frame como máximo; cada valor se deriva del snapshot; el e2e de scrub corre sobre la pieza; presupuesto DXF queda como medición pendiente (§ 11) | § 5.3 |
| 8 | La fórmula de `FloatingActionBar` no gira | Los extremos de la cota ya vienen girados de `cotasDePieza` (pivote de la caja); la fórmula solo proyecta | § 5.1; test `cotas.test.ts` (90°) |
| 9 | Clic derecho / botón medio no atraviesan al `<svg>` | Aceptado y dicho: nada sobre el chip; `preventDefault` del menú nativo | § 5.3 |
| 10 | Blur vs cambio de selección en `mousedown`: dos resultados posibles | **El blur descarta**; solo Enter y Tab confirman | § 5.3; test |
| 11 | Undo deja `selectedInternalLine` colgante | **PR B**: la compuerta de § 3.5 exige que la línea exista (`internals.find`) | § 3.5 (PR B) |
| 12 | `internalLineDragRef` no es observable | **PR B**: `useEditorInteractions` expone `isDraggingEndpoint` como estado, igual que `isDraggingPiece` | § 5.2 (PR B) |
| 13 | Unidades: el botón en cm/pulgadas y el campo en mm | Los chips leen y escriben en **mm** siempre en esta tanda; dicho en § 4.4 y § 11 | § 4.4 |
| 14 | Dominio de `PathCommand` (H/V/S/T/A; contornos de dos puntos sin esquinas) | **PR B**: solo `L` produce cota de tramo; `A` y `subpathCount > 1` sin cotas de borde; cero esquinas → sin cotas de borde | § 4.1-4.2 (PR B) |
| 15 | Tamaño XL, no L; PR A mezcla dominios | Núcleo M confirmado (resize + cotas de pieza); tira/desmontaje en commits separables; se reporta XL si se mide por superficie | § 12 |
| 16 | "Igual al handle `se`" mezcla contratos (uniforme vs no uniforme) | Mismo motor, no mismo gesto — reescrito | § 4.3 |
| 17 | "Un dispatch" con creación caliente son dos acciones | Una `project/*` (undo) + un `tools/*` (fuera del historial) | § 5.3 |
| 18 | Shift con dos ganancias | Shift ×10, Alt ×0,1, en scrub y flechas | § 5.3; test |

Descartado por la propia revisión: teclear dígitos no mueve la cámara 3D (`Viewport3D.tsx:668` ya excluye targets editables); el conflicto real es `Escape`/`Space` en `ShortcutProvider`, cerrado en #4.

### 13.3 Revisión del diff del PR A (`codex review --base main`, 2026-08-30, 21 min)

Seis hallazgos, todos reales, todos corregidos en el mismo PR: (1) el sujeto ignoraba capas ocultas y bloqueadas — ahora una pieza en capa oculta no tiene cotas y en capa bloqueada las tiene apagadas; (2) contornos con `H`/`V`/`A` (válidos en el esquema) daban cotas falsas — ahora no dan cotas; (3) cancelar un scrub confirmaba el valor de partida y tragaba el clic siguiente — ahora `onScrubCancel` devuelve la pieza al valor de partida dentro del batch, sin clic fantasma; (4) `NextPointPanel` a 300 px fijos se recortaba en un panel angosto — `min(300px, calc(100% - 24px))`; (5) cambiar de herramienta entre rectángulo/seleccionar con la misma pieza no cerraba el batch — la limpieza va también por herramienta; (6) Tab desde el último chip se quedaba en el mismo botón — sale a la tira.


---

## 14. Enmienda 2026-09-08 — la cota que eligió María

**Origen:** reunión del 2026-09-07 (`docs/reports/2026-09-07-reunion-maria.md` § 2.C y § 4.3). Decisión de Samuel el 08-09: **gana María**.

### 14.1 Qué eligió, exactamente

Eligió el readout oscuro tres veces [07:37], [21:21], [22:01]. Samuel prefería la píldora azul y cedió [22:15]. Pero **lo que ganó no fue el color**, y esto es lo que hay que implementar y no lo que parece:

> *"me gusta bastante este, ¿sabes por qué? **más allá de los colores**, porque aparece encima de la línea"* [07:37]
> *"los ángulos y la distancia están juntos, ocupa menos"* [21:21]
> *"he creado dos cuadros para una misma información que en el otro estaba más acopladito"* [22:23]

Tres propiedades, ninguna cromática:

1. **Un chip por sujeto**, con las magnitudes agrupadas dentro (distancia y ángulo juntos) — no un chip por magnitud.
2. **Sobre el trazo**, no al lado con línea de cota y ticks.
3. **Compacto.**

### 14.2 Lo que NO se hereda del readout

El tamaño. De ese mismo readout dijo *"la letra casi ni se lee"* [07:31], y tenía razón: hoy es `fontSize={10 / z}` (`PolyPenToolOverlay.tsx:144`). **La enmienda toma la geometría de la negra y la legibilidad de la azul.** Copiarla tal cual arrastra el defecto que ella nombró.

### 14.3 Los tokens NO cambian — corregido 2026-09-08

La primera versión de esta enmienda decía que `--cota-bg-2d` pasaba al oscuro del readout y que `--readout-*` se retiraba. **Era una extralimitación mía y se corrige aquí**, por dos razones que aparecieron al implementarla:

1. **Ella dijo "más allá de los colores".** [07:37] La cita completa es *"me gusta bastante este, ¿sabes por qué? más allá de los colores, porque aparece encima de la línea"*. Lo que eligió es la **geometría** —un cuadro, magnitudes juntas, sobre el trazo, compacto—, y lo dijo excluyendo el color de forma explícita. Cambiar la paleta era leer su preferencia por donde ella misma dijo que no la leyera.
2. **La familia azul es una decisión ratificada con mockups aprobados**, y hay un test que la sostiene: `cotas/__tests__/cotas-contraste.test.ts` exige que `--cota-bg-2d` sea del mismo tono que `--accent-2d`, con este comentario al lado: *"el arreglo perezoso sería oscurecer `--accent-2d` y ya. Pero ese token es el color de la selección y de las costuras"*. Además su lector solo admite `oklch(L C H)` sin alfa, así que un fondo translúcido lo rompería — y el alfa es, de hecho, parte de por qué el readout se lee mal.

**Lo que queda de esta enmienda es solo geometría:** un chip por tramo con las dos magnitudes dentro, sobre el trazo, compacto, y las dos siguen siendo editables. `--cota-*` se queda como está. `--readout-*` desaparece por dejar de tener consumidor cuando el readout del trazo vivo hable el idioma de las cotas, no por cambiar de color.

### 14.4 Cómo se verifica (e2e, no vitest)

jsdom no calcula layout ni apilamiento: esta enmienda **no se puede fijar con un test unitario**. El e2e mide cuatro cosas sobre la app viva:

1. Un **solo** chip por sujeto, con las dos magnitudes dentro de la misma caja.
2. Su caja cae **sobre** el trazo, no desplazada al lado (`elementFromPoint` sobre el punto medio del tramo).
3. Texto renderizado **≥ 11 px CSS a zoom 1** — el número que cierra *"casi ni se lee"*.
4. Contraste **≥ 4,5:1** de la tinta sobre el fondo del chip **compuesto sobre el papel del lienzo**: el fondo lleva alfa, y un medidor que ignora el alfa inventa el fallo.


---

## 15. Enmienda 2026-09-08 — el tamaño de una pieza no se contagia a la siguiente

**Origen:** reunión del 2026-09-07, fallo 2 (`docs/reports/2026-09-07-reunion-maria.md` § 3.2 y § 4.1).

### 15.1 Qué se retira

Las **dos** escrituras implícitas del tamaño por defecto:

1. **El arrastre.** `useRectangleTool` despachaba `setToolOption` con el ancho y el alto de lo recién dibujado. Igual sus hermanos `useCircleTool` (Radio) y `useTriangleTool` (Base/Altura).
2. **La cota caliente.** `escribirDefault` en `PatternEditor.tsx`, que al editar la cota de una pieza recién nacida reescribía el default de las tres formas.

María, [01:49]: *"en verdad no es una acción repetitiva, cada rectángulo va a ser de un tamaño distinto"*. Samuel, en la misma sesión: *"ok, bueno, entonces se quita, y ya está"* [01:57].

**Por qué la premisa era razonable y aun así estaba equivocada:** el comentario del código citaba el *Adjust Last Operation* de Blender. Es un patrón correcto para un modelador —que repite operaciones sobre la misma forma— y equivocado para una patronista, que hace piezas distintas. La usuaria real lo desmintió antes que ningún argumento.

### 15.2 Qué NO se retira

**La barra de opciones de la herramienta sigue mandando sobre lo que crea un clic.** Si María escribe 250 × 180 ahí, el clic le da 250 × 180. Se va la ruta **implícita** (la app decidiendo sola), se queda la **deliberada** (ella escribiendo). Hay un caso e2e dedicado a vigilarlo, porque quitar el contagio sin este cuidado se llevaría por delante la única forma de crear un tamaño exacto sin arrastrar.

`sujeto.caliente` **sobrevive**: no era solo para esto. Sostiene el rótulo *"Editando: la pieza nueva"* y va en la bitácora de cada commit de cota.

### 15.3 El efecto secundario que ella ya había cazado

Con el contagio puesto, el rótulo de la tira y el comportamiento se contradecían. María, [01:22]: *"pero ponía que de 100"* — el rótulo prometía 100 × 100 y el clic le creaba otra cosa. Al retirar las escrituras, rótulo y comportamiento vuelven a decir lo mismo.

### 15.4 Los tests que encodaban el contrato viejo

Cuatro, y encontrarlos fue la mitad del trabajo — cambiar solo el primero habría dejado el dibujo partido:

| Test | Qué certificaba | Ahora |
|---|---|---|
| `cotas-de-pieza.spec.ts` (caso 1) | el segundo clic hereda 300×150 | crea 100×100 |
| `useRectangleTool.test.tsx` (arrastre) | la barra queda en 80×60 | la barra queda como estaba |
| `useRectangleTool.test.tsx` (bitácora) | `height: 60` heredado del arrastre anterior | `height: 100`, el de fábrica |
| `useTriangleTool.test.tsx` (arrastre) | la barra queda en base 80 / altura 60 | la barra queda como estaba |
| `maria-191-...spec.ts` | default 80×60 y rótulo *"Un clic crea 80 × 60 mm"* | default 100 y rótulo *"Un clic crea 100 × 100 mm"* |

Más el spec nuevo `el-tamano-no-se-contagia.spec.ts`, que cubre el arrastre y los dos hermanos.
