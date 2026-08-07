/**
 * usePointTool.ts — dock tool "Punto" (maria-203, #197, #172).
 *
 * Un gesto (press-track-release) y tres verbos despachados por el chip activo
 * de tool-options: añadir punto / convertir en curva por puntos / convertir en
 * bezier. El contexto solo NIEGA, nunca adivina: un ancla existente dentro del
 * radio no es objetivo (guard de findInsertTarget), una curva solo acepta el
 * chip 'point', una pieza bloqueada avisa al soltar. Este tool nunca
 * selecciona ni mueve puntos — eso es de editPattern, y María pidió
 * explícitamente esa separación.
 *
 * Gramática completa: propuesta de Petra Haft, sesión maria dock-tool-puntos.
 */
import { useState, useCallback, useEffect, useMemo } from 'react';
import { useSelector } from 'react-redux';
import type { RootState } from '../../store';
import type { PatternPiece, Point2D } from '../../types/types';
import { screenToPattern, screenToPatternLength } from '../../utils/geometry';
import { getEdgeEndpoints } from '../../utils/geometry/path';
import { findInsertTarget, patternToPieceLocal, pieceLocalToPattern } from './useEditPattern';
import { extractNodes, hitTestNode, type EditableNode } from './nodeEditorUtils';

export type PointToolMode = 'point' | 'curvePoints' | 'bezier';

/** Objetivo resuelto bajo el cursor (coords de mundo para el preview). */
export interface PointToolTarget {
  pieceId: string;
  commandIndex: number;
  t: number;
  /** Proyección sobre el lado, en mundo — el glyph del chip 'point'. */
  world: Point2D;
  /** Extremos del lado en mundo — el highlight de los chips de conversión. */
  sideEnds: [Point2D, Point2D] | null;
}

export interface PointToolHover {
  target: PointToolTarget | null;
  /**
   * 'ok'       → aplicable: crosshair + preview + clic despacha.
   * 'anchor'   → hay un punto existente en el radio: not-allowed, sin preview.
   * 'curveMode'→ lado curvo con chip de conversión: not-allowed, sin preview.
   * 'locked'   → pieza bloqueada: not-allowed; el verbo avisa al soltar.
   */
  reason: 'ok' | 'anchor' | 'curveMode' | 'locked';
}

// La perilla de calibración del tool: un solo radio para el guard de ancla y
// el hit de lado. Si a María "se le escapa el borde", súbelo; si "no la deja
// poner cerca de la esquina", bájalo.
const HIT_RADIUS_PX = 12;

export function usePointTool(
  zoom: number,
  pan: Point2D,
  pieces: PatternPiece[],
  verbs: {
    addPointOnSegment: (commandIndex: number, t: number, pieceId?: string) => void;
    convertSegment: (commandIndex: number, toCurve: boolean, pieceId?: string) => void;
    convertSegmentToPoints: (commandIndex: number, pieceId?: string) => void;
  },
) {
  const [hover, setHover] = useState<PointToolHover | null>(null);
  const [armed, setArmed] = useState(false);

  const mode: PointToolMode = useSelector((s: RootState) => {
    const opts = s.tools.toolOptions?.point as { mode?: PointToolMode } | undefined;
    return opts?.mode ?? 'point';
  });

  // Salir del tool limpia el estado transitorio (mismo patrón que el reset de
  // refine en useNotchTool).
  const activeTool = useSelector((s: RootState) => s.editor?.activeTool);
  useEffect(() => {
    if (activeTool !== 'point') {
      setHover(null);
      setArmed(false);
    }
  }, [activeTool]);

  // Nodos por pieza para el guard de ancla — memo por identidad de `pieces`,
  // no por evento de mouse.
  const nodesByPiece = useMemo(() => {
    const m = new Map<string, EditableNode[]>();
    for (const p of pieces) m.set(p.id, extractNodes(p));
    return m;
  }, [pieces]);

  const resolveHover = useCallback(
    (e: React.MouseEvent<SVGSVGElement>): PointToolHover | null => {
      const rect = e.currentTarget.getBoundingClientRect();
      const world = screenToPattern(e.clientX, e.clientY, rect, zoom, pan);
      const hitRadius = screenToPatternLength(HIT_RADIUS_PX, zoom);

      // La pieza de más arriba primero: que gane la que se ve.
      for (let i = pieces.length - 1; i >= 0; i--) {
        const piece = pieces[i];
        if (!piece.outline?.length) continue;
        const local = patternToPieceLocal(world, piece);
        const nodes = nodesByPiece.get(piece.id) ?? [];

        // Ancla existente dentro del radio: hay algo, pero no es objetivo —
        // el mismo guard que refuta el doble clic accidental.
        if (hitTestNode(local, nodes, hitRadius)) {
          return { target: null, reason: 'anchor' };
        }

        const hit = findInsertTarget(local, nodes, piece.outline, hitRadius);
        if (!hit) continue;

        const cmdType = piece.outline[hit.commandIndex]?.type;
        const isCurve = cmdType === 'C' || cmdType === 'Q';
        const ep = getEdgeEndpoints(piece.outline, hit.commandIndex);
        const target: PointToolTarget = {
          pieceId: piece.id,
          commandIndex: hit.commandIndex,
          t: hit.t,
          world,
          sideEnds: ep
            ? [pieceLocalToPattern(ep.start, piece), pieceLocalToPattern(ep.end, piece)]
            : null,
        };
        if (isCurve && mode !== 'point') return { target, reason: 'curveMode' };
        if (piece.locked) return { target, reason: 'locked' };
        return { target, reason: 'ok' };
      }
      return null;
    },
    [zoom, pan, pieces, nodesByPiece, mode],
  );

  const handleMouseMove = useCallback(
    (e: React.MouseEvent<SVGSVGElement>) => setHover(resolveHover(e)),
    [resolveHover],
  );

  const handleMouseDown = useCallback(
    (e: React.MouseEvent<SVGSVGElement>) => {
      if (e.button !== 0) return;
      const h = resolveHover(e);
      setHover(h);
      if (h?.target) setArmed(true);
    },
    [resolveHover],
  );

  /** El release manda: lo que esté bajo el cursor al soltar es el objetivo. */
  const handleMouseUp = useCallback(
    (e: React.MouseEvent<SVGSVGElement>) => {
      if (!armed) return;
      setArmed(false);
      const h = resolveHover(e);
      setHover(h);
      if (!h?.target) return;
      // 'locked' despacha igual: el verbo tiene el gate y el toast — el
      // rechazo suena una sola vez y en un solo sitio.
      if (h.reason !== 'ok' && h.reason !== 'locked') return;
      const { pieceId, commandIndex, t } = h.target;
      if (mode === 'point') verbs.addPointOnSegment(commandIndex, t, pieceId);
      else if (mode === 'curvePoints') verbs.convertSegmentToPoints(commandIndex, pieceId);
      else verbs.convertSegment(commandIndex, true, pieceId);
    },
    [armed, resolveHover, mode, verbs],
  );

  /** Esc con colocación armada = cancelar SOLO eso (coordinación CF-1). */
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === 'Escape' && armed) {
        setArmed(false);
        e.preventDefault();
        e.stopPropagation();
      }
    },
    [armed],
  );

  const getCursor = useCallback((): string => {
    if (!hover) return 'default';
    return hover.reason === 'ok' ? 'crosshair' : 'not-allowed';
  }, [hover]);

  return {
    /** Para el overlay: preview solo cuando reason === 'ok'. */
    hover,
    mode,
    armed,
    handleMouseDown,
    handleMouseMove,
    handleMouseUp,
    handleKeyDown,
    getCursor,
  };
}
