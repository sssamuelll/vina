# El margen se lee al pasar y se escribe al clicar (diseño)

**Fecha:** 2026-09-02
**Tanda:** 5b-3 del plan post-feedback de María (audio 2026-08-30)
**Issues:** #1100 (el resto: escribir aplica a *eso*), #1132 (hover pegado — se abre la costura, no se cierra), #1110 (ya entero en código; queda abierto solo por el hover). Fuera: #1135 (ver todos los márgenes a la vez).
**Hereda y enmienda:** `docs/superpowers/specs/2026-08-30-cotas-vivas-design.md` § 11 ("márgenes | un sujeto a la vez | después" → **entra aquí**), § 5.3 (el chip de margen **no tiene scrub**, excepción dicha).
**Mockups aprobados por Samuel (2026-09-01):** `D:\Desktop\Personal\mockups-5b3\` — `C2-hover-lee-de-la-pieza.png` (el hover) y `C3-clic-escribe-margen-propio.png` (la edición). A y B descartados; los prompts al lado.
**Gramática de interacción:** informe de Petra Haft (2026-09-01), `D:\Desktop\Personal\mockups-5b3\petra-gramatica-hover-lee-clic-escribe.md`. Este spec lo sigue; donde se aparta, lo dice (§ 10).

---

## 0. Qué pidió María, textual

- **[25:01]** *«Esto de heredar, no sé muy bien a qué se refiere… un poco antiguo en español».*
- **[25:44]** *«si yo me pongo encima me dijera cuánto es el margen de costura aquí… y vaya desapareciendo según quito».*
- **[26:08]** *«por pieza no funciona, funciona por línea. Supongo que es una memoria de lo anterior, porque no sé por qué aparece directamente 9.5».*
- **[27:31]** *«he clicado a la línea pero se me ha iluminado toda la pieza… solo cambia esa línea… falta control».*

Lo que ya se hizo (5a, 5b-2): la tira anuncia el margen del próximo clic; el botón "Heredar" pasó a "Usar el de la pieza". Lo que **no** se hizo, y es esta tanda: la intención más frecuente —**leer** cuánto margen hay *aquí*— no tiene gesto, y escribir un número con un borde seleccionado no escribe en ese borde.

## 1. Diagnóstico (Petra, § 0)

La herramienta tiene la gramática invertida: leer no tiene gesto; aplicar el default a toda la pieza tiene el gesto más barato y el blanco más grande. Y la palabra que explica la cascada ("heredado") volvió por una superficie vecina dos tandas después de retirarla (`EdgePropertiesSection.tsx:234`, memoria `palabra-retirada-vuelve-por-otra-superficie`).

## 2. La decisión

> **El margen es una cota viva del borde.** Pasar el ratón por un borde enseña su margen en un chip sobre el borde, que se va al quitar el ratón. Clicar el borde ancla el chip y lo abre en edición: escribe, Enter. La tira sigue siendo el default del próximo clic; **la tira son los defaults, el lienzo son los objetos.**

Muere "heredado" en toda superficie visible (§ 7).

## 3. Las tres fuentes y qué enseña el chip

La cascada tiene **tres** fuentes, no dos (`EdgePropertiesSection.tsx:169`, `perEdgeWidths` en `cornerTypes.ts:734-780`):

```
margenEnPunto(piece, edge, t) →
  span con tStart ≤ t < tEnd  (o t = 1 y tEnd = 1) → { mm: span.width,             fuente: 'tramo', spanIndex }
  edge.seamAllowanceWidth != null                → { mm: edge.seamAllowanceWidth, fuente: 'borde' }
  si no                                          → { mm: piece.seamAllowance ?? 0, fuente: 'pieza' }
