import { describe, it, expect, vi } from 'vitest';
import type { RootState, AppDispatch } from '../../../../../store';

function mockState(
  pieces: Array<{ id: string; name: string; category?: string; side?: string }>,
): () => RootState {
  return () => ({ project: { pieces } }) as unknown as RootState;
}

async function getClassifyTool() {
  const { tools } = await import('../edgeTools');
  const tool = tools.find((t: { name: string }) => t.name === 'classifyPiece');
  expect(tool).toBeDefined();
  return tool!;
}

describe('classifyPiece tool — explicit category override (#3 placement fix)', () => {
  it('sets an explicit trouser category so a DXF "Delantero" places on legs, not chest', async () => {
    const tool = await getClassifyTool();
    const dispatch = vi.fn() as unknown as AppDispatch;
    const getState = mockState([{ id: 'p1', name: 'Delantero-1' }]);

    const result = await tool.execute({ pieceId: 'p1', category: 'trouser', side: 'front' }, dispatch, getState);

    expect(result.success).toBe(true);
    expect(dispatch).toHaveBeenCalledTimes(1);
    const action = (dispatch as unknown as { mock: { calls: unknown[][] } }).mock.calls[0][0] as {
      payload: { category: string; side: string };
    };
    expect(action.payload.category).toBe('trouser');
    expect(action.payload.side).toBe('front');
  });

  it('requires pieceId when an explicit category is given', async () => {
    const tool = await getClassifyTool();
    const dispatch = vi.fn() as unknown as AppDispatch;
    const result = await tool.execute({ category: 'trouser' }, dispatch, mockState([{ id: 'p1', name: 'x' }]));
    expect(result.success).toBe(false);
    expect(dispatch).not.toHaveBeenCalled();
  });

  it('auto-classifies "Delantero" as bodice without an override — the ambiguity the override fixes', async () => {
    const tool = await getClassifyTool();
    const dispatch = vi.fn() as unknown as AppDispatch;
    const result = await tool.execute({ pieceId: 'p1' }, dispatch, mockState([{ id: 'p1', name: 'Delantero-1' }]));
    expect(result.success).toBe(true);
    const data = result.data as { pieces: Array<{ category: string }> };
    expect(data.pieces[0].category).toBe('bodice'); // would place pants at the chest → they fall
  });

  it('errors on an unknown pieceId', async () => {
    const tool = await getClassifyTool();
    const dispatch = vi.fn() as unknown as AppDispatch;
    const result = await tool.execute({ pieceId: 'nope', category: 'trouser' }, dispatch, mockState([{ id: 'p1', name: 'x' }]));
    expect(result.success).toBe(false);
  });
});
