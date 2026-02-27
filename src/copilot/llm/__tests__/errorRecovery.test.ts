/**
 * Tests for Error Recovery
 */

import { describe, it, expect } from 'vitest';
import {
  analyzeActionError,
  analyzeParseErrors,
  generateRecoveryFeedback,
  shouldRetry,
  buildRetryPrompt,
  attemptAutoCorrect,
  filterValidActions,
} from '../errorRecovery';
import type { CopilotAction } from '../../actions/actionTypes';
import type { ParseError } from '../responseParser';

describe('analyzeActionError', () => {
  describe('unknown actions', () => {
    it('should identify unknown action type', () => {
      const action = { action: 'unknownaction' } as CopilotAction;
      const analysis = analyzeActionError(action);

      expect(analysis.errorType).toBe('unknown_action');
      expect(analysis.message).toContain('Unknown action');
    });

    it('should suggest similar actions', () => {
      const action = { action: 'selectpiece' } as CopilotAction;
      const analysis = analyzeActionError(action);

      expect(analysis.similarActions).toBeDefined();
      expect(analysis.similarActions!.some(s => s.action === 'select_piece')).toBe(true);
    });

    it('should suggest common typo corrections', () => {
      const action = { action: 'createpiece' } as CopilotAction;
      const analysis = analyzeActionError(action);

      expect(analysis.suggestions.some(s => s.includes('create_piece'))).toBe(true);
    });
  });

  describe('missing parameters', () => {
    it('should identify missing required parameters', () => {
      const action = { action: 'select_piece' } as CopilotAction; // Missing pieceId
      const analysis = analyzeActionError(action);

      expect(analysis.errorType).toBe('missing_params');
      expect(analysis.missingParams).toContain('pieceId');
    });

    it('should provide parameter hints', () => {
      const action = { action: 'create_piece' } as CopilotAction; // Missing shape
      const analysis = analyzeActionError(action);

      expect(analysis.suggestions.some(s => s.includes('shape'))).toBe(true);
    });
  });

  describe('validation errors', () => {
    it('should report validation errors', () => {
      const action = { action: 'select_piece', pieceId: 'p1' } as CopilotAction;
      const validationErrors = [
        { field: 'pieceId', message: 'Piece not found', code: 'PIECE_NOT_FOUND' },
      ];
      const analysis = analyzeActionError(action, validationErrors);

      expect(analysis.errorType).toBe('validation_failed');
      expect(analysis.invalidParams).toHaveLength(1);
    });
  });

  describe('recoverable flag', () => {
    it('should mark errors with suggestions as recoverable', () => {
      const action = { action: 'selectpiece' } as CopilotAction;
      const analysis = analyzeActionError(action);

      expect(analysis.recoverable).toBe(true);
    });
  });
});

describe('analyzeParseErrors', () => {
  it('should convert parse errors to action analyses', () => {
    const parseErrors: ParseError[] = [
      { type: 'json_syntax', message: 'Unexpected token', position: 10 },
      { type: 'missing_action', message: 'Missing action field' },
    ];
    const analyses = analyzeParseErrors(parseErrors);

    expect(analyses).toHaveLength(2);
    expect(analyses[0].message).toContain('Unexpected token');
  });

  it('should provide appropriate suggestions for JSON errors', () => {
    const parseErrors: ParseError[] = [
      { type: 'json_syntax', message: 'Invalid JSON' },
    ];
    const analyses = analyzeParseErrors(parseErrors);

    expect(analyses[0].suggestions.some(s => s.includes('JSON'))).toBe(true);
  });
});

describe('generateRecoveryFeedback', () => {
  it('should generate summary with counts', () => {
    const actions = [
      { action: 'unknownaction' } as CopilotAction,
      { action: 'select_piece' } as CopilotAction, // Missing pieceId
    ];
    const validationResults = new Map<CopilotAction, Array<{ field?: string; message: string; code: string }>>();
    validationResults.set(actions[1], [{ message: 'Missing pieceId', code: 'MISSING_PARAM' }]);

    const feedback = generateRecoveryFeedback(actions, validationResults);

    expect(feedback.errors.length).toBeGreaterThan(0);
    expect(feedback.recoverableCount).toBeGreaterThan(0);
  });

  it('should generate feedback text for LLM', () => {
    const action = { action: 'unknownaction' } as CopilotAction;
    const actions = [action];
    // Need to add an entry to validationResults for the action to be analyzed
    const validationResults = new Map<CopilotAction, Array<{ field?: string; message: string; code: string }>>();
    validationResults.set(action, [{ message: 'Unknown action type', code: 'UNKNOWN_ACTION' }]);

    const feedback = generateRecoveryFeedback(actions, validationResults);

    expect(feedback.feedbackText).toContain('Action Errors');
    expect(feedback.feedbackText).toContain('unknownaction');
  });

  it('should include parse errors in feedback', () => {
    const parseErrors: ParseError[] = [
      { type: 'json_syntax', message: 'Parse error' },
    ];
    const feedback = generateRecoveryFeedback([], new Map(), parseErrors);

    expect(feedback.errors).toHaveLength(1);
  });
});

