/**
 * SummaryGenerator — creates template-based summaries from step results.
 *
 * Generates expandable summaries for showing execution results in the UI.
 * All data comes from actual tool results — no LLM involvement.
 *
 * @module bridge/SummaryGenerator
 */

import type { StepResult, ExpandableSummary } from './types';

/**
 * Data shape for modification results with before/after values.
 */
interface ModificationData {
  pieceId?: string;
  oldValue?: number;
  newValue?: number;
  unit?: string;
}

/**
 * Data shape for measurement results.
 */
interface MeasurementData {
  pieceId?: string;
  measurement?: number;
  unit?: string;
}

/**
 * Type guard to check if data has modification values.
 */
function isModificationData(data: unknown): data is ModificationData {
  if (typeof data !== 'object' || data === null) return false;
  const d = data as Record<string, unknown>;
  return 'oldValue' in d && 'newValue' in d;
}

/**
 * Type guard to check if data has measurement values.
 */
function isMeasurementData(data: unknown): data is MeasurementData {
  if (typeof data !== 'object' || data === null) return false;
  const d = data as Record<string, unknown>;
  return 'measurement' in d && !('oldValue' in d);
}

/**
 * Generates template-based summaries from step results.
 */
export class SummaryGenerator {
  /**
   * Generate an expandable summary from step results.
   *
   * @param intent - The user's intent that was executed
   * @param results - Array of step results
   * @param durationMs - Optional execution duration in milliseconds
   * @returns An expandable summary with short text and details
   */
  generate(
    intent: string,
    results: StepResult[],
    durationMs?: number
  ): ExpandableSummary {
    const short = this.generateShortSummary(intent, results);
    const details = this.generateDetails(results, durationMs);

    return { short, details };
  }

  /**
   * Format an intent string into readable text.
   * Handles snake_case, camelCase, and kebab-case.
   *
   * @param intent - The intent string to format
   * @returns Human-readable text
   */
  formatIntent(intent: string): string {
    // First handle snake_case and kebab-case
    let result = intent.replace(/[_-]/g, ' ');

    // Then handle camelCase - insert space before capital letters
    result = result.replace(/([a-z])([A-Z])/g, '$1 $2');

    // Lowercase everything then capitalize first letter
    result = result.toLowerCase();
    result = result.charAt(0).toUpperCase() + result.slice(1);

    return result;
  }

  /**
   * Generate the short summary text.
   */
  private generateShortSummary(intent: string, results: StepResult[]): string {
    const successCount = results.filter(r => r.success).length;
    const totalCount = results.length;

    if (totalCount === 0) {
      return `Completed ${intent}`;
    }

    if (successCount === totalCount) {
      return `Completed ${intent} (${totalCount} steps)`;
    }

    return `Completed ${intent} (${successCount}/${totalCount} steps)`;
  }

  /**
   * Generate the detail lines from results.
   */
  private generateDetails(
    results: StepResult[],
    durationMs?: number
  ): string[] {
    const details: string[] = [];

    // Add modification and measurement details
    for (const result of results) {
      const detail = this.formatResultDetail(result);
      if (detail) {
        details.push(detail);
      }
    }

    // Add summary statistics if we have results
    if (results.length > 0) {
      const successCount = results.filter(r => r.success).length;
      let statsLine = `${successCount} of ${results.length} steps completed`;

      if (durationMs !== undefined) {
        const durationSec = (durationMs / 1000).toFixed(1);
        statsLine += ` in ${durationSec}s`;
      }

      details.push(statsLine);
    }

    return details;
  }

  /**
   * Format an individual step result as a detail line.
   * Returns null if the result doesn't have formattable data.
   */
  private formatResultDetail(result: StepResult): string | null {
    if (!result.success || !result.data) {
      return null;
    }

    // Format modification results (before/after values)
    if (isModificationData(result.data)) {
      const { pieceId, oldValue, newValue, unit } = result.data;
      const unitStr = unit ? ` ${unit}` : '';
      const pieceStr = pieceId || 'value';
      return `${pieceStr}: ${oldValue}${unitStr} -> ${newValue}${unitStr}`;
    }

    // Format measurement results
    if (isMeasurementData(result.data)) {
      const { pieceId, measurement, unit } = result.data;
      const unitStr = unit ? ` ${unit}` : '';
      const pieceStr = pieceId || 'measurement';
      return `${pieceStr}: ${measurement}${unitStr}`;
    }

    return null;
  }
}
