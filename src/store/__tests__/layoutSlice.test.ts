import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockStorage: Record<string, string> = {};
vi.stubGlobal('localStorage', {
  getItem: vi.fn((key: string) => mockStorage[key] ?? null),
  setItem: vi.fn((key: string, value: string) => { mockStorage[key] = value; }),
  removeItem: vi.fn((key: string) => { delete mockStorage[key]; }),
});

import layoutReducer, { resetLayout } from '../layoutSlice';

describe('layoutSlice', () => {
  beforeEach(() => {
    for (const key of Object.keys(mockStorage)) delete mockStorage[key];
  });

  it('defaults copilotOpen to false', () => {
    const state = layoutReducer(undefined, { type: '@@INIT' });
    expect(state.copilotOpen).toBe(false);
  });

  it('resetLayout sets copilotOpen to false', () => {
    const state = layoutReducer({ copilotOpen: true, copilotPosition: 'right', copilotSize: 340, primaryView: '2d', splitRatio: 0.5 }, resetLayout());
    expect(state.copilotOpen).toBe(false);
  });
});
