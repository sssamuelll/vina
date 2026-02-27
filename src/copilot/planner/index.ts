/**
 * Planner Module
 *
 * Multi-step plan creation and execution.
 *
 * @module planner
 */

export {
  // Types
  type PlanStepStatus,
  type PlanStep,
  type PlanStatus,
  type PlanExecutionMode,
  type CopilotPlan,
  type PlanTemplate,
  type PlanTemplateInput,
  type PlanEvent,
  // Functions
  generatePlanId,
  generateStepId,
  createPlan,
  getNextPendingStep,
  areDependenciesMet,
  calculatePlanProgress,
  getPlanStats,
} from './planTypes';

export {
  // Types
  type PlanExecutionOptions,
  type PlanExecutionResult,
  type PlanExecutionCallbacks,
  // Class
  PlanExecutor,
  // Factory
  createPlanExecutor,
} from './planExecutor';

export {
  // Templates
  PLAN_TEMPLATES,
  templates,
  // Types
  type PlanGenerationOptions,
  // Functions
  findMatchingTemplates,
  generatePlanFromTemplate,
  generateCustomPlan,
  analyzePlanRequest,
} from './planGenerator';
