import { describe, it, expect, vi } from 'vitest';
import { tools } from '../definitions/3dInteractionTools';

describe('setCameraView tool', () => {
  const tool = tools.find(t => t.name === 'setCameraView');

  it('is registered in 3dInteractionTools', () => {
    expect(tool).toBeDefined();
  });

  it('has correct parameter schema', () => {
    expect(tool!.parameters.properties.view).toBeDefined();
    expect(tool!.parameters.properties.view.enum).toContain('front');
    expect(tool!.parameters.properties.view.enum).toContain('back');
    expect(tool!.parameters.properties.view.enum).toHaveLength(8);
    expect(tool!.parameters.properties.focusPieceId).toBeDefined();
  });

  it('dispatches setCameraPreset for view param', async () => {
    const dispatch = vi.fn();
    const getState = vi.fn(() => ({
      project: { pieces: [] },
    })) as unknown as () => import('../../../../store').RootState;

    const result = await tool!.execute({ view: 'front' }, dispatch, getState);
    expect(result.success).toBe(true);
    expect(dispatch).toHaveBeenCalledTimes(1);
    const action = dispatch.mock.calls[0][0];
    expect(action.type).toBe('camera/setCameraPreset');
    expect(action.payload).toBe('front');
  });

  it('dispatches focusOnPiece for focusPieceId param', async () => {
    const dispatch = vi.fn();
    const getState = vi.fn(() => ({
      project: { pieces: [{ id: 'p1', name: 'Front' }] },
    })) as unknown as () => import('../../../../store').RootState;

    const result = await tool!.execute({ focusPieceId: 'p1' }, dispatch, getState);
    expect(result.success).toBe(true);
    expect(dispatch).toHaveBeenCalledTimes(1);
    const action = dispatch.mock.calls[0][0];
    expect(action.type).toBe('camera/focusOnPiece');
    expect(action.payload).toBe('p1');
  });

  it('returns error when neither view nor focusPieceId provided', async () => {
    const dispatch = vi.fn();
    const getState = vi.fn() as unknown as () => import('../../../../store').RootState;

    const result = await tool!.execute({}, dispatch, getState);
    expect(result.success).toBe(false);
  });
});
