import { z } from 'zod';
import type { PatternPiece, Point2D } from '../../../types/types';
import { definirVerbo, type Verbo } from '../tipos';
import { computeRangeLengthMM, interpolateRangePoint } from '../../../utils/geometry/edgeInterpolation';
import { rangoMedibleDeBorde } from '../../../utils/semanticEdges';
import { distanceAlongPath } from '../../../utils/geometry/arcLength';
import { findEdgeForPoint } from '../../../utils/seam/notchMirror';
import { computeBoundingBox } from '../../../utils/geometry/transform';
import { computeArea } from '../../../utils/nesting/nestingEngine';
import { pieceLocalToPattern } from '../../../utils/geometry/pieceSpace';
import { piezaBloqueada } from '../../../utils/piezaBloqueada';
import { notchPoint } from '../../reasoning/proactiveAnalysis';
import { revisionDelProyecto } from '../../../store/revisionDelProyecto';
import { medirCostura, unDecimal } from '../costuras';

const punto = (p: Point2D) => ({ x: unDecimal(p.x), y: unDecimal(p.y) });

/** Los bordes de una pieza, medidos ahora: nunca `SemanticEdge.length`, que se congela al detectar. */
function bordesDe(piece: PatternPiece) {
  return (piece.edges ?? []).map(edge => {
    const largo = computeRangeLengthMM(piece.outline, edge.segmentRange);
    const desde = interpolateRangePoint(piece.outline, edge.segmentRange, 0)?.point;
    const hasta = interpolateRangePoint(piece.outline, edge.segmentRange, 1)?.point;
    const cuerda = desde && hasta ? Math.hypot(hasta.x - desde.x, hasta.y - desde.y) : largo;
    return {
      name: edge.name,
      type: edge.edgeType,
      length: unDecimal(largo),
      straight: largo - cuerda < 0.5,
      from: desde ? punto(pieceLocalToPattern(desde, piece)) : null,
      to: hasta ? punto(pieceLocalToPattern(hasta, piece)) : null,
    };
  });
}

/** Los piquetes: su borde, la distancia desde el inicio del borde y, si la tiene, su ancla (decisión 4). */
function piquetesDe(piece: PatternPiece) {
  return piece.internals.filter(l => l.type === 'notch').map(line => {
    const p = notchPoint(line);
    const borde = p ? findEdgeForPoint(piece, p) : null;
    const distancia = p && borde
      ? distanceAlongPath(piece.outline, p, ...rangoMedibleDeBorde(piece.outline, borde.segmentRange))
      : null;
    const ancla = line.notchAnchor;
    return {
      id: line.id,
      edge: borde?.name ?? null,
      distance_from_edge_start: distancia != null ? unDecimal(distancia) : null,
      anchor: ancla
        ? { from: punto(pieceLocalToPattern(ancla.refPoint, piece)), direction: ancla.direction, distance: unDecimal(ancla.distanceMm) }
        : null,
    };
  });
}

/** El margen: el de la pieza, los bordes que lo cambian (ancho propio o tramos) y el tipo de esquina. */
function margenDe(piece: PatternPiece) {
  const bordes: Record<string, { width: number | null; spans: { t_start: number; t_end: number; width: number }[] }> = {};
  for (const e of piece.edges ?? []) {
    if (e.seamAllowanceWidth == null && !e.seamAllowanceSpans?.length) continue;
    bordes[e.name] = {
      width: e.seamAllowanceWidth ?? null,
      spans: (e.seamAllowanceSpans ?? []).map(s => ({ t_start: s.tStart, t_end: s.tEnd, width: s.width })),
    };
  }
  return { piece: piece.seamAllowance, edges: bordes, corner_default: piece.defaultCornerType ?? 'mitered', corners: piece.cornerTypes ?? {} };
}

/** Ancho y alto: la misma caja que las cotas «Ancho» y «Alto» que ve María. */
function cajaDe(piece: PatternPiece) {
  const caja = computeBoundingBox([piece], [piece.id]);
  return { width: unDecimal(caja?.width ?? 0), height: unDecimal(caja?.height ?? 0) };
}

const readPattern = definirVerbo({
  name: 'read_pattern',
  description:
    'Read the whole pattern, measured now: every piece (size, area, lock, edges with length and end points, notches with their edge and distance, seam allowance) and every seam (both sewn lengths, the difference B minus A, and whether it walks within 3 mm). Units: mm, pattern space. Edges are named by `name`. Call it before acting.',
  args: z.object({}),
  run: (_args, ctx) => {
    const { pieces, seams, layerLocked, seamGroups } = ctx.getState().project;
    const warnings: string[] = [];
    if (seamGroups.length > 0) warnings.push(`${seamGroups.length} many-to-many seam groups are not described yet`);
    const piezas = pieces.map(piece => {
      if (!piece.edges?.length) warnings.push(`piece ${piece.id} has no detected edges`);
      return {
        id: piece.id,
        name: piece.name,
        category: piece.category ?? null,
        side: piece.side ?? null,
        locked: piezaBloqueada(piece, layerLocked),
        layer: piece.layer ?? 1,
        ...cajaDe(piece),
        area: unDecimal(computeArea(piece.outline)),
        edges: bordesDe(piece),
        notches: piquetesDe(piece),
        seam_allowance: margenDe(piece),
      };
    });
    return { revision: revisionDelProyecto(), units: 'mm', pieces: piezas, seams: seams.map(s => medirCostura(s, pieces)), warnings };
  },
});

const readPiece = definirVerbo({
  name: 'read_piece',
  description:
    'Read one piece in detail: every outline command with its index and end point (pattern space, mm), its edges with their command ranges and lengths, its internals (darts, grainline, notches) with ids, and its notches.',
  args: z.object({ piece_id: z.string().describe('a piece id from read_pattern') }),
  run: ({ piece_id }, ctx) => {
    const piece = ctx.getState().project.pieces.find(p => p.id === piece_id);
    if (!piece) throw new Error(`no piece with id ${piece_id}`);
    return {
      revision: revisionDelProyecto(),
      id: piece.id,
      name: piece.name,
      points: piece.outline.flatMap((cmd, index) => {
        if (cmd.values.length < 2) return [];
        const local = { x: cmd.values[cmd.values.length - 2], y: cmd.values[cmd.values.length - 1] };
        return [{ index, type: cmd.type, ...punto(pieceLocalToPattern(local, piece)) }];
      }),
      edges: (piece.edges ?? []).map(e => ({
        name: e.name, from_index: e.segmentRange[0], to_index: e.segmentRange[1],
        length: unDecimal(computeRangeLengthMM(piece.outline, e.segmentRange)),
      })),
      internals: piece.internals.map(l => ({ id: l.id, type: l.type })),
      notches: piquetesDe(piece),
    };
  },
});

export const VERBOS_DE_LEER: readonly Verbo[] = [readPattern, readPiece];
