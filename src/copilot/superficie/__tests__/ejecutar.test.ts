import { describe, it, expect, vi, beforeEach } from 'vitest';
import { z } from 'zod';
import { configureStore } from '@reduxjs/toolkit';
import projectReducer, { addPiece } from '../../../store/projectSlice';
import { seguirLaRevision } from '../../../store/revisionDelProyecto';
import { clearJournal, getJournal } from '../../../utils/telemetry/journal';
import { ejecutarVerbo } from '../ejecutar';
import { definirVerbo, type ContextoDeVerbo } from '../tipos';

/** El paso único de toda llamada a la superficie: valida, corre, registra y devuelve la revisión. */
const eco = definirVerbo({
  name: 'echo', description: 'Echo back a number.',
  args: z.object({ n: z.number() }),
  run: ({ n }) => ({ n }),
});
const roto = definirVerbo({
  name: 'broken', description: 'Always fails.',
  args: z.object({}),
  run: () => { throw new Error('no piece with id x'); },
});
const ctx = { getState: vi.fn(), dispatch: vi.fn(), origen: 'mcp' } as unknown as ContextoDeVerbo;

beforeEach(clearJournal);

describe('ejecutarVerbo', () => {
  it('corre el verbo con sus argumentos ya validados y devuelve la revisión', async () => {
    const r = await ejecutarVerbo([eco], 'echo', { n: 3 }, ctx);
    expect(r).toMatchObject({ ok: true, result: { n: 3 } });
    expect(typeof r.revision).toBe('number');
  });
  it('la revisión del sobre es la de ahora: sube si el proyecto cambió entre dos llamadas', async () => {
    const store = configureStore({ reducer: { project: projectReducer }, middleware: g => g({ serializableCheck: false }) });
    const soltar = seguirLaRevision(store);
    const antes = await ejecutarVerbo([eco], 'echo', { n: 1 }, ctx);
    store.dispatch(addPiece({
      id: 'p1', name: 'p1', outline: [{ type: 'M', values: [0, 0] }, { type: 'L', values: [10, 0] }, { type: 'Z', values: [] }],
      internals: [], position: { x: 0, y: 0 }, rotation: 0, mirrored: false, seamAllowance: 0,
      layer: 1, sublayer: 0, active: true, createdAt: 0, updatedAt: 0,
    }));
    const despues = await ejecutarVerbo([eco], 'echo', { n: 2 }, ctx);
    expect(despues.revision).toBe(antes.revision + 1);
    soltar();
  });
  it('un verbo que no existe es un error dicho, no una excepción', async () => {
    expect(await ejecutarVerbo([eco], 'nope', {}, ctx)).toMatchObject({ ok: false, error: 'unknown verb: nope' });
  });
  it('argumentos inválidos dicen qué campo y por qué', async () => {
    const r = await ejecutarVerbo([eco], 'echo', { n: 'tres' }, ctx);
    expect(r.ok).toBe(false);
    expect(r.ok === false && r.error).toMatch(/^invalid arguments: n: /);
  });
  it('un verbo que lanza devuelve su mensaje', async () => {
    expect(await ejecutarVerbo([roto], 'broken', {}, ctx)).toMatchObject({ ok: false, error: 'no piece with id x' });
  });
  it('cada llamada deja una entrada en la bitácora, con su origen y un resumen de lo que devolvió', async () => {
    await ejecutarVerbo([eco], 'echo', { n: 1 }, ctx);
    await ejecutarVerbo([eco], 'echo', { n: 2 }, ctx);
    const entradas = getJournal().events.filter(e => e.kind === 'agente');
    expect(entradas).toHaveLength(2);
    expect(entradas[1]).toMatchObject({ name: 'echo', data: { origen: 'mcp', ok: true, args: { n: 2 }, result: { n: 2 } } });
  });
});
