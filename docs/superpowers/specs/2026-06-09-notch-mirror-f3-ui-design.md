# Notch espejo F3 — preview + toggle de sentido in-canvas

**Fecha:** 2026-06-09 · **Estado:** APROBADO — decisiones resueltas por Samuel (2026-06-09).

**Decisiones ratificadas (Samuel):**
- **F3-1 → sel-A + ctrl-A** (notch preexistente vía `selectedInternalLine` + `NotchPropertiesSection`). El botón en el modal queda como follow-up barato, no blocker.
- **F3-2 → Opposite side por defecto** (`invert=true`), control de dos posiciones etiquetado (`Opposite side` / `Same side`), NO checkbox.
- **F3-3 → no tocar el hit-test compartido**; filtrar `type==='notch'` al montar el control.
- **F3-4 → mismo trato a los 4 reasons** (message inline + anillo de advertencia in-canvas + botón deshabilitado + ghost oculto).
- **F3-5 → preview estático** (recompute al seleccionar + al togglear, no por frame).
- **F3-6 → botón explícito "Create mirror notch"** (click), sin Enter.
- **F3-7 → sin Seam: feedback inline + botón deshabilitado + ghost oculto** (hereda D-M5), sin autoSew.

**Spec padre (APROBADO):** `docs/superpowers/specs/2026-06-09-notch-mirror-design.md` (Alcance C). Este doc detalla **F3** del plan de implementación de ese spec (§8): la UI de sentido — preview + toggle. F1 (helper de mapeo `mapNotchAcrossSeam`), F2 (creación vía copilot `mirrorNotch`) y el reescrito de `auditNotches` (F4) **ya están mergeados** (PR #868). F3 es lo único que falta del lado interactivo.

**Objetivo ratificado:** paridad pragmática. CLO3D lo hace a mano one-shot. El mínimo viable es: **seleccionar un notch existente → ver un ghost de dónde caería el espejo en la pieza par → togglear el sentido (invert, D-M2 "el humano decide") → confirmar la creación.** NO enforcement, NO identidad de par (eso es Alcance B, diferido).

---

## 1. Contexto — qué ya existe

La **lógica** del notch espejo ya corre. No hay que escribir geometría nueva:

- **`mapNotchAcrossSeam`** (`src/utils/seam/notchMirror.ts:113-167`) es el motor. Contrato verificado:
  ```ts
  mapNotchAcrossSeam({ sourcePiece, point, seams, pieces, invert? })
    → { ok: true, pairedPieceId, pairedEdgeName, point /* LOCAL a la pieza par */, normal /* interior shoelace */, frac, seamId }
    | { ok: false, reason: 'no-edge'|'no-seam'|'no-paired-edge'|'degenerate', message }
  ```
  `invert` voltea `fracSewn → 1-fracSewn` (L150). Respeta `tStart/tEnd` (cosido parcial). Cuatro reasons, cada uno con `message` listo para feedback.
- **El camino de creación ya está recorrido** por el copilot tool `mirrorNotch` (`src/copilot/action/tools/definitions/internalTools.ts:336-365`): `mapNotchAcrossSeam` → `computeNotchAnchor(outlineB, point)` → construye `InternalLine{type:'notch', path:[M,L], notchOptions, notchAnchor}` → `dispatch(addInternalLine({pieceId: pairedPieceId, line}))`. **F3 reusa este código exacto** desde la UI; es el segundo callsite de `mapNotchAcrossSeam`.
- **`auditNotches`** ya empareja por posición y sugiere espejar el faltante (F4, mergeado).

El runtime está verde (Orchestration Judge): recomputar `mapNotchAcrossSeam` al togglear es aritmética cerrada y acotada (Gauss-Legendre 5-pt + sampling fijo, sin iteración abierta). El destino del ghost NO depende del cursor — con el notch ya seleccionado, el punto fuente es fijo y el preview solo cambia al togglear `invert`.

---

## 2. Estado actual de la interacción (leído en código, 2026-06-09)

### 2.1 Selección de notches — ya existe, vía el select tool
NO hay selección de notch dentro de la herramienta `notch`. La única selección de internals vive en la herramienta **`select`** (`useEditorInteractions.ts:533-549`): con `activeTool==='select'`, itera `piece.internals`, mide `distToInternalLine(localX, localY, line.path)` con umbral `screenToPatternLength(5, zoom2D)`, elige el más cercano y hace `dispatch(selectInternalLine({pieceId, lineId}))`. El slot canónico es **`editor.selectedInternalLine: {pieceId, lineId} | null`** (`editorSlice.ts:103`, `types.ts:702`). Es genérico para **cualquier** `InternalLine` (dart/notch/fold), no específico de notch, y ya tiene render de selección (`PieceRenderer.tsx:605`).

### 2.2 Ghost de walk-seam — patrón de preview sin dispatch
`useWalkSeamTool.ts` mantiene estado 100% local (`useState` + refs-espejo anti-stale-closure, L311-314), recomputa un `computeGhostTransform` puro por evento mousemove y hace `setGhostTransform` **sin tocar Redux**. El overlay (`WalkSeamOverlay`) vive dentro del grupo pan/zoom y divide tamaños por `zoom2D`. Es el patrón canónico de preview vivo — pero es **más pesado de lo que F3 necesita** (mueve un outline de pieza entero + transform + mismatch samples). El notch espejo solo necesita **un punto destino**.

### 2.3 El patrón más cercano: `refineMarker.previewWorld` de NotchToolOverlay
`useNotchTool` ya tiene el molde exacto de "preview sin dispatch que se recomputa al cambiar un valor": el estado `refining.previewWorld` se actualiza vía `previewRefine → setRefining` (L233-248) sin dispatch, y `NotchToolOverlay.tsx:46-92` lo dibuja como ghost dashed dentro del grupo pan/zoom, `pointerEvents='none'`. **Este es el patrón a clonar para F3**, no el de walk-seam.

### 2.4 saSelection — NO es la abstracción para notch
`SaSelection = {kind:'edge'|'vertex', items:[]}` (`types.ts:691`) es un **SET discriminado, multi-item, additive/Shift**, semánticamente "set para edición de SA". Su overlay (`SeamAllowanceSelectionOverlay`) solo dibuja edges/vertices. Un notch a espejar es **single-select** y un `InternalLine` — `selectedInternalLine` calza 1:1. Forzar `kind:'notch'` rompería la invariante del set y obligaría a tocar los ~9 reducers que limpian `saSelection`. **Descartado.**

---

## 3. Opciones consideradas

### 3.1 Selección del notch

| | Mecanismo | Pros | Cons |
|---|---|---|---|
| **sel-A** (recomendada) | Reusar `selectedInternalLine` vía el hit-test que el select tool YA tiene. El control mirror se gatea cuando el `InternalLine` resuelto tiene `type==='notch'`. | Cero código de selección nuevo (hit-test + acción + slot + render ya existen); single-select calza 1:1; no toca `saSelection`; cubre el caso "notch preexistente" (objetivo real de F3). | Hay que cambiar a la herramienta `select` (fricción de modo); el hit-test es genérico (filtrar `type` al construir el control); el gate del PropertiesPanel no incluye `selectedInternalLine` hoy. |
| **sel-B** | Sub-modo del notch tool: Alt/Shift-click sobre un notch existente abre el preview directo. | Todo el flujo en una herramienta sin cambiar de modo (one-shot CLO3D); estado 100% local. | **Requiere escribir un hit-test de notch nuevo** (única superficie de hit-test nueva); Alt-click tiene baja affordance; mezcla dos verbos (crear vs espejar) → mis-clicks. |
| **sel-C** | Extender `saSelection` con `kind:'notch'`. | Un solo modelo de selección uniforme. | **Rechazada por los hechos:** rompe la semántica de set para SA; obliga a tocar ~9 reducers + el overlay SA + el gate `hasSa`; duplica `selectedInternalLine`. |
| **sel-D** | Sin selección: botón Mirror en `NotchPrecisionModal`, que ya tiene el notch recién colocado en mano. | Cero selección/hit-test nuevo; menor superficie; flujo crear→refinar→espejar continuo. | **NO cubre el objetivo de F3** ("seleccionar un notch EXISTENTE"); el modal solo monta para notch recién colocado/refinado (gateado en `refining.notch.notchAnchor`); notch anchor-less no abre el modal → no espejable. |

### 3.2 Control mirror + toggle invert

| | Mecanismo | Pros | Cons |
|---|---|---|---|
| **ctrl-A** (recomendada) | `NotchPropertiesSection` en PropertiesPanel, gateada en `selectedInternalLine.type==='notch'`. Botón Mirror + toggle de sentido + feedback de reason. | Reusa el montaje-por-selección del panel; control persistente; reusa `addInternalLine`; feedback inline de `reason`. | **Requiere abrir el gate L88** del panel (load-bearing); ida-y-vuelta de mirada panel↔canvas para el toggle; hay que resolver el `InternalLine` desde `{pieceId,lineId}` dentro del panel (hoy solo lee `saSelection`). |
| **ctrl-B** | `NotchPrecisionModal` extendido con botón Mirror + toggle. | Menor superficie nueva; el modal ya flota y maneja teclado en CAPTURE phase. | **Restringido:** solo monta para notch recién colocado; no cubre el preexistente; sobrecarga el modal de precisión. |
| **ctrl-C** | Popover flotante in-canvas anclado al notch. | Máxima proximidad acción↔objeto. | **Mayor costo:** posicionamiento screen-space que sigue al pan/zoom (frágil); no reusa contenedor; Iris lo descarta por baja calidad visual. |

### 3.3 Preview / ghost
Clonar el patrón `refineMarker.previewWorld` (NO el ghost pesado de walk-seam). Estado 100% local sin dispatch; el toggle re-llama `mapNotchAcrossSeam` con `invert` flipeado y re-setea el ghost. Render dentro del grupo pan/zoom, tamaños `/zoom2D`, `pointerEvents='none'`. Dos formas: **extender `NotchToolOverlay` con una prop `mirrorPreview`** o un `NotchMirrorOverlay` hermano.

---

## 4. Recomendación + rationale

**Combo recomendado: sel-A + ctrl-A + ghost clonado de `refineMarker.previewWorld`, en un `NotchMirrorOverlay` hermano gateado por la presencia del preview (NO por `activeTool`).**

### Peso de la evidencia
Las cuatro críticas convergen en que el motor está sólido y verificado, y que sel-A+ctrl-A maximiza reuso. El Calibrator (Plumb) lo dimensiona en **S** (~120-160 líneas, 1-2 archivos nuevos), modo **edit directo** — el brainstorming ya ocurrió (la matriz ES el brainstorming) y el spec padre ya está aprobado; re-invocar spec sería theater. El Orchestration Judge confirma runtime verde. El Principal Analyst (Serrano) acepta el reuso pero levanta tres blockers de contrato de interacción que cierro abajo (§4.1). Iris levanta el agujero de UX visual que ninguna opción nombraba: el ghost necesita su propio estado visual y el toggle no puede ser un checkbox booleano (§4.2).

### Por qué este combo
- **No escribe ningún hit-test nuevo.** El select tool ya selecciona internals → `selectedInternalLine`. (sel-B sería la única opción que obliga a un hit-test nuevo.)
- **No toca `saSelection`** ni sus ~9 reducers ni el overlay SA. (sel-C rechazada por los hechos.)
- **No inventa un popover screen-space** que persiga al pan/zoom. (ctrl-C descartada.)
- **Reusa el camino de creación ya probado** (`mapNotchAcrossSeam` + `computeNotchAnchor` + `addInternalLine`, idéntico al copilot tool `mirrorNotch`).
- **Cubre el objetivo declarado de F3** (notch preexistente + caso anchor-less de manga curva), que sel-D/ctrl-B no cubren.

La única superficie nueva es: (1) `NotchPropertiesSection`, (2) abrir el gate L88 del PropertiesPanel + derivar el notch seleccionado, (3) el `NotchMirrorOverlay`, (4) el estado local del preview + su reset. Todo con moldes verificados.

### 4.1 Los tres blockers de Serrano — resueltos en el diseño
1. **Gating contradictorio (BLOCKER #1):** `NotchToolOverlay` está gateado en `activeTool==='notch'` (`ToolOverlay.tsx:180`), pero sel-A selecciona con `activeTool==='select'` → el ghost nunca montaría si se reusa ese overlay tal cual. **Resolución:** crear un **`NotchMirrorOverlay` hermano gateado por `props.mirrorPreview != null`** (no por `activeTool`), montado siempre en `ToolOverlay`. NO extender `NotchToolOverlay`.
2. **Drag de endpoint pisa el re-click (BLOCKER #2):** con `selectedInternalLine`, un click a ≤8px de un endpoint arranca `internalLineDragRef` y hace `return` ANTES de cualquier otra lógica (`useEditorInteractions.ts:483-508`). **Resolución:** el toggle y el confirm de F3 viven en el **PropertiesPanel (ctrl-A), fuera del canvas** — no hay re-click in-canvas que colisione con el drag. El drag de endpoint del notch sigue funcionando intacto.
3. **El gate del panel no resuelve el notch (BLOCKER #3):** L88 hoy es `(!selectedPiece && !selectedSeam && !hasSa)` y el panel solo lee `editor.saSelection`. **Resolución:** sumar un `selectedNotch` derivado (resolviendo `selectedInternalLine` a su `InternalLine` y filtrando `type==='notch'`) a la condición del gate, y montar `<NotchPropertiesSection>` con ese notch. Esta es la pieza de **mayor riesgo / menor tamaño** del combo: si se omite, la sección nunca monta y F3 queda muerto sin error visible.

### 4.2 UX visual (Iris) — incorporado al diseño
- **El ghost necesita un CUARTO estado visual propio.** Hoy `--notch-2d` (teal) = notch real + refine marker; `--accent-2d` (azul) = selección + seams; `#ff9800` (hardcoded) = hover de creación. Si el ghost mirror hereda `--notch-2d` dashed, queda **idéntico al refine marker de precisión** (significados distintos). El ghost mantiene la silueta de notch (`generateNotchPath`) para leerse "esto es un notch", pero se diferencia del notch real y del refine marker: **outline-only sin relleno, dash más largo, anclaje hueco en el destino**, teñido hacia `--accent-2d` ("propuesta/interacción, no tinta final") a baja opacidad. Dibujar **una sola marca** (la silueta destino) — el mirror no mide distancia-a-esquina, así que NO clonar el círculo de referencia + línea de medida del refineMarker.
- **El toggle de sentido NO es un checkbox "invert".** "Invert respecto a qué" no comunica nada sin baseline mental. Usar un **control de dos posiciones etiquetadas** (p.ej. `Opposite side` / `Same side`) donde el estado activo es legible sin contexto. El sentido por nombre, no implícito en `invert=true`.
- **Feedback de error en el canvas, no solo en el panel.** Cuando `ok:false`, además del `message` inline en la sección, marcar el notch fuente seleccionado con un **anillo de advertencia in-canvas** (token `--destructive`/warning, NO `--notch-2d`) para que el feedback se vea donde está la atención.
- **Si se elige ctrl-A**, el ghost debe **animar/transicionar el salto** al togglear (no corte seco) para que el cruce del seam se perciba con visión periférica mientras la mano está en el panel.

---

## 5. Decisiones pendientes (Samuel)

> **DECISIÓN PENDIENTE (Samuel) — F3-1 · Selección: ¿notch preexistente, recién-creado, o ambos?**
> El objetivo declarado de F3 es "seleccionar un notch EXISTENTE" → **sel-A + ctrl-A**. El flujo one-shot estilo CLO3D (crear→espejar continuo) sería **sel-D/ctrl-B** (botón Mirror en el modal), estrictamente menos superficie pero NO cubre el preexistente ni el anchor-less.
> **Default recomendado: sel-A + ctrl-A** (cubre el objetivo real). Ambos caminos comparten motor (`mapNotchAcrossSeam`) + overlay; añadir DESPUÉS un botón Mirror en el modal cuesta ~15-25 líneas incrementales si se quiere el atajo one-shot. Empezar por ctrl-A; el botón en el modal queda como follow-up barato, no como blocker.

> **DECISIÓN PENDIENTE (Samuel) — F3-2 · Default del toggle de sentido.**
> El caso real-garment cose right-sides-together → sentido OPUESTO → `invert=true`. Pero arrancar en `true` confunde sin microcopy claro.
> **Default recomendado: arrancar en el sentido OPUESTO (`invert=true`)** con el control etiquetado por nombre (`Opposite side` activo por defecto), NO un checkbox `invert`. Sin enforcement: el humano puede cambiarlo viendo el ghost.

> **DECISIÓN PENDIENTE (Samuel) — F3-3 · Desempate del hit-test cuando notch y dart coinciden.**
> El hit-test del select tool mide al PATH completo sin filtro de type; con umbral 5px un dart largo puede ganarle a un notch en la misma zona, y entonces el control mirror nunca aparece.
> **Default recomendado:** NO tocar el hit-test del select tool (es compartido); el control mirror filtra `type==='notch'` al montar. Si en la práctica molesta el desempate, F3-3b (follow-up): preferir notches en empate o medir a `path[0]` para notches. Para F3, el filtro al montar es suficiente y de cero riesgo.

> **DECISIÓN PENDIENTE (Samuel) — F3-4 · Feedback por reason (cuatro, no uno).**
> `mapNotchAcrossSeam` devuelve `no-edge | no-seam | no-paired-edge | degenerate`, cada uno con `message`. `no-edge` es probable en notches anclados por arc-distance que no caen sobre un `SemanticEdge` nombrado.
> **Default recomendado:** los cuatro reasons → mostrar su `message` inline en la sección + anillo de advertencia in-canvas (§4.2), botón Mirror deshabilitado, **ghost oculto** (no dibujar un ghost stale). Mismo tratamiento para los cuatro; no inventar copy distinto por reason más allá del `message` que ya viene.

> **DECISIÓN PENDIENTE (Samuel) — F3-5 · Recompute: ¿estático o sigue al mouse?**
> Con el notch ya seleccionado (sel-A) el punto fuente es FIJO; no hay nada que seguir por frame.
> **Default recomendado:** preview **estático**, se recomputa solo al (a) seleccionar el notch, (b) togglear el sentido. NO seguir el mouse. Recomputar por frame sería trabajo inventado (Orchestration Judge).

> **DECISIÓN PENDIENTE (Samuel) — F3-6 · Confirmación.**
> El control está en el panel (ctrl-A), que NO tiene el listener CAPTURE+stopPropagation del modal → un `Enter` en el panel podría fugar al shortcut global.
> **Default recomendado: botón explícito "Create mirror notch"** (click), sin Enter, para no arriesgar la fuga al shortcut global. Si se quiere Enter, replicar el patrón CAPTURE+stopPropagation del modal (`NotchPrecisionModal.tsx:48-64`).

> **DECISIÓN PENDIENTE (Samuel) — F3-7 · Sin Seam (reason `no-seam`).**
> **Default recomendado (heredado de D-M5):** feedback inline ("No hay costura en este borde — crea la costura primero", el `message` ya viene listo), botón deshabilitado, ghost oculto. NO bloquear, NO autoSew. Feedback, no enforcement.

---

## 6. Plan de implementación (combo recomendado, tamaño S)

**Modo: edit directo.** Spec padre ya aprobado; motor mergeado. ~120-160 líneas, 1-2 archivos nuevos.

1. **Exportar/mover los helpers de hit-test (XS, refactor ligero).** `distToInternalLine` (`useEditorInteractions.ts:49`) y `getInternalLineEndpoints` (L75) son file-local. Para resolver el notch entry point (`getInternalLineEndpoints(line)[0]` = `path[0]` local) desde fuera, exportarlos o moverlos a `src/utils/seam/` (o `src/utils/mesh/`). El select tool sigue usándolos. No es estrictamente necesario si el panel computa `path[0]` inline, pero evita la cuarta reimplementación.

2. **Estado del preview + reset (S, decisión arquitectónica genuina).** Hook ligero `useNotchMirrorPreview` (o estado en la sección): `mirrorPreview: {pairedPieceId, pointWorld, normal, invert, seamId} | {error: {reason, message}} | null`, sin dispatch. Al seleccionar el notch o togglear: re-llama `mapNotchAcrossSeam({sourcePiece, point: path[0] local, seams, pieces, invert})`; el `point` devuelto es **LOCAL a la pieza par** → `pointWorld = point + pairedPiece.position` (responsabilidad asignada al hook, NO al overlay, para no pintar en el origen). **Reset obligatorio:** `useEffect` que limpia `mirrorPreview` cuando `selectedInternalLine` pasa a `null`/cambia de `lineId` — el reset-on-tool-change de `useNotchTool` (L146) NO cubre el flujo select; sin esto el ghost queda huérfano contra una selección muerta (advertido por Serrano y el Orchestration Judge).

3. **`NotchPropertiesSection` (S, ~60-80 líneas).** Molde: `EdgePropertiesSection.tsx` (pero más simple — single-select, sin buffer multi-select ni re-seed). Contiene: el control de sentido de dos posiciones etiquetadas (F3-2), el botón "Create mirror notch" (F3-6), y el feedback de `reason` inline (F3-4). El botón llama el camino de `mirrorNotch` (`mapNotchAcrossSeam` + `computeNotchAnchor` + `dispatch(addInternalLine)` en `pairedPieceId`) — extraerlo a un helper compartido con el copilot tool si conviene, o invocar inline.

4. **Abrir el gate del PropertiesPanel (S, load-bearing).** En `PropertiesPanel.tsx`: derivar `selectedNotch` resolviendo `editor.selectedInternalLine` → `InternalLine` con `type==='notch'` (el panel hoy solo lee `saSelection`, hay que añadir esta derivación). Sumar `selectedNotch` a la condición del gate L88 y montar `<NotchPropertiesSection notch={selectedNotch} .../>` en la rama de secciones. **Sin esto la sección nunca monta** (BLOCKER #3).

5. **`NotchMirrorOverlay` hermano (S, ~25-40 líneas).** Nuevo overlay (NO extender `NotchToolOverlay`, para evitar el gate `activeTool==='notch'` — BLOCKER #1). Dibuja la silueta del notch destino vía `generateNotchPath(pointWorld, normal, opts)` con el cuarto estado visual (§4.2): outline-only, dash largo, anclaje hueco, teñido `--accent-2d`, transición animada del salto al togglear. Dentro del grupo pan/zoom, tamaños `/zoom2D`, `pointerEvents='none'`. Cableado por props `PatternEditor → ToolOverlay → NotchMirrorOverlay`, gateado en `props.mirrorPreview != null`. Cuando `ok:false`: ghost oculto + anillo de advertencia in-canvas sobre el notch fuente.

6. **Tokenizar `#ff9800` (XS, deuda visual de Iris).** Al tocar el área de overlays de notch, mover el naranja hardcoded del hover de creación (`NotchToolOverlay.tsx:32,41`) a un token (p.ej. `--notch-hover-2d`) para que el sistema de color del editor 2D quede completo y el nuevo ghost se defina junto a los demás, no contra una constante suelta.

7. **Tests + microcopy (XS).** Test de la sección: monta con notch seleccionado, oculta con dart; toggle re-llama `mapNotchAcrossSeam` con `invert` flipeado; confirm dispara `addInternalLine` en `pairedPieceId`; `ok:false` deshabilita el botón y oculta el ghost. Microcopy del control de sentido + del feedback de reason (consultar `solace-wren` si Samuel quiere afinar el copy). El motor ya tiene cobertura (`notchMirror.test.ts`).

---

## 7. Out-of-scope (de F3)

- **Hit-test de notch nuevo / Alt-click en el notch tool** (sel-B) — el select tool ya selecciona internals; no hace falta.
- **Botón Mirror en `NotchPrecisionModal`** (sel-D/ctrl-B) — follow-up barato si se quiere el atajo one-shot recién-creado; no es el objetivo de F3.
- **Extender `saSelection` con `kind:'notch'`** (sel-C) — rechazado; `selectedInternalLine` es el slot correcto.
- **Popover flotante in-canvas** (ctrl-C) — frágil bajo pan/zoom; descartado.
- **Enforcement / identidad de par / `partnerId`** — Alcance B, diferido. F3 crea notches independientes one-shot.
- **Cascada linked / dedup del par** — `addInternalLine` sobre la pieza par dispara `linkedEditingMiddleware`; si la par tiene `linkedPieceId+linkMode` puede aparecer un notch extra en la cadena linked (Orchestration Judge). No es crash; es artefacto aceptable para F3 (sin identidad de par) mientras el microcopy no prometa unicidad. NO se aborda aquí.
- **Desempate avanzado del hit-test** (preferir notch sobre dart / medir a `path[0]`) — F3-3b, follow-up; el filtro `type==='notch'` al montar el control es suficiente para F3.
- **Re-proyección continua / sobrevivir grading-mirror como par garantizado** — Alcance B; fuera de scope por diseño.