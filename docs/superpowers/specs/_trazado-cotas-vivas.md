# Mapa técnico — cotas vivas en el lienzo 2D

> Trazado de código para implementar chips de medida sobre el SVG (clic → input, arrastre → scrub) en tres superficies: línea interna seleccionada, pieza seleccionada o recién creada por rectángulo, y tramo en curso del trazo. Cada `ruta:línea` fue verificada leyendo el archivo. Los spec de referencia de los gestos recientes: `docs/superpowers/specs/2026-08-29-linea-interna-y-medidas-design.md` (línea interna, pluma, rectángulo, teclado).

---

## 1. Estado y render de líneas internas

**Tipo de datos**

| ruta:línea | qué es | forma |
|---|---|---|
| `src/types/types.ts:223` | union de tipos de interna | `InternalLineType = 'dart' \| 'grainline' \| 'notch' \| 'fold' \| 'pleat' \| 'topstitch' \| 'reference' \| 'seam'` |
| `src/types/types.ts:301-311` | entidad de almacenamiento | `interface InternalLine { id; type; path: PathCommand[]; notchOptions?; notchAnchor?; topstitchOptions?; foldOptions?; dartOptions? }` |
| `src/types/types.ts:250-259` | ancla paramétrica por arco (notch) | `interface NotchAnchor { refPoint: Point2D; direction: 'cw'\|'ccw'; distanceMm; metric?: RingMetric }` |
| `src/types/types.ts:793` | selección en `EditorState` | `selectedInternalLine: { pieceId: string; lineId: string } \| null` |

**Selección**

| ruta:línea | qué es |
|---|---|
| `src/store/editorSlice.ts:15` | estado inicial `selectedInternalLine: null` |
| `src/store/editorSlice.ts:117-123` | `selectInternalLine(state, action: PayloadAction<{pieceId; lineId}>)` — fija selección, `selectedPieceIds = [pieceId]`, limpia seam/POM/sa |
| `src/store/editorSlice.ts:65-77` | `togglePieceSelection` invalida la interna si la pieza deja de ser la selección única |
| `src/store/editorSlice.ts:79-116` | `clearSelection` / `selectAllPieces` / `selectAllVisiblePieces` / `selectSeam` / `selectPOM` la ponen a `null` |
| `src/components/PatternEditor/useEditorInteractions.ts:770-785` | **quién la despacha**: clic en `select` — `distToInternalLine(localX, localY, line.path)` (def. `:83-89`) contra umbral `LINE_THRESHOLD = screenToPatternLength(5, zoom2D)` (`:772`); si hay `nearestLine` → `dispatch(selectInternalLine(...))` (`:783`) |
| `src/components/PatternEditor/internalShapePath.ts:10` | extremos de una interna | `getInternalLineEndpoints(line: InternalLine): [Point2D, Point2D] \| null` |

**Render**

| ruta:línea | qué es |
|---|---|
| `src/components/PatternEditor/renderers/PieceRenderer.tsx:210-216` | `piece.internals.map(line => …)` — dibuja cada interna; `isLineSelected = isInternalLineSelected && selectedLineId === line.id` (`:213`); color vía `internalLineColor(line, isLineSelected)` (`:216`, token `internalLineStyle.ts`) |
| `src/components/PatternEditor/renderers/PieceRenderer.tsx:519, 537, 630-631` | prop `selectedInternalLine` de `PieceRenderer` → `isInternalLineSelected` + `selectedLineId` por pieza |
| `src/components/PatternEditor/PatternEditor.tsx:884-…` | montaje de `PieceRenderer` dentro de `<g data-pan-zoom-group>` (`:877`) |

**Edición de nodos de una interna HOY (solo extremos, no hay editor de nodos de internas)**

| ruta:línea | qué es |
|---|---|
| `src/components/PatternEditor/useEditorInteractions.ts:301-304` | `internalLineDragRef = useRef<{ pieceId; lineId; endpointIndex: 0\|1; startMouse; startPos }>` |
| `src/components/PatternEditor/useEditorInteractions.ts:720-744` | mousedown en `select`: hit-test del extremo con `EP_THRESHOLD = screenToPatternLength(8, zoom2D)` (`:729`) sobre `getInternalLineEndpoints` en coordenadas locales (`patternToPieceLocal`, `:728`) |
| `src/components/PatternEditor/useEditorInteractions.ts:834-871` | mousemove: reescribe el extremo (`:846-861`, soporta L/C/Q) y **despacha `updateInternalLine` en CADA move** (`:863-867`) |
| `src/components/PatternEditor/useEditorInteractions.ts:1036` | mouseup / cancel: `internalLineDragRef.current = null` |
| `src/store/projectSlice.ts:529-549` | `updateInternalLine(state, action: PayloadAction<{ pieceId; lineId; path; notchAnchor?; notchOptions? }>)` — reemplaza `path` y, si vienen, ancla/opciones; toca `updatedAt` + `isDirty` |
| `src/components/PatternEditor/nodeEditorUtils.ts:105-160` | el editor de nodos (`extractNodes`) es SOLO del contorno (`piece.outline`), no de internas; el gesto entra vía `useEditorInteractions.ts:761-767` (`findClickedAnchorPoint` + `nodeEditor.enterEdit`) |

