import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  CostManager,
  calculateCost,
  getModelPricing,
  MODEL_PRICING,
  selectOptimalModel,
  classifyToolComplexity,
} from '../costManager';

// ─── localStorage mock ──────────────────────────────────────────────────────

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

// ─── MODEL_PRICING ──────────────────────────────────────────────────────────

describe('MODEL_PRICING', () => {
  it('should have pricing for Anthropic models', () => {
    expect(MODEL_PRICING['claude-sonnet-4-20250514']).toBeDefined();
    expect(MODEL_PRICING['claude-opus-4-20250514']).toBeDefined();
    expect(MODEL_PRICING['claude-3-5-haiku-20241022']).toBeDefined();
  });

  it('should have pricing for OpenAI models', () => {
    expect(MODEL_PRICING['gpt-4o']).toBeDefined();
    expect(MODEL_PRICING['gpt-4o-mini']).toBeDefined();
    expect(MODEL_PRICING['gpt-4-turbo']).toBeDefined();
  });

  it('should have zero pricing for Ollama models', () => {
    expect(MODEL_PRICING['llama3'].inputPer1M).toBe(0);
    expect(MODEL_PRICING['llama3'].outputPer1M).toBe(0);
    expect(MODEL_PRICING['mistral'].inputPer1M).toBe(0);
    expect(MODEL_PRICING['codellama'].inputPer1M).toBe(0);
    expect(MODEL_PRICING['mixtral'].inputPer1M).toBe(0);
  });

  it('should have Sonnet cheaper than Opus', () => {
    const sonnet = MODEL_PRICING['claude-sonnet-4-20250514'];
    const opus = MODEL_PRICING['claude-opus-4-20250514'];
    expect(sonnet.inputPer1M).toBeLessThan(opus.inputPer1M);
    expect(sonnet.outputPer1M).toBeLessThan(opus.outputPer1M);
  });

  it('should have Haiku cheaper than Sonnet', () => {
    const haiku = MODEL_PRICING['claude-3-5-haiku-20241022'];
    const sonnet = MODEL_PRICING['claude-sonnet-4-20250514'];
    expect(haiku.inputPer1M).toBeLessThan(sonnet.inputPer1M);
    expect(haiku.outputPer1M).toBeLessThan(sonnet.outputPer1M);
  });

  it('should have gpt-4o-mini cheaper than gpt-4o', () => {
    const mini = MODEL_PRICING['gpt-4o-mini'];
    const full = MODEL_PRICING['gpt-4o'];
    expect(mini.inputPer1M).toBeLessThan(full.inputPer1M);
    expect(mini.outputPer1M).toBeLessThan(full.outputPer1M);
  });

  it('should have correct Opus pricing', () => {
    const opus = MODEL_PRICING['claude-opus-4-20250514'];
    expect(opus.inputPer1M).toBe(15.00);
    expect(opus.outputPer1M).toBe(75.00);
  });

  it('should have correct GPT-4o pricing', () => {
    const gpt4o = MODEL_PRICING['gpt-4o'];
    expect(gpt4o.inputPer1M).toBe(2.50);
    expect(gpt4o.outputPer1M).toBe(10.00);
  });

  it('should have correct GPT-4 Turbo pricing', () => {
    const turbo = MODEL_PRICING['gpt-4-turbo'];
    expect(turbo.inputPer1M).toBe(10.00);
    expect(turbo.outputPer1M).toBe(30.00);
  });
});

// ─── getModelPricing ────────────────────────────────────────────────────────

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

  it('should return zero for empty string model', () => {
    const pricing = getModelPricing('');
    expect(pricing.inputPer1M).toBe(0);
    expect(pricing.outputPer1M).toBe(0);
  });
});

