import { describe, it, expect } from 'vitest';
import projectReducer, { addPiece, addSeam, addPOM, removePieces } from '../projectSlice';
import { ProjectState } from '../../types/types';

const initialState: ProjectState = {
  projectName: 'Test Project',
  pieces: [],
  seams: [],
  poms: [],
  groups: [],
  layers: [{ id: 0, name: 'Lining' }, { id: 1, name: 'Shell' }],
  layerNames: {},
  arrangementOverrides: {},
  avatar: { measurements: {}, modelUrl: '' },
  isDirty: false,
};

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
});
