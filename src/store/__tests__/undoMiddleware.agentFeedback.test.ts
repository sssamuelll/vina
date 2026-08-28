import { configureStore } from '@reduxjs/toolkit';
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';
import { ToolRegistry, type ToolDefinition } from '../../copilot/action/tools/registry';
import type { AppDispatch, RootState } from '..';
import projectReducer, { loadProject, updatePiece } from '../projectSlice';
import {
  getHistory,
  getUndoLength,
  undoMiddleware,
} from '../undoMiddleware';
import type { PatternPiece } from '../../types/types';

function piezaCuadrada(): PatternPiece {
  return {
    id: 'piece-1',
    name: 'Base',
    outline: [
      { type: 'M', values: [0, 0] },
      { type: 'L', values: [100, 0] },
      { type: 'L', values: [100, 100] },
      { type: 'L', values: [0, 100] },
      { type: 'Z', values: [] },
    ],
    internals: [],
    position: { x: 0, y: 0 },
    rotation: 0,
    mirrored: false,
    seamAllowance: 0,
    active: true,
    createdAt: 0,
    updatedAt: 0,
  };
}

function crearTool(
  name: string,
  execute: ToolDefinition['execute'],
): ToolDefinition {
  return {
    name,
    description: `Tool de prueba ${name}`,
    parameters: { type: 'object', properties: {} },
    execute,
  };
}

function diferido() {
  let resolve!: () => void;
  const promise = new Promise<void>((next) => { resolve = next; });
  return { promise, resolve };
}

function preparar() {
  const store = configureStore({
    reducer: { project: projectReducer },
    middleware: (getDefault) => getDefault({ serializableCheck: false })
      .concat(undoMiddleware),
  });
  const base = store.getState().project;
  store.dispatch(loadProject({
    ...base,
    id: 'project-1',
    name: 'Prueba',
    pieces: [piezaCuadrada()],
    seams: [],
    fabrics: [],
    createdAt: 0,
    updatedAt: 0,
  }));

  const registry = new ToolRegistry();
  registry.setContext(
    store.dispatch as AppDispatch,
    store.getState as () => RootState,
  );

  return { registry, store };
}

function despacharEdicion(
  dispatch: Parameters<ToolDefinition['execute']>[1],
  getState: Parameters<ToolDefinition['execute']>[2],
  name: string,
): void {
  const piece = getState().project.pieces[0];
  dispatch(updatePiece({ ...piece, name }));
}

