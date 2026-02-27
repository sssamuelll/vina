/**
 * Plan Executor — Executes multi-step plans with progress tracking.
 *
 * Handles:
 * - Sequential step execution
 * - Dependency resolution
 * - Error handling and recovery
 * - Pause/resume capability
 * - Event emission for UI updates
 *
 * @module planExecutor
 */

import type { AppDispatch, RootState } from '../../store';
import { CopilotActionExecutor } from '../actions/actionExecutor';
import {
  type CopilotPlan,
  type PlanStep,
  type PlanEvent,
  areDependenciesMet,
  getNextPendingStep,
} from './planTypes';

// ============================================================================
// Types
// ============================================================================

/**
 * Options for plan execution.
 */
export interface PlanExecutionOptions {
  /** Delay between steps in ms (for visibility) */
  stepDelay: number;
  /** Whether to stop on first error */
  stopOnError: boolean;
  /** Whether to skip optional steps on error */
  skipOptionalOnError: boolean;
  /** Maximum execution time in ms (0 = no limit) */
  timeout: number;
}

const DEFAULT_OPTIONS: PlanExecutionOptions = {
  stepDelay: 500,
  stopOnError: true,
  skipOptionalOnError: true,
  timeout: 0,
};

/**
 * Result of executing a plan.
 */
export interface PlanExecutionResult {
  /** Whether all steps completed successfully */
  success: boolean;
  /** The final plan state */
  plan: CopilotPlan;
  /** Total execution time in ms */
  durationMs: number;
  /** Number of completed steps */
  completedSteps: number;
  /** Number of failed steps */
  failedSteps: number;
  /** Number of skipped steps */
  skippedSteps: number;
}

/**
 * Callbacks for plan execution events.
 */
export interface PlanExecutionCallbacks {
  onEvent?: (event: PlanEvent) => void;
  onStepStart?: (step: PlanStep) => void;
  onStepComplete?: (step: PlanStep, result: { success: boolean; message: string }) => void;
  onProgress?: (progress: number, currentStep: PlanStep) => void;
  onPlanComplete?: (result: PlanExecutionResult) => void;
}

// ============================================================================
// Plan Executor Class
// ============================================================================

/**
 * Executes copilot plans with step-by-step control.
 */
export class PlanExecutor {
  private actionExecutor: CopilotActionExecutor;
  private options: PlanExecutionOptions;
  private callbacks: PlanExecutionCallbacks;

  private isPaused = false;
  private isCancelled = false;
  private currentPlan: CopilotPlan | null = null;

  constructor(
    dispatch: AppDispatch,
    getState: () => RootState,
    options: Partial<PlanExecutionOptions> = {},
    callbacks: PlanExecutionCallbacks = {}
  ) {
    this.actionExecutor = new CopilotActionExecutor(dispatch, getState);
    this.options = { ...DEFAULT_OPTIONS, ...options };
    this.callbacks = callbacks;
  }

  /**
   * Execute a plan completely.
   */
  async execute(plan: CopilotPlan): Promise<PlanExecutionResult> {
    const startTime = Date.now();
    this.currentPlan = { ...plan, status: 'running', updatedAt: Date.now() };
    this.isPaused = false;
    this.isCancelled = false;

    this.emitEvent({ type: 'plan_started', planId: plan.id });

    let completedSteps = 0;
    let failedSteps = 0;
    let skippedSteps = 0;

    try {
      for (let i = 0; i < this.currentPlan.steps.length; i++) {
        // Check for cancellation
        if (this.isCancelled) {
          this.currentPlan.status = 'cancelled';
          this.emitEvent({ type: 'plan_cancelled', planId: plan.id });
          break;
        }

        // Check for pause
        while (this.isPaused && !this.isCancelled) {
          await this.sleep(100);
        }

        const step = this.currentPlan.steps[i];
        this.currentPlan.currentStepIndex = i;

        // Check dependencies
        if (!areDependenciesMet(this.currentPlan, step)) {
          // Skip if dependencies not met
          step.status = 'skipped';
          step.resultMessage = 'Skipped: dependencies not met';
          skippedSteps++;
          this.emitEvent({ type: 'step_skipped', planId: plan.id, stepId: step.id });
          continue;
        }

        // Execute step
        const stepResult = await this.executeStep(step);

        if (stepResult.success) {
          completedSteps++;
        } else {
          failedSteps++;

          if (this.options.stopOnError && !step.optional) {
            this.currentPlan.status = 'failed';
            this.emitEvent({ type: 'plan_failed', planId: plan.id, failedStepId: step.id });
            break;
          }
        }

        // Report progress
        const progress = Math.round(((i + 1) / this.currentPlan.steps.length) * 100);
        this.callbacks.onProgress?.(progress, step);

        // Delay between steps (for visibility)
        if (this.options.stepDelay > 0 && i < this.currentPlan.steps.length - 1) {
          await this.sleep(this.options.stepDelay);
        }
      }

      // Determine final status
      if (this.currentPlan.status === 'running') {
        this.currentPlan.status = failedSteps > 0 ? 'failed' : 'completed';
      }

      const durationMs = Date.now() - startTime;
      this.currentPlan.actualDurationMs = durationMs;
      this.currentPlan.updatedAt = Date.now();

      if (this.currentPlan.status === 'completed') {
        this.emitEvent({ type: 'plan_completed', planId: plan.id, durationMs });
      }

      const result: PlanExecutionResult = {
        success: this.currentPlan.status === 'completed',
        plan: this.currentPlan,
        durationMs,
        completedSteps,
        failedSteps,
        skippedSteps,
      };

      this.callbacks.onPlanComplete?.(result);
      return result;

    } catch (error) {
      this.currentPlan.status = 'failed';
      const durationMs = Date.now() - startTime;

      return {
        success: false,
        plan: this.currentPlan,
        durationMs,
        completedSteps,
        failedSteps: failedSteps + 1,
        skippedSteps,
      };
    }
  }

