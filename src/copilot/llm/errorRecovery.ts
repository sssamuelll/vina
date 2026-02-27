/**
 * Error Recovery — handles invalid actions with correction and retry logic.
 *
 * When the LLM produces invalid actions, this module:
 * - Identifies the specific error (unknown action, missing params, etc.)
 * - Generates correction hints for the LLM
 * - Provides similar action suggestions
 * - Enables retry with feedback
 *
 * @module errorRecovery
 */

import type { CopilotAction } from '../actions/actionTypes';
import { validateAction } from '../actions/actionValidator';

/** Validation error for action feedback */
interface ValidationError {
  field?: string;
  message: string;
  code: string;
}

/** Convert string errors to ValidationError objects */
function toValidationErrors(errors: string[]): ValidationError[] {
  return errors.map(e => ({ message: e, code: 'validation_error' }));
}
import { getAllActionSchemas, getActionSchema, type ActionSchema } from './actionSchemas';
import type { ParseError } from './responseParser';

// ============================================================================
// Types
// ============================================================================

/**
 * Complete error analysis for an action.
 */
export interface ActionErrorAnalysis {
  /** The original action that failed */
  action: CopilotAction;
  /** Type of error encountered */
  errorType: 'unknown_action' | 'missing_params' | 'invalid_params' | 'validation_failed';
  /** Human-readable error message */
  message: string;
  /** Suggested corrections */
  suggestions: string[];
  /** Similar valid actions (for unknown action errors) */
  similarActions?: ActionSchema[];
  /** Missing required parameters */
  missingParams?: string[];
  /** Invalid parameter values */
  invalidParams?: Array<{ name: string; value: unknown; expected: string }>;
  /** Whether this error is recoverable */
  recoverable: boolean;
}

/**
 * Recovery feedback to send back to the LLM.
 */
export interface RecoveryFeedback {
  /** Overall summary of errors */
  summary: string;
  /** Detailed error analyses */
  errors: ActionErrorAnalysis[];
  /** Formatted feedback for LLM prompt */
  feedbackText: string;
  /** Number of recoverable errors */
  recoverableCount: number;
  /** Number of unrecoverable errors */
  unrecoverableCount: number;
}

// ============================================================================
// Action Name Similarity
// ============================================================================

/**
 * Calculate Levenshtein distance between two strings.
 */
function levenshteinDistance(a: string, b: string): number {
  const matrix: number[][] = [];

  for (let i = 0; i <= b.length; i++) {
    matrix[i] = [i];
  }

  for (let j = 0; j <= a.length; j++) {
    matrix[0][j] = j;
  }

  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      if (b.charAt(i - 1) === a.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1,
          matrix[i][j - 1] + 1,
          matrix[i - 1][j] + 1
        );
      }
    }
  }

  return matrix[b.length][a.length];
}

/**
 * Find similar action names to an unknown action.
 */
function findSimilarActions(unknownAction: string, maxResults = 3): ActionSchema[] {
  const allSchemas = getAllActionSchemas();

  // Calculate distances
  const scored = allSchemas.map(schema => ({
    schema,
    distance: levenshteinDistance(unknownAction.toLowerCase(), schema.action.toLowerCase()),
  }));

  // Sort by distance and take top results
  scored.sort((a, b) => a.distance - b.distance);

  // Only return if reasonably similar (distance < half the length)
  const threshold = Math.max(unknownAction.length / 2, 3);
  return scored
    .filter(s => s.distance < threshold)
    .slice(0, maxResults)
    .map(s => s.schema);
}

/**
 * Check if action name contains common typo patterns.
 */
function suggestActionCorrection(unknownAction: string): string | null {
  const normalizedAction = unknownAction.toLowerCase();

  // Common typo patterns
  const typoMap: Record<string, string> = {
    'createpiece': 'create_piece',
    'create-piece': 'create_piece',
    'newpiece': 'create_piece',
    'addpiece': 'create_piece',
    'deletepiece': 'delete_piece',
    'delete-piece': 'delete_piece',
    'removepiece': 'delete_piece',
    'selectpiece': 'select_piece',
    'select-piece': 'select_piece',
    'selectall': 'select_pieces',
    'clearselection': 'clear_selection',
    'clear-selection': 'clear_selection',
    'deselect': 'clear_selection',
    'startsim': 'start_simulation',
    'start-simulation': 'start_simulation',
    'runsimulation': 'start_simulation',
    'stopsim': 'stop_simulation',
    'stop-simulation': 'stop_simulation',
    'pausesimulation': 'stop_simulation',
    'switchview': 'switch_view',
    'changeview': 'switch_view',
    'view2d': 'switch_view',
    'view3d': 'switch_view',
  };

  return typoMap[normalizedAction] || null;
}

