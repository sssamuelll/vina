/**
 * ResultStore — accumulates step results during execution.
 *
 * Supports:
 * - Storing and retrieving results by step ID
 * - Resolving variable references like "$step1.result.field"
 * - Tracking and executing rollback functions
 * - Filtering successful results
 *
 * @module bridge/ResultStore
 */

import type { StepResult } from './types';

/**
 * Stores step results and provides variable resolution.
 */
export class ResultStore {
  /** Map of step ID to result */
  private results: Map<string, StepResult> = new Map();
  /** Ordered list of results for iteration */
  private orderedResults: StepResult[] = [];

  /**
   * Number of stored results.
   */
  get size(): number {
    return this.results.size;
  }

  /**
   * Add a step result to the store.
   */
  add(result: StepResult): void {
    this.results.set(result.stepId, result);
    this.orderedResults.push(result);
  }

  /**
   * Get a result by step ID.
   */
  get(stepId: string): StepResult | undefined {
    return this.results.get(stepId);
  }

  /**
   * Get all results in order they were added.
   */
  getAll(): StepResult[] {
    return [...this.orderedResults];
  }

  /**
   * Get only successful results.
   */
  getSuccessful(): StepResult[] {
    return this.orderedResults.filter(r => r.success);
  }

  /**
   * Resolve a variable reference like "$step1.result.field".
   * Returns the literal string if not a variable reference.
   */
  resolve(ref: string): unknown {
    // If not a variable reference, return literal
    if (!ref.startsWith('$')) {
      return ref;
    }

    // Parse: $stepId.result.path.to.field
    const withoutDollar = ref.slice(1);
    const parts = withoutDollar.split('.');
    const stepId = parts[0];

    const result = this.results.get(stepId);
    if (!result) {
      return undefined;
    }

    // parts[1] should be 'result', parts[2+] are the path into data
    if (parts[1] !== 'result') {
      return undefined;
    }

    // If just "$stepId.result", return the data
    if (parts.length === 2) {
      return result.data;
    }

    // Navigate the path into data
    let current: unknown = result.data;
    for (let i = 2; i < parts.length; i++) {
      if (current === null || current === undefined) {
        return undefined;
      }
      if (typeof current !== 'object') {
        return undefined;
      }
      current = (current as Record<string, unknown>)[parts[i]];
    }

    return current;
  }

  /**
   * Check if any results have rollback functions.
   */
  hasRollbacks(): boolean {
    return this.orderedResults.some(r => r.rollback !== undefined);
  }

  /**
   * Execute all rollback functions in reverse order.
   */
  rollbackAll(): void {
    // Iterate in reverse order
    for (let i = this.orderedResults.length - 1; i >= 0; i--) {
      const result = this.orderedResults[i];
      if (result.rollback) {
        result.rollback();
      }
    }
    this.clear();
  }

  /**
   * Clear all stored results.
   */
  clear(): void {
    this.results.clear();
    this.orderedResults = [];
  }
}
