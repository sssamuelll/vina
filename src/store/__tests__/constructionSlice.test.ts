import { describe, it, expect } from 'vitest';
import reducer, {
  addPoint,
  removePoint,
  resolveAll,
} from '../constructionSlice';
import type { ConstructionState } from '../../types/construction';

const emptyState: ConstructionState = {
  points: [],
  lines: [],
  curves: [],
  pieces: [],
  variables: {},
  selectedEntity: null,
  showConstruction: true,
  pieceIdentityMap: {},
};

function addAndGetState(
  state: ConstructionState,
  payload: Parameters<typeof addPoint>[0]['payload'],
): ConstructionState {
  return reducer(state, addPoint(payload));
}

describe('constructionSlice', () => {
  describe('addPoint — resolution errors', () => {
    it('sets no resolutionError for valid manual point', () => {
      const state = addAndGetState(emptyState, {
        label: 'A',
        definition: { type: 'manual', x: 100, y: 200 },
      });
      expect(state.points[0].resolutionError).toBeUndefined();
      expect(state.points[0].x).toBe(100);
      expect(state.points[0].y).toBe(200);
    });

    it('sets no resolutionError for valid absolute point with numeric values', () => {
      const state = addAndGetState(emptyState, {
        label: 'B',
        definition: { type: 'absolute', x: 50, y: 75 },
      });
      expect(state.points[0].resolutionError).toBeUndefined();
      expect(state.points[0].x).toBe(50);
    });

    it('sets resolutionError for absolute point with string formula', () => {
      const state = addAndGetState(emptyState, {
        label: 'C',
        definition: { type: 'absolute', x: 'bust_circ / 4', y: 100 },
      });
      expect(state.points[0].resolutionError).toMatch(/formula.*parametric resolution/i);
      expect(state.points[0].x).toBe(0);
    });

    it('sets resolutionError for endLine with missing basePoint', () => {
      const state = addAndGetState(emptyState, {
        label: 'D',
        definition: { type: 'endLine', basePoint: 'nonexistent', angle: 90, length: 50 },
      });
      expect(state.points[0].resolutionError).toMatch(/nonexistent/);
      expect(state.points[0].x).toBe(0);
      expect(state.points[0].y).toBe(0);
    });

    it('sets resolutionError for alongLine with missing from point', () => {
      const state = addAndGetState(emptyState, {
        label: 'E',
        definition: { type: 'alongLine', from: 'missing', to: 'also_missing', length: 30 },
      });
      expect(state.points[0].resolutionError).toMatch(/missing/);
    });

    it('sets resolutionError for midpoint with missing refs', () => {
      const state = addAndGetState(emptyState, {
        label: 'F',
        definition: { type: 'midpoint', from: 'gone1', to: 'gone2' },
      });
      expect(state.points[0].resolutionError).toMatch(/gone1|gone2/);
    });

    it('sets resolutionError for intersectionXY with one missing ref', () => {
      let state = addAndGetState(emptyState, {
        label: 'Origin',
        definition: { type: 'manual', x: 100, y: 200 },
      });
      state = addAndGetState(state, {
        label: 'G',
        definition: { type: 'intersectionXY', xFrom: 'Origin', yFrom: 'nowhere' },
      });
      expect(state.points[1].resolutionError).toMatch(/nowhere/);
    });

    it('sets resolutionError for intersection with missing points', () => {
      const state = addAndGetState(emptyState, {
        label: 'H',
        definition: {
          type: 'intersection',
          line1Start: 'a', line1End: 'b',
          line2Start: 'c', line2End: 'd',
        },
      });
      expect(state.points[0].resolutionError).toBeDefined();
    });

    it('sets resolutionError for normal with missing from', () => {
      const state = addAndGetState(emptyState, {
        label: 'I',
        definition: { type: 'normal', from: 'nope', to: 'nope2', angle: 90, length: 20 },
      });
      expect(state.points[0].resolutionError).toMatch(/nope/);
    });
  });
});
