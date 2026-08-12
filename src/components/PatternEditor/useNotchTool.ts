import { useState, useCallback, useEffect, useMemo } from 'react';
import { useSelector } from 'react-redux';
import type { RootState } from '../../store';
import { PatternPiece, Point2D, InternalLine, NotchOptions } from '../../types/types';
import { generateNotchPath, DEFAULT_NOTCH_OPTIONS } from '../../utils/notches';
import { computeNotchAnchor, resolveNotchAnchor, outlinePerimeter } from '../../utils/notchAnchor';
import { screenToPattern } from '../../utils/geometry';
import { newId } from '../../utils/ids';

/**
 * Notch tool: click on a piece edge to place a notch mark.
 * Notches are small perpendicular marks on the outline that indicate
 * alignment points for sewing pieces together.
 */

const EDGE_HIT_THRESHOLD = 20; // px screen space
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

/** Get closest point on piece outline to a given point */
function closestPointOnOutline(
  pt: Point2D,
  piece: PatternPiece,
  zoom: number,
): { point: Point2D; normal: Point2D; dist: number } | null {
  const cmds = piece.outline;
  let best: { point: Point2D; normal: Point2D; dist: number } | null = null;

  let cx = 0, cy = 0;
  for (let i = 0; i < cmds.length; i++) {
    const cmd = cmds[i];
    const v = cmd.values;
    let ex: number, ey: number;

    switch (cmd.type) {
      case 'M': cx = v[0]; cy = v[1]; continue;
      case 'L': ex = v[0]; ey = v[1]; break;
      case 'C': ex = v[4]; ey = v[5]; break;
      case 'Q': ex = v[2]; ey = v[3]; break;
      case 'Z': {
        const m = cmds[0];
        if (m.type !== 'M') continue;
        ex = m.values[0]; ey = m.values[1];
        break;
      }
      default: continue;
    }

    // Project pt onto segment cx,cy → ex,ey
    const sx = piece.position.x + cx;
    const sy = piece.position.y + cy;
    const exx = piece.position.x + ex;
    const eyy = piece.position.y + ey;
    const dx = exx - sx, dy = eyy - sy;
    const lenSq = dx * dx + dy * dy;
    if (lenSq === 0) { cx = ex; cy = ey; continue; }

    let t = ((pt.x - sx) * dx + (pt.y - sy) * dy) / lenSq;
    t = Math.max(0, Math.min(1, t));
    const projX = sx + t * dx;
    const projY = sy + t * dy;
    const d = Math.hypot(pt.x - projX, pt.y - projY) * zoom;

    if (d < EDGE_HIT_THRESHOLD && (!best || d < best.dist)) {
      // Normal = perpendicular to edge, pointing inward
      const len = Math.sqrt(lenSq);
      const nx = -dy / len;
      const ny = dx / len;
      best = {
        point: { x: projX, y: projY },
        normal: { x: nx, y: ny },
        dist: d,
      };
    }

    cx = ex; cy = ey;
  }

  return best;
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

  const toPattern = useCallback(
    (screenX: number, screenY: number, svgRect: DOMRect): Point2D =>
      screenToPattern(screenX, screenY, svgRect, zoom, pan),
    [zoom, pan],
  );

  const handleMouseDown = useCallback((e: React.MouseEvent<SVGSVGElement>) => {
    if (e.button !== 0) return;
    const svg = e.currentTarget;
    const rect = svg.getBoundingClientRect();
    const pt = toPattern(e.clientX, e.clientY, rect);

    for (const piece of pieces) {
      const hit = closestPointOnOutline(pt, piece, zoom);
      if (hit) {
        const notch = createNotchLine(hit.point, hit.normal, piece, effectiveOptions);
        onAddNotch(piece.id, notch);
        // Click-then-refine (D-4): the notch is committed; if it anchored,
        // open the refine state so the precision modal can adjust it. An
        // anchor-less notch (cornerless outline) has nothing to refine
        // numerically — the click placement stands.
        if (notch.notchAnchor) {
          setRefining({
            pieceId: piece.id,
            notch,
            refWorld: {
              x: notch.notchAnchor.refPoint.x + piece.position.x,
              y: notch.notchAnchor.refPoint.y + piece.position.y,
            },
            notchWorld: { x: hit.point.x, y: hit.point.y },
            maxDistanceMm: outlinePerimeter(piece.outline, notch.notchAnchor.metric ?? 1),
          });
        }
        return;
      }
    }
  }, [toPattern, pieces, zoom, onAddNotch, effectiveOptions]);

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

  const handleMouseMove = useCallback((e: React.MouseEvent<SVGSVGElement>) => {
    const svg = e.currentTarget;
    const rect = svg.getBoundingClientRect();
    const pt = toPattern(e.clientX, e.clientY, rect);

    for (const piece of pieces) {
      const hit = closestPointOnOutline(pt, piece, zoom);
      if (hit) {
        setState({ hoveredPoint: { pieceId: piece.id, point: hit.point, normal: hit.normal } });
        return;
      }
    }
    setState({ hoveredPoint: null });
  }, [toPattern, pieces, zoom]);

  return {
    hoveredPoint: state.hoveredPoint,
    handleMouseDown,
    handleMouseMove,
    refining,
    confirmRefine,
    previewRefine,
    cancelRefine,
  };
}
