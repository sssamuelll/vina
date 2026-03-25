import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { RootState, AppDispatch } from '../../../../../store';
import type { PatternPiece } from '../../../../../types/types';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makePiece(overrides: Partial<PatternPiece> = {}): PatternPiece {
  return {
    id: 'piece-1',
    name: 'Front Bodice',
    outline: [
      { type: 'M', values: [0, 0] },
      { type: 'L', values: [100, 0] },
      { type: 'L', values: [100, 150] },
      { type: 'L', values: [0, 150] },
      { type: 'Z', values: [] },
    ],
    internals: [],
    position: { x: 0, y: 0 },
    rotation: 0,
    mirrored: false,
    seamAllowance: 10,
    cornerTypes: {},
    active: true,
    createdAt: 0,
    updatedAt: 0,
    ...overrides,
  };
}

function mockState(pieces: PatternPiece[]): () => RootState {
  return () =>
    ({
      project: {
        pieces,
        seams: [],
      },
    }) as unknown as RootState;
}

// ─── setCornerType ────────────────────────────────────────────────────────────

describe('setCornerType copilot tool', () => {
  let mockDispatch: AppDispatch;

  beforeEach(() => {
    mockDispatch = vi.fn() as unknown as AppDispatch;
  });

  it('valid vertex → success, cornerTypes updated', async () => {
    const { tools } = await import('../seamTools');
    const tool = tools.find(t => t.name === 'setCornerType');
    expect(tool).toBeDefined();

    const piece = makePiece();
    const getState = mockState([piece]);

    const result = await tool!.execute(
      { pieceId: 'piece-1', vertexIndex: 1, cornerType: 'squared' },
      mockDispatch,
      getState,
    );

    expect(result.success).toBe(true);
    expect(result.data).toMatchObject({
      pieceId: 'piece-1',
      vertexIndex: 1,
      cornerType: 'squared',
    });
    expect(mockDispatch).toHaveBeenCalledOnce();

    // Inspect what was dispatched
    const dispatched = (mockDispatch as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(dispatched.payload.cornerTypes).toMatchObject({ 1: 'squared' });
  });

  it('preserves existing cornerTypes overrides when setting a new vertex', async () => {
    const { tools } = await import('../seamTools');
    const tool = tools.find(t => t.name === 'setCornerType');
    expect(tool).toBeDefined();

    const piece = makePiece({ cornerTypes: { 0: 'envelope' } });
    const getState = mockState([piece]);

    const result = await tool!.execute(
      { pieceId: 'piece-1', vertexIndex: 2, cornerType: 'mitered' },
      mockDispatch,
      getState,
    );

    expect(result.success).toBe(true);
    const dispatched = (mockDispatch as ReturnType<typeof vi.fn>).mock.calls[0][0];
    // Both old and new overrides should be present
    expect(dispatched.payload.cornerTypes).toMatchObject({ 0: 'envelope', 2: 'mitered' });
  });

  it('out-of-bounds vertex → error', async () => {
    const { tools } = await import('../seamTools');
    const tool = tools.find(t => t.name === 'setCornerType');
    expect(tool).toBeDefined();

    const piece = makePiece(); // outline has 5 commands (indices 0-4)
    const getState = mockState([piece]);

    const result = await tool!.execute(
      { pieceId: 'piece-1', vertexIndex: 99, cornerType: 'squared' },
      mockDispatch,
      getState,
    );

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/out of bounds/i);
    expect(mockDispatch).not.toHaveBeenCalled();
  });

  it('nonexistent piece → error', async () => {
    const { tools } = await import('../seamTools');
    const tool = tools.find(t => t.name === 'setCornerType');
    expect(tool).toBeDefined();

    const getState = mockState([]);

    const result = await tool!.execute(
      { pieceId: 'no-such-piece', vertexIndex: 0, cornerType: 'mitered' },
      mockDispatch,
      getState,
    );

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/not found/i);
    expect(mockDispatch).not.toHaveBeenCalled();
  });
});

// ─── setAllCorners ────────────────────────────────────────────────────────────

describe('setAllCorners copilot tool', () => {
  let mockDispatch: AppDispatch;

  beforeEach(() => {
    mockDispatch = vi.fn() as unknown as AppDispatch;
  });

  it('sets defaultCornerType and clears cornerTypes overrides', async () => {
    const { tools } = await import('../seamTools');
    const tool = tools.find(t => t.name === 'setAllCorners');
    expect(tool).toBeDefined();

    const piece = makePiece({
      defaultCornerType: 'mitered',
      cornerTypes: { 0: 'envelope', 2: 'squared' },
    });
    const getState = mockState([piece]);

    const result = await tool!.execute(
      { pieceId: 'piece-1', cornerType: 'doubleMitered' },
      mockDispatch,
      getState,
    );

    expect(result.success).toBe(true);
    expect(result.data).toMatchObject({
      pieceId: 'piece-1',
      cornerType: 'doubleMitered',
    });
    expect(mockDispatch).toHaveBeenCalledOnce();

    const dispatched = (mockDispatch as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(dispatched.payload.defaultCornerType).toBe('doubleMitered');
    // Per-vertex overrides must be cleared
    expect(dispatched.payload.cornerTypes).toEqual({});
  });

  it('nonexistent piece → error', async () => {
    const { tools } = await import('../seamTools');
    const tool = tools.find(t => t.name === 'setAllCorners');
    expect(tool).toBeDefined();

    const getState = mockState([]);

    const result = await tool!.execute(
      { pieceId: 'ghost-piece', cornerType: 'slant' },
      mockDispatch,
      getState,
    );

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/not found/i);
    expect(mockDispatch).not.toHaveBeenCalled();
  });
});