---

## 2. Trazo en curso (pluma e línea interna)

**Estructura de nodos y panel**

| ruta:línea | qué es |
|---|---|
| `src/components/PatternEditor/usePenTool.ts:16-22` | `interface PenNode { anchor: Point2D; handleIn: Point2D \| null; handleOut: Point2D \| null }` |
| `src/components/PatternEditor/usePenTool.ts:25-29` | `interface NextPointState { from: Point2D; lengthMm: number; angleDeg: number }` |
| `src/components/PatternEditor/polyPenGeometry.ts:22-30` | `interface PolyPenNode { point: Point2D; type: 'straight'\|'curvePoints'\|'bezier'; handleIn?; handleOut? }` |
| `src/components/PatternEditor/polyPenGeometry.ts:111-114` | `polarPoint(from, lengthMm, angleDeg): Point2D` — 0° derecha, 90° ARRIBA; `y = from.y − L·sin θ` (la Y del patrón crece hacia abajo) |
| `src/components/PatternEditor/polyPenGeometry.ts:117-123` | `polarOf(from, to): { lengthMm; angleDeg }` — `atan2(−dy, dx)`; normaliza −0 → 0 |
| `src/components/PatternEditor/polyPenGeometry.ts:76-100` | `nodesToCommands(nodes, closed): PathCommand[]` — única conversión nodos→comandos (usada por motor y overlay) |

**Motor del trazo**

| ruta:línea | qué es |
|---|---|
| `src/components/PatternEditor/usePenTool.ts:117-125` | `buildGuidePath()` — la goma: `M last L cursor` (o C con `handleOut`) |
| `src/components/PatternEditor/usePenTool.ts:289-294` | `lastPointDistance = { distance, position: cursorPos }` — **solo largo**, se apaga con `willClose` (maria-196) |
| `src/components/PatternEditor/usePenTool.ts:215-222` | `openNextPoint()` (Tab): prefija con `polarOf(last.anchor, cursor)` |
| `src/components/PatternEditor/usePenTool.ts:231-245` | `placePolar(lengthMm, angleDeg)` — coloca esquina, el panel sigue abierto desde el nuevo nodo |
| `src/components/PatternEditor/usePenTool.ts:252-275` | `handleKeyDown(e): boolean` — Escape / Enter (≥2 nodos) / Tab / Backspace |
| `src/components/PatternEditor/usePolyPenTool.ts:37-44` | `SnapTarget { kind: 'firstNode'\|'vertex'\|'internalEnd'\|'outline'; pieceId; point }` — enganches |
| `src/components/PatternEditor/usePolyPenTool.ts:143-179` | `resolveSnap(world, allowFirstNode)` — prioridad: primer nodo → vértice → extremo de interna → contorno (`projectToRing` sobre `ringsByPiece`, memo `:124-132`) |
| `src/components/PatternEditor/usePolyPenTool.ts:340-347` | `openNextPoint()` — `polarOf(último nodo, lastWorldRef)` |
| `src/components/PatternEditor/usePolyPenTool.ts:358-367` | `placePolar` — `polarPoint(from, lengthMm, angleDeg)`, nodo del tipo latcheado, re-ancla `from` |
| `src/components/PatternEditor/usePolyPenTool.ts:370-394` | `handleKeyDown(e): boolean` — Tab `:380-383`, Enter `:377-379`, Escape `:373-376`, Backspace/Delete `:384-390` |

**Dibujo de la goma y readout (overlays SVG)**

| ruta:línea | qué es |
|---|---|
| `src/components/PatternEditor/renderers/overlays/PenToolOverlay.tsx:34-42` | goma de pluma (guía punteada); `:116-132` píldora de DISTANCIA sola (`formatDimension`), offset `(+22, −18)/zoom` desde el cursor |
| `src/components/PatternEditor/renderers/overlays/PolyPenToolOverlay.tsx:44, 70-72` | trazo confirmado (`nodesToCommands` → `pathD`) |
| `src/components/PatternEditor/renderers/overlays/PolyPenToolOverlay.tsx:49-50, 74-81` | `target = hover?.point ?? previewPoint`; goma punteada `il-rubber` |
| `src/components/PatternEditor/renderers/overlays/PolyPenToolOverlay.tsx:56-66` | **readout largo · ángulo** del tramo en curso (`len`, `ang = atan2(−dy,dx)`), texto `formatDimension(len) + ' · ' + ang.toFixed(1) + '°'` |
| `src/components/PatternEditor/renderers/overlays/PolyPenToolOverlay.tsx:141-148` | píldora `il-readout` con tokens `--readout-bg-2d` / `--readout-ink-2d` |

**Montaje en PatternEditor.tsx**

