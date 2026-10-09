import { z } from 'zod';
import type { PatternPiece, PieceCategory, PieceSide } from '../../../types/types';
import type { RootState } from '../../../store';
import { definirVerbo, type Verbo } from '../tipos';
import { setPieceFabric, updatePiece } from '../../../store/projectSlice';
import { setDefaultFabric } from '../../../store/simulationSlice';
import { detectSemanticEdges } from '../../../utils/semanticEdges';
import { computeEffectiveRegions } from '../../../utils/cloth/garmentPlacement';
import { PHYSICAL_FABRIC_LIBRARY, getPhysicalFabric } from '../../../utils/cloth/physicalFabric';
import { actuar, cerrar, piezaDe, rehusar } from '../actuar';
import { bordesDe } from './leer';

type Proyecto = RootState['project'];

const CATEGORIAS = ['bodice', 'sleeve', 'collar', 'skirt', 'trouser', 'waistband', 'facing', 'lining', 'pocket', 'cuff', 'hood', 'yoke', 'other'] as const satisfies readonly PieceCategory[];
const LADOS = ['front', 'back', 'left', 'right', 'center', 'both'] as const satisfies readonly PieceSide[];
// La biblioteca que lee el simulador; la otra (`FABRIC_LIBRARY`) tiene ids que él no conoce.
const TELAS = PHYSICAL_FABRIC_LIBRARY.map(f => f.id) as [string, ...string[]];

/** Lo que guarda por nombre un borde de la pieza: si algo lo hace, nombrarlos de nuevo lo dejaría colgando. */
function quienNombraSusBordes(id: string, p: Proyecto): string[] {
  const es = (x: { pieceId: string }) => x.pieceId === id;
  const quien: string[] = [];
  if (p.seams.some(s => es(s.pieceA) || es(s.pieceB))) quien.push('seams');
  if (p.seamGroups.some(g => g.edgesA.some(es) || g.edgesB.some(es))) quien.push('seam groups');
  if (p.pleats.some(es)) quien.push('pleats');
  if (p.elastics.some(es)) quien.push('elastics');
  if (p.poms.some(m => es(m.pointA) || es(m.pointB))) quien.push('points of measure');
  return quien;
}

/** La región del cuerpo que le toca a la pieza al vestir, entre las activas: la misma que usa la colocación. */
export function regionAlVestir(pieces: readonly PatternPiece[], id: string): string | null {
  const activas = pieces.filter(p => p.active);
  const i = activas.findIndex(p => p.id === id);
  if (i < 0) return null;
  const r = computeEffectiveRegions(activas)[i];
  return r === 'unknown' ? null : r;
}

const classify = definirVerbo({
  name: 'classify',
  description:
    'Say what a piece is: its category and its side. Dressing reads them to place the piece on the body. If no seam, seam group, pleat, elastic or point of measure uses the piece yet, its edges are detected again and named for the category (armhole, sleeveCap, neckline...); otherwise they keep their names. Omit side for a piece with no side. Returns the category, the side, where the piece goes when dressed, and its edges, measured.',
  args: z.object({
    piece_id: z.string().describe('a piece id from read_pattern'),
    category: z.enum(CATEGORIAS),
    side: z.enum(LADOS).optional(),
  }),
  run: ({ piece_id, category, side }, ctx) => {
    const piece = piezaDe(ctx, piece_id);
    const usan = quienNombraSusBordes(piece.id, ctx.getState().project);
    const nueva: PatternPiece = { ...piece, category, side };
    if (usan.length === 0) {
      const edges = detectSemanticEdges(nueva);
      // Un contorno que el detector no entiende da cero bordes: mejor los de antes que ninguno.
      if (edges.length > 0) nueva.edges = edges;
    }
    const renombrados = nueva.edges !== piece.edges;
    const e = actuar(ctx, 'classify', `clasificar ${piece.name}`, () => { ctx.dispatch(updatePiece(nueva)); });
    const despues = e.despues.pieces.find(p => p.id === piece.id)!;
    return cerrar(ctx, 'classify', e, {
      done: despues.category === category && despues.side === side,
      measure: {
        piece_id,
        category: despues.category ?? null,
        side: despues.side ?? null,
        region: regionAlVestir(e.despues.pieces, piece.id),
        edges: bordesDe(despues),
        edges_renamed: renombrados,
      },
      warnings: usan.length > 0 ? [`the edges keep their names because ${usan.join(', ')} use them`] : [],
    });
  },
});

const assignFabric = definirVerbo({
  name: 'assign_fabric',
  description:
    "Give pieces a fabric from Vina's library; by default every active piece. The simulation drapes the whole garment with one fabric: when all the active pieces share one, the simulation uses it; when they differ, it keeps its own and the receipt says which. Returns the fabric of each piece and the fabric the simulation uses.",
  args: z.object({
    fabric: z.enum(TELAS),
    piece_ids: z.array(z.string()).min(1).optional().describe('piece ids from read_pattern; default every active piece'),
  }),
  run: ({ fabric, piece_ids }, ctx) => {
    const objetivo = piece_ids
      ? piece_ids.map(id => piezaDe(ctx, id))
      : ctx.getState().project.pieces.filter(p => p.active);
    if (objetivo.length === 0) return rehusar('there are no active pieces');
    const tela = getPhysicalFabric(fabric)!;
    const a = objetivo.length === 1 ? objetivo[0].name : `${objetivo.length} piezas`;
    const e = actuar(ctx, 'assign_fabric', `poner ${tela.nameEs} a ${a}`, () => {
      for (const p of objetivo) ctx.dispatch(setPieceFabric({ pieceId: p.id, fabricId: fabric }));
    });
    // El simulador viste con una sola tela (`defaultFabricId`): la toma cuando todas las piezas activas comparten esta.
    const activas = e.despues.pieces.filter(p => p.active);
    if (activas.length > 0 && activas.every(p => p.fabricId === fabric)) ctx.dispatch(setDefaultFabric(fabric));
    const simulacion = ctx.getState().simulation.defaultFabricId;
    const telaDe = (id: string) => e.despues.pieces.find(p => p.id === id)?.fabricId ?? null;
    return cerrar(ctx, 'assign_fabric', e, {
      done: objetivo.every(p => telaDe(p.id) === fabric),
      measure: {
        fabric: { id: tela.id, name: tela.name },
        pieces: objetivo.map(p => ({ piece_id: p.id, name: p.name, fabric_id: telaDe(p.id) })),
        simulation_fabric: simulacion,
      },
      warnings: simulacion === fabric
        ? []
        : [`the active pieces have different fabrics, and the simulation drapes the whole garment with one fabric: ${simulacion}`],
    });
  },
});

export const VERBOS_DE_PRENDA: readonly Verbo[] = [classify, assignFabric];
