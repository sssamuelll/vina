import { describe, it, expect } from 'vitest';
import { Planner, PlannerError } from '../Planner';

describe('Planner', () => {
  it('builds system prompt for JSON-only output', () => {
    const planner = new Planner();
    const prompt = planner.buildSystemPrompt([
      { name: 'measureEdge', description: 'Measure edge length', parameters: { type: 'object', properties: {} } },
    ]);

    expect(prompt).toContain('JSON');
    expect(prompt).toContain('measureEdge');
    expect(prompt).not.toContain('explain');
  });

  it('parses valid execution plan', () => {
    const planner = new Planner();
    const json = JSON.stringify({
      intent: 'reduce_neckline',
      steps: [
        { type: 'execute', id: 's1', tool: 'measureEdge', params: {}, label: 'Measure' },
      ],
    });

    const plan = planner.parsePlan(json);
    expect(plan.intent).toBe('reduce_neckline');
    expect(plan.steps).toHaveLength(1);
  });

  it('extracts JSON from markdown code block', () => {
    const planner = new Planner();
    const response = `Here's the plan:
\`\`\`json
{
  "intent": "test",
  "steps": []
}
\`\`\`
`;
    const plan = planner.parsePlan(response);
    expect(plan.intent).toBe('test');
  });

  it('throws PlannerError for invalid JSON', () => {
    const planner = new Planner();
    expect(() => planner.parsePlan('not json')).toThrow(PlannerError);
  });

  it('throws PlannerError for missing intent', () => {
    const planner = new Planner();
    const json = JSON.stringify({ steps: [] });
    expect(() => planner.parsePlan(json)).toThrow(PlannerError);
  });

  it('throws PlannerError for missing steps', () => {
    const planner = new Planner();
    const json = JSON.stringify({ intent: 'test' });
    expect(() => planner.parsePlan(json)).toThrow(PlannerError);
  });

  it('validates step structure', () => {
    const planner = new Planner();
    const json = JSON.stringify({
      intent: 'test',
      steps: [{ type: 'execute' }], // missing required fields
    });
    expect(() => planner.parsePlan(json)).toThrow(PlannerError);
  });

  it('validates execute step has tool and params', () => {
    const planner = new Planner();
    const json = JSON.stringify({
      intent: 'test',
      steps: [{ type: 'execute', id: 's1', label: 'Test' }], // missing tool, params
    });
    expect(() => planner.parsePlan(json)).toThrow(PlannerError);
  });

  it('validates evaluate step has input and decide', () => {
    const planner = new Planner();
    const json = JSON.stringify({
      intent: 'test',
      steps: [{ type: 'evaluate', id: 's1', label: 'Test' }], // missing input, decide
    });
    expect(() => planner.parsePlan(json)).toThrow(PlannerError);
  });

  it('generates unique IDs if missing', () => {
    const planner = new Planner();
    const json = JSON.stringify({
      intent: 'test',
      steps: [
        { type: 'execute', tool: 'test', params: {}, label: 'Test 1' },
        { type: 'execute', tool: 'test', params: {}, label: 'Test 2' },
      ],
    });
    const plan = planner.parsePlan(json);
    expect(plan.steps[0].id).toBeTruthy();
    expect(plan.steps[1].id).toBeTruthy();
    expect(plan.steps[0].id).not.toBe(plan.steps[1].id);
  });
});
