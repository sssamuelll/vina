import { useState, useCallback, useEffect, useMemo } from 'react';
import { useSelector } from 'react-redux';
import type { RootState } from '../../store';
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
import { newId } from '../../utils/ids';
import {
  snapToAnyEdge,
  type SegmentSelection,
  type SnapResult,
} from './useSegmentSewingTool';
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
void NOTCH_SIZE; // reserved for future use

interface NotchToolState {
  hoveredPoint: { pieceId: string; point: Point2D; normal: Point2D } | null;
}

/**
 * Click-then-refine state (notch-precision F3, D-4): the click already
 * committed the notch; the precision modal reads this to offer numeric
 * re-positioning. `refWorld` = the anchor's reference corner in world
 * coords, for the canvas marker.
 */
export interface NotchRefineState {
  pieceId: string;
  notch: InternalLine;
  refWorld: Point2D;   // reference corner, world coords (canvas marker)
  notchWorld: Point2D; // notch entry point, world coords (canvas marker)
  /** Outline perimeter — the modal's distance ceiling (a longer distance would wrap). */
  maxDistanceMm: number;
  /** Live landing point while the user types a distance (canvas ghost marker). */
  previewWorld?: Point2D | null;
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
 * the nearest outline corner, so the precision modal can read/edit the
 * placement numerically. Cornerless outlines yield an anchor-less notch.
 * Exported for unit tests.
 */
export function createNotchLine(point: Point2D, normal: Point2D, piece: PatternPiece, notchOptions?: NotchOptions): InternalLine {
  const localPt = { x: point.x - piece.position.x, y: point.y - piece.position.y };
  const opts = notchOptions || DEFAULT_NOTCH_OPTIONS;
  const anchor = computeNotchAnchor(piece.outline, localPt);
  return {
    id: newId(),
    type: 'notch',
    path: generateNotchPath(localPt, normal, opts),
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
  const [state, setState] = useState<NotchToolState>({ hoveredPoint: null });
  const [refining, setRefining] = useState<NotchRefineState | null>(null);

  // Leaving the notch tool cancels any pending refine — otherwise the modal
  // lingers orphaned while its canvas marker (gated on activeTool in
  // ToolOverlay) vanishes. Mirrors the reset-on-tool-change effects in
  // useEditorInteractions. Optional chain: test stores may omit the editor
  // slice; an undefined activeTool must not clear anything.
  const activeTool = useSelector((s: RootState) => s.editor?.activeTool);
  useEffect(() => {
    if (refining && activeTool && activeTool !== 'notch') setRefining(null);
  }, [activeTool, refining]);

  // toolOptions.notch (G6, mirrors the toolOptions.seam convention): canonical
  // keys = NotchOptions names (shape/length/width/angle/count). Defaults live
  // here until a proper 2D Settings exists; the explicit param (modal, tests)
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

  /** El release solo aporta un t sobre el MISMO borde que fijó el press. */
  const resolveReleaseT = useCallback((
    e: React.MouseEvent<SVGSVGElement>,
    press: EdgeTarget,
  ): number | null => {
    const rect = e.currentTarget.getBoundingClientRect();
    const pt = toPattern(e.clientX, e.clientY, rect);
    const snap = snapToAnyEdge(pt, ringData.pieces, zoom, press.pieceId, press.edgeRange);
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
    const pressLocal = {
      x: target.point.x - piece.position.x,
      y: target.point.y - piece.position.y,
    };
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
      worldPoint: {
        x: resolved.point.x + piece.position.x,
        y: resolved.point.y + piece.position.y,
      },
      normal: resolved.normal,
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
    const pressLocal = {
      x: target.point.x - piece.position.x,
      y: target.point.y - piece.position.y,
    };
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
      startPoint: {
        x: ref.point.x + piece.position.x,
        y: ref.point.y + piece.position.y,
      },
      endPoint: {
        x: resolved.point.x + piece.position.x,
        y: resolved.point.y + piece.position.y,
      },
    };

    return { piece, anchor, resolved, segment };
  }, [ringData, zoom]);

  const onCommit = useCallback((commit: EdgeCommit) => {
    const { target } = commit;
    const piece = ringData.pieces.find(candidate => candidate.id === target.pieceId);
    if (!piece) return;

    if (commit.kind === 'click') {
      const exact = resolveTargetOnRing(target);
      if (!exact) return;
      const notch = createNotchLine(exact.worldPoint, exact.normal, piece, effectiveOptions);
      onAddNotch(piece.id, notch);
      // Click-then-refine (D-4): el modal solo abre cuando la posición fue una
      // adivinanza. Un piquete sin ancla conserva el clic, pero no puede refinarse.
      if (notch.notchAnchor) {
        setRefining({
          pieceId: piece.id,
          notch,
          refWorld: {
            x: notch.notchAnchor.refPoint.x + piece.position.x,
            y: notch.notchAnchor.refPoint.y + piece.position.y,
          },
          notchWorld: exact.worldPoint,
          maxDistanceMm: outlinePerimeter(piece.outline, notch.notchAnchor.metric ?? 1),
        });
      }
      return;
    }

    const placement = resolveDraggedNotch(target, commit.releaseT, commit.firstDragT);
    if (!placement) return;
    onAddNotch(piece.id, {
      id: newId(),
      type: 'notch',
      path: generateNotchPath(placement.resolved.point, placement.resolved.normal, effectiveOptions),
      notchOptions: effectiveOptions,
      notchAnchor: placement.anchor,
    });
  }, [ringData, resolveTargetOnRing, resolveDraggedNotch, effectiveOptions, onAddNotch]);

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
        refWorld: {
          x: draggedPlacement.anchor.refPoint.x + draggedPlacement.piece.position.x,
          y: draggedPlacement.anchor.refPoint.y + draggedPlacement.piece.position.y,
        },
        currentWorld: {
          x: draggedPlacement.resolved.point.x + draggedPlacement.piece.position.x,
          y: draggedPlacement.resolved.point.y + draggedPlacement.piece.position.y,
        },
        distanceMm: draggedPlacement.anchor.distanceMm,
      }
    : null;
  const dragSegment = draggedPlacement?.segment ?? null;

