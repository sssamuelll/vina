import { describe, it, expect } from 'vitest';
import { getActionCategory } from '../actionTypes';
import { validateAction } from '../actionValidator';
import type { RootState } from '../../../store';
import type { CopilotAction, LinkPiecesAction, UnlinkPiecesAction } from '../actionTypes';

const mockPiece = (id: string) => ({
  id, name: id, outline: [], internals: [], position: { x: 0, y: 0 },
  rotation: 0, mirrored: false, seamAllowance: 10, createdAt: 0, updatedAt: 0,
});

const mockState = {
  // El RootState real siempre trae `layerLocked` (`projectSlice.ts`, default
  // `{}`); este mock se había quedado atrás y `pieceNotLocked` (#1176
  // seguimiento, guardia nueva en link_pieces/unlink_pieces) lo lee
  // incondicionalmente, como hace el resto del store.
  project: { pieces: [mockPiece('a'), mockPiece('b')], seams: [], fabrics: [], avatar: { measurements: {} }, name: '', id: '', layerLocked: {} },
  editor: { selectedPieceIds: [] },
  simulation: { simulationState: 'idle' },
} as unknown as RootState;

describe('link_pieces action', () => {
  it('has category "piece"', () => {
    const action: LinkPiecesAction = { action: 'link_pieces', pieceIdA: 'a', pieceIdB: 'b', mode: 'symmetry' };
    expect(getActionCategory(action)).toBe('piece');
  });

  it('validates successfully with valid pieces', () => {
    const action: CopilotAction = { action: 'link_pieces', pieceIdA: 'a', pieceIdB: 'b', mode: 'symmetry' } as CopilotAction;
    const result = validateAction(action, mockState);
    expect(result.valid).toBe(true);
  });

  it('fails if piece not found', () => {
    const action: CopilotAction = { action: 'link_pieces', pieceIdA: 'a', pieceIdB: 'missing', mode: 'symmetry' } as CopilotAction;
    const result = validateAction(action, mockState);
    expect(result.valid).toBe(false);
  });
});

describe('unlink_pieces action', () => {
  it('has category "piece"', () => {
    const action: UnlinkPiecesAction = { action: 'unlink_pieces', pieceId: 'a' };
    expect(getActionCategory(action)).toBe('piece');
  });

  it('validates successfully', () => {
    const action: CopilotAction = { action: 'unlink_pieces', pieceId: 'a' } as CopilotAction;
    const result = validateAction(action, mockState);
    expect(result.valid).toBe(true);
  });
});