  /**
   * Execute a single step.
   */
  async executeStep(step: PlanStep): Promise<{ success: boolean; message: string }> {
    const stepStartTime = Date.now();
    step.status = 'running';

    this.emitEvent({ type: 'step_started', planId: this.currentPlan!.id, stepId: step.id });
    this.callbacks.onStepStart?.(step);

    try {
      // Execute all actions in the step
      for (const action of step.actions) {
        const result = await this.actionExecutor.execute(action);

        if (!result.success) {
          step.status = 'failed';
          step.errorMessage = result.error || result.message || 'Action failed';
          step.durationMs = Date.now() - stepStartTime;

          const errorMsg = step.errorMessage || 'Unknown error';
          this.emitEvent({
            type: 'step_failed',
            planId: this.currentPlan!.id,
            stepId: step.id,
            errorMessage: errorMsg,
          });

          this.callbacks.onStepComplete?.(step, { success: false, message: errorMsg });
          return { success: false, message: errorMsg };
        }
      }

      // All actions succeeded
      step.status = 'completed';
      step.resultMessage = 'Completed successfully';
      step.durationMs = Date.now() - stepStartTime;

      this.emitEvent({
        type: 'step_completed',
        planId: this.currentPlan!.id,
        stepId: step.id,
        resultMessage: step.resultMessage,
      });

      this.callbacks.onStepComplete?.(step, { success: true, message: step.resultMessage });
      return { success: true, message: step.resultMessage };

    } catch (error) {
      step.status = 'failed';
      step.errorMessage = error instanceof Error ? error.message : 'Unknown error';
      step.durationMs = Date.now() - stepStartTime;

      this.emitEvent({
        type: 'step_failed',
        planId: this.currentPlan!.id,
        stepId: step.id,
        errorMessage: step.errorMessage,
      });

      this.callbacks.onStepComplete?.(step, { success: false, message: step.errorMessage });
      return { success: false, message: step.errorMessage };
    }
  }

  /**
   * Execute the next pending step only.
   */
  async executeNextStep(): Promise<{ success: boolean; step: PlanStep | null; message: string }> {
    if (!this.currentPlan) {
      return { success: false, step: null, message: 'No plan loaded' };
    }

    const nextStep = getNextPendingStep(this.currentPlan);
    if (!nextStep) {
      return { success: true, step: null, message: 'No more pending steps' };
    }

    if (!areDependenciesMet(this.currentPlan, nextStep)) {
      return { success: false, step: nextStep, message: 'Dependencies not met' };
    }

    const result = await this.executeStep(nextStep);
    return { ...result, step: nextStep };
  }

  /**
   * Pause execution.
   */
  pause(): void {
    if (this.currentPlan && this.currentPlan.status === 'running') {
      this.isPaused = true;
      this.currentPlan.status = 'paused';
      const currentStep = this.currentPlan.steps[this.currentPlan.currentStepIndex];
      this.emitEvent({
        type: 'plan_paused',
        planId: this.currentPlan.id,
        atStepId: currentStep?.id || '',
      });
    }
  }

  /**
   * Resume execution.
   */
  resume(): void {
    if (this.currentPlan && this.isPaused) {
      this.isPaused = false;
      this.currentPlan.status = 'running';
    }
  }

  /**
   * Cancel execution.
   */
  cancel(): void {
    this.isCancelled = true;
    this.isPaused = false;
  }

  /**
   * Load a plan for step-by-step execution.
   */
  loadPlan(plan: CopilotPlan): void {
    this.currentPlan = { ...plan, status: 'ready', updatedAt: Date.now() };
    this.isPaused = false;
    this.isCancelled = false;
  }

  /**
   * Get the current plan state.
   */
  getCurrentPlan(): CopilotPlan | null {
    return this.currentPlan;
  }

  /**
   * Skip a specific step.
   */
  skipStep(stepId: string): boolean {
    if (!this.currentPlan) return false;

    const step = this.currentPlan.steps.find(s => s.id === stepId);
    if (!step || step.status !== 'pending') return false;

    step.status = 'skipped';
    step.resultMessage = 'Skipped by user';
    this.emitEvent({ type: 'step_skipped', planId: this.currentPlan.id, stepId });
    return true;
  }

  /**
   * Update options.
   */
  setOptions(options: Partial<PlanExecutionOptions>): void {
    this.options = { ...this.options, ...options };
  }

  /**
   * Update callbacks.
   */
  setCallbacks(callbacks: PlanExecutionCallbacks): void {
    this.callbacks = { ...this.callbacks, ...callbacks };
  }

  // === Private Helpers ===

  private emitEvent(event: PlanEvent): void {
    this.callbacks.onEvent?.(event);
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// ============================================================================
// Factory Function
// ============================================================================

/**
 * Create a plan executor instance.
 */
export function createPlanExecutor(
  dispatch: AppDispatch,
  getState: () => RootState,
  options?: Partial<PlanExecutionOptions>,
  callbacks?: PlanExecutionCallbacks
): PlanExecutor {
  return new PlanExecutor(dispatch, getState, options, callbacks);
}
