/** El menú sobre un tramo de interna en Q convierte ESE tramo (spec 2026-09-24 § 4.4). */
import { describe, it, expect, vi } from 'vitest';
import type { PatternPiece } from '../../../types/types';
import { resolveMenuActions, type CurationCtx } from '../actionCuration';

const pieza = {
  id: 'p', name: 'P', position: { x: 0, y: 0 }, rotation: 0, mirrored: false, active: true, seamAllowance: 0, edges: [],
  outline: [{ type: 'M', values: [0, 0] }, { type: 'L', values: [200, 0] }, { type: 'L', values: [200, 150] }, { type: 'Z', values: [] }],
  internals: [{ id: 'L', type: 'reference', path: [{ type: 'M', values: [20, 20] }, { type: 'L', values: [120, 20] }] }],
} as unknown as PatternPiece;

function ctx(cb: CurationCtx['cb']): CurationCtx {
  return {
    dispatch: vi.fn(), targetKind: 'point.segment', stage: 'drafted', altitude: 'point',
    pieceId: 'p', piece: pieza, selectedPieceIds: ['p'], seamId: null, seam: null,
    internalLineId: null, internalLineType: null, internalLine: null,
    segmentIndex: 1, segmentIsCurve: false, segmentLineId: 'L',
    clipboard: null, groups: [], pieces: [pieza], cb, onClose: vi.fn(),
  } as unknown as CurationCtx;
}

describe('convertir un tramo de interna desde el menú', () => {
  it('los verbos llevan la línea', () => {
    const cb = { onConvertSegment: vi.fn(), onConvertSegmentToPoints: vi.fn() };
    const c = ctx(cb);
    const defs = resolveMenuActions(c);
    defs.find(d => d.id === 'convertSegment')!.run(c);
    defs.find(d => d.id === 'convertSegmentToPoints')!.run(c);
    expect(cb.onConvertSegment).toHaveBeenCalledWith(1, true, 'p', 'L');
    expect(cb.onConvertSegmentToPoints).toHaveBeenCalledWith(1, 'p', 'L');
  });
});
