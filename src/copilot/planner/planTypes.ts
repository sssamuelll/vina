/**
 * Plan Types — Data structures for multi-step copilot plans.
 *
 * Plans break complex tasks into discrete steps that can be
 * executed all at once, step-by-step, or modified before execution.
 *
 * @module planTypes
 */

import type { CopilotAction } from '../actions/actionTypes';

// ============================================================================
// Plan Step Types
// ============================================================================

/**
 * Status of a plan step.
 */
export type PlanStepStatus = 'pending' | 'running' | 'completed' | 'failed' | 'skipped';

/**
 * A single step in a plan.
 */
export interface PlanStep {
  /** Unique step ID */
  id: string;
  /** Step number (1-based for display) */
  stepNumber: number;
  /** Human-readable description of this step */
  description: string;
  /** Detailed explanation (optional) */
  details?: string;
  /** The action(s) to execute for this step */
  actions: CopilotAction[];
  /** Dependencies - step IDs that must complete first */
  dependsOn: string[];
  /** Current status */
  status: PlanStepStatus;
  /** Result message after execution */
  resultMessage?: string;
  /** Error message if failed */
  errorMessage?: string;
  /** Duration in ms (after completion) */
  durationMs?: number;
  /** Whether this step can be skipped */
  optional: boolean;
  /** Category for grouping */
  category?: string;
}

// ============================================================================
// Plan Types
// ============================================================================

/**
 * Status of the overall plan.
 */
export type PlanStatus = 'draft' | 'ready' | 'running' | 'paused' | 'completed' | 'failed' | 'cancelled';

/**
 * Execution mode for the plan.
 */
export type PlanExecutionMode = 'all' | 'step_by_step' | 'manual';

/**
 * A complete execution plan.
 */
export interface CopilotPlan {
  /** Unique plan ID */
  id: string;
  /** Plan title (e.g., "Create T-Shirt Pattern") */
  title: string;
  /** Summary of what this plan will do */
  summary: string;
  /** The original user request */
  userRequest: string;
  /** All steps in order */
  steps: PlanStep[];
  /** Current status */
  status: PlanStatus;
  /** Execution mode */
  executionMode: PlanExecutionMode;
  /** Index of current step being executed (for step_by_step mode) */
  currentStepIndex: number;
  /** Creation timestamp */
  createdAt: number;
  /** Last update timestamp */
  updatedAt: number;
  /** Estimated total duration in ms */
  estimatedDurationMs?: number;
  /** Actual total duration after completion */
  actualDurationMs?: number;
  /** Tags for categorization */
  tags: string[];
}

// ============================================================================
// Plan Templates
// ============================================================================

/**
 * A reusable plan template.
 */
export interface PlanTemplate {
  /** Template ID */
  id: string;
  /** Template name */
  name: string;
  /** Description */
  description: string;
  /** Keywords that trigger this template */
  keywords: string[];
  /** Template steps (actions may have placeholders) */
  steps: Omit<PlanStep, 'id' | 'status' | 'resultMessage' | 'errorMessage' | 'durationMs'>[];
  /** Required inputs (e.g., measurements) */
  requiredInputs: PlanTemplateInput[];
  /** Category */
  category: string;
  /** Complexity level */
  complexity: 'simple' | 'moderate' | 'complex';
}

/**
 * An input required by a plan template.
 */
export interface PlanTemplateInput {
  /** Input key (used in placeholders) */
  key: string;
  /** Display label */
  label: string;
  /** Input type */
  type: 'text' | 'number' | 'select' | 'measurements';
  /** Description */
  description?: string;
  /** Whether this input is required */
  required: boolean;
  /** Default value */
  defaultValue?: unknown;
  /** Options for select type */
  options?: { value: string; label: string }[];
}

// ============================================================================
// Plan Events
// ============================================================================

/**
 * Events emitted during plan execution.
 */
export type PlanEvent =
  | { type: 'plan_started'; planId: string }
  | { type: 'step_started'; planId: string; stepId: string }
  | { type: 'step_completed'; planId: string; stepId: string; resultMessage: string }
  | { type: 'step_failed'; planId: string; stepId: string; errorMessage: string }
  | { type: 'step_skipped'; planId: string; stepId: string }
  | { type: 'plan_paused'; planId: string; atStepId: string }
  | { type: 'plan_completed'; planId: string; durationMs: number }
  | { type: 'plan_failed'; planId: string; failedStepId: string }
  | { type: 'plan_cancelled'; planId: string };

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Generate a unique plan ID.
 */
let planIdCounter = 0;
export function generatePlanId(): string {
  return `plan-${Date.now()}-${++planIdCounter}`;
}

/**
 * Generate a unique step ID.
 */
let stepIdCounter = 0;
export function generateStepId(): string {
  return `step-${Date.now()}-${++stepIdCounter}`;
}

/**
 * Create a new plan from steps.
 */
export function createPlan(
  title: string,
  summary: string,
  userRequest: string,
  steps: Omit<PlanStep, 'id' | 'status'>[]
): CopilotPlan {
  return {
    id: generatePlanId(),
    title,
    summary,
    userRequest,
    steps: steps.map((step, index) => ({
      ...step,
      id: generateStepId(),
      stepNumber: index + 1,
      status: 'pending',
    })),
    status: 'draft',
    executionMode: 'all',
    currentStepIndex: 0,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    tags: [],
  };
}

/**
 * Get the next pending step in a plan.
 */
export function getNextPendingStep(plan: CopilotPlan): PlanStep | null {
  return plan.steps.find(s => s.status === 'pending') || null;
}

/**
 * Check if all dependencies for a step are met.
 */
export function areDependenciesMet(plan: CopilotPlan, step: PlanStep): boolean {
  if (step.dependsOn.length === 0) return true;

  return step.dependsOn.every(depId => {
    const depStep = plan.steps.find(s => s.id === depId);
    return depStep?.status === 'completed' || depStep?.status === 'skipped';
  });
}

/**
 * Calculate plan progress percentage.
 */
export function calculatePlanProgress(plan: CopilotPlan): number {
  if (plan.steps.length === 0) return 0;

  const completedSteps = plan.steps.filter(
    s => s.status === 'completed' || s.status === 'skipped'
  ).length;

  return Math.round((completedSteps / plan.steps.length) * 100);
}

/**
 * Get plan statistics.
 */
export function getPlanStats(plan: CopilotPlan): {
  total: number;
  pending: number;
  running: number;
  completed: number;
  failed: number;
  skipped: number;
} {
  const stats = {
    total: plan.steps.length,
    pending: 0,
    running: 0,
    completed: 0,
    failed: 0,
    skipped: 0,
  };

  for (const step of plan.steps) {
    stats[step.status]++;
  }

  return stats;
}