describe('señal neutral de undo rápido después del agente', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
  });

  afterEach(() => {
    vi.clearAllTimers();
    vi.useRealTimers();
  });

  it('añade la señal a 10.000 ms sin mutar el historyEntry original', async () => {
    const { registry, store } = preparar();
    registry.register(crearTool('modifyEdge', async (_params, dispatch, getState) => {
      despacharEdicion(dispatch, getState, 'Agente');
      return { success: true };
    }));

    vi.setSystemTime(1_000);
    const result = await registry.execute('modifyEdge', {});
    const before = structuredClone(getHistory().timeline.at(-1));

    vi.setSystemTime(11_000);
    store.dispatch({ type: 'editor/undo' });

    expect(result).toEqual({ success: true });
    expect(getHistory().timeline.at(-1)).toEqual({
      kind: 'rapidUndoAfterAgent',
      timestamp: 11_000,
      toolName: 'modifyEdge',
      actionType: 'project/updatePiece',
      actionTimestamp: 1_000,
      lastMutationAt: 1_000,
      latencyMs: 10_000,
    });
    expect(getHistory().timeline.at(-2)).toEqual(before);
  });

  it('no añade señal a 10.001 ms', async () => {
    const { registry, store } = preparar();
    registry.register(crearTool('modifyEdge', async (_params, dispatch, getState) => {
      despacharEdicion(dispatch, getState, 'Agente');
      return { success: true };
    }));

    vi.setSystemTime(1_000);
    await registry.execute('modifyEdge', {});
    vi.setSystemTime(11_001);
    store.dispatch({ type: 'editor/undo' });

    expect(getHistory().timeline.some(
      (event) => event.kind === 'rapidUndoAfterAgent',
    )).toBe(false);
  });

  it('deshace la edición posterior de María sin atribuírsela al agente', async () => {
    const { registry, store } = preparar();
    registry.register(crearTool('modifyEdge', async (_params, dispatch, getState) => {
      despacharEdicion(dispatch, getState, 'Agente');
      return { success: true };
    }));

    vi.setSystemTime(1_000);
    await registry.execute('modifyEdge', {});
    vi.setSystemTime(1_100);
    store.dispatch(updatePiece({
      ...store.getState().project.pieces[0],
      name: 'María',
    }));
    vi.setSystemTime(1_200);
    store.dispatch({ type: 'editor/undo' });

    expect(getUndoLength()).toBe(1);
    expect(store.getState().project.pieces[0].name).toBe('Agente');
    expect(getHistory().timeline.some(
      (event) => event.kind === 'rapidUndoAfterAgent',
    )).toBe(false);
  });

  it('no trata como reacción humana el undo despachado por un tool', async () => {
    const { registry, store } = preparar();
    registry.register(crearTool('undoingTool', async (_params, dispatch, getState) => {
      despacharEdicion(dispatch, getState, 'Agente');
      dispatch({ type: 'editor/undo' });
      return { success: true };
    }));

    vi.setSystemTime(1_000);
    await registry.execute('undoingTool', {});

    expect(store.getState().project.pieces[0].name).toBe('Base');
    expect(getHistory().timeline.some(
      (event) => event.kind === 'rapidUndoAfterAgent',
    )).toBe(false);
  });

  it('no filtra procedencia a la edición de María mientras el tool espera', async () => {
    const { registry, store } = preparar();
    const gate = diferido();
    registry.register(crearTool('slowTool', async (_params, dispatch, getState) => {
      await gate.promise;
      despacharEdicion(dispatch, getState, 'Agente tardío');
      return { success: true };
    }));

    vi.setSystemTime(1_000);
    const execution = registry.execute('slowTool', {});
    vi.setSystemTime(1_100);
    store.dispatch(updatePiece({
      ...store.getState().project.pieces[0],
      name: 'María',
    }));
    vi.setSystemTime(1_200);
    gate.resolve();
    await execution;

    expect(getHistory().past).toEqual([
      expect.objectContaining({ actionType: 'project/updatePiece' }),
      expect.objectContaining({
        actionType: 'project/updatePiece',
        agent: { toolName: 'slowTool', lastMutationAt: 1_200 },
      }),
    ]);
    expect(getHistory().past[0]).not.toHaveProperty('agent');
  });

  it('agrupa dos dispatches del mismo tool y mide desde la última mutación', async () => {
    const { registry, store } = preparar();
    registry.register(crearTool('modifyEdge', async (_params, dispatch, getState) => {
      despacharEdicion(dispatch, getState, 'Primera');
      vi.setSystemTime(1_200);
      despacharEdicion(dispatch, getState, 'Segunda');
      return { success: true };
    }));

    vi.setSystemTime(1_000);
    await registry.execute('modifyEdge', {});
    const original = structuredClone(getHistory().timeline.at(-1));
    vi.setSystemTime(11_200);
    store.dispatch({ type: 'editor/undo' });

    expect(getHistory().past).toHaveLength(0);
    expect(getHistory().future).toEqual([
      expect.objectContaining({
        timestamp: 1_000,
        agent: { toolName: 'modifyEdge', lastMutationAt: 1_200 },
      }),
    ]);
    expect(getHistory().timeline.at(-1)).toEqual({
      kind: 'rapidUndoAfterAgent',
      timestamp: 11_200,
      toolName: 'modifyEdge',
      actionType: 'project/updatePiece',
      actionTimestamp: 1_000,
      lastMutationAt: 1_200,
      latencyMs: 10_000,
    });
    expect(getHistory().timeline.at(-2)).toEqual(original);
  });
});
