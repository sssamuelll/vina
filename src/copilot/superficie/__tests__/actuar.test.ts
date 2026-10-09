import { describe, it, expect } from 'vitest';
import { getHistory } from '../../../store/undoMiddleware';
import { undo } from '../../../store/editorSlice';
import { addInternalLine, addPiece, updatePiece } from '../../../store/projectSlice';
import { actuar, cambiosEntre, cerrar, estaBloqueada, rehusar } from '../actuar';
import { pieza, piquete, tienda } from './fixtures';

describe('actuar: el paso de escribir de todo verbo', () => {
  it('un verbo es un solo paso de deshacer, con su nombre y marcado como del agente', () => {
    const { store, ctx } = tienda([pieza('a', [100])]);
    actuar(ctx, 'prueba', 'renombrar dos veces', () => {
      ctx.dispatch(updatePiece({ ...ctx.getState().project.pieces[0], name: 'uno' }));
      ctx.dispatch(updatePiece({ ...ctx.getState().project.pieces[0], name: 'dos' }));
    });
    const { past } = getHistory();
    expect(past).toHaveLength(1);
    expect(past[0]).toMatchObject({ label: 'IA: renombrar dos veces', agent: { toolName: 'prueba' } });
    store.dispatch(undo());
    expect(store.getState().project.pieces[0].name).toBe('a');
  });

  it('dice qué cambió por id, y la revisión de antes y de después', () => {
    const { ctx } = tienda([pieza('a', [100])]);
    const e = actuar(ctx, 'prueba', 'crear', () => { ctx.dispatch(addPiece(pieza('b', [50]))); });
    expect(e.changed).toEqual({ created: ['b'], modified: [], deleted: [] });
    expect(e.revision.after).toBe(e.revision.before + 1);
  });

  it('si falla a medias, deshace lo que alcanzó a escribir y deja salir el error', () => {
    const { store, ctx } = tienda([pieza('a', [100])]);
    expect(() => actuar(ctx, 'prueba', 'romper', () => {
      ctx.dispatch(addPiece(pieza('b', [50])));
      throw new Error('a medias');
    })).toThrow('a medias');
    expect(store.getState().project.pieces.map(p => p.id)).toEqual(['a']);
  });
});

describe('cambiosEntre', () => {
  it('una interna nueva es «created», y su pieza «modified»', () => {
    const { store } = tienda([pieza('a', [100])]);
    const antes = store.getState().project;
    store.dispatch(addInternalLine({ pieceId: 'a', line: piquete('n1', 30) }));
    expect(cambiosEntre(antes, store.getState().project)).toEqual({ created: ['n1'], modified: ['a'], deleted: [] });
  });
});

describe('cerrar', () => {
  it('si la medida no confirma lo pedido, deshace el paso y lo dice', () => {
    const { store, ctx } = tienda([pieza('a', [100])]);
    const e = actuar(ctx, 'prueba', 'crear', () => { ctx.dispatch(addPiece(pieza('b', [50]))); });
    const r = cerrar(ctx, 'prueba', e, { done: false, measure: {}, warnings: ['measured 40 mm, asked 50 mm'] });
    expect(r).toMatchObject({ done: false, changed: { created: [], modified: [], deleted: [] } });
    expect(r.warnings).toEqual(['measured 40 mm, asked 50 mm', 'the change was undone']);
    expect(store.getState().project.pieces.map(p => p.id)).toEqual(['a']);
  });
  it('si confirma, el recibo lleva lo que cambió', () => {
    const { ctx } = tienda([pieza('a', [100])]);
    const e = actuar(ctx, 'prueba', 'crear', () => { ctx.dispatch(addPiece(pieza('b', [50]))); });
    expect(cerrar(ctx, 'prueba', e, { done: true, measure: { x: 1 }, warnings: [] })).toMatchObject({
      done: true, changed: { created: ['b'] }, measure: { x: 1 },
    });
  });
});

describe('rehusar y el candado', () => {
  it('rehusar no cambia nada y dice por qué', () => {
    expect(rehusar('piece is locked')).toMatchObject({
      done: false, changed: { created: [], modified: [], deleted: [] }, warnings: ['piece is locked'],
    });
  });
  it('el candado de la capa pesa igual que el de la pieza', () => {
    const { ctx } = tienda(
      [pieza('a', [100], { layer: 2 }), pieza('b', [100], { locked: true }), pieza('c', [100])],
      [],
      { layerLocked: { 2: true } },
    );
    const [a, b, c] = ctx.getState().project.pieces;
    expect([estaBloqueada(ctx, a), estaBloqueada(ctx, b), estaBloqueada(ctx, c)]).toEqual([true, true, false]);
  });
});
