// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react';
import { configureStore } from '@reduxjs/toolkit';
import { createElement } from 'react';
import type React from 'react';
import { Provider } from 'react-redux';
import { describe, expect, it, vi } from 'vitest';
import toolReducer from '../../../store/toolSlice';
import type { InternalLine, PatternPiece } from '../../../types/types';
import { useNotchTool } from '../useNotchTool';

const notch: InternalLine = {
  id: 'notch-42',
  type: 'notch',
  path: [
    { type: 'M', values: [42, 0] },
    { type: 'L', values: [42, 8] },
  ],
  notchAnchor: {
    refPoint: { x: 0, y: 0 },
    direction: 'cw',
    distanceMm: 42,
    metric: 2,
  },
};

const piece: PatternPiece = {
  id: 'piece-1',
  name: 'Delantero',
  outline: [
    { type: 'M', values: [0, 0] },
    { type: 'L', values: [100, 0] },
    { type: 'L', values: [100, 100] },
    { type: 'L', values: [0, 100] },
    { type: 'Z', values: [] },
  ],
  internals: [notch],
  position: { x: 10, y: 20 },
  rotation: 0,
  mirrored: false,
  seamAllowance: 0,
  active: true,
  createdAt: 0,
  updatedAt: 0,
};

describe('useNotchTool — refinar un piquete existente', () => {
  it('reconstruye el estado de precisión desde el ancla guardada', () => {
    const store = configureStore({ reducer: { tools: toolReducer } });
    const wrapper = ({ children }: { children: React.ReactNode }) =>
      createElement(Provider, { store, children });
    const { result } = renderHook(
      () => useNotchTool(1, { x: 0, y: 0 }, [piece], vi.fn()),
      { wrapper },
    );

    act(() => { result.current.refineExisting(piece.id, notch); });

    expect(result.current.refining).toMatchObject({
      pieceId: piece.id,
      notch,
      refWorld: { x: 10, y: 20 },
      notchWorld: { x: 52, y: 20 },
      maxDistanceMm: 400,
    });
  });
});