// ============================================================================
// Error Analysis
// ============================================================================

/**
 * Analyze a single action for errors.
 */
export function analyzeActionError(
  action: CopilotAction,
  validationErrors?: ValidationError[]
): ActionErrorAnalysis {
  const actionName = action.action;
  const schema = getActionSchema(actionName);

  // Case 1: Unknown action type
  if (!schema) {
    const similarActions = findSimilarActions(actionName);
    const correction = suggestActionCorrection(actionName);
    const suggestions: string[] = [];

    if (correction) {
      suggestions.push(`Did you mean "${correction}"?`);
    }

    if (similarActions.length > 0) {
      suggestions.push(`Similar actions: ${similarActions.map(s => s.action).join(', ')}`);
    }

    return {
      action,
      errorType: 'unknown_action',
      message: `Unknown action "${actionName}"`,
      suggestions,
      similarActions,
      recoverable: similarActions.length > 0 || correction !== null,
    };
  }

  // Case 2: Missing required parameters
  const missingParams = schema.parameters
    .filter(p => p.required && !(p.name in action))
    .map(p => p.name);

  if (missingParams.length > 0) {
    return {
      action,
      errorType: 'missing_params',
      message: `Action "${actionName}" missing required parameters: ${missingParams.join(', ')}`,
      suggestions: missingParams.map(p => {
        const paramSchema = schema.parameters.find(ps => ps.name === p);
        return `Add "${p}" (${paramSchema?.type || 'unknown'}): ${paramSchema?.description || ''}`;
      }),
      missingParams,
      recoverable: true,
    };
  }

  // Case 3: Validation errors from validator
  if (validationErrors && validationErrors.length > 0) {
    const invalidParams = validationErrors
      .filter(e => e.field)
      .map(e => ({
        name: e.field!,
        value: (action as unknown as Record<string, unknown>)[e.field!],
        expected: e.message,
      }));

    return {
      action,
      errorType: 'validation_failed',
      message: validationErrors.map(e => e.message).join('; '),
      suggestions: validationErrors.map(e => {
        if (e.field) {
          const paramSchema = schema.parameters.find(ps => ps.name === e.field);
          if (paramSchema?.enum) {
            return `"${e.field}" must be one of: ${paramSchema.enum.join(', ')}`;
          }
          return `Fix "${e.field}": ${e.message}`;
        }
        return e.message;
      }),
      invalidParams,
      recoverable: true,
    };
  }

  // No errors found
  return {
    action,
    errorType: 'validation_failed',
    message: 'Unknown validation error',
    suggestions: [],
    recoverable: false,
  };
}

/**
 * Analyze parsing errors from the response parser.
 */
export function analyzeParseErrors(errors: ParseError[]): ActionErrorAnalysis[] {
  return errors.map(error => ({
    action: { action: 'unknown' } as unknown as CopilotAction,
    errorType: error.type === 'json_syntax' ? 'invalid_params' : 'unknown_action',
    message: error.message,
    suggestions: error.type === 'json_syntax'
      ? ['Ensure the response is valid JSON', 'Check for trailing commas or unquoted keys']
      : ['Ensure each action has an "action" field'],
    recoverable: true,
  }));
}

// ============================================================================
// Recovery Feedback Generation
// ============================================================================

/**
 * Generate recovery feedback for a batch of failed actions.
 */
export function generateRecoveryFeedback(
  actions: CopilotAction[],
  validationResults: Map<CopilotAction, ValidationError[]>,
  parseErrors: ParseError[] = []
): RecoveryFeedback {
  const errors: ActionErrorAnalysis[] = [];

  // Analyze each action
  for (const action of actions) {
    const validationErrors = validationResults.get(action);
    if (validationErrors && validationErrors.length > 0) {
      errors.push(analyzeActionError(action, validationErrors));
    }
  }

  // Analyze parse errors
  errors.push(...analyzeParseErrors(parseErrors));

  const recoverableCount = errors.filter(e => e.recoverable).length;
  const unrecoverableCount = errors.length - recoverableCount;

  // Generate summary
  const summary = errors.length === 0
    ? 'No errors found'
    : `${errors.length} error(s) found: ${recoverableCount} recoverable, ${unrecoverableCount} unrecoverable`;

  // Generate feedback text for LLM
  const feedbackText = formatFeedbackForLLM(errors);

  return {
    summary,
    errors,
    feedbackText,
    recoverableCount,
    unrecoverableCount,
  };
}

/**
 * Format error feedback as text for the LLM to understand and correct.
 */
