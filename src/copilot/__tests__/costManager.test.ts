import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  CostManager,
  calculateCost,
  getModelPricing,
  MODEL_PRICING,
  selectOptimalModel,
  classifyToolComplexity,
} from '../costManager';

// Mock localStorage
const localStorageMock = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: vi.fn((key: string) => store[key] || null),
    setItem: vi.fn((key: string, value: string) => { store[key] = value; }),
    removeItem: vi.fn((key: string) => { delete store[key]; }),
    clear: vi.fn(() => { store = {}; }),
    get length() { return Object.keys(store).length; },
    key: vi.fn((i: number) => Object.keys(store)[i] || null),
  };
})();

Object.defineProperty(globalThis, 'localStorage', { value: localStorageMock });

describe('MODEL_PRICING', () => {
  it('should have pricing for Anthropic models', () => {
    expect(MODEL_PRICING['claude-sonnet-4-20250514']).toBeDefined();
    expect(MODEL_PRICING['claude-opus-4-20250514']).toBeDefined();
    expect(MODEL_PRICING['claude-3-5-haiku-20241022']).toBeDefined();
  });

  it('should have pricing for OpenAI models', () => {
    expect(MODEL_PRICING['gpt-4o']).toBeDefined();
    expect(MODEL_PRICING['gpt-4o-mini']).toBeDefined();
  });

  it('should have zero pricing for Ollama models', () => {
    expect(MODEL_PRICING['llama3'].inputPer1M).toBe(0);
    expect(MODEL_PRICING['llama3'].outputPer1M).toBe(0);
    expect(MODEL_PRICING['mistral'].inputPer1M).toBe(0);
  });

  it('should have Sonnet cheaper than Opus', () => {
    const sonnet = MODEL_PRICING['claude-sonnet-4-20250514'];
    const opus = MODEL_PRICING['claude-opus-4-20250514'];
    expect(sonnet.inputPer1M).toBeLessThan(opus.inputPer1M);
    expect(sonnet.outputPer1M).toBeLessThan(opus.outputPer1M);
  });
});

describe('getModelPricing', () => {
  it('should return pricing for known models', () => {
    const pricing = getModelPricing('claude-sonnet-4-20250514');
    expect(pricing.inputPer1M).toBe(3.00);
    expect(pricing.outputPer1M).toBe(15.00);
  });

  it('should return zero for unknown models', () => {
    const pricing = getModelPricing('unknown-model');
    expect(pricing.inputPer1M).toBe(0);
    expect(pricing.outputPer1M).toBe(0);
  });
});

describe('calculateCost', () => {
  it('should calculate cost for Sonnet', () => {
    // 1000 input + 500 output
    const cost = calculateCost('claude-sonnet-4-20250514', 1000, 500);
    // (1000 * 3.00 + 500 * 15.00) / 1_000_000 = (3000 + 7500) / 1M = 0.0105
    expect(cost).toBeCloseTo(0.0105, 4);
  });

  it('should calculate cost for GPT-4o-mini', () => {
    const cost = calculateCost('gpt-4o-mini', 10000, 2000);
    // (10000 * 0.15 + 2000 * 0.60) / 1M = (1500 + 1200) / 1M = 0.0027
    expect(cost).toBeCloseTo(0.0027, 4);
  });

  it('should return 0 for Ollama models', () => {
    const cost = calculateCost('llama3', 50000, 10000);
    expect(cost).toBe(0);
  });

  it('should return 0 for zero tokens', () => {
    const cost = calculateCost('claude-sonnet-4-20250514', 0, 0);
    expect(cost).toBe(0);
  });
});

