/**
 * Reasoner — analyzes step failures and decides on recovery strategies.
 *
 * Uses an LLM to make intelligent decisions about how to handle errors:
 * - Retry with modified parameters
 * - Use an alternative step
 * - Ask the user for clarification
 * - Abort the execution
 *
 * @module bridge/Reasoner
 */

import type { ReasonerInput, ReasonerDecision, Step, StepResult } from './types';
import { isExecuteStep } from './types';

// ─── Types ───────────────────────────────────────────────────────────────────

/**
 * LLM function type for the Reasoner.
 * Takes a prompt string and returns a ReasonerDecision.
 */
export type ReasonerLLM = (prompt: string) => Promise<ReasonerDecision>;

// ─── Valid Actions ───────────────────────────────────────────────────────────

const VALID_ACTIONS = ['retry', 'alternative', 'askUser', 'abort'] as const;

// ─── Reasoner Class ──────────────────────────────────────────────────────────

/**
 * Analyzes step failures and decides on recovery strategies using LLM.
 */
export class Reasoner {
  private llm: ReasonerLLM;

  /**
   * Create a new Reasoner instance.
   *
   * @param llm - LLM function for making recovery decisions
   */
  constructor(llm: ReasonerLLM) {
    this.llm = llm;
  }

  /**
   * Analyze a failed step and decide how to recover.
   *
   * @param input - The reasoner input containing failure context
   * @returns A decision on how to proceed
   */
  async analyze(input: ReasonerInput): Promise<ReasonerDecision> {
    const prompt = this.buildPrompt(input);

    try {
      const response = await this.llm(prompt);
      return this.validateResponse(response);
    } catch (error) {
      // Handle LLM errors gracefully
      const errorMessage = error instanceof Error ? error.message : String(error);
      return {
        action: 'abort',
        reason: `Reasoner error: ${errorMessage}`,
      };
    }
  }

  /**
   * Build the prompt for the LLM with full error context.
   */
  private buildPrompt(input: ReasonerInput): string {
    const { failedStep, error, resultsSoFar, originalIntent } = input;

    // Build step details
    const stepDetails = this.formatStepDetails(failedStep);

    // Build previous results context
    const resultsContext = this.formatResultsContext(resultsSoFar);

    return `You are an error recovery assistant for a pattern modification system.

A step in the execution plan has failed. Analyze the error and decide how to proceed.

## Original Intent
${originalIntent}

## Failed Step
${stepDetails}

## Error
${error}

## Previous Results
${resultsContext}

## Available Actions
1. **retry** - Retry the step with modified parameters (provide newParams)
2. **alternative** - Use a different step instead (provide newStep)
3. **askUser** - Ask the user for clarification (provide question and options)
4. **abort** - Cannot recover, abort the execution (provide reason)

Respond with a JSON object containing:
- action: one of "retry", "alternative", "askUser", "abort"
- For retry: include "newParams" with modified parameters
- For alternative: include "newStep" with the replacement step
- For askUser: include "question" and "options" array
- For abort: include "reason" explaining why recovery is not possible`;
  }

  /**
   * Format step details for the prompt.
   */
  private formatStepDetails(step: Step): string {
    const lines = [
      `Type: ${step.type}`,
      `ID: ${step.id}`,
      `Label: ${step.label}`,
    ];

    if (isExecuteStep(step)) {
      lines.push(`Tool: ${step.tool}`);
      lines.push(`Params: ${JSON.stringify(step.params, null, 2)}`);
    } else {
      lines.push(`Input: ${step.input}`);
      lines.push(`Decide: ${step.decide}`);
    }

    return lines.join('\n');
  }

  /**
   * Format previous results for the prompt context.
   */
  private formatResultsContext(results: StepResult[]): string {
    if (results.length === 0) {
      return 'No previous results.';
    }

    return results
      .map((r) => {
        const status = r.success ? 'SUCCESS' : 'FAILED';
        const data = r.data ? JSON.stringify(r.data) : 'none';
        const error = r.error ? `, Error: ${r.error}` : '';
        return `- Step ${r.stepId}: ${status}, Data: ${data}${error}`;
      })
      .join('\n');
  }

  /**
   * Validate the LLM response and ensure it has a valid action.
   */
  private validateResponse(response: unknown): ReasonerDecision {
    // Check if response is an object
    if (typeof response !== 'object' || response === null) {
      return {
        action: 'abort',
        reason: 'Invalid reasoner response: not an object',
      };
    }

    const obj = response as Record<string, unknown>;

    // Check if action is valid
    if (!this.isValidAction(obj.action)) {
      return {
        action: 'abort',
        reason: `Invalid reasoner response: action must be one of ${VALID_ACTIONS.join(', ')}`,
      };
    }

    // Return the validated decision
    return {
      action: obj.action,
      newParams: obj.newParams as Record<string, unknown> | undefined,
      newStep: obj.newStep as Step | undefined,
      question: obj.question as string | undefined,
      options: obj.options as string[] | undefined,
      reason: obj.reason as string | undefined,
    };
  }

  /**
   * Check if an action is valid.
   */
  private isValidAction(action: unknown): action is ReasonerDecision['action'] {
    return typeof action === 'string' && VALID_ACTIONS.includes(action as typeof VALID_ACTIONS[number]);
  }
}