| ruta:línea | qué es |
|---|---|
| `src/components/PatternEditor/PatternEditor.tsx:195-196` | `const pen = usePenTool(zoom2D, pan2D, handlePieceComplete)`; `rectTool = useRectangleTool(...)` |
| `src/components/PatternEditor/PatternEditor.tsx:359-364` | `internalShapeTool = usePolyPenTool(zoom2D, pan2D, { nodeType: internalNodeType, pieces: drawablePieces, onComplete: handleInternalShapeComplete, onLockedPress })` |
| `src/components/PatternEditor/PatternEditor.tsx:1036-1048` | montaje de `PolyPenToolOverlay` (dentro del `<g data-pan-zoom-group>`) |
| `src/components/PatternEditor/PatternEditor.tsx:1126-1134` | `{activeTool === 'pen' && pen.nextPoint && <NextPointPanel key="pen" …/>}` |
| `src/components/PatternEditor/PatternEditor.tsx:1135-1143` | `{activeTool === 'internalShape' && internalShapeTool.nextPoint && <NextPointPanel key="internalShape" …/>}` |
| `src/components/PatternEditor/NextPointPanel.tsx:27-97` | panel flotante: inputs `#next-point-length` / `#next-point-angle` (string, `:28-29`), Enter coloca y se queda (`:38-43, 49-51`), Escape cierra (`:52-55`), `e.stopPropagation()` en todo keydown (`:48`), estado inválido si vacío (`:34-36`) |
| `src/utils/units.ts:9-15` | `formatDimension(valueMm: number, units: UnitSystem): string` — "N mm" / "N cm" / pulgadas |

---

## 3. Piezas: creación, selección y redimensionado

| ruta:línea | qué es |
|---|---|
| `src/components/PatternEditor/PatternEditor.tsx:184-193` | `handlePieceComplete(piece: Omit<PatternPiece,'id'\|'createdAt'\|'updatedAt'>)` → `newId()`, `dispatch(addPiece(fullPiece))`, `dispatch(selectPiece(fullPiece.id))` |
| `src/components/PatternEditor/useRectangleTool.ts:51-52` | ancho/alto leídos de la barra: `s.tools.toolOptions?.rectangle?.width ?? DEFAULT_MM` / `.height` (la canaleta actual, sección 8) |
| `src/components/PatternEditor/useRectangleTool.ts:64-73` | `previewRect { x, y, width, height }` (min + abs) — el bbox del rectángulo ya se calcula aquí |
| `src/components/PatternEditor/useRectangleTool.ts:75-88` | `create(x, y, w, h)` → outline `M/L/L/L/Z` + `onComplete` |
| `src/components/PatternEditor/PatternEditor.tsx:1111-1113` | `dispatch(selectPiece(pieceId))` desde el menú contextual (Propiedades) |
| `src/components/PatternEditor/PatternEditor.tsx:159` | `onOpenProperties: (id) => dispatch(selectPiece(id))` |

**Flujo de escala en `useTransformTool.ts` (lo que habría que reutilizar para `resizePieceTo(piece, wMm, hMm, anclaEsquina)`)**

