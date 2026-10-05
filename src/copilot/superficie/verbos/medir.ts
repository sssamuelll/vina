import { z } from 'zod';
import type { PatternPiece } from '../../../types/types';
import { definirVerbo, type ContextoDeVerbo, type Verbo } from '../tipos';
import { computeRangeLengthMM } from '../../../utils/geometry/edgeInterpolation';
import { rangoMedibleDeBorde } from '../../../utils/semanticEdges';
import { projectOntoPath } from '../../../utils/geometry/arcLength';
import { patternToPieceLocal } from '../../../utils/geometry/pieceSpace';
import { metricasDeCaminar, TOLERANCIA_CAMINAR_MM } from '../../../utils/seam/caminarCostura';
import { validatePiece } from '../../../utils/patternRules';
import { auditNotches } from '../../reasoning/proactiveAnalysis';
import { revisionDelProyecto } from '../../../store/revisionDelProyecto';
import { medirCostura, unDecimal } from '../costuras';

/** Un extremo de un tramo: una fracción del borde, o un punto sobre él (espacio de patrón, mm). */
const extremo = z.union([z.number().min(0).max(1), z.object({ x: z.number(), y: z.number() })]);

const tramo = z.object({
  piece_id: z.string().describe('a piece id from read_pattern'),
  edge: z.string().describe('an edge name from read_pattern'),
  from: extremo.default(0).describe('start: a fraction of the edge (0..1), or a point on it in pattern space'),
  to: extremo.default(1).describe('end: a fraction of the edge (0..1), or a point on it in pattern space'),
});
type Tramo = z.output<typeof tramo>;

/** Un punto a más de esto del borde no está sobre el borde: no se proyecta en silencio. */
const FUERA_DEL_BORDE_MM = 1;

/** Dónde cae un extremo, en mm a lo largo del borde desde su inicio. */
function distanciaDesdeElInicio(e: Tramo['from'], piece: PatternPiece, rango: [number, number], largo: number, edge: string): number {
  if (typeof e === 'number') return e * largo;
  // La distancia y el desvío salen de la MISMA proyección: medir el desvío con
  // una ida y vuelta caía en otro punto de una curva (t paramétrico).
  const { distance, offset } = projectOntoPath(piece.outline, patternToPieceLocal(e, piece), rango[0], rango[1]);
  if (offset > FUERA_DEL_BORDE_MM) throw new Error(`point (${unDecimal(e.x)}, ${unDecimal(e.y)}) is ${unDecimal(offset)} mm off edge ${edge}`);
  return distance;
}

/** El largo de un tramo de un borde, medido ahora. */
function largoDeTramo(t: Tramo, ctx: ContextoDeVerbo): { length: number; edgeLength: number } {
  const piece = ctx.getState().project.pieces.find(p => p.id === t.piece_id);
  if (!piece) throw new Error(`no piece with id ${t.piece_id}`);
  const borde = piece.edges?.find(e => e.name === t.edge);
  if (!borde) throw new Error(`piece ${t.piece_id} has no edge named ${t.edge}`);
  const rango = rangoMedibleDeBorde(piece.outline, borde.segmentRange);
  const edgeLength = computeRangeLengthMM(piece.outline, borde.segmentRange);
  const desde = distanciaDesdeElInicio(t.from, piece, rango, edgeLength, t.edge);
  const hasta = distanciaDesdeElInicio(t.to, piece, rango, edgeLength, t.edge);
  return { length: Math.abs(hasta - desde), edgeLength };
}

const measure = definirVerbo({
  name: 'measure',
  description:
    'Measure along the curve: a whole edge, or the stretch between two ends given as fractions of the edge (0..1) or as points on it (pattern space, mm). A point more than 1 mm off the edge is an error, not a guess. Returns mm measured now.',
  args: tramo,
  run: (args, ctx) => {
    const { length, edgeLength } = largoDeTramo(args, ctx);
    return { ...args, length: unDecimal(length), edge_length: unDecimal(edgeLength) };
  },
});

