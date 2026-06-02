import { describe, it, expect, vi } from 'vitest';
import { activate2DTool } from '../toolActivation';
import { setActiveTool } from '../editorSlice';
import { setActiveTool2D } from '../toolSlice';

describe('activate2DTool', () => {
  it('dispatches both the editor and tool slices for a 2D tool', () => {
    const dispatch = vi.fn();
    activate2DTool(dispatch, 'measure');
    expect(dispatch).toHaveBeenCalledWith(setActiveTool('measure'));
    expect(dispatch).toHaveBeenCalledWith(setActiveTool2D('measure'));
    expect(dispatch).toHaveBeenCalledTimes(2);
  });

  it('passes legacy non-Tool2D ids through too (e.g. circle)', () => {
    const dispatch = vi.fn();
    activate2DTool(dispatch, 'circle');
    expect(dispatch).toHaveBeenCalledWith(setActiveTool2D('circle'));
    expect(dispatch).toHaveBeenCalledTimes(2);
  });
});
