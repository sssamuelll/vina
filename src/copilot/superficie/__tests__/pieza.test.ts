import { describe, it, expect } from 'vitest';
import { getHistory } from '../../../store/undoMiddleware';
import { ejecutarVerbo } from '../ejecutar';
import type { Recibo } from '../tipos';
import { VERBOS_DE_PIEZA } from '../verbos/pieza';
import { pieza, tienda } from './fixtures';

const actuarCon = async (ctx: ReturnType<typeof tienda>['ctx'], nombre: string, args: unknown): Promise<Recibo> => {
  const r = await ejecutarVerbo(VERBOS_DE_PIEZA, nombre, args, ctx);
  if (!r.ok) throw new Error(r.error);
  return r.result as Recibo;
};

describe('create_piece', () => {
  it('un rectángulo por medidas: el recibo trae su ancho, su alto, su área y sus bordes, que suman el perímetro', async () => {
    const { store, ctx } = tienda();
    const r = await actuarCon(ctx, 'create_piece', { name: 'Bolsillo', rectangle: { width: 120, height: 80, x: 10, y: 20 } });
    expect(r).toMatchObject({ done: true, measure: { name: 'Bolsillo', width: 120, height: 80, area: 9600 } });
    const bordes = r.measure.edges as Array<{ length: number }>;
    expect(bordes.reduce((s, b) => s + b.length, 0)).toBeCloseTo(400, 1);
    const creada = store.getState().project.pieces[0];
    expect(creada.seamAllowance).toBe(0);
    expect(r.changed.created).toEqual([creada.id]);
  });

  it('un polígono por sus puntos, en espacio de patrón', async () => {
    const { ctx } = tienda();
    const r = await actuarCon(ctx, 'create_piece', { points: [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 0, y: 100 }] });
    expect(r).toMatchObject({ done: true, measure: { width: 100, height: 100, area: 5000 } });
  });

  it('sin sitio pedido nace a la derecha de lo que hay, sin pisarlo', async () => {
    const { store, ctx } = tienda([pieza('a', [100])]);
    await actuarCon(ctx, 'create_piece', { rectangle: { width: 50, height: 50 } });
    const nueva = store.getState().project.pieces[1];
    const xs = nueva.outline.filter(c => c.values.length >= 2).map(c => c.values[0] + nueva.position.x);
    expect(Math.min(...xs)).toBeGreaterThanOrEqual(150);
  });

  it('sin nombre se llama «Pieza N», y es un paso de deshacer con su nombre', async () => {
    const { ctx } = tienda([pieza('a', [100])]);
    const r = await actuarCon(ctx, 'create_piece', { rectangle: { width: 50, height: 50 } });
    expect(r.measure.name).toBe('Pieza 2');
    expect(getHistory().past.at(-1)).toMatchObject({ label: 'IA: crear Pieza 2', agent: { toolName: 'create_piece' } });
  });

  it('unos puntos que no encierran un área: error dicho, nada creado', async () => {
    const { store, ctx } = tienda();
    const r = await ejecutarVerbo(VERBOS_DE_PIEZA, 'create_piece', { points: [{ x: 0, y: 0 }, { x: 50, y: 0 }, { x: 100, y: 0 }] }, ctx);
    expect(r).toMatchObject({ ok: false, error: 'the points do not enclose an area' });
    expect(store.getState().project.pieces).toHaveLength(0);
  });

  it('rectángulo y puntos a la vez, o ninguno: error de argumentos', async () => {
    const { ctx } = tienda();
    for (const args of [{}, { rectangle: { width: 1, height: 1 }, points: [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 0, y: 1 }] }]) {
      const r = await ejecutarVerbo(VERBOS_DE_PIEZA, 'create_piece', args, ctx);
      expect(r.ok === false && r.error).toMatch(/give rectangle or points/);
    }
  });
});
