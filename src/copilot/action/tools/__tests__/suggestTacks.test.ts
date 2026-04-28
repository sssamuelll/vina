import { describe, it, expect, vi } from 'vitest';
import { tools } from '../definitions/3dInteractionTools';

const suggestTacksTool = tools.find(t => t.name === 'suggestTacks');

function piece(id: string, name: string, x: number, y: number) {
  const now = Date.now();
  return {
    id,
    name,
    outline: [],
    internals: [],
    position: { x, y },
    rotation: 0,
    mirrored: false,
    seamAllowance: 0,
    active: true,
    createdAt: now,
    updatedAt: now,
  };
}

describe('suggestTacks tool', () => {
  it('is registered in 3dInteractionTools', () => {
    expect(suggestTacksTool).toBeDefined();
  });

  it('returns nearest unsewn neighbors only', async () => {
    const dispatch = vi.fn();
    const getState = vi.fn(() => ({
      project: {
        pieces: [
          piece('a', 'Front A', 0, 0),
          piece('b', 'Front B', 10, 0),
          piece('c', 'Sleeve C', 1000, 0),
        ],
        seams: [],
      },
    })) as unknown as () => import('../../../../store').RootState;

    const result = await suggestTacksTool!.execute({ maxDistance: 50, maxSuggestions: 10 }, dispatch, getState);

    expect(result.success).toBe(true);
    expect(result.data?.suggestionCount).toBe(1);
    expect((result.data?.suggestions as Array<{ pieceAId: string; pieceBId: string }>)[0].pieceAId).toBe('a');
    expect((result.data?.suggestions as Array<{ pieceAId: string; pieceBId: string }>)[0].pieceBId).toBe('b');
  });

  it('ignores invalid params and falls back to safe defaults', async () => {
    const dispatch = vi.fn();
    const getState = vi.fn(() => ({
      project: {
        pieces: [
          piece('a', 'A', 0, 0),
          piece('b', 'B', 20, 0),
        ],
        seams: [],
      },
    })) as unknown as () => import('../../../../store').RootState;

    const result = await suggestTacksTool!.execute({ maxDistance: -1, maxSuggestions: 0 }, dispatch, getState);

    expect(result.success).toBe(true);
    expect(result.data?.suggestionCount).toBe(1);
  });
});
