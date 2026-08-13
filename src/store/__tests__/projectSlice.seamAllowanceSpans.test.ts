import { describe, expect, it } from 'vitest';
import projectReducer, {
  addEdgeSeamAllowanceSpan,
  addPiece,
} from '../projectSlice';
import type { PatternPiece, SemanticEdge } from '../../types/types';

const edge: SemanticEdge = {
  id: 'p:top',
  name: 'top',
  segmentRange: [1, 2],
  edgeType: 'seam',
};

const piece = {
  id: 'p',
  name: 'Pieza',
  outline: [
    { type: 'M', values: [0, 0] },
    { type: 'L', values: [100, 0] },
    { type: 'L', values: [100, 100] },
    { type: 'Z', values: [] },
  ],
  internals: [],
  edges: [edge],
  position: { x: 0, y: 0 },
  rotation: 0,
  mirrored: false,
  seamAllowance: 0,
  active: true,
} as unknown as PatternPiece;

describe('projectSlice — tramos de margen', () => {
  it('escribe un tramo sobre el borde indicado', () => {
    let state = projectReducer(undefined, { type: '@@INIT' });
    state = projectReducer(state, addPiece(piece));

    state = projectReducer(state, addEdgeSeamAllowanceSpan({
      pieceId: 'p',
      edgeId: 'p:top',
      span: { tStart: 0.2, tEnd: 0.6, width: 12 },
    }));

    expect(state.pieces[0].edges?.[0].seamAllowanceSpans).toEqual([
      { tStart: 0.2, tEnd: 0.6, width: 12 },
    ]);
    expect(state.isDirty).toBe(true);
  });

  it('la escritura más reciente parte el tramo anterior donde se solapan', () => {
    let state = projectReducer(undefined, { type: '@@INIT' });
    state = projectReducer(state, addPiece({
      ...piece,
      edges: [{ ...edge, seamAllowanceSpans: [{ tStart: 0.1, tEnd: 0.9, width: 8 }] }],
    }));

    state = projectReducer(state, addEdgeSeamAllowanceSpan({
      pieceId: 'p',
      edgeId: 'p:top',
      span: { tStart: 0.4, tEnd: 0.6, width: 15 },
    }));

    expect(state.pieces[0].edges?.[0].seamAllowanceSpans).toEqual([
      { tStart: 0.1, tEnd: 0.4, width: 8 },
      { tStart: 0.4, tEnd: 0.6, width: 15 },
      { tStart: 0.6, tEnd: 0.9, width: 8 },
    ]);
  });
});