  /** Apply edited distance/depth: resolve the anchor and regenerate the path. */
  const confirmRefine = useCallback((distanceMm: number, depthMm: number) => {
    if (!refining?.notch.notchAnchor) { setRefining(null); return; }
    const piece = pieces.find(p => p.id === refining.pieceId);
    if (!piece) { setRefining(null); return; }

    const editedAnchor = { ...refining.notch.notchAnchor, distanceMm };
    const resolved = resolveNotchAnchor(piece.outline, editedAnchor);
    if (resolved) {
      const opts: NotchOptions = { ...(refining.notch.notchOptions ?? effectiveOptions), length: depthMm };
      const path = generateNotchPath(resolved.point, resolved.normal, opts);
      const liveLine = piece.internals.find(l => l.id === refining.notch.id);
      if (liveLine) {
        onUpdateNotch?.(refining.pieceId, refining.notch.id, path, editedAnchor, opts);
      } else {
        // The committed line vanished while the modal was open (undo while
        // the modal's input was blurred). Dispatching an update against a
        // dead lineId would silently no-op and close as if success —
        // confirming still owes the user a notch at the refined position,
        // so re-add it.
        onAddNotch(refining.pieceId, {
          id: newId(),
          type: 'notch',
          path,
          notchOptions: opts,
          notchAnchor: editedAnchor,
        });
      }
    }
    setRefining(null);
  }, [refining, pieces, effectiveOptions, onUpdateNotch, onAddNotch]);

  /** Live landing point while typing a distance — feeds the canvas ghost marker. */
  const previewRefine = useCallback((distanceMm: number) => {
    setRefining(prev => {
      if (!prev?.notch.notchAnchor) return prev;
      const piece = pieces.find(p => p.id === prev.pieceId);
      if (!piece) return prev;
      const resolved = resolveNotchAnchor(piece.outline, { ...prev.notch.notchAnchor, distanceMm });
      if (!resolved) return { ...prev, previewWorld: null };
      return {
        ...prev,
        previewWorld: {
          x: resolved.point.x + piece.position.x,
          y: resolved.point.y + piece.position.y,
        },
      };
    });
  }, [pieces]);

  /** Keep the clicked placement; just close the refine state. */
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
    refining,
    confirmRefine,
    previewRefine,
    cancelRefine,
  };
}