```

| fuente | chip | rótulo encima | qué escribe la edición |
|---|---|---|---|
| `tramo` | **relleno** | `del tramo` | `updateEdgeSeamAllowanceSpan` (ese índice, mismo `tStart/tEnd`) |
| `borde` | **relleno** | ninguno | `setEdgesSeamAllowance` (ese borde) |
| `pieza` | **hueco** | `de la pieza` | `setEdgesSeamAllowance` — **promueve**: el hueco se vuelve relleno delante de ella |

- `0 relleno` ≠ `0 hueco`: "sin margen porque alguien lo decidió" contra "nadie lo puso". Hoy esa diferencia vive en el store y no se ve en ninguna parte.
- **Tolerancia conocida (corregida en la revisión del 02-09):** las fronteras de un tramo se cortan exactas en el dibujo (`splitAtAllowanceBoundaries`, `cornerTypes.ts:639-693`). Lo que diverge es la **parametrización**: `perEdgeWidths` mide `t` con las cuerdas del aplanado (`cornerTypes.ts:761-772`) y el chip con la longitud de arco del anillo nativo (`edgeArc.ts` sobre `buildRing(outline, 2)`). En un borde recto —el DXF de María llega pre-aplanado— coinciden; en un Bézier dibujado a mano es un sesgo pequeño y sistemático a lo largo del borde, no "un sub-tramo". No es bug; se escribe para que nadie lo "arregle" mal.
- **Límite dicho:** escribir en un chip hueco *el mismo número* que hereda no promueve (`CotaChip.confirmar` no despacha si el valor no cambia, spec 30-08 § 5.3). Escotilla: cualquier otro número; o el panel.

## 4. La gramática

### 4.1 Matriz (Petra § 2.1, recortada a lo que se construye)

| Gesto | Borde | Tramo (dentro del borde) | Cuerpo | Vértice | Vacío |
|---|---|---|---|---|---|
| **hover** | chip de lectura en el punto proyectado + resalte del borde (peso hover) | mismo chip, valor del tramo, `del tramo` | nada (hoy igual) | anillo de esquina (hoy), sin chip | nada |
| **clic** (< 4 px) | selecciona (hoy) **+ ancla el chip + abre edición** | igual, sobre el valor del tramo | aplica el default a la pieza (hoy) | selecciona la esquina (hoy) | nada |
| **arrastre** (≥ 4 px) | escribe un tramo con el default (hoy) → chip **anclado en reposo** en el punto medio del tramo nuevo, `del tramo` | igual | aplica a todas las tocadas (hoy) | — | nada |
| **Shift + clic** | añade/quita de la selección (hoy) → con N ≥ 2 **no hay chip anclado** | igual | — | — | nada |
| **doble clic / Alt / Ctrl / Shift+hover** | **vacías a propósito** (Alt ya es "paso fino" dentro del chip) | | | | |
| **clic derecho** | menú de siempre; el chip anclado se lo traga en sus 56×22 px (ratificado 30-08 § 5.3) | | | | |
| **botón medio** | pan; **limpia el hover al presionar** | | | | |
| **rueda** | zoom; **pasa a través** del chip de lectura (`pointer-events: none`), no del anclado | | | | |

### 4.2 Las tres reglas

**R1 — El hover es la promesa del clic.** Misma función (`resolveSeamAllowanceClick`), mismos umbrales (`VERTEX_HIT_PX` = 10, `EDGE_HIT_PX` = 12), mismo orden (vértice > borde > cuerpo). Ni un píxel más ancho.

**R2 — El chip de lectura NO es un blanco. Se clica el borde.** `CotasLayer` monta como hermano del `<svg>` (`PatternEditor.tsx:1222`); viajar del borde al chip **sale del `<svg>`**, que es la salida que mata la lectura. El chip de lectura es un `<div class="cota cota--lectura" aria-hidden="true">` con `pointer-events: none`. **Nunca `<button>`**: Tab (CF-1) enfocaría algo que muere en el próximo `mousemove`.

**R3 — Solo el clic abre edición. El arrastre nunca.** El arrastre ya dijo su número (el de la tira); abrir un campo al final de cada tramo le robaría el teclado en su gesto más repetido.

### 4.3 Dónde se para cada chip

| chip | ancla (espacio de patrón) | desplazamiento |
|---|---|---|
| lectura | el **punto proyectado** sobre el borde bajo el cursor (no el punto medio: con tramos el valor cambia a lo largo) | `COTA_OFFSET_PX` = 18 px hacia fuera |
| anclado | clic: el punto donde cayó; arrastre: el **punto medio del tramo nuevo** (así lee el valor recién escrito, con `del tramo`: el recibo) | 18 px hacia fuera |

`Cota.a = Cota.b = punto`; `chipScreenPosition` ya lo resuelve (largo 0 → tangente `{1,0}`, `pairOffset` 0). `outward` = normal en ese punto que apunta lejos del pivote de la caja (`normalHaciaFuera`, la de `cotasDeLineaInterna`, exportada), con dos puntos del anillo a ±0,5 mm como tangente. El colapso de 56 px del spec 30-08 § 3.4 **no aplica**: estos chips no tienen hilo.

### 4.4 Máquina de estados

```
S0 REPOSO (sin chip)
  ─ mousemove entra al radio del borde ──────────────▶ S1 LEYENDO (div de lectura + resalte hover)
  ◀─ sale del radio · sale del <svg> · cualquier botón baja ─┘
