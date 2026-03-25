import { describe, it, expect, vi } from 'vitest';
import type { RootState, AppDispatch } from '../../../../../store';

function mockState(referenceImages: Array<{ id: string; filename: string; opacity?: number }> = []): () => RootState {
  return () => ({
    project: {
      referenceImages,
    },
  }) as unknown as RootState;
}

describe('referenceImage copilot tools', () => {
  it('setReferenceImageOpacity with valid id → success', async () => {
    const { tools } = await import('../referenceImageTools');
    const tool = tools.find(t => t.name === 'setReferenceImageOpacity')!;
    expect(tool).toBeDefined();

    const dispatch = vi.fn() as unknown as AppDispatch;
    const getState = mockState([{ id: 'img-1', filename: 'front.png', opacity: 1 }]);

    const result = await tool.execute({ imageId: 'img-1', opacity: 0.5 }, dispatch, getState);

    expect(result.success).toBe(true);
    expect(result.data).toEqual({ imageId: 'img-1', opacity: 0.5 });
    expect(dispatch).toHaveBeenCalled();
  });

  it('setReferenceImageOpacity with invalid id → error', async () => {
    const { tools } = await import('../referenceImageTools');
    const tool = tools.find(t => t.name === 'setReferenceImageOpacity')!;

    const dispatch = vi.fn() as unknown as AppDispatch;
    const getState = mockState([]);

    const result = await tool.execute({ imageId: 'nonexistent', opacity: 0.5 }, dispatch, getState);

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/not found/i);
    expect(dispatch).not.toHaveBeenCalled();
  });

  it('setReferenceImageOpacity clamps to 0-1', async () => {
    const { tools } = await import('../referenceImageTools');
    const tool = tools.find(t => t.name === 'setReferenceImageOpacity')!;

    const dispatch = vi.fn() as unknown as AppDispatch;
    const getState = mockState([{ id: 'img-1', filename: 'front.png' }]);

    // Test clamping above 1
    const resultHigh = await tool.execute({ imageId: 'img-1', opacity: 5 }, dispatch, getState);
    expect(resultHigh.success).toBe(true);
    expect(resultHigh.data?.opacity).toBe(1);

    // Test clamping below 0
    const resultLow = await tool.execute({ imageId: 'img-1', opacity: -2 }, dispatch, getState);
    expect(resultLow.success).toBe(true);
    expect(resultLow.data?.opacity).toBe(0);
  });

  it('toggleReferenceImages dispatches setShowReferenceImages', async () => {
    const { tools } = await import('../referenceImageTools');
    const tool = tools.find(t => t.name === 'toggleReferenceImages')!;
    expect(tool).toBeDefined();

    const dispatch = vi.fn() as unknown as AppDispatch;
    const getState = mockState();

    const resultShow = await tool.execute({ visible: true }, dispatch, getState);
    expect(resultShow.success).toBe(true);
    expect(resultShow.data).toEqual({ visible: true });
    expect(dispatch).toHaveBeenCalled();

    (dispatch as unknown as ReturnType<typeof vi.fn>).mockClear();

    const resultHide = await tool.execute({ visible: false }, dispatch, getState);
    expect(resultHide.success).toBe(true);
    expect(resultHide.data).toEqual({ visible: false });
    expect(dispatch).toHaveBeenCalled();
  });

  it('removeReferenceImage with valid id → success', async () => {
    const { tools } = await import('../referenceImageTools');
    const tool = tools.find(t => t.name === 'removeReferenceImage')!;
    expect(tool).toBeDefined();

    const dispatch = vi.fn() as unknown as AppDispatch;
    const getState = mockState([{ id: 'img-2', filename: 'back.png' }]);

    const result = await tool.execute({ imageId: 'img-2' }, dispatch, getState);

    expect(result.success).toBe(true);
    expect(result.data).toEqual({ removedId: 'img-2', filename: 'back.png' });
    expect(dispatch).toHaveBeenCalled();
  });

  it('removeReferenceImage with invalid id → error', async () => {
    const { tools } = await import('../referenceImageTools');
    const tool = tools.find(t => t.name === 'removeReferenceImage')!;

    const dispatch = vi.fn() as unknown as AppDispatch;
    const getState = mockState([]);

    const result = await tool.execute({ imageId: 'does-not-exist' }, dispatch, getState);

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/not found/i);
    expect(dispatch).not.toHaveBeenCalled();
  });
});
