import { describe, it, expect, beforeEach } from 'vitest';
import { PlannerMiddleware } from '../middleware/PlannerMiddleware';
import { ExecutionRecorder } from '../ExecutionRecorder';
import { Planner } from '../../reasoning/bridge/Planner';
import type { IPlanner } from '../../reasoning/bridge/types';

describe('PlannerMiddleware', () => {
  let recorder: ExecutionRecorder;
  let innerPlanner: Planner;
  let middleware: PlannerMiddleware;

  beforeEach(() => {
    recorder = new ExecutionRecorder();
    innerPlanner = new Planner();
    middleware = new PlannerMiddleware(innerPlanner, recorder);
  });

  it('delegates buildSystemPrompt to inner planner', () => {
    const tools = [{ name: 'modifyEdge', description: 'Modify', parameters: { type: 'object', properties: {} } }];
    const prompt = middleware.buildSystemPrompt(tools);
    expect(prompt).toContain('modifyEdge');
  });

  it('records system prompt and tool names on buildSystemPrompt', () => {
    recorder.start('test');
    const tools = [
      { name: 'modifyEdge', description: 'Modify', parameters: { type: 'object', properties: {} } },
      { name: 'measureEdge', description: 'Measure', parameters: { type: 'object', properties: {} } },
    ];
    middleware.buildSystemPrompt(tools);
    recorder.recordPlanningEnd('{}', { intent: 'test', steps: [] });
    const record = recorder.finalize();
    expect(record.planning.toolsProvided).toEqual(['modifyEdge', 'measureEdge']);
    expect(record.planning.systemPrompt).toContain('modifyEdge');
  });

  it('delegates parsePlan to inner planner and records response', () => {
    recorder.start('test');
    recorder.recordPlanningStart('', []);
    const response = '{"intent":"measure","steps":[{"type":"execute","id":"s1","tool":"t","params":{},"label":"L"}]}';
    const plan = middleware.parsePlan(response);
    expect(plan.intent).toBe('measure');
    expect(plan.steps).toHaveLength(1);
    const record = recorder.finalize();
    expect(record.planning.rawResponse).toBe(response);
    expect(record.planning.parsedPlan?.intent).toBe('measure');
    expect(record.planning.duration).toBeGreaterThanOrEqual(0);
  });

  it('records parse error on invalid JSON', () => {
    recorder.start('test');
    recorder.recordPlanningStart('', []);
    expect(() => middleware.parsePlan('not json')).toThrow();
    const record = recorder.finalize();
    expect(record.planning.parseError).toBeDefined();
    expect(record.planning.parsedPlan).toBeNull();
  });

  it('satisfies IPlanner interface', () => {
    const asInterface: IPlanner = middleware;
    expect(asInterface.buildSystemPrompt).toBeDefined();
    expect(asInterface.parsePlan).toBeDefined();
  });
});