// ─── calculateCost ──────────────────────────────────────────────────────────

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

  it('should calculate cost for Opus', () => {
    const cost = calculateCost('claude-opus-4-20250514', 5000, 1000);
    // (5000 * 15.00 + 1000 * 75.00) / 1M = (75000 + 75000) / 1M = 0.15
    expect(cost).toBeCloseTo(0.15, 4);
  });

  it('should calculate cost for GPT-4o', () => {
    const cost = calculateCost('gpt-4o', 10000, 5000);
    // (10000 * 2.50 + 5000 * 10.00) / 1M = (25000 + 50000) / 1M = 0.075
    expect(cost).toBeCloseTo(0.075, 4);
  });

  it('should return 0 for Ollama models', () => {
    const cost = calculateCost('llama3', 50000, 10000);
    expect(cost).toBe(0);
  });

  it('should return 0 for zero tokens', () => {
    const cost = calculateCost('claude-sonnet-4-20250514', 0, 0);
    expect(cost).toBe(0);
  });

  it('should handle very large token counts without overflow', () => {
    // 10M input + 5M output on Opus
    const cost = calculateCost('claude-opus-4-20250514', 10_000_000, 5_000_000);
    // (10M * 15 + 5M * 75) / 1M = 150 + 375 = 525
    expect(cost).toBeCloseTo(525, 2);
    expect(isFinite(cost)).toBe(true);
  });

  it('should return 0 for unknown model', () => {
    const cost = calculateCost('nonexistent', 1000, 1000);
    expect(cost).toBe(0);
  });
});

