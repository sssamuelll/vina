import { useState, useCallback } from 'react';
import { useSelector } from 'react-redux';
import type { PatternPiece, Point2D } from '../../types/types';
import type { Trim, TrimPlacement } from '../../types/trim';
import type { RootState, AppDispatch } from '../../store';
import { addTrim } from '../../store/projectSlice';
import { batchUndo } from '../../store/undoMiddleware';
import { getTrimPreset } from '../../utils/trim/trimLibrary';
import { TRIM_DEFAULTS } from '../../types/trim';
import { interpolateEdgePoint, computeEdgeLengthMM } from '../../utils/geometry/edgeInterpolation';
import { screenToPattern } from '../../utils/geometry';
import { pieceLocalToPattern } from '../../utils/geometry/pieceSpace';
import { uid } from '../../utils/pathHelpers';
import { noPasoNada } from './noPasoNada';

const EDGE_HIT_THRESHOLD = 20; // px screen space

export interface TrimHover {
  pieceId: string;
  edgeName: string;
  point: Point2D;
  t: number;
}

/**
 * Find the closest semantic edge point to a screen-space position.
 * Iterates all pieces and their semantic edges, projects the mouse point
 * onto each edge, and returns the closest hit within threshold.
 */
export function findClosestEdgePoint(
  pt: Point2D,
  pieces: PatternPiece[],
  zoom: number,
): TrimHover | null {
  let best: TrimHover | null = null;
  let bestDist = Infinity;

  for (const piece of pieces) {
    if (!piece.edges || piece.edges.length === 0) continue;

    for (const edge of piece.edges) {
      // Sample the edge at many t values to find closest point
      const steps = 50;
      for (let i = 0; i <= steps; i++) {
        const t = i / steps;
        const result = interpolateEdgePoint(piece, edge.name, t);
        if (!result) continue;

        // A espacio de patron. Sumar solo `position` apunta a donde la
        // pieza estaba ANTES de girar, y con el umbral de 20px eso no
        // engancha nada sobre una pieza girada (#1068).
        const { x: wx, y: wy } = pieceLocalToPattern(result.point, piece);
        const dist = Math.hypot(pt.x - wx, pt.y - wy) * zoom;

        if (dist < EDGE_HIT_THRESHOLD && dist < bestDist) {
          bestDist = dist;
          best = {
            pieceId: piece.id,
            edgeName: edge.name,
            point: { x: wx, y: wy },
            t,
          };
        }
      }
    }
  }

  return best;
}

export function useTrimTool(
  zoom: number,
  pan: Point2D,
  pieces: PatternPiece[],
  dispatch: AppDispatch,
) {
  const [hoveredEdge, setHoveredEdge] = useState<TrimHover | null>(null);
  const toolOptions = useSelector((s: RootState) => s.tools.toolOptions['trimPlace'] ?? {});

  const toPattern = useCallback(
    (screenX: number, screenY: number, svgRect: DOMRect): Point2D =>
      screenToPattern(screenX, screenY, svgRect, zoom, pan),
    [zoom, pan],
  );

  const handleMouseMove = useCallback((e: React.MouseEvent<SVGSVGElement>) => {
    const svg = e.currentTarget;
    const rect = svg.getBoundingClientRect();
    const pt = toPattern(e.clientX, e.clientY, rect);
    setHoveredEdge(findClosestEdgePoint(pt, pieces, zoom));
  }, [toPattern, pieces, zoom]);

  const handleMouseDown = useCallback((e: React.MouseEvent<SVGSVGElement>) => {
    if (e.button !== 0) return;
    const svg = e.currentTarget;
    const rect = svg.getBoundingClientRect();
    const pt = toPattern(e.clientX, e.clientY, rect);

    const hit = findClosestEdgePoint(pt, pieces, zoom);
    if (!hit) return;

    // Resolve preset
    const presetId = toolOptions.trimPreset as string | undefined;
    const preset = presetId ? getTrimPreset(presetId) : undefined;

    const type = preset?.type ?? TRIM_DEFAULTS.type;
    // `nameEs`, no `name`: lo que se guarda aquí es lo que la lista de
    // materiales le pinta después (`trimExtractor.ts` lo copia tal cual). Con
    // `name`, María elegía «Botón Plano 15mm» en la tira y la pestaña Avíos le
    // decía «Botón — Flat Button 15mm»: dos nombres para el mismo objeto en la
    // misma sesión. La columna española ya existía en `trimLibrary.ts` y era
    // uno de los ocho contratos que la auditoría encontró rodeados.
    const name = preset?.nameEs ?? preset?.name ?? TRIM_DEFAULTS.name;
    const material = preset?.material ?? TRIM_DEFAULTS.material;
    const color = preset?.color ?? TRIM_DEFAULTS.color;
    const size = preset?.size ?? TRIM_DEFAULTS.size;
    const unitCost = preset?.unitCost ?? TRIM_DEFAULTS.unitCost;

    const placementMode = (toolOptions.placementMode as string) ?? 'single';

    let placement: TrimPlacement;

    if (placementMode === 'distribute') {
      const piece = pieces.find(p => p.id === hit.pieceId);
      if (!piece) return;

      const count = (toolOptions.distributeCount as number) ?? 5;
      const startOffset = (toolOptions.startOffset as number) ?? 10;
      const endOffset = (toolOptions.endOffset as number) ?? 10;

      const edgeLen = computeEdgeLengthMM(piece, hit.edgeName);
      if (edgeLen <= 0) {
        // El clic acertó un borde, pero repartir avíos sobre un borde de largo
        // cero no da ninguno: sin aviso, el clic bueno se ve como uno fallado.
        noPasoNada('trim:borde-sin-largo', { pieceId: hit.pieceId, edgeName: hit.edgeName });
        return;
      }

      const tStart = Math.min(startOffset / edgeLen, 0.49);
      const tEnd = Math.max(1 - endOffset / edgeLen, 0.51);

      const positions: number[] = [];
      for (let i = 0; i < count; i++) {
        positions.push(count === 1 ? (tStart + tEnd) / 2 : tStart + i * (tEnd - tStart) / (count - 1));
      }

      placement = { mode: 'edge-points', edgeName: hit.edgeName, positions };
    } else {
      placement = { mode: 'edge-points', edgeName: hit.edgeName, positions: [hit.t] };
    }

    const trim: Trim = {
      id: uid(),
      pieceId: hit.pieceId,
      type,
      presetId: presetId,
      name,
      description: '',
      placement,
      material,
      color,
      size,
      unitCost,
      active: true,
    };

    batchUndo(dispatch, placementMode === 'distribute' ? 'Distribuir avíos' : 'Colocar avío', () => {
      dispatch(addTrim(trim));
    });
  }, [toPattern, pieces, zoom, dispatch, toolOptions]);

  return {
    hoveredEdge,
    handleMouseDown,
    handleMouseMove,
  };
}
