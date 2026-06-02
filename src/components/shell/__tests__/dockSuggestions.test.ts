import { describe, it, expect } from 'vitest';
import { getDockSuggestions } from '../dockSuggestions';
import type { WorkflowStage } from '../../../store/selectors';

const ids = (stage: WorkflowStage, side: 'left' | 'right') => getDockSuggestions(stage, side).map(s => s.id);

describe('getDockSuggestions (wired-only map)', () => {
  it('empty → nothing on either side', () => {
    expect(ids('empty', 'left')).toEqual([]);
    expect(ids('empty', 'right')).toEqual([]);
  });
  it('drafted → grade left, nothing right', () => {
    expect(ids('drafted', 'left')).toEqual(['grade']);
    expect(ids('drafted', 'right')).toEqual([]);
  });
  it('sewn → grade left, fitmap right', () => {
    expect(ids('sewn', 'left')).toEqual(['grade']);
    expect(ids('sewn', 'right')).toEqual(['fitmap']);
  });
  it('simulating → grade left, nothing right', () => {
    expect(ids('simulating', 'left')).toEqual(['grade']);
    expect(ids('simulating', 'right')).toEqual([]);
  });
  it('simulated → export left, bom right', () => {
    expect(ids('simulated', 'left')).toEqual(['export']);
    expect(ids('simulated', 'right')).toEqual(['bom']);
  });
});
