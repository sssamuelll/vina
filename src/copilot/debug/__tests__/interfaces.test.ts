import { describe, it, expect } from 'vitest';
import type { IPlanner, IReasoner } from '../../reasoning/bridge/types';
import { Planner } from '../../reasoning/bridge/Planner';
import { Reasoner } from '../../reasoning/bridge/Reasoner';

describe('Bridge Interfaces', () => {
  it('Planner satisfies IPlanner', () => {
    const planner = new Planner();
    const asInterface: IPlanner = planner;
    expect(asInterface.buildSystemPrompt).toBeDefined();
    expect(asInterface.parsePlan).toBeDefined();
  });

  it('Reasoner satisfies IReasoner', () => {
    const reasoner = new Reasoner(async () => ({ action: 'abort' as const }));
    const asInterface: IReasoner = reasoner;
    expect(asInterface.analyze).toBeDefined();
  });
});
