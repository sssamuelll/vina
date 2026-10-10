import { describe, it, expect } from 'vitest';
import { setViewMode } from '../../../store/editorSlice';
import { startSimulation } from '../../../store/simulationSlice';
import { ejecutarVerbo } from '../ejecutar';
import { VERBOS_DE_VESTIR } from '../verbos/vestir';
import type { ContextoDeVerbo, Recibo } from '../tipos';
import { suelta, tienda } from './fixtures';

const actuarCon = async (ctx: ContextoDeVerbo, nombre: string, args: unknown): Promise<Recibo> => {
  const r = await ejecutarVerbo(VERBOS_DE_VESTIR, nombre, args, ctx);
  if (!r.ok) throw new Error(r.error);
  return r.result as Recibo;
};

describe('dress', () => {
  it('dice dónde va cada pieza y qué lo decidió, sin tocar el patrón, y deja el 3D en vestir', async () => {
    const { store, ctx } = tienda([
      suelta('d', 'Pieza A', { category: 'bodice', side: 'front' }),
      suelta('m', 'Manga'),
    ]);
    const antes = store.getState().project;
    const r = await actuarCon(ctx, 'dress', {});
    expect(r.done).toBe(true);
    expect(r.measure.pieces).toEqual([
      { piece_id: 'd', name: 'Pieza A', region: 'front-torso', decided_by: 'category' },
      { piece_id: 'm', name: 'Manga', region: 'left-sleeve', decided_by: 'name' },
    ]);
    expect(store.getState().project).toBe(antes);
    expect(r.changed).toEqual({ created: [], modified: [], deleted: [] });
    expect(r.revision.after).toBe(r.revision.before);
    expect(store.getState().simulation.viewMode3D).toBe('arrange');
  });

  it('una pieza que Vina no sabe dónde poner: la nombra y no da done', async () => {
    const { ctx } = tienda([suelta('d', 'Pieza A', { category: 'bodice' }), suelta('x', 'Pieza 7')]);
    const r = await actuarCon(ctx, 'dress', {});
    expect(r.done).toBe(false);
    expect(r.measure.pieces).toContainEqual({ piece_id: 'x', name: 'Pieza 7', region: null, decided_by: 'none' });
    expect(r.warnings.join(' ')).toMatch(/Pieza 7.*front torso.*classify/i);
  });

  it('ninguna clasificada: dice que las alterna entre delante y detrás', async () => {
    const { ctx } = tienda([suelta('x', 'Pieza 1'), suelta('y', 'Pieza 2')]);
    const r = await actuarCon(ctx, 'dress', {});
    expect(r.done).toBe(false);
    expect((r.measure.pieces as { region: string }[]).map(p => p.region)).toEqual(['front-torso', 'back-torso']);
    expect(r.warnings.join(' ')).toMatch(/no piece is classified/);
  });

  it('desde 2D pasa a Split', async () => {
    const { store, ctx } = tienda([suelta('d', 'Delantero', { category: 'bodice' })]);
    store.dispatch(setViewMode('2d'));
    const r = await actuarCon(ctx, 'dress', {});
    expect(store.getState().editor.viewMode).toBe('split');
    expect(r.measure).toMatchObject({ view: 'split', view_changed: true });
  });

  it('con la simulación corriendo, la para para vestir', async () => {
    const { store, ctx } = tienda([suelta('d', 'Delantero', { category: 'bodice' })]);
    store.dispatch(startSimulation());
    await actuarCon(ctx, 'dress', {});
    expect(store.getState().simulation.simulationState).toBe('idle');
  });

  it('las piezas apagadas no se visten, y lo movido a mano lo dice', async () => {
    const { ctx } = tienda(
      [suelta('d', 'Delantero', { category: 'bodice' }), suelta('z', 'Bolsillo', { category: 'pocket', active: false })],
      [],
      { arrangementOverrides: { d: [0, 1.2, 0.2] } },
    );
    const r = await actuarCon(ctx, 'dress', {});
    expect(r.measure.pieces).toEqual([
      { piece_id: 'd', name: 'Delantero', region: 'front-torso', decided_by: 'category', moved_by_hand: true },
    ]);
    expect(r.measure.left_out).toEqual([{ piece_id: 'z', name: 'Bolsillo', reason: 'inactive' }]);
  });

  it('lo que la app no coloca tampoco se viste: oculta en 3D o en una capa oculta, y dice por qué (revisión final)', async () => {
    const { ctx } = tienda(
      [
        suelta('d', 'Delantero', { category: 'bodice' }),
        suelta('m1', 'Manga A', { category: 'sleeve' }),
        suelta('m2', 'Manga B', { category: 'sleeve' }),
        suelta('f', 'Forro', { category: 'lining', layer: 0 }),
      ],
      [], {}, {},
      { hiddenPieceIds: ['m1'], hiddenLayerIds: [0] },
    );
    const r = await actuarCon(ctx, 'dress', {});
    // La app coloca solo la manga visible, y como la primera manga sin lado: la izquierda.
    expect(r.measure.pieces).toEqual([
      { piece_id: 'd', name: 'Delantero', region: 'front-torso', decided_by: 'category' },
      { piece_id: 'm2', name: 'Manga B', region: 'left-sleeve', decided_by: 'category' },
    ]);
    expect(r.measure.left_out).toEqual([
      { piece_id: 'm1', name: 'Manga A', reason: 'hidden in 3D' },
      { piece_id: 'f', name: 'Forro', reason: 'layer 0 is hidden' },
    ]);
  });

  it('sin piezas que vestir no viste nada, y dice por qué', async () => {
    const { ctx } = tienda([suelta('z', 'z', { active: false })]);
    const r = await actuarCon(ctx, 'dress', {});
    expect(r).toMatchObject({ done: false, warnings: ['there are no pieces to dress: z (inactive)'] });
  });
});
