# Modelo de selección para multi-select Shift (seam allowance)

**Fecha:** 2026-06-09 · **Estado:** APROBADO — las decisiones resueltas por Samuel (2026-06-09).

**Decisiones ratificadas (Samuel):**
- **ALCANCE → B (SA-only).** Discriminado `{kind, items}` solo para el dominio SA. NO migración completa (C queda como eje arquitectónico futuro con su propio RFC).
- **D1 → (a) Mixed + bulk reducer.** Campo `'Mixed'` si divergen; nuevo `setEdgesSeamAllowance({items, width})` escribe el mismo width a todos; Inherit = `null` a todos.
- **D2 → (a) excluyentes por tipo.** Resuelto por el tipo de B (estado ilegal no construible).
- **D3 → Undo (a) bulk reducer (1 entrada) + Toast (1) sin toast.** Atomicidad estructural, paridad con drag-to-all.
- **D4 → (a) solo dentro del mismo kind.** La exclusividad cross-kind sigue a mano (deuda diferida que el feature no toca).
- **D5 → (b) controlado puro / key derivada del set.** El remount-hack de PR #865 se retira.
- **Vértices (multi-vertex corner-type) → fuera de este frente.** Solo multi-edge (width) primero; multi-vertex diferido.
**Origen:** Feature de paridad CLO3D (Shift-multi-edit de seam allowance). Release A (default editable + drag-to-all) ya shippeó y mergeó (PR #866). Este es el siguiente frente.
**Precondición de junta:** la junta del roster (2026-06-09) decidió diferir multi-select con la precondición = escribir ESTE mini-spec primero. La junta pesó **EN CONTRA** de la opción A (dos arrays paralelos). Este doc respeta esa decisión: A se documenta para completitud, pero la recomendación sigue el peso de la evidencia (Voronov + Vex + Plumb + Halberg), no un voto.

## Contexto / requirement

Con el tool seam allowance activo, mantener **SHIFT** debe permitir seleccionar VARIOS edges (o vértices) a la vez y editar el ancho del CONJUNTO en el panel — como CLO3D (Shift-multi-edit). Hoy la selección de edge/vertex es estrictamente single: cada `select*` reducer nulifica los demás a mano.

La junta nombró el error de categoría (Axiom-0): *"el modelo sabe nombrar una cosa, pero no la relación/cardinalidad"*. El modelo de selección son 7 campos planos paralelos sin discriminador de tipo; la exclusividad se mantiene a mano en ~12 writers. La forma correcta introduce la categoría ausente: un `selection:{kind, items}` discriminado. Eso es lo que este spec decide DÓNDE vive.

## Estado actual (verificado en código)

`EditorState` (`src/types/types.ts` ~692–700) tiene 7 campos de selección:

| Campo | Tipo | Cardinalidad |
|---|---|---|
| `selectedPieceIds` | `string[]` | multi |
| `selectedSeamId` | `string \| null` | single |
| `selectedPOMId` | `string \| null` | single |
| `selectedElasticId` | `string \| null` | single (**campo muerto**, ver abajo) |
| `selectedInternalLine` | `{pieceId, lineId} \| null` | single |
| `selectedEdge` | `{pieceId, edgeId} \| null` | single |
| `selectedVertex` | `{pieceId, vertexIndex} \| null` | single |

**Exclusividad a mano.** Cada reducer `select*` nulifica los otros (`editorSlice.ts`): `selectPiece` (49–56), `togglePieceSelection` (57–67), `clearSelection` (68–75), `selectAllPieces` (76–83), `selectAllVisiblePieces` (84–94), `selectSeam` (95–102), `selectPOM` (103–110), `selectInternalLine` (111–118), `selectEdge` (121–128), `selectVertex` (129–136), `addMatcher` removePiece/s/removeSeam (234–244), `NEW_PROJECT` (227 vía initialState). Son **20 sentencias** `selectedEdge=null`/`selectedVertex=null` (10 pares adyacentes) + 2 en initialState.

**El comentario del propio slice ya nombra la categoría correcta** (`editorSlice.ts` 119–120): *"Per-edge SA selection — a typed, mutually-exclusive focus (one edge OR one vertex at a time)."* La intención de modelo discriminado ya está escrita en prosa; falta hacerla tipo.

**Commit path (verificado).** `PropertiesPanel.tsx` lee `editor.selectedEdge`/`selectedVertex` (guarded por `pieces.some` piece-exists, L37–40); monta `EdgePropertiesSection key={selectedEdge.edgeId}` (L98 — el **remount** re-siembra el `useState` local que sincroniza el valor mostrado; fix de stale-value de PR #865 / commit 967dba1c). `EdgePropertiesSection.tsx`: deriva `effective = edge.seamAllowanceWidth ?? piece.seamAllowance ?? 0` (L21), siembra `useState(String(effective))` (L23), commitea `setEdgeSeamAllowance({pieceId,edgeId,width})` en Enter/blur (L30) o `width:null` para Inherit (L54). `setEdgeSeamAllowance` (`projectSlice.ts:1049–1056`) escribe **UN edge por dispatch**. La sección de vertex commitea corner-type vía `updatePiece` (reemplaza la pieza entera), semántica ortogonal al width.

**No existe bulk per-edge.** `setEdgeSeamAllowance` es single. El único bulk SA es `batchSetSeamAllowance` (`projectSlice.ts:1333–1343`) que escribe el **escalar per-PIEZA** (`piece.seamAllowance`, nivel-2), NO el override per-EDGE (`edge.seamAllowanceWidth`, nivel-3). El comentario de Release A (`projectSlice.ts:1328–1332`) **ya diagnosticó el hang**: *"the per-edge setEdgeSeamAllowance loop would clone O(project) per edge → hang"*. Cualquier opción debe agregar un bulk per-edge.

**Undo (verificado).** `undoMiddleware` clona `structuredClone(project)` por acción `project/*` (304–308). `batchUndo` (102–113) agrupa N dispatches en 1 snapshot (batchDepth suprime los intermedios). El slice **editor NO entra al undo** (solo `project/*` se clona, L282) → la forma del modelo de selección (A/B/C) es **ortogonal** al peso del snapshot. Drag-to-all ya usa `batchUndo` + `batchSetSeamAllowance` (precedente sellado en `store.test.ts`).

### Bugs latentes confirmados (prueban que el modelo plano no tiene discriminador)

- **`selectedElasticId` es un campo MUERTO.** Cero writers en `src/store` (declarado en `types.ts:695` + `editorSlice.ts:14`, leído en `ElasticRenderer.tsx:261/276`). La selección elástica real vive en un `useState` local en `useElasticTool.ts` (homónimo). `isSelected` es siempre `false` en runtime. Deuda **separada del feature SA**.
- **`togglePieceSelection` es asimétrico** (`editorSlice.ts:57–67`): nulifica POM/edge/vertex pero **NO** `selectedSeamId` ni `selectedInternalLine`. Shift-toggle de pieza con un seam o internal line activo deja dos selecciones de distinto kind vivas. La fragilidad "a mano" ya falla con un writer.
- **`selectInternalLine` ya viola "un kind a la vez"** (`editorSlice.ts:111–118`): setea `selectedPieceIds=[pieceId]` **Y** `selectedInternalLine` simultáneamente — par padre/hijo legítimo, no exclusivo. El modelo de kind-único no representa este par sin un campo extra.
- **El overlay tiene un ganador arbitrario.** `SeamAllowanceSelectionOverlay.tsx:38` `if(selectedVertex){...}` luego `:51 if(selectedEdge){...}`: si ambos estuvieran poblados, vertex gana por orden de código, no por decisión.

## Formas candidatas

### A — Dos arrays paralelos (`selectedEdges[]` / `selectedVertices[]`)

Reemplaza los dos campos single por dos arrays; los otros 5 campos planos no se tocan. Reusa el idiom de `selectedPieceIds[]` + `togglePieceSelection`.

- **Pros:** blast radius mínimo en tipos (solo 2 campos mutan); reusa patrón ya probado; no toca copilot más allá del rename de mocks.
- **Cons:** **perpetua el patrón** que la junta pesó en contra (ahora 2 arrays + 5 single = 7 campos planos sin discriminador). D2 (edge XOR vertex) **NO codificada por tipo** — `selectedEdges.length>0 && selectedVertices.length>0` es un estado ilegal representable; depende de disciplina (la misma que `togglePieceSelection` ya rompe). Las 20 sentencias de nulificación pasan de `=null` a `=[]` (cero reducción) + 2 reducers nuevos + helper `sameEdge`. **Adición disfrazada de paridad de patrón.** No mata ninguna deuda.
- **Tamaño:** S (~80–120 líneas). **Veredicto del consejo:** RECHAZADA (Voronov, Vex, Serrano coinciden; junta ya pesó en contra).

### B — Selection discriminado SOLO para el dominio SA: `{kind, items}`

```ts
type SaSelection =
  | { kind: 'edge';   items: { pieceId: string; edgeId: string }[] }
  | { kind: 'vertex'; items: { pieceId: string; vertexIndex: number }[] };

interface EditorState {
  // ...los otros 5 campos planos sin cambios...
  saSelection: SaSelection | null;   // reemplaza selectedEdge + selectedVertex (2 → 1)
}
```

Reducers: `selectSaEdges({items, additive})`, `selectSaVertices({items, additive})`, `clearSaSelection()`. `additive=shift` hace toggle dentro de `items` si el `kind` coincide; si difiere o es null, REEMPLAZA (cambiar de vertex a edge con Shift descarta el set previo).

- **Pros:** introduce la categoría AUSENTE (kind + cardinalidad) **donde el error vive** — el dominio SA, sin tocar pieces/seams/POMs. **D2 lo resuelve el tipo** (imposible mezclar edge+vertex — el compilador prohíbe el estado ilegal que A permite). **D5 cae natural**: el discriminador da una key derivada estable del conjunto, retirando el remount-hack per-edge. **Net negativo de código en el slice**: cada par de nulificación colapsa a `state.saSelection=null` (~10 líneas menos); `selectEdge`/`selectVertex` (16 líneas, L121–136) mueren. Es el único camino que entrega menos líneas SIN abrir el core de selección. Precedente claro para migrar el resto después (C) sin comprometerse ya.
- **Cons:** híbrido — convive 1 modelo discriminado con 5 campos planos viejos (coherencia parcial). **D4 sigue a mano**: la exclusividad ENTRE `saSelection` y los 5 kinds viejos se mantiene en cada writer (pero esa exclusividad NO es la deuda que el feature crea). No arregla `selectedElasticId` muerto ni la asimetría de `togglePieceSelection` (quedan como deuda visible al lado del modelo nuevo). El nombre `saSelection` ata el campo al tool; si otro tool quiere multiselect de edges, empuja hacia C. Corner-type multi (vertex) necesita decidir bulk vs N `updatePiece`.
- **Tamaño:** M (~120–180 líneas, ~9 archivos). **Veredicto del consejo:** PREFERIDA (Voronov, Halberg, Vex; Plumb la dimensiona M honesta; Serrano la marca ACEPTABLE).

### C — Slice de selección unificado con tipo activo (reemplaza los 7 campos planos)

```ts
type SelectionItem =
  | { kind: 'piece'; pieceId: string }
  | { kind: 'seam';  seamId: string }
  | { kind: 'pom';   pomId: string }
  | { kind: 'elastic'; elasticId: string }
  | { kind: 'internalLine'; pieceId: string; lineId: string }
  | { kind: 'edge';   pieceId: string; edgeId: string }
  | { kind: 'vertex'; pieceId: string; vertexIndex: number };

interface Selection { kind: SelectionItem['kind'] | null; items: SelectionItem[]; }
```

Reducers genéricos `select({item, additive})` / `selectMany({items})` / `clearSelection()`. Selectores de compat (`selectSelectedPieceIds`, `selectSelectedEdge`) reconstruyen las vistas single que el resto del código aún espera.

- **Pros:** "hacerlo bien" completo — un solo invariante estructural reemplaza la exclusividad a mano en ~12 writers. **Mata 3 deudas de una**: `selectedElasticId` muerto, asimetría de `togglePieceSelection`, remount-hack de D5. **D2/D4 los da el tipo** por construcción. Punto único de extensión para tools futuros. Cierra el eje arquitectónico real que Axiom-0 nombró.
- **Cons:** **blast radius máximo** — ~53 readers directos + **162 ocurrencias de `selectedPieceIds` en 42 archivos** (26 de ellas `.find`/`.includes`/`.some` ratificadas forward-only en B2-state) deben pasar por selectores de compat o migrar. **Riesgo de regresión alto en áreas no-SA** (piece/seam/POM selection es el core de toda la edición) por un feature cuyo alcance pedido es SOLO SA. **BLOCKER propio**: el par padre/hijo `selectInternalLine` (`selectedPieceIds=[pieceId]` + `selectedInternalLine` simultáneos) NO es representable en kind-único sin un campo extra (`context`) que contradice su propia limpieza. Los selectores de compat son código nuevo que reintroduce la forma vieja — anula parte del corte. Requiere RFC en `docs/reports/` + fila en Audit Ratifications + enmienda a B2-state.
- **Tamaño:** L (~250–400 líneas; techo de L por proceso, no XL — sin cascada Rust/WASM). **Veredicto del consejo:** ACEPTABLE pero DESPROPORCIONADA como vehículo del feature SA (Voronov, Halberg, Plumb, Vex coinciden: legítima SOLO si Samuel decide cerrar el eje arquitectónico completo con RFC).

## Recomendación + rationale (peso de evidencia)

**Recomendación: Opción B (discriminado SA-only `{kind, items}`), alcance SA-only.**

Esto NO es un voto — es el peso de la evidencia de las cuatro disciplinas, que convergen:

- **Voronov (ontología):** B es la única forma que nombra la categoría ausente (kind + cardinalidad) DONDE el error realmente vive. Hace IMPOSIBLE el estado ilegal que A permite. A perpetúa el error de categoría; C lo resuelve globalmente pero a costo de acoplar el feature SA al núcleo de edición + un caso (par piece/internalLine) que su premisa no modela.
- **Halberg (runtime):** A/B/C son intercambiables para el undo (el slice editor no se clona). Lo que decide el feasibility es la AUSENCIA de un bulk per-edge action — común a las tres. B es la más limpia: `items` es una lista homogénea que el bulk consume directo; D2 por tipo garantiza que el commit nunca recibe items heterogéneos (cero ramas de runtime). C **no mejora la atomicidad sobre B** y agrega superficie de riesgo fuera de SA.
- **Plumb (calibración de tamaño):** el feature pedido es S/M; C es 10x (162 ocurrencias / 42 archivos por un tool). D2/D5 NO son decisiones pendientes en B — son **propiedades del shape discriminado**.
- **Vex (eliminación):** B es el único camino con NET NEGATIVO en el slice sin reintroducir superficie por compat. A es adición. El corte de C queda anulado por los selectores de compat.

El trade-off real que Samuel decide NO es "mínimo vs hacerlo bien". Es: ¿la deuda de exclusividad-a-mano cross-kind (`selectedElasticId` muerto, asimetría de `togglePieceSelection`) es un problema que ESTE feature debe pagar (C, ahora), o una deuda separada con su propio momento (B, después)? **B paga exactamente la deuda que el feature crea, ni más ni menos.**

**Ley de orquestación (Voronov, aplica a las tres):** bajo multi-cardinalidad, foco (perception/overlay, singular) y conjunto-editado (intention/panel, plural) se separan. Las tres opciones eligen *implícitamente* que el "valor mostrado" es función del conjunto (intersección/Mixed), sin un campo dedicado de "foco". Eso es aceptable (last-clicked = `items[items.length-1]` derivable), **pero quien decida debe SABER que está eligiendo no representarlo**, no descubrirlo cuando el highlight resalte el conjunto entero y el usuario pregunte cuál edge estaba "activo".

## Decisiones pendientes (Samuel)

> Estas NO las cierra este doc. Cada una lleva opciones y un default recomendado.

### ALCANCE · SA-only (B) vs migración completa (C)

- **Question:** ¿La nueva forma se aplica SOLO a edges/vertices del tool SA (B, mínimo, deja el resto del modelo viejo conviviendo), o se migra TODO el modelo (C, "hacerlo bien", RFC + fila Audit + enmienda B2-state)?
- **Opciones:** (B) SA-only — M, blast acotado, no toca los 162 readers de `selectedPieceIds`. / (C) Migración completa — L, mata 3 deudas, pero re-arquitectura del núcleo de edición + BLOCKER del par padre/hijo `selectInternalLine`.
- **Default recomendado:** **B (SA-only).** C es legítima solo como eje arquitectónico propio con su RFC, no como vehículo de este feature. Esta decisión gobierna todas las demás (con C, D2/D4 se cierran por construcción).

### D1 · Render del Width con valores divergentes + contrato de commit-a-todos

- **Question:** Bajo multi-select con valores divergentes (un edge 8mm, otro inherit, otro 10mm), ¿qué renderiza el campo Width? ¿Y qué ESCRIBE el commit-a-todos (incluyendo Inherit y el caso de edges de piezas distintas con `piece.seamAllowance` distinto — intersección de nivel-2 vs nivel-3)?
- **Opciones:** (a) Si todos comparten el mismo `effective` → muestra el número; si divergen → placeholder `'Mixed'` (input vacío). Commit: nuevo `setEdgesSeamAllowance({items, width})` escribe el MISMO width a todos; Inherit → `width:null` a todos. / (b) Mostrar el del último clicado (foco) como valor seed. / (c) Mostrar el primero del set.
- **Default recomendado:** **(a) Mixed + bulk reducer.** Es lo que las tres opciones asumen. **Cierra el gap:** el contrato exige un reducer nuevo (no existe hoy) con firma `setEdgesSeamAllowance({items: {pieceId,edgeId}[], width: number | null})`; `width:null` = Inherit a todos; clamp `Math.max(0,width)` per-edge (calcado de `setEdgeSeamAllowance:1049`). El "effective" para decidir Mixed se computa por edge contra el `piece.seamAllowance` de SU pieza (no se mezcla nivel-2 entre piezas).

### D2 · ¿El set mezcla vertices+edges, o son mutuamente excluyentes por tipo?

- **Question:** El panel monta secciones con semánticas opuestas (width per-edge vs corner-type per-vertex). ¿Un set puede contener ambos kinds?
- **Opciones:** (a) Excluyentes por tipo — Shift NO mezcla edge+vertex. / (b) Mezcla libre (panel decide qué sección mostrar).
- **Default recomendado:** **(a) Excluyentes por tipo.** Bajo B/C esto lo **resuelve el tipo** (estado ilegal no construible) — deja de ser decisión y pasa a ser propiedad del shape. Bajo A quedaría a disciplina (la fragilidad denunciada). El propio comentario del slice ya lo dice: "one edge OR one vertex at a time".

### D3 · ¿N edges = un undo agrupado o N pasos? + showUndoToast bajo multi

- **Question:** ¿El multi-edit de N edges es UN solo undo agrupado o N pasos? ¿Cómo se comporta `showUndoToast`?
- **Opciones:** Undo — (a) bulk reducer `setEdgesSeamAllowance` = 1 dispatch / 1 clone / 1 entrada (atomicidad estructural, 1 Map, 1 pasada). / (b) `batchUndo` envolviendo N `setEdgeSeamAllowance` (1 snapshot, N pasadas de reducer; idiom de drag-to-all; aceptable solo para N pequeño). Toast — (1) sin toast (paridad con drag-to-all, confiar en Ctrl+Z). / (2) UN solo toast con inverse batched (captura los N widths previos antes del commit). / (3) N toasts (saturaría el límite de 5 — rechazado).
- **Default recomendado:** **Undo (a) bulk reducer** — el runtime lo premia (atomicidad no depende de batchDepth ni de timing; el loop per-edge fue diagnosticado como hang). **DEBE ser un solo undo agrupado** (N pasos = 50 Ctrl+Z para deshacer un gesto, fallo de UX). **Toast (1) sin toast** para paridad con drag-to-all; si se quiere toast, **(2) UN solo toast** con inverse batched, NUNCA N. **Cierra el gap:** el nuevo `setEdgesSeamAllowance` necesita su entrada en `ACTION_LABELS` (`undoMiddleware.ts:132–169`, p.ej. `'project/setEdgesSeamAllowance' → 'Edit seam allowance'`) o cae al camelCase-splitter (L172).

### D4 · ¿SHIFT bypassa la nulificación de piece/seam/POM/internalLine?

- **Question:** ¿Shift acumula cross-kind (un edge + una pieza), o multi-select solo aplica dentro del mismo kind?
- **Opciones:** (a) Solo dentro del mismo kind (Shift sobre otro kind reemplaza el set). / (b) Bypass cross-kind (acumula edge + pieza + seam).
- **Default recomendado:** **(a) Solo dentro del mismo kind.** Bajo C esto lo da la estructura (kind único). Bajo B la exclusividad cross-kind sigue a mano en cada writer (`selectSaEdges` nulifica pieces/seam/POM/internalLine; `selectPiece` pone `saSelection=null`) — es la deuda que el feature NO toca, correctamente diferida.

### D5 · ¿De dónde sale el valor mostrado bajo multi? (el remount-hack muere)

- **Question:** `key={selectedEdge.edgeId}` (remount que re-siembra el `useState` local) se rompe con un set (no hay un `edgeId` único para la key).
- **Opciones:** (a) Key derivada del set: `key={items.map(e=>e.pieceId+':'+e.edgeId).sort().join('|')}` re-siembra cuando cambia el conjunto. / (b) Eliminar el `useState` local y volver `EdgePropertiesSection` controlado puro (valor derivado del set en cada render). / (c) Mantener un campo de foco explícito (last-clicked) para la key.
- **Default recomendado:** **(b) controlado puro** (o (a) como camino de menor cambio). Bajo B/C el discriminador da una key derivada estable natural; el remount-hack de PR #865 se retira porque el modelo ya expone el conjunto. **Nota:** el test `EdgeVertexProperties.test.tsx:60–76` ("no stale value") está pineado al remount single-edge y NO transfiere sin reescritura.

## Plan de migración (concreto, para B / SA-only)

> Si Samuel elige C, el plan crece: añadir migración de los 162 readers vía selectores de compat, RFC en `docs/reports/`, fila en Audit Ratifications, enmienda a B2-state, y resolver el par padre/hijo `selectInternalLine` con un campo `context` explícito.

**Modelo (tipos + slice):**
- `src/types/types.ts` (~697–700): borrar `selectedEdge`/`selectedVertex`, agregar `saSelection: SaSelection | null` + exportar `SaSelection`.
- `src/store/editorSlice.ts:16–17`: `saSelection: null` en initialState (1 campo en vez de 2).
- `editorSlice.ts:121–136`: borrar `selectEdge`/`selectVertex`; agregar `selectSaEdges`/`selectSaVertices`/`clearSaSelection` (3 reducers con lógica `additive` + helper `sameEdge`).
- `editorSlice.ts` nulificadores: las ~10 pares de líneas `selectedEdge=null; selectedVertex=null` (L54–55, 59–60, 73–74, 81–82, 92–93, 100–101, 108–109, 116–117) + addMatcher (241–242) colapsan a UNA `state.saSelection = null` cada uno. `selectedElasticId` queda intacto (deuda diferida).

**Commit (projectSlice + undo):**
- `src/store/projectSlice.ts`: nuevo `setEdgesSeamAllowance({items, width})` bulk per-edge (NO existe hoy; calcado de `batchSetSeamAllowance:1333` pero escribiendo `edge.seamAllowanceWidth` nivel-3; construir `Map<pieceId, Set<edgeId>>` para no re-buscar piezas N veces). `width:null` = Inherit a todos.
- `src/store/undoMiddleware.ts:132–169`: entrada nueva en `ACTION_LABELS`.

**UI (panel + overlay + tool):**
- `src/components/PropertiesPanel/PropertiesPanel.tsx`: guard único sobre `saSelection` (filtra items por `pieces.some`, L37–40); empty-state `!saSelection` (L85); `switch(saSelection.kind)` monta `EdgePropertiesSection` (con `items[]`, key derivada — D5) vs `VertexPropertiesSection` (L95–102). **Nota de coexistencia:** hoy las secciones se montan con `&&` independientes (L95–105); bajo el switch del discriminador no pueden renderizarse dos a la vez (B/C lo previenen por tipo; A lo reintroduce).
- `src/components/PatternEditor/renderers/overlays/SeamAllowanceSelectionOverlay.tsx`: Props `{saSelection}`; `switch(kind)`, itera N circles / N polylines (hoy renderiza UNO, L44–48/66–76). Decidir si hay un "primario" visual distinguido (anchor del valor del panel) — recomendado: derivar last-clicked = `items[items.length-1]`.
- `src/components/PatternEditor/useSeamAllowanceTool.ts:55–85` (`handleMouseDown`): leer `e.shiftKey` (hoy no se lee) y pasarlo a los callbacks. **Cierra el gap de firma:** `onSelectEdge(pieceId, edgeId, additive)` / `onSelectVertex(pieceId, vertexIndex, additive)` (hoy L38–39 sin flag); el toggle vive en el reducer `additive`, no en el tool.
- `src/components/PatternEditor/PatternEditor.tsx:207–208`: callbacks dispatchan `selectSaEdges`/`selectSaVertices` con `additive=shift`; L660–661 pasan `saSelection` al overlay.

**Tests guardrail que ROMPEN por diseño (reescribir):**
- `src/store/__tests__/selectEdgeVertex.test.ts` (5 tests, L12–57): `selectEdge`/`selectVertex` ya no existen; los asserts `toBeNull` (la exclusividad single codificada) se reescriben contra `saSelection`. Verificado: codifica `selectedVertex toBeNull` tras `selectEdge`, `selectedEdge toBeNull` tras `selectVertex`, etc.
- `src/components/PropertiesPanel/__tests__/EdgeVertexProperties.test.tsx:60–76` ("width field reflects the newly selected edge / no stale value"): pineado al remount `key={edgeId}` single-edge; no transfiere — reescribir contra el valor derivado del set (D5).
- Mocks de `EditorState` (cambio de shape `-2 +1` campo, más limpio que A): `src/copilot/perception/__tests__/contextBuilder.test.ts:100–101`, `copilotContext.test.ts:93–94`, `src/copilot/actions/__tests__/actionExecutor.test.ts:91–92` — borrar `selectedEdge:null`/`selectedVertex:null`, agregar `saSelection:null`.

## Out of scope

- **Migración del modelo completo (C)** — diferida; solo si Samuel abre el eje arquitectónico con su propio RFC.
- **`selectedElasticId` muerto** — deuda separada (corte independiente del feature SA; B no lo toca, C lo eliminaría de paso).
- **Asimetría de `togglePieceSelection`** — deuda separada (B la deja viva; C la mata por construcción).
- **Corner-type multi-vertex (bulk vs N `updatePiece`)** — si el multi-select de vertices se quiere en este frente, necesita su propia decisión (DECISIÓN PENDIENTE secundaria). `VertexPropertiesSection` commitea via `updatePiece` (reemplaza la pieza entera); N de esos solo coalescen por timing (`UNDO_BATCH_MS=500`), no por batch explícito — un commit multi-vertex limpio pide un reducer nuevo. **Recomendación de alcance:** entregar primero multi-edge (width) y diferir multi-vertex.
- **Separación explícita foco/conjunto** (campo dedicado de "objeto enfocado" distinto del "conjunto editado") — se difiere; el foco se deriva (last-clicked = `items[items.length-1]`). Decisión consciente, no accidente.
- **Export AAMA / cross-language Rust/WASM** — sin impacto (la selección es estado de editor, no entra al solver ni al export).