const walkSeam = definirVerbo({
  name: 'walk_seam',
  description:
    'Walk two stretches against each other, like the Walk seam tool: both lengths, the difference (B minus A), the ease %, and whether they walk: |difference - ease_mm| under the tolerance (default 3 mm). Give a seam_id, or two stretches a and b. ease_mm is ease wanted on purpose (a sleeve cap is often longer than its armhole); Vina does not guess it, the default is 0.',
  args: z.object({
    seam_id: z.string().optional().describe('a seam id from read_pattern'),
    a: tramo.optional(),
    b: tramo.optional(),
    tolerance_mm: z.number().positive().optional().describe('default 3'),
    ease_mm: z.number().optional().describe('ease wanted on purpose, B minus A, in mm; default 0'),
  }),
  run: (args, ctx) => {
    const { pieces, seams } = ctx.getState().project;
    if (args.seam_id) {
      const seam = seams.find(s => s.id === args.seam_id);
      if (!seam) throw new Error(`no seam with id ${args.seam_id}`);
      return medirCostura(seam, pieces, { toleranceMm: args.tolerance_mm, easeMm: args.ease_mm });
    }
    if (!args.a || !args.b) throw new Error('give seam_id, or both a and b');
    const la = largoDeTramo(args.a, ctx).length;
    const lb = largoDeTramo(args.b, ctx).length;
    const tolerancia = args.tolerance_mm ?? TOLERANCIA_CAMINAR_MM;
    const holgura = args.ease_mm ?? 0;
    const m = metricasDeCaminar(la, lb, tolerancia, holgura);
    return {
      a: { ...args.a, length: unDecimal(la) },
      b: { ...args.b, length: unDecimal(lb) },
      delta: unDecimal(m.delta),
      ease_percent: unDecimal(m.easePercent),
      expected_ease: holgura,
      tolerance: tolerancia,
      band: m.band,
      walks: m.walks,
    };
  },
});

interface Problema {
  kind: 'seam-does-not-walk' | 'seam-not-measurable' | 'seam-groups-not-verified' | 'outline-open' | 'piece-without-outline' | 'notch';
  piece_ids: string[];
  seam_id?: string;
  message: string;
}

const verify = definirVerbo({
  name: 'verify',
  description:
    'Check the garment with numbers measured now: walks every active seam over its sewn stretches, and finds open outlines and notches without a partner across their seam. A difference may be ease on purpose (a sleeve cap is often longer than its armhole): verify does not guess it; pass it per seam in ease_mm. A seam allowance of 0 is normal, not a problem.',
  args: z.object({
    ease_mm: z.record(z.string(), z.number()).optional().describe('ease wanted on purpose per seam id, B minus A, in mm; default 0'),
  }),
  run: (args, ctx) => {
    const { pieces, seams, seamGroups } = ctx.getState().project;
    const costuras = seams.map(s => medirCostura(s, pieces, { easeMm: args.ease_mm?.[s.id] }));
    const issues: Problema[] = [];
    // Las costuras M:N todavía no se miden: decir «ok» sin mirarlas mentiría.
    if (seamGroups.length > 0) {
      issues.push({ kind: 'seam-groups-not-verified', piece_ids: [], message: `${seamGroups.length} many-to-many seam groups are not verified yet` });
    }
    for (const c of costuras) {
      const ids = [c.a.piece_id, c.b.piece_id];
      // Apagada: fuera de la simulación y del veredicto; se lista igual.
      if (!c.active) continue;
      if (c.walks === null) {
        issues.push({ kind: 'seam-not-measurable', piece_ids: ids, seam_id: c.id, message: `seam ${c.id}: a side has no measurable edge` });
      } else if (!c.walks) {
        issues.push({
          kind: 'seam-does-not-walk', piece_ids: ids, seam_id: c.id,
          message: `seam ${c.id} does not walk: ${c.a.length} mm against ${c.b.length} mm, ${c.delta} mm apart (tolerance ${c.tolerance} mm)`,
        });
      }
    }
    for (const piece of pieces) {
      for (const v of validatePiece(piece, { pieces })) {
        if (v.ruleId === 'OUTLINE_CLOSED') issues.push({ kind: 'outline-open', piece_ids: [piece.id], message: v.message });
        if (v.ruleId === 'PIECE_HAS_OUTLINE') issues.push({ kind: 'piece-without-outline', piece_ids: [piece.id], message: v.message });
      }
    }
    // Los avisos «info» de auditNotches son el «no notches on seam» de cada
    // costura sin piquetes: ruido, no un problema.
    for (const w of auditNotches(pieces, seams.filter(s => s.active !== false))) {
      if (w.severity !== 'info') issues.push({ kind: 'notch', piece_ids: w.pieceIds, message: w.message });
    }
    return { revision: revisionDelProyecto(), verdict: issues.length === 0 ? 'ok' : 'has-issues', seams: costuras, issues };
  },
});

export const VERBOS_DE_MEDIR: readonly Verbo[] = [measure, walkSeam, verify];
