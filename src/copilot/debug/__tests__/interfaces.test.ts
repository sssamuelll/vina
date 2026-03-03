import { describe, it, expect } from 'vitest';
import type { IPlanner } from '../../reasoning/bridge/types';
import { Planner } from '../../reasoning/bridge/Planner';

describe('Bridge Interfaces', () => {
  it('Planner satisfies IPlanner', () => {
    const planner = new Planner();
    const asInterface: IPlanner = planner;
    expect(asInterface.buildSystemPrompt).toBeDefined();
    expect(asInterface.parsePlan).toBeDefined();
  });

  // Reasoner test removed — Reasoner class inlined into ExecutionBridge (Task 6)
  // and will be deleted entirely in Task 7.
});
