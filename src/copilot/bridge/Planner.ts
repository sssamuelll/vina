/**
 * Planner — builds system prompts and parses execution plans from LLM responses.
 *
 * Enforces JSON-only output to prevent hallucinations and validates
 * the structure of execution plans.
 *
 * @module bridge/Planner
 */

import type { ExecutionPlan, Step, ExecuteStep, EvaluateStep } from './types';

// ─── Error Types ────────────────────────────────────────────────────────────

/**
 * Error thrown when plan parsing or validation fails.
 */
export class PlannerError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PlannerError';
  }
}

// ─── Tool Schema ────────────────────────────────────────────────────────────

/**
 * Schema definition for a tool that can be used in execution plans.
 */
export interface ToolSchema {
  /** Tool name */
  name: string;
  /** Description of what the tool does */
  description: string;
  /** JSON Schema for parameters */
  parameters: {
    type: string;
    properties: Record<string, unknown>;
    required?: string[];
  };
}

// ─── Planner Class ──────────────────────────────────────────────────────────

/**
 * Builds system prompts for LLM and parses execution plans from responses.
 */
export class Planner {
  /** Counter for generating unique step IDs */
  private idCounter = 0;

  /**
   * Build a system prompt that enforces JSON-only output.
   *
   * @param tools - Array of tool schemas available for use
   * @returns System prompt string
   */
  buildSystemPrompt(tools: ToolSchema[]): string {
    const toolDescriptions = tools
      .map(t => `- ${t.name}: ${t.description}`)
      .join('\n');

    return `You are a pattern modification assistant. Your task is to create execution plans for garment pattern operations.

IMPORTANT: You MUST respond with valid JSON only. No explanations, no markdown (unless wrapping JSON), no additional text.

Available tools:
${toolDescriptions}

Response format:
{
  "intent": "brief description of what this plan accomplishes",
  "steps": [
    {
      "type": "execute",
      "id": "step1",
      "tool": "toolName",
      "params": { ... },
      "label": "Human-readable step description"
    },
    {
      "type": "evaluate",
      "id": "step2",
      "input": "$step1.result",
      "decide": "condition to evaluate",
      "label": "Human-readable evaluation description"
    }
  ]
}

Rules:
- Each step must have a unique id
- Execute steps require: type, id, tool, params, label
- Evaluate steps require: type, id, input, decide, label
- Reference previous step results using $stepId.result or $stepId.result.field
- Output valid JSON only`;
  }

  /**
   * Parse an LLM response into an execution plan.
   *
   * Handles responses that may be wrapped in markdown code blocks.
   *
   * @param response - Raw LLM response string
   * @returns Validated execution plan
   * @throws PlannerError if parsing or validation fails
   */
  parsePlan(response: string): ExecutionPlan {
    const jsonStr = this.extractJson(response);
    const parsed = this.parseJson(jsonStr);
    return this.validatePlan(parsed);
  }

  /**
   * Extract JSON from a response that may be wrapped in markdown code blocks.
   */
  private extractJson(response: string): string {
    // Try to extract from markdown code block
    const codeBlockMatch = response.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (codeBlockMatch) {
      return codeBlockMatch[1].trim();
    }

    // Otherwise, return trimmed response
    return response.trim();
  }

  /**
   * Parse JSON string, throwing PlannerError on failure.
   */
  private parseJson(jsonStr: string): unknown {
    try {
      return JSON.parse(jsonStr);
    } catch {
      throw new PlannerError(`Invalid JSON: ${jsonStr.slice(0, 100)}...`);
    }
  }

  /**
   * Validate and normalize a parsed plan object.
   */
  private validatePlan(parsed: unknown): ExecutionPlan {
    if (typeof parsed !== 'object' || parsed === null) {
      throw new PlannerError('Plan must be an object');
    }

    const obj = parsed as Record<string, unknown>;

    // Validate intent
    if (typeof obj.intent !== 'string' || !obj.intent) {
      throw new PlannerError('Plan must have an "intent" string');
    }

    // Validate steps array
    if (!Array.isArray(obj.steps)) {
      throw new PlannerError('Plan must have a "steps" array');
    }

    // Validate and normalize each step
    const steps = obj.steps.map((step, index) => this.validateStep(step, index));

    return {
      intent: obj.intent,
      steps,
    };
  }

  /**
   * Validate and normalize a single step.
   */
  private validateStep(step: unknown, index: number): Step {
    if (typeof step !== 'object' || step === null) {
      throw new PlannerError(`Step ${index} must be an object`);
    }

    const s = step as Record<string, unknown>;

    // Validate type
    if (s.type !== 'execute' && s.type !== 'evaluate') {
      throw new PlannerError(`Step ${index} must have type "execute" or "evaluate"`);
    }

    // Generate ID if missing
    const id = typeof s.id === 'string' && s.id ? s.id : this.generateId();

    // Validate label
    const label = typeof s.label === 'string' ? s.label : `Step ${index + 1}`;

    if (s.type === 'execute') {
      return this.validateExecuteStep(s, index, id, label);
    } else {
      return this.validateEvaluateStep(s, index, id, label);
    }
  }

  /**
   * Validate an execute step.
   */
  private validateExecuteStep(
    s: Record<string, unknown>,
    index: number,
    id: string,
    label: string
  ): ExecuteStep {
    if (typeof s.tool !== 'string' || !s.tool) {
      throw new PlannerError(`Execute step ${index} must have a "tool" string`);
    }

    if (typeof s.params !== 'object' || s.params === null) {
      throw new PlannerError(`Execute step ${index} must have a "params" object`);
    }

    return {
      type: 'execute',
      id,
      tool: s.tool,
      params: s.params as Record<string, unknown>,
      label,
    };
  }

  /**
   * Validate an evaluate step.
   */
  private validateEvaluateStep(
    s: Record<string, unknown>,
    index: number,
    id: string,
    label: string
  ): EvaluateStep {
    if (typeof s.input !== 'string' || !s.input) {
      throw new PlannerError(`Evaluate step ${index} must have an "input" string`);
    }

    if (typeof s.decide !== 'string' || !s.decide) {
      throw new PlannerError(`Evaluate step ${index} must have a "decide" string`);
    }

    return {
      type: 'evaluate',
      id,
      input: s.input,
      decide: s.decide,
      label,
    };
  }

  /**
   * Generate a unique step ID.
   */
  private generateId(): string {
    this.idCounter += 1;
    return `step_${this.idCounter}_${Date.now().toString(36)}`;
  }
}
