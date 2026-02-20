/**
 * Cost Manager — tracks token usage, estimates costs, and manages budgets.
 *
 * Provides per-session and per-project cost tracking with model-specific pricing.
 * Supports budget warnings and smart model routing to optimize costs.
 *
 * Usage data is persisted in localStorage per project, with session data
 * maintained in memory.
 *
 * @module costManager
 */

// ─── Pricing Table ──────────────────────────────────────────────────────────

/**
 * Price per 1M tokens for a specific model.
 */
export interface ModelPricing {
  /** Price per 1M input tokens in USD */
  inputPer1M: number;
  /** Price per 1M output tokens in USD */
  outputPer1M: number;
}

/**
 * Model pricing table — USD per 1 million tokens.
 * Updated February 2026.
 */
export const MODEL_PRICING: Record<string, ModelPricing> = {
  // Anthropic
  'claude-sonnet-4-20250514':       { inputPer1M: 3.00,  outputPer1M: 15.00 },
  'claude-opus-4-20250514':        { inputPer1M: 15.00, outputPer1M: 75.00 },
  'claude-3-5-haiku-20241022':     { inputPer1M: 0.80,  outputPer1M: 4.00 },
  // OpenAI
  'gpt-4o':                        { inputPer1M: 2.50,  outputPer1M: 10.00 },
  'gpt-4o-mini':                   { inputPer1M: 0.15,  outputPer1M: 0.60 },
  'gpt-4-turbo':                   { inputPer1M: 10.00, outputPer1M: 30.00 },
  // Ollama (free — local inference)
  'llama3':                        { inputPer1M: 0, outputPer1M: 0 },
  'codellama':                     { inputPer1M: 0, outputPer1M: 0 },
  'mistral':                       { inputPer1M: 0, outputPer1M: 0 },
  'mixtral':                       { inputPer1M: 0, outputPer1M: 0 },
};

/**
 * Get pricing for a model, falling back to zero if unknown.
 *
 * @param model - Model name
 * @returns Model pricing
 */
export function getModelPricing(model: string): ModelPricing {
  return MODEL_PRICING[model] ?? { inputPer1M: 0, outputPer1M: 0 };
}

/**
 * Calculate the cost for a specific token usage.
 *
 * @param model - Model name
 * @param inputTokens - Number of input/prompt tokens
 * @param outputTokens - Number of output/completion tokens
 * @returns Estimated cost in USD
 */
export function calculateCost(model: string, inputTokens: number, outputTokens: number): number {
  const pricing = getModelPricing(model);
  return (inputTokens * pricing.inputPer1M + outputTokens * pricing.outputPer1M) / 1_000_000;
}

// ─── Usage Tracking ─────────────────────────────────────────────────────────

/**
 * A single usage record for a provider call.
 */
export interface UsageRecord {
  /** Provider name */
  provider: string;
  /** Model name */
  model: string;
  /** Input/prompt token count */
  inputTokens: number;
  /** Output/completion token count */
  outputTokens: number;
  /** Calculated cost in USD */
  cost: number;
  /** Timestamp of the usage */
  timestamp: number;
}

/**
 * Aggregated cost summary.
 */
export interface CostSummary {
  /** Total tokens (input + output) */
  tokens: number;
  /** Total input tokens */
  inputTokens: number;
  /** Total output tokens */
  outputTokens: number;
  /** Estimated total cost in USD */
  estimatedCost: number;
  /** Number of API calls */
  calls: number;
}

/** localStorage key prefix for project usage */
const USAGE_STORAGE_PREFIX = 'openclo_usage_';
/** localStorage key for budget setting */
const BUDGET_STORAGE_KEY = 'openclo_budget';
/** Default monthly budget in USD */
const DEFAULT_BUDGET = 5.00;

/**
 * Cost Manager — singleton-style class for tracking token usage and costs.
 *
 * Maintains session usage in memory and persists project usage to localStorage.
 *
 * @example
 * ```ts
 * const manager = new CostManager('project-123');
 * manager.trackUsage('anthropic', 1500, 300, 'claude-sonnet-4-20250514');
 * console.log(manager.getSessionCost()); // { tokens: 1800, estimatedCost: 0.009 }
 * ```
 */
