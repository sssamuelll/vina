import { z } from 'zod';
import type { InternalLine, PatternPiece, SemanticEdge } from '../../../types/types';
import { definirVerbo, type Verbo } from '../tipos';
import { addInternalLine, addNotchPair, updateInternalLine } from '../../../store/projectSlice';
import { computeRangeLengthMM } from '../../../utils/geometry/edgeInterpolation';
import { distanceAlongPath } from '../../../utils/geometry/arcLength';
import { rangoMedibleDeBorde } from '../../../utils/semanticEdges';
import { DEFAULT_NOTCH_OPTIONS } from '../../../utils/notches';
import { newId } from '../../../utils/ids';
import { createMirrorNotchLine, mapNotchAcrossSeam, puntoEnElBorde } from '../../../utils/seam/notchMirror';
import { notchPoint } from '../../reasoning/proactiveAnalysis';
import { actuar, cerrar, estaBloqueada, MARGEN_MM, piezaDe, rehusar } from '../actuar';
import { unDecimal } from '../costuras';

/** Dónde queda un piquete: mm desde el inicio de su borde, como lo mide `read_pattern`. */
function distanciaDelPiquete(piece: PatternPiece, edge: SemanticEdge, line: InternalLine): number | null {
  const p = notchPoint(line, piece.outline);
  return p ? distanceAlongPath(piece.outline, p, ...rangoMedibleDeBorde(piece.outline, edge.segmentRange)) : null;
}

const cerca = (medida: number | null, pedida: number) => medida != null && Math.abs(medida - pedida) <= MARGEN_MM;

interface Pareja {
  otra: PatternPiece;
  borde: SemanticEdge;
  linea: InternalLine;
  esperada: number;
  seamId: string;
  invert: boolean;
}

