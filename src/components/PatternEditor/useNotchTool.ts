import { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import type { RootState } from '../../store';
import { showInfoToast } from '../../store/copilotUISlice';
import { piezaBloqueada } from '../../utils/piezaBloqueada';
import type { PatternPiece, Point2D, InternalLine, NotchOptions } from '../../types/types';
import { generateNotchPath, DEFAULT_NOTCH_OPTIONS } from '../../utils/notches';
import { computeNotchAnchor, resolveNotchAnchor, resolveNotchAnchorV2, outlinePerimeter } from '../../utils/notchAnchor';
import { screenToPattern, screenToPatternLength } from '../../utils/geometry';
import {
  buildRing,
  distanceAt,
  projectToRing,
  type OutlineRing,
} from '../../utils/geometry/outlineRing';
import { resolveDistanceRef } from '../../utils/geometry/distanceRef';
import { edgeRangeForCommand } from '../../utils/semanticEdges';
import { patternToPieceLocal, patternToPieceLocalDirection, pieceLocalToPattern, pieceLocalToPatternDirection } from './pieceTransform';
import { newId } from '../../utils/ids';
import {
  snapToAnyEdge,
  type SegmentSelection,
  type SnapResult,
} from './useSegmentSewingTool';
import { noPasoNada } from './noPasoNada';
import { useEdgeGesture } from './useEdgeGesture';
import type { EdgeCommit, EdgeTarget } from './edgeGesture';
import { EDGE_HIT_PX } from './gestureConstants';
import { distanceAnchorFrom, spanLengthMm, unwrapOnSpan } from './distanceCommit';

/**
 * Notch tool: click on a piece edge to place a notch mark.
 * Notches are small perpendicular marks on the outline that indicate
 * alignment points for sewing pieces together.
 */

const NOTCH_SIZE = 8; // mm in pattern space
/** Estable: un `{}` nuevo en cada render rehacía los callbacks que lo usan. */
const SIN_CAPAS_BLOQUEADAS: Readonly<Record<number, boolean>> = {};
void NOTCH_SIZE; // reserved for future use

interface NotchToolState {
  hoveredPoint: { pieceId: string; point: Point2D; normal: Point2D } | null;
}

/**
 * El piquete que se está terminando de poner (notch-precision F3, D-4; desde
 * P3b, con su cota sobre el borde en vez del modal): el clic ya lo puso, y su
 * cota ofrece la distancia exacta. `refWorld` es la esquina de referencia en
 * coordenadas de mundo, para la marca del lienzo.
 */
export interface NotchRefineState {
  pieceId: string;
  /** La línea VIVA, leída de `pieces` en cada render: lo que se ve es lo que hay. */
  notch: InternalLine;
  source: 'placement' | 'existing';
  refWorld: Point2D;   // esquina de referencia, mundo (marca del lienzo)
  notchWorld: Point2D; // el piquete, mundo
  /**
   * El perímetro: el techo de la distancia (una mayor envolvería). DERIVADO
   * del contorno vivo en cada render, nunca guardado: un techo fotografiado al
   * abrir deja teclear un número que ya no existe (#1124).
   */
  maxDistanceMm: number;
  /** Dónde quedará con lo que se está tecleando (el fantasma del lienzo). */
  previewWorld?: Point2D | null;
  /** Cuenta las sesiones: el chip se abre una vez por sesión, no por render. */
  sesion: number;
}

/**
 * Lo que de verdad se guarda: qué piquete y desde cuándo. Todo lo demás —el
 * ancla, la esquina, el piquete, el techo— se mide del contorno vivo en cada
 * render (#1124): que el tipo no lo admita es lo que impide fotografiarlo.
 */
interface RefineGuardado {
  pieceId: string;
  lineId: string;
  source: 'placement' | 'existing';
  previewWorld?: Point2D | null;
  sesion: number;
}

export interface NotchDragPreview {
  refWorld: Point2D;
  currentWorld: Point2D;
  distanceMm: number;
}

function spanForEdge(
  ring: OutlineRing,
  edgeRange: [number, number],
): [number, number] {
  const startMm = distanceAt(ring, { commandIndex: edgeRange[0], tLocal: 0 });
  const rawEndMm = distanceAt(ring, { commandIndex: edgeRange[1] - 1, tLocal: 1 });
  // `distanceAt` nombra el final del cierre como `totalMm`, pero `projectToRing`
  // llama 0 a ese mismo punto: son la misma esquina con dos nombres. Si el borde
  // se queda leído como [inicio … totalMm], una referencia que vuelva como 0
  // cae FUERA de él y la resta da casi el perímetro entero.
  //
  // Medido sobre la figura de los tests: un piquete arrastrado a 60 mm de esa
  // esquina se colocaba a 544,88 — 485 mm de error, casi la vuelta completa.
  // Dejando que el borde cruce el origen, el desenrollado de `distanceCommit`
  // lo resuelve igual que cualquier otro tramo. Hay test.
  //
  // La comparación va con tolerancia y no con `===`: los dos números salen de
  // sumas distintas del mismo recorrido y no tienen por qué coincidir bit a bit.
  const cierraEnElOrigen = startMm > 0 && rawEndMm >= ring.totalMm - 1e-6;
  const endMm = cierraEnElOrigen ? 0 : rawEndMm;
  return [startMm, endMm];
}

function mmForSnap(ring: OutlineRing, snap: SnapResult): number {
  return distanceAt(ring, { commandIndex: snap.edgeIndex, tLocal: snap.t });
}

/**
 * `useFreeSewingTool` usa `commandTToEdgeT`, medido sobre el trazo aplanado
 * (métrica 1). Aquí el gesto representa milímetros legibles y re-editables:
 * su ida y vuelta t ↔ mm debe usar el arco exacto de la métrica 2.
 */
function tForMm(ring: OutlineRing, spanMm: [number, number], mm: number): number {
  const lengthMm = spanLengthMm(ring, spanMm);
  if (lengthMm === 0) return 0;
  return (unwrapOnSpan(ring, spanMm, mm) - spanMm[0]) / lengthMm;
}

function mmForT(ring: OutlineRing, spanMm: [number, number], t: number): number {
  return spanMm[0] + t * spanLengthMm(ring, spanMm);
}

/** `liveRange` va ordenado; el extremo que no es el press es el cursor. */
function liveTFromRange(pressT: number, liveRange: [number, number]): number {
  const pressIsLowerBound = Math.abs(pressT - liveRange[0])
    <= Math.abs(pressT - liveRange[1]);
  return pressIsLowerBound ? liveRange[1] : liveRange[0];
}

/**
 * Create a notch InternalLine at a point with a normal direction.
 * Attaches the parametric anchor (notch-precision F2): arc distance from
 * the nearest outline corner, so its cota (P3b) can read/edit the
 * placement numerically. Cornerless outlines yield an anchor-less notch.
 * Exported for unit tests.
 */
export function createNotchLine(point: Point2D, normal: Point2D, piece: PatternPiece, notchOptions?: NotchOptions): InternalLine {
  // Punto y normal llegan en espacio de patrón. El PUNTO pierde posición y
  // giro; la NORMAL solo gira — trasladar una dirección la manda a la otra
  // punta de la pieza.
  const localPt = patternToPieceLocal(point, piece);
  const localNormal = patternToPieceLocalDirection(normal, piece);
  const opts = notchOptions || DEFAULT_NOTCH_OPTIONS;
  const anchor = computeNotchAnchor(piece.outline, localPt);
  return {
    id: newId(),
    type: 'notch',
    path: generateNotchPath(localPt, localNormal, opts),
    notchOptions: opts,
    ...(anchor ? { notchAnchor: anchor } : {}),
  };
}

export function useNotchTool(
  zoom: number,
  pan: Point2D,
  pieces: PatternPiece[],
  onAddNotch: (pieceId: string, notch: InternalLine) => void,
  notchOptions?: NotchOptions,
  onUpdateNotch?: (
    pieceId: string,
    lineId: string,
    path: InternalLine['path'],
    notchAnchor: NonNullable<InternalLine['notchAnchor']>,
    options: NotchOptions,
  ) => void,
) {
  const dispatch = useDispatch();
  const [state, setState] = useState<NotchToolState>({ hoveredPoint: null });
  const [refining, setRefining] = useState<RefineGuardado | null>(null);
  const sesiones = useRef(0);
  // El candado de capa pesa igual que el de la pieza (#1136). Encadenado para
  // los stores mínimos de los tests del hook, sin `project`.
  const layerLocked = useSelector((s: RootState) => s.project?.layerLocked) ?? SIN_CAPAS_BLOQUEADAS;

  // El refinamiento nacido del gesto pertenece a Piquete y muere al salir de
  // esa herramienta. El de una línea existente nace del menú contextual y no
  // puede cerrarse solo porque Seleccionar ya estaba activo al abrirlo.
  // El encadenado opcional permite los stores mínimos de los tests del hook.
  const activeTool = useSelector((s: RootState) => s.editor?.activeTool);
  useEffect(() => {
    if (refining?.source === 'placement' && activeTool && activeTool !== 'notch') {
      setRefining(null);
    }
  }, [activeTool, refining]);

  // toolOptions.notch (G6, mirrors the toolOptions.seam convention): canonical
  // keys = NotchOptions names (shape/length/width/angle/count). Defaults live
  // here until a proper 2D Settings exists; the explicit param (tests)
  // overrides the store.
  const storeNotchOptions = useSelector(
    (s: RootState) => s.tools.toolOptions?.notch as Partial<NotchOptions> | undefined,
  );
  const effectiveOptions: NotchOptions = useMemo(
    () => ({ ...DEFAULT_NOTCH_OPTIONS, ...storeNotchOptions, ...notchOptions }),
    [storeNotchOptions, notchOptions],
  );

  const ringData = useMemo(() => {
    const rings = new Map<string, OutlineRing>();
    const eligiblePieces: PatternPiece[] = [];
    for (const piece of pieces) {
      const built = buildRing(piece.outline, 2);
      if (!built.ok) continue;
      rings.set(piece.id, built.value);
      eligiblePieces.push(piece);
    }
    return { rings, pieces: eligiblePieces };
  }, [pieces]);

  const toPattern = useCallback(
    (screenX: number, screenY: number, svgRect: DOMRect): Point2D =>
      screenToPattern(screenX, screenY, svgRect, zoom, pan),
    [zoom, pan],
  );

  /** El press fija la pieza, el borde semántico y su posición de arco métrica 2. */
  const resolveTarget = useCallback((e: React.MouseEvent<SVGSVGElement>): EdgeTarget | null => {
    const rect = e.currentTarget.getBoundingClientRect();
    const pt = toPattern(e.clientX, e.clientY, rect);
    const snap = snapToAnyEdge(pt, ringData.pieces, zoom);
    if (!snap) return null;

    const piece = ringData.pieces.find(candidate => candidate.id === snap.pieceId);
    const ring = ringData.rings.get(snap.pieceId);
    if (!piece || !ring) return null;
    const edgeRange = edgeRangeForCommand(piece, snap.edgeIndex);
    const spanMm = spanForEdge(ring, edgeRange);
    const t = tForMm(ring, spanMm, mmForSnap(ring, snap));
    return { pieceId: snap.pieceId, edgeIndex: snap.edgeIndex, edgeRange, t, point: snap.point };
  }, [toPattern, ringData, zoom]);

  /**
   * El release solo aporta un t sobre el MISMO borde que fijó el press, y por
   * eso va sin radio de enganche: no hay objeto que escoger, solo un valor que
   * leer (spec § 3.4). Con radio, soltar a 13 px del borde tiraba el arrastre
   * a clic y el piquete nacía en el press con el modal abierto, borrando la
   * distancia recién arrastrada (#1061).
   */
  const resolveReleaseT = useCallback((
    e: React.MouseEvent<SVGSVGElement>,
    press: EdgeTarget,
  ): number | null => {
    const rect = e.currentTarget.getBoundingClientRect();
    const pt = toPattern(e.clientX, e.clientY, rect);
    const snap = snapToAnyEdge(pt, ringData.pieces, zoom, press.pieceId, press.edgeRange, true);
    if (!snap) return null;
    const ring = ringData.rings.get(press.pieceId);
    if (!ring) return null;
    const spanMm = spanForEdge(ring, press.edgeRange);
    return tForMm(ring, spanMm, mmForSnap(ring, snap));
  }, [toPattern, ringData, zoom]);

  const resolveTargetOnRing = useCallback((target: EdgeTarget) => {
    const piece = ringData.pieces.find(candidate => candidate.id === target.pieceId);
    const ring = ringData.rings.get(target.pieceId);
    if (!piece || !ring) return null;
    const pressLocal = patternToPieceLocal(target.point, piece);
    const projected = projectToRing(ring, pressLocal).point;
    // Se resuelve un ancla de distancia 0 desde el propio punto: el punto sale
    // asentado sobre la curva de verdad —el snap viene del trazo aplanado— y la
    // normal sale de quien ya sabía calcularla, sin reimplementarla aquí.
    //
    // Con el anillo ya construido, y no con `resolveNotchAnchor`, que lo
    // reconstruiría: esto corre en cada movimiento del ratón sobre un borde.
    const resolved = resolveNotchAnchorV2(piece.outline, {
      refPoint: projected,
      direction: 'cw',
      distanceMm: 0,
      metric: 2,
    }, ring);
    if (!resolved) return null;
    return {
      piece,
      ring,
      localPoint: resolved.point,
      worldPoint: pieceLocalToPattern(resolved.point, piece),
      // La normal viaja con el punto: sus dos consumidores —el hover de
      // `NotchToolOverlay` y `createNotchLine`— esperan espacio de patrón.
      // Girar solo el punto dejaba la marca paralela al borde y el piquete
      // guardado apuntando de lado (#1068).
      normal: pieceLocalToPatternDirection(resolved.normal, piece),
    };
  }, [ringData]);

  /**
   * El lector y el commit pasan por esta misma resolución para que el número
   * prometido durante el gesto no pueda separarse del ancla que queda guardada.
   */
  const resolveDraggedNotch = useCallback((
    target: EdgeTarget,
    releaseT: number,
    firstDragT: number | null,
  ) => {
    const piece = ringData.pieces.find(candidate => candidate.id === target.pieceId);
    const ring = ringData.rings.get(target.pieceId);
    if (!piece || !ring) return null;

    const spanMm = spanForEdge(ring, target.edgeRange);
    const pressLocal = patternToPieceLocal(target.point, piece);
    const ref = resolveDistanceRef(
      ring,
      piece,
      pressLocal,
      spanMm,
      screenToPatternLength(EDGE_HIT_PX, zoom),
    );
    const anchor = distanceAnchorFrom(
      ring,
      ref,
      mmForT(ring, spanMm, releaseT),
      firstDragT === null ? null : mmForT(ring, spanMm, firstDragT),
      spanMm,
    );
    const resolved = resolveNotchAnchorV2(piece.outline, anchor, ring);
    if (!resolved) return null;

    const refT = tForMm(ring, spanMm, ref.distanceMm);
    const currentT = tForMm(ring, spanMm, projectToRing(ring, resolved.point).distanceMm);
    const segment: SegmentSelection = {
      pieceId: target.pieceId,
      edgeIndex: target.edgeIndex,
      edgeRange: target.edgeRange,
      startT: Math.min(refT, currentT),
      endT: Math.max(refT, currentT),
      startPoint: pieceLocalToPattern(ref.point, piece),
      endPoint: pieceLocalToPattern(resolved.point, piece),
    };

    return { piece, anchor, resolved, segment };
  }, [ringData, zoom]);

  const onCommit = useCallback((commit: EdgeCommit) => {
    const { target } = commit;
    const piece = ringData.pieces.find(candidate => candidate.id === target.pieceId);
    if (!piece) return;
    if (piezaBloqueada(piece, layerLocked)) {
      // El candado (maria-204) vale para todo lo que edita la pieza: Punto ya
      // lo respetaba y Piquete escribía. Mismo aviso que los demás verbos.
      dispatch(showInfoToast('Pieza bloqueada: se puede mover, pero no editar. Desbloquéala con clic derecho.'));
      return;
    }

    if (commit.kind === 'click') {
      const exact = resolveTargetOnRing(target);
      if (!exact) {
        // El gesto YA se armó sobre un borde válido: si el piquete no nace
        // aquí, el clic acertado se ve idéntico a uno fallado (#1117).
        noPasoNada('notch:sin-sitio', { pieceId: piece.id, edgeIndex: target.edgeIndex });
        return;
      }
      const notch = createNotchLine(exact.worldPoint, exact.normal, piece, effectiveOptions);
      onAddNotch(piece.id, notch);
      // Click-then-refine (D-4): la cota solo se abre cuando la posición fue
      // una adivinanza. Un piquete sin ancla conserva el clic, pero no tiene
      // desde dónde contar.
      if (notch.notchAnchor) {
        setRefining({ pieceId: piece.id, lineId: notch.id, source: 'placement', sesion: ++sesiones.current });
      }
      return;
    }

    const placement = resolveDraggedNotch(target, commit.releaseT, commit.firstDragT);
    if (!placement) {
      noPasoNada('notch:sin-emplazamiento', { pieceId: piece.id, edgeIndex: target.edgeIndex });
      return;
    }
    onAddNotch(piece.id, {
      id: newId(),
      type: 'notch',
      path: generateNotchPath(placement.resolved.point, placement.resolved.normal, effectiveOptions),
      notchOptions: effectiveOptions,
      notchAnchor: placement.anchor,
    });
  }, [ringData, resolveTargetOnRing, resolveDraggedNotch, effectiveOptions, onAddNotch, dispatch, layerLocked]);

  const gesture = useEdgeGesture({ resolveTarget, resolveReleaseT, onCommit });
  const handleMouseDown = gesture.handleMouseDown;
  const draggedPlacement = gesture.phase === 'dragging' && gesture.press && gesture.liveRange
    ? resolveDraggedNotch(
        gesture.press,
        liveTFromRange(gesture.press.t, gesture.liveRange),
        gesture.firstDragT(),
      )
    : null;
  const dragPreview: NotchDragPreview | null = draggedPlacement
    ? {
        refWorld: pieceLocalToPattern(draggedPlacement.anchor.refPoint, draggedPlacement.piece),
        currentWorld: pieceLocalToPattern(draggedPlacement.resolved.point, draggedPlacement.piece),
        distanceMm: draggedPlacement.anchor.distanceMm,
      }
    : null;
  const dragSegment = draggedPlacement?.segment ?? null;

  const refineExisting = useCallback((pieceId: string, line: InternalLine) => {
    const piece = pieces.find(candidate => candidate.id === pieceId);
    const liveLine = piece?.internals.find(candidate => candidate.id === line.id);
    if (!piece || liveLine?.type !== 'notch' || !liveLine.notchAnchor) return;
    if (piezaBloqueada(piece, layerLocked)) {
      // La puerta común de «Ajustar distancia…»: el menú no conoce el candado
      // de capa, y su cota escribiría en la pieza.
      dispatch(showInfoToast('Pieza bloqueada: se puede mover, pero no editar. Desbloquéala con clic derecho.'));
      return;
    }

    const resolved = resolveNotchAnchor(piece.outline, liveLine.notchAnchor);
    if (!resolved) {
      // El mismo molde que `confirmRefine`, veinte líneas más abajo: su puerta
      // (`actionCuration`) solo comprueba que el ancla EXISTA, no que resuelva,
      // así que «Ajustar distancia…» aparece y al pulsarlo no pasa nada — ni
      // panel, ni tira, ni bitácora. Arreglar una mitad parte el dibujo.
      noPasoNada('notch:ancla-perdida', { pieceId, notchId: liveLine.id });
      return;
    }

    // Solo se guarda qué piquete: lo demás se lee de Redux en cada render, así
    // que un menú abierto antes de otra edición no revive geometría obsoleta.
    setRefining({ pieceId, lineId: liveLine.id, source: 'existing', sesion: ++sesiones.current });
  }, [pieces, layerLocked, dispatch]);

  /** Escribe la distancia y la profundidad. La sesión sigue: Tab pasa a la profundidad, y la cierra el chip. */
  const confirmRefine = useCallback((distanceMm: number, depthMm: number) => {
    if (!refining) return;
    const piece = pieces.find(p => p.id === refining.pieceId);
    const liveLine = piece?.internals.find(l => l.id === refining.lineId);
    // La cota muere con su piquete, como toda cota (`aplicarCota`): un deshacer
    // que se lo llevó no se contesta volviéndolo a poner.
    if (!piece || liveLine?.type !== 'notch' || !liveLine.notchAnchor) { setRefining(null); return; }
    const resolved = resolveNotchAnchor(piece.outline, { ...liveLine.notchAnchor, distanceMm });
    if (!resolved) {
      // Si el contorno cambió bajo la cota, el refPoint ya no cae sobre él:
      // confirmar que no coloca tiene que decirlo (#1124, hermano).
      noPasoNada('notch:ancla-perdida', { pieceId: piece.id, notchId: liveLine.id });
      setRefining(null);
      return;
    }
    // La distancia que se PERSISTE es la que el anillo usó de verdad, no la
    // cruda: `resolveNotchAnchor` envuelve a propósito (ver su JSDoc), y un
    // registro que dice 450 sobre un contorno de 400 le anuncia a María un
    // número falso: el aviso lee este mismo campo (#1124).
    const editedAnchor = { ...liveLine.notchAnchor, distanceMm: resolved.distanceMm };
    const opts: NotchOptions = { ...(liveLine.notchOptions ?? effectiveOptions), length: depthMm };
    onUpdateNotch?.(piece.id, liveLine.id, generateNotchPath(resolved.point, resolved.normal, opts), editedAnchor, opts);
    setRefining(prev => (prev ? { ...prev, previewWorld: null } : prev));
  }, [refining, pieces, effectiveOptions, onUpdateNotch]);

  /** Dónde quedará con lo que se está tecleando; `null` borra el fantasma. */
  const previewRefine = useCallback((distanceMm: number | null) => {
    setRefining(prev => {
      if (!prev) return prev;
      if (distanceMm === null) return { ...prev, previewWorld: null };
      const piece = pieces.find(p => p.id === prev.pieceId);
      const line = piece?.internals.find(l => l.id === prev.lineId);
      if (!piece || !line?.notchAnchor) return prev;
      const resolved = resolveNotchAnchor(piece.outline, { ...line.notchAnchor, distanceMm });
      return { ...prev, previewWorld: resolved ? pieceLocalToPattern(resolved.point, piece) : null };
    });
  }, [pieces]);

  /** Esc, Enter o el siguiente clic: el piquete se queda como está y la sesión se cierra. */
  const cancelRefine = useCallback(() => setRefining(null), []);

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (e.key !== 'Escape') return;
    // Un Esc = una acción: cancelar el gesto evita que el mismo evento siga
    // hasta la deselección global y borre un contexto que ella no pidió tocar.
    if (gesture.isArmed()) {
      gesture.cancel();
      e.preventDefault();
      e.stopPropagation();
    }
  }, [gesture]);

  const handleMouseMove = useCallback((e: React.MouseEvent<SVGSVGElement>) => {
    gesture.handleMouseMove(e);
    if (gesture.isArmed()) return;
    const target = resolveTarget(e);
    const exact = target ? resolveTargetOnRing(target) : null;
    setState({
      hoveredPoint: exact && target
        ? { pieceId: target.pieceId, point: exact.worldPoint, normal: exact.normal }
        : null,
    });
  }, [gesture, resolveTarget, resolveTargetOnRing]);

  // Todo se mide contra la pieza de AHORA: la línea, su ancla, la esquina, el
  // piquete y el techo. Si el contorno encoge con la cota abierta, el techo de
  // la cota encoge con él (#1124).
  const refiningConTecho = useMemo<NotchRefineState | null>(() => {
    if (!refining) return null;
    const piece = pieces.find(p => p.id === refining.pieceId);
    const notch = piece?.internals.find(l => l.id === refining.lineId);
    if (!piece || notch?.type !== 'notch' || !notch.notchAnchor) return null;
    const resolved = resolveNotchAnchor(piece.outline, notch.notchAnchor);
    if (!resolved) return null;
    return {
      pieceId: piece.id,
      notch,
      source: refining.source,
      sesion: refining.sesion,
      previewWorld: refining.previewWorld,
      refWorld: pieceLocalToPattern(notch.notchAnchor.refPoint, piece),
      notchWorld: pieceLocalToPattern(resolved.point, piece),
      maxDistanceMm: outlinePerimeter(piece.outline, notch.notchAnchor.metric ?? 1),
    };
  }, [refining, pieces]);

  return {
    hoveredPoint: state.hoveredPoint,
    dragPreview,
    dragSegment,
    handleMouseDown,
    handleMouseMove,
    handleMouseUp: gesture.handleMouseUp,
    handleKeyDown,
    cancel: gesture.cancel,
    isArmed: gesture.isArmed,
    refining: refiningConTecho,
    refineExisting,
    confirmRefine,
    previewRefine,
    cancelRefine,
  };
}