| ruta:línea | qué es |
|---|---|
| `src/components/PatternEditor/useTransformTool.ts:88-94` | `useTransformTool(zoom2D, pan2D, pieces, selectedPieceIds, onTransform: (updates: TransformUpdate[]) => void)` |
| `src/components/PatternEditor/useTransformTool.ts:99-106` | `bbox = computeBoundingBox(pieces, selectedPieceIds)`; `handles = computeHandlePositions(bbox, zoom2D)` |
| `src/components/PatternEditor/useTransformTool.ts:207-269` | **commit de escala**: `uniform` (esquinas sin Shift o `ejesCruzados`, `:208-210, 83-86`); `computeScaleFromDrag` (`:211`); `scaleAnchorForHandle` → ancla en marco SIN girar (`:217`); ancla a espacio de patrón vía `rotatePoint(anchor, bboxPivot, radCaja)` (`:225-227`); por pieza: `patternToPieceLocal(anchorPatron, snap)` (`:229`), `scaleOutline(snap.outline, localCenter, scaleX, scaleY)` (`:233`), compensación de posición `plantado − alNuevoPivote` con `rotatePoint(localCenter, nuevoCentro, rad)` (`:247-253`), internas `transformInternals(...)` (`:259-267`) |
| `src/components/PatternEditor/useTransformTool.ts:60-68` | `transformInternals(snap, newOutline, mapPath, mapPoint)` — mapea `line.path` y luego `reanchorTransformedNotches(mapped, snap.outline, newOutline, mapPoint)` |
| `src/components/PatternEditor/useTransformTool.ts:116-143` | `handleMouseDown` — snapshot de piezas, umbral `HANDLE_HIT_THRESHOLD = 8` px (`:41`) |
| `src/components/PatternEditor/useTransformTool.ts:171-175` | guard anti-gesto vacío (`isDrag`, 4 px) — no commitear escala 1 (#1067) |
| `src/components/PatternEditor/useTransformTool.ts:180-206` | giro declarativo: escribe `rotation`, `outline`/`internals` intactos, posición orbita el pivote del grupo (#1033) |

**Utilidades puras (`src/utils/geometry/transform.ts`)**

| ruta:línea | firma |
|---|---|
| `src/utils/geometry/transform.ts:4` | `type HandleId = 'nw'\|'n'\|'ne'\|'w'\|'e'\|'sw'\|'s'\|'se'\|'rotate'` |
| `src/utils/geometry/transform.ts:12-29` | `interface BBox { x; y; width; height; rotation?; pivot? }` — caja SIN girar + rotación/pivote (convención del render `PieceRenderer.tsx:130`) |
| `src/utils/geometry/transform.ts:32-34` | `bboxPivot(bbox): Point2D` |
| `src/utils/geometry/transform.ts:48-80` | `computeBoundingBox(pieces, selectedIds): BBox \| null` — 1 pieza: caja orientada como ella; varias: eje-alineada de la geometría YA girada |
| `src/utils/geometry/transform.ts:138-166` | `computeHandlePositions(bbox, zoom = 1): HandlePosition[]` (rota con la caja) |
| `src/utils/geometry/transform.ts:171-188` | `scaleOutline(outline, center, scaleX, scaleY): PathCommand[]` (aplica a todos los pares xy) |
| `src/utils/geometry/transform.ts:222-231` | `rotatePoint(pt, center, angle /* rad */): Point2D` |
| `src/utils/geometry/transform.ts:239-261` | `outlineBBoxCenter(outline): Point2D` — pivote del renderizador |
| `src/utils/geometry/transform.ts:285-294` | `scaleAnchorForHandle(handleId, bbox): Point2D` — lado/esquina opuesta al handle (maria-198) |
| `src/utils/geometry/transform.ts:300-357` | `computeScaleFromDrag(handleId, bbox, dragStart, dragCurrent, uniform): { scaleX; scaleY }` — des-gira el arrastre (`:310-315`), clampa a ≥ 0.01 |
| `src/components/PatternEditor/pieceTransform.ts:13-18` | re-export de `patternToPieceLocal` / `pieceLocalToPattern` / variantes de dirección (definidas en `src/utils/geometry/pieceSpace.ts:24, 50, 68, 78`; quitan `position` + rotación alrededor de `outlineBBoxCenter`) |
| `src/components/PatternEditor/pieceTransform.ts:26-49` | `compensatePositionForPivotChange(piece, nextOutline): Point2D` — mantiene la geometría quieta si cambia el centro del bbox |
| `src/utils/notchReanchor.ts:40` | `reanchorTransformedNotches(...)` — re-deriva anclas de piquetes tras transformar (usada en `useTransformTool.ts:67`) |

---

## 4. Undo

| ruta:línea | qué es |
|---|---|
| `src/store/undoMiddleware.ts:35-36` | `MAX_HISTORY = 50`; `UNDO_BATCH_MS = 500` ("Batch rapid changes (e.g. slider drags) into one undo step") |
| `src/store/undoMiddleware.ts:505` | filtro: entra a historial `actionType.startsWith('project/') && !== 'project/restoreState' && !resetsUndoHistory` |
| `src/store/undoMiddleware.ts:518-519, 544-561` | coalescencia: misma `batchingAction` + mismo `activeAgentToolName` + `< UNDO_BATCH_MS` → NO nuevo snapshot; el `updateInternalLine` por-mousemove del arrastre de extremo (sección 1) se agrupa así |
| `src/store/undoMiddleware.ts:212-223` | `batchUndo<T>(dispatch: UndoDispatch, label: string, fn: () => T): T` — abre batch `'capture-all'` (`undo/startBatch`), ejecuta `fn()`, cierra en `finally` (`undo/endBatch`); todo `project/*` interno → UNA entrada con `actionType: 'batch'` (`:291`) |
| `src/store/undoMiddleware.ts:186-193` | `beginUndoBatch(dispatch, label): UndoBatchToken` / `endUndoBatch(dispatch, token)` — modo `'owned'` con token; gestos largos (uso real: `useEditCurve.ts:78`, `useEditPattern.ts:164`) |
| `src/store/undoMiddleware.ts:196-198` | `isUndoBatchTokenActive(token): boolean` |
| `src/store/undoMiddleware.ts:201-210` | `withUndoBatchToken(action, token)` — meta `undoBatchToken` en la action |
| `src/store/undoMiddleware.ts:375-382` | `activeBatchCaptures(action)` — captura si hay batch `capture-all` o el token de la action está en el stack |
| `src/store/undoMiddleware.ts:420, 545` | snapshot = **SOLO la slice `project`** (`(store.getState() as RootState).project`); la simulación se guarda aparte vía `registerSimulationCallbacks` (`:23-33`), `_snapshotSave('auto-pre-edit')` (`:539`), restore (`:451`) |
| `src/store/undoMiddleware.ts:305-343` | `ACTION_LABELS` — incluye `project/updateInternalLine: 'Edit Internal Line'` (`:319`) |
| **Ejemplo real de `batchUndo`** | `src/components/PatternEditor/PatternEditor.tsx:264` — `batchUndo(dispatch, 'Aplicar margen de costura de … mm a N piezas', () => { … })`. Otros: `src/components/BottomPanel/GradingTab.tsx:192`, `src/store/linkedEditingMiddleware.ts:100`, `src/store/autoSewThunk.ts:137` |

---

## 5. Distancias por el contorno

**Anclas de piquete (`src/utils/notchAnchor.ts`) — el contorno llega SIEMPRE en coordenadas locales de pieza (`PathCommand[]` de `piece.outline`)**

| ruta:línea | firma |
|---|---|
| `src/utils/notchAnchor.ts:146-150` | `computeNotchAnchor(outline: PathCommand[], snapPoint: Point2D, metric: RingMetric = 2): NotchAnchor \| null` — ancla un punto a la esquina detectada más cercana por arco (dir `'cw'`/`'ccw'`); null si no hay esquinas |
| `src/utils/notchAnchor.ts:315-318` | `resolveNotchAnchor(outline, anchor: NotchAnchor): { point: Point2D; normal: Point2D } \| null` — punto sobre el contorno + normal entrante |
| `src/utils/notchAnchor.ts:219-223` | `resolveNotchAnchorV2(outline, anchor, ring: OutlineRing): { point; normal } \| null` — variante con anillo ya construido (para hover) |
| `src/utils/notchAnchor.ts:101-102` | `outlinePerimeter(outline, metric: RingMetric = 1): number` — techo del arco |
| `src/utils/notchAnchor.ts:68-71` | `detectCorners(outline, thresholdDeg = 30): Point2D[]` — esquinas por desviación angular |
| `src/utils/notchAnchor.ts:47-48` | `ringOf(outline): Point2D[]` — aplanado v1 (dedupe de vértices duplicados) |
| `src/utils/notchAnchor.ts:120-138` | `arcPositionOf(ring, pt): { s; dist; perimeter }` (interno) — proyección de punto + arco |
| `src/utils/notchAnchor.ts:289-307` | `trackMovedCorner(prevOutline, outline, refPoint): Point2D \| null` — seguir una esquina arrastrada por ordinal |

**Anillo paramétrico (`src/utils/geometry/outlineRing.ts`) — la infraestructura para "medir arco entre dos puntos del contorno"**

| ruta:línea | firma |
|---|---|
| `src/utils/geometry/outlineRing.ts:10` | `type RingMetric = 1 \| 2` (v1 = cuerdas del aplanado; v2 = largo exacto por segmento, Gauss-Legendre) |
| `src/utils/geometry/outlineRing.ts:36-46` | `interface OutlineRing { metric; totalMm; subpathCount; readonly segments }` |
| `src/utils/geometry/outlineRing.ts:370-373` | `buildRing(outline: PathCommand[], metric): RingResult<OutlineRing>` — falla con `'arc-unsupported' \| 'degenerate' \| 'empty'` |
| `src/utils/geometry/outlineRing.ts:611-614` | `projectToRing(ring, p): { distanceMm; point }` — **proyectar un punto sobre el contorno** |
| `src/utils/geometry/outlineRing.ts:652-697` | `pointAt(ring, distanceMm): RingPoint { point; commandIndex; tLocal }` |
| `src/utils/geometry/outlineRing.ts:699-719` | `distanceAt(ring, at: { commandIndex; tLocal }): number` — arco de un punto identificado por comando |
| `src/utils/geometry/outlineRing.ts:721-732` | `advance(ring, fromMm, toMm, dir: 'cw'\|'ccw'): number` — distancia dirigida entre dos arcos |
| Otras utilidades de geometría | `src/utils/geometry/arcLength.ts` (largo exacto de curvas), `src/utils/geometry/bezier.ts` (`evalCubic`/`evalQuadratic`), `src/utils/geometry/distance.ts` (`distToSegmentWithT`), `src/utils/geometry/edgeInterpolation.ts`, `src/utils/seam/index.ts:347` `flattenPath(commands, resolution = CURVE_RESOLUTION): Point2D[]` y `:22` `flattenPathWithSource` |
| Conversión de espacio | `src/utils/geometry/pieceSpace.ts:24` `patternToPieceLocal(patternPt, piece): Point2D` — mundo → local de pieza (quita `position` y des-gira alrededor del pivote); `:78` `pieceLocalToPattern(localPt, piece): Point2D` |

---

## 6. Teclado

| ruta:línea | qué es |
|---|---|
| `src/components/PatternEditor/useEditorInteractions.ts:41-46` | `isEditableTarget(target): boolean` — guard: `INPUT \| TEXTAREA \| SELECT \| isContentEditable` ("Un campo editable es dueño de sus teclas") |
| `src/components/PatternEditor/useEditorInteractions.ts:426-510` | **CF-1**: `useEffect` con `window.addEventListener('keydown', onKeyCapture, { capture: true })` (`:508-509`) — la captura llega antes que el router global y que la burbuja |
| `src/components/PatternEditor/useEditorInteractions.ts:431-493` | `routeKey(e): 'internalShape'\|'pen'\|'rectangle'\|null` — interno: `internalShapeTool.handleKeyDown(e)` consume (`:434-441`), luego pluma (`:444-451`), rectángulo con press vivo (`:453-460`), y solo si `e.key !== 'Escape'` sale (`:461`); resto de herramientas con Escape propio (`:464-492`) |
| `src/components/PatternEditor/useEditorInteractions.ts:494-507` | `onKeyCapture`: si `isEditableTarget(e.target)` devuelve sin tocar (`:496`); si `routeKey` consumió → `preventDefault` + `stopPropagation` |
| **Tab abre "Siguiente punto"** | `src/components/PatternEditor/usePolyPenTool.ts:380-383` (`case 'Tab': openNextPoint()`) y `src/components/PatternEditor/usePenTool.ts:263-266` |
| `src/shortcuts/defaults.ts:10-113` | `DEFAULT_SHORTCUTS: ShortcutDef[]` — **Tab / Enter / dígitos NO están registrados como atajos**; Escape sí: `selection.deselect` (`:27`); dígitos: vistas de cámara `'2','8','4','6','5','0','1','3'` (`:91-98`) y fitmap Alt+dígitos (`:101-105`); atajos de herramientas 2D `:36-70` |
| `src/shortcuts/ShortcutProvider.tsx` | contexto + `useShortcutRegistry()` (leído por `ToolOptionsBar2D.tsx:26, 37`) |
| Visor 3D, dígitos | `src/components/Viewport3D/inputBindings.ts:44-53` `VIEW_BY_DIGIT`; `:60-69` `cameraViewFromKeyEvent(e): ViewPreset \| null` — rechaza ctrl/meta/alt, `regex /^(?:Numpad\|Digit)([0-9])$/`; `src/components/Viewport3D/Viewport3D.tsx:708-709` consume el preset; listener `window keydown` en `:727-728` |

---

## 7. Overlays DOM sobre el SVG

| ruta:línea | qué es |
|---|---|
| `src/components/PatternEditor/PatternEditor.tsx:860` | ancestro con `position: relative`: `<div className="pattern-editor">` (CSS `src/components/PatternEditor/PatternEditor.css:1-7` — `overflow: hidden`, "anchor for the EmptyState2D overlay") |
| `src/components/PatternEditor/PatternEditor.tsx:1080-1089` | `FloatingActionBar` monta como HERMANO del `<svg>` dentro de `.pattern-editor` (no dentro del grupo pan-zoom) |
| `src/components/PatternEditor/FloatingActionBar.tsx:54-61` | **fórmula bbox→pantalla**: `left = pan2D.x + (bbox.x + bbox.width/2) * zoom2D`; `boxTop = pan2D.y + bbox.y * zoom2D`; `boxBottom = pan2D.y + (bbox.y + bbox.height) * zoom2D`; `flipBelow` si el box roza el tope; `transform: translate(-50%, -100%)` |
| `src/components/PatternEditor/FloatingActionBar.tsx:63-80` | `position: 'absolute'`, `zIndex: 90` (literal inline — no token), colores/borde/radio inline |
| `src/components/PatternEditor/FloatingActionBar.tsx:51-52` | desmontaje: `!show \|\| !bbox \|\| isDragging \|\| contextMenuOpen \|\| calibrationActive \|\| !ctx \|\| actions.length === 0` |
| `pan2D/zoom2D` | vienen de Redux (`editorSlice.zoom2D/pan2D`, `types.ts:801-802`) y llegan como props desde `PatternEditor.tsx:1083-1084`; el `<g data-pan-zoom-group>` los aplica en `PatternEditor.tsx:877` |
| Otros overlays sobre `.pattern-editor` | `EmptyState2D` (`EmptyState2D.css:5,11` — absolute, z-index 1); `ContextMenu` (`src/styles/floating.css:169-170` — fixed); `NextPointPanel` (`NextPointPanel.css:4-8` — **fixed**, `top: calc(var(--top-bar-h) + 24px)`, `right: 24px`, `z-index: var(--z-menu)`); modales `NotchPrecisionModal` / `CalibrationModal` |
| Escala z en tokens | `src/styles/tokens.css:199-233` — `--z-dock: 5`, `--z-panel: 25`, `--z-hint: 50`, `--z-bar: 100`, `--z-menu: 200`, `--z-context-menu: 1000`, `--z-modal: 1100`, `--z-tooltip: 1150`, `--z-toast: 1200`, `--z-debug: 1300` ("nada de z-index literal", ley de emplazamiento 2026-08-14) |

---

## 8. Barra actual y sus tests

**La canaleta**

| ruta:línea | qué es |
|---|---|
| `src/components/shell/ToolOptionsBar2D.tsx:24-70` | `ToolOptionsBar2D` — canaleta superior permanente (nunca `return null`); lee `s.tools.activeTool2D` (`:27`) y `s.tools.toolOptions[herramientaActiva]` (`:28-30`), `toolRegistry.getTool` (`:32`), `useShortcutRegistry().getBinding` (`:37`); despacha `setToolOption` (`:40-45`) |
| `src/components/shell/ToolOptionsBar2D.tsx:78-105` | `NumberInput` — borrador local en string, solo números al store, suelta en blur |
| `src/components/shell/ToolOptionsBar2D.tsx:107-206` | `Control` — `number` (input/range), `select`, `toggle`, `color` |
| `src/components/shell/AppShell.tsx:289-298` | montaje: `<div className="canvas-area__2d"> <ToolOptionsBar2D/> <LeftDock/> <PatternEditor/> </div>` |
| `src/styles/layout.css:36-45` | `.canvas-area__2d { position: relative; overflow: hidden; display: flex; flex-direction: column; background: #f5f3f0 }` — la canaleta es hija en flujo y reserva alto |
| `src/styles/layout.css:51-54` | `.canvas-area__2d > .pattern-editor { flex: 1 1 0; min-height: 0 }` |

**Tests que fijan barra y "Siguiente punto" (rutas para borrar/reescribir)**

| ruta | qué fija |
|---|---|
| `src/components/shell/__tests__/ToolOptionsBar2D.test.tsx` | unit de la canaleta (monta `<ToolOptionsBar2D/>` en `:94, 158, 206`) |
| `src/components/shell/__tests__/AppShell.canaletas.test.tsx` | posicionamiento del split; referencia textual `className="canvas-area__2d"` (`:65-95`) |
| `tests/e2e/barra-opciones-herramienta.spec.ts` | e2e de la canaleta #1049: boundingBox de `.tool-options-bar` (`:61`), estilo (`:70`), toggle (`:153-154`) |
| `src/components/PatternEditor/__tests__/NextPointPanel.test.tsx` | unit del panel (largo/ángulo, CSS con tokens en `:77`) |
| `src/components/PatternEditor/__tests__/usePenTool.test.ts:57-122` | unit "Siguiente punto": Tab abre, `placePolar`, cierre |
| `src/components/PatternEditor/__tests__/usePolyPenTool.test.tsx:282-352` | unit de `nextPoint`/`placePolar` del motor de línea interna |
| `tests/e2e/maria-195-siguiente-punto.spec.ts` | e2e: Tab abre el panel (`:47`), rellena `#next-point-length`/`#next-point-angle` (`:50-57`) |
| `tests/e2e/linea-interna-gramatica.spec.ts` | e2e: gramática completa de línea interna (tipos, enganches, teclado en captura, bloqueo) |
| `tests/e2e/medidas-escritas-gramatica.spec.ts:68-75` | e2e: escribe medidas en el panel "Siguiente punto" |
| `tests/e2e/maria-205-linea-interna.spec.ts` | e2e: recorrido de tarjetas de línea interna |

---

## 9. HintText.tsx — frases actuales

| ruta:línea | tool | texto |
|---|---|---|
| `src/components/PatternEditor/renderers/HintText.tsx:56-62` | `internalShape` | 0 nodos: `'Clic dentro de una pieza para empezar · las esquinas y los bordes enganchan'`; trazando: `'Clic añade · arrastra para curvar · Tab escribe largo y ángulo · doble clic o Enter termina · clic en el primer punto cierra · Retroceso quita el último · Esc descarta'` |
| `src/components/PatternEditor/renderers/HintText.tsx:64-66` | `pen` (con nodos) | `'Clic añade · arrastra para curvar · Tab escribe largo y ángulo · clic en el primer punto cierra · Enter o doble clic termina · Retroceso quita el último · Esc cancela'` |
| `src/components/PatternEditor/renderers/HintText.tsx:68-70` | `rectangle` | `'Arrastra para dibujar · un clic crea con el Ancho y el Alto de la barra · Esc cancela'` |
| `src/components/PatternEditor/renderers/HintText.tsx:72-77` | `pen` vacío (sin piezas) | `'Clic para añadir puntos · arrastra para curvar · clic en el primer punto para cerrar · Enter termina abierto · Esc cancela'` |
| Montaje | `src/components/PatternEditor/PatternEditor.tsx:1059-1069` | props `activeTool`, `penNodesLength`, `internalShapeNodesLength`, etc. |
| Tinta | `src/components/PatternEditor/renderers/HintText.tsx:20-29` | usa `--ink-hint`, NUNCA `--text-*` (contraste 1.05:1 documentado) — ver sección 11 |

---

## 10. Tokens (`src/styles/tokens.css`)

| token | valor | línea |
|---|---|---|
| `--text-primary` / `--text-secondary` / `--text-muted` / `--text-ghost` / `--text-dim` | `#e2e8f0` / `#a0a0c0` / `#8888a8` / `#6a6a8a` / `#4a4a6a` | 11-15 |
| `--accent` / `--accent-hover` | `#6366f1` / `#818cf8` | 16-17 |
| `--accent-subtle` / `--accent-border` | `rgba(99, 102, 241, 0.13)` / `rgba(99, 102, 241, 0.27)` | 18-19 |
| `--surface-overlay-bg` | `rgba(8, 8, 15, 0.92)` | 164 |
| `--surface-overlay-border` | `1px solid rgba(99, 102, 241, 0.15)` | 165 |
| `--surface-overlay-radius` | `var(--radius-xl)` | 166 |
| `--surface-overlay-shadow` | `0 8px 32px rgba(0, 0, 0, 0.4)` | 167 |
| `--surface-overlay-blur` | `blur(16px)` | 168 |
| `--surface-overlay-radius-pill` | `999px` | 174 |
| `--surface-overlay-bg-recessed` / `--surface-overlay-shadow-recessed` | `rgba(8, 8, 15, 0.78)` / `0 4px 18px rgba(0, 0, 0, 0.22)` | 181-182 |
| `--ink-on-light` / `--ink-on-light-2` / `--ink-on-light-3` | `#2b2d33` / `#6f7480` / `#a0a5b0` (papel claro 2D) | 36-38 |
| `--accent-2d` | `oklch(0.66 0.16 248)` (selección + costuras) | 39 |
| `--ink-hint` | `#6b6459` | 73 |
| `--font-mono-2d` | `'JetBrains Mono', 'SF Mono', 'Fira Code', ui-monospace, monospace` | 41 |
| `--font-mono` | `'SF Mono', 'JetBrains Mono', 'Fira Code', monospace` | 88 |
| `--radius-sm/md/lg/xl` | `6px / 8px / 10px / 12px` | 109-112 |
| `--text-xs/sm/ui/input/heading/title` | `clamp(10px,…)/…` (13→20px) | 89-94 |
| `--z-*` | escala 5→1300 (sección 7) | 199-233 |
| Readouts 2D (no pedidos pero usados por el readout actual) | `--readout-bg-2d` / `--readout-ink-2d` consumidos en `PolyPenToolOverlay.tsx:143-144` | (definidos en tokens.css) |

---

## 11. Riesgos vistos en el código

1. El arrastre de extremo de interna despacha `updateInternalLine` en cada mousemove (`useEditorInteractions.ts:863-867`) y solo se agrupa por la coalescencia de 500 ms del undo (`undoMiddleware.ts:519, 544`); un chip de cota que escriba por scrub sobre ese mismo canal heredará esa cadencia y esa agrupación temporal.
2. El arrastre de extremo reescribe `path` sin tocar `notchAnchor`/`notchOptions` (`useEditorInteractions.ts:845-867` vs `projectSlice.ts:542-544`): una cota de distancia que se edite moviendo un extremo de una interna de tipo `notch` dejaría el ancla desincronizada del path.
3. No existe editor de nodos para internas — solo extremos; `extractNodes` es del contorno (`nodeEditorUtils.ts:105`). Cualquier cota que quiera "tramos" de una interna curva tiene que operar sobre `line.path` directamente (M/L/C/Q con manejadores), sin apoyo de la infraestructura de nodos.
4. El bbox de pieza es "caja SIN girar + `rotation`/`pivot`" (`transform.ts:12-29`, convención del render `PieceRenderer.tsx:130`); una cota de ancho/alto que calcule su propio AABB ignorando esa convención no le caerá encima a la pieza girada.
5. Escalar una pieza GIrada no es `scaleOutline` a secas: exige des-girar el arrastre (`computeScaleFromDrag` `:310-315`), ancla en marco sin girar llevada a patrón (`:225-227`), compensación de posición (`:247-253`) y re-anclaje de piquetes (`transformInternals` `:60-68`); en grupos con piezas de distinta rotación el escalado se fuerza uniforme (`ejesCruzados` `:83-86`). Un `resizePieceTo(w, h, esquina)` sin ese flujo corrompe la geometría.
6. `NextPointPanel` captura Enter/Escape con `stopPropagation` (`NextPointPanel.tsx:45-56`) y el router CF-1 ignora teclas dentro de `INPUT/TEXTAREA/SELECT` (`useEditorInteractions.ts:42-46, 496`): los inputs de cotas en sitio dependen del mismo guard — si el chip no es un `input` nativo, el router les roba las teclas.
7. Ya existen dos readouts distintos en el lienzo: la pluma muestra SOLO largo (`PenToolOverlay.tsx:116-132`, `formatDimension`) y la línea interna largo · ángulo con convención 0°-derecha/90°-arriba (`PolyPenToolOverlay.tsx:56-66`, `polyPenGeometry.ts:106-122`). Reutilizar `polarOf` para una cota sin esa convención da ángulos invertidos (la Y del patrón crece hacia abajo).
8. La tinta correcta sobre el papel claro es `--ink-on-light-*` / `--ink-hint` / `--readout-*-2d`; `--text-*` y `--accent` son del cromo oscuro (`tokens.css:11-19` vs `36-41, 67-73`) y el trinquete R3 del contrato de UI cuenta literales en `.tsx`. Además `FloatingActionBar` usa `zIndex: 90` literal (`FloatingActionBar.tsx:71`) que no existe en la escala de tokens (`--z-*`): un overlay de cotas no debe imitarlo, debe elegir token.