const notch = definirVerbo({
  name: 'notch',
  description:
    'Put a notch on an edge at a distance from its start (mm along the edge, as read_pattern measures notches; from_end counts from its end), or move an existing one with notch_id. pair: also put the corresponding notch across the seam that sews this point, at the same sewn distance, following the seam direction; refused if no seam sews this point. Returns where each notch landed, measured.',
  args: z.object({
    piece_id: z.string().describe('a piece id from read_pattern'),
    edge: z.string().describe('an edge name from read_pattern'),
    distance: z.number().min(0).describe('mm along the edge from its start'),
    from_end: z.boolean().default(false),
    notch_id: z.string().optional().describe('move this notch instead of adding one'),
    pair: z.boolean().default(false),
    depth_mm: z.number().min(1).max(30).optional().describe('notch depth; default 8, or the moved notch\'s own'),
  }),
  run: (args, ctx) => {
    const piece = piezaDe(ctx, args.piece_id);
    const edge = piece.edges?.find(e => e.name === args.edge);
    if (!edge) throw new Error(`piece ${piece.id} has no edge named ${args.edge}`);
    const existente = args.notch_id ? piece.internals.find(l => l.id === args.notch_id && l.type === 'notch') : undefined;
    if (args.notch_id && !existente) throw new Error(`piece ${piece.id} has no notch with id ${args.notch_id}`);
    if (existente && args.pair) throw new Error('pair works when adding a notch; to move a pair, move each notch');
    if (estaBloqueada(ctx, piece)) return rehusar('piece is locked');

    const largo = computeRangeLengthMM(piece.outline, edge.segmentRange);
    if (args.distance > largo + 1e-6) {
      return rehusar(`distance ${unDecimal(args.distance)} mm is past the end of edge ${args.edge} (${unDecimal(largo)} mm)`);
    }
    const pedida = args.from_end ? largo - args.distance : args.distance;
    const sitio = puntoEnElBorde(piece, edge, pedida);
    if (!sitio) return rehusar(`cannot place a point on edge ${args.edge}`);
    const opciones = { ...(existente?.notchOptions ?? DEFAULT_NOTCH_OPTIONS), ...(args.depth_mm ? { length: args.depth_mm } : {}) };
    // El escritor de un piquete a partir de un punto y su normal (locales).
    const nueva = createMirrorNotchLine(piece.outline, sitio, { notchOptions: opciones });
    const linea: InternalLine = existente ? { ...nueva, id: existente.id } : nueva;
    // ponytail: sin esquinas (un círculo) el ancla es null y al mover queda la vieja; el path manda (D-2).
    if (!cerca(distanciaDelPiquete(piece, edge, linea), pedida)) {
      return rehusar(`the notch would not land at ${unDecimal(pedida)} mm on edge ${args.edge}`);
    }

    // La pareja va por la costura que cose ESTE punto (una copa partida tiene dos).
    let pareja: Pareja | null = null;
    if (args.pair) {
      const { seams, pieces } = ctx.getState().project;
      const m = mapNotchAcrossSeam({ sourcePiece: piece, point: sitio.point, seams, pieces, sourceEdge: edge });
      if (!m.ok) return rehusar(m.message);
      if (!m.onSewnStretch) return rehusar(`no seam sews edge ${args.edge} at ${unDecimal(pedida)} mm`);
      const otra = pieces.find(p => p.id === m.pairedPieceId)!;
      if (estaBloqueada(ctx, otra)) return rehusar(`the paired piece ${otra.id} is locked`);
      const borde = otra.edges!.find(e => e.name === m.pairedEdgeName)!;
      const lineaOtra = createMirrorNotchLine(otra.outline, m, linea);
      const esperada = m.pairedFrac * computeRangeLengthMM(otra.outline, borde.segmentRange);
      if (!cerca(distanciaDelPiquete(otra, borde, lineaOtra), esperada)) {
        return rehusar(`the pair would not land at ${unDecimal(esperada)} mm on edge ${borde.name} of piece ${otra.id}`);
      }
      pareja = { otra, borde, linea: lineaOtra, esperada, seamId: m.seamId, invert: m.invert };
    }

    const etiqueta = existente
      ? `mover un piquete de ${piece.name}`
      : `poner un piquete en ${piece.name}${pareja ? ` y su pareja en ${pareja.otra.name}` : ''}`;
    const e = actuar(ctx, 'notch', etiqueta, () => {
      if (existente) {
        ctx.dispatch(updateInternalLine({ pieceId: piece.id, lineId: linea.id, path: linea.path, notchAnchor: linea.notchAnchor, notchOptions: linea.notchOptions }));
      } else {
        ctx.dispatch(addInternalLine({ pieceId: piece.id, line: linea }));
      }
      if (pareja) {
        ctx.dispatch(addInternalLine({ pieceId: pareja.otra.id, line: pareja.linea }));
        ctx.dispatch(addNotchPair({
          id: newId(),
          a: { pieceId: piece.id, lineId: linea.id },
          b: { pieceId: pareja.otra.id, lineId: pareja.linea.id },
          seamId: pareja.seamId,
          invert: pareja.invert,
        }));
      }
    });

    // El recibo, medido sobre el estado de después (§ 5.3, regla 2).
    const medirEn = (pieceId: string, edgeName: string, lineId: string) => {
      const p = e.despues.pieces.find(x => x.id === pieceId);
      const b = p?.edges?.find(x => x.name === edgeName);
      const l = p?.internals.find(x => x.id === lineId);
      return p && b && l ? distanciaDelPiquete(p, b, l) : null;
    };
    const d = medirEn(piece.id, edge.name, linea.id);
    const dPareja = pareja ? medirEn(pareja.otra.id, pareja.borde.name, pareja.linea.id) : null;
    const warnings: string[] = [];
    const par = existente ? e.despues.notchPairs?.find(np => np.a.lineId === existente.id || np.b.lineId === existente.id) : undefined;
    if (existente && par) {
      warnings.push(`notch ${existente.id} has a pair on piece ${par.a.lineId === existente.id ? par.b.pieceId : par.a.pieceId}; it was not moved`);
    }
    return cerrar(ctx, 'notch', e, {
      done: cerca(d, pedida) && (!pareja || cerca(dPareja, pareja.esperada)),
      measure: {
        notch_id: linea.id,
        piece_id: piece.id,
        edge: edge.name,
        distance_from_edge_start: d != null ? unDecimal(d) : null,
        pair: pareja
          ? {
              notch_id: pareja.linea.id,
              piece_id: pareja.otra.id,
              edge: pareja.borde.name,
              distance_from_edge_start: dPareja != null ? unDecimal(dPareja) : null,
              seam_id: pareja.seamId,
            }
          : null,
      },
      warnings,
    });
  },
});

export const VERBOS_DE_PIQUETE: readonly Verbo[] = [notch];