S1 ─ mouseup de clic (< 4 px) ───────────────────────▶ S3 ESCRIBIENDO (input; Enter/Tab confirma, Escape/blur descarta)
S3 ─ Enter / Tab / Escape ───────────────────────────▶ S2 ANCLADO (button, 1 borde seleccionado; clic en el chip → S3; Escape → S0)
```
Más los que ya existen y no cambian: **S1v** (esquina: anillo), **S4** (arrastre de tramo), **S5** (arrastre de cuerpo).

**Coexistencia — techo duro de dos chips:**

| situación | chips |
|---|---|
| solo hover | 1 (lectura) |
| solo selección | 1 (anclado) |
| hover sobre **otro** borde con uno anclado | 2 — anclado + lectura; la lectura **pesa menos** (contrato § 4) |
| hover sobre la **misma fuente** del anclado (mismo borde, misma `fuente`, mismo `spanIndex`) | 1 — la lectura se suprime; sería el mismo número dos veces. Con tramos, otro punto del mismo borde **sí** lee, porque no es el mismo número |
| cualquier chip **en edición** | 1 — la lectura se oculta mientras hay borrador (`.cotas:has(.cota--editando) .cota--lectura { display: none }`); el resalte del borde sigue |
| N ≥ 2 bordes (Shift) | 0 anclados; manda el panel ("Varios"). Espeja `sujeto.ts:73` |
| esquina seleccionada | 0 — una esquina no tiene ancho |

### 4.5 Las salidas (las 22 de Petra § 3.2, agrupadas por mecanismo)

**Gratis, porque el hover se deriva y no se guarda como valor (§ 5.1):** #1 sale del radio, #2 pasa a otro borde, #3 entra al radio de una esquina, #11 undo/borrado de la pieza, #12 el borde desaparece, #13 zoom/pan con el puntero quieto (re-resolución desde el último punto de pantalla), #21 desmontaje (no hay temporizadores).

**Ya existen (compuertas de `sujeto.ts`):** #15 menú contextual, #16 calibración, #17 capa oculta (la pieza no es blanco: el resolutor recibe solo las dibujables), #18 pieza/capa bloqueada (`aria-disabled`, sin edición). **El resalte del borde pasa por las mismas compuertas** (`sujeto.bordeLeido`, no el `hover` crudo del hook): con el menú contextual abierto no queda un borde encendido sin su número.

**Ya existen (CotaChip):** #19 blur descarta, #20 Enter/Tab confirma.

**Código nuevo:**
- **#4 el puntero sale del `<svg>`** — `onMouseLeave` nuevo en el `<svg>` → `handleMouseLeave` de `useEditorInteractions` → **un solo suscriptor**: `seamAllowanceTool.limpiarHover()`. Solo pone estado en `null`; no toca geometría ni enruta. Abre la costura de #1132 sin cerrarlo.
- **#5 cualquier botón baja** — el tool limpia el hover en su `handleMouseDown` **antes** de mirar el botón (0 y 2 llegan al tool); el botón 1 no llega (pan, `useEditorInteractions.ts:653`) y el router lo limpia ahí mismo (#14). Y **con el botón abajo no se lee** aunque el press no haya armado gesto (esquina, vacío): el hook recuerda `presionado` hasta soltar.
- **#22 `pointercancel`** — `cancel()` también apaga la lectura: no va a llegar ningún `mousemove` que la corrija.
- **#6 cambia la herramienta** — efecto sobre `active` en el hook: hover, ancla y último punto a `null`.
- **#7/#8 gesto en curso** — el press ya limpió el hover; mientras hay gesto no se re-resuelve (el move va al gesto).
- **#9 Escape, escalera de tres peldaños** — 1º descarta el borrador (`CotaChip`, con `stopPropagation`); 2º con el foco en el botón cae al `selection.deselect` global → `clearSelection` → `saSelection = null` → el anclado se va; 3º nada. Todo existe.
- **#10 Escape sin nada armado no toca el hover** — el hover no es un modo; se sale moviendo la mano.

**Sin retardo de aparición** (0 ms, mismo frame del `mousemove`): no es un tooltip, es la lectura del objeto. La desaparición es la del desmontaje (instantánea); el `transition: opacity` de `.cota` no aplica a un elemento que se quita del DOM — se dice, y si María pide el desvanecido es una clase y un temporizador.

## 5. Cómo se construye (medido contra el código, no supuesto)

### 5.1 El hook: `useSeamAllowanceTool` gana hover y ancla

- Recibe `active: boolean` (`activeTool === 'seamAllowance'`) y **las piezas dibujables** (`drawablePieces`: visibles, ordenadas por `zOrder` ascendente — el memo de `PatternEditor.tsx:337` sube por encima del hook). Para el hit-test las invierte una vez (`useMemo`): **gana la pieza dibujada más arriba**, la convención de Illustrator/Figma.
- Estado `hover: { pieceId, edgeId, t } | null`, con guarda de igualdad (el patrón de `useSeamEditTool.ts:61-65`): **`t` se actualiza con cada movimiento** —el chip sigue al cursor a lo largo del borde (§ 4.3)— y la guarda solo evita un objeto nuevo cuando ni el borde ni `t` cambiaron. La bitácora oye solo la identidad (borde + fuente + tramo), no `t`. Ref `ultimoPuntero: { clientX, clientY, rect } | null`. Efecto que re-resuelve sobre `[zoom, pan, pieces, active]`.
- `handleMouseMove` sin gesto armado: resuelve con `resolveSeamAllowanceClick(hitOrder, world, VERTEX_HIT_PX/zoom, EDGE_HIT_PX/zoom)`; `kind === 'edge'` → `t = edgeTForPoint(...)` → `setHover`; cualquier otra cosa → `null`. Al cambiar la identidad, bitácora `sa:hover` con `{ pieceId, edgeId, fuente, mm }` — por cambio, no por movimiento.
- Estado `ancla: { pieceId, edgeId, t } | null`: se fija en `onCommit` (clic: `press.t`; arrastre: punto medio de `range`). No se limpia a mano: el sujeto solo la usa si coincide con `saSelection.items[0]` y el borde sigue vivo.
- Contador `abrirChip: number`: sube en el commit de **clic** (no de arrastre). `PatternEditor` lo observa en un efecto y llama `cotasRef.current?.abrirPrimero()`; si abre, bitácora `sa:chip:abre`.
- `limpiarHover()` expuesto para #4 y #14.
- `VERTEX_HIT_PX = 10` nace en `gestureConstants.ts` al lado de `EDGE_HIT_PX` (el `10` literal de `useSeamAllowanceTool.ts:175,244` se va). Un número del que depende una gramática tiene nombre.
- `edgeSpanMm`, `edgeTForPoint`, `edgePointAtT` salen del hook a `src/components/PatternEditor/edgeArc.ts` (puras sobre el anillo) para que `cotaDeMargen` las use; y `ringForOutline` (un anillo por contorno, `WeakMap` por identidad, métrica 2 con 1 de respaldo) reemplaza al `ringsByPiece` del hook y a cualquier `buildRing` por llamada: el `t` que el hook resuelve y el que la cota interpreta salen del mismo anillo.

### 5.2 Precondición de rendimiento — bloqueante, va primero

Hoy `pickEdgeForSeamAllowance` llama `flattenPathWithSource(outline)` **sin memo en cada llamada** (`edgeHitTest.ts:44`). Con hover corre 60-120 veces por segundo sobre ~20 piezas del DXF de María: tormenta de GC. Dos arreglos, los dos en `edgeHitTest.ts`, los dos mejoran también el clic de hoy:

1. **Rechazo por caja antes de aplanar.** La caja local del contorno (el cálculo del pase 2, `:139-147`) se calcula una vez por contorno, se expande por `max(maxVertexDist, maxEdgeDist)` y descarta la pieza en el pase 1 sin aplanar. En la práctica sobrevive una.
2. **Memo por identidad del arreglo `outline`** (`WeakMap<PathCommand[], { flat, bbox }>`). Redux/immer da un arreglo nuevo solo cuando el contorno cambia.

Se fija con un test que cuenta llamadas a `flattenPathWithSource` (mock del módulo): 100 resoluciones sobre el mismo contorno → 1 aplanado; punto lejos de una pieza → esa pieza no se aplana.

### 5.3 Los tres defectos que el hover destapa

| Dónde | Qué | Aquí |
|---|---|---|
| `edgeHitTest.ts:118,132` | recorre `pieces` en orden de arreglo, no por `zOrder` | **arreglado**: el llamador pasa las dibujables invertidas; el contrato de la función pasa a ser "la primera gana" y se dice en su doc |
| `edgeHitTest.ts:111-153` | no filtra `hiddenLayerIds` | **arreglado** por el mismo cambio: solo recibe dibujables |
| `edgeHitTest.ts:111-153` | no mira `piece.locked` / `layerLocked`: el clic al cuerpo escribe el margen de una pieza bloqueada; el arrastre de tramo sobre su borde también (`addEdgeSeamAllowanceSpan` sin guarda); y el panel también | **NO aquí** — bypass del candado con vida propia: **#1136** (reproducido el 2026-09-02: cuerpo → 9,5; panel → 33; el arrastre lo añadió la revisión). Lo que sí: el chip sobre una pieza bloqueada sale `aria-disabled`, para que la promesa sea honesta aunque la escritura todavía mienta |

### 5.4 El sujeto: `cotasDelSujeto` gana una rama y una salida

`SujetoInput` gana `saSelection`, `saAncla`, `saHover`. `Sujeto` gana `lectura: Cota | null` (el chip de hover; `null` en toda rama que no sea esta). La rama `activeTool === 'seamAllowance'` va **primera** (en esta herramienta el sujeto es el margen, nunca una interna colgante):

```
si isDragging || contextMenuOpen || calibrationActive → nada
ancla = saSelection.kind === 'edge' && items.length === 1 && saAncla coincide con items[0] → saAncla; si no → null
cotas   = ancla viva (pieza y borde existen, capa visible) ? [cotaDeMargen(piece, edge, ancla.t)] : []
lectura = saHover viva (pieza y borde existen, capa visible) ? cotaDeMargen(piece, edge, hover.t) : null
          y null si su { edgeId, fuente, spanIndex } coincide con la cota anclada
