# Arrastre unificado en el editor 2D — y el sistema de coser completo

**Fecha:** 2026-08-11
**Tarjetas de María:** #221 (nota madre), #199 (tercera ronda), #219, #220 (parte)
**Issues:** #1029 (M-221), #1028 (M-219), #1022 punto 4 (M-199), #1027 parte (M-220)
**Estado:** diseño aprobado por Samuel y por María (2026-08-11). Pendiente de plan de implementación.

---

## 1. Por qué existe este documento

María lleva tres tarjetas describiendo la misma carencia desde tres herramientas distintas. No son tres bugs: es que al editor 2D le falta una forma de decir **cuánto**.

Hoy cada herramienta responde a "dónde" (un clic) y nada responde a "cuánto", salvo escribiendo en un panel que ella no abre. El arrastre es la respuesta natural porque tiene principio y final: **es** un intervalo.

Su nota madre (#221, literal):

> "Necesito que el majo de editar y añadir cosas a una linea, costura, márgen de costura punto, punto de curva, piquete, que se pueda arrastrar el tramo que uno quiere, en el caso de crear un piquete o punto, que son acciones en las que se crea algo en un solo punto de la pieza, pues al arrastrar creas la distancia a la que quieres crear lo que sea desde el punto que clicas y arrastras, y en el caso de costuras, margenes de costuras, al arrastrar también seleccionas el tramo que llevara ese margen o costura."

Ella ya separó las dos familias sola. El diseño no hace más que formalizarlas.

### 1.1 Tres hallazgos del código que enmarcan el diseño

Verificados contra el árbol el 2026-08-11:

1. **No existe `useSeamTool`.** La herramienta "Coser" que María usa (`B`) y `freesewing` son el mismo hook (`useFreeSewingTool`), instanciado dos veces en `PatternEditor.tsx:199` y `:312`. `freesewing` no es "coser libre": es el mismo hook con `mode:'point'` (snap a vértices). Anuncia el Free Sewing de CLO y entrega otra cosa.

2. **`tool.seam` está atado a `B` con la etiqueta `'Edit Sewing (Seam)'`** (`src/shortcuts/defaults.ts:66`) y su comportamiento es *crear*. La colisión del #219 está escrita, literal, en una línea de código.

3. **No existe superficie de opciones de herramienta.** Ningún componente renderiza `ToolDefinition.options`; el único consumidor es `src/tools/copilotSchemas.ts:121`, que las convierte en parámetros del copiloto. `setToolOption` se despacha desde exactamente dos sitios (`useSlashAndSpreadTool.ts:501` y `PieceProperties.tsx:34`, este último solo para `notch`). Consecuencia directa: **este diseño no puede apoyarse en chips de modo**, porque no hay dónde colgarlos. Ver issue #1049.

### 1.2 El patrón de fondo

Tres casos de *existe pero no se alcanza* encontrados el mismo día:

| Qué | Existe | Puerta de María |
|---|---|---|
| `segmentSewing` cose tramos parciales de verdad | sí, desplegado | ninguna — no está en el dock, solo tecla `N` sin documentar |
| Resaltar las dos mitades de una costura | sí, con color de par estable y halo | ninguna — el tool de coser nunca rutea a `selectSeam` |
| Los 3 modos del tool Punto | sí, testeados | ninguna — no hay UI que escriba `toolOptions.point.mode` |

El diseño ataca los dos primeros. El tercero queda en #1049.

---

## 2. La ley

> **El press manda el OBJETO. El release manda el VALOR.**
>
> Soltar sin haberse movido = "esto entero".
> Soltar habiéndose movido = "esta cantidad, medida desde donde apreté".

Dos lecturas del valor, según la familia del objeto:

| Familia | Objetos | Valor que produce el arrastre | Dónde ya vive el dato |
|---|---|---|---|
| **DISTANCIA** | punto, punto de curva, piquete | arco en mm desde la referencia hasta el release | `NotchAnchor { refPoint, direction, distanceMm }` — `src/types/types.ts:248-252` |
| **TRAMO** | costura, margen de costura, pespunte | `[tStart, tEnd]` en arco del borde | `SeamHalfRange { tStart?, tEnd? }` — `src/utils/seam/seamRange.ts:19-22` |

**No hay modelo de datos nuevo.** Ambos destinos existen y están testeados. Lo que falta es que el gesto los alcance: hoy el `t` se calcula en casi todas las rutas de proyección y se descarta (`findClosestEdge` lo devuelve y la costura solo guarda `edgeName`).

---

## 3. La gramática

### 3.1 Matriz del borde, por herramienta

Radio de enganche de borde: **12 px** en todas (hoy hay 8/12/15/20 dispersos; se unifican, ver §7).

| Herramienta | clic (< 4 px) | arrastre (≥ 4 px) | Shift+clic | Alt+arrastre | clic derecho |
|---|---|---|---|---|---|
| **Coser** (crear) | borde entero → mitad A/B | **tramo** `[tStart,tEnd]` → mitad A/B | — | tramo simétrico desde el press | menú de pieza (global) |
| **Editar costuras** | selecciona la costura de ese borde | *(diferido: arrastrar los extremos)* | — | — | menú `seam` existente |
| **Margen** — borde | selecciona el borde (hoy) | **marca el tramo del margen** | añade al multi-select (hoy) | — | menú + "Ancho exacto…" |
| **Margen** — vértice | selecciona vértice (hoy) | *(vacía a propósito)* | — | — | menú |
| **Margen** — cuerpo | aplica ancho por defecto (hoy) | aplica a todas las que cruces (hoy) | — | — | menú de pieza |
| **Piquete** | piquete donde clicas (hoy) + modal | **piquete a X mm de la referencia** | — | par simétrico | menú + "Distancia exacta…" |
| **Punto** | punto donde suelta (hoy) | **punto a X mm de la referencia** | — | — | menú `point.segment` (hoy) |
| **Seleccionar** | seleccionar pieza (hoy) | mover pieza / marquee (hoy) | multi (hoy) | — | menú (hoy) |
| **Pluma / PolyPen** | nodo esquina (hoy) | manejador bezier (hoy, sin umbral) | — | — | menú |
| **Editar patrón / curva** | selecciona nodo (hoy) | mueve nodo (ahora con umbral) | multi (hoy) | — | menú (hoy) |

Celdas vacías declaradas a propósito: **el doble clic no gana ningún significado nuevo**. El único que existe hoy (`select` → editor de nodos, `useEditorInteractions.ts:502-521`) se queda intacto. **Rueda, botón medio y `Espacio` no se tocan.**

### 3.2 La familia DISTANCIA

**Resolución de la referencia, en el press, por prioridad:**

1. Punto **nombrable** a ≤ 12 px del press: esquina del contorno, punto existente, piquete existente, extremo de un tramo cosido.
2. Si no hay ninguno: **el extremo más cercano del borde apretado**, medido por arco.

Una distancia medida desde un punto anónimo de una curva no es una cantidad de patronaje: no se re-deriva, no se re-edita, y el ancla se rompe en cuanto el contorno se mueve. `computeNotchAnchor` (`useNotchTool.ts:113`) ya escoge la esquina más cercana; lo que cambia es que **ahora la escoge ella con el press, y la ve**. La caída al extremo del borde es visible: el anillo de referencia salta ahí antes de que mueva un píxel.

**Dirección:** la fijan los primeros 4 px de recorrido proyectados sobre el borde → `NotchAnchor.direction: 'cw'|'ccw'`.

**Valor:** distancia de **arco** desde la referencia hasta el release, siguiendo la curva, en mm. Nunca la cuerda. En una sisa la cuerda miente y María lo notaría a la primera (es exactamente el bug del #1026).

**Feedback durante el arrastre** (los cinco simultáneos):

| Señal | Qué es | Latencia |
|---|---|---|
| Anillo de referencia | en `refPoint`, aparece en el press | ≤ 100 ms |
| Arco recorrido | borde resaltado grueso de referencia a cursor, siguiendo la curva | ≤ 16 ms |
| Número | mm con **un decimal**, a 12 px del cursor | ≤ 16 ms |
| Fantasma del objeto | glifo del piquete/punto en la posición proyectada | ≤ 16 ms |
| — | **cero redondeo automático**: 47,3 no se vuelve 47 solo | — |

**El movimiento perpendicular al borde no cuenta.** Solo la proyección a lo largo del borde mueve el número.

**El modal de precisión del piquete** (`useNotchTool.ts:183-194`) **deja de abrirse tras un arrastre.** Se abre solo en la ruta de clic, donde la posición fue una adivinanza, igual que hoy. Tras un arrastre ella ya dijo la distancia con la mano. El número sigue disponible en el objeto (clic derecho → "Distancia exacta…" y el panel).

### 3.3 La familia TRAMO y el choque del margen

Los dos arrastres de `seamAllowance` ya conviven hoy y el discriminante ya está escrito: `useSeamAllowanceTool.ts:68-73` decide por lo que pisó el mousedown y nunca arma drag desde vértice o borde. Este diseño formaliza esa precedencia y le añade una rama.

**Precedencia de hit-test en el mousedown de `seamAllowance`** (px de pantalla, gana el primero):

```
1. VÉRTICE   ≤ 10 px  → selecciona vértice       · drag DESHABILITADO      (hoy, :64)
2. BORDE     ≤ 12 px  → arma EDGE-SPAN drag      · < 4px = selecciona borde (hoy, :65)
3. CUERPO    dentro   → arma BODY drag           · < 4px = aplica a la pieza (hoy, :77-85)
4. VACÍO              → nada
```

**Invariante que mata la ambigüedad:**

> El objetivo del mousedown es dueño del gesto hasta el mouseup. La posición posterior del cursor nunca lo re-apunta.

Un body-drag que después pasa por encima de un borde sigue siendo body-drag. Un edge-drag que se sale de la pieza sigue clavado a ese borde. Los dos orígenes están a 12 px por construcción: no pueden contender.

Esto reconcilia además la excepción de `point` ("el release manda", `usePointTool.ts:146`): el press manda el **borde**, el release manda **dónde a lo largo de él**. En el caso sub-umbral ambos puntos están a < 4 px, así que el comportamiento de hoy es idéntico.

**Forma del cursor:** vértice → esquina · borde → tramo · cuerpo → `copy` · sin objetivo → `not-allowed`. **El cursor no cambia durante el arrastre**: el número es el feedback, y una forma que muta a mitad de gesto es ruido.

### 3.4 Soltar fuera

| Dónde suelta | Familia TRAMO | Familia DISTANCIA |
|---|---|---|
| Más allá del extremo del borde | `t` clampeado a 0 ó 1 | distancia clampeada al largo del borde |
| Fuera de la pieza | clampeado al borde del press | igual |
| Sobre otro borde de la misma pieza | clampeado al borde del press. **No cruza la esquina.** | igual |
| Sobre otra pieza | clampeado al borde del press. La otra pieza no se toca. | igual |
| Fuera del lienzo | `setPointerCapture` en el press → el `pointerup` llega igual | igual |

El "no cruza la esquina" no es gusto: **`Seam` almacena una mitad por borde semántico** (`edgeName` + `tStart`/`tEnd`). Un tramo multi-borde no tiene representación. Se cosen dos costuras, que es lo que hace CLO3D con Segment Sewing.

El `pointerup` fuera del lienzo es un bug hoy: `useSeamAllowanceTool.ts:58-61` tiene un comentario describiéndolo y un parche local. Se arregla una vez, con captura de puntero, para todos los gestos. `pointercancel` equivale a Escape.

### 3.5 El clic derecho y los milímetros

**El menú no se reparte.** El dueño sigue siendo uno solo (`PatternEditor.tsx:380`); las herramientas ganan **filas**, no propiedad. Ninguna herramienta ve el botón 2, igual que hoy.

| Momento | Qué hace el botón derecho |
|---|---|
| Durante el arrastre | **cancela el gesto y suprime el menú de ese evento.** Nada más. Un menú a mitad de gesto obliga a navegarlo con el botón izquierdo apretado: un cuasi-modo dentro de otro. |
| Justo tras soltar | nada especial. El objeto ya está creado y **seleccionado**; el número vive en el panel. |
| Sobre el objeto ya creado | el menú de siempre con una fila nueva por tipo: `il.notch` → "Distancia exacta…" · `seam` → "Rango cosido…" · fila SA nueva → "Ancho exacto…". |

Filas nuevas en la tabla `CURATION` (`actionCuration.ts:286-325`), más una extensión del hit-test en `PatternEditor.tsx:452-509` para resolver "borde de margen" cuando la herramienta activa es `seamAllowance`. Cero arquitectura nueva.

**El número también está sin clic derecho**, en el panel del objeto seleccionado. El botón derecho es el acelerador, no la única puerta.

**Unidad:** `SeamPropertiesPanel.tsx:57-78` edita el rango en **%** y muestra cm. María piensa en mm. El campo pasa a leer y escribir **mm**; el % se queda como forma almacenada. `sewnLengthMm` ya calcula la conversión (`seamRange.ts:104`). El texto exacto lo escribe la skill `solace-wren`.

---

## 4. Las máquinas de estado

### 4.1 Gesto de Borde (genérico: coser, margen, piquete, punto)

```
IDLE
 ├─ pointerdown sobre objetivo válido ──────────────► ARMED {target, pressT, refPoint}
 │        · anillo de referencia visible ≤100ms · setPointerCapture
 │
ARMED
 ├─ pointerup, recorrido < 4 px ────────────────────► COMMIT_CLIC ──► IDLE
 ├─ pointermove, recorrido ≥ 4 px ──────────────────► DRAGGING
 ├─ Escape | pointercancel | botón derecho ─────────► IDLE  (nada se commitea)
 │
DRAGGING     (se reconoce por: arco resaltado + número en mm junto al cursor)
 ├─ pointermove ───────────────────────────────────► DRAGGING (readout ≤16 ms)
 ├─ pointerup, |Δt| ≥ 0.01 ─────────────────────────► COMMIT_ARRASTRE ──► IDLE
 ├─ pointerup, |Δt| < 0.01 ─────────────────────────► COMMIT_CLIC ──► IDLE
 └─ Escape | pointercancel | botón derecho ─────────► IDLE  (nada se commitea)
```

Tres cláusulas que no son adorno:

- **Soltar bajo umbral nunca es "no pasó nada".** Es el clic, con su significado de hoy.
- **`|Δt| < 0.01` degenerado cae al CLIC, no al vacío.** Cruzó 4 px de pantalla pero la proyección colapsó (arrastró perpendicular). Hoy ese caso es un clic muerto en `segmentSewing`: `closeSegment` devuelve `null` (`:202`) y la fase no avanza, sin decir nada. `MIN_SEGMENT_T = 0.01` ya existe (`:181`) y se reusa.
- **No hay temporizador de pulsación.** Un press quieto tres segundos y soltado sigue siendo un clic. Los temporizadores son modos invisibles, y una patronista se detiene a mirar a mitad de gesto.

**Un gesto = una entrada de deshacer.** Los arrastres commitean una sola vez en el mouseup; `batchUndo` y `withUndoBatchToken` ya existen.

### 4.2 Coser (crear) — dos estados, no cinco

```
IDLE
 ├─ Gesto de Borde commitea ──► HOLDING_A   (mitad A gruesa + extremos marcados)
 │
HOLDING_A
 ├─ Gesto de Borde sobre OTRA pieza ──► addSeam + selectSeam ──► IDLE
 ├─ clic en vacío | Escape ───────────► IDLE  (se suelta la mitad A)
 └─ gesto sobre el MISMO tramo ───────► ignorado, el hint dice por qué
```

Sin `Enter`. Sin `Backspace`. Sin enum de cuatro fases. **La costura se cierra en el release del segundo gesto, idéntico al flujo de dos clics de hoy** (`useFreeSewingTool.ts:64-73`). La memoria muscular de María para coser bordes enteros queda byte a byte igual; lo que gana es que el mismo gesto, arrastrado, cose tramos.

**Qué sobrevive y qué muere de `useSegmentSewingTool.ts` (446 líneas):**

| Sobrevive (geometría pura, ya testeada) | Muere |
|---|---|
| `snapToEdge` (:53-116), `snapToAnyEdge` (:118-146) | `type Phase` + `SegmentSewingState` (:39-47) |
| `commandTToEdgeT` (:161-178) — **única ruta del repo que convierte cursor → `t` en arco de borde** | el `switch` de 4 fases (:325-365) |
| `closeSegment` (:194-214), `closeAgainstPending` (:266-280) | `Enter` para confirmar (:416-424) |
| `segmentToSeamHalf` (:216-233), `buildSegmentSeam` (:247-263) | `Backspace` para retroceder (:399-414) |
| `EDGE_ENDPOINT_SNAP_T`, `MIN_SEGMENT_T` | registro del tool + tecla `N` + hint de 5 fases (`HintText.tsx:54-68`) |

Se borran ~160 líneas, no 446. El módulo pasa de hook a librería geométrica del tool `seam`. **Esa geometría es lo único que hoy sabe hacer lo que María pide.**

Coste para María: **cero**. Ni `segmentSewing` ni `freesewing` están en `DOCK_2D_CATALOG` (`dock2dTools.ts:22-39`). **La definición `seam` en `src/tools/definitions/seam.tsx` se queda viva**: `Sew3DTool.tsx:132` lee `toolOptions.seam.seamType` y romperlo apaga el cosido en 3D.

### 4.3 Crear vs Editar — dos herramientas, como CLO3D

Descartado el chip: no hay superficie de opciones (§1.1). Descartado el modificador: un modo de trabajo no se sostiene con una tecla apretada.

Descartada también la opción sin modos (clic en borde cosido selecciona, clic en borde libre crea), que era la tentadora: **le quitaría la capacidad de coser una segunda costura sobre un borde que ya lleva una** — manga contra dos mitades de sisa, canesú partido. María lo pide explícitamente en #219: *"aunque clique una linea que ya lleva costura volverá a crear una costura nueva"*. **El modo lo exige el oficio, no el software.**

| | **Coser** | **Editar costuras** |
|---|---|---|
| Dock | entrada nueva, junto a la otra | entrada nueva, junto a la otra |
| Tecla | **`N`** (= CLO3D Segment Sewing) | **`B`** (= CLO3D Edit Sewing) |
| Clic en borde libre | empieza/cierra costura | *nada* + hint: "este borde no está cosido" |
| Clic en borde ya cosido | **crea otra costura nueva** | **selecciona esa costura** y enciende la otra mitad |
| Hover | resalta el borde candidato | **enciende las DOS mitades + la línea de unión** |
| Canvas | solo la mitad sostenida; las costuras existentes atenuadas | **todas las costuras a plena señal** |

**Cómo sabe en cuál está sin leer nada:** el lienzo se ve distinto. En Editar las costuras son la capa protagonista; en Coser están apagadas. `SeamRenderer` ya está condicionado a las herramientas de cosido (`PatternEditor.tsx:817`); solo hay que separar los dos regímenes. Más el botón encendido en el dock y la línea del `HintText`.

**Máquina de Editar:**

```
IDLE
 ├─ hover borde con costura(s) ──► preview de ambas mitades   (sin cambio de estado)
 ├─ clic en borde con 1 costura ─► SELECTED(seam)  → abre SeamPropertiesPanel
 ├─ clic en borde con N costuras ► SELECTED(la más cercana al t del clic)
 │
SELECTED
 ├─ clic en el mismo borde ──────► siguiente costura del borde (ciclo), insignia "2 de 3"
 ├─ Delete | Backspace ──────────► removeSeam ──► IDLE
 ├─ Escape | clic en vacío ──────► IDLE
 └─ clic derecho ────────────────► menú `seam` existente
```

**El hueco del #219 es un hit-test, no una feature.** Ya está construido: `.seam-connection:hover .seam-detail` enciende el detalle (`PatternEditor.css:34-42`), `SeamRenderer` ya pinta el sub-tramo parcial, el panel ya edita el rango, el menú ya tiene los verbos (`reverseSeam`, `selectSeamA`, `selectSeamB`). Lo que falla es que hoy hay que acertarle al trazo de 2,5 px de la costura. En modo Editar el objetivo es **el borde a 12 px**, y engancharlo pone `hoveredSeamId`, que alimenta el mismo resalte. Ahí está la diferencia entre *"no siempre me muestra"* y *siempre*.

Ganancia lateral: con una costura seleccionada, `Ctrl+B` (invertir, `defaults.ts:28`) queda alcanzable justo donde CLO lo pone.

**El precio, dicho en voz alta:** `B` cambia de significado. Hoy crea; mañana edita. Decisión de Samuel (2026-08-11): **se paga, a favor de la paridad con las herramientas que María usa a diario.** Mitigado porque las dos entradas viven juntas en el dock y el hint del borde libre nombra la otra herramienta y su tecla.

---

## 5. Convivencia con el clic — cláusula de compatibilidad

> **Todo lo que hoy funciona con un clic sigue funcionando idéntico. El clic es la rama sub-umbral del gesto nuevo.**

| Herramienta | Clic hoy | Clic después | Δ |
|---|---|---|---|
| Coser | borde → mitad A/B (`useFreeSewingTool.ts:54-75`) | igual | ninguno |
| Margen — cuerpo | aplica ancho por defecto (`:114-116`) | igual | ninguno |
| Margen — borde | selecciona borde (`:71-73`) | igual | ninguno |
| Margen — vértice | selecciona vértice (`:69-70`) | igual | ninguno |
| Margen — cuerpo, arrastre | aplica a todas (`:111-112`) | igual | umbral 3→4 px |
| Punto | commitea en el release (`:147-163`) | igual | umbral 3→4 px |
| **Piquete** | commitea en el **mousedown** (`:177-178`) | commitea en el **mouseup** | **+60 ms** |
| Seleccionar | todo (`:600-722`) | igual | umbral 3→4 px |
| Pluma | nodo / bezier (`:141-174`) | igual | ninguno |
| Editar patrón | selecciona / mueve | igual | + umbral, mata micro-movimientos de 1 px |

El único cambio real es el piquete, de commit-en-press a commit-en-release. No es regresión de sensación: el fantasma ya está pintado en el hover, así que el feedback no se retrasa; solo el commit.

**Fuera del alcance del umbral a propósito:** pluma y polyPen. Su arrastre no discrimina clic de arrastre porque ambos resultados son el mismo nodo y difieren solo en el largo del manejador (largo 0 = esquina). Tirar de un manejador 2 px es un ajuste legítimo.

---

## 6. Auditoría de conflictos

| # | Enlace existente | Colisión | Resolución |
|---|---|---|---|
| 1 | Pan con botón medio (`useEditorInteractions.ts:525`) | ninguna (botón 1) | intacto |
| 2 | Rueda zoom/pan (`:445-499`) | rueda durante un arrastre | permitido: el ancla es geométrica, no de pantalla. El umbral es de pantalla y **una vez cruzado no se re-evalúa** |
| 3 | `MIN_DRAG_PX = 3` (`:40`) | dos constantes de 3 px | **una sola global, 4 px** |
| 4 | `DRAG_THRESHOLD_PX = 3` (`useSeamAllowanceTool.ts:11`) | idem | se borra y apunta a la global |
| 5 | Body-drag SA vs tramo de borde | el choque del #220 | precedencia del mousedown (§3.3) |
| 6 | Doble clic → editor de nodos (`:502-521`) | ¿el umbral se come el 2.º clic? | no: sub-umbral sigue siendo clic, y `dblclick` nativo trae su tolerancia. **No re-implementamos la ventana de doble clic** |
| 7 | Escape CF-1 (`:409-426`) | lista cableada de dos casos | generalizar a `anyGestureArmed`; un Esc = una acción |
| 8 | `Escape` = deseleccionar (`defaults.ts:27`) | doble disparo durante un arrastre | resuelto por la captura CF-1; los gestos nuevos se registran igual |
| 9 | `Ctrl+B` invertir costura (`:28`) | ninguna | sinergia: alcanzable en modo Editar |
| 10 | `B` = crear (`:66`) | #219 | pasa a Editar; `N` pasa a Coser |
| 11 | `F` / `Shift+F` freesewing (`:67`, `:72`) | herramienta borrada | teclas **libres, sin reasignar**. No estaban en el dock |
| 12 | `N` = segmentSewing (`:68`) | herramienta borrada | pasa a Coser (= CLO) |
| 13 | Dueño del contextmenu (`PatternEditor.tsx:380`) | ¿lo ve alguna herramienta? | **no.** Filas nuevas, no propiedad. + guard: botón derecho con gesto armado cancela y suprime el menú |
| 14 | `Shift` aditivo en SA (`:73`), `select`, `walkSeam` (`:401`) | Shift también sería modificador de arrastre | **el significado de Shift se fija en el press.** Shift abajo al apretar = aditivo (intacto). Shift apretado *durante* el arrastre = ajusta a mm enteros |
| 15 | `Alt` | libre en 2D (`fitmap.*` es 3D) | tramo/par simétrico |
| 16 | Guard de misma pieza (`useFreeSewingTool.ts:57`) | la enmienda épica-746 ya soporta self-seams en GPU (tubo de manga) | **no se toca en la tanda 1.** Marcado como consecuencia |
| 17 | Ruteo de mouseUp (`:943-957`) | **`seam` y `notch` NO están en la lista** (verificado) | hay que añadirlos, o el gesto no cierra. **Bloqueante de implementación** |

---

## 7. Los números

| Constante | Valor | Por qué ese |
|---|---|---|
| **Umbral de arrastre** | **4 px, euclidiano (`hypot`), pantalla** | `SM_CXDRAG` de Windows vale 4; la mano de María ya está calibrada a ese número por el SO. Los dos 3 px de hoy no notan la diferencia: son gestos que siguen decenas de píxeles |
| ¿Global o por herramienta? | **Global. Una constante exportada.** | El mismo gesto se siente igual en todas partes. Un umbral por herramienta enseña "en esta hay que moverse más". Si una herramienta pide otro número, es olor de diseño |
| Comparación | `≥ 4` es arrastre; `< 4` es clic | dicho para que nadie implemente `>` |
| Enganche de borde | **12 px** | 12 = `eThresh` de SA (`:65`) y `HIT_RADIUS_PX` de `point` (`:50`), ya calibrados contra María. **Unificación PARCIAL — ver el aviso bajo la tabla** |
| Enganche de vértice | **10 px** | el `vThresh` de hoy (`:64`). Menor que el de borde: en una esquina gana el vértice |
| Enganche de referencia (distancia) | **12 px** | mismo radio que el borde: una sola distancia que aprender |
| Tramo degenerado | `|Δt| < 0.01` → cae a CLIC | `MIN_SEGMENT_T` ya existe (`:181`) |
| Colapso a extremo | `t < 0.01` → 0; `t > 0.99` → 1 | `EDGE_ENDPOINT_SNAP_T` ya existe (`:151`) |
| Refresco del número | **≤ 16 ms** (un frame) | el número *es* el gesto |
| Acuse del press | **≤ 100 ms** | suelo de Norman |
| Ventana de doble clic | **la del SO** (500 ms por defecto en Windows) | usamos `dblclick` nativo |
| Precisión del readout | **1 decimal en mm** | mismo grano que `SEAM_MISMATCH_THRESHOLD_MM` (`SeamRenderer.tsx:116-124`) |
| Temporizador de pulsación | **ninguno** | los modos por tiempo son invisibles |

Los cuatro primeros son perillas de calibración: si a María "se le escapa el borde", sube el 12; si "se le mueve sola", sube el 4. Una constante, un sitio.

### 7.1 Aviso: la unificación del enganche es PARCIAL en la tanda 1

Añadido el 2026-08-12, tras medir el árbol de verdad. Esta sección decía "unifica 8/12/15/20" como si fuera un hecho de la tanda 1. **No lo es**, y dejarlo escrito así sería vender cobertura que no existe.

Lo que la tanda 1 **sí** hace: crea `EDGE_HIT_PX = 12` en `gestureConstants.ts` y lo aplica a la geometría de cosido (`snapToEdge` / `snapToAnyEdge`). Eso cubre **cuatro** herramientas activas: coser, `freesewing` mientras exista, `seamEdit` y **pespunte** — esta última llevaba a 8 px desde mucho antes de esta tanda.

Por qué hizo falta: la fusión de coser (tarea 3) sustituyó `findClosestEdge` (que enganchaba a **15**) por `snapToAnyEdge` (que enganchaba a **8**), encogiendo a la mitad el objetivo de la herramienta que María usa a diario. Eso violaba la cláusula de compatibilidad del § 5 y se arregló al detectarlo.

Lo que la tanda 1 **no** hace, y queda pendiente con nombre y apellido:

| Umbral | Dónde | Quién lo usa hoy |
|---|---|---|
| `EDGE_HIT_THRESHOLD = 15` | `sewingUtils.ts:33` | pliegue, elástico |
| `VERTEX_SNAP_THRESHOLD = 10` | `sewingUtils.ts:34` | pliegue, elástico |
| locales de 8 / 10 / 15 / 20 | medir, recortar, extender-recortar, slash-and-spread, tijeras, piquete | cada herramienta el suyo |

La dispersión real es más ancha que "8/12/15/20": es casi una constante por herramienta. Unificarlas de verdad es trabajo propio, con su propia verificación contra María, y no cabía en esta tanda sin engordarla. Queda para la tanda 2 o para un issue aparte.

**Regla que sí vale desde ya:** ninguna herramienta nueva declara su propio umbral de enganche de borde. Importa `EDGE_HIT_PX`.

---

## 8. Progressive disclosure

**Día 1, sin leer nada:**

1. Clica como hoy. **Todo funciona como hoy.**
2. Al pasar por encima de un borde con cualquier herramienta de tramo ve el borde resaltado **con dos topes en los extremos**: el affordance que dice "esto tiene puntas que se agarran".
3. El `HintText` del pie (ya existe, ya en español) gana **una frase por herramienta**: qué hace el clic, qué hace el arrastre. Está donde ella ya mira.
4. La primera vez que arrastra sobre un borde aparece el número en mm. **Ese es el momento del descubrimiento.**

**Se gana después:**

| Nivel | Gesto | Qué da |
|---|---|---|
| 2 | clic derecho sobre el objeto | número exacto en mm |
| 3 | `Shift` durante el arrastre | ajusta a milímetros enteros |
| 4 | `Alt` durante el arrastre | tramo / par simétrico desde el press |
| 5 | `Escape` a mitad de arrastre | cancelar sin soltar el ratón |

Nada del nivel 2 en adelante es necesario para trabajar.

---

## 9. Sitios de código

| Archivo | Qué pasa |
|---|---|
| `src/components/PatternEditor/useSegmentSewingTool.ts` | sobrevive como librería geométrica; mueren las fases (`:39-47`, `:294-427`) |
| `src/components/PatternEditor/useFreeSewingTool.ts` | se convierte en el tool `seam` unificado; segunda instancia (`PatternEditor.tsx:312`) borrada |
| `src/components/PatternEditor/useSeamAllowanceTool.ts` | precedencia formalizada (`:56-87`), rama de tramo nueva, umbral local borrado (`:11`) |
| `src/components/PatternEditor/useNotchTool.ts` | commit pasa a mouseup (`:168-198`); modal solo en la ruta de clic (`:183-194`) |
| `src/components/PatternEditor/usePointTool.ts` | el press-track-release ya está (`:136-163`); gana el desplazamiento |
| `src/components/PatternEditor/useEditorInteractions.ts` | `MIN_DRAG_PX` global (`:40`), Escape generalizado (`:409-426`), **`seam` y `notch` añadidos al ruteo de mouseUp (`:943-957`)** |
| `src/components/PatternEditor/PatternEditor.tsx` | guard de contextmenu con gesto armado (`:380`, `:782`), hit-test borde→costura para Editar (`:414-449`), régimen de render de costuras (`:817`) |
| `src/components/PatternEditor/actionCuration.ts` | filas nuevas en `CURATION` (`:286-325`) |
| `src/shortcuts/defaults.ts` | `B`→Editar (`:66`), `N`→Coser (`:68`), `F`/`Shift+F` libres (`:67`, `:72`) |
| `src/components/shell/dock2dTools.ts` | "Coser" y "Editar costuras" como dos entradas (`:34`) + migración de defaults (`dockSlice.ts`) |
| `src/components/PatternEditor/renderers/HintText.tsx` | una frase por herramienta; muere el mapa de 5 fases (`:54-68`) |
| `src/components/PropertiesPanel/SeamPropertiesPanel.tsx` | el rango cosido pasa a mm (`:57-78`) |
| `src/utils/seam/seamRange.ts`, `src/types/types.ts:248-252` | **no se tocan.** Los dos destinos del valor ya existen |

---

## 10. Fases

El diseño es uno solo; la entrega no tiene por qué serlo.

- **Tanda 1 — la ley y coser.** Constante global de umbral, gesto de borde genérico con captura de puntero, fusión de coser, modo Editar costuras, teclas y dock.
  Cierra **#219 entero** y la parte de *marcar el tramo arrastrando* de **#199**. Del **#221** cierra la familia TRAMO en coser.
  **No** cierra: el clic derecho con mm de #199 (tanda 2), ni la familia DISTANCIA de #221 (tanda 2).
- **Tanda 2 — margen y piquete/punto.** Rama de tramo en `seamAllowance`, familia DISTANCIA en piquete y punto, filas de "medida exacta" en el clic derecho, rango cosido en mm.
  Cierra el resto de **#199** y de **#221**, y la parte viva de **#220** (marcar solo un tramo del margen).
- **Tanda 3 — lo diferido.** `topstitchSegment` hereda la ley; manijas de extremo del tramo cosido en el lienzo.

---

## 11. The Cut

| # | Lo que NO se diseñó | Por qué |
|---|---|---|
| 1 | Tramos multi-borde (coser doblando la esquina) | `Seam` guarda una mitad por borde semántico. No hay representación. Dos costuras, igual que CLO |
| 2 | Arrastrar un piquete/punto existente para moverlo | choca con el drag de nodos de `editPattern` y con el de extremos de línea interna (`:632-658`). Necesita su propia pasada de prioridad |
| 3 | Manijas de extremo del tramo cosido en el lienzo | diseñado en §3.1 pero diferido; los campos numéricos del panel ya lo hacen |
| 4 | Una barra de opciones de herramienta | no existe en la app (#1049). El split crear/editar son dos entradas de dock precisamente para no depender de ella |
| 5 | `walkSeam`, `measure`, `scissors`, `pleat`, `elastic`, `merge`, `offset`, `extendTrim` | una ley, cuatro herramientas primero |
| 6 | Ajuste automático a números redondos | 47,3 → 47 es mentira en un oficio donde 2 mm es un defecto de ajuste. Modificador, nunca por defecto |
| 7 | Temporizadores de pulsación, menús radiales, teclas en acorde | novedad sin hábito prestado que la respalde |
| 8 | Táctil y lápiz | ella está en ratón. Pointer Events por la captura, no por el táctil |
| 9 | Relajar el guard de misma pieza (self-seams) | nombrado como consecuencia (§6 #16). Decisión de quien lleve el soporte de self-seams del solver |
| 10 | Textos de botón, hint y tooltip | son de la skill `solace-wren` |

---

## 12. Verificación

TDD obligatorio: los tests se escriben antes y se ven fallar por la razón correcta.

**Unitarios (vitest):**

- La máquina del Gesto de Borde: clic bajo umbral, arrastre sobre umbral, arrastre degenerado que cae a clic, Escape en ARMED, Escape en DRAGGING, `pointercancel`, botón derecho en cada estado.
- Precedencia del mousedown en `seamAllowance`: vértice gana a borde, borde gana a cuerpo, y el invariante de que el objetivo no se re-apunta a mitad de gesto.
- Clamp al soltar fuera: más allá del extremo, fuera de la pieza, sobre otro borde, sobre otra pieza.
- Familia distancia: resolución de referencia por prioridad, caída al extremo del borde, dirección por los primeros 4 px, distancia por arco y no por cuerda.
- Coser: la máquina de dos estados, y que el clic-clic de hoy produce exactamente la misma `Seam` que antes (test de no-regresión contra el flujo actual).
- Editar: clic en borde con una costura, con varias (ciclo), en borde libre.

**E2E (Playwright):** el recorrido de María de punta a punta — coser un tramo arrastrando en las dos piezas, y entrar a Editar y ver ambas mitades encendidas.

**Verificación contra el oráculo de paridad:** los contratos de frontera del solver (épica #746) no cambian, porque el modelo de datos no cambia. Si un test de `seamPairs`/`seamAssembly` se pone rojo, es señal de que el gesto está escribiendo un rango que antes no se producía, y hay que mirarlo, no silenciarlo.

---

## 13. Procedencia

- Inventario de interacción de las 13 herramientas 2D con `file:line`: delegado a reasonix flash ($0,024), 4/4 afirmaciones clave verificadas a mano contra el código.
- Gramática: diseñada por el agente `petra-haft` (Toolwright) sobre ese inventario, contrastada contra una posición independiente formada en paralelo. Las dos convergieron en la ley y en la fusión de coser; divergieron en crear-vs-editar, y ganó la de Petra por el argumento del oficio (§4.3) y por el hueco de opciones (§1.1).
- Afirmaciones verificadas a mano antes de aprobar: `defaults.ts:66` (`'Edit Sewing (Seam)'` en `B`), `types.ts:248-252` (`NotchAnchor`), `seamRange.ts:19-22` (`SeamHalfRange`), `useEditorInteractions.ts:943-957` (`seam` y `notch` ausentes del ruteo de mouseUp).
- Aprobado por Samuel y por María el 2026-08-11.

**Sin verificar, y dicho:** la letra exacta del gesto del Free Sewing de CLO3D (clic-clic contra mantener-arrastrar-soltar). Si resultara ser clic-clic, el arrastre gana igual: es un gesto en vez de una máquina de cuatro fases con un modo invisible entre clic y clic, que es justo el defecto que heredó nuestro `segmentSewing`.
