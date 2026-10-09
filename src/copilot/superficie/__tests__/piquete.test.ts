import { describe, it, expect } from 'vitest';
import { getHistory } from '../../../store/undoMiddleware';
import { ejecutarVerbo } from '../ejecutar';
import type { Recibo } from '../tipos';
import { VERBOS_DE_PIQUETE } from '../verbos/piquete';
import { costura, pieza, piquete, tienda } from './fixtures';

const actuarCon = async (ctx: ReturnType<typeof tienda>['ctx'], args: unknown): Promise<Recibo> => {
  const r = await ejecutarVerbo(VERBOS_DE_PIQUETE, 'notch', args, ctx);
  if (!r.ok) throw new Error(r.error);
  return r.result as Recibo;
};

describe('notch', () => {
  it('pone un piquete a una distancia del inicio del borde; el recibo la mide', async () => {
    const { store, ctx } = tienda([pieza('a', [100])]);
    const r = await actuarCon(ctx, { piece_id: 'a', edge: 'top', distance: 30 });
    expect(r).toMatchObject({ done: true, measure: { piece_id: 'a', edge: 'top', distance_from_edge_start: 30, pair: null } });
    const [n] = store.getState().project.pieces[0].internals;
    expect(n).toMatchObject({ type: 'notch', notchAnchor: { metric: 2 } });
    expect(r.changed.created).toEqual([n.id]);
    expect(getHistory().past.at(-1)).toMatchObject({ label: 'IA: poner un piquete en a', agent: { toolName: 'notch' } });
  });

  it('from_end cuenta desde el final del borde', async () => {
    const { ctx } = tienda([pieza('a', [100])]);
    expect((await actuarCon(ctx, { piece_id: 'a', edge: 'top', distance: 30, from_end: true })).measure.distance_from_edge_start).toBe(70);
  });

  it('más allá del borde no se pone: lo dice con los dos números', async () => {
    const { store, ctx } = tienda([pieza('a', [100])]);
    const r = await actuarCon(ctx, { piece_id: 'a', edge: 'top', distance: 150 });
    expect(r).toMatchObject({ done: false, warnings: ['distance 150 mm is past the end of edge top (100 mm)'] });
    expect(store.getState().project.pieces[0].internals).toHaveLength(0);
  });

  it('una pieza de capa bloqueada no se toca', async () => {
    const { ctx } = tienda([pieza('a', [100], { layer: 2 })], [], { layerLocked: { 2: true } });
    expect(await actuarCon(ctx, { piece_id: 'a', edge: 'top', distance: 30 })).toMatchObject({ done: false, warnings: ['piece is locked'] });
  });

  it('con pareja: la pone al otro lado de la costura, a la misma distancia cosida, y declara el par', async () => {
    const { store, ctx } = tienda([pieza('a', [100]), pieza('b', [100])], [costura()]);
    const r = await actuarCon(ctx, { piece_id: 'a', edge: 'top', distance: 30, pair: true });
    expect(r).toMatchObject({ done: true, measure: { pair: { piece_id: 'b', edge: 'top', distance_from_edge_start: 30, seam_id: 's1' } } });
    const { pieces, notchPairs } = store.getState().project;
    expect(pieces[1].internals).toHaveLength(1);
    expect(notchPairs).toMatchObject([{ seamId: 's1', invert: false }]);
    expect(getHistory().past.at(-1)?.label).toBe('IA: poner un piquete en a y su pareja en b');
  });

  it('con pareja en una costura invertida, la pareja cae del otro lado', async () => {
    const { ctx } = tienda([pieza('a', [100]), pieza('b', [100])], [costura({ pieceB: { pieceId: 'b', edgeName: 'top', reversed: true } })]);
    expect((await actuarCon(ctx, { piece_id: 'a', edge: 'top', distance: 30, pair: true })).measure.pair).toMatchObject({ distance_from_edge_start: 70 });
  });

  it('con pareja donde ninguna costura cose ese punto: no pone nada', async () => {
    const seam = costura({ pieceA: { pieceId: 'a', edgeName: 'top', tStart: 0, tEnd: 0.5 }, pieceB: { pieceId: 'b', edgeName: 'top', tStart: 0, tEnd: 0.5 } });
    const { store, ctx } = tienda([pieza('a', [100]), pieza('b', [100])], [seam]);
    const r = await actuarCon(ctx, { piece_id: 'a', edge: 'top', distance: 80, pair: true });
    expect(r).toMatchObject({ done: false, warnings: ['no seam sews edge top at 80 mm'] });
    expect(store.getState().project.pieces.every(p => p.internals.length === 0)).toBe(true);
  });

  it('mueve un piquete puesto: el mismo id, a la distancia nueva, con sus opciones', async () => {
    const opciones = { shape: 'slit' as const, subType: 'straightforward' as const, length: 12, width: 3, angle: 0, count: 2 };
    const { store, ctx } = tienda([pieza('a', [100], { internals: [{ ...piquete('n1', 30), notchOptions: opciones }] })]);
    const r = await actuarCon(ctx, { piece_id: 'a', edge: 'top', distance: 60, notch_id: 'n1' });
    expect(r).toMatchObject({ done: true, changed: { modified: expect.arrayContaining(['n1']) }, measure: { notch_id: 'n1', distance_from_edge_start: 60 } });
    expect(store.getState().project.pieces[0].internals[0]).toMatchObject({ id: 'n1', notchOptions: { length: 12, count: 2 } });
    expect(getHistory().past.at(-1)?.label).toBe('IA: mover un piquete de a');
  });
});
