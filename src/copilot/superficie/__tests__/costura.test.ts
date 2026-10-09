import { describe, it, expect } from 'vitest';
import { getHistory } from '../../../store/undoMiddleware';
import { isStaleAiSeam } from '../../../utils/autoSew';
import { ejecutarVerbo } from '../ejecutar';
import type { Recibo } from '../tipos';
import { VERBOS_DE_COSTURA } from '../verbos/costura';
import { costura, pieza, tienda } from './fixtures';

const actuarCon = async (ctx: ReturnType<typeof tienda>['ctx'], nombre: string, args: unknown): Promise<Recibo> => {
  const r = await ejecutarVerbo(VERBOS_DE_COSTURA, nombre, args, ctx);
  if (!r.ok) throw new Error(r.error);
  return r.result as Recibo;
};

describe('sew', () => {
  it('cose dos bordes enteros: el recibo mide los dos lados, la diferencia y si camina', async () => {
    const { store, ctx } = tienda([pieza('a', [50, 80, 100]), pieza('b', [20, 50, 110])]);
    const r = await actuarCon(ctx, 'sew', { a: { piece_id: 'a', edge: 'top' }, b: { piece_id: 'b', edge: 'top' } });
    expect(r).toMatchObject({ done: true, measure: { seam: { a: { length: 100 }, b: { length: 110 }, delta: 10, walks: false } } });
    expect(r.warnings).toEqual(['the seam does not walk: 100 mm against 110 mm, 10 mm apart (tolerance 3 mm)']);
    const [s] = store.getState().project.seams;
    expect(s).toMatchObject({ createdBy: 'ai', pieceA: { pieceId: 'a', edgeName: 'top' }, pieceB: { pieceId: 'b', edgeName: 'top' } });
    expect(s.pieceA).not.toHaveProperty('tStart');
    expect(isStaleAiSeam(s)).toBe(false);
    expect(getHistory().past.at(-1)).toMatchObject({ label: 'IA: coser a con b', agent: { toolName: 'sew' } });
  });

  it('cose tramos: fracciones o puntos del borde, en el sentido de cada borde', async () => {
    const { store, ctx } = tienda([pieza('a', [100]), pieza('b', [100])]);
    const r = await actuarCon(ctx, 'sew', {
      a: { piece_id: 'a', edge: 'top', from: 0, to: 0.5 },
      b: { piece_id: 'b', edge: 'top', from: { x: 50, y: 0 }, to: { x: 100, y: 0 } },
    });
    expect(r).toMatchObject({ done: true, measure: { seam: { a: { length: 50 }, b: { length: 50, t_start: 0.5, t_end: 1 }, walks: true } } });
    expect(store.getState().project.seams[0].pieceB).toMatchObject({ tStart: 0.5, tEnd: 1 });
  });

  it('reversed: B va de su final a su inicio, y su rango se guarda en el sentido de cosido', async () => {
    const { store, ctx } = tienda([pieza('a', [100]), pieza('b', [100])]);
    const r = await actuarCon(ctx, 'sew', {
      a: { piece_id: 'a', edge: 'top', from: 0, to: 0.4 },
      b: { piece_id: 'b', edge: 'top', from: 0, to: 0.4 },
      reversed: true,
    });
    expect(r.measure.seam).toMatchObject({ b: { t_start: 0, t_end: 0.4, reversed: true, length: 40 } });
    expect(store.getState().project.seams[0].pieceB).toMatchObject({ tStart: 0.6, tEnd: 1, reversed: true });
  });

  it('avisa si el tramo ya estaba cosido por otra costura', async () => {
    const { ctx } = tienda([pieza('a', [100]), pieza('b', [100]), pieza('c', [100])], [costura()]);
    const r = await actuarCon(ctx, 'sew', { a: { piece_id: 'a', edge: 'top', from: 0.5, to: 1 }, b: { piece_id: 'c', edge: 'top' } });
    expect(r.done).toBe(true);
    expect(r.warnings).toContain('edge top of piece a is already sewn there by seam s1');
  });

  it('un tramo dado al revés de su borde es un error dicho: el sentido se pide con reversed', async () => {
    const { store, ctx } = tienda([pieza('a', [100]), pieza('b', [100])]);
    for (const b of [
      { piece_id: 'b', edge: 'top', from: { x: 100, y: 0 }, to: { x: 0, y: 0 } },
      { piece_id: 'b', edge: 'top', from: 1, to: 0 },
    ]) {
      const r = await ejecutarVerbo(VERBOS_DE_COSTURA, 'sew', { a: { piece_id: 'a', edge: 'top' }, b }, ctx);
      expect(r.ok === false && r.error).toMatch(/^stretch b runs against its edge/);
    }
    const r = await ejecutarVerbo(VERBOS_DE_COSTURA, 'sew', { a: { piece_id: 'a', edge: 'top', from: 0.6, to: 0.1 }, b: { piece_id: 'b', edge: 'top' } }, ctx);
    expect(r.ok === false && r.error).toMatch(/^stretch a runs against its edge/);
    expect(store.getState().project.seams).toHaveLength(0);
  });

  it('un tramo sin largo es un error dicho, y no cose nada', async () => {
    const { store, ctx } = tienda([pieza('a', [100]), pieza('b', [100])]);
    const r = await ejecutarVerbo(VERBOS_DE_COSTURA, 'sew', { a: { piece_id: 'a', edge: 'top', from: 0.3, to: 0.3 }, b: { piece_id: 'b', edge: 'top' } }, ctx);
    expect(r).toMatchObject({ ok: false, error: 'stretch a has no length' });
    expect(store.getState().project.seams).toHaveLength(0);
  });
});

describe('unsew', () => {
  it('descose, dice entre qué tramos estaba y no pide confirmación aunque María la haya pedido para sus borrados', async () => {
    const { store, ctx } = tienda([pieza('a', [100]), pieza('b', [110])], [costura()], {}, { confirmOverrides: { removeSeam: 'always' } });
    const r = await actuarCon(ctx, 'unsew', { seam_id: 's1' });
    expect(r).toMatchObject({ done: true, changed: { deleted: ['s1'] }, measure: { removed: { id: 's1', a: { length: 100 }, b: { length: 110 } } } });
    expect(store.getState().project.seams).toHaveLength(0);
    expect(store.getState().copilotUI.pendingConfirmation).toBeFalsy();
  });
  it('una costura que no existe es un error dicho', async () => {
    const { ctx } = tienda();
    expect(await ejecutarVerbo(VERBOS_DE_COSTURA, 'unsew', { seam_id: 'nada' }, ctx)).toMatchObject({ ok: false, error: 'no seam with id nada' });
  });
});
