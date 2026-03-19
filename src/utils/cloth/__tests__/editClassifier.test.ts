import { describe, it, expect } from 'vitest';
import { classifyEdit } from '../editClassifier';
import type { PatternPiece } from '../../../types/types';

function makePiece(overrides: Partial<PatternPiece> = {}): PatternPiece {
  return {
    id: 'piece-1',
    name: 'Test',
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
    seamAllowance: 10,
    layer: 1,
    sublayer: 0,
    createdAt: 0,
    updatedAt: 0,
    ...overrides,
  };
}

describe('classifyEdit', () => {
  it('returns "dimension" when only coordinate values change', () => {
    const prev = [makePiece()];
    const next = [makePiece({
      outline: [
        { type: 'M', values: [0, 0] },
        { type: 'L', values: [120, 0] },
        { type: 'L', values: [120, 100] },
        { type: 'L', values: [0, 100] },
        { type: 'Z', values: [] },
      ],
    })];
    expect(classifyEdit(prev, next)).toBe('dimension');
  });

  it('returns "topology" when a piece is added', () => {
    const prev = [makePiece()];
    const next = [makePiece(), makePiece({ id: 'piece-2' })];
    expect(classifyEdit(prev, next)).toBe('topology');
  });

  it('returns "topology" when a piece is removed', () => {
    const prev = [makePiece(), makePiece({ id: 'piece-2' })];
    const next = [makePiece()];
    expect(classifyEdit(prev, next)).toBe('topology');
  });

  it('returns "topology" when outline segment count changes', () => {
    const prev = [makePiece()];
    const next = [makePiece({
      outline: [
        { type: 'M', values: [0, 0] },
        { type: 'L', values: [50, 0] },
        { type: 'L', values: [100, 0] },
        { type: 'L', values: [100, 100] },
        { type: 'L', values: [0, 100] },
        { type: 'Z', values: [] },
      ],
    })];
    expect(classifyEdit(prev, next)).toBe('topology');
  });

  it('returns "topology" when segment type changes (L -> C)', () => {
    const prev = [makePiece()];
    const next = [makePiece({
      outline: [
        { type: 'M', values: [0, 0] },
        { type: 'C', values: [30, 0, 70, 0, 100, 0] },
        { type: 'L', values: [100, 100] },
        { type: 'L', values: [0, 100] },
        { type: 'Z', values: [] },
      ],
    })];
    expect(classifyEdit(prev, next)).toBe('topology');
  });

  it('returns "topology" when piece IDs differ (reordered)', () => {
    const p1 = makePiece({ id: 'a' });
    const p2 = makePiece({ id: 'b' });
    expect(classifyEdit([p1, p2], [p2, p1])).toBe('topology');
  });

  it('returns "dimension" for empty -> empty', () => {
    expect(classifyEdit([], [])).toBe('dimension');
  });

  it('returns "dimension" when only position/rotation changes', () => {
    const prev = [makePiece({ position: { x: 0, y: 0 } })];
    const next = [makePiece({ position: { x: 50, y: 50 }, rotation: 45 })];
    expect(classifyEdit(prev, next)).toBe('dimension');
  });
});