disabled       = candado (piece.locked || layerLocked[capa]) de la pieza del ANCLA
lecturaApagada = candado de la pieza LEÍDA          (dos chips, dos piezas posibles, dos candados — revisión 02-09)
bordeLeido     = { pieceId, edgeId } de la lectura que pasó las compuertas — alimenta el resalte aunque el chip se suprima
lineaDeSujeto  = ancla ? 'Editando: este borde' : null   (el mockup C3; "el margen del borde" repetía "margen" tres veces en la tira)
```

Las cinco compuertas existentes se heredan sin código nuevo.

### 5.5 `cotaDeMargen(piece, edge, t)` — `src/components/PatternEditor/cotas/cotaDeMargen.ts`

Devuelve `Cota | null` (`null` si el anillo no se construye). Campos: `id: 'margen:<pieceId>:<edgeId>'` (estable: el botón no se remonta al cambiar el valor), `kind: 'margen'` (nuevo en la unión), `label: 'Margen · <edge.name>'`, `valueMm`, `unit: 'mm'`, `min: 0`, `max: 100` (el del panel, que edita el mismo dato), `primary: fuente !== 'pieza'`, `rotulo` (nuevo campo opcional de `Cota`): `'de la pieza'` | `'del tramo'` | `undefined`, `scrub: false` (nuevo campo opcional; ausente = `true`), `a = b = punto`, `outward`, `apply(mm)` → `{ kind: 'margen', pieceId, edgeId, fuente, spanIndex?, width: mm }`.

`margenEnPunto` vive en `src/utils/seam/margenEnPunto.ts` (pura, sin anillo).

### 5.6 `aplicarCota` gana la tercera rama

`CotaUpdate` gana `{ kind: 'margen'; pieceId; edgeId; fuente; spanIndex?; width }`. En `PatternEditor.tsx:681`: liveness (pieza y borde existen; con `tramo`, el `spanIndex` existe); `tramo` → `updateEdgeSeamAllowanceSpan({ ..., span: { ...span, width } })`; `borde`/`pieza` → `setEdgesSeamAllowance({ items: [{ pieceId, edgeId }], width })`. Acción `project/*` = una entrada de deshacer. La bitácora de `cota:commit` gana `kind` y `prev`.

### 5.7 La capa y el chip

- `CotasLayer` gana la prop `lectura?: Cota | null` y la pinta como `<div className="cota cota--lectura [cota--hueca]" aria-hidden="true" data-rotulo=… style={{left, top}}>` en `chipScreenPosition(lectura)`; y el método imperativo `abrirPrimero(): boolean` (= `focusFirst()` + `click()` — el truco que ya usa el Tab entre chips).
- `CotaChip`: `data-rotulo={cota.rotulo}` en botón e input; con `cota.scrub === false` no arma scrub en `pointerdown` y lleva `cota--sin-scrub` (`cursor: text`).
- `cotas.css` (tras la revisión de Iris Tane, 02-09): `.cota--lectura { pointer-events: none; cursor: default; opacity: .8; box-shadow: none }` — **la lectura pesa menos que el anclado** por opacidad y sombra, no solo por tono (contrato § 4; dos chips rellenos eran idénticos); `.cota--sin-scrub { cursor: pointer }` (no `text`: un botón no tiene texto que seleccionar); el rótulo `.cota[data-rotulo]::before` en `--font-ui-2d` a 11 px con tinta **`--ink-on-light-2`** (4,6:1 sobre el papel; el acento daba 2,7:1) y **del lado de fuera**: arriba por defecto, `[data-lado='abajo']` → `top: calc(100% + 2px)` cuando `outward.y > 0` (en un borde inferior el rótulo se pintaba encima de la línea de corte); `.cotas:has(.cota--editando) .cota--lectura { display: none }`. `CotaLines` **no** pinta hilo ni ticks para `margen` (con `a = b` quedaban bajo el chip). Todo por tokens; R3/R5/R8 no suben.

### 5.8 El resalte del borde en hover

`SeamAllowanceSelectionOverlay` gana `hoverEdge?: { pieceId; edgeId } | null` y pinta la misma polilínea del trazo con `data-testid="sa-edge-hover"`, grosor `2.5/zoom` y `opacity .55` (la selección: `4/zoom`, opacidad 1 — **seleccionado > hover** por grosor y por tono, contrato § 4). No se pinta si el borde ya está seleccionado.

### 5.9 Copy (solace-wren, 2026-09-01)

| Sitio | Antes | Ahora |
|---|---|---|
| pista del panel (`EdgePropertiesSection.tsx:234`) | `Heredado de la pieza` | `Este borde usa el margen de la pieza` / plural `Estos bordes usan el margen de la pieza` |
| botón cero (`:251`) | `Sin margen (0)` | `Sin margen` — el `(0)` era la mitad de la confusión: con la pieza en 0 los dos botones decían `(0)` |
| botón volver (`:245`) | `Usar el de la pieza (9,5)` | igual |
| chip | — | solo el número; encima `de la pieza` / `del tramo` |
| pista del lienzo (`HintText.tsx:118`) | `Clic en una pieza aplica X mm · arrastra sobre varias para aplicarlo a todas · clic en un borde para su ancho · en una esquina para su tipo` | `Pasa por un borde para leer su margen · clic para escribirlo · pieza entera: 9,5 mm · esquina: su tipo` — más corta (la pista va centrada y en Split se recorta por los dos extremos) y con coma decimal (`formatMedida`); el botón `Usar el de la pieza (9,5)` también |
| tira | `Margen del próximo clic` | **no se toca** (decisión de diseño) |
| glosario `docs/specs/2026-07-16-ui-copy-es-glosario.md` | — | regla 6: «heredar/heredado» prohibido en copy visible, con la cita [25:01] |

Y `grep -rin hered src/` sobre cadenas visibles tiene que quedar en cero al cerrar (los comentarios de código no cuentan).

## 6. Decisiones que Petra dejó abiertas, tomadas

| Decisión | Qué se hace | Por qué |
|---|---|---|
| **El clic en el borde roba el teclado** (hay un campo enfocado: `s` escribe una `s`) | **Se acepta.** Un Escape devuelve el teclado; Enter también (el foco vuelve al botón, desde donde los atajos funcionan) | Es su pedido literal y el mockup C3 aprobado. Palanca si mide mal con ella: clic → chip anclado en reposo con foco, Enter abre (una tecla más) |
| **Dos editores del mismo número** (el panel se auto-abría en `PatternEditor.tsx:282` y el chip edita) | **El borde deja de abrir el panel** (la esquina sí: su tipo no tiene otra puerta). Si el panel ya está abierto, se actualiza igual | **Medido en las capturas de la entrega 33 (2026-09-02):** al clicar el borde, el panel se abría, empujaba el lienzo ~320 px a la derecha y el chip recién abierto —con el foco— quedaba bajo la tira. Un clic que mueve lo que acabas de clicar rompe "clic → escribe". "Usar el de la pieza" y los tramos siguen en el panel, que María abre cuando quiere |
| **Scrub en el chip de margen** | **Fuera**: `scrub: false`, `cursor: text`; ↑/↓ (±1 / Shift ±10 / Alt ±0,1) sí | La ganancia de `CotaChip` está calibrada para 100-3000 mm; un margen vive en [0, 50] y Shift recorrería el rango en 5 px. Una segunda escala rompería "una sola escala" (30-08 § 5.3) |
| **Resalte del contorno al pasar por el cuerpo** (Petra § 2.1) | **Fuera en esta tanda** | Es una adición de Petra, no una frase de María; y María ya pidió quitar una iluminación persistente (maria-207). Vuelve si pregunta qué hace el clic en el cuerpo |
| **Desvanecido al quitar el ratón** | **Fuera** (desmontaje instantáneo) | Requiere conservar el último chip y un temporizador. "Vaya desapareciendo según quito" se cumple con que se vaya |
| **`sa:chip:descarta` en la bitácora** | **Fuera** | El input detiene la propagación y CF-1 ignora targets editables: no hay puerta donde registrarlo sin tocar `CotaChip`. Se infiere: `sa:chip:abre` sin `cota:commit` |

## 7. Lo que se toca (archivos)

| Archivo | Cambio |
|---|---|
| `src/utils/seam/edgeHitTest.ts` | memo `WeakMap` del aplanado + caja; rechazo por caja en el pase 1; doc del contrato "la primera gana" |
| `src/utils/seam/margenEnPunto.ts` (nuevo) | la cascada de tres fuentes |
| `src/components/PatternEditor/gestureConstants.ts` | `VERTEX_HIT_PX = 10` |
| `src/components/PatternEditor/edgeArc.ts` (nuevo) | `edgeSpanMm`, `edgeTForPoint`, `edgePointAtT` (movidas desde el hook) |
| `src/components/PatternEditor/useSeamAllowanceTool.ts` | `active`, dibujables invertidas, `hover`, `ancla`, `abrirChip`, `limpiarHover`, bitácora `sa:hover` |
| `src/components/PatternEditor/cotas/cotas.ts` | `kind: 'margen'`, `rotulo?`, `scrub?`, `CotaUpdate` margen; `normalHaciaFuera` exportada |
| `src/components/PatternEditor/cotas/cotaDeMargen.ts` (nuevo) | la cota |
| `src/components/PatternEditor/cotas/sujeto.ts` | rama `seamAllowance`, `lectura` |
| `src/components/PatternEditor/cotas/CotasLayer.tsx` | `lectura`, `abrirPrimero()` |
| `src/components/PatternEditor/cotas/CotaChip.tsx` | `data-rotulo`, `scrub: false` |
| `src/components/PatternEditor/cotas/cotas.css` | cuatro reglas (§ 5.7) |
| `src/components/PatternEditor/renderers/overlays/SeamAllowanceSelectionOverlay.tsx` | `hoverEdge` |
| `src/components/PatternEditor/useEditorInteractions.ts` | `handleMouseLeave` (un suscriptor); `limpiarHover` en el botón 1; tipo del tool |
| `src/components/PatternEditor/PatternEditor.tsx` | `drawablePieces` sube; hook con `active` y dibujables; `sujeto` con `saSelection/saAncla/saHover`; tercera rama de `aplicarCota`; efecto `abrirChip`; `onMouseLeave` en el `<svg>`; `lectura` y `hoverEdge` a sus capas |
| `src/components/PatternEditor/renderers/HintText.tsx` | pista nueva |
| `src/components/PropertiesPanel/EdgePropertiesSection.tsx` | pista y botón (§ 5.9) |
| `docs/specs/2026-07-16-ui-copy-es-glosario.md` | regla 6 |
| `docs/superpowers/specs/2026-08-30-cotas-vivas-design.md` | § 11: la fila de márgenes apunta aquí |

## 8. La red (TDD: los tests los escribe Claude, la implementación va por codex en sandbox con el hash de los tests verificado)

### 8.1 Unitarios

- `margenEnPunto`: tramo > borde > pieza; `t` en la frontera (`t === tEnd` cae fuera, salvo `t = 1` con `tEnd = 1`); `0` propio del borde es `borde`; pieza sin `seamAllowance` → `0 pieza`.
- `edgeHitTest`: la primera pieza del arreglo gana en solape; 100 llamadas sobre el mismo contorno → 1 aplanado; una pieza lejos del punto no se aplana. Los tests existentes siguen en verde.
- `cotaDeMargen`: campos por fuente (hueco/relleno, rótulo), `a = b` sobre el borde en `t` (pieza en (0,0) y pieza girada 90°: en espacio de patrón), `outward` apunta lejos del centro, `scrub === false`, `apply` devuelve el `CotaUpdate` correcto con `spanIndex` para tramo.
- `sujeto` (rama nueva): ancla + selección única → 1 cota; Shift N ≥ 2 → 0; vértice → 0; ancla que no coincide con la selección → 0; hover → `lectura`; hover sobre la misma fuente del ancla → `lectura` null; hover sobre un tramo del mismo borde anclado en `pieza` → `lectura` presente; capa oculta → nada; bloqueada → `disabled`; las cinco compuertas; con otra herramienta y `saHover` puesto → `lectura` null.
- `CotasLayer`: `lectura` pinta `div.cota--lectura[aria-hidden="true"]` (no un botón) con `data-rotulo`; `abrirPrimero()` deja un `input.cota--editando` y devuelve `true`; `false` sin chips o deshabilitada.
- `CotaChip`: `scrub: false` → `pointerdown` + 10 px no llama `onScrubStart` y lleva `cota--sin-scrub`; `data-rotulo` en botón e input.
- `useSeamAllowanceTool` (renderHook + store): `mousemove` sobre el borde → `hover`; fuera → `null`; `mousedown` limpia; `limpiarHover()`; cambiar `zoom` con el puntero quieto re-resuelve; clic → `ancla` en `press.t` y `abrirChip + 1`; arrastre → `ancla` en el punto medio y `abrirChip` igual; `active = false` → todo `null`; con dos piezas encimadas gana la última del arreglo de dibujables.
- `PatternEditor` (integración, el patrón de `seamAllowanceExactWidth.test.tsx`): `mouseMove` sobre el borde → `.cota--lectura` con "10 mm" y `de la pieza`; `mouseLeave` → se va; `mouseDown`+`mouseUp` en el borde → `input.cota--editando` enfocado; escribir `20` + Enter → `edges[0].seamAllowanceWidth === 20`, el botón queda relleno y sin rótulo; Escape con el foco en el botón → `saSelection` null y sin chip.
- `EdgePropertiesSection`: las cuatro aserciones de "Heredado de la pieza" pasan a la frase nueva; `Sin margen` sin `(0)`.
- `SeamAllowanceSelectionOverlay`: `hoverEdge` pinta `sa-edge-hover` más fino que la selección y no lo pinta si el borde está seleccionado.

### 8.2 E2E (Playwright, navegador de verdad — jsdom no ve layout, foco real ni `:has`)

`tests/e2e/1100-margen-en-el-borde.spec.ts`:

1. **La promesa de María [25:44]:** pieza de 200×150 con `seamAllowance` 0; `O`; el ratón sobre el borde de arriba → `.cota--lectura` visible con `0 mm` y rótulo `de la pieza`; el ratón al centro de la pieza → no hay lectura; el ratón **a la tira** (fuera del `<svg>`) → no hay lectura (#1132, la costura abierta).
2. **Clic escribe en ESE borde (#1100):** clic en el borde → `document.activeElement` es `input.cota--editando`; `20` Enter → el borde tiene `seamAllowanceWidth 20` y la pieza sigue en 0; el chip anclado es relleno y sin rótulo; **una** entrada de deshacer (`Ctrl+Z` lo devuelve a `undefined`).
3. **El teclado vuelve:** tras Enter, `Escape` → `saSelection` null y sin chip; `s` → la herramienta cambia a rectángulo.
4. **Zoom con el puntero quieto:** con la lectura visible, rueda → el chip sigue al borde (su `left/top` cambian con el zoom y siguen a 18 px del borde proyectado).
5. **Techo de dos y borrador intocable:** clic en un borde (edición abierta) → el ratón sobre otro borde → `.cota--lectura` **oculta** (`toBeHidden`); Escape → ahora sí visible sobre el otro borde; los dos chips a la vez con el anclado en reposo.

### 8.3 Gates

`npx tsc -b --noEmit && npm run test && npm run lint && npm run lint:ui`, y los e2e nuevos contra el servidor caliente (memoria `e2e-vina-servidor-caliente-y-pocos-workers`). Después, `codex review` sobre el diff y verificación en navegador con capturas antes/después para la entrega 32.

## 9. Lo que no entra (dicho, con su tanda)

| Fuera | Por qué | Cuándo |
|---|---|---|
| Ver todos los márgenes a la vez | densidad: cientos de chips en un DXF real, regla de colapso propia | **#1135** |
| Cerrar #1132 completo (los ~20 hovers) | plomería compartida con su propio riesgo; aquí se abre la costura con un suscriptor | su tanda, con e2e por herramienta |
| Arreglar el bypass del candado en el clic al cuerpo | bug de escritura, no de gramática | issue propio |
| Chip vivo durante el arrastre de tramo | cuarto papel del chip y overlay nuevo | si María lo pide (barato) |
| Chip sobre el cuerpo o sobre el vértice | el cuerpo es ruido constante; la esquina no tiene ancho | no |
| Quitar la promoción desde el chip (volver a "de la pieza") | `parseMedida('')` es inválido por regla; la escotilla es "Usar el de la pieza" en el panel | si María la pide en el lienzo, con nombre |
| Ctrl+clic para atravesar al borde de abajo | apilar piezas es raro en patronaje; Alt ya es paso fino | cuando el solape se mida como problema |
| Tocar la tira | decisión tomada | — |

## 10. Dónde este spec se aparta del informe de Petra

1. **Sin resalte del contorno al pasar por el cuerpo** (§ 6). 2. **Sin desvanecido** (§ 4.5). 3. **Sin `sa:chip:descarta`** (§ 6). 4. La supresión "mismo borde" se afina a "misma fuente y mismo tramo" (§ 4.4) para que un borde con tramos siga leyéndose entero. 5. `cursor: pointer` en vez de `cursor: text` en el chip de margen (Iris: un botón no tiene texto que seleccionar). 6. El borde **no** abre el panel al clicar (§ 6, medido). Todo lo demás es su gramática.

## 11. Registro de revisión

### 11.1 Implementación (codex `ultra`, sandbox `workspace-write`, 66 min, 203 comandos — el último codex en vina: Samuel pidió "puro opus a partir del próximo")

Tests intactos (hash antes = hash después). Tres reparos a los tests de Claude, los tres ciertos: dos aserciones fuera de `act` y un import sin uso. Un aviso de navegador que resultó cierto: `input::before` no se pinta (elemento reemplazado) — en edición el rótulo no se ve, y eso coincide con el mockup C3.

### 11.2 Revisión adversarial (cuatro agentes Opus, lentes disjuntas, 2026-09-02)

| Quién | Hallazgo | Qué se hizo |
|---|---|---|
| **Claude (diff a mano)** | codex congelaba `t` mientras la fuente no cambiara: el chip no seguía al cursor. Mi propio test de la guarda se lo pedía mal | el chip sigue al cursor (§ 5.1); test corregido |
| Claude (capturas "después") | al clicar el borde el panel se abría, empujaba el lienzo ~320 px y el chip abierto quedaba bajo la tira | el borde no abre el panel (§ 6) |
| **Vex Rune** | `cotaDeMargen` reconstruía el anillo dos veces por movimiento (la tormenta del § 5.2, dos archivos más allá) | un solo anillo por contorno, `ringForOutline` en `edgeArc.ts`, compartido por hook y cota |
| Vex | `hasNearbyAnchor` duplicaba el predicado del bucle; el test pedía "exactamente 1 aplanado" (medía la implementación) | fuera; el test fija "no aplana más que la primera vez" |
| Vex | `setHoverResuelto` re-buscaba pieza y borde; dos refs que eran una; `SeamAllowanceAnchor` declarado dos veces; `edgeSpanMm` copiada en `usePointTool`; rama muerta de `computeBoundingBox`; deps redundantes | todo cortado (−60 líneas netas) |
| **Iris Tane** | el rótulo iba siempre arriba: en un borde inferior se pintaba encima de la línea de corte | `data-lado='abajo'` cuando `outward.y > 0` (§ 5.7) |
| Iris | lectura y anclado idénticos con dos chips rellenos (contrato § 4) | `.cota--lectura { opacity: .8; box-shadow: none }` |
| Iris | el acento a 10 px daba 2,7:1 sobre el papel | rótulo en `--ink-on-light-2` (4,6:1), 11 px |
| Iris | `cursor: text` en un botón; `Editando: el margen del borde` repetía "margen" tres veces; `9.5` con punto en la pista y en el botón; hilo de cota de largo 0 bajo el chip | `cursor: pointer`; `Editando: este borde`; `formatMedida` / coma; `CotaLines` sin `margen` |
| Iris / Serrano / Halberg (los tres) | `disabled` era una sola bandera para dos chips de piezas distintas: la lectura sobre una pieza bloqueada salía viva si el ancla era libre, y al revés | `lecturaApagada` aparte de `disabled` (§ 5.4) |
| **Serrano** | el hover revivía con el botón abajo cuando el press no armó gesto (esquina, vacío) | `presionado` en el hook (§ 4.5 #5) |
| Serrano | el resalte del borde iba directo del hook al overlay, sin las compuertas del sujeto (quedaba encendido bajo el menú contextual) | `hoverEdge = sujeto.bordeLeido` |
| Serrano | la "tolerancia conocida" del § 3 nombraba un mecanismo que ya no existe | § 3 reescrito (cuerda vs arco) |
| Serrano | el arrastre de tramo también escribe en una pieza bloqueada | añadido a #1136 |
| Serrano | `pointercancel` no apagaba la lectura; «hereda» seguía en una descripción del copiloto | `cancel()` limpia el hover; `layerTools.ts` reescrito |
| **Halberg** | `resolveHover` filtraba por `phase` (estado, un render atrasado) y no por `isArmed()` (ref) — funcionaba por accidente de deps | guard por ref; `isArmed` con identidad estable en `useEdgeGesture` |
| Halberg | `presionado` se quedaba pegado tras `pointercancel` sin gesto armado: el router solo cancelaba si `isArmed()` | el router cancela siempre con Margen activa |
| Halberg | `flattenPath` del overlay por render; etiquetas de deshacer sin traducir para los tramos | memo por contorno; etiquetas añadidas |
| Halberg | el árbol cambió mientras se revisaba | el gate completo se corrió desde cero sobre el árbol final (§ 8.3) |

**Conocido y no arreglado (dicho):** la normal hacia fuera sale del pivote de la caja y en una pieza cóncava puede apuntar hacia dentro (heurística heredada de las cotas de interna); `ultimoPuntero.rect` envejece si un panel se abre por teclado y se gira la rueda sin mover el ratón; dos Enter en < 500 ms comparten una entrada de deshacer (coalescencia global del `undoMiddleware`); el filtro de dibujables vive copiado en cuatro sitios; y `edgeTForPoint` clampea al extremo cuando la proyección global cae en otro borde (misma conducta que el arrastre de tramo).
