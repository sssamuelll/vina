import { describe, it, expect } from 'vitest';
import { verifyGarmentTool } from '../verifyGarment';
import type { RootState } from '../../../../../store';
import type { PatternPiece, Seam } from '../../../../../types/types';

function rectOutline(w: number, h: number): PatternPiece['outline'] {
  return [
    { type: 'M', values: [0, 0] },
    { type: 'L', values: [w, 0] },
    { type: 'L', values: [w, h] },
    { type: 'L', values: [0, h] },
    { type: 'Z', values: [] },
  ];
}

function piece(id: string, name: string, w: number, h: number, sa = 10): PatternPiece {
  return {
    id,
    name,
    outline: rectOutline(w, h),
    internals: [{ id: `g-${id}`, type: 'grainline', path: [{ type: 'M', values: [0, 0] }, { type: 'L', values: [0, h] }] }],
    position: { x: 0, y: 0 },
    rotation: 0,
    mirrored: false,
    seamAllowance: sa,
    active: true,
    createdAt: 1,
    updatedAt: 1,
  } as PatternPiece;
}

function mockState(pieces: PatternPiece[], seams: Seam[]): () => RootState {
  return () => ({ project: { pieces, seams } }) as unknown as RootState;
}

function seam(id: string, a: string, b: string): Seam {
  return { id, pieceA: { pieceId: a }, pieceB: { pieceId: b } } as unknown as Seam;
}

describe('verifyGarment meta-tool', () => {
  it('reports ok for matched, well-formed pieces', async () => {
    const pieces = [piece('a', 'Front', 100, 200), piece('b', 'Back', 100, 200)];
    const result = await verifyGarmentTool.execute({}, mockState(pieces, [seam('s1', 'a', 'b')]));
    expect(result.success).toBe(true);
    expect(result.data?.verdict).toBe('ok');
    expect(result.data?.seamMismatchCount).toBe(0);
  });

  it('flags seam-length mismatch (the fallen-pants root cause) as a warning', async () => {
    // Wildly different perimeters → mismatch well above the 8% tolerance.
    const pieces = [piece('a', 'Front', 100, 200), piece('b', 'Back', 100, 600)];
    const result = await verifyGarmentTool.execute({}, mockState(pieces, [seam('s1', 'a', 'b')]));
    expect(result.success).toBe(true);
    expect(result.data?.verdict).not.toBe('ok');
    expect(result.data?.seamMismatchCount as number).toBeGreaterThan(0);
    expect(result.data?.summary as string).toMatch(/desajuste/);
  });

  it('flags missing seam allowance as an error verdict', async () => {
    const pieces = [piece('a', 'Front', 100, 200, 0)]; // sa = 0
    const result = await verifyGarmentTool.execute({}, mockState(pieces, []));
    expect(result.data?.verdict).toBe('has-errors');
    expect(result.data?.errorCount as number).toBeGreaterThan(0);
  });

  it('handles an empty project without throwing', async () => {
    const result = await verifyGarmentTool.execute({}, mockState([], []));
    expect(result.success).toBe(true);
    expect(result.data?.pieceCount).toBe(0);
    expect(result.data?.summary as string).toMatch(/No hay piezas/);
  });
});
