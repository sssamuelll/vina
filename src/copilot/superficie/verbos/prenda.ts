import { z } from 'zod';
import type { PatternPiece, PieceCategory, PieceSide } from '../../../types/types';
import type { RootState } from '../../../store';
import { definirVerbo, type Verbo } from '../tipos';
import { setPieceFabric, updatePiece } from '../../../store/projectSlice';
import { setDefaultFabric } from '../../../store/simulationSlice';
import { detectSemanticEdges } from '../../../utils/semanticEdges';
import { computeEffectiveRegions } from '../../../utils/cloth/garmentPlacement';
import { seSimula } from '../../../utils/cloth/piezasEnLaSimulacion';
import { PHYSICAL_FABRIC_LIBRARY, getPhysicalFabric } from '../../../utils/cloth/physicalFabric';
import { actuar, cerrar, piezaDe, rehusar } from '../actuar';
import { bordesDe } from './leer';

type Proyecto = RootState['project'];

const CATEGORIAS = ['bodice', 'sleeve', 'collar', 'skirt', 'trouser', 'waistband', 'facing', 'lining', 'pocket', 'cuff', 'hood', 'yoke', 'other'] as const satisfies readonly PieceCategory[];
const LADOS = ['front', 'back', 'left', 'right', 'center', 'both'] as const satisfies readonly PieceSide[];
// La biblioteca que lee el simulador; la otra (`FABRIC_LIBRARY`) tiene ids que él no conoce.
const TELAS = PHYSICAL_FABRIC_LIBRARY.map(f => f.id) as [string, ...string[]];

/**
 * Lo que depende de los bordes de la pieza: si algo lo hace, nombrarlos de
 * nuevo lo dejaría colgando. Unos los guardan por nombre (costuras, grupos,
 * pliegues, elásticos, puntos de medida, avíos sobre un borde); el margen
 * propio de un borde vive en el borde mismo (revisión final IA 1b-2: se perdía).
 */
function quienUsaSusBordes(piece: PatternPiece, p: Proyecto): string[] {
  const es = (x: { pieceId: string }) => x.pieceId === piece.id;
  const quien: string[] = [];
  if (p.seams.some(s => es(s.pieceA) || es(s.pieceB))) quien.push('seams');
  if (p.seamGroups.some(g => g.edgesA.some(es) || g.edgesB.some(es))) quien.push('seam groups');
  if (p.pleats.some(es)) quien.push('pleats');
  if (p.elastics.some(es)) quien.push('elastics');
  if (p.poms.some(m => es(m.pointA) || es(m.pointB))) quien.push('points of measure');
  if (p.trims.some(t => es(t) && (t.placement.mode === 'edge' || t.placement.mode === 'edge-points'))) quien.push('trims');
  if ((piece.edges ?? []).some(e => e.seamAllowanceWidth != null || (e.seamAllowanceSpans?.length ?? 0) > 0)) quien.push('seam allowances');
  return quien;
}

/** La región del cuerpo que le toca a la pieza al vestir, entre las que la app coloca (`piezasEnLaSimulacion.ts`). */
export function regionAlVestir(state: RootState, id: string): string | null {
  const { hiddenPieceIds, hiddenLayerIds } = state.simulation;
  const vestibles = state.project.pieces.filter(p => seSimula(p, hiddenPieceIds, hiddenLayerIds));
  const i = vestibles.findIndex(p => p.id === id);
  if (i < 0) return null;
  const r = computeEffectiveRegions(vestibles)[i];
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
    const usan = quienUsaSusBordes(piece, ctx.getState().project);
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
        region: regionAlVestir(ctx.getState(), piece.id),
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
      : ctx.getState().project.pieces.filter(p => p.active !== false);
    if (objetivo.length === 0) return rehusar('there are no active pieces');
    const tela = getPhysicalFabric(fabric)!;
    const a = objetivo.length === 1 ? objetivo[0].name : `${objetivo.length} piezas`;
    const e = actuar(ctx, 'assign_fabric', `poner ${tela.nameEs} a ${a}`, () => {
      for (const p of objetivo) ctx.dispatch(setPieceFabric({ pieceId: p.id, fabricId: fabric }));
    });
    // El simulador viste con una sola tela (`defaultFabricId`): la toma cuando todas
    // las piezas que viste comparten esta (el filtro de la app, `piezasEnLaSimulacion.ts`).
    const { hiddenPieceIds, hiddenLayerIds } = ctx.getState().simulation;
    const vestidas = e.despues.pieces.filter(p => seSimula(p, hiddenPieceIds, hiddenLayerIds));
    if (vestidas.length > 0 && vestidas.every(p => p.fabricId === fabric)) ctx.dispatch(setDefaultFabric(fabric));
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
        : [`the pieces the simulation dresses have different fabrics, and it drapes the whole garment with one fabric: ${simulacion}`],
    });
  },
});

export const VERBOS_DE_PRENDA: readonly Verbo[] = [classify, assignFabric];
