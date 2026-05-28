import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockStorage: Record<string, string> = {};
vi.stubGlobal('localStorage', {
  getItem: vi.fn((key: string) => mockStorage[key] ?? null),
  setItem: vi.fn((key: string, value: string) => { mockStorage[key] = value; }),
  removeItem: vi.fn((key: string) => { delete mockStorage[key]; }),
});

import layoutReducer, { resetLayout, setPrimaryView, setSplitRatio, swapViews } from '../layoutSlice';

describe('layoutSlice', () => {
  beforeEach(() => {
    for (const key of Object.keys(mockStorage)) delete mockStorage[key];
  });

  it('defaults primaryView to 2d', () => {
    const state = layoutReducer(undefined, { type: '@@INIT' });
    expect(state.primaryView).toBe('2d');
  });

  it('defaults splitRatio to 0.5', () => {
    const state = layoutReducer(undefined, { type: '@@INIT' });
    expect(state.splitRatio).toBe(0.5);
  });

  it('setPrimaryView updates primaryView', () => {
    const state = layoutReducer(undefined, setPrimaryView('3d'));
    expect(state.primaryView).toBe('3d');
  });

  it('swapViews toggles primaryView', () => {
    const state = layoutReducer({ primaryView: '2d', splitRatio: 0.5 }, swapViews());
    expect(state.primaryView).toBe('3d');
  });

  it('setSplitRatio clamps to [0.15, 0.85]', () => {
    expect(layoutReducer(undefined, setSplitRatio(0.05)).splitRatio).toBe(0.15);
    expect(layoutReducer(undefined, setSplitRatio(0.95)).splitRatio).toBe(0.85);
    expect(layoutReducer(undefined, setSplitRatio(0.7)).splitRatio).toBe(0.7);
  });

  it('resetLayout restores defaults', () => {
    const state = layoutReducer({ primaryView: '3d', splitRatio: 0.8 }, resetLayout());
    expect(state.primaryView).toBe('2d');
    expect(state.splitRatio).toBe(0.5);
  });
});
