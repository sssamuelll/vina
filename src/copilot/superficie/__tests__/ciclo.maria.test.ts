import { describe, it, expect } from 'vitest';
import { undo } from '../../../store/editorSlice';
import { esMitadDeCopa } from '../../../utils/autoSew/repartoDeCopa';
import { computeRangeLengthMM } from '../../../utils/geometry/edgeInterpolation';
import { ejecutarVerbo } from '../ejecutar';
import { SUPERFICIE } from '../index';
import type { Recibo } from '../tipos';
import { camisaDeMaria, tienda } from './fixtures';

const actuarCon = async (ctx: ReturnType<typeof tienda>['ctx'], nombre: string, args: unknown): Promise<Recibo> => {
  const r = await ejecutarVerbo(SUPERFICIE, nombre, args, ctx);
  if (!r.ok) throw new Error(r.error);
  return r.result as Recibo;
};

describe('el ciclo de María por la superficie', () => {
  it('un piquete con pareja en la copa cae en la sisa que cose esa mitad, a su distancia, y no en un extremo', async () => {
    const { piezas, seams } = camisaDeMaria();
    const { ctx } = tienda(piezas, seams);
    const manga = piezas.find(p => p.category === 'sleeve')!;
    const copa = manga.edges!.find(e => e.name === 'sleeveCap')!;
    const largoCopa = computeRangeLengthMM(manga.outline, copa.segmentRange);
    const r = await actuarCon(ctx, 'notch', { piece_id: manga.id, edge: 'sleeveCap', distance: largoCopa * 0.2, pair: true });
    expect(r.done).toBe(true);
    const par = r.measure.pair as { piece_id: string; edge: string; distance_from_edge_start: number; seam_id: string };
    const costura = seams.find(s => s.id === par.seam_id)!;
    expect(esMitadDeCopa(costura)).toBe(true);
    const sisa = piezas.find(p => p.id === par.piece_id)!;
    const largoSisa = computeRangeLengthMM(sisa.outline, sisa.edges!.find(e => e.name === par.edge)!.segmentRange);
    // El fallo del 06-10: la pareja caía en 0 o en 230,6 mm, un extremo de la sisa.
    expect(par.distance_from_edge_start).toBeGreaterThan(5);
    expect(par.distance_from_edge_start).toBeLessThan(largoSisa - 5);
  });

  it('descoser un costado y volver a coserlo: camina, y dos Ctrl+Z dejan las costuras como estaban', async () => {
    const { piezas, seams } = camisaDeMaria();
    const { store, ctx } = tienda(piezas, seams);
    const costado = seams.find(s => s.pieceA.edgeName === 'sideSeam' && s.pieceB.edgeName === 'sideSeam')!;
    await actuarCon(ctx, 'unsew', { seam_id: costado.id });
    const r = await actuarCon(ctx, 'sew', {
      a: { piece_id: costado.pieceA.pieceId, edge: 'sideSeam', from: costado.pieceA.tStart ?? 0, to: costado.pieceA.tEnd ?? 1 },
      b: { piece_id: costado.pieceB.pieceId, edge: 'sideSeam', from: costado.pieceB.tStart ?? 0, to: costado.pieceB.tEnd ?? 1 },
      reversed: costado.pieceB.reversed === true,
    });
    expect(r).toMatchObject({ done: true, measure: { seam: { walks: true } } });
    store.dispatch(undo());
    store.dispatch(undo());
    expect(store.getState().project.seams.map(s => s.id)).toEqual(seams.map(s => s.id));
  });

  it('la superficie tiene los doce verbos', () => {
    expect(SUPERFICIE.map(v => v.name)).toEqual([
      'read_pattern', 'read_piece', 'measure', 'walk_seam', 'verify',
      'create_piece', 'edit_outline', 'sew', 'unsew', 'notch', 'remove', 'undo',
    ]);
  });
});