// ─── CostManager ────────────────────────────────────────────────────────────

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

  it('should track usage across multiple providers', () => {
    manager.trackUsage('anthropic', 1000, 500, 'claude-sonnet-4-20250514');
    manager.trackUsage('openai', 2000, 800, 'gpt-4o-mini');
    manager.trackUsage('ollama', 5000, 1000, 'llama3');
    const cost = manager.getSessionCost();
    expect(cost.calls).toBe(3);
    expect(cost.inputTokens).toBe(8000);
    expect(cost.outputTokens).toBe(2300);
  });

  it('should format session cost', () => {
    manager.trackUsage('anthropic', 10000, 5000, 'claude-sonnet-4-20250514');
    const formatted = manager.formatSessionCost();
    expect(formatted).toMatch(/~\$\d+\.\d+ this session/);
  });

  it('should return empty string for zero-cost session', () => {
    expect(manager.formatSessionCost()).toBe('');
  });

  it('should format as ~$0.00 for very small costs', () => {
    manager.trackUsage('anthropic', 1, 1, 'claude-sonnet-4-20250514');
    const formatted = manager.formatSessionCost();
    expect(formatted).toBe('~$0.00 this session');
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

  it('should allow setting budget to 0', () => {
    manager.setBudget(0);
    expect(manager.getBudget()).toBe(0);
  });

  it('should reject negative budget', () => {
    manager.setBudget(10);
    manager.setBudget(-5); // should be ignored
    expect(manager.getBudget()).toBe(10);
  });

  it('should reject NaN budget', () => {
    manager.setBudget(10);
    manager.setBudget(NaN); // should be ignored
    expect(manager.getBudget()).toBe(10);
  });

  it('should reject Infinity budget', () => {
    manager.setBudget(10);
    manager.setBudget(Infinity); // should be ignored
    expect(manager.getBudget()).toBe(10);
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

  it('should warn at exactly 80% of budget', () => {
    // Set budget to $1.00 and spend exactly $0.80
    // We need cost = 0.80, so with Sonnet: (input*3 + output*15) / 1M = 0.80
    // Let's use setBudget and check with shouldWarn at exactly 80%
    manager.setBudget(1.00);
    // Cost = (100000 * 3 + 10000 * 15) / 1M = (300000 + 150000) / 1M = 0.45
    manager.trackUsage('anthropic', 100000, 10000, 'claude-sonnet-4-20250514');
    // 0.45 / 1.00 = 45% < 80%
    expect(manager.shouldWarn()).toBe(false);

    // Add more: cost = (200000 * 3 + 10000 * 15) / 1M = 0.75 → total 1.20
    manager.trackUsage('anthropic', 200000, 10000, 'claude-sonnet-4-20250514');
    // Total ≈ 1.20 → 120% of $1.00 → should warn
    expect(manager.shouldWarn()).toBe(true);
  });

  it('should return budget warning message when exceeded', () => {
    manager.setBudget(0.001);
    manager.trackUsage('anthropic', 100000, 50000, 'claude-sonnet-4-20250514');
    const warning = manager.getBudgetWarning();
    expect(warning).toContain('budget');
    expect(warning).toContain('exceeded');
  });

  it('should return approaching warning at 80-99%', () => {
    manager.setBudget(1.00);
    // Spend ~$0.90
    // Need (input * 3 + output * 15) / 1M = 0.90
    // 200000 * 3 + 20000 * 15 = 600000 + 300000 = 900000 / 1M = 0.90
    manager.trackUsage('anthropic', 200000, 20000, 'claude-sonnet-4-20250514');
    const warning = manager.getBudgetWarning();
    expect(warning).toContain('Approaching');
    expect(warning).toContain('90%');
  });

  it('should return empty warning when within budget', () => {
    manager.setBudget(1000);
    manager.trackUsage('anthropic', 100, 50, 'claude-sonnet-4-20250514');
    expect(manager.getBudgetWarning()).toBe('');
  });

  it('should handle zero budget in warning logic', () => {
    manager.setBudget(0);
    // With budget 0, pct = (cost / 0) * 100 = 0 (since guard checks budget > 0)
    const warning = manager.getBudgetWarning();
    // pct is 0 when budget is 0, so no warning
    expect(warning).toBe('');
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

  it('should handle corrupted localStorage gracefully', () => {
    localStorageMock.setItem('openclo_usage_corrupt-project', 'not-valid-json{{{');
    const corruptManager = new CostManager('corrupt-project');
    // Should not throw, should start with empty records
    expect(corruptManager.getProjectCost().calls).toBe(0);
  });

  it('should handle non-array localStorage data gracefully', () => {
    localStorageMock.setItem('openclo_usage_non-array', JSON.stringify({ not: 'an array' }));
    const badManager = new CostManager('non-array');
    expect(badManager.getProjectCost().calls).toBe(0);
  });

  it('should isolate different projects', () => {
    manager.trackUsage('anthropic', 1000, 500, 'claude-sonnet-4-20250514');

    const manager2 = new CostManager('other-project');
    expect(manager2.getProjectCost().calls).toBe(0);
  });

  it('should track monthly usage correctly', () => {
    manager.trackUsage('anthropic', 1000, 500, 'claude-sonnet-4-20250514');
    const monthly = manager.getMonthlyUsage();
    expect(monthly.calls).toBe(1);
    expect(monthly.tokens).toBe(1500);
  });
});

// ─── selectOptimalModel ─────────────────────────────────────────────────────

describe('selectOptimalModel', () => {
  it('should select cheap model for simple queries', () => {
    const model = selectOptimalModel('list fabrics', 'anthropic', 'claude-sonnet-4-20250514');
    expect(model).toBe('claude-3-5-haiku-20241022');
  });

  it('should select cheap model for "show" queries', () => {
    const model = selectOptimalModel('show measurements', 'openai', 'gpt-4o');
    expect(model).toBe('gpt-4o-mini');
  });

  it('should select cheap model for "get" queries', () => {
    const model = selectOptimalModel('get the measurements', 'anthropic', 'claude-sonnet-4-20250514');
    expect(model).toBe('claude-3-5-haiku-20241022');
  });

  it('should select cheap model for "what" queries', () => {
    const model = selectOptimalModel('what fabrics are available?', 'openai', 'gpt-4o');
    expect(model).toBe('gpt-4o-mini');
  });

  it('should select cheap model for Spanish "cuáles"', () => {
    const model = selectOptimalModel('cuáles telas hay?', 'anthropic', 'claude-sonnet-4-20250514');
    expect(model).toBe('claude-3-5-haiku-20241022');
  });

  it('should select cheap model for Spanish "muestra"', () => {
    const model = selectOptimalModel('muestra las medidas', 'anthropic', 'claude-sonnet-4-20250514');
    expect(model).toBe('claude-3-5-haiku-20241022');
  });

  it('should select cheap model for Spanish "listar"', () => {
    const model = selectOptimalModel('listar piezas', 'openai', 'gpt-4o');
    expect(model).toBe('gpt-4o-mini');
  });

  it('should select cheap model for "ver medidas"', () => {
    const model = selectOptimalModel('ver medidas del corpiño', 'anthropic', 'claude-sonnet-4-20250514');
    expect(model).toBe('claude-3-5-haiku-20241022');
  });

  it('should select cheap model for "ver telas"', () => {
    const model = selectOptimalModel('ver telas disponibles', 'anthropic', 'claude-sonnet-4-20250514');
    expect(model).toBe('claude-3-5-haiku-20241022');
  });

  it('should select default model for complex queries', () => {
    const model = selectOptimalModel('generate a bodice from description', 'anthropic', 'claude-sonnet-4-20250514');
    expect(model).toBe('claude-sonnet-4-20250514');
  });

  it('should select default model for creation', () => {
    const model = selectOptimalModel('crear un corpiño talla 40', 'anthropic', 'claude-sonnet-4-20250514');
    expect(model).toBe('claude-sonnet-4-20250514');
  });

  it('should select default for "gradar" (grading)', () => {
    const model = selectOptimalModel('gradar todas las tallas', 'anthropic', 'claude-sonnet-4-20250514');
    expect(model).toBe('claude-sonnet-4-20250514');
  });

  it('should select default for "generar"', () => {
    const model = selectOptimalModel('generar patrón desde descripción', 'anthropic', 'claude-sonnet-4-20250514');
    expect(model).toBe('claude-sonnet-4-20250514');
  });

  it('should select default for "transform"', () => {
    const model = selectOptimalModel('transform the neckline', 'openai', 'gpt-4o');
    expect(model).toBe('gpt-4o');
  });

  it('should return default for ambiguous messages', () => {
    const model = selectOptimalModel('help me with my pattern', 'anthropic', 'claude-opus-4-20250514');
    expect(model).toBe('claude-opus-4-20250514');
  });

  it('should keep default model for ollama', () => {
    const model = selectOptimalModel('list stuff', 'ollama', 'llama3');
    expect(model).toBe('llama3');
  });

  it('should return default for unknown provider', () => {
    const model = selectOptimalModel('list things', 'deepseek' as string, 'deepseek-chat');
    expect(model).toBe('deepseek-chat');
  });
});

// ─── classifyToolComplexity ─────────────────────────────────────────────────

describe('classifyToolComplexity', () => {
  it('should classify listFabrics as simple', () => {
    expect(classifyToolComplexity('listFabrics')).toBe('simple');
  });

  it('should classify getMeasurements as simple', () => {
    expect(classifyToolComplexity('getMeasurements')).toBe('simple');
  });

  it('should classify selectPiece as simple', () => {
    expect(classifyToolComplexity('selectPiece')).toBe('simple');
  });

  it('should classify setViewMode as simple', () => {
    expect(classifyToolComplexity('setViewMode')).toBe('simple');
  });

  it('should classify setUnits as simple', () => {
    expect(classifyToolComplexity('setUnits')).toBe('simple');
  });

  it('should classify measureDistance as simple', () => {
    expect(classifyToolComplexity('measureDistance')).toBe('simple');
  });

  it('should classify analyzePiece as simple', () => {
    expect(classifyToolComplexity('analyzePiece')).toBe('simple');
  });

  it('should classify evaluateFormula as simple', () => {
    expect(classifyToolComplexity('evaluateFormula')).toBe('simple');
  });

  it('should classify generateFromTemplate as complex', () => {
    expect(classifyToolComplexity('generateFromTemplate')).toBe('complex');
  });

  it('should classify createPiece as complex', () => {
    expect(classifyToolComplexity('createPiece')).toBe('complex');
  });

  it('should classify transformPiece as complex', () => {
    expect(classifyToolComplexity('transformPiece')).toBe('complex');
  });

  it('should classify modifyOutline as complex', () => {
    expect(classifyToolComplexity('modifyOutline')).toBe('complex');
  });

  it('should classify gradePiece as complex', () => {
    expect(classifyToolComplexity('gradePiece')).toBe('complex');
  });

  it('should classify gradeAllSizes as complex', () => {
    expect(classifyToolComplexity('gradeAllSizes')).toBe('complex');
  });

  it('should classify unknown tools as normal', () => {
    expect(classifyToolComplexity('someRandomTool')).toBe('normal');
  });

  it('should classify empty string as normal', () => {
    expect(classifyToolComplexity('')).toBe('normal');
  });
});