function formatFeedbackForLLM(errors: ActionErrorAnalysis[]): string {
  if (errors.length === 0) return '';

  const lines: string[] = [
    '## Action Errors\n',
    'The following actions had errors and need correction:\n',
  ];

  for (const error of errors) {
    lines.push(`### ${error.action.action}`);
    lines.push(`**Error**: ${error.message}`);

    if (error.suggestions.length > 0) {
      lines.push('**Suggestions**:');
      for (const suggestion of error.suggestions) {
        lines.push(`  - ${suggestion}`);
      }
    }

    if (error.missingParams && error.missingParams.length > 0) {
      lines.push(`**Missing parameters**: ${error.missingParams.join(', ')}`);
    }

    if (error.similarActions && error.similarActions.length > 0) {
      lines.push('**Did you mean one of these?**');
      for (const similar of error.similarActions) {
        lines.push(`  - \`${similar.action}\`: ${similar.description}`);
      }
    }

    lines.push('');
  }

  lines.push('Please correct the actions and try again.');

  return lines.join('\n');
}

// ============================================================================
// Retry Logic
// ============================================================================

/**
 * Options for retry behavior.
 */
export interface RetryOptions {
  /** Maximum number of retry attempts */
  maxRetries: number;
  /** Whether to allow partial success (some actions succeed) */
  allowPartialSuccess: boolean;
  /** Minimum percentage of actions that must succeed */
  minSuccessRate: number;
}

const DEFAULT_RETRY_OPTIONS: RetryOptions = {
  maxRetries: 2,
  allowPartialSuccess: true,
  minSuccessRate: 0.5,
};

/**
 * Determine if a retry should be attempted based on error analysis.
 */
export function shouldRetry(
  feedback: RecoveryFeedback,
  attemptNumber: number,
  options: RetryOptions = DEFAULT_RETRY_OPTIONS
): boolean {
  // Don't exceed max retries
  if (attemptNumber >= options.maxRetries) {
    return false;
  }

  // If no recoverable errors, don't retry
  if (feedback.recoverableCount === 0) {
    return false;
  }

  // If partial success is allowed and we have some success
  if (options.allowPartialSuccess && feedback.recoverableCount > 0) {
    return true;
  }

  return true;
}

/**
 * Build a retry prompt with error feedback.
 */
export function buildRetryPrompt(
  originalMessage: string,
  feedback: RecoveryFeedback,
  /* eslint-disable-next-line @typescript-eslint/no-unused-vars */
  _attemptNumber: number
): string {
  return `
The previous response had errors. Please correct them:

${feedback.feedbackText}

---

Original request: ${originalMessage}

Please provide corrected actions. Remember to:
1. Use valid action names from the available actions list
2. Include all required parameters
3. Use correct parameter types and values
`;
}

// ============================================================================
// Action Correction Helpers
// ============================================================================

/**
 * Attempt to auto-correct simple errors in an action.
 * Returns the corrected action or null if correction isn't possible.
 */
export function attemptAutoCorrect(action: CopilotAction): CopilotAction | null {
  const actionName = action.action;
  const schema = getActionSchema(actionName);

  // Try to correct the action name
  if (!schema) {
    const correction = suggestActionCorrection(actionName);
    if (correction) {
      return { ...action, action: correction } as CopilotAction;
    }
    return null;
  }

  // Apply default values for missing optional parameters
  const corrected = { ...action } as Record<string, unknown>;
  let changed = false;

  for (const param of schema.parameters) {
    if (param.default !== undefined && !(param.name in corrected)) {
      corrected[param.name] = param.default;
      changed = true;
    }
  }

  return changed ? (corrected as unknown as CopilotAction) : null;
}

/**
 * Minimal state for action filtering.
 */
interface MinimalState {
  project: {
    pieces: Array<{ id: string; outline: Array<{ type: string }>; name?: string }>;
    seams: Array<{ id: string }>;
  };
}

/**
 * Filter actions to only include valid ones.
 */
export function filterValidActions(
  actions: CopilotAction[],
  getState: () => MinimalState
): { valid: CopilotAction[]; invalid: CopilotAction[]; errors: Map<CopilotAction, ValidationError[]> } {
  const valid: CopilotAction[] = [];
  const invalid: CopilotAction[] = [];
  const errors = new Map<CopilotAction, ValidationError[]>();

  for (const action of actions) {
    const state = getState();

    const validation = validateAction(action, state as unknown as Parameters<typeof validateAction>[1]);

    if (validation.valid) {
      valid.push(action);
    } else {
      invalid.push(action);
      errors.set(action, toValidationErrors(validation.errors));
    }
  }

  return { valid, invalid, errors };
}
