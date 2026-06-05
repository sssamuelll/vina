import { useState, useCallback, useRef } from 'react';
import type { Point2D, PathCommand, PatternPiece, InternalLineType } from '../../types/types';
import { screenToPattern } from '../../utils/geometry';
import { draftedPieceDefaults } from '../../utils/defaults';

export interface PolyPenNode {
  point: Point2D;
  type: 'straight' | 'curve';
  handleIn?: Point2D;
  handleOut?: Point2D;
}

function nodesToCommands(nodes: PolyPenNode[], closed: boolean): PathCommand[] {
  if (nodes.length === 0) return [];
  const cmds: PathCommand[] = [{ type: 'M', values: [nodes[0].point.x, nodes[0].point.y] }];
  for (let i = 1; i < nodes.length; i++) {
    const prev = nodes[i - 1];
    const curr = nodes[i];
    if (curr.type === 'curve' || prev.type === 'curve') {
      const cp1 = prev.handleOut || prev.point;
      const cp2 = curr.handleIn || curr.point;
      cmds.push({ type: 'C', values: [cp1.x, cp1.y, cp2.x, cp2.y, curr.point.x, curr.point.y] });
    } else {
      cmds.push({ type: 'L', values: [curr.point.x, curr.point.y] });
    }
  }
  if (closed) cmds.push({ type: 'Z', values: [] });
  return cmds;
}

export function usePolyPenTool(
  zoom: number,
  pan: Point2D,
  onCompletePiece: (piece: Omit<PatternPiece, 'id' | 'createdAt' | 'updatedAt'>) => void,
  onCompleteInternalLine: (path: PathCommand[], lineType: InternalLineType) => void,
  mode: 'piece' | 'internalLine',
  lineType: InternalLineType,
) {
  const [state, setState] = useState<{
    nodes: PolyPenNode[];
    previewPoint: Point2D | null;
    isDragging: boolean;
    dragHandle: Point2D | null;
  }>({ nodes: [], previewPoint: null, isDragging: false, dragHandle: null });

  const nodesRef = useRef<PolyPenNode[]>([]);
  const dragStartRef = useRef<Point2D | null>(null);
  const CLOSE_THRESHOLD = 8;

  const toPattern = useCallback(
    (screenX: number, screenY: number, svgRect: DOMRect): Point2D =>
      screenToPattern(screenX, screenY, svgRect, zoom, pan),
    [zoom, pan],
  );

  const reset = useCallback(() => {
    nodesRef.current = [];
    setState({ nodes: [], previewPoint: null, isDragging: false, dragHandle: null });
  }, []);

  const finishShape = useCallback((closed: boolean) => {
    const nodes = nodesRef.current;
    if (nodes.length < 2) { reset(); return; }
    const cmds = nodesToCommands(nodes, closed);
    if (mode === 'piece') {
      onCompletePiece({
        name: 'Poly Pen Piece',
        outline: cmds,
        ...draftedPieceDefaults(),
      });
    } else {
      onCompleteInternalLine(cmds, lineType);
    }
    reset();
  }, [mode, lineType, onCompletePiece, onCompleteInternalLine, reset]);

  const handleMouseDown = useCallback((e: React.MouseEvent<SVGSVGElement>) => {
    const svgRect = e.currentTarget.getBoundingClientRect();
    const pt = toPattern(e.clientX, e.clientY, svgRect);
    if (nodesRef.current.length >= 3) {
      const first = nodesRef.current[0].point;
      const dx = (pt.x - first.x) * zoom;
      const dy = (pt.y - first.y) * zoom;
      if (Math.hypot(dx, dy) < CLOSE_THRESHOLD) { finishShape(true); return; }
    }
    dragStartRef.current = pt;
  }, [toPattern, zoom, finishShape]);

  const handleMouseMove = useCallback((e: React.MouseEvent<SVGSVGElement>) => {
    const svgRect = e.currentTarget.getBoundingClientRect();
    const pt = toPattern(e.clientX, e.clientY, svgRect);
    if (dragStartRef.current) {
      setState(prev => ({ ...prev, isDragging: true, dragHandle: pt, previewPoint: pt }));
    } else {
      setState(prev => ({ ...prev, previewPoint: pt }));
    }
  }, [toPattern]);

  const handleMouseUp = useCallback((e: React.MouseEvent<SVGSVGElement>) => {
    const svgRect = e.currentTarget.getBoundingClientRect();
    const pt = toPattern(e.clientX, e.clientY, svgRect);
    if (!dragStartRef.current) return;
    const start = dragStartRef.current;
    const dx = (pt.x - start.x) * zoom;
    const dy = (pt.y - start.y) * zoom;
    const wasDrag = Math.hypot(dx, dy) > 3;
    const node: PolyPenNode = wasDrag
      ? { point: start, type: 'curve', handleOut: pt, handleIn: { x: 2 * start.x - pt.x, y: 2 * start.y - pt.y } }
      : { point: start, type: 'straight' };
    nodesRef.current = [...nodesRef.current, node];
    dragStartRef.current = null;
    setState({ nodes: [...nodesRef.current], previewPoint: pt, isDragging: false, dragHandle: null });
  }, [toPattern, zoom]);

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (e.key === 'Escape') reset();
  }, [reset]);

  const handleDoubleClick = useCallback(() => {
    if (nodesRef.current.length >= 2) finishShape(true);
  }, [finishShape]);

  return {
    handleMouseDown, handleMouseMove, handleMouseUp, handleKeyDown, handleDoubleClick,
    nodes: state.nodes, previewPoint: state.previewPoint,
    isDragging: state.isDragging, dragHandle: state.dragHandle, reset,
  };
}
