import { describe, it, expect } from 'vitest';
import { selectWorkflowStage } from '../selectors';
import type { RootState } from '..';

const st = (pieces: number, seams: number, simState: string) => ({
  project: { pieces: Array(pieces).fill({}), seams: Array(seams).fill({}) },
  simulation: { simulationState: simState },
}) as unknown as RootState;

describe('selectWorkflowStage', () => {
  it('empty when no pieces', () => { expect(selectWorkflowStage(st(0, 0, 'idle'))).toBe('empty'); });
  it('drafted with pieces, no seams, idle', () => { expect(selectWorkflowStage(st(2, 0, 'idle'))).toBe('drafted'); });
  it('sewn with seams, idle', () => { expect(selectWorkflowStage(st(2, 1, 'idle'))).toBe('sewn'); });
  it('simulating when running (beats seams)', () => { expect(selectWorkflowStage(st(2, 1, 'running'))).toBe('simulating'); });
  it('simulated when paused (beats seams)', () => { expect(selectWorkflowStage(st(2, 1, 'paused'))).toBe('simulated'); });
});
