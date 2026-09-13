# Línea interna única, enganche y medidas escritas — diseño (v2)

> **Enmienda 2026-09-13:** el [contrato integrado de las seis firmas](../../reports/2026-09-13-seis-firmas-maria.md) sustituye la referencia angular absoluta de presentación y el rearme automático del panel: Tab/derecho abre Largo–Ángulo, Enter coloca una vez y vuelve al ratón. G conserva su cancelación de §4; la conservación de construcción de #1158 corresponde a Pluma.

**Fecha:** 2026-08-29
**Tarjetas de María:** #209 (unificar), #205 (cancelar / reempezar / conectar), #206 (curvas internas), #193 (medidas en líneas internas, 2.ª vez), #191 (rectángulo con medidas, 2.ª vez), #195 (pluma con largo y ángulo, 2.ª vez)
**Hereda:** `docs/superpowers/specs/2026-08-11-arrastre-unificado-2d-design.md` (la ley, § 3.5, § 7), `.claude/skills/contrato-de-interfaz/SKILL.md`, `docs/superpowers/specs/2026-08-16-barra-opciones-herramienta-design.md`
**Enmienda:** los tres documentos de § 2.
**Estado:** v2 tras revisión adversarial (§ 16); pendiente de aprobación de Samuel.
**Enmendado:** 2026-09-06 — § 5, la fila del enganche de la pluma (#1102). Ver el recuadro.

---

## 1. Por qué existe este documento

Seis tarjetas, tres escritas por segunda vez con "ESTA TARJETA YA ESTABA CREADA Y NO VEO NINGÚN CAMBIO". No son seis bugs: son dos carencias del editor 2D.

1. **Las líneas internas no tienen una herramienta, tienen tres**, ninguna engancha a nada, y la que hace curvas no puede terminar una línea abierta.
2. **Ninguna herramienta de creación acepta un número.** El rectángulo enseña Ancho y Alto en la barra y los ignora; la pluma enseña el largo y no deja escribirlo.

### 1.1 Censo (verificado contra el árbol el 2026-08-29)

| Id | Nombre | Puerta | Motor | Qué produce | Enganche | Terminar abierta | Reset al cambiar de herramienta |
|---|---|---|---|---|---|---|---|
| `line` | Línea | dock por defecto (ranura 5), `⇧L` | `useLineTool.ts` — dos clics | 1 tramo recto, `type:'fold'`, pieza más cercana al 1.er clic | no | n/a | **no** (`useEditorInteractions.ts:351-367` no lo resetea; el hook no expone `reset`) |
| `internalShape` | Forma interna | catálogo del dock fuera del default, `G` | `usePolyPenTool(…,'internalLine','reference')` (`PatternEditor.tsx:361`) | polilínea recta/bezier, `type:'reference'`, **pieza seleccionada o la última** (`:353`) | no | **no** (Enter no se maneja; doble clic siempre cierra con `Z`, `usePolyPenTool.ts:119-121`) | sí |
| `polyPen` | Pluma poligonal | solo `Y` | mismo hook, opción `mode: piece\|internalLine` | pieza o línea interna | no | no | sí |

`line` además resta solo `piece.position` al guardar (`useLineTool.ts:47-57`): el #1068 vivo en la única de las tres que está en el dock por defecto.

### 1.2 Reproducción medida (Playwright, 2026-08-29, spec temporal no commiteado)

| Tarjeta | Qué se midió | Resultado |
|---|---|---|
| #205 "irme a otra función no sale de empezar a dibujar desde ese mismo punto" | Línea: clic de inicio → `Z` → `⇧L` → un clic | **1 línea creada** desde el inicio fantasma (`M 50,50 L 110,80`). Escape sí limpia: su literal ("clico ESCAPE") no es el bug; el mecanismo ("irme a otra función") sí |
| #209/#205 "que pueda dejar de dibujar" | Forma interna: tres clics + Enter · tres clics + doble clic | Enter: **0** líneas. Doble clic: `MLLLLZ` — **cerrada a la fuerza**, y con un nodo repetido antes del `Z` |
| #205 "aunque parezca que están conectadas no lo están" | Forma interna: clic a 5 px de pantalla del vértice (0,0) | punto guardado **(4, 3)** — 5,00 mm de desvío |
| #218/#209 | Forma interna dibujada DENTRO de A, con B creada después | la línea cae en **B**, en (−300, 50) local |
| #191 | Rectángulo: `#opcion-width` / `#opcion-height` son `type=range`; se fija 300×150 y se arrastra 100×100 | pieza de **100×100**. Un clic suelto: **cero piezas** (celda muerta) |
| #195 | Pluma: `#opcion-constrainAngles` existe; se fija `'90'`; dos clics a 23° | segundo punto **[520, 430]**, sin restringir. Inputs numéricos en la barra: **0** |

### 1.3 Defectos vivos que el rediseño cierra de paso (revisión, 2026-08-29)

- El clic derecho **suelta un nodo**: `usePolyPenTool.handleMouseDown` (`:77`) no filtra `e.button`; el router solo filtra el botón medio (`useEditorInteractions.ts:546-550`). Lo mismo en `useRectangleTool.handleMouseDown` (`:48-51`).
- El Escape del trazo **dispara dos veces** (`usePolyPenTool.ts:115-117`, sin `stopPropagation`): borra el trazo **y** la selección.
- `reset()` **no limpia `dragStartRef`** (`usePolyPenTool.ts:56-59`): Escape a mitad de press borra todos los nodos y el mouseup pendiente **arma un nodo nuevo** desde el press viejo. Mismo mecanismo al cambiar de herramienta con el botón apretado.
- El cierre ocurre en el **press** (`:80-85`) y los nodos se confirman en el **release** (`:99-113`): un doble clic sobre el primer nodo cierra con el primer par y deja **un trazo fantasma de un nodo** con el segundo.
- `internalShape`, `pen` y `rectangle` **no están en `handlePointerCancel`** (`useEditorInteractions.ts:985-991`), y el camino sin evento de `PatternEditor.tsx:658-667, :810-813` (`blur`, reentrada con `buttons === 0`) salta el mouseup del hook: press colgado.

---

## 2. Correcciones a contratos anteriores

| Documento | Decía | Medido | Enmienda |
|---|---|---|---|
| Spec Forma interna 2026-07-17, "No-piece behavior" | *"falls back to the last piece when nothing is selected"* | la línea dibujada dentro de A cae en B | **La anfitriona la fija el primer press** (§ 4.6). Sin anfitriona, el primer clic no hace nada y la pista lo dice |
| Spec barra 2026-08-16, § 9 | *"Las 20 ya son alcanzables y ya leen sus opciones"* | `rectangle` (3) y `pen` (3) se pintan y **no se leen** | Se hacen reales (`width`, `height`) o se borran (`cornerStyle`, `smoothing`, `snapGrid`, `constrainAngles`). La instantánea `idiomaDeOpciones.test.ts` obliga a tocar el test al añadir una opción: ahí el revisor pregunta quién la lee. No hay guardia nueva |
| Spec barra 2026-08-16, § 4 | *"`number` → deslizador + valor"* | un deslizador de 10 a 3000 para milímetros no sirve | `ToolOption` gana `control?: 'input'` (§ 7.3). El deslizador sigue siendo la omisión |
| Spec 2026-08-11, § 5 | *"Fuera del alcance del umbral a propósito: pluma y polyPen"* | el motor de la línea interna es polyPen | **La línea interna lleva el umbral global de 4 px** (§ 3). La pluma sigue exenta. La exención de polyPen muere con el id |
| `dock2dTools.ts:21` | *"internalShape, whose handler is not built yet"* | existe desde el 17-jul (`useEditorInteractions.ts:618`) | comentario borrado |

---

## 3. La ley y los números

Se hereda entera la del 11-ago: **el press manda el objeto, el release manda el valor**; todo clic de hoy sigue igual (§ 5, salvo lo dicho en § 10); un solo dueño del botón derecho (§ 3.5); sin temporizadores.

| Constante | Valor | Nota |
|---|---|---|
| `DRAG_THRESHOLD_PX` | 4 (`gestureConstants.ts:12`) | la línea interna **sí** lo lleva: aquí el arrastre no alarga un manejador, cambia el **tipo** del nodo y re-curva el tramo anterior; un temblor de 1 px no puede curvar un tramo ya dibujado. La pluma sigue exenta |
| `EDGE_HIT_PX` | 12 (`gestureConstants.ts:30`) | **un solo radio** para todo el enganche: vértice, extremo de interna, contorno, primer nodo, y "encima del último nodo". Es el precedente vivo: Punto usa `EDGE_HIT_PX` para `hitTestNode` (`usePointTool.ts:149-160`) y la pluma cierra a 12 (`usePenTool.ts:32`). No hay constante nueva: en una esquina gana el vértice por **precedencia** (§ 4.6), no por radio |
| Readout | 1 decimal en mm y en grados | sin redondeo automático |

Los tres números del cierre (8 en `usePolyPenTool.ts:48`, 8 en `PolyPenToolOverlay.tsx:39`, 12 en `usePenTool.ts:32`) pasan a `EDGE_HIT_PX`, leído por el hook **y** por el overlay (maria-196: el aviso y el comportamiento no pueden discrepar). El de la pluma **no cambia de valor**.

---

## 4. "Línea interna" — una herramienta

### 4.1 Identidad

| | Hoy | Después |
|---|---|---|
| Id | `internalShape` | `internalShape` — la cadena no cambia (`Tool2D`, router, tests, atajos). María lee el nombre, no el id |
| Nombre | Forma interna | **Línea interna**, en los cuatro sitios que el test-guardia ata: `internalShape.tsx:24`, `dock2dTools.ts:43`, `defaults.ts:44`, `NOMBRES` de `nombresDeHerramienta.test.ts:42` |
| Dock | catálogo, fuera del default | **default, ranura 5** (donde hoy está Línea). `DOCK_2D_CATALOG` se reordena para que sus primeros 12 sigan siendo el default (`dock2dTools.test.ts:57-60`) |
| Teclas | `G` | `G` (prestada de CLO). **Sin alias**: `⇧L` y `Y` quedan libres, sin reasignar. Un `tool.internalShapeAlt` rompería el guardia que deriva herramientas de los ids `tool.*` (`nombresDeHerramienta.test.ts:25-28`) y no tendría puerta visible (la barra enseña un solo binding) |
| `line` | dock, `⇧L` | **muere**: `useLineTool.ts`, `LineToolOverlay.tsx` (tras mudar su píldora), `line.tsx`, `'line'` de `Tool2D`, `tool.line`, y `findNearestPiece` (`hitTest.ts:47`, sin otro consumidor de producción) |
| `polyPen` | `Y` | **muere**: `polyPen.tsx`, `tool.polyPen`, la instancia y las opciones de `PatternEditor.tsx:329-349`, `'polyPen'` de `Tool2D`, su bloque en `idiomaDeOpciones.test.ts:103-107`. `useEditorInteractions.reset.test.tsx:69-74` se reescribe a `internalShape`. **`usePolyPenTool` vive**: es el motor |
| Copiloto `polyPenDraw` | despacha directo | intacto (`src/copilot/action/tools/definitions/patternOpsTools.ts:736-777`). Su rama `internalLine` escribe coordenadas de patrón en internals locales (`:774`): issue aparte |
| Tipo por omisión | `fold` / `reference` | **`reference`**. Precio: el clic derecho pasa de `il.fold` ("Desplegar") a `il.other` ("Desplazar línea interna", "Optimizar curvas"). El selector de tipo queda en la barra para cuando sí sea un doblez: es la única puerta a `fold` cuando `line` muera |

### 4.2 Opciones en la barra

| Id | Etiqueta | Tipo | Valores | Lector |
|---|---|---|---|---|
| `nodeType` | **Tipo de punto** (misma etiqueta que `point.tsx:33`) | select | `straight` (Recta, omisión) · `curvePoints` (Curva por puntos) | el motor |
| `lineType` | Tipo de línea | select | `reference` (Referencia, omisión) · `fold` (Doblez) · `topstitch` (Pespunte) — movido de `polyPen.tsx:35-43` | el commit |

El latch tiene **dos** valores: bezier es el arrastre, siempre. Cambiarlo a mitad de trazo no cancela nada. `toolOptions` no se persiste y `NEW_PROJECT` lo reinicia (`toolSlice.ts:57-59`): **es diseño** — un modo que se olvida vuelve al valor seguro. Sin `Alt`: ninguna tarjeta lo pide y el latch ya cubre recta-curva-recta en el mismo trazo.

### 4.3 Gramática

Radio de enganche `EDGE_HIT_PX` en todo. "Objetivo" = lo que resuelve § 4.6.

| Gesto | Interior de pieza | Vértice · extremo de otra interna · contorno | Último nodo del trazo | Primer nodo (≥ 3 nodos) |
|---|---|---|---|---|
| **clic** (< 4 px) | nodo del tipo latcheado | nodo **exacto** en el objetivo | **nada** (un tramo de largo cero es basura) | arma el **cierre**; se commitea al soltar |
| **arrastre** (≥ 4 px) | nodo **bezier**, manejadores simétricos; el ancla es el press | ancla en el objetivo, manejadores por el arrastre | igual que clic: nada | cierra (el press ya decidió; el arrastre no curva el cierre — ver § 4.5) |
| **doble clic** | **termina ABIERTA** (≥ 2 nodos): el primer par pone el nodo, el segundo cae encima del último y no hace nada, el `dblclick` termina | | | (el primer par cerró; el segundo cae en la zona muerta de § 4.4) |
| **Enter** (foco fuera de un campo) | termina ABIERTA (≥ 2 nodos) | | | |
| **Escape** | descarta el trazo entero · a mitad de press, descarta solo ese press · sin trazo, fluye al global | | | |
| **Retroceso / Supr** | quita el último nodo · con 1 nodo, descarta el trazo | | | |
| **Tab** | abre o enfoca el panel "Siguiente punto" (§ 7.2), solo con ≥ 1 nodo | | | |
| **clic derecho** | sin trazo: menú de siempre · con trazo: **nada, y el menú no se abre** | | | |
| **hover** | anillo en el objetivo · la goma **termina en el objetivo** · fantasma del nodo con el relleno de su tipo · píldora con largo y ángulo | | | |
| Shift · Alt · Ctrl | vacías (Shift reservada a restringir ángulo, § 11) | | | |
| rueda · botón medio · Espacio | intactos | | | |

**Primer press sin anfitriona**: nada, y la pista dice "Clic dentro de una pieza". Los nodos siguientes **sí** pueden caer fuera de la anfitriona: una línea de construcción que se pasa del contorno es cosa de oficio.

### 4.4 Máquina de estados

```
SIN_TRAZO        · pista: "Clic dentro de una pieza para empezar"
 ├─ pointerdown b0 que resuelve anfitriona ─────► NODO_ARMADO {host, punto, objetivo?}
 ├─ pointerdown b0 dentro de la zona muerta ────► nada (ver abajo)
 ├─ pointerdown b0 sin anfitriona ──────────────► nada; la pista lo dice
 ├─ pointerdown b2 ─────────────────────────────► menú de siempre
 └─ Escape ─────────────────────────────────────► fluye al global (deseleccionar)

NODO_ARMADO      · fantasma clavado, goma congelada · captura de puntero
 ├─ pointermove ≥ 4 px ─────────────────────────► TIRANDO_MANEJADOR
 ├─ pointerup ──────────────────────────────────► confirma nodo del tipo latcheado ─► TRAZANDO
 ├─ pointerup sobre el nodo 1 armado como cierre ► commit(cerrada) ─► SIN_TRAZO + zona muerta
 └─ Escape | pointercancel | blur | b2 ─────────► descarta ESE press (el ref del press se
                                                   limpia; los nodos quedan) ─► estado anterior

TIRANDO_MANEJADOR· dos manejadores
 ├─ pointermove ────────────────────────────────► manejadores simétricos
 ├─ pointerup ──────────────────────────────────► confirma nodo BEZIER ─► TRAZANDO
 └─ Escape | pointercancel | blur | b2 ─────────► descarta ESE press ─► estado anterior

TRAZANDO         · trazo + goma + píldora
 ├─ hover ─────────────────────────────────────► anillo en el objetivo
 ├─ pointerdown b0 ────────────────────────────► NODO_ARMADO (o nada si cae sobre el último nodo)
 ├─ pointerdown b0 sobre el nodo 1 (≥ 3) ──────► NODO_ARMADO como cierre
 ├─ doble clic | Enter (≥ 2 nodos) ────────────► commit(abierta) ─► SIN_TRAZO + zona muerta
 ├─ Retroceso | Supr ──────────────────────────► quita el último · con 1 ─► SIN_TRAZO
 ├─ Tab ───────────────────────────────────────► abre/enfoca el panel (§ 7.2); sigue TRAZANDO
 ├─ Escape ────────────────────────────────────► descarta ─► SIN_TRAZO
 ├─ pointerdown b2 ────────────────────────────► nada, y el menú NO se abre
 ├─ anfitriona borrada (undo, Supr) ───────────► al commit: descarta con aviso (toast)
 └─ cambio de herramienta ─────────────────────► reset total (nodos y press)
```

**Zona muerta tras cerrar con el puntero.** Tras `commit(cerrada)` por release sobre el nodo 1 (punto P), un press a ≤ `EDGE_HIT_PX` de P **no arma nada** hasta que el cursor se aleje más de ese radio. Sin temporizador: es un latch de distancia. Es lo que impide que el segundo par de un doble clic sobre el nodo 1 nazca como trazo fantasma (§ 1.3). **Solo ahí** (enmendado el 2026-08-29 al implementar): tras Enter no sigue ningún par de clics, y una zona muerta tras Enter bloqueaba el clic que continúa desde el extremo recién terminado — "clico y nada pasa". Tras terminar por doble clic tampoco hace falta: el segundo par del doble clic ya cae sobre el último nodo y no arma.

**Cláusulas:** `commit(cerrada)` pide ≥ 3 nodos, `commit(abierta)` ≥ 2; con menos se descarta. **La anfitriona la fija el primer press y no se re-apunta**; el commit la resuelve **por id en el instante del commit** (no por closure: `handleInternalShapeComplete` cierra sobre `pieces`, `PatternEditor.tsx:351-359`). Si ya no existe, el trazo se descarta con toast. Si se movió o giró a mitad de trazo, los nodos están en mundo y el commit convierte con el transform vigente: la línea queda donde los nodos se ven. **Un trazo = una entrada de deshacer.**

### 4.5 Tipo de punto y líneas mixtas

| Tipo | Cómo se dice | Cómo se ve |
|---|---|---|
| Recta | latch Recta + clic | círculo hueco |
| Curva por puntos | latch Curva por puntos + clic | círculo relleno, sin manejadores |
| Bezier | clic+arrastre, siempre | círculo relleno con dos manejadores |

Es la regla de relleno que `PolyPenToolOverlay.tsx:52` ya aplica, extendida al fantasma.

**Geometría, en una función pura** (`polyPenGeometry.ts`, nueva, testeable sin DOM; la usan el hook **y** el overlay — hoy `buildPathD` del overlay duplica `nodesToCommands` del hook, y con bloques de curva serían tres copias):

- **Cada tramo toma en cada extremo el manejador que su nodo aporta.** Un nodo bezier aporta el suyo. Un nodo curva por puntos aporta el de Catmull-Rom de su bloque. Un nodo recto no aporta.
- **Bloque** = corrida maximal de nodos curva por puntos consecutivos. Sus anclas son `[vecino anterior, …bloque, vecino siguiente]` (los vecinos, del tipo que sean, entran como puntos), y `chainHandles(anclas, false)` (`catmullRom.ts:79-88`) da los manejadores de cada tramo, incluidos los dos de frontera. En los extremos `contextFor` cae en `phantomEnd`: la curva entra recta y se dobla después.
- Tramo entre dos nodos que no aportan → `L`. Tramo donde al menos uno aporta → `C` (el extremo que no aporta pone su propia ancla como control, como hoy en `usePolyPenTool.ts:19-25`).
- **Las cadenas son abiertas**, como el contorno (`splineSegment.ts:57-63`). Un cierre no une bloques: si el trazo cierra, el tramo `último → primero` es un tramo más, con los manejadores que aporten sus dos nodos, emitido como `C` + `Z` (como `usePenTool.ts:81-95`) o `Z` solo si ninguno aporta. Un bloque de curva "que cruza el cierre" son dos bloques y una esquina suave en la costura; es raro y es una sola regla.
- **No se promete** que `isSplineManaged` reconozca estos tramos: su predicción es sobre corridas maximales de `C` del contorno y un bezier adyacente la rompe. El re-suavizado al editar nodos interiores es de otra tarjeta (§ 11).

### 4.6 Anfitriona y enganche

**Orden de "arriba".** `PieceRenderer` pinta `pieces` filtradas por capa oculta y ordenadas por `zOrder` ascendente (`:593-598`): la última pintada está arriba. La misma lista, recorrida al revés, es el orden de hit-test aquí. `hitTestPieceBBox` (`hitTest.ts:32`) recorre hacia adelante y devuelve la de **abajo**: no se usa. Las piezas de capa oculta no son anfitrionas ni objetivo.

**Anfitriona** (solo en el primer press, por prioridad):

1. Si el press **engancha** (vértice, extremo de interna o contorno de una pieza), la anfitriona es **la pieza del objetivo**. Es el caso de María: dos piezas adyacentes con esquinas coincidentes; la línea que arranca en la esquina de B es de B.
2. Si no, la pieza de más arriba cuyo **contorno** contiene el press — `pointInPolygon(local, outline)` (`slashAndSpread.ts:302`), no la caja: en un DXF tendido la caja de la manga entra en el cuerpo.
3. Una pieza **bloqueada** no es anfitriona: el press no arma y avisa una vez (toast, como `usePointTool` con `locked`). Sí puede ser objetivo de enganche.

**Objetivo del enganche** (en hover y en press; gana el primero):

| # | Objetivo | Helper | Memo |
|---|---|---|---|
| 1 | Primer nodo del trazo (cerrar), solo con ≥ 3 | el motor | — |
| 2 | Vértice del contorno de cualquier pieza visible, la de arriba primero | `extractNodes` + `hitTestNode` (`nodeEditorUtils.ts:105, :253`) | `nodesByPiece` por identidad de `pieces` (como `usePointTool.ts:130-134`) |
| 3 | Extremo de una línea interna existente | `getInternalLineEndpoints` (hoy privada en `useEditorInteractions.ts:77`; se exporta) | mismo memo |
| 4 | Cualquier punto del contorno | `buildRing(outline, 2)` + `projectToRing(ring, local)` (`outlineRing.ts:370, :611`) — anillo **pre-aplanado** por pieza | `ringsByPiece` (como `usePointTool.ts:136-143`). **No** `snapToEdge`: re-aplana el contorno entero por comando en cada llamada (`seam/index.ts:248-260`), O(n²) por pieza y por movimiento; con 20 piezas DXF no cabe en un frame |
| 5 | nada | el punto crudo | |

**Señal antes de clicar** (las tres): el **anillo** con el glifo del cierre de la pluma (`PenToolOverlay.tsx:101-112`) sobre el objetivo; la **goma** termina en el objetivo; el **fantasma** del nodo. Sin taxonomía de enganches. **El cursor no cambia.**

**Coordenada guardada.** El nodo guarda el punto de mundo del objetivo (el que devuelve el helper); el commit convierte todo con `toPieceLocalPath` (`internalShapePath.ts`). No hay "bit a bit": el error de `rotatePoint` es ~1e-13 mm, nadie compara extremos de líneas internas por igualdad, y el desvío de 5 mm de § 1.2 lo mata el enganche, no un campo. El test lo fija con `toBeCloseTo(…, 6)`, como su molde `1068-forma-interna-pieza-girada.test.ts:57-58`.

### 4.7 Overlay, tokens y pista

`PolyPenToolOverlay` pinta desde `polyPenGeometry.nodesToCommands` (un solo algoritmo) y gana: la **píldora** del tramo en curso con **largo y ángulo** (formato de `PenToolOverlay.tsx:116-132`, desplazada +22/−18 px del cursor por maria-196), el **anillo** de enganche y el **fantasma** del nodo.

**R3.** `PenToolOverlay` y `LineToolOverlay` pintan con literales (`#ffd700`, `rgba(0,0,0,0.75)`), y el trinquete cuenta literales en `.tsx` (`ui-contract-lint.mjs:47, :123`). El overlay nuevo **no copia literales**: usa `--accent-2d` para trazo y nodos, y **dos tokens nuevos en `tokens.css`**: `--snap-2d` (el anillo; ámbar, distinto de `--piece-locked-2d` en luminosidad) y `--readout-bg-2d` / `--readout-ink-2d` (la píldora). Definir el token donde vive es la ley de tokens, no una excepción. `LineToolOverlay` muere y sus literales con él: R3 **baja**, y el baseline se fija con `--update`.

`HintText.tsx` gana dos frases para `internalShape` (sin trazo / con trazo) y una para `rectangle`; la pista con trazo **nombra Tab**: es la puerta visible de § 7.2. La letra la escribe `solace-wren`.

---

## 5. Pluma — solo lo que cambia

| Gesto | Hoy | Después |
|---|---|---|
| clic sobre el último nodo | nodo de largo cero | **nada** (misma zona que § 4.3) |
| doble clic | nada | **termina ABIERTA** (= Enter) |
| Retroceso / Supr | nada | **quita el último nodo** |
| Tab | nada | **abre o enfoca "Siguiente punto"** (§ 7.2) |
| Escape | cancela, y dispara el global | igual, **un Esc = una acción** (§ 8) |
| clic derecho con trazo | abre el menú | **nada, y el menú no se abre** |
| `pointercancel` / `blur` | no cableados | = descartar el press |
| cierre | 12 px | 12 px, ahora `EDGE_HIT_PX` (sin cambio de valor) |
| arrastre | bezier sin umbral | igual |
| opciones `smoothing`, `snapGrid`, `constrainAngles` | pintadas, no leídas | **se borran** de la definición y de `tools/README.md:61`. `Shift` = restringir ángulo queda reservada (§ 11) |

~~La pluma **no** gana enganche ni curva por puntos: crea piezas desde la nada, y el contorno ya tiene curva por puntos por la herramienta Punto.~~

> **ENMENDADO el 2026-09-06 (#1102).** La mitad del enganche cae; la de la curva
> por puntos se mantiene.
>
> María, con la herramienta en la mano, audio del 30-08 [11:23]: *«si yo ahora
> quiero crear una línea nueva que empiece desde aquí, no se está iluminando…
> para mí estas líneas ahora deberían tener como puntos.»*
>
> El razonamiento de arriba era bueno y estaba incompleto. «Crea piezas desde la
> nada» describe el primer trazo de un proyecto vacío; describe mal el trabajo de
> ella, que es dibujar una pieza nueva **partiendo de una que ya está en la
> mesa**. Ahí la pluma no crea desde la nada: crea desde un punto existente, y
> sin imán ese punto hay que acertarlo a ojo.
>
> Lo que se hizo:
>
> - El resolutor salió de `usePolyPenTool` a `snapIndex.ts` y la pluma lo lee.
>   **Un lector más para el que ya estaba bien; los otros veintitrés hit-tests
>   del lienzo no se tocan** — fundirlos es una L con su propio spec (gramática
>   de la tanda 6, § 4).
> - Con eso se salda de paso la deuda de la fila «cierre» de esta misma tabla:
>   prometía `EDGE_HIT_PX` y en el archivo seguía un `CLOSE_THRESHOLD = 12`
>   literal. Ahora hay **un solo radio** en la herramienta, que era el punto de
>   aquella decisión.
> - Los vértices de las piezas se pintan **solo con la pluma activa**, que es la
>   segunda mitad literal de la queja [11:38]. Pintarlos siempre es otra cosa y
>   tiene su issue: #1108.
> - El cierre gana al enganche cuando compiten: si no, un trazo encima de una
>   pieza —donde más se dibuja— no se podría cerrar.
>
> **La curva por puntos sigue sin ir a la pluma.** Ese medio argumento sigue en
> pie y nadie lo ha refutado: el contorno ya la tiene por la herramienta Punto.
>
> Contrato ejecutable: `src/components/PatternEditor/__tests__/1102-la-pluma-engancha.test.tsx`,
> escrito con los mismos clics y la misma pieza que el test de enganche de la
> línea interna — si las dos divergen, es que hay dos resolutores y uno miente.

---

## 6. Rectángulo

| Gesto | Hoy | Después |
|---|---|---|
| arrastre ≥ 4 px + soltar | crea si `w,h ≥ 5` **mm** (`useRectangleTool.ts:25,69`) | crea lo dibujado; **el gate en mm muere**, decide `isDrag()`. Al soltar, escribe el tamaño dibujado en `toolOptions.rectangle.{width,height}`: la barra enseña lo último que dibujó |
| **clic** (< 4 px, botón 0) | nada (celda muerta) | **crea el rectángulo con el Ancho y el Alto de la barra**, esquina superior izquierda en el clic. Es el "clicas con el izquierdo y lo crea" de CLO que María cita, y es deshacible |
| botón ≠ 0 | arma igual | no arma (`if (e.button !== 0) return`) |
| Escape durante el arrastre | nada | **cancela** |
| clic derecho durante el arrastre | abre el menú | **cancela y suprime el menú** |
| opciones `width` / `height` | sliders 10–1000 paso 5, no leídas | **reales**, `control: 'input'` (§ 7.3), 1–3000, paso 1, un decimal |
| opción `cornerStyle` | pintada, no leída | **se borra** |

**Sin panel y sin fila de menú.** Ancho y Alto ya viven en la barra, siempre visibles: un panel flotante repetiría los mismos dos campos (la duplicidad que § 4.2 rechaza), y una fila de menú sería una tercera puerta para una intención. Si María echa de menos el popup de CLO, es una fila en `CURATION` y se añade entonces (§ 14).

---

## 7. Entrada numérica

### 7.0 Un solo material

El panel "Siguiente punto" es hermano de `NotchPrecisionModal.tsx` (mismo CSS de base, misma forma: flotante al borde derecho, sin velo, el lienzo sigue vivo, `onPreview` por tecla válida, estado en string para que un campo vaciado lea inválido). **Con dos diferencias dichas:**

- **Sin oyente en `window`.** Sus teclas se manejan en React (`onKeyDown` en la raíz del panel): Enter confirma, Escape cierra, **y detiene la propagación de todo `keydown`** — así ni el router de herramientas (`window`, burbuja) ni `ShortcutProvider` (`document`, burbuja) ven lo que se teclea dentro. Es la regla de § 8. El oyente en captura de `NotchPrecisionModal.tsx:48-64` no se toca (funciona porque su gesto ya terminó cuando abre); tampoco se generaliza: cuando haya un tercero se extrae.
- **CSS propia sin literales y con `:focus-visible`.** `NotchPrecisionModal.css` tiene dos literales (`:13`, `:88`) y ningún `:focus-visible`; el panel nuevo no los hereda. R3 y R5 no pueden subir.

### 7.1 Rectángulo

No hay panel: § 6.

### 7.2 "Siguiente punto" (pluma y línea interna)

Campos: **Largo (mm)** (> 0, un decimal) y **Ángulo (°)** (−360…360, un decimal). **Convención:** 0° a la derecha, **90° hacia arriba tal como se ve en pantalla** (antihorario en pantalla; en coordenadas de patrón, donde y crece hacia abajo, `dx = L·cos θ`, `dy = −L·sin θ`). −90° apunta hacia abajo.

Ciclo de vida:

- **Se abre con Tab** (trazo vivo, ≥ 1 nodo), **prefijado con el largo y el ángulo que la goma muestra en ese instante**, y desde ahí los campos son de la usuaria: **no siguen al cursor**. Tab con el panel ya abierto lo **enfoca** (Largo, seleccionado).
- **Enter dentro del panel** coloca el nodo (del tipo latcheado; en la pluma, esquina) a esa distancia polar del último nodo, y **el panel se queda abierto** con los mismos valores y el foco en Largo: 80/−90, Enter, 50/0, Enter. Es el préstamo de Rhino y AutoCAD, sin modo que encender.
- **Escape dentro del panel** lo cierra y el trazo sigue. **Enter fuera del panel** (foco en el lienzo o en el cuerpo) **termina el trazo**, como siempre. Un clic en el lienzo coloca un nodo normal y deja el foco en el cuerpo; el panel sigue abierto con sus valores, y **Tab vuelve a él**.
- Se cierra solo cuando el trazo termina o se descarta, o al cambiar de herramienta.
- **Tab dentro del panel** es la navegación nativa entre Largo y Ángulo (el panel detiene la propagación; § 8 no lo secuestra).

**El primer nodo nunca pregunta.** Sin nodo anterior no hay largo ni ángulo.

**Esto cierra el #193**, la segunda vez que lo reporta: enganche exacto a la esquina (§ 4.6) + largo/ángulo escritos **es** "meticulosamente medido dónde".

### 7.3 Un control numérico en la barra

`ToolOption` gana `control?: 'input'` (omisión: deslizador, así nada de lo que hoy se pinta cambia). Con `control: 'input'` la barra pinta `input[type=number]` con `min/max/step`. Es la única extensión del contrato de la barra. Pasar **todos** los `number` a input (16 herramientas escriben milímetros, no opacidades) es mejor para una patronista y va como decisión aparte (§ 14).

---

## 8. Regla de teclado

Medido en el árbol: cuatro oyentes de `keydown`. (a) `window` burbuja, el router de herramientas (`useEditorInteractions.ts:382-405`), sin filtro de `target`. (b) `window` captura, la coordinación CF-1 (`:412-448`). (c) `document` burbuja, `ShortcutProvider.tsx:77`, que salta campos salvo Escape (`:56-63`). (d) `window` captura, `NotchPrecisionModal.tsx:48-64`. Dos oyentes del **mismo nodo y la misma fase** se disparan los dos: `stopPropagation` no separa (b) de (d), y en burbuja `document` corre **antes** que `window`: hoy un Retroceso con la anfitriona seleccionada borraría la pieza (`useKeyboardShortcuts.ts:130-136`) antes de que el trazo lo vea.

**La regla:**

1. **Las teclas que nacen dentro de un campo editable pertenecen al campo.** CF-1 no actúa si `e.target` es `input`, `textarea`, `select` o `[contenteditable]`. El panel de § 7 detiene la propagación de todo `keydown` en su raíz React (el root de React está bajo `document`: eso frena (a) y (c)).
2. **Un gesto vivo es dueño de sus teclas, en captura.** Con trazo vivo en `internalShape` o `pen`, Escape, Enter, Retroceso, Supr y Tab se resuelven en **CF-1** (captura, `window`): el hook devuelve si consumió, y solo entonces `preventDefault` + `stopPropagation`. Sin trazo, todo fluye al global. Las ramas de `internalShape` y `pen` **salen** del oyente de burbuja (a) — una tecla, un sitio.
3. Ningún componente nuevo registra un oyente propio en `window`.

Precedentes vivos del patrón: `pointTool.armed` en `:417`, `seamTool.handleKeyDown` en `:436-439`.

---

## 9. Exportación

`exportAAMA.ts:302-337` rutea solo `type === 'reference'` por `pathToEntities`; el resto sale por `lineToDXF` con **el primer tramo** (`:313-320`), y la anotación de dirección del doblez lee `path[1]` (`:334-335`). **Toda línea interna cuyo `path` tenga más de un tramo o un comando `C`/`Q` se emite por `pathToEntities`** en su capa, y la anotación del doblez se coloca en el **punto medio del arco de la polilínea completa**. Los truncamientos del PDF (#954) y del DXF legado (#955) siguen abiertos y no entran.

---

## 10. Compatibilidad — qué cambia de lo que hoy funciona

| Herramienta | Clic hoy | Después | Δ |
|---|---|---|---|
| Línea (dos clics) | tramo recto `fold` | dos clics + Enter o doble clic; sale `reference` | un gesto más para terminar, y el tipo por omisión |
| Forma interna, doble clic | cierra | termina abierta | quien cerraba con doble clic cierra clicando el primer nodo, que es lo que el anillo invita y lo que la pluma ya exige |
| Forma interna, cierre | 8 px, en el press | 12 px, en el release | más fácil; y Escape entre press y release aborta |
| Pluma | todo | igual, más doble clic / Retroceso / Tab | ninguno en lo que existía |
| Rectángulo, arrastre | crea si ≥ 5 mm | crea si ≥ 4 px | solo gana la banda muerta |
| Rectángulo, clic | nada | crea con las medidas de la barra | celda muerta rellenada |
| `⇧L`, `Y` | Línea, Pluma poligonal | libres | § 4.1 |

---

## 11. The Cut

| # | Lo que NO se diseña | Por qué |
|---|---|---|
| 1 | Editar nodos **interiores** de una línea interna ya creada, y el re-suavizado al hacerlo | hoy solo se arrastran sus dos extremos (`useEditorInteractions.ts:653-678`); choca con `editPattern`/`editCurve` |
| 2 | Enganche al **cuerpo** de otra línea interna (unión en T) | solo extremos; el hit-test que existe aproxima un `C` por su punto final (`PatternEditor.tsx:526-534`) |
| 3 | `Alt`+clic = el otro tipo | el latch ya lo cubre; sin tarjeta |
| 4 | Panel y fila de menú para el rectángulo | § 6 |
| 5 | Toggle "Medidas exactas" | Tab + panel persistente lo cubren sin modo |
| 6 | Offset paralelo parametrizable | el verbo existe con 10 mm fijos (`PatternEditor.tsx:381`); otra tarjeta |
| 7 | Colocar el **primer** nodo a X mm de una esquina | familia DISTANCIA del 11-ago, tanda 2 |
| 8 | `Shift` = restringir ángulo · `Shift`+arrastre = cuadrado | reservadas |
| 9 | Enganche en la pluma | lienzo vacío |
| 10 | Bloques de curva por puntos cíclicos al cerrar | cadenas abiertas, como el contorno (§ 4.5) |
| 11 | Captura de puntero en Firefox | `useEdgeGesture.ts:86` cae a `pointerId = 1` (ratón en Firefox es 0); Playwright corre solo chromium. Limitación conocida, no de esta tanda |
| 12 | Truncamiento en PDF (#954) y DXF legado (#955) · el marco del `polyPenDraw` del copiloto | aparte |
| 13 | Textos finales · forma del anillo | `solace-wren` · Iris Tane (los tokens sí entran, § 4.7) |

---

## 12. Verificación

TDD: el test antes, rojo por la razón correcta.

### 12.1 Unitarios (vitest)

1. `polyPenGeometry`: recta-recta → `L`; recta-curva-curva-recta (4 nodos) → `M C C C` con los manejadores de `chainHandles`; bezier junto a curva; cierre con y sin manejadores (`C`+`Z` / `Z`); nodo bezier suelto.
2. La máquina del motor: Escape en cada estado (a mitad de press deja los nodos y limpia el press); `pointercancel`/`blur`; cierre por enganche **en el release**; Enter y doble clic con 1 / 2 / 3 nodos; clic sobre el último nodo no arma; zona muerta tras commit; Retroceso hasta vaciar; b2 no arma; cambio de herramienta limpia nodos **y** press.
3. **Un Esc = una acción**: con trazo vivo el Escape no llega a `clearSelection`; sin trazo, sí. Retroceso con trazo vivo y pieza seleccionada **no** borra la pieza. Teclas con `target` editable no tocan el trazo.
4. Enganche: prioridad vértice > extremo de interna > contorno; la coordenada guardada sobre pieza con `rotation ≠ 0` coincide con el vértice a 1e-6 (molde `1068-forma-interna-pieza-girada.test.ts`); piezas de capa oculta no son objetivo.
5. Anfitriona: la del objetivo si engancha; si no, la de arriba por contorno (dos piezas solapadas con `zOrder`); bloqueada no arma; borrada a mitad de trazo → descarte con aviso; no se re-apunta.
6. Rectángulo: `isDrag` decide; el clic crea con `toolOptions`; el arrastre escribe `toolOptions`; b2 no arma; Escape cancela.
7. Panel: conversión polar (90° → arriba, −90° → abajo); Enter dentro coloca y rearma; Escape dentro cierra; Enter fuera termina; el panel no deja pasar `keydown`.
8. Exportador: una `fold` de 4 nodos exporta 4 vértices en su capa con la anotación en el punto medio del arco.
9. `migrateDefaultDockTools`: el default V5 migra al nuevo; un set personalizado con `'line'` lo recibe como `'internalShape'` en su ranura, sin duplicar si ya lo tenía.
10. `ToolOptionsBar2D`: `control: 'input'` pinta un `input[type=number]`; sin él, el deslizador de siempre.

### 12.2 E2E (Playwright)

- `maria-205-linea-interna.spec.ts`: el experimento de § 1.2 en verde — cambio de herramienta sin inicio fantasma; Enter termina abierta; clic a 5 px del vértice guarda (0, 0) a 1e-6; la línea cae en la pieza bajo el cursor; doble clic sobre el nodo 1 cierra sin trazo fantasma.
- `maria-191-rectangulo-con-medidas.spec.ts`: Ancho 300 / Alto 150 en la barra + clic → pieza 300×150 con la esquina en el clic; el arrastre de 4 px crea y actualiza la barra.
- `maria-195-siguiente-punto.spec.ts`: pluma, un clic, Tab, 80 / 90, Enter → segundo punto en (x, y−80); Enter otra vez con 50 / 0 → tercer punto en (x+50, y−80); Escape cierra el panel; Enter fuera termina la pieza.

### 12.3 Entrega a María

Carpetas `24-linea-interna/`, `25-rectangulo-con-medidas/`, `26-siguiente-punto/` en `D:\Desktop\Personal\para maria\`, con capturas antes/después (los "antes" salen del spec de § 1.2) y NOTAs; `LEEME.txt` actualizado. Comentarios en las seis tarjetas.

### 12.4 Gates

`npx tsc -b --noEmit && npm run test && npm run lint && npm run lint:ui`, más los tres e2e con el servidor caliente. R3 **baja** (muere `LineToolOverlay`) y el baseline se fija con `--update`; R5 no sube (el CSS nuevo trae `:focus-visible`).

---

## 13. Entrega en dos PR

| PR | Cierra | Contenido |
|---|---|---|
| **A — Línea interna** | #205, #206, #209 y la mitad visible de #193 (enganche, píldora con largo y ángulo) | § 4 entero, § 8 (regla de teclado, ramas de `internalShape` y `pen` a CF-1), § 9, muerte de `line` y `polyPen`, dock, teclas, tokens |
| **B — Medidas escritas** | #191, #195 y el resto de #193 | § 6, § 7 (panel, Tab, `control: 'input'`), § 5 (pluma: doble clic, Retroceso, Tab, opciones muertas) |

A no depende de B. B se abre sobre A mergeado.

---

## 14. Decisiones para Samuel

1. **Tipo por omisión `reference`** en vez de `fold` (cambia el clic derecho). Propuesta: `reference`.
2. **Sin panel ni fila de menú para el rectángulo**: Ancho/Alto en la barra + clic crea. Propuesta: sí; si María pide el popup de CLO, es una fila en `CURATION`.
3. **Sin toggle "Medidas exactas"**: Tab + panel persistente. Propuesta: sí; la pista nombra Tab.
4. **Borrar las opciones muertas** (`cornerStyle`, `smoothing`, `snapGrid`, `constrainAngles`) en vez de implementarlas. Propuesta: borrar.
5. **Doble clic en Forma interna pasa de cerrar a terminar abierta.** Propuesta: sí.
6. **Todos los `number` de la barra como input** (16 herramientas) en vez de solo Ancho/Alto. Propuesta: no en esta tanda; issue aparte.

---

## 15. Procedencia

- Censo y reproducción: a mano contra el árbol y con Playwright (§ 1.1, § 1.2), 2026-08-29.
- Gramática, máquina de estados, enganche y entrada numérica: propuesta de Petra Haft (Toolwright) sobre las seis tarjetas, el spec del 11-ago, el contrato de interfaz y los cinco hooks. Divergencias asumidas por este documento en la v1: el cierre de la pluma no bajaba a 10; las opciones muertas de la pluma se borran todas; el panel de "Medidas exactas" como panel persistente.
- Revisión adversarial de la v1 con tres lentes disjuntas (Serrano: contradicciones y huecos; Halberg: viabilidad en runtime; Vex Rune: complejidad accidental), 2026-08-29. Registro en § 16.

## 16. Registro de la revisión adversarial (v1 → v2)

| Hallazgo | De | Resolución en v2 |
|---|---|---|
| Dos oyentes de captura en `window` (CF-1 y el panel) se disparan los dos; `stopPropagation` no separa; en burbuja `document` (atajos) corre antes que `window` (router): Retroceso borraría la pieza seleccionada | Serrano #1 #2 #6, Halberg Q2/Q7 | § 8: teclas de campo pertenecen al campo (CF-1 mira el `target`; el panel frena en React), gesto vivo dueño de sus teclas **en captura**, ramas fuera de la burbuja; el panel **no** registra oyente en `window` |
| Cierre en el press + confirmación en el release → trazo fantasma tras doble clic sobre el nodo 1; nodo duplicado al terminar por doble clic | Halberg Q1, Serrano #9, Vex #12 | § 4.3/§ 4.4: clic sobre el último nodo no arma; cierre se commitea **en el release**; **zona muerta** de distancia tras un commit |
| `reset()` deja `dragStartRef`: Escape a mitad de press arma un nodo; `blur` salta el mouseup | Halberg | § 1.3, § 4.4: Escape/pointercancel/blur descartan **el press**; cambio de herramienta limpia nodos y press |
| Anfitriona: `hitTestPieceBBox` devuelve la de abajo; bbox ≠ contorno; ¿bbox o enganche cuando difieren?; bloqueada/oculta/borrada | Serrano #3 #10, Halberg Q6 | § 4.6: la pieza del objetivo si engancha; si no, la de arriba (orden de `PieceRenderer`) por `pointInPolygon`; bloqueada no; oculta no; borrada → descarte con toast; commit por id |
| `snapToEdge` es O(n²) por pieza y por movimiento; no cabe en 16 ms con 20 piezas DXF | Halberg Q9 | § 4.6 #4: anillo pre-aplanado por pieza (`buildRing` + `projectToRing`) memoizado por identidad de `pieces` |
| "Bit a bit" es falso por seis órdenes de magnitud; `snapToEdge` no expone el local; nadie compara por igualdad | Vex #4, Serrano #7, Halberg Q4 | § 4.6: se guarda el punto de mundo y todo convierte; test a 1e-6 |
| `chainHandles(…, true)` no soporta bloques parciales; `isSplineManaged` nunca reconocería un bloque cíclico ni uno junto a un bezier; dos reglas para el tramo curva↔bezier; el test "L C C C" no sale de 4 nodos | Halberg Q5, Serrano #8, Vex #14 | § 4.5: cadenas abiertas como el contorno; regla única "cada extremo aporta su manejador"; sin promesa sobre `isSplineManaged`; test `M C C C` |
| Cierre con bezier emite `Z` recto | Serrano #9 | § 4.5: `C` + `Z` como la pluma |
| Convención de ángulo contradicha por su e2e (−90 → y−80) | Serrano #4 | § 7.2 y § 12.2: 90° hacia arriba; e2e con 80 / 90 |
| Enter con panel persistente nunca termina; ¿los campos siguen al cursor?; Tab encerrado en Largo; Retroceso en el campo borra un nodo; foco tras clic en el lienzo | Serrano #5 #6, Halberg Q7 | § 7.2: prefijado al abrir y luego fijo; Enter dentro coloca y rearma, Enter fuera termina; Tab dentro navega, Tab fuera enfoca; el panel frena todo `keydown` |
| Toggle `exactMeasures` + Tab = dos puertas con dos comportamientos | Vex #6 | § 7.2: solo Tab; el panel se queda abierto; la pista lo nombra |
| Fila de menú "Rectángulo con medidas…" duplica el clic; `rectPoint` en `CurationCtx` sin otro consumidor | Vex #1 | § 6: sin fila |
| Panel del rectángulo repite Ancho/Alto de la barra | Vex #7 | § 6: sin panel; el clic crea con la barra; el arrastre escribe en la barra |
| Dos hermanos de `NotchPrecisionModal` | Vex #7 | queda uno solo (el del siguiente punto); sin generalizar |
| `⇧L` alias rompe el guardia de nombres y no tendría puerta | Vex #2, Serrano #12 | § 4.1: sin alias |
| `VERTEX_HIT_PX = 10` nuevo vs. precedente vivo de 12 en Punto y pluma | Vex #5 | § 3: solo `EDGE_HIT_PX`; la pluma no cambia |
| Migración del dock: solo emparejado exacto; un set personalizado pierde la ranura; `polyPen` nunca estuvo | Vex #8, Serrano #11, Halberg Q8 | § 4.1 y § 12.1 #9: `LEGACY_V5` + remap `'line' → 'internalShape'` con dedupe dentro de `migrateDefaultDockTools`; catálogo reordenado |
| Guardia de "opciones con lector" por grep es sludge | Vex #3 | § 2: se apoya en `idiomaDeOpciones` |
| `Alt`+clic sin tarjeta | Vex #13 | § 4.2: fuera |
| Overlay duplica `nodesToCommands` | Vex #10 | § 4.5/§ 4.7: `polyPenGeometry.ts` compartido |
| Literales copiados de `PenToolOverlay` suben R3; `NotchPrecisionModal.css` tiene literales y sin `:focus-visible` | Serrano #13 | § 4.7 y § 7.0: tokens nuevos, CSS propia; R3 baja al morir `LineToolOverlay` |
| Botón derecho arma el rectángulo | Serrano #14 | § 6: guard de botón |
| Umbral de 4 px contradice la exención del 11-ago sin enmienda | Serrano #15 | § 2: enmienda escrita |
| `findNearestPiece` queda sin consumidor | Vex #9 | § 4.1: muere |
| Anotación del doblez lee `path[1]` | Halberg | § 9: punto medio del arco |
| `pointerId` en Firefox | Halberg Q3 | § 11 #11: limitación dicha |
| `tools/README.md:61` anuncia opciones muertas | Vex | § 5 |
