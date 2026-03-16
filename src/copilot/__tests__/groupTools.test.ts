import { describe, it, expect, beforeEach } from 'vitest';
import { configureStore } from '@reduxjs/toolkit';
import projectReducer from '../../store/projectSlice';
import editorReducer from '../../store/editorSlice';
import simulationReducer from '../../store/simulationSlice';
import pluginReducer from '../../store/pluginSlice';
import layoutReducer from '../../store/layoutSlice';
import markerReducer from '../../store/markerSlice';
import avatarReducer from '../../store/avatarSlice';
import toolReducer from '../../store/toolSlice';
import parametricReducer from '../../store/parametricSlice';
import { getDefaultRegistry, resetDefaultRegistry, type ToolDefinition } from '../action/tools/registry';
import type { RootState, AppDispatch } from '../../store';

function createTestStore() {
  return configureStore({
    reducer: {
      project: projectReducer,
      editor: editorReducer,
      simulation: simulationReducer,
      plugins: pluginReducer,
      layout: layoutReducer,
      marker: markerReducer,
      avatar: avatarReducer,
      tools: toolReducer,
      parametric: parametricReducer,
    },
    middleware: (getDefaultMiddleware) =>
      getDefaultMiddleware({ serializableCheck: false }),
  });
}

type TestStore = ReturnType<typeof createTestStore>;

async function executeTool(
  store: TestStore,
  tool: ToolDefinition,
  params: Record<string, unknown>,
) {
  const dispatch = store.dispatch as AppDispatch;
  const getState = store.getState as () => RootState;
  return tool.execute(params, dispatch, getState);
}

const RECT_OUTLINE = [
  { type: 'M', values: [0, 0] },
  { type: 'L', values: [200, 0] },
  { type: 'L', values: [200, 300] },
  { type: 'L', values: [0, 300] },
  { type: 'Z', values: [] },
];

describe('groupPieces tool', () => {
  let store: TestStore;
  let registry: ReturnType<typeof getDefaultRegistry>;

  beforeEach(async () => {
    resetDefaultRegistry();
    registry = getDefaultRegistry();
    store = createTestStore();
    const createPiece = registry.get('createPiece')!;
    await executeTool(store, createPiece, { name: 'Front', outline: RECT_OUTLINE });
    await executeTool(store, createPiece, { name: 'Back', outline: RECT_OUTLINE });
  });

  it('creates group with custom color in single dispatch', async () => {
    const tool = registry.get('groupPieces')!;
    const pieces = store.getState().project.pieces;
    const result = await executeTool(store, tool, {
      name: 'Bodice',
      pieceIds: [pieces[0].id, pieces[1].id],
      color: '#ff0000',
    });
    expect(result.success).toBe(true);
    const groups = store.getState().project.groups;
    expect(groups).toHaveLength(1);
    expect(groups[0].color).toBe('#ff0000');
    expect(groups[0].name).toBe('Bodice');
  });

  it('creates group with default color when none provided', async () => {
    const tool = registry.get('groupPieces')!;
    const pieces = store.getState().project.pieces;
    const result = await executeTool(store, tool, {
      name: 'Sleeves',
      pieceIds: [pieces[0].id],
    });
    expect(result.success).toBe(true);
    const groups = store.getState().project.groups;
    expect(groups[0].color).toMatch(/^#[0-9a-fA-F]{6}$/);
  });

  it('rejects invalid piece IDs', async () => {
    const tool = registry.get('groupPieces')!;
    const result = await executeTool(store, tool, {
      name: 'Bad',
      pieceIds: ['nonexistent-1', 'nonexistent-2'],
    });
    expect(result.success).toBe(false);
    expect(result.error).toContain('not found');
  });
});
