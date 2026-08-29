import { useState, useCallback, useRef } from 'react';
import { Point2D, PathCommand, PatternPiece } from '../../types/types';
import { screenToPattern } from '../../utils/geometry';
import { draftedPieceDefaults } from '../../utils/defaults';

/** 
 * A node in the pen path. Each node has an anchor point and optional
 * control handles for cubic bezier curves.
 * 
 * Click = sharp corner (no handles)
 * Click+drag = smooth curve (symmetric handles)
 * Alt+drag handle = break tangent (asymmetric)
 */
export interface PenNode {
  anchor: Point2D;
  /** Control point before the anchor (incoming curve) */
  handleIn: Point2D | null;
  /** Control point after the anchor (outgoing curve) */
  handleOut: Point2D | null;
}

interface PenState {
  nodes: PenNode[];
  /** Currently being dragged to create handles */
  isDragging: boolean;
  /** Preview line from last node to cursor */
  cursorPos: Point2D | null;
  /** Is the path closed? */
  isClosed: boolean;
}

const CLOSE_THRESHOLD = 12; // px — snap to first node to close

export function usePenTool(
  zoom: number,
  pan: Point2D,
  onComplete: (piece: Omit<PatternPiece, 'id' | 'createdAt' | 'updatedAt'>) => void,
) {
  const [state, setState] = useState<PenState>({
    nodes: [],
    isDragging: false,
    cursorPos: null,
    isClosed: false,
  });
  const nodesRef = useRef<PenNode[]>([]);
  nodesRef.current = state.nodes;

  /** Convert screen coords to pattern space */
  const toPattern = useCallback(
    (screenX: number, screenY: number, svgRect: DOMRect): Point2D =>
      screenToPattern(screenX, screenY, svgRect, zoom, pan),
    [zoom, pan],
  );

  /** Distance between two points */
  const dist = (a: Point2D, b: Point2D) => Math.hypot(a.x - b.x, a.y - b.y);

  /** Convert nodes array to PathCommand array */
  const nodesToCommands = useCallback((nodes: PenNode[], closed: boolean): PathCommand[] => {
    if (nodes.length === 0) return [];
    const cmds: PathCommand[] = [];
    cmds.push({ type: 'M', values: [nodes[0].anchor.x, nodes[0].anchor.y] });

    for (let i = 1; i < nodes.length; i++) {
      const prev = nodes[i - 1];
      const curr = nodes[i];
      const cp1 = prev.handleOut || prev.anchor;
      const cp2 = curr.handleIn || curr.anchor;

      // If both control points are at anchors → straight line
      if (cp1 === prev.anchor && cp2 === curr.anchor) {
        cmds.push({ type: 'L', values: [curr.anchor.x, curr.anchor.y] });
      } else {
        cmds.push({
          type: 'C',
          values: [cp1.x, cp1.y, cp2.x, cp2.y, curr.anchor.x, curr.anchor.y],
        });
      }
    }

    if (closed && nodes.length > 1) {
      const last = nodes[nodes.length - 1];
      const first = nodes[0];
      const cp1 = last.handleOut || last.anchor;
      const cp2 = first.handleIn || first.anchor;

      if (cp1 === last.anchor && cp2 === first.anchor) {
        cmds.push({ type: 'Z', values: [] });
      } else {
        cmds.push({
          type: 'C',
          values: [cp1.x, cp1.y, cp2.x, cp2.y, first.anchor.x, first.anchor.y],
        });
        cmds.push({ type: 'Z', values: [] });
      }
    }

    return cmds;
  }, []);

  /** Build SVG path string for preview */
  const buildPreviewPath = useCallback((): string => {
    const cmds = nodesToCommands(state.nodes, state.isClosed);
    return cmds.map(c => `${c.type}${c.values.join(',')}`).join(' ');
  }, [state.nodes, state.isClosed, nodesToCommands]);

  /** Build preview line from last node to cursor */
  const buildGuidePath = useCallback((): string => {
    if (state.nodes.length === 0 || !state.cursorPos || state.isClosed) return '';
    const last = state.nodes[state.nodes.length - 1];
    const cp1 = last.handleOut || last.anchor;
    if (cp1 === last.anchor) {
      return `M${last.anchor.x},${last.anchor.y} L${state.cursorPos.x},${state.cursorPos.y}`;
    }
    return `M${last.anchor.x},${last.anchor.y} C${cp1.x},${cp1.y} ${state.cursorPos.x},${state.cursorPos.y} ${state.cursorPos.x},${state.cursorPos.y}`;
  }, [state.nodes, state.cursorPos, state.isClosed]);

  const handleMouseDown = useCallback((e: React.MouseEvent<SVGSVGElement>) => {
    if (e.button !== 0) return; // left click only
    const svg = e.currentTarget;
    const rect = svg.getBoundingClientRect();
    const pt = toPattern(e.clientX, e.clientY, rect);
    const nodes = nodesRef.current;

    // Check if closing the path (clicking near first node)
    if (nodes.length > 2) {
      const first = nodes[0].anchor;
      if (dist(pt, first) * zoom < CLOSE_THRESHOLD) {
        // Close path
        const commands = nodesToCommands(nodes, true);
        onComplete({
          name: `Piece ${Date.now().toString(36)}`,
          outline: commands,
          ...draftedPieceDefaults(),
        });
        setState({ nodes: [], isDragging: false, cursorPos: null, isClosed: false });
        return;
      }
    }

    // Add new node
    const newNode: PenNode = { anchor: pt, handleIn: null, handleOut: null };
    setState(prev => ({
      ...prev,
      nodes: [...prev.nodes, newNode],
      isDragging: true,
    }));
  }, [toPattern, zoom, nodesToCommands, onComplete]);

  const handleMouseMove = useCallback((e: React.MouseEvent<SVGSVGElement>) => {
    const svg = e.currentTarget;
    const rect = svg.getBoundingClientRect();
    const pt = toPattern(e.clientX, e.clientY, rect);

    setState(prev => {
      if (prev.isDragging && prev.nodes.length > 0) {
        // Dragging = creating handles on last node
        const nodes = [...prev.nodes];
        const lastIdx = nodes.length - 1;
        const last = { ...nodes[lastIdx] };
        const anchor = last.anchor;

        // Symmetric handles: handleOut follows mouse, handleIn is mirrored
        last.handleOut = { x: pt.x, y: pt.y };
        last.handleIn = {
          x: 2 * anchor.x - pt.x,
          y: 2 * anchor.y - pt.y,
        };
        nodes[lastIdx] = last;
        return { ...prev, nodes, cursorPos: pt };
      }
      return { ...prev, cursorPos: pt };
    });
  }, [toPattern]);

  const handleMouseUp = useCallback(() => {
    setState(prev => ({ ...prev, isDragging: false }));
  }, []);

  /** Clear any in-progress stroke (used when switching away from the tool). */
  const reset = useCallback(() => {
    setState({ nodes: [], isDragging: false, cursorPos: null, isClosed: false });
  }, []);

  /**
   * Escape = cancel, Enter = finalize open path. Devuelve si consumió la
   * tecla: la captura CF-1 detiene la propagación solo entonces, así un
   * Escape sin trazo sigue deseleccionando y uno con trazo no hace las dos
   * cosas (spec 2026-08-29 § 8).
   */
  const handleKeyDown = useCallback((e: KeyboardEvent): boolean => {
    if (e.key === 'Escape') {
      if (nodesRef.current.length === 0) return false;
      setState({ nodes: [], isDragging: false, cursorPos: null, isClosed: false });
      return true;
    }
    if (e.key === 'Enter' && nodesRef.current.length > 1) {
      const commands = nodesToCommands(nodesRef.current, false);
      onComplete({
        name: `Piece ${Date.now().toString(36)}`,
        outline: commands,
        ...draftedPieceDefaults(),
      });
      setState({ nodes: [], isDragging: false, cursorPos: null, isClosed: false });
      return true;
    }
    return false;
  }, [nodesToCommands, onComplete]);

  // ¿El próximo clic cierra el contorno? Mismo umbral que el snap real de
  // handleMouseDown — el aviso y el comportamiento no pueden discrepar
  // (maria-196: el cierre existía pero era invisible).
  const willClose =
    state.nodes.length > 2 &&
    !!state.cursorPos &&
    !state.isClosed &&
    dist(state.cursorPos, state.nodes[0].anchor) * zoom < CLOSE_THRESHOLD;

  // Distance from last node to cursor for dimension label. Se apaga cuando
  // el cierre está armado: en ese momento la medida es ruido y era
  // exactamente lo que tapaba el punto de origen (maria-196).
  const lastPointDistance = state.nodes.length > 0 && state.cursorPos && !state.isClosed && !willClose
    ? {
        distance: dist(state.nodes[state.nodes.length - 1].anchor, state.cursorPos),
        position: state.cursorPos,
      }
    : null;

  return {
    nodes: state.nodes,
    isDragging: state.isDragging,
    isClosed: state.isClosed,
    willClose,
    previewPath: buildPreviewPath(),
    guidePath: buildGuidePath(),
    lastPointDistance,
    handleMouseDown,
    handleMouseMove,
    handleMouseUp,
    handleKeyDown,
    reset,
  };
}
