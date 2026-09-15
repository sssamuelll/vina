import { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { RootState } from '../../store';
import { updatePiece } from '../../store/projectSlice';
import {
  beginUndoBatch,
  endUndoBatch,
  isUndoBatchTokenActive,
  withUndoBatchToken,
  type UndoBatchToken,
} from '../../store/undoMiddleware';
import type { Point2D, PatternPiece, PathCommand } from '../../types/types';
import {
  applyNodeMove,
  type EditableNode,
  type NodeRef,
} from './nodeEditorUtils';
import { editableCurveNodes } from './editableCurveNodes';
import { resmoothAfterMove } from './splineSegment';
import { screenToPattern, screenToPatternLength } from '../../utils/geometry';
import { rotatePoint } from '../../utils/geometry/transform';
import { showInfoToast } from '../../store/copilotUISlice';
import { reanchorNotches } from '../../utils/notchReanchor';
import {
  compensatePositionForPivotChange,
  patternToPieceLocal,
} from './pieceTransform';
import { piezaBloqueada } from '../../utils/piezaBloqueada';

const NO_HIDDEN_LAYER_IDS: number[] = [];

export interface EditCurveState {
  isEditing: boolean;
  editingPieceId: string | null;
  hoveredPieceId: string | null;
  selectedNode: NodeRef | null;
  hoveredNode: NodeRef | null;
  nodes: EditableNode[];
}

interface EditableNodeHit {
  ref: NodeRef;
  position: Point2D;
}

function sameNodeRef(a: NodeRef, b: NodeRef): boolean {
  return a.commandIndex === b.commandIndex && a.pointType === b.pointType;
}

/** Los manejadores mandan sobre las anclas, igual que en el mousedown vigente. */
function hitTestEditableNode(
  point: Point2D,
  nodes: EditableNode[],
  hitRadius: number,
): EditableNodeHit | null {
  for (const node of nodes) {
    if (node.cp1 && node.cp1Ref
        && Math.hypot(point.x - node.cp1.x, point.y - node.cp1.y) < hitRadius) {
      return { ref: node.cp1Ref, position: node.cp1 };
    }
    if (node.cp2 && node.cp2Ref
        && Math.hypot(point.x - node.cp2.x, point.y - node.cp2.y) < hitRadius) {
      return { ref: node.cp2Ref, position: node.cp2 };
    }
  }
  for (const node of nodes) {
    if (Math.hypot(point.x - node.position.x, point.y - node.position.y) < hitRadius) {
      return { ref: node.ref, position: node.position };
    }
  }
  return null;
}

/**
 * Rebuild overlay nodes from the piece current outline after an EXTERNAL
 * change (undo/redo restoring project state), so the anchor dots never detach
 * from the path. Selection and hover are cleared, not remapped: command
 * indices shift when an insert is undone, so a surviving ref would silently
 * denote different geometry.
 */
function resyncCurveStateToPiece(
  state: EditCurveState,
  piece: PatternPiece,
): EditCurveState {
  return {
    ...state,
    nodes: editableCurveNodes(piece),
    hoveredPieceId: null,
    selectedNode: null,
    hoveredNode: null,
  };
}

export function useEditCurve(zoom: number, pan: Point2D) {
  const dispatch = useDispatch();
  const pieces = useSelector((s: RootState) => s.project.pieces);
  const layerLocked = useSelector((s: RootState) => s.project.layerLocked);
  const hiddenLayerIds = useSelector((s: RootState) => s.simulation?.hiddenLayerIds ?? NO_HIDDEN_LAYER_IDS);
  const hoverablePieces = useMemo(
    () => pieces
      .filter(p => !piezaBloqueada(p, layerLocked) && !hiddenLayerIds.includes(p.layer ?? 1))
      .sort((a, b) => (a.zOrder ?? 0) - (b.zOrder ?? 0))
      .reverse(),
    [pieces, hiddenLayerIds, layerLocked],
  );

  const [state, setState] = useState<EditCurveState>({
    isEditing: false,
    editingPieceId: null,
    hoveredPieceId: null,
    selectedNode: null,
    hoveredNode: null,
    nodes: [],
  });

  useEffect(() => {
    if (state.isEditing || !state.hoveredPieceId) return;
    if (hoverablePieces.some(piece => piece.id === state.hoveredPieceId)) return;
    setState(current => ({
      ...current,
      hoveredPieceId: null,
      hoveredNode: null,
      nodes: [],
    }));
  }, [hoverablePieces, state.isEditing, state.hoveredPieceId]);

  const dragRef = useRef<{
    nodeRef: NodeRef;
    startMouse: Point2D;
    startPos: Point2D;
  } | null>(null);

  const dragBatchTokenRef = useRef<UndoBatchToken | null>(null);

  const beginDragBatch = useCallback((): UndoBatchToken => {
    const current = dragBatchTokenRef.current;
    if (current && isUndoBatchTokenActive(current)) return current;
    const token = beginUndoBatch(dispatch, 'Editar nodo');
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
   * Outline object (by identity) this hook itself dispatched. The resync
   * effect treats a pieces change as internal only when the store outline
   * IS that object — a boolean flag would mis-consume an external restore
   * that lands in the same React batch as an internal edit.
   */
  const expectedOutlineRef = useRef<PathCommand[] | null>(null);
  /** Last outline (by identity) of the edited piece this hook has seen. */
  const seenOutlineRef = useRef<PathCommand[] | null>(null);

  const toPattern = useCallback(
    (screenX: number, screenY: number, svgRect: DOMRect): Point2D =>
      screenToPattern(screenX, screenY, svgRect, zoom, pan),
    [zoom, pan],
  );

  const enterEdit = useCallback((pieceId: string, selectedNode?: NodeRef) => {
    endDragBatch();
    const piece = pieces.find(p => p.id === pieceId);
    if (!piece) return;
    if (piece.locked) {
      // Bloqueada = no editable (maria-204). Mismo aviso que useEditPattern.
      dispatch(showInfoToast('Pieza bloqueada: se puede mover, pero no editar. Desbloquéala con clic derecho.'));
      return;
    }
    // Seed the seen-outline identity so the resync effect first run is a
    // no-op — otherwise it would immediately clear the node just selected.
    seenOutlineRef.current = piece.outline;
    expectedOutlineRef.current = null;
    setState({
      isEditing: true,
      editingPieceId: pieceId,
      hoveredPieceId: null,
      selectedNode: selectedNode || null,
      hoveredNode: null,
      nodes: editableCurveNodes(piece),
    });
    dragRef.current = null;
  }, [pieces, endDragBatch, dispatch]);

  /**
   * Hermano de la entrada actuante de Editar patrón. `enterEdit` conserva su
   * semántica pura para todos sus callers; esta puerta añade exclusivamente el
   * press que arma el arrastre del nodo sembrado.
   */
  const enterEditActuando = useCallback((
    pieceId: string,
    e: React.MouseEvent<SVGSVGElement>,
  ): boolean => {
    if (e.button !== 0) return false;
    const piece = pieces.find(p => p.id === pieceId);
    if (!piece) return false;
    if (piezaBloqueada(piece, layerLocked)) {
      // Mismo criterio que la entrada actuante de Editar patrón: el candado de
      // capa no usa el texto del candado de pieza, pero tampoco se queda mudo.
      if (piece.locked) enterEdit(pieceId);
      else dispatch(showInfoToast('La capa de esta pieza está bloqueada: desbloquéala en Capas para editarla.'));
      return true;
    }
    const nodes = editableCurveNodes(piece);
    const rect = e.currentTarget.getBoundingClientRect();
    const point = patternToPieceLocal(
      toPattern(e.clientX, e.clientY, rect),
      piece,
    );
    const nodeHit = hitTestEditableNode(point, nodes, screenToPatternLength(8, zoom));
    if (!nodeHit) return false;

    enterEdit(pieceId, nodeHit.ref);
    dragRef.current = {
      nodeRef: nodeHit.ref,
      startMouse: { x: e.clientX, y: e.clientY },
      startPos: { ...nodeHit.position },
    };
    return true;
  }, [pieces, layerLocked, enterEdit, toPattern, zoom, dispatch]);

  const exitEdit = useCallback(() => {
    endDragBatch();
    setState({
      isEditing: false,
      editingPieceId: null,
      hoveredPieceId: null,
      selectedNode: null,
      hoveredNode: null,
      nodes: [],
    });
    dragRef.current = null;
    expectedOutlineRef.current = null;
    seenOutlineRef.current = null;
  }, [endDragBatch]);

  // Resync when the edited piece outline changes OUTSIDE this hook
  // (undo/redo via restoreState, copilot edits). Without this the dots detach
  // from the reverted path — nota de María #167, queja 3. The hook own
  // dispatches are skipped by outline identity.
  useEffect(() => {
    if (!state.isEditing || !state.editingPieceId) return;
    const piece = pieces.find(p => p.id === state.editingPieceId);
    if (!piece) {
      exitEdit();
      return;
    }
    if (seenOutlineRef.current === piece.outline) return;
    seenOutlineRef.current = piece.outline;
    if (expectedOutlineRef.current === piece.outline) {
      expectedOutlineRef.current = null;
      return;
    }
    endDragBatch();
    dragRef.current = null;
    setState(s => resyncCurveStateToPiece(s, piece));
  }, [pieces, state.isEditing, state.editingPieceId, exitEdit, endDragBatch]);

  useEffect(() => () => endDragBatch(), [endDragBatch]);

  const handleMouseDown = useCallback((e: React.MouseEvent<SVGSVGElement>) => {
    if (!state.isEditing || !state.editingPieceId) return false;
    if (e.button !== 0) return false;

    const svg = e.currentTarget;
    const rect = svg.getBoundingClientRect();
    const piece = pieces.find(p => p.id === state.editingPieceId);
    if (!piece) return false;
    const pt = patternToPieceLocal(
      toPattern(e.clientX, e.clientY, rect),
      piece,
    );

    const HIT = screenToPatternLength(8, zoom);

    const nodeHit = hitTestEditableNode(pt, state.nodes, HIT);
    if (nodeHit) {
      setState(s => ({ ...s, selectedNode: nodeHit.ref }));
      dragRef.current = {
        nodeRef: nodeHit.ref,
        startMouse: { x: e.clientX, y: e.clientY },
        startPos: { ...nodeHit.position },
      };
      return true;
    }

    // Clicked empty area — exit edit
    exitEdit();
    return false;
  }, [state, pieces, zoom, toPattern, exitEdit]);

  const handleMouseMove = useCallback((e: React.MouseEvent<SVGSVGElement>) => {
    if (!state.isEditing) {
      const rect = e.currentTarget.getBoundingClientRect();
      const HIT = screenToPatternLength(8, zoom);

      // El DOM decide la pieza mientras el puntero cruza su relleno o la línea
      // de un asa. El hit geométrico decide únicamente cuál nodo se resalta.
      const target = e.target as Element | null;
      const domPieceId = typeof target?.closest === 'function'
        ? target.closest('[data-piece-id]')?.getAttribute('data-piece-id')
        : null;
      if (domPieceId) {
        const domPiece = hoverablePieces.find(piece => piece.id === domPieceId);
        if (!domPiece) {
          // Una pieza visible pero bloqueada sigue ocluyendo las de abajo. El
          // clic le pertenece al dueño DOM, así que el hover también.
          setState(current => ({
            ...current,
            hoveredPieceId: null,
            hoveredNode: null,
            nodes: [],
          }));
          return false;
        }
        const nodes = editableCurveNodes(domPiece);
        const pt = patternToPieceLocal(
          toPattern(e.clientX, e.clientY, rect),
          domPiece,
        );
        const nodeHit = hitTestEditableNode(pt, nodes, HIT);
        setState(current => ({
          ...current,
          hoveredPieceId: domPiece.id,
          hoveredNode: nodeHit?.ref ?? null,
          nodes,
        }));
        return false;
      }

      for (const piece of hoverablePieces) {
        const nodes = editableCurveNodes(piece);
        const pt = patternToPieceLocal(
          toPattern(e.clientX, e.clientY, rect),
          piece,
        );
        const nodeHit = hitTestEditableNode(pt, nodes, HIT);
        if (nodeHit) {
          setState(s => ({
            ...s,
            hoveredPieceId: piece.id,
            hoveredNode: nodeHit.ref,
            nodes,
          }));
          return false;
        }
      }

      setState(s => ({
        ...s,
        hoveredPieceId: null,
        hoveredNode: null,
        nodes: [],
      }));
      return false;
    }

    if (!state.editingPieceId) return false;

    if (dragRef.current) {
      const piece = pieces.find(p => p.id === state.editingPieceId);
      if (piece) {
        const dxPattern = screenToPatternLength(e.clientX - dragRef.current.startMouse.x, zoom);
        const dyPattern = screenToPatternLength(e.clientY - dragRef.current.startMouse.y, zoom);
        const rotation = piece.rotation ?? 0;
        const { x: dx, y: dy } = rotation
          ? rotatePoint(
              { x: dxPattern, y: dyPattern },
              { x: 0, y: 0 },
              -rotation * Math.PI / 180,
            )
          : { x: dxPattern, y: dyPattern };
        if (dx === 0 && dy === 0) return true;
        const undoBatchToken = beginDragBatch();
        const newPos: Point2D = {
          x: dragRef.current.startPos.x + dx,
          y: dragRef.current.startPos.y + dy,
        };
        const movedOutline = applyNodeMove(
          piece.outline,
          dragRef.current.nodeRef.commandIndex,
          dragRef.current.nodeRef.pointType,
          newPos,
        );
        const newOutline = dragRef.current.nodeRef.pointType === 'anchor'
          ? resmoothAfterMove(
              piece.outline,
              movedOutline,
              dragRef.current.nodeRef.commandIndex,
            )
          : movedOutline;
        const updatedPiece = {
          ...piece,
          position: compensatePositionForPivotChange(piece, newOutline),
          outline: newOutline,
          // Same re-anchoring as the "Editar patrón" tool (nota de María
          // #171): both editors reshape the outline, so both must let the
          // notches follow it, or the surface you happen to use decides
          // whether your piquetes stay on the edge.
          internals: reanchorNotches(piece.internals, newOutline, piece.outline),
          updatedAt: Date.now(),
        };
        expectedOutlineRef.current = newOutline;
        dispatch(withUndoBatchToken(updatePiece(updatedPiece), undoBatchToken));
        setState(s => ({ ...s, nodes: editableCurveNodes(updatedPiece) }));
      }
      return true;
    }

    // Hover detection
    const svg = e.currentTarget;
    const rect = svg.getBoundingClientRect();
    const piece = pieces.find(p => p.id === state.editingPieceId);
    if (!piece) return false;
    const pt = patternToPieceLocal(
      toPattern(e.clientX, e.clientY, rect),
      piece,
    );
    const HIT = screenToPatternLength(8, zoom);

    const hovered = hitTestEditableNode(pt, state.nodes, HIT)?.ref ?? null;

    if ((!hovered && state.hoveredNode)
        || (hovered && (!state.hoveredNode || !sameNodeRef(hovered, state.hoveredNode)))) {
      setState(s => ({ ...s, hoveredNode: hovered }));
    }
    return false;
  }, [state, pieces, hoverablePieces, zoom, toPattern, dispatch, beginDragBatch]);

  const handleMouseUp = useCallback(() => {
    const draggedNode = dragRef.current?.nodeRef ?? null;
    dragRef.current = null;
    endDragBatch();
    if (draggedNode) {
      // El nodo termina bajo el puntero. Guardarlo en estado fuerza el render
      // que el cursor necesita y permite que el próximo move lo limpie al salir.
      setState(current => ({ ...current, hoveredNode: draggedNode }));
    }
  }, [endDragBatch]);

  const getCursor = useCallback(
    (): string => (dragRef.current || state.hoveredNode ? 'move' : 'default'),
    [state.hoveredNode],
  );

  const limpiarHover = useCallback(() => {
    setState(current => current.isEditing
      ? current
      : {
          ...current,
          hoveredPieceId: null,
          hoveredNode: null,
          nodes: [],
        });
  }, []);

  /**
   * P1 para Supr/Retroceso (#1115). Escape sigue llegando por la burbuja, donde
   * su valor de retorno no lo mira nadie.
   */
  const handleKeyDown = useCallback((e: KeyboardEvent): boolean => {
    // Con un nodo de curva agarrado, Supr es del nodo. No existe «borrar nodo
    // de curva», así que no se borra nada — pero hay que quedarse la tecla: el
    // atajo global escucha antes y se llevaba LA PIEZA con el nodo pintado
    // encima. Sin nodo, la tecla sigue y la pieza se borra como siempre.
    if ((e.key === 'Delete' || e.key === 'Backspace') && state.isEditing) {
      return state.selectedNode !== null;
    }
    if (e.key === 'Escape' && state.isEditing) {
      // Peldaño 3 de la escalera (E-4): el nodo seleccionado se suelta antes
      // de salir de la edición de curva. Mismo escalón que `useEditPattern`.
      //
      // Pero el peldaño 2 —GESTO VIVO— manda sobre el 3 (revisión adversarial
      // 2026-09-06): con `dragRef.current` puesto, Escape tiene que cancelar
      // el arrastre y cerrar el lote "Editar nodo", no solo soltar la
      // selección y dejar el nodo siguiendo al puntero.
      if (!dragRef.current && state.selectedNode) {
        setState(s => ({ ...s, selectedNode: null }));
        e.preventDefault();
        e.stopPropagation();
        return true;
      }
      exitEdit();
      return true;
    }
    return false;
  }, [state.isEditing, state.selectedNode, exitEdit]);

  return {
    ...state,
    enterEdit,
    enterEditActuando,
    exitEdit,
    handleMouseDown,
    handleMouseMove,
    handleMouseUp,
    handleKeyDown,
    limpiarHover,
    getCursor,
  };
}
