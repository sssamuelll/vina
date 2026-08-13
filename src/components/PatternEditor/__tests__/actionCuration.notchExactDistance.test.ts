import { describe, expect, it, vi } from 'vitest';
import type { AppDispatch } from '../../../store';
import type { InternalLine, PatternPiece } from '../../../types/types';
import {
  ACTIONS,
  resolveMenuActions,
  type CurationCtx,
} from '../actionCuration';

const anchoredNotch: InternalLine = {
  id: 'notch-1',
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

function pieceWith(line: InternalLine): PatternPiece {
  return {
    id: 'piece-1',
    name: 'Delantero',
    position: { x: 0, y: 0 },
    rotation: 0,
    mirrored: false,
    active: true,
    locked: false,
    seamAllowance: 0,
    outline: [],
    internals: [line],
    edges: [],
  } as unknown as PatternPiece;
}

function notchCtx(line: InternalLine, onRefineNotch = vi.fn()): CurationCtx {
  const piece = pieceWith(line);
  return {
    dispatch: vi.fn() as unknown as AppDispatch,
    targetKind: 'il.notch',
    stage: 'drafted',
    altitude: 'body',
    pieceId: piece.id,
    piece,
    selectedPieceIds: [piece.id],
    seamId: null,
    seam: null,
    internalLineId: line.id,
    internalLineType: line.type,
    internalLine: line,
    clipboard: null,
    groups: [],
    pieces: [piece],
    cb: { onRefineNotch },
    onClose: vi.fn(),
  };
}

describe('curación del piquete existente', () => {
  it('ofrece ajustar distancia solo cuando la línea conserva su ancla', () => {
    const anchoredIds = resolveMenuActions(notchCtx(anchoredNotch)).map(action => action.id);
    const anchorlessIds = resolveMenuActions(notchCtx({
      ...anchoredNotch,
      notchAnchor: undefined,
    })).map(action => action.id);
    const grainline = { ...anchoredNotch, type: 'grainline' as const };
    const grainlineCtx = notchCtx(grainline);
    grainlineCtx.targetKind = 'il.grainline';
    const grainlineIds = resolveMenuActions(grainlineCtx).map(action => action.id);

    expect(anchoredIds).toContain('notchExactDistance');
    expect(anchorlessIds).not.toContain('notchExactDistance');
    expect(grainlineIds).not.toContain('notchExactDistance');
  });

  it('abre el refinador con la pieza y la línea exactas del clic derecho', () => {
    const onRefineNotch = vi.fn();
    const ctx = notchCtx(anchoredNotch, onRefineNotch);

    expect(ACTIONS.notchExactDistance.label).toBe('Ajustar distancia…');
    ACTIONS.notchExactDistance.run(ctx);

    expect(onRefineNotch).toHaveBeenCalledOnce();
    expect(onRefineNotch).toHaveBeenCalledWith('piece-1', anchoredNotch);
  });
});
