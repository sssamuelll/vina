import { describe, it, expect } from 'vitest';
import { undo } from '../../../store/editorSlice';
import { detectSemanticEdges } from '../../../utils/semanticEdges';
import { ejecutarVerbo } from '../ejecutar';
import { VERBOS_DE_PRENDA } from '../verbos/prenda';
import type { ContextoDeVerbo, Recibo } from '../tipos';
import { costura, suelta, tienda } from './fixtures';

const actuarCon = async (ctx: ContextoDeVerbo, nombre: string, args: unknown): Promise<Recibo> => {
  const r = await ejecutarVerbo(VERBOS_DE_PRENDA, nombre, args, ctx);
  if (!r.ok) throw new Error(r.error);
  return r.result as Recibo;
};

describe('classify', () => {
  it('le pone categoría y lado, nombra sus bordes por la categoría y dice dónde va al vestir', async () => {
    const p = suelta('p1', 'Pieza 1');
    const { store, ctx } = tienda([p]);
    const r = await actuarCon(ctx, 'classify', { piece_id: 'p1', category: 'bodice', side: 'back' });
    expect(r.done).toBe(true);
    const despues = store.getState().project.pieces[0];
    expect(despues).toMatchObject({ category: 'bodice', side: 'back' });
    const esperados = detectSemanticEdges({ ...p, category: 'bodice', side: 'back' }).map(e => e.name);
    // Que el test muerda: los nombres por la categoría no son los que tenía.
    expect(esperados).not.toEqual(p.edges!.map(e => e.name));
    expect(despues.edges!.map(e => e.name)).toEqual(esperados);
    expect(r.measure).toMatchObject({ category: 'bodice', side: 'back', region: 'back-torso', edges_renamed: true });
    expect((r.measure.edges as { name: string }[]).map(e => e.name)).toEqual(esperados);
  });

  it('sin lado, el lado viejo se va', async () => {
    const { store, ctx } = tienda([suelta('p1', 'Pieza 1', { category: 'bodice', side: 'front' })]);
    const r = await actuarCon(ctx, 'classify', { piece_id: 'p1', category: 'sleeve' });
    expect(store.getState().project.pieces[0].side).toBeUndefined();
    expect(r.measure).toMatchObject({ side: null, region: 'left-sleeve' });
  });

  it('una pieza cosida conserva los nombres de sus bordes, y lo dice', async () => {
    const a = suelta('a', 'Pieza A');
    const b = suelta('b', 'Pieza B');
    const seam = costura({ pieceA: { pieceId: 'a', edgeName: a.edges![0].name }, pieceB: { pieceId: 'b', edgeName: b.edges![0].name } });
    const { store, ctx } = tienda([a, b], [seam]);
    const r = await actuarCon(ctx, 'classify', { piece_id: 'a', category: 'bodice', side: 'front' });
    expect(r.done).toBe(true);
    expect(store.getState().project.pieces[0].edges).toEqual(a.edges);
    expect(r.measure.edges_renamed).toBe(false);
    expect(r.warnings.join(' ')).toMatch(/keep their names/);
  });

  it('un margen propio en un borde guarda los nombres de los bordes (revisión final)', async () => {
    const p = suelta('p1', 'Pieza 1');
    const conMargen = { ...p, edges: p.edges!.map((e, i) => (i === 0 ? { ...e, seamAllowanceWidth: 40 } : e)) };
    const { store, ctx } = tienda([conMargen]);
    const r = await actuarCon(ctx, 'classify', { piece_id: 'p1', category: 'bodice', side: 'back' });
    expect(store.getState().project.pieces[0].edges).toEqual(conMargen.edges);
    expect(r.warnings.join(' ')).toMatch(/seam allowances/);
  });

  it('un avío puesto sobre un borde también (revisión final)', async () => {
    const p = suelta('p1', 'Pieza 1');
    const avio = {
      id: 't1', pieceId: 'p1', type: 'button', name: 'Botón', description: '', material: '', color: '', size: 10, unitCost: 0, active: true,
      placement: { mode: 'edge', edgeName: p.edges![0].name, tStart: 0, tEnd: 1 },
    };
    const { store, ctx } = tienda([p], [], { trims: [avio] });
    const r = await actuarCon(ctx, 'classify', { piece_id: 'p1', category: 'bodice', side: 'back' });
    expect(store.getState().project.pieces[0].edges).toEqual(p.edges);
    expect(r.warnings.join(' ')).toMatch(/trims/);
  });

  it('un Ctrl+Z la deja como estaba', async () => {
    const p = suelta('p1', 'Pieza 1');
    const { store, ctx } = tienda([p]);
    await actuarCon(ctx, 'classify', { piece_id: 'p1', category: 'bodice', side: 'back' });
    store.dispatch(undo());
    const vuelta = store.getState().project.pieces[0];
    expect(vuelta.category).toBeUndefined();
    expect(vuelta.edges).toEqual(p.edges);
  });

  it('una categoría que no existe no pasa', async () => {
    const { ctx } = tienda([suelta('p1')]);
    const r = await ejecutarVerbo(VERBOS_DE_PRENDA, 'classify', { piece_id: 'p1', category: 'shoe' }, ctx);
    expect(r).toMatchObject({ ok: false });
  });
});

describe('assign_fabric', () => {
  it('a toda la prenda: cada pieza activa y la simulación', async () => {
    const { store, ctx } = tienda([suelta('a'), suelta('b'), suelta('c', 'c', { active: false })]);
    const r = await actuarCon(ctx, 'assign_fabric', { fabric: 'denim-12oz' });
    expect(r.done).toBe(true);
    expect(store.getState().project.pieces.map(p => p.fabricId)).toEqual(['denim-12oz', 'denim-12oz', undefined]);
    expect(store.getState().simulation.defaultFabricId).toBe('denim-12oz');
    expect(r.measure).toMatchObject({ fabric: { id: 'denim-12oz' }, simulation_fabric: 'denim-12oz' });
    expect(r.warnings).toEqual([]);
  });

  it('una sola pieza con otra tela: la simulación sigue con la suya, y lo dice', async () => {
    const { store, ctx } = tienda([suelta('a'), suelta('b')]);
    const r = await actuarCon(ctx, 'assign_fabric', { fabric: 'denim-12oz', piece_ids: ['a'] });
    expect(r.done).toBe(true);
    expect(store.getState().project.pieces.map(p => p.fabricId)).toEqual(['denim-12oz', undefined]);
    expect(store.getState().simulation.defaultFabricId).toBe('cotton-poplin');
    expect(r.measure.simulation_fabric).toBe('cotton-poplin');
    expect(r.warnings.join(' ')).toMatch(/one fabric.*cotton-poplin/);
  });

  it('Ctrl+Z devuelve las telas de las piezas', async () => {
    const { store, ctx } = tienda([suelta('a'), suelta('b')]);
    await actuarCon(ctx, 'assign_fabric', { fabric: 'denim-12oz' });
    store.dispatch(undo());
    expect(store.getState().project.pieces.map(p => p.fabricId)).toEqual([undefined, undefined]);
  });

  it('una tela que no está en la biblioteca no pasa', async () => {
    // `jersey-knit` está en FABRIC_LIBRARY, la otra biblioteca, y no en la que lee el simulador.
    const { ctx } = tienda([suelta('a')]);
    const r = await ejecutarVerbo(VERBOS_DE_PRENDA, 'assign_fabric', { fabric: 'jersey-knit' }, ctx);
    expect(r).toMatchObject({ ok: false });
  });
});
