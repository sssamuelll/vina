import { z } from 'zod';
import type { PatternPiece, Seam } from '../../../types/types';
import { definirVerbo, type Verbo } from '../tipos';
import { addSeam, removeSeam } from '../../../store/projectSlice';
import { newId } from '../../../utils/ids';
import { mirrorPctRange } from '../../../utils/seam/seamRange';
import { computeRangeLengthMM } from '../../../utils/geometry/edgeInterpolation';
import { actuar, cerrar, rehusar } from '../actuar';
import { medirCostura } from '../costuras';
import { fraccionesDeTramo, tramo } from './medir';

/** Menos que esto no es un tramo. */
const SIN_LARGO = 1e-6;

/** Un lado de costura con su rango; el rango entero no se guarda (convención de `Seam`). */
function lado(pieceId: string, edgeName: string, [desde, hasta]: [number, number]): Seam['pieceA'] {
  const d = desde < SIN_LARGO ? 0 : desde;
  const h = hasta > 1 - SIN_LARGO ? 1 : hasta;
  return d === 0 && h === 1 ? { pieceId, edgeName } : { pieceId, edgeName, tStart: d, tEnd: h };
}

/** El rango de un lado en el sentido de su borde: un B invertido lo guarda en el de cosido. */
function rangoEnElBorde(l: Seam['pieceA'] | Seam['pieceB']): [number, number] {
  const r: [number, number] = [l.tStart ?? 0, l.tEnd ?? 1];
  return 'reversed' in l && l.reversed === true ? mirrorPctRange(r) : r;
}

/** Las costuras que ya cosen, en más de 1 mm, el mismo tramo de un borde. */
function yaCosido(seam: Seam, seams: readonly Seam[], pieces: readonly PatternPiece[]): string[] {
  const avisos: string[] = [];
  for (const nuevo of [seam.pieceA, seam.pieceB]) {
    const piece = pieces.find(p => p.id === nuevo.pieceId);
    const borde = piece?.edges?.find(e => e.name === nuevo.edgeName);
    if (!piece || !borde) continue;
    const largo = computeRangeLengthMM(piece.outline, borde.segmentRange);
    const [n0, n1] = rangoEnElBorde(nuevo);
    for (const otra of seams) {
      for (const viejo of [otra.pieceA, otra.pieceB]) {
        if (viejo.pieceId !== nuevo.pieceId || viejo.edgeName !== nuevo.edgeName) continue;
        const [v0, v1] = rangoEnElBorde(viejo);
        if ((Math.min(n1, v1) - Math.max(n0, v0)) * largo > 1) {
          avisos.push(`edge ${nuevo.edgeName} of piece ${nuevo.pieceId} is already sewn there by seam ${otra.id}`);
        }
      }
    }
  }
  return [...new Set(avisos)];
}

const sew = definirVerbo({
  name: 'sew',
  description:
    'Sew two stretches together: a on one edge, b on another (they may be on the same piece). Each stretch runs along its own edge from `from` to `to`, given as fractions of the edge (0..1) or as points on it; default the whole edge. reversed: B is sewn from its end to its start, so the start of A meets the end of B. Returns both sewn lengths, the difference B minus A, and whether it walks within 3 mm (ease_mm: ease wanted on purpose, default 0).',
  args: z.object({
    a: tramo,
    b: tramo,
    reversed: z.boolean().default(false),
    ease_mm: z.number().optional().describe('ease wanted on purpose, B minus A, in mm; default 0'),
  }),
  run: (args, ctx) => {
    const a = fraccionesDeTramo(args.a, ctx);
    const b = fraccionesDeTramo(args.b, ctx);
    if ((a.hasta - a.desde) * a.edgeLength < SIN_LARGO) throw new Error('stretch a has no length');
    if ((b.hasta - b.desde) * b.edgeLength < SIN_LARGO) throw new Error('stretch b has no length');
    // Un tramo al revés de su borde pedía otro sentido; coserlo derecho y decir
    // `done` mentiría (revisión final de la 1b). El sentido se pide con `reversed`.
    for (const [nombre, t] of [['a', a], ['b', b]] as const) {
      if (t.alReves) throw new Error(`stretch ${nombre} runs against its edge: give from before to, and use reversed to sew B from its end`);
    }
    // B invertido: su rango se guarda en el sentido de cosido (`seamRange.ts`).
    const rangoB: [number, number] = args.reversed ? mirrorPctRange([b.desde, b.hasta]) : [b.desde, b.hasta];
    const seam: Seam = {
      id: newId(),
      pieceA: lado(a.piece.id, args.a.edge, [a.desde, a.hasta]),
      pieceB: { ...lado(b.piece.id, args.b.edge, rangoB), ...(args.reversed ? { reversed: true } : {}) },
      // Lo que pone la herramienta de coser de la interfaz (`buildSegmentSeam`),
      // con la procedencia del agente: ámbar en 3D, «revísame».
      type: 'standard', tension: 100, strength: 1, active: true, taped: false, tapeWidth: 10,
      createdBy: 'ai',
    };
    const { pieces, seams } = ctx.getState().project;
    const previa = medirCostura(seam, pieces, { easeMm: args.ease_mm });
    if (previa.a.length == null || previa.b.length == null) return rehusar('a side of the seam cannot be measured');
    const warnings = yaCosido(seam, seams, pieces);

    const e = actuar(ctx, 'sew', `coser ${a.piece.name} con ${b.piece.name}`, () => { ctx.dispatch(addSeam(seam)); });
    const cosida = e.despues.seams.find(s => s.id === seam.id);
    const m = cosida ? medirCostura(cosida, e.despues.pieces, { easeMm: args.ease_mm }) : null;
    if (m?.walks === false) {
      warnings.push(`the seam does not walk: ${m.a.length} mm against ${m.b.length} mm, ${m.delta} mm apart (tolerance ${m.tolerance} mm)`);
    }
    return cerrar(ctx, 'sew', e, {
      done: m != null && m.a.length != null && m.b.length != null,
      measure: { seam: m },
      warnings,
    });
  },
});

const unsew = definirVerbo({
  name: 'unsew',
  description: 'Unsew a seam. Returns which seam went and the two stretches it joined, measured before.',
  args: z.object({ seam_id: z.string().describe('a seam id from read_pattern') }),
  run: ({ seam_id }, ctx) => {
    const { seams, pieces } = ctx.getState().project;
    const seam = seams.find(s => s.id === seam_id);
    if (!seam) throw new Error(`no seam with id ${seam_id}`);
    const medida = medirCostura(seam, pieces);
    const nombre = (id: string) => pieces.find(p => p.id === id)?.name ?? id;
    const e = actuar(ctx, 'unsew', `descoser ${nombre(seam.pieceA.pieceId)} de ${nombre(seam.pieceB.pieceId)}`, () => {
      // El diálogo de confirmación es para los borrados de María; el agente
      // no puede contestarlo, y su paso se deshace con Ctrl+Z.
      ctx.dispatch({ ...removeSeam(seam_id), meta: { skipConfirmation: true } });
    });
    return cerrar(ctx, 'unsew', e, {
      done: !e.despues.seams.some(s => s.id === seam_id),
      measure: { removed: medida },
      warnings: [],
    });
  },
});

export const VERBOS_DE_COSTURA: readonly Verbo[] = [sew, unsew];