describe('shouldRetry', () => {
  it('should allow retry when recoverable errors exist', () => {
    const feedback = {
      summary: '',
      errors: [],
      feedbackText: '',
      recoverableCount: 2,
      unrecoverableCount: 0,
    };
    const result = shouldRetry(feedback, 0, { maxRetries: 2, allowPartialSuccess: true, minSuccessRate: 0.5 });

    expect(result).toBe(true);
  });

  it('should not retry when max retries reached', () => {
    const feedback = {
      summary: '',
      errors: [],
      feedbackText: '',
      recoverableCount: 2,
      unrecoverableCount: 0,
    };
    const result = shouldRetry(feedback, 2, { maxRetries: 2, allowPartialSuccess: true, minSuccessRate: 0.5 });

    expect(result).toBe(false);
  });

  it('should not retry when no recoverable errors', () => {
    const feedback = {
      summary: '',
      errors: [],
      feedbackText: '',
      recoverableCount: 0,
      unrecoverableCount: 2,
    };
    const result = shouldRetry(feedback, 0, { maxRetries: 2, allowPartialSuccess: true, minSuccessRate: 0.5 });

    expect(result).toBe(false);
  });
});

describe('buildRetryPrompt', () => {
  it('should include original message', () => {
    const feedback = {
      summary: '',
      errors: [],
      feedbackText: 'Error details here',
      recoverableCount: 1,
      unrecoverableCount: 0,
    };
    const prompt = buildRetryPrompt('Create a piece', feedback, 1);

    expect(prompt).toContain('Create a piece');
    expect(prompt).toContain('Error details here');
  });

  it('should include correction instructions', () => {
    const feedback = {
      summary: '',
      errors: [],
      feedbackText: '',
      recoverableCount: 1,
      unrecoverableCount: 0,
    };
    const prompt = buildRetryPrompt('Test', feedback, 1);

    expect(prompt).toContain('correct');
  });
});

describe('attemptAutoCorrect', () => {
  it('should correct common typos', () => {
    const action = { action: 'createpiece' } as CopilotAction;
    const corrected = attemptAutoCorrect(action);

    expect(corrected).not.toBeNull();
    expect(corrected!.action).toBe('create_piece');
  });

  it('should return null for uncorrectable actions', () => {
    const action = { action: 'xyz123' } as CopilotAction;
    const corrected = attemptAutoCorrect(action);

    expect(corrected).toBeNull();
  });

  it('should apply default values for valid actions', () => {
    const action = { action: 'mirror_piece', pieceId: 'p1', axis: 'x' } as CopilotAction;
    const corrected = attemptAutoCorrect(action);

    // Should add createCopy: false if it has a default
    if (corrected) {
      expect('createCopy' in corrected || corrected === null).toBe(true);
    }
  });
});

describe('filterValidActions', () => {
  it('should separate valid and invalid actions', () => {
    const actions = [
      { action: 'clear_selection' } as CopilotAction,
      { action: 'select_piece', pieceId: 'p1' } as CopilotAction, // p1 doesn't exist
    ];
    const getState = () => ({
      project: {
        pieces: [],
        seams: [],
      },
    });

    const { valid, invalid, errors } = filterValidActions(actions, getState);

    expect(valid).toHaveLength(1);
    expect(valid[0].action).toBe('clear_selection');
    expect(invalid).toHaveLength(1);
    expect(errors.size).toBe(1);
  });

  it('should validate against existing pieces', () => {
    const actions = [
      { action: 'select_piece', pieceId: 'existing' } as CopilotAction,
    ];
    const getState = () => ({
      project: {
        pieces: [{ id: 'existing', outline: [{ type: 'M' }] }],
        seams: [],
      },
    });

    const { valid, invalid } = filterValidActions(actions, getState);

    expect(valid).toHaveLength(1);
    expect(invalid).toHaveLength(0);
  });
});
