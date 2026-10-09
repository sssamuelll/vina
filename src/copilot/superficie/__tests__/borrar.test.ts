import { describe, it, expect } from 'vitest';
import { getHistory } from '../../../store/undoMiddleware';
import { updatePiece } from '../../../store/projectSlice';
import { ejecutarVerbo } from '../ejecutar';
import type { Recibo } from '../tipos';
import { VERBOS_DE_BORRAR } from '../verbos/borrar';
import { costura, pieza, piquete, tienda } from './fixtures';

const actuarCon = async (ctx: ReturnType<typeof tienda>['ctx'], nombre: string, args: unknown): Promise<Recibo> => {
  const r = await ejecutarVerbo(VERBOS_DE_BORRAR, nombre, args, ctx);
  if (!r.ok) throw new Error(r.error);
  return r.result as Recibo;
};
const ultimoAviso = (store: ReturnType<typeof tienda>['store']) => store.getState().copilotUI.toasts.at(-1);

describe('remove', () => {
  it('borra una pieza y sus costuras, sin pedir confirmación, y avisa con «Deshacer» que la devuelve', async () => {
    const { store, ctx } = tienda([pieza('a', [100]), pieza('b', [100])], [costura()], {}, { confirmOverrides: { removePiece: 'always' } });
    const r = await actuarCon(ctx, 'remove', { piece_id: 'a' });
    expect(r).toMatchObject({ done: true, measure: { removed: { kind: 'piece', id: 'a', name: 'a' }, seams_removed: ['s1'] } });
    expect(store.getState().project.pieces.map(p => p.id)).toEqual(['b']);
    expect(store.getState().copilotUI.pendingConfirmation).toBeFalsy();
    const aviso = ultimoAviso(store);
    expect(aviso).toMatchObject({ type: 'undo', message: 'La IA borró a', actionLabel: 'Deshacer' });
    store.dispatch(aviso!.actionPayload as never);
    expect(store.getState().project.pieces.map(p => p.id)).toEqual(['a', 'b']);
    expect(store.getState().project.seams).toHaveLength(1);
  });

  it('borra algo de dentro de una pieza, y el aviso dice qué', async () => {
    const { store, ctx } = tienda([pieza('Delantero', [100], { internals: [piquete('n1', 30)] })]);
    const r = await actuarCon(ctx, 'remove', { piece_id: 'Delantero', internal_id: 'n1' });
    expect(r).toMatchObject({ done: true, changed: { deleted: ['n1'] }, measure: { removed: { kind: 'notch', id: 'n1' } } });
    expect(ultimoAviso(store)).toMatchObject({ message: 'La IA borró un piquete de Delantero' });
    expect(getHistory().past.at(-1)).toMatchObject({ label: 'IA: borrar un piquete de Delantero', agent: { toolName: 'remove' } });
  });

  it('una pieza bloqueada no se borra, y no hay aviso', async () => {
    const { store, ctx } = tienda([pieza('a', [100], { locked: true })]);
    expect(await actuarCon(ctx, 'remove', { piece_id: 'a' })).toMatchObject({ done: false, warnings: ['piece is locked'] });
    expect(ultimoAviso(store)).toBeUndefined();
  });
});

describe('undo', () => {
  it('deshace el último paso si fue del agente, y dice cuál', async () => {
    const { store, ctx } = tienda([pieza('a', [100])]);
    await actuarCon(ctx, 'remove', { piece_id: 'a' });
    const r = await actuarCon(ctx, 'undo', {});
    expect(r).toMatchObject({ done: true, changed: { created: ['a'] }, measure: { undone: 'IA: borrar a', by: 'remove' } });
    expect(store.getState().project.pieces).toHaveLength(1);
  });
  it('si el último paso es de María, no deshace nada y lo dice', async () => {
    const { store, ctx } = tienda([pieza('a', [100])]);
    store.dispatch(updatePiece({ ...store.getState().project.pieces[0], name: 'suyo' }));
    const r = await actuarCon(ctx, 'undo', {});
    expect(r).toMatchObject({ done: false, warnings: ['the last step was made by the user ("Edit Piece"); it is not undone'] });
    expect(store.getState().project.pieces[0].name).toBe('suyo');
  });
  it('sin pasos, nada que deshacer', async () => {
    const { ctx } = tienda();
    expect(await actuarCon(ctx, 'undo', {})).toMatchObject({ done: false, warnings: ['nothing to undo'] });
  });
});