export class CostManager {
  private projectId: string;
  private sessionRecords: UsageRecord[] = [];
  private projectRecords: UsageRecord[] = [];

  /**
   * Create a new CostManager for a specific project.
   *
   * @param projectId - Project identifier for persistent storage
   */
  constructor(projectId: string) {
    this.projectId = projectId;
    this.loadProjectUsage();
  }

  /**
   * Track a new usage event.
   *
   * Records token counts and calculates cost based on the model pricing table.
   * Updates both session and project usage.
   *
   * @param provider - Provider name ('anthropic', 'openai', 'ollama')
   * @param inputTokens - Number of input tokens used
   * @param outputTokens - Number of output tokens used
   * @param model - Model name for pricing lookup
   */
  trackUsage(provider: string, inputTokens: number, outputTokens: number, model: string): void {
    const cost = calculateCost(model, inputTokens, outputTokens);
    const record: UsageRecord = {
      provider,
      model,
      inputTokens,
      outputTokens,
      cost,
      timestamp: Date.now(),
    };

    this.sessionRecords.push(record);
    this.projectRecords.push(record);
    this.saveProjectUsage();
  }

  /**
   * Get cost summary for the current session.
   *
   * @returns Session cost summary
   */
  getSessionCost(): CostSummary {
    return this.summarize(this.sessionRecords);
  }

  /**
   * Get cost summary for the entire project (all sessions).
   *
   * @returns Project cost summary
   */
  getProjectCost(): CostSummary {
    return this.summarize(this.projectRecords);
  }

  /**
   * Get cost summary for the current month within this project.
   *
   * @returns Monthly cost summary
   */
  getMonthlyUsage(): CostSummary {
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).getTime();

    const monthlyRecords = this.projectRecords.filter(r => r.timestamp >= monthStart);
    return this.summarize(monthlyRecords);
  }

  /**
   * Check if the user should be warned about approaching their budget.
   *
   * Warns at 80% and 100% of the monthly budget.
   *
   * @returns Whether a budget warning should be shown
   */
  shouldWarn(): boolean {
    const budget = this.getBudget();
    const monthly = this.getMonthlyUsage();
    return monthly.estimatedCost >= budget * 0.8;
  }

  /**
   * Get a formatted budget warning message, or empty string if within budget.
   *
   * @returns Warning message string
   */
  getBudgetWarning(): string {
    const budget = this.getBudget();
    const monthly = this.getMonthlyUsage();
    const pct = budget > 0 ? (monthly.estimatedCost / budget) * 100 : 0;

    if (pct >= 100) {
      return `⚠️ Monthly budget exceeded: $${monthly.estimatedCost.toFixed(2)} / $${budget.toFixed(2)}`;
    }
    if (pct >= 80) {
      return `⚠️ Approaching budget limit: $${monthly.estimatedCost.toFixed(2)} / $${budget.toFixed(2)} (${Math.round(pct)}%)`;
    }
    return '';
  }

  /**
   * Get the monthly budget setting.
   *
   * @returns Budget in USD
   */
  getBudget(): number {
    try {
      const saved = localStorage.getItem(BUDGET_STORAGE_KEY);
      if (saved) {
        const value = parseFloat(saved);
        if (isFinite(value) && value >= 0) return value;
      }
    } catch { /* ignore */ }
    return DEFAULT_BUDGET;
  }

  /**
   * Set the monthly budget.
   *
   * @param amount - Budget amount in USD (must be finite and >= 0)
   */
  setBudget(amount: number): void {
    if (!isFinite(amount) || amount < 0) return;
    try {
      localStorage.setItem(BUDGET_STORAGE_KEY, String(amount));
    } catch { /* ignore */ }
  }

  /**
   * Format session cost as a compact display string.
   *
   * @returns Formatted cost string like "~$0.03 this session"
   */
  formatSessionCost(): string {
    const session = this.getSessionCost();
    if (session.calls === 0) return '';
    if (session.estimatedCost < 0.005) return '~$0.00 this session';
    return `~$${session.estimatedCost.toFixed(2)} this session`;
  }

  /**
   * Reset session usage tracking.
   */
  resetSession(): void {
    this.sessionRecords = [];
  }

  /**
   * Clear all usage data for the project.
   */
  clearProjectUsage(): void {
    this.projectRecords = [];
    this.sessionRecords = [];
    try {
      localStorage.removeItem(USAGE_STORAGE_PREFIX + this.projectId);
    } catch { /* ignore */ }
  }

  // ─── Private ──────────────────────────────────────────────────────────

  /**
   * Summarize an array of usage records.
   */
  private summarize(records: UsageRecord[]): CostSummary {
    let inputTokens = 0;
    let outputTokens = 0;
    let estimatedCost = 0;

    for (const r of records) {
      inputTokens += r.inputTokens;
      outputTokens += r.outputTokens;
      estimatedCost += r.cost;
    }

    return {
      tokens: inputTokens + outputTokens,
      inputTokens,
      outputTokens,
      estimatedCost,
      calls: records.length,
    };
  }

  /**
   * Load project usage from localStorage.
   */
  private loadProjectUsage(): void {
    try {
      const key = USAGE_STORAGE_PREFIX + this.projectId;
      const saved = localStorage.getItem(key);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) {
          this.projectRecords = parsed;
        }
      }
    } catch { /* ignore */ }
  }

  /**
   * Save project usage to localStorage.
   */
  private saveProjectUsage(): void {
    try {
      const key = USAGE_STORAGE_PREFIX + this.projectId;
      // Keep only last 500 records to avoid quota issues
      const trimmed = this.projectRecords.slice(-500);
      localStorage.setItem(key, JSON.stringify(trimmed));
    } catch { /* ignore */ }
  }
}

