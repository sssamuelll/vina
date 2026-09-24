/**
 * useEditPattern.ts — Edit Pattern (Q) hook.
 *
 * Manages point/segment selection (including multi-select and marquee),
 * dragging points and segments, and delegates mutations (add, delete, convert)
 * to nodeEditorUtils.
 *
 * Does NOT show bezier handles — that is for useEditCurve.
 */

import { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { RootState } from '../../store';
import { updatePiece, removeInternalLine, removeTramosDeInterna } from '../../store/projectSlice';
import { selectInternalLine, selectPiece } from '../../store/editorSlice';
import {
  beginUndoBatch,
  endUndoBatch,
  isUndoBatchTokenActive,
  withUndoBatchToken,
  type UndoBatchToken,
} from '../../store/undoMiddleware';
import type { Point2D, PatternPiece, PathCommand, Trazo } from '../../types/types';
import { esInternaEditable, seBorraEntera } from '../../types/types';
import {
  extractNodes,
  applyNodeMove,
  applyAnchorMoves,
  splitSegmentAt,
  convertToCurve,
  convertToLine,
  anchorGroupOf,
  coincidentAnchorGroups,
  type EditableNode,
} from './nodeEditorUtils';
import { screenToPattern, screenToPatternLength } from '../../utils/geometry';
import { piezaBloqueada } from '../../utils/piezaBloqueada';
import { convertSegmentToSpline, resmoothAfterMove, toManualBezier } from './splineSegment';
import { guiasShift, type GuiaShift, type GuiasShift } from './restriccionShift';
import { useShiftSostenido, type ModoShift } from './useShiftSostenido';
import { ABSOLUTE_REFERENCE, arrivingReferenceOnPath, chordReference, type AngleReference } from './angleReference';
import { EDGE_HIT_PX, isDrag } from './gestureConstants';
import { buildSnapIndex, resolveSnap, type SnapIndex } from './snapIndex';
import { agarrar, type Agarre } from './agarreDeQ';
import { showInfoToast } from '../../store/copilotUISlice';
import { pushJournal } from '../../utils/telemetry/journal';
import {
  patternToPieceLocal,
  patternToPieceLocalDirection,
  pieceLocalToPattern,
} from './pieceTransform';
export { patternToPieceLocal, pieceLocalToPattern } from './pieceTransform';
import {
  conPaths, CLAVE_CONTORNO, claveDeInterna, lineIdDeClave, pathDeLinea, quitarPuntos, type ClaveLinea,
} from './lineaEditable';
import { puntoUnicoDeLinea } from './cotas/nodo';
import {
  INITIAL_STATE, SIN_INTERNAS, algoElegido, arrastreDe, conLinea, estadoDeEntrada, extraerInternas,
  findFromNode, hoverDe, internaElegidaDe, marcoSelecciona, mismosPaths, pathsEditables,
  refrescarLineas, resyncStateToPiece, sinHover, sinPuntos, sinSeleccion, sinTramos, vistas,
  type ArrastreDeLinea, type EdicionDeInterna, type EditPatternState,
} from './estadoDeQ';

export { resyncStateToPiece } from './estadoDeQ';
export type { EditPatternState } from './estadoDeQ';

// ─── Constants ───

const HIT_RADIUS_PX = 8; // screen pixels
const NO_HIDDEN_LAYER_IDS: number[] = [];
const SIN_TRAZOS: Trazo[] = [];

// ─── Drag ref types ───

/** Lo que comparten el arrastre de puntos y el de tramos. */
interface OutlineDrag {
  startMouse: Point2D;
  /**
   * Las líneas que mueve el gesto, cada una con su punto de partida. Todas con
   * el mismo vector (spec 2026-09-24 § 4.1).
   */
  porLinea: Map<ClaveLinea, ArrastreDeLinea>;
  /** Último ratón del arrastre: pulsar Shift con la mano quieta lo re-aplica. */
  lastMouse?: Point2D;
  /** El último desplazamiento escrito (marco local). */
  lastDelta?: Point2D;
  /** Ya escribió al menos un frame. */
  wrote?: boolean;
  /** Shift+press sobre algo ya seleccionado: se quita al soltar si no hubo arrastre. */
  quitarAlSoltar?: { clave: ClaveLinea; indices: readonly number[] };
  /**
   * El marco de Shift dos veces, congelado al empezar (spec 2026-09-23 § 3.4):
   * desde dónde salen las guías —la posición inicial del punto agarrado, o el
   * punto del lado donde se pulsó— y respecto a qué lado, en espacio de patrón.
   * Un marco vivo giraría la guía bajo la mano mientras el lado se inclina.
   */
  marco: { desde: Point2D; referencia: AngleReference };
  /**
   * Arrastrando UN punto de una interna: engancha (spec § 4.3). El índice se
   * construye al empezar, sin la propia línea; `desde` es la posición local
   * del punto agarrado al empezar.
   */
  enganche?: { indice: SnapIndex; desde: Point2D };
}

interface NodeDrag extends OutlineDrag {
  type: 'node';
}

interface SegmentDrag extends OutlineDrag {
  type: 'segment';
}

interface MarqueeDrag {
  type: 'marquee';
  startMouse: Point2D;
  startPositions: Map<number, Point2D>; // unused, kept for type uniformity
}

type DragState = NodeDrag | SegmentDrag | MarqueeDrag;

// ─── Pure helpers ───

/**
 * Where a double-click should insert a new point, if anywhere. Guards against
 * the phantom-point bug: a click on (or near) an existing anchor must NOT
 * split the adjacent segment — at a corner the vertex lies on both segments
 * at distance ~0, so the segment test alone always passes there.
 */
export function findInsertTarget(
  localPt: Point2D,
  nodes: EditableNode[],
  outline: PathCommand[],
  hitRadius: number,
): { commandIndex: number; t: number } | null {
  // `agarrar` never returns nearestSegment's phantom closing edge of an OPEN
  // outline — there is no real edge there, so inserting is meaningless
  // (and would push a junk no-op entry onto the undo stack).
  const hit = agarrar([{ clave: CLAVE_CONTORNO, path: outline, nodes }], localPt, hitRadius, null);
  return hit?.tipo === 'tramo' ? { commandIndex: hit.commandIndex, t: hit.t } : null;
}

/** Lo que el hover antes de entrar lee de una pieza: su contorno y sus internas editables. */
export interface LineasDeHover {
  nodes: EditableNode[];
  internas: EdicionDeInterna[];
}

/**
 * Las líneas de cada pieza para el hover antes de entrar, precalculadas por
 * identidad y no por evento (spec 2026-09-24 § 13). El reductor nunca muta una
 * pieza: un cambio en cualquiera de sus paths trae un objeto nuevo, así que
 * una entrada no puede quedarse con la geometría de antes. Nadie escribe en
 * ellas —`sinHover` y `conLinea` copian—, y el test del hover lo fija.
 */
const lineasPorPieza = new WeakMap<PatternPiece, LineasDeHover>();

export function lineasDeHover(piece: PatternPiece): LineasDeHover {
  let lineas = lineasPorPieza.get(piece);
  if (!lineas) {
    lineas = { nodes: extractNodes(piece), internas: extraerInternas(piece) };
    lineasPorPieza.set(piece, lineas);
  }
  return lineas;
}

/**
 * El hover antes de entrar, perdido: nada bajo el ratón y ninguna interna, que
 * eran las de la pieza de debajo (spec § 3.2). Un estado que ya entró no es
 * del hover y sigue como estaba.
 */
function hoverPerdido(s: EditPatternState): EditPatternState {
  return s.isEditing ? s : { ...sinHover(s), hoveredPieceId: null, internas: SIN_INTERNAS };
}

// ─── Hook ───

export function useEditPattern(zoom: number, pan: Point2D) {
  const dispatch = useDispatch();
  const pieces = useSelector((s: RootState) => s.project.pieces);
  const layerLocked = useSelector((s: RootState) => s.project.layerLocked);
  // `?? []`: varios arneses de prueba de este hook montan una tienda mínima
  // con solo el reducer `project` (útil desde antes de esta tanda). Con
  // `simulation` ausente ahí, este selector no puede exigirlo.
  const hiddenLayerIds = useSelector((s: RootState) => s.simulation?.hiddenLayerIds ?? NO_HIDDEN_LAYER_IDS);
  // Mismo criterio que `drawablePieces`/`PieceRenderer` (PatternEditor.tsx:198-206):
  // "solo lo que se dibuja puede prometer una lectura o recibir el clic", y
  // de arriba hacia abajo — si dos piezas se solapan, el hover-sin-clic no
  // puede señalar una que el clic real (hit-test del DOM, topmost por
  // definición) ignoraría por estar tapada.
  const hoverablePieces = useMemo(
    () => pieces
      .filter(p => !piezaBloqueada(p, layerLocked) && !hiddenLayerIds.includes(p.layer ?? 1))
      .sort((a, b) => (a.zOrder ?? 0) - (b.zOrder ?? 0))
      .reverse(),
    [pieces, hiddenLayerIds, layerLocked],
  );
  // La interna elegida tiene una sola fuente, la de Z (spec 2026-09-24 § 3.5).
  // `?.`/`??`: los arneses de prueba de antes no montan `editor`.
  const selectedInternalLine = useSelector((s: RootState) => s.editor?.selectedInternalLine ?? null);
  /**
   * La misma, leída al soltarla: quien la suelta (el resync, la entrada, Esc,
   * `publicarElegida`) no se re-crea cada vez que cambia.
   */
  const selectedInternalLineRef = useRef(selectedInternalLine);
  selectedInternalLineRef.current = selectedInternalLine;
  const trazos = useSelector((s: RootState) => s.project.trazos ?? SIN_TRAZOS);
  const showTrazos = useSelector((s: RootState) => s.editor?.showTrazos ?? true);
  /** Lo visible en orden de dibujo, para el enganche (la última pieza, encima). */
  const visiblesEnOrden = useMemo(
    () => pieces
      .filter(p => !hiddenLayerIds.includes(p.layer ?? 1))
      .sort((a, b) => (a.zOrder ?? 0) - (b.zOrder ?? 0)),
    [pieces, hiddenLayerIds],
  );
  /** El punto al que engancha el arrastre de una interna, en patrón (spec § 4.3). */
  const [enganche, setEnganche] = useState<Point2D | null>(null);
  const publicarEnganche = useCallback((p: Point2D | null) => {
    setEnganche(prev => (prev === p || (prev && p && prev.x === p.x && prev.y === p.y) ? prev : p));
  }, []);

  const [state, setState] = useState<EditPatternState>({ ...INITIAL_STATE });
  /** Shift ahora mismo: la pista del pie lo lee antes de agarrar nada. */
  const [modoShift, setModoShift] = useState<ModoShift>('suelto');
  /** Las guías del arrastre en curso, para `GuiasShiftOverlay`. */
  const [guias, setGuias] = useState<GuiasShift | null>(null);
  /** Solo reescribe el estado si lo que se pinta cambió. */
  const publicarGuias = useCallback((g: GuiasShift | null) => {
    setGuias(prev => (mismasGuias(prev, g) ? prev : g));
  }, []);

  useEffect(() => {
    if (state.isEditing || !state.hoveredPieceId) return;
    if (hoverablePieces.some(piece => piece.id === state.hoveredPieceId)) return;
    setState(hoverPerdido);
  }, [hoverablePieces, state.isEditing, state.hoveredPieceId]);

  const dragRef = useRef<DragState | null>(null);
  const dragBatchTokenRef = useRef<UndoBatchToken | null>(null);

  const beginDragBatch = useCallback((): UndoBatchToken => {
    const current = dragBatchTokenRef.current;
    if (current && isUndoBatchTokenActive(current)) return current;
    const token = beginUndoBatch(dispatch, 'Editar puntos del patrón');
    dragBatchTokenRef.current = token;
    return token;
  }, [dispatch]);

  const endDragBatch = useCallback(() => {
    const token = dragBatchTokenRef.current;
    if (!token) return;
    dragBatchTokenRef.current = null;
    endUndoBatch(dispatch, token);
  }, [dispatch]);
  /**
   * Los paths editables (contorno e internas, por identidad) que este hook
   * acaba de escribir. El resync trata un cambio de `pieces` como propio solo
   * si los paths del store SON estos: un booleano consumiría mal una
   * restauración externa que caiga en el mismo lote de React.
   */
  const expectedPathsRef = useRef<PathCommand[][] | null>(null);
  /** Los últimos paths editables (por identidad) de la pieza en edición. */
  const seenPathsRef = useRef<PathCommand[][] | null>(null);
  /**
   * Espejo de `state.editingPieceId` para `escribirLineas`, que necesita
   * saber a quién pertenece el overlay sin re-crearse en cada cambio de estado
   * (su identidad alimenta media docena de useCallback aguas abajo).
   */
  const editingPieceIdRef = useRef<string | null>(null);
  editingPieceIdRef.current = state.editingPieceId;

  // ─── Coordinate helpers ───

  /** Convert screen coords to pattern-space coords (accounting for pan/zoom) */
  const toPattern = useCallback(
    (e: React.MouseEvent<SVGSVGElement>): Point2D => {
      const rect = e.currentTarget.getBoundingClientRect();
      return screenToPattern(e.clientX, e.clientY, rect, zoom, pan);
    },
    [zoom, pan],
  );

  /** Convert screen coords to piece-local coords (undo position + render rotation) */
  const toLocal = useCallback(
    (e: React.MouseEvent<SVGSVGElement>, piece: PatternPiece): Point2D =>
      patternToPieceLocal(toPattern(e), piece),
    [toPattern],
  );

  /** Hit radius in pattern-space units */
  const hitRadius = screenToPatternLength(HIT_RADIUS_PX, zoom);

  // ─── Helper: get current piece ───

  const getPiece = useCallback(
    (pieceId: string | null): PatternPiece | undefined => {
      if (!pieceId) return undefined;
      return pieces.find(p => p.id === pieceId);
    },
    [pieces],
  );

  // ─── Helper: la puerta de escritura de los gestos y los verbos (spec 2026-09-24 § 8) ───
  //
  // No es la única: Supr (`handleKeyDown`) escribe por la suya. Sus puntos
  // pasan por `conPaths` con un `updatePiece` propio, y sus tramos van a los
  // reductores `removeTramosDeInterna` y `removeInternalLine`, que no pasan
  // por `conPaths`: lo que esa puerta rehace al escribir —la copia `darts` de
  // una pinza— lo rehace ahí el reductor (revisión final de la frontera, I-1).

  const escribirLineas = useCallback(
    (
      piece: PatternPiece,
      cambios: ReadonlyMap<ClaveLinea, PathCommand[] | null>,
      undoBatchToken?: UndoBatchToken,
    ) => {
      const updated = conPaths(piece, cambios);
      const action = updatePiece(updated);
      dispatch(undoBatchToken ? withUndoBatchToken(action, undoBatchToken) : action);
      // El overlay pinta `nodes` con la transformada de `editingPieceId`, así
      // que un verbo sobre OTRA pieza no puede reescribirlos: serían las
      // coordenadas LOCALES de una pieza dibujadas en el sitio de otra. Ese es
      // el eco del #218 — el tool Punto pasa su propio `pieceId` ("callers
      // fuera del modo edición") y con Editar patrón abierto sobre A, poner un
      // punto en B dejaba las anclas de B flotando sobre la lona.
      if (piece.id === editingPieceIdRef.current) {
        expectedPathsRef.current = pathsEditables(updated);
        // Si el verbo insertó o borró comandos, todo índice guardado corrió de
        // sitio y pasa a denotar OTRA geometría — exactamente lo que el JSDoc
        // de `resyncStateToPiece` explica para el undo externo. Es el mismo
        // caso, así que es la misma limpieza (#1122). Lo mismo si quitó una
        // línea entera: sus índices tampoco denotan ya nada.
        //
        // Con guarda de longitud y no siempre: arrastrar y `moveNodeTo` mutan
        // valores en el sitio, y hay un contrato verde que EXIGE que la
        // selección sobreviva a un arrastre.
        //
        // ponytail: la longitud basta hoy porque ningún verbo inserta y borra
        // a la vez; si alguno llega con saldo neto cero, esto pasa a ser un
        // parámetro explícito del verbo.
        const estructural = [...cambios].some(([clave, path]) => {
          const antes = pathDeLinea(piece, clave);
          return !path || !antes || path.length !== antes.length;
        });
        setState(s => (estructural
          ? resyncStateToPiece(s, updated)
          : refrescarLineas(s, updated, cambios.keys())));
        // Un cambio estructural corre los índices de CUALQUIER línea: el
        // `segmentIndex` global de Z (spec § 3.5) podría señalar otra
        // geometría. Sin soltarla aquí, un doble clic o un convertir-a-puntos
        // sobre el tramo elegido dejaba el resaltado mintiendo, Supr borraba
        // la mitad equivocada y Esc sacaba de Q con la interna todavía
        // elegida fuera — la misma regresión que cerró la tanda de arreglos
        // de la Tarea 8.
        if (estructural && selectedInternalLineRef.current) dispatch(selectPiece(piece.id));
      }
    },
    [dispatch],
  );

  /** Solo el contorno: lo que escribían los verbos de siempre. */
  const escribirContorno = useCallback(
    (piece: PatternPiece, outline: PathCommand[], undoBatchToken?: UndoBatchToken) =>
      escribirLineas(piece, new Map([[CLAVE_CONTORNO, outline]]), undoBatchToken),
    [escribirLineas],
  );

  // ─── Helper: candado en los verbos ───

  /**
   * Candado (maria-204) en la puerta común: los verbos de este hook son el
   * único camino compartido de TODOS sus callers (menú contextual + tool
   * Punto). El gate `notLocked` de actionCuration protege solo la puerta del
   * menú — sin este guard, el tool Punto escribiría sobre piezas bloqueadas.
   * Mismo aviso que enterEdit.
   */
  const guardLocked = useCallback(
    (piece: PatternPiece): boolean => {
      if (!piece.locked) return false;
      dispatch(showInfoToast('Pieza bloqueada: se puede mover, pero no editar. Desbloquéala con clic derecho.'));
      return true;
    },
    [dispatch],
  );

  /** La clave de la interna elegida en ESTA pieza, o null (spec § 3.5). */
  const claveElegida = useCallback((pieceId: string) => (
    selectedInternalLine?.pieceId === pieceId ? claveDeInterna(selectedInternalLine.lineId) : null
  ), [selectedInternalLine]);

  /**
   * Q escribe la interna elegida cuando lo elegido es de una interna, y la
   * vacía —dejando la pieza— cuando deja de serlo. Nunca guarda una interna
   * elegida que Z no conozca: dos fuentes se desincronizan.
   *
   * La vacía aunque sea de otra pieza, como elegir una ya la mueve aquí: sin
   * nada de una interna elegido en Q, Supr sigue a la puerta global, y una
   * línea elegida ahí se borraría entera.
   */
  const publicarElegida = useCallback((pieceId: string, next: EditPatternState) => {
    const elegida = internaElegidaDe(next);
    if (elegida) dispatch(selectInternalLine({ pieceId, ...elegida }));
    else if (selectedInternalLineRef.current) dispatch(selectPiece(pieceId));
  }, [dispatch]);

  /** El índice de enganche de lo visible, sin la interna que se arrastra (spec § 4.3). */
  const indiceSin = useCallback((piece: PatternPiece, lineId: string): SnapIndex => buildSnapIndex(
    visiblesEnOrden.map(p => (p.id === piece.id
      ? { ...p, internals: p.internals.filter(l => l.id !== lineId) }
      : p)),
    showTrazos ? trazos : SIN_TRAZOS,
  ), [visiblesEnOrden, showTrazos, trazos]);

  // ─── enterEdit ───

  const enterEdit = useCallback(
    (pieceId: string) => {
      endDragBatch();
      const piece = pieces.find(p => p.id === pieceId);
      if (!piece) return;
      if (piece.locked) {
        // Bloqueada = no editable (maria-204). Sin aviso sería otro "clicaba
        // y nada pasaba"; el toast enseña la regla y la salida.
        dispatch(showInfoToast('Pieza bloqueada: se puede mover, pero no editar. Desbloquéala con clic derecho.'));
        return;
      }
      // Q edita un objeto a la vez (spec 2026-09-24 § 3.1): la interna elegida
      // de otra pieza se suelta al entrar, o Supr la borraría por la puerta
      // global mientras se edita esta. La de esta misma pieza se queda: el
      // doble clic desde Z (§ 5.3) entra con ella elegida.
      const elegidaFuera = selectedInternalLineRef.current;
      if (elegidaFuera && elegidaFuera.pieceId !== pieceId) dispatch(selectPiece(pieceId));
      seenPathsRef.current = pathsEditables(piece);
      expectedPathsRef.current = null;
      setState(estadoDeEntrada(piece));
      dragRef.current = null;
      setGuias(null);
      publicarEnganche(null);
    },
    [pieces, endDragBatch, dispatch, publicarEnganche],
  );

  /**
   * Elige lo agarrado y arma el gesto (spec 2026-09-24 §§ 3.4-4.3). Lo comparten
   * el press dentro de la pieza en edición y el primer press que entra en ella:
   * un solo sitio decide qué queda elegido, qué se mueve, el marco de Shift y
   * si engancha.
   */
  const armarGesto = useCallback(
    (piece: PatternPiece, base: EditPatternState, hit: Agarre, e: React.MouseEvent<SVGSVGElement>): EditPatternState => {
      const linea = vistas(base, piece.outline).find(l => l.clave === hit.clave);
      if (!linea) return base;
      const aditivo = e.shiftKey;
      const lineId = lineIdDeClave(hit.clave);
      let next: EditPatternState;
      let quitarAlSoltar: OutlineDrag['quitarAlSoltar'];
      let marco: OutlineDrag['marco'];
      let grupo: number[] = [];
      if (hit.tipo === 'punto') {
        // A coincident group is one point: selecting a member selects them all,
        // so Delete removes the corner instead of leaving its twin behind.
        const miembros = anchorGroupOf(linea.path, hit.commandIndex);
        grupo = miembros.length > 0 ? miembros : [hit.commandIndex];
        // Shift+press sobre un punto YA seleccionado: quitarlo se decide al
        // soltar, y solo si no hubo arrastre. Pulsar Shift y después agarrar es
        // como se endereza un arrastre (firma del 23-09); quitarlo en el press
        // dejaba el arrastre sin sujeto y el punto no se movía.
        if (aditivo && linea.selectedNodes.has(hit.commandIndex)) quitarAlSoltar = { clave: hit.clave, indices: grupo };
        // Un gesto mueve puntos o tramos, nunca las dos cosas.
        const limpio = sinTramos(aditivo ? base : sinSeleccion(base));
        const nodos = new Set(aditivo ? linea.selectedNodes : []);
        for (const ci of grupo) nodos.add(ci);
        next = conLinea(limpio, hit.clave, { selectedNodes: nodos });
        const pos = linea.nodes.find(n => n.ref.commandIndex === hit.commandIndex)?.position ?? toLocal(e, piece);
        marco = marcoDelPunto(piece, linea.path, pos, hit.commandIndex);
      } else {
        // El mismo aplazamiento que el de los puntos.
        if (aditivo && linea.selectedSegments.has(hit.commandIndex)) quitarAlSoltar = { clave: hit.clave, indices: [hit.commandIndex] };
        const limpio = sinPuntos(aditivo ? base : sinSeleccion(base));
        const tramos = new Set(aditivo ? linea.selectedSegments : []);
        tramos.add(hit.commandIndex);
        next = conLinea(limpio, hit.clave, { selectedSegments: tramos });
        marco = marcoDelTramo(piece, linea.path, linea.nodes, hit.commandIndex, pieceLocalToPattern(hit.point, piece));
      }
      const porLinea = arrastreDe(next, piece.outline, hit.tipo === 'punto' ? 'node' : 'segment');
      const soloEse = porLinea.size === 1 && porLinea.get(hit.clave)?.startPositions.size === grupo.length;
      const desde = hit.tipo === 'punto' ? porLinea.get(hit.clave)?.startPositions.get(hit.commandIndex) : undefined;
      dragRef.current = {
        type: hit.tipo === 'punto' ? 'node' : 'segment',
        startMouse: { x: e.clientX, y: e.clientY },
        porLinea,
        marco,
        ...(quitarAlSoltar ? { quitarAlSoltar } : {}),
        ...(lineId && soloEse && desde ? { enganche: { indice: indiceSin(piece, lineId), desde } } : {}),
      };
      pushJournal('gesture', 'edicion:agarre', {
        objeto: 'pieza', linea: lineId ? 'interna' : 'contorno', que: hit.tipo, ...(lineId ? { lineId } : {}),
      });
      return next;
    },
    [indiceSin, toLocal],
  );

  /** Lo que agarraría un press en la pieza en edición (menú contextual y enrutador). */
  const agarreEn = useCallback((e: React.MouseEvent<SVGSVGElement>): Agarre | null => {
    if (!state.isEditing || !state.editingPieceId) return null;
    const piece = getPiece(state.editingPieceId);
    if (!piece) return null;
    return agarrar(vistas(state, piece.outline), toLocal(e, piece), hitRadius, claveElegida(piece.id));
  }, [state, getPiece, toLocal, hitRadius, claveElegida]);

  /**
   * El punto único elegido, de cualquier línea (spec § 4.5): el sujeto de las
   * cotas del punto y de «Mover exacto…». Con dos líneas con algo elegido, o
   * con tramos, no hay punto único.
   */
  const puntoElegido = useMemo(() => {
    if (!state.isEditing || !state.editingPieceId) return null;
    const piece = pieces.find(p => p.id === state.editingPieceId);
    if (!piece) return null;
    const conAlgo = vistas(state, piece.outline).filter(v => v.selectedNodes.size > 0 || v.selectedSegments.size > 0);
    if (conAlgo.length !== 1 || conAlgo[0].selectedSegments.size > 0) return null;
    const commandIndex = puntoUnicoDeLinea(conAlgo[0].path, conAlgo[0].selectedNodes);
    if (commandIndex === null) return null;
    const lineId = lineIdDeClave(conAlgo[0].clave);
    return { pieceId: piece.id, commandIndex, ...(lineId ? { lineId } : {}) };
  }, [state, pieces]);

  /**
   * Entra a una pieza y, solo cuando el press tiene un sujeto concreto, deja
   * armado ese mismo gesto. El hit-test usa nodos recién extraídos: antes de
   * entrar, `state.nodes` todavía pertenece a la sesión vacía de React.
   *
   * `false` deja la entrada pura en manos del router. Así el relleno de la
   * pieza conserva el contrato anterior y no nace un marquee por accidente.
   */
  const enterEditActuando = useCallback(
    (pieceId: string, e: React.MouseEvent<SVGSVGElement>): boolean => {
      if (e.button !== 0) return false;
      const piece = pieces.find(p => p.id === pieceId);
      if (!piece) return false;
      if (piezaBloqueada(piece, layerLocked)) {
        // El candado propio conserva el aviso de `enterEdit`. El de capa no
        // puede usar ese texto —se desbloquea en Capas, no con clic derecho—
        // pero tampoco puede quedarse callado: `enterEdit` ya lleva escrito
        // por qué (maria-204), "sin aviso sería otro clicaba y nada pasaba".
        if (piece.locked) enterEdit(pieceId);
        else dispatch(showInfoToast('La capa de esta pieza está bloqueada: desbloquéala en Capas para editarla.'));
        return true;
      }
      const base = estadoDeEntrada(piece);
      const hit = agarrar(vistas(base, piece.outline), toLocal(e, piece), hitRadius, claveElegida(pieceId));
      if (!hit) return false;
      endDragBatch();
      seenPathsRef.current = pathsEditables(piece);
      expectedPathsRef.current = null;
      const next = armarGesto(piece, base, hit, e);
      setState(next);
      publicarElegida(pieceId, next);
      return true;
    },
    [pieces, layerLocked, toLocal, hitRadius, endDragBatch, enterEdit, dispatch, claveElegida, armarGesto, publicarElegida],
  );

  // ─── exitEdit ───

  const exitEdit = useCallback(() => {
    endDragBatch();
    setState({ ...INITIAL_STATE });
    dragRef.current = null;
    setGuias(null);
    publicarEnganche(null);
    expectedPathsRef.current = null;
    seenPathsRef.current = null;
  }, [endDragBatch, publicarEnganche]);

  // Resync when the edited piece's editable paths (its outline and its
  // editable internals) change OUTSIDE this hook (undo/redo via restoreState,
  // copilot edits). Without this the dots detach from the reverted path and
  // points appear to vanish. The hook's own dispatches are skipped by the
  // identity of those paths — they already refreshed nodes, and clearing
  // selection/drag on them would kill an active drag.
  useEffect(() => {
    if (!state.isEditing || !state.editingPieceId) return;
    const piece = pieces.find(p => p.id === state.editingPieceId);
    if (!piece) {
      exitEdit();
      return;
    }
    const paths = pathsEditables(piece);
    if (mismosPaths(seenPathsRef.current, paths)) return;
    seenPathsRef.current = paths;
    if (mismosPaths(expectedPathsRef.current, paths)) {
      expectedPathsRef.current = null;
      return;
    }
    // External change: refresh nodes, drop selections (indices may denote
    // different geometry now), and cancel any in-flight drag so the next
    // mousemove can't re-impose pre-undo positions.
    endDragBatch();
    dragRef.current = null;
    setGuias(null);
    publicarEnganche(null);
    setState(s => resyncStateToPiece(s, piece));
    // La interna elegida de esta pieza se va con la selección de Q (spec
    // § 3.5 y § 4.7): su `segmentIndex` podría señalar otra geometría, y sin
    // nada elegido en Q, Supr sigue a la puerta global, que con la línea
    // elegida la borraría entera.
    if (selectedInternalLineRef.current?.pieceId === piece.id) dispatch(selectPiece(piece.id));
  }, [pieces, state.isEditing, state.editingPieceId, exitEdit, endDragBatch, publicarEnganche, dispatch]);

  useEffect(() => () => endDragBatch(), [endDragBatch]);

  // Pulsar o soltar Shift a mitad del arrastre, con la mano quieta, re-aplica
  // el último ratón: el punto se endereza (o se suelta) en ese instante. Los
  // handlers de ratón pasan su `e.shiftKey` por `sincronizar`, así que teclado y
  // ratón no pueden discrepar sobre si Shift está pulsado.
  //
  // El modo vive también en el estado (arriba): la pista del pie lo lee antes
  // de agarrar nada (spec 2026-09-23 § 4.2).
  const { modoRef, sincronizar } = useShiftSostenido((modo) => {
    setModoShift(modo);
    const drag = dragRef.current;
    if (!drag || drag.type === 'marquee' || !drag.lastMouse || !state.editingPieceId) return;
    const piece = getPiece(state.editingPieceId);
    if (piece) aplicarArrastre(piece, drag, drag.lastMouse, modo);
  });

  // ─── handleMouseDown ───

  const handleMouseDown = useCallback(
    (e: React.MouseEvent<SVGSVGElement>): boolean => {
      if (!state.isEditing || !state.editingPieceId) return false;
      if (e.button !== 0) return false;
      sincronizar(e.shiftKey);
      setModoShift(modoRef.current);

      const piece = getPiece(state.editingPieceId);
      if (!piece) return false;

      const hit = agarrar(vistas(state, piece.outline), toLocal(e, piece), hitRadius, claveElegida(piece.id));
      if (hit) {
        const next = armarGesto(piece, state, hit, e);
        setState(next);
        publicarElegida(piece.id, next);
        return true;
      }

      // Empty area → start marquee. Sin Shift suelta todo; con Shift conserva
      // los puntos.
      const patPt = toPattern(e);
      setState(s => ({
        ...(e.shiftKey ? sinTramos(s) : sinSeleccion(s)),
        marquee: { start: patPt, current: patPt },
      }));

      dragRef.current = {
        type: 'marquee',
        startMouse: { x: e.clientX, y: e.clientY },
        startPositions: new Map(),
      };

      return true;
    },
    [state, getPiece, toLocal, toPattern, hitRadius, modoRef, sincronizar, claveElegida, armarGesto, publicarElegida],
  );

  // ─── El arrastre de nodos y tramos ───

  /**
   * Mueve lo arrastrado según el ratón. Con Shift una vez, el desplazamiento
   * se endereza respecto a la HOJA —horizontal, vertical o diagonal— desde
   * donde estaba el punto (firma de María del 23-09, opción B; «cuánto lo
   * quieres mover en esa dirección», #1112). Con Shift dos veces, respecto al
   * lado congelado en `drag.marco` (spec 2026-09-23 § 3.4).
   */
  const aplicarArrastre = useCallback(
    (piece: PatternPiece, drag: NodeDrag | SegmentDrag, mouse: Point2D, modo: ModoShift) => {
      drag.lastMouse = mouse;
      if (![...drag.porLinea.values()].some(l => l.startPositions.size > 0)) return;
      const pantalla = { x: mouse.x - drag.startMouse.x, y: mouse.y - drag.startMouse.y };
      // Shift+press sobre algo ya seleccionado es un clic —que lo quita al
      // soltar— hasta que la mano cruza el umbral de arrastre: un temblor no
      // puede mover la selección ni anular la deselección.
      if (drag.quitarAlSoltar && !drag.wrote && !isDrag(pantalla.x, pantalla.y)) return;
      const enHoja = {
        x: screenToPatternLength(pantalla.x, zoom),
        y: screenToPatternLength(pantalla.y, zoom),
      };
      // Se endereza en espacio de patrón —la hoja, o el lado, que ya va girado
      // en su referencia— ANTES de pasar el delta al marco de la pieza: en una
      // pieza girada la hoja no gira con ella. Y el delta se gira porque las
      // posiciones se guardan sin girar: así una pieza girada se arrastra hacia
      // donde va el puntero, no en diagonal (nota de María #170). Las guías
      // salen del mismo cálculo que el punto.
      let enPatron = enHoja;
      if (modo !== 'suelto') {
        const { desde, referencia } = drag.marco;
        const g = guiasShift(desde, { x: desde.x + enHoja.x, y: desde.y + enHoja.y }, referencia, modo === 'borde');
        enPatron = { x: g.punto.x - desde.x, y: g.punto.y - desde.y };
        publicarGuias(g);
      } else {
        publicarGuias(null);
      }
      let { x: dx, y: dy } = patternToPieceLocalDirection(enPatron, piece);
      // Precedencia de la spec 2026-09-24 § 4.3, que es la del contrato del
      // 08-09 § 3.4: Shift > enganche > ratón. Una interna no mueve el pivote
      // de la pieza, así que su marco es el mismo en todo el gesto.
      if (drag.enganche && modo === 'suelto') {
        const { indice, desde } = drag.enganche;
        const mundo = pieceLocalToPattern({ x: desde.x + dx, y: desde.y + dy }, piece);
        const snap = resolveSnap(indice, mundo, screenToPatternLength(EDGE_HIT_PX, zoom));
        if (snap) {
          const local = patternToPieceLocal(snap.point, piece);
          dx = local.x - desde.x;
          dy = local.y - desde.y;
        }
        publicarEnganche(snap ? snap.point : null);
      } else if (drag.enganche) {
        publicarEnganche(null);
      }
      // Un desplazamiento igual al último escrito no reescribe nada: con Shift,
      // mover la mano en perpendicular a la guía no cambia el punto; y antes
      // del primer frame, el delta cero tampoco.
      const ultimo = drag.lastDelta ?? { x: 0, y: 0 };
      if (dx === ultimo.x && dy === ultimo.y) return;
      const undoBatchToken = beginDragBatch();

      // Cada línea desde su path del INICIO del gesto, ancla por ancla y con
      // los grupos de anclas coincidentes de ESE path. Reagrupar frame a frame
      // sobre el path ya movido capturaba cualquier ancla por la que el
      // arrastre pasara exactamente encima, y se la llevaba.
      const cambios = new Map<ClaveLinea, PathCommand[]>();
      for (const [clave, linea] of drag.porLinea) {
        if (linea.startPositions.size === 0) continue;
        linea.groups ??= new Map([...linea.startPositions.keys()].map((cmdIdx): [number, number[]] => {
          const grupo = anchorGroupOf(linea.startPath, cmdIdx);
          return [cmdIdx, grupo.length > 0 ? grupo : [cmdIdx]];
        }));
        const moves = new Map<number, Point2D>();
        for (const [cmdIdx, startPos] of linea.startPositions) {
          const destino = { x: startPos.x + dx, y: startPos.y + dy };
          for (const miembro of linea.groups.get(cmdIdx) ?? [cmdIdx]) moves.set(miembro, destino);
        }
        let path = applyAnchorMoves(linea.startPath, moves);
        // Curva por puntos (#197): en un tramo gestionado los manejadores se
        // rehacen desde las anclas, así que la curva sigue pasando por el
        // punto y sin picos. La marca vive en el path previo al gesto.
        for (const cmdIdx of linea.startPositions.keys()) {
          path = resmoothAfterMove(linea.startPath, path, cmdIdx);
        }
        cambios.set(clave, path);
      }

      escribirLineas(piece, cambios, undoBatchToken);
      drag.lastDelta = { x: dx, y: dy };
      drag.wrote = true;
    },
    [zoom, beginDragBatch, escribirLineas, publicarGuias, publicarEnganche],
  );

  // ─── handleMouseMove ───

  const handleMouseMove = useCallback(
    (e: React.MouseEvent<SVGSVGElement>): boolean => {
      if (!state.isEditing) {
        const target = e.target as Element | null;
        const domPieceId = typeof target?.closest === 'function'
          ? target.closest('[data-piece-id]')?.getAttribute('data-piece-id')
          : null;
        // Cuando el DOM ya resolvió qué pieza está arriba, el hover no
        // puede mirar a través de su relleno y prometer un gesto sobre otra.
        const candidates = domPieceId
          ? hoverablePieces.filter(piece => piece.id === domPieceId)
          : hoverablePieces;

        for (const piece of candidates) {
          const { nodes, internas } = lineasDeHover(piece);
          const base: EditPatternState = { ...INITIAL_STATE, nodes, internas };
          const hit = agarrar(vistas(base, piece.outline), toLocal(e, piece), hitRadius, claveElegida(piece.id));
          if (hit) {
            setState(s => (s.isEditing ? s : conLinea(
              { ...sinHover({ ...s, internas }), hoveredPieceId: piece.id },
              hit.clave,
              hit.tipo === 'punto' ? { hoveredNode: hit.commandIndex } : { hoveredSegment: hit.commandIndex },
            )));
            return false;
          }
        }

        setState(hoverPerdido);
        return false;
      }

      if (!state.editingPieceId) return false;

      const piece = getPiece(state.editingPieceId);
      if (!piece) return false;

      const drag = dragRef.current;

      // Active drag
      if (drag) {
        if (drag.type === 'node' || drag.type === 'segment') {
          sincronizar(e.shiftKey);
          setModoShift(modoRef.current);
          aplicarArrastre(piece, drag, { x: e.clientX, y: e.clientY }, modoRef.current);
          return true;
        }

        if (drag.type === 'marquee') {
          const patPt = toPattern(e);
          setState(s => {
            if (!s.marquee) return s;
            return { ...s, marquee: { ...s.marquee, current: patPt } };
          });
          return true;
        }
      }

      // Hover detection, en todas las líneas.
      const hit = agarrar(vistas(state, piece.outline), toLocal(e, piece), hitRadius, claveElegida(piece.id));
      setState(s => {
        const limpio = sinHover(s);
        // Nothing hovered
        if (!hit) return limpio;
        if (hit.tipo === 'punto') return conLinea(limpio, hit.clave, { hoveredNode: hit.commandIndex });
        // addPointPreview is in piece-local space
        return conLinea(limpio, hit.clave, { hoveredSegment: hit.commandIndex, addPointPreview: hit.point });
      });
      return false;
    },
    [state, hoverablePieces, getPiece, toLocal, toPattern, hitRadius, aplicarArrastre, modoRef, sincronizar, claveElegida],
  );

  // ─── handleMouseUp ───

  const handleMouseUp = useCallback(() => {
    const drag = dragRef.current;
    dragRef.current = null;
    setGuias(null);
    publicarEnganche(null);
    endDragBatch();

    if (!drag) return;

    if (drag.type === 'marquee') {
      // Resolve marquee selection
      const piece = state.editingPieceId ? pieces.find(p => p.id === state.editingPieceId) : undefined;
      if (!state.marquee || !piece) {
        setState(s => ({ ...s, marquee: null }));
        return;
      }
      const next = marcoSelecciona(state, piece);
      setState(next);
      publicarElegida(piece.id, next);
      return;
    }

    pushJournal('gesture', 'edicion:suelta', { movio: !!drag.wrote });

    // Node/segment drags already wrote during mousemove. What is left is the
    // Shift+click that never became a drag: now it does deselect.
    const quitar = drag.quitarAlSoltar;
    if (!quitar || drag.wrote || !state.editingPieceId) return;
    const v = vistas(state).find(l => l.clave === quitar.clave);
    if (!v) return;
    const conjunto = new Set(drag.type === 'node' ? v.selectedNodes : v.selectedSegments);
    for (const ci of quitar.indices) conjunto.delete(ci);
    const next = conLinea(state, quitar.clave, drag.type === 'node' ? { selectedNodes: conjunto } : { selectedSegments: conjunto });
    setState(next);
    publicarElegida(state.editingPieceId, next);
  }, [state, pieces, endDragBatch, publicarEnganche, publicarElegida]);

  // ─── handleKeyDown ───

  /**
   * P1 (#1115): devuelve si consumió la tecla.
   *
   * Este gancho se llama desde DOS sitios, y la diferencia importa:
   *
   * - **Supr y Retroceso, desde la captura CF-1.** El atajo global
   *   `edit.delete` escucha en `document` en burbuja y corría ANTES, así que
   *   Supr sobre un nodo borraba la pieza entera y este manejador llegaba a
   *   una pieza que ya no existía.
   * - **Escape, desde la burbuja, como siempre.** Consumirlo en captura
   *   parecía más limpio y resultó ser una regresión: `stopPropagation` en
   *   captura sobre `window` mata TODA la propagación posterior, y con eso el
   *   menú contextual (`ContextMenu.tsx`, que escucha en `document` en
   *   burbuja) se quedaba abierto. Es el menú que lleva las firmas de María
   *   del #1166. La ventana de `isEditing` es un MODO largo, no un gesto: una
   *   puerta estrecha en teclas no basta si la condición es ancha.
   *
   * `false` deja la tecla seguir su camino a propósito: sin sujeto local,
   * Supr tiene que poder borrar la pieza como en cualquier otro sitio.
   */
  const handleKeyDown = useCallback(
    (e: KeyboardEvent): boolean => {
      if (!state.isEditing || !state.editingPieceId) return false;

      if (e.key === 'Escape') {
        // Peldaño 3 de la escalera (E-4): la sub-selección se suelta ANTES de
        // salir. Un Escape = un peldaño. Salir de golpe con un nodo agarrado
        // le quita el modo entero a María cuando solo quería soltar el punto.
        //
        // Pero el peldaño 2 —GESTO VIVO— manda sobre el 3. Con un arrastre
        // abierto, Escape lo cancela y cierra su lote de deshacer; quedarse en
        // el peldaño 3 dejaba el lote abierto y la siguiente acción entraba
        // dentro de él (lo cazó `useEditPattern.undo.test.tsx`, no yo).
        if (!dragRef.current && algoElegido(state)) {
          const next = sinSeleccion(state);
          setState(next);
          publicarElegida(state.editingPieceId, next);
          e.preventDefault();
          e.stopPropagation();
          return true;
        }
        // Con un gesto vivo se sale sin pasar por el peldaño 3: la interna
        // elegida se suelta aquí, o seguiría elegida fuera de Q y Supr la
        // borraría entera (spec 2026-09-24 § 3.5).
        if (dragRef.current && selectedInternalLineRef.current) dispatch(selectPiece(state.editingPieceId));
        exitEdit();
        return true;
      }

      if (e.key === 'Delete' || e.key === 'Backspace') {
        const piece = getPiece(state.editingPieceId);
        if (!piece) return false;
        const lineas = vistas(state, piece.outline);

        const conPuntos = lineas.filter(l => l.selectedNodes.size > 0);
        if (conPuntos.length === 0) {
          // Tramos de una interna: se quitan SOLO esos tramos (spec § 4.6),
          // por el mismo reductor que usa Z.
          const conTramos = lineas.filter(l => l.clave !== CLAVE_CONTORNO && l.selectedSegments.size > 0);
          // Un TRAMO elegido también es sujeto local: se pinta
          // (`EditPatternOverlay`) y el Escape de arriba ya lo trata como tal.
          // Un tramo del CONTORNO no se borra —no existe «borrar lado»—, así
          // que aquí no se borra nada — pero se consume igual, porque soltar
          // la tecla se la entrega al global y entonces desaparece la pieza
          // con el tramo resaltado en pantalla. Mismo argumento que el aviso
          // de los tres puntos, más abajo.
          if (conTramos.length === 0) return state.selectedSegments.size > 0;

          // Este camino no pasa por `escribirLineas`: el efecto de arriba lo
          // trata como cambio EXTERNO a propósito (`removeTramosDeInterna`
          // puede nacer con un id nuevo para la segunda mitad, y solo
          // `resyncStateToPiece` relee todo de cero).
          const token = beginUndoBatch(dispatch, 'Borrar tramo');
          for (const l of conTramos) {
            const lineId = lineIdDeClave(l.clave)!;
            // El hilo y la pinza son entidades: un tramo suyo se las lleva
            // enteras, no las parte (spec § 4.6).
            const linea = piece.internals.find(x => x.id === lineId);
            if (linea && seBorraEntera(linea.type)) {
              dispatch(withUndoBatchToken(removeInternalLine({ pieceId: piece.id, lineId }), token));
              continue;
            }
            // Un evento por tramo, como las puertas de Z (`useKeyboardShortcuts.ts`,
            // `LogoMenu.tsx`): `segmentIndex` singular, con los índices ORIGINALES.
            for (const segmentIndex of l.selectedSegments) {
              pushJournal('gesture', 'interna:delete', { pieceId: piece.id, lineId, segmentIndex });
            }
            dispatch(withUndoBatchToken(
              removeTramosDeInterna({ pieceId: piece.id, lineId, segmentIndices: [...l.selectedSegments] }),
              token,
            ));
          }
          endUndoBatch(dispatch, token);
          if (selectedInternalLineRef.current) dispatch(selectPiece(piece.id));
          e.preventDefault();
          return true;
        }

        // All-or-nothing: deleting part of a coincident group would leave a
        // stranded twin, and a partial multi-delete is worse than none. Todo o
        // nada también entre líneas: si una línea no puede, no se toca ninguna.
        const cambios = new Map<ClaveLinea, PathCommand[] | null>();
        for (const l of conPuntos) {
          // Una pinza necesita sus tres anclas —base, ápice, base— para que
          // `extractDartFromInternal` la vuelva a leer (#1020): dos anclas son
          // una línea abierta válida para cualquier OTRA interna, pero no para
          // una pinza. Se borra entera, como el hilo (spec § 4.6).
          const lineId = lineIdDeClave(l.clave);
          const linea = lineId ? piece.internals.find(x => x.id === lineId) : undefined;
          if (linea?.type === 'dart') {
            const restantes = coincidentAnchorGroups(l.path.filter((_, i) => !l.selectedNodes.has(i))).size;
            if (restantes < 3) { cambios.set(l.clave, null); continue; }
          }
          const r = quitarPuntos(l.path, l.selectedNodes, l.clave === CLAVE_CONTORNO);
          if (r === 'insuficiente') {
            dispatch(showInfoToast(l.clave === CLAVE_CONTORNO
              ? 'No se puede borrar: la pieza necesita al menos 3 puntos'
              : 'No se puede borrar: la forma necesita al menos 3 puntos'));
            // CONSUME igual (#1115). El comentario viejo decia que soltar la
            // tecla aqui «era seguro porque el atajo global no mira
            // defaultPrevented» — y esa era justo la trampa: al soltarla, el
            // global se llevaba LA PIEZA ENTERA. O sea, «no puedo borrar el
            // nodo porque hacen falta tres puntos» terminaba borrandolo todo.
            return true;
          }
          cambios.set(l.clave, r);
        }

        const updated = conPaths(piece, cambios);
        expectedPathsRef.current = pathsEditables(updated);
        dispatch(updatePiece(updated));
        // Este camino no pasa por `escribirLineas`. Ya limpiaba la
        // selección, pero dejaba vivos el hover y la previsualización con
        // índices de un contorno que acaba de encoger (#1122).
        setState(s => resyncStateToPiece(s, updated));
        if (selectedInternalLineRef.current) dispatch(selectPiece(piece.id));

        e.preventDefault();
        return true;
      }

      return false;
    },
    [state, exitEdit, getPiece, dispatch, publicarElegida],
  );

  // ─── handleDoubleClick ───

  const handleDoubleClick = useCallback(
    (e: React.MouseEvent<SVGSVGElement>): boolean => {
      if (!state.isEditing || !state.editingPieceId) return false;
      const piece = getPiece(state.editingPieceId);
      if (!piece) return false;
      // Sobre un punto no se inserta (el punto fantasma de #167): `agarrar` da
      // el punto antes que el tramo, y el cierre fantasma no es un tramo.
      const lineas = vistas(state, piece.outline);
      const hit = agarrar(lineas, toLocal(e, piece), hitRadius, claveElegida(piece.id));
      if (!hit || hit.tipo !== 'tramo') return false;
      const linea = lineas.find(l => l.clave === hit.clave);
      if (!linea) return false;
      escribirLineas(piece, new Map([[hit.clave, splitSegmentAt(linea.path, hit.commandIndex, hit.t)]]));
      return true;
    },
    [state, getPiece, toLocal, hitRadius, claveElegida, escribirLineas],
  );

  /**
   * La clave y el path que edita uno de los cuatro verbos de abajo: el
   * contorno sin `lineId`, o la interna que nombra — si Q puede editarla
   * (spec § 3.2: `esInternaEditable` descarta un piquete o un doblez de
   * pliegue). `null` si no hay nada que editar; los cuatro verbos no hacen
   * nada entonces, en vez de repetir cada uno su propio candado.
   */
  const lineaDelVerbo = useCallback((piece: PatternPiece, lineId?: string): { clave: ClaveLinea; path: PathCommand[] } | null => {
    if (!lineId) return { clave: CLAVE_CONTORNO, path: piece.outline };
    const linea = piece.internals.find(l => l.id === lineId);
    if (!linea || !esInternaEditable(linea)) return null;
    const clave = claveDeInterna(lineId);
    const path = pathDeLinea(piece, clave);
    return path ? { clave, path } : null;
  }, []);

  // ─── convertSegment ───

  /** `lineId`: una interna de la pieza (spec 2026-09-24 § 4.4); sin él, el contorno. */
  const convertSegment = useCallback(
    // `pieceId` explícito para el clic derecho FUERA de "Editar patrón" (#197):
    // ahí no hay pieza en edición y el hit-test es quien sabe cuál se tocó.
    (commandIndex: number, toCurve: boolean, pieceId?: string, lineId?: string) => {
      const piece = getPiece(pieceId ?? state.editingPieceId);
      if (!piece || guardLocked(piece)) return;
      const l = lineaDelVerbo(piece, lineId);
      if (!l) return;
      escribirLineas(piece, new Map([[l.clave, toCurve ? convertToCurve(l.path, commandIndex) : convertToLine(l.path, commandIndex)]]));
    },
    [state.editingPieceId, getPiece, escribirLineas, guardLocked, lineaDelVerbo],
  );

  // ─── moveNodeTo (#1112: escribir la distancia a un vecino) ───

  /**
   * Mueve un nodo a un punto exacto, en coordenadas LOCALES de la pieza.
   *
   * Es la puerta de los chips del nodo. Existe para que el chip NO reconstruya
   * el contorno por su cuenta: aquí está la compensación de pivote, el
   * re-anclado de piquetes y el refresco del overlay, y tener eso duplicado en
   * la capa de cotas es exactamente el fallo que este repo tiene escrito con
   * nombre propio («dos listas se desincronizan»).
   *
   * `applyNodeMove` mueve el GRUPO de anclas coincidentes, no un comando: en el
   * DXF de María cada esquina son dos o tres comandos en la misma coordenada, y
   * mover uno solo rompería el contorno en una púa.
   *
   * `lineId`: una interna de la pieza (spec 2026-09-24 § 4.4); sin él, el contorno.
   */
  const moveNodeTo = useCallback(
    (pieceId: string, commandIndex: number, destino: Point2D, lineId?: string) => {
      const piece = getPiece(pieceId);
      if (!piece || guardLocked(piece)) return;
      const l = lineaDelVerbo(piece, lineId);
      if (!l) return;
      escribirLineas(piece, new Map([[l.clave, applyNodeMove(l.path, commandIndex, 'anchor', destino)]]));
    },
    [getPiece, escribirLineas, guardLocked, lineaDelVerbo],
  );

  // ─── convertSegmentToPoints ───

  /**
   * Curva por puntos: la que pidió María, con los puntos SOBRE la línea (#197).
   *
   * `lineId`: una interna de la pieza (spec 2026-09-24 § 4.4); sin él, el contorno.
   */
  const convertSegmentToPoints = useCallback(
    (commandIndex: number, pieceId?: string, lineId?: string) => {
      const piece = getPiece(pieceId ?? state.editingPieceId);
      if (!piece || guardLocked(piece)) return;
      const l = lineaDelVerbo(piece, lineId);
      if (!l) return;
      escribirLineas(piece, new Map([[l.clave, convertSegmentToSpline(l.path, commandIndex)]]));
    },
    [state.editingPieceId, getPiece, escribirLineas, guardLocked, lineaDelVerbo],
  );

  // ─── convertSegmentToBezier ───

  /** `lineId`: una interna de la pieza (spec 2026-09-24 § 4.4); sin él, el contorno. */
  const convertSegmentToBezier = useCallback(
    (commandIndex: number, pieceId?: string, lineId?: string) => {
      const piece = getPiece(pieceId ?? state.editingPieceId);
      if (!piece || guardLocked(piece)) return;
      const l = lineaDelVerbo(piece, lineId);
      if (!l) return;
      const out = toManualBezier(l.path, commandIndex);
      if (out) escribirLineas(piece, new Map([[l.clave, out]]));
    },
    [state.editingPieceId, getPiece, escribirLineas, guardLocked, lineaDelVerbo],
  );

  // ─── addPointOnSegment ───

  /**
   * Punto sobre un lado, por la misma puerta que el doble clic (maria-203 /
   * tool Punto): pasa por escribirLineas, que compensa el pivote y
   * re-ancla piquetes — un splitSegmentAt + updatePiece crudo los dejaría
   * varados. `pieceId` explícito para callers fuera del modo edición.
   */
  const addPointOnSegment = useCallback(
    (commandIndex: number, t: number, pieceId?: string) => {
      const piece = getPiece(pieceId ?? state.editingPieceId);
      if (!piece || guardLocked(piece)) return;
      escribirContorno(piece, splitSegmentAt(piece.outline, commandIndex, t));
    },
    [state.editingPieceId, getPiece, escribirContorno, guardLocked],
  );

  // ─── getCursor ───

  const limpiarHover = useCallback(() => {
    setState(hoverPerdido);
  }, []);

  const getCursor = useCallback((): string => {
    const hover = hoverDe(state);
    if (!state.isEditing) {
      // Hover-sin-clic (2026-09-10): el sujeto ya no espera la sesión
      // entrada. El cursor distingue el nodo que se moverá del tramo que se
      // seleccionará, para anunciar exactamente lo que hará el primer press.
      // Vale en cualquier línea: el contorno o una interna.
      if (hover?.tipo === 'punto') return 'move';
      return hover?.tipo === 'tramo' ? 'pointer' : 'default';
    }
    if (dragRef.current) return dragRef.current.type === 'marquee' ? 'crosshair' : 'move';
    if (hover?.tipo === 'punto') return 'move';
    if (hover?.tipo === 'tramo') return hover.conPreview ? 'cell' : 'pointer';
    return 'default';
  }, [state]);


  return {
    ...state,
    /** Las internas editables de la pieza en edición o bajo el ratón (spec § 3.2). */
    internas: state.internas ?? SIN_INTERNAS,
    enterEdit,
    enterEditActuando,
    exitEdit,
    handleMouseDown,
    handleMouseMove,
    handleMouseUp,
    handleKeyDown,
    handleDoubleClick,
    convertSegment,
    convertSegmentToPoints,
    convertSegmentToBezier,
    addPointOnSegment,
    moveNodeTo,
    limpiarHover,
    getCursor,
    /** Las dos guías de Shift del arrastre en curso; `null` sin Shift o sin arrastre. */
    guias,
    /** Shift ahora mismo, para la pista del pie. */
    modoShift,
    /** El punto al que engancha el arrastre de una interna, en patrón (spec § 4.3). */
    enganche,
    /** Qué agarraría un press en la pieza en edición (menú contextual y enrutador). */
    agarreEn,
    /** El punto único elegido, de cualquier línea (cotas y menú, spec § 4.5). */
    puntoElegido,
    /** Hay puntos elegidos en alguna línea: los largos callan (#1153). */
    hayPuntosElegidos: vistas(state).some(v => v.selectedNodes.size > 0),
  };
}

// ─── Internal helpers ───

/** El marco de un punto agarrado: el tramo de SU línea que le llega, desde su posición inicial (spec § 4.2). */
function marcoDelPunto(
  piece: PatternPiece, path: PathCommand[], position: Point2D, commandIndex: number,
): OutlineDrag['marco'] {
  return { desde: pieceLocalToPattern(position, piece), referencia: arrivingReferenceOnPath(piece, path, commandIndex) };
}

/** El marco de un tramo agarrado: su propia recta, desde el punto del tramo bajo el press (no el pulso, que cae hasta 8 px fuera). */
function marcoDelTramo(
  piece: PatternPiece, path: PathCommand[], nodes: EditableNode[], commandIndex: number, pulsado: Point2D,
): OutlineDrag['marco'] {
  const toIndex = path[commandIndex]?.type === 'Z' ? 0 : commandIndex;
  const to = nodes.find(n => n.ref.commandIndex === toIndex)?.position;
  const from = findFromNode(nodes, commandIndex)?.position;
  return { desde: pulsado, referencia: to && from ? chordReference(piece, from, to) : ABSOLUTE_REFERENCE };
}

function mismaGuia(a: GuiaShift | null, b: GuiaShift | null): boolean {
  return a === b
    || (!!a && !!b && a.angleDeg === b.angleDeg && a.desde.x === b.desde.x && a.desde.y === b.desde.y);
}

/** Lo que se pinta no cambió: el estado no se reescribe y no re-renderiza. */
function mismasGuias(a: GuiasShift | null, b: GuiasShift | null): boolean {
  return a === b || (!!a && !!b && mismaGuia(a.activa, b.activa) && mismaGuia(a.tenue, b.tenue));
}