describe('CostManager', () => {
  let manager: CostManager;

  beforeEach(() => {
    localStorageMock.clear();
    manager = new CostManager('test-project');
  });

  it('should start with zero session cost', () => {
    const cost = manager.getSessionCost();
    expect(cost.tokens).toBe(0);
    expect(cost.estimatedCost).toBe(0);
    expect(cost.calls).toBe(0);
  });

  it('should track usage', () => {
    manager.trackUsage('anthropic', 1000, 500, 'claude-sonnet-4-20250514');
    const cost = manager.getSessionCost();
    expect(cost.tokens).toBe(1500);
    expect(cost.inputTokens).toBe(1000);
    expect(cost.outputTokens).toBe(500);
    expect(cost.calls).toBe(1);
    expect(cost.estimatedCost).toBeGreaterThan(0);
  });

  it('should accumulate multiple usage records', () => {
    manager.trackUsage('anthropic', 1000, 500, 'claude-sonnet-4-20250514');
    manager.trackUsage('anthropic', 2000, 800, 'claude-sonnet-4-20250514');
    const cost = manager.getSessionCost();
    expect(cost.tokens).toBe(4300);
    expect(cost.calls).toBe(2);
  });

  it('should track project cost separately from session', () => {
    manager.trackUsage('openai', 5000, 1000, 'gpt-4o-mini');
    const session = manager.getSessionCost();
    const project = manager.getProjectCost();
    expect(session.tokens).toBe(project.tokens);
  });

  it('should format session cost', () => {
    manager.trackUsage('anthropic', 10000, 5000, 'claude-sonnet-4-20250514');
    const formatted = manager.formatSessionCost();
    expect(formatted).toMatch(/~\$\d+\.\d+ this session/);
  });

  it('should return empty string for zero-cost session', () => {
    expect(manager.formatSessionCost()).toBe('');
  });

  it('should reset session', () => {
    manager.trackUsage('anthropic', 1000, 500, 'claude-sonnet-4-20250514');
    manager.resetSession();
    expect(manager.getSessionCost().calls).toBe(0);
    // Project cost should still be there
    expect(manager.getProjectCost().calls).toBe(1);
  });

  it('should get and set budget', () => {
    expect(manager.getBudget()).toBe(5.00); // default
    manager.setBudget(10.00);
    expect(manager.getBudget()).toBe(10.00);
  });

  it('should warn when approaching budget', () => {
    manager.setBudget(0.01); // Very low budget
    manager.trackUsage('anthropic', 100000, 50000, 'claude-sonnet-4-20250514');
    expect(manager.shouldWarn()).toBe(true);
  });

  it('should not warn when within budget', () => {
    manager.setBudget(100); // High budget
    manager.trackUsage('anthropic', 100, 50, 'claude-sonnet-4-20250514');
    expect(manager.shouldWarn()).toBe(false);
  });

  it('should return budget warning message when exceeded', () => {
    manager.setBudget(0.001);
    manager.trackUsage('anthropic', 100000, 50000, 'claude-sonnet-4-20250514');
    const warning = manager.getBudgetWarning();
    expect(warning).toContain('budget');
  });

  it('should return empty warning when within budget', () => {
    manager.setBudget(1000);
    manager.trackUsage('anthropic', 100, 50, 'claude-sonnet-4-20250514');
    expect(manager.getBudgetWarning()).toBe('');
  });

  it('should clear project usage', () => {
    manager.trackUsage('anthropic', 1000, 500, 'claude-sonnet-4-20250514');
    manager.clearProjectUsage();
    expect(manager.getProjectCost().calls).toBe(0);
    expect(manager.getSessionCost().calls).toBe(0);
  });

  it('should persist project usage to localStorage', () => {
    manager.trackUsage('anthropic', 1000, 500, 'claude-sonnet-4-20250514');

    // Create new manager for same project — should load persisted data
    const manager2 = new CostManager('test-project');
    const cost = manager2.getProjectCost();
    expect(cost.calls).toBe(1);
    expect(cost.tokens).toBe(1500);
  });
});

describe('selectOptimalModel', () => {
  it('should select cheap model for simple queries', () => {
    const model = selectOptimalModel('list fabrics', 'anthropic', 'claude-sonnet-4-20250514');
    expect(model).toBe('claude-3-5-haiku-20241022');
  });

  it('should select cheap model for "show" queries', () => {
    const model = selectOptimalModel('show measurements', 'openai', 'gpt-4o');
    expect(model).toBe('gpt-4o-mini');
  });

  it('should select default model for complex queries', () => {
    const model = selectOptimalModel('generate a bodice from description', 'anthropic', 'claude-sonnet-4-20250514');
    expect(model).toBe('claude-sonnet-4-20250514');
  });

  it('should select default model for creation', () => {
    const model = selectOptimalModel('crear un corpiño talla 40', 'anthropic', 'claude-sonnet-4-20250514');
    expect(model).toBe('claude-sonnet-4-20250514');
  });

  it('should return default for ambiguous messages', () => {
    const model = selectOptimalModel('help me with my pattern', 'anthropic', 'claude-opus-4-20250514');
    expect(model).toBe('claude-opus-4-20250514');
  });

  it('should keep default model for ollama', () => {
    const model = selectOptimalModel('list stuff', 'ollama', 'llama3');
    expect(model).toBe('llama3');
  });
});

describe('classifyToolComplexity', () => {
  it('should classify listFabrics as simple', () => {
    expect(classifyToolComplexity('listFabrics')).toBe('simple');
  });

  it('should classify getMeasurements as simple', () => {
    expect(classifyToolComplexity('getMeasurements')).toBe('simple');
  });

  it('should classify generateFromDescription as complex', () => {
    expect(classifyToolComplexity('generateFromDescription')).toBe('complex');
  });

  it('should classify createPiece as complex', () => {
    expect(classifyToolComplexity('createPiece')).toBe('complex');
  });

  it('should classify unknown tools as normal', () => {
    expect(classifyToolComplexity('someRandomTool')).toBe('normal');
  });
});