// ─── Smart Model Routing ────────────────────────────────────────────────────

/** Tools considered "simple" that can use a cheaper model */
const SIMPLE_TOOLS: ReadonlySet<string> = new Set([
  'listFabrics',
  'getMeasurements',
  'selectPiece',
  'setViewMode',
  'setUnits',
  'toggleSeamAllowanceDisplay',
  'measureDistance',
  'analyzePiece',
  'analyzeProject',
  'evaluateFormula',
]);

/** Tools that require more intelligence and should use the best model */
const COMPLEX_TOOLS: ReadonlySet<string> = new Set([
  'generateFromDescription',
  'transformPiece',
  'createPiece',
  'modifyOutline',
  'gradePiece',
  'gradeAllSizes',
]);

/**
 * Determine the optimal model for a given user message based on complexity.
 *
 * Analyzes the message and likely tools to route simple requests to cheaper models
 * and complex requests to more capable (expensive) models.
 *
 * @param message - The user's message text
 * @param provider - Current provider name ('anthropic' or 'openai')
 * @param defaultModel - The default model configured by the user
 * @returns Recommended model name
 */
export function selectOptimalModel(
  message: string,
  provider: string,
  defaultModel: string,
): string {
  const lower = message.toLowerCase();

  // Check for simple query patterns
  const isSimple =
    lower.includes('list') ||
    lower.includes('show') ||
    lower.includes('get') ||
    lower.includes('what') ||
    lower.includes('cuáles') ||
    lower.includes('muestra') ||
    lower.includes('listar') ||
    lower.includes('ver medidas') ||
    lower.includes('ver telas');

  // Check for complex patterns
  const isComplex =
    lower.includes('generate') ||
    lower.includes('crear') ||
    lower.includes('crea') ||
    lower.includes('generar') ||
    lower.includes('transform') ||
    lower.includes('from description') ||
    lower.includes('desde descripción') ||
    lower.includes('grade') ||
    lower.includes('gradar');

  // If complex or ambiguous, use the default (user-chosen) model
  if (isComplex || !isSimple) {
    return defaultModel;
  }

  // For simple queries, use the cheapest available model
  const cheapModels: Record<string, string> = {
    anthropic: 'claude-3-5-haiku-20241022',
    openai: 'gpt-4o-mini',
    ollama: defaultModel, // Ollama is always free
  };

  return cheapModels[provider] ?? defaultModel;
}

/**
 * Classify a tool name as simple or complex for routing decisions.
 *
 * @param toolName - Name of the tool
 * @returns 'simple' | 'complex' | 'normal'
 */
export function classifyToolComplexity(toolName: string): 'simple' | 'complex' | 'normal' {
  if (SIMPLE_TOOLS.has(toolName)) return 'simple';
  if (COMPLEX_TOOLS.has(toolName)) return 'complex';
  return 'normal';
}
