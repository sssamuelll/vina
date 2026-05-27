import { describe, it, expect, vi } from 'vitest';
import type { RootState, AppDispatch } from '../../../../../store';

function mockState(overrides: {
  pieceFabrics?: Record<string, string>;
  defaultFabricId?: string;
  pieceTints?: Record<string, string>;
  pieces?: Array<{ id: string; name: string; fabricId?: string }>;
}): () => RootState {
  return () => ({
    simulation: {
      pieceFabrics: overrides.pieceFabrics ?? {},
      defaultFabricId: overrides.defaultFabricId ?? 'cotton-poplin',
      pieceTints: overrides.pieceTints ?? {},
    },
    project: {
      pieces: overrides.pieces ?? [],
    },
  }) as unknown as RootState;
}

describe('assignFabric tool', () => {
  it('assigns fabric to piece and provides rollback', async () => {
    const { tools } = await import('../fabricTools');
    const assignTool = tools.find((t: { name: string }) => t.name === 'assignFabric');
    expect(assignTool).toBeDefined();

    const mockDispatch = vi.fn() as unknown as AppDispatch;
    const getState = mockState({
      pieceFabrics: { 'piece-1': 'cotton-poplin' },
      pieces: [{ id: 'piece-1', name: 'Bodice Front' }],
    });

    const result = await assignTool!.execute(
      { pieceId: 'piece-1', fabricId: 'denim-12oz' },
      mockDispatch,
      getState,
    );

    expect(result.success).toBe(true);
    expect(mockDispatch).toHaveBeenCalled();
    expect(result.rollback).toBeInstanceOf(Function);
  });

  it('returns error for unknown fabric', async () => {
    const { tools } = await import('../fabricTools');
    const assignTool = tools.find((t: { name: string }) => t.name === 'assignFabric');

    const mockDispatch = vi.fn() as unknown as AppDispatch;
    const getState = mockState({
      pieces: [{ id: 'piece-1', name: 'Test' }],
    });

    const result = await assignTool!.execute(
      { pieceId: 'piece-1', fabricId: 'nonexistent-fabric' },
      mockDispatch,
      getState,
    );

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/not found/i);
  });

  it('returns error for unknown piece', async () => {
    const { tools } = await import('../fabricTools');
    const assignTool = tools.find((t: { name: string }) => t.name === 'assignFabric');

    const mockDispatch = vi.fn() as unknown as AppDispatch;
    const getState = mockState({ pieces: [] });

    const result = await assignTool!.execute(
      { pieceId: 'unknown-piece', fabricId: 'denim-12oz' },
      mockDispatch,
      getState,
    );

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/not found/i);
  });

  it('rollback restores previous fabric', async () => {
    const { tools } = await import('../fabricTools');
    const assignTool = tools.find((t: { name: string }) => t.name === 'assignFabric');

    const mockDispatch = vi.fn() as unknown as AppDispatch;
    const getState = mockState({
      pieceFabrics: { 'piece-1': 'cotton-poplin' },
      pieceTints: { 'piece-1': '#ff0000' },
      pieces: [{ id: 'piece-1', name: 'Bodice Front' }],
    });

    const result = await assignTool!.execute(
      { pieceId: 'piece-1', fabricId: 'denim-12oz', tint: '#0000ff' },
      mockDispatch,
      getState,
    );

    expect(result.success).toBe(true);
    expect(result.rollback).toBeInstanceOf(Function);

    // Execute rollback
    (mockDispatch as unknown as ReturnType<typeof vi.fn>).mockClear();
    result.rollback!();

    // Should dispatch to restore previous fabric
    expect(mockDispatch).toHaveBeenCalled();
  });

  it("pieceId='default' sets the default fabric (consolidation of legacy setFabric tool)", async () => {
    const { tools } = await import('../fabricTools');
    const assignTool = tools.find((t: { name: string }) => t.name === 'assignFabric');

    const mockDispatch = vi.fn() as unknown as AppDispatch;
    const getState = mockState({
      defaultFabricId: 'cotton-poplin',
      pieces: [],
    });

    const result = await assignTool!.execute(
      { pieceId: 'default', fabricId: 'denim-12oz' },
      mockDispatch,
      getState,
    );

    expect(result.success).toBe(true);
    expect((result.data as { pieceId: string }).pieceId).toBe('default');
    expect((result.data as { previousFabricId: string }).previousFabricId).toBe('cotton-poplin');
    expect(mockDispatch).toHaveBeenCalled();
    expect(result.rollback).toBeInstanceOf(Function);
  });

  it("pieceId='default' rollback restores previous defaultFabricId", async () => {
    const { tools } = await import('../fabricTools');
    const assignTool = tools.find((t: { name: string }) => t.name === 'assignFabric');

    const mockDispatch = vi.fn() as unknown as AppDispatch;
    const getState = mockState({
      defaultFabricId: 'wool-crepe-200gsm',
      pieces: [],
    });

    const result = await assignTool!.execute(
      { pieceId: 'default', fabricId: 'denim-12oz' },
      mockDispatch,
      getState,
    );

    expect(result.success).toBe(true);

    (mockDispatch as unknown as ReturnType<typeof vi.fn>).mockClear();
    result.rollback!();

    expect(mockDispatch).toHaveBeenCalledTimes(1);
  });
});
