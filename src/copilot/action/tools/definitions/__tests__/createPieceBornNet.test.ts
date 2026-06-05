/**
 * Hallazgo #2 (María) — copilot-created pieces are born NET.
 *
 * Same invariant as the drawing tools: seam allowance is an explicit
 * finishing step, never a birth value. When the agent does not pass
 * `seamAllowance`, the piece must land with 0 — not a silent 10mm.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { RootState, AppDispatch } from '../../../../../store';

function mockState(): () => RootState {
  return () =>
    ({
      project: { pieces: [], seams: [] },
    }) as unknown as RootState;
}

const SQUARE = [
  { type: 'M', values: [0, 0] },
  { type: 'L', values: [100, 0] },
  { type: 'L', values: [100, 100] },
  { type: 'L', values: [0, 100] },
  { type: 'Z', values: [] },
];

describe('copilot piece creation is born NET (hallazgo #2)', () => {
  let mockDispatch: AppDispatch;

  beforeEach(() => {
    mockDispatch = vi.fn() as unknown as AppDispatch;
  });

  it('createPiece without seamAllowance param → piece lands with SA 0', async () => {
    const { tools } = await import('../pieceTools');
    const tool = tools.find(t => t.name === 'createPiece');
    expect(tool).toBeDefined();

    const result = await tool!.execute(
      { name: 'Test Piece', outline: SQUARE },
      mockDispatch,
      mockState(),
    );

    expect(result.success).toBe(true);
    const dispatched = (mockDispatch as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(dispatched.payload.seamAllowance).toBe(0);
  });

  it('createPiece with EXPLICIT seamAllowance → user value wins', async () => {
    const { tools } = await import('../pieceTools');
    const tool = tools.find(t => t.name === 'createPiece');

    const result = await tool!.execute(
      { name: 'Test Piece', outline: SQUARE, seamAllowance: 15 },
      mockDispatch,
      mockState(),
    );

    expect(result.success).toBe(true);
    const dispatched = (mockDispatch as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(dispatched.payload.seamAllowance).toBe(15);
  });

  it('quickRectangle → piece lands with SA 0', async () => {
    const { tools } = await import('../uiBridgeTools');
    const tool = tools.find(t => t.name === 'quickRectangle');
    expect(tool).toBeDefined();

    const result = await tool!.execute(
      { name: 'Rect', width: 100, height: 100 },
      mockDispatch,
      mockState(),
    );

    expect(result.success).toBe(true);
    const addPieceCall = (mockDispatch as ReturnType<typeof vi.fn>).mock.calls
      .map(c => c[0])
      .find(a => a?.type === 'project/addPiece');
    expect(addPieceCall).toBeDefined();
    expect(addPieceCall.payload.seamAllowance).toBe(0);
  });
});
