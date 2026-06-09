/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect } from 'vitest';
import projectReducer, { addPiece, addSeam, addPOM, removePieces, batchSetSeamAllowance } from '../projectSlice';

const initialState = projectReducer(undefined, { type: '@@INIT' });

describe('projectSlice batch operations', () => {
  it('removePieces deletes multiple pieces and cascades to seams and POMs', () => {
    // 1. Setup state with 3 pieces, 1 seam, and 1 POM
    let state = projectReducer(initialState, addPiece({ id: 'p1', name: 'P1', outline: [], internals: [] } as any));
    state = projectReducer(state, addPiece({ id: 'p2', name: 'P2', outline: [], internals: [] } as any));
    state = projectReducer(state, addPiece({ id: 'p3', name: 'P3', outline: [], internals: [] } as any));

    state = projectReducer(state, addSeam({
      id: 's1',
      pieceA: { pieceId: 'p1', edgeName: 'e1' },
      pieceB: { pieceId: 'p2', edgeName: 'e1' },
      type: 'plain'
    } as any));

    state = projectReducer(state, addPOM({
      id: 'pom1',
      name: 'M1',
      pointA: { pieceId: 'p1', localPosition: { x: 0, y: 0 } },
      pointB: { pieceId: 'p3', localPosition: { x: 0, y: 0 } },
    } as any));

    expect(state.pieces).toHaveLength(3);
    expect(state.seams).toHaveLength(1);
    expect(state.poms).toHaveLength(1);

    // 2. Remove p1 and p2
    state = projectReducer(state, removePieces(['p1', 'p2']));

    // 3. Verify cascades
    expect(state.pieces).toHaveLength(1);
    expect(state.pieces[0].id).toBe('p3');

    // Seam s1 should be gone because it referenced p1 and p2
    expect(state.seams).toHaveLength(0);

    // POM pom1 should be gone because it referenced p1
    expect(state.poms).toHaveLength(0);
  });

  it('batchSetSeamAllowance applies width to listed pieces only, clamps negatives, marks dirty', () => {
    let state = projectReducer(initialState, addPiece({ id: 'p1', name: 'P1', outline: [], internals: [], seamAllowance: 0 } as any));
    state = projectReducer(state, addPiece({ id: 'p2', name: 'P2', outline: [], internals: [], seamAllowance: 0 } as any));
    state = projectReducer(state, addPiece({ id: 'p3', name: 'P3', outline: [], internals: [], seamAllowance: 5 } as any));

    // Apply 9.5 to p1 and p2 only — p3 is left untouched.
    state = projectReducer(state, batchSetSeamAllowance({ pieceIds: ['p1', 'p2'], width: 9.5 }));
    expect(state.pieces.find(p => p.id === 'p1')!.seamAllowance).toBe(9.5);
    expect(state.pieces.find(p => p.id === 'p2')!.seamAllowance).toBe(9.5);
    expect(state.pieces.find(p => p.id === 'p3')!.seamAllowance).toBe(5);
    expect(state.isDirty).toBe(true);

    // Negative widths clamp to 0 (Math.max(0, width)).
    state = projectReducer(state, batchSetSeamAllowance({ pieceIds: ['p1'], width: -3 }));
    expect(state.pieces.find(p => p.id === 'p1')!.seamAllowance).toBe(0);
  });
});
