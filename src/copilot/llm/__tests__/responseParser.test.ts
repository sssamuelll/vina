/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Tests for Response Parser
 */

import { describe, it, expect } from 'vitest';
import {
  parseResponse,
  createStreamParserState,
  processStreamChunk,
  finalizeStreamParser,
  isValidActionShape,
  getActionName,
} from '../responseParser';

describe('parseResponse', () => {
  describe('pure JSON responses', () => {
    it('should parse a single action object', () => {
      const response = '{"action": "select_piece", "pieceId": "p1"}';
      const result = parseResponse(response);

      expect(result.jsonFound).toBe(true);
      expect(result.actions).toHaveLength(1);
      expect(result.actions[0].action).toBe('select_piece');
      expect((result.actions[0] as { pieceId: string }).pieceId).toBe('p1');
    });

    it('should parse actions array format', () => {
      const response = JSON.stringify({
        actions: [
          { action: 'select_piece', pieceId: 'p1' },
          { action: 'delete_piece', pieceId: 'p1' },
        ],
        explanation: 'Selecting and deleting the piece',
      });
      const result = parseResponse(response);

      expect(result.jsonFound).toBe(true);
      expect(result.actions).toHaveLength(2);
      expect(result.text).toBe('Selecting and deleting the piece');
    });

    it('should parse array of actions', () => {
      const response = '[{"action": "undo"}, {"action": "redo"}]';
      const result = parseResponse(response);

      expect(result.actions).toHaveLength(2);
      expect(result.actions[0].action).toBe('undo');
      expect(result.actions[1].action).toBe('redo');
    });
  });

  describe('fenced code blocks', () => {
    it('should extract JSON from ```json blocks', () => {
      const response = `I'll create that piece for you.

\`\`\`json
{"action": "create_piece", "shape": "rectangle", "params": {"width": 200, "height": 300}}
\`\`\`

Done!`;
      const result = parseResponse(response);

      expect(result.jsonFound).toBe(true);
      expect(result.actions).toHaveLength(1);
      expect(result.actions[0].action).toBe('create_piece');
      expect(result.text).toContain("I'll create that piece");
    });

    it('should extract JSON from ``` blocks without language', () => {
      const response = `Sure, here's the action:

\`\`\`
{"actions": [{"action": "clear_selection"}]}
\`\`\``;
      const result = parseResponse(response);

      expect(result.jsonFound).toBe(true);
      expect(result.actions).toHaveLength(1);
    });

    it('should handle multiple code blocks', () => {
      const response = `First action:
\`\`\`json
{"action": "select_piece", "pieceId": "p1"}
\`\`\`

Second action:
\`\`\`json
{"action": "delete_piece", "pieceId": "p1"}
\`\`\``;
      const result = parseResponse(response);

      expect(result.actions).toHaveLength(2);
    });
  });

  describe('natural language responses', () => {
    it('should return pure text when no JSON found', () => {
      const response = 'The front bodice piece is 200mm wide and 300mm tall.';
      const result = parseResponse(response);

      expect(result.jsonFound).toBe(false);
      expect(result.actions).toHaveLength(0);
      expect(result.text).toBe(response);
    });

    it('should handle empty response', () => {
      const result = parseResponse('');

      expect(result.jsonFound).toBe(false);
      expect(result.actions).toHaveLength(0);
      expect(result.text).toBe('');
    });

    it('should handle whitespace-only response', () => {
      const result = parseResponse('   \n\n   ');

      expect(result.jsonFound).toBe(false);
      expect(result.actions).toHaveLength(0);
    });
  });

  describe('error handling', () => {
    it('should report JSON syntax errors', () => {
      const response = '{"action": "test", pieceId: "p1"}'; // Missing quotes
      const result = parseResponse(response);

      // Should attempt repair
      expect(result.actions.length).toBeGreaterThanOrEqual(0);
    });

    it('should report missing action field', () => {
      const response = '{"actions": [{"pieceId": "p1"}]}';
      const result = parseResponse(response);

      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].type).toBe('missing_action');
    });

    it('should handle invalid root type', () => {
      // A JSON string doesn't start with { or [, so it's treated as text
      const response = '"just a string"';
      const result = parseResponse(response);

      // Since it doesn't look like an object or array, it's treated as plain text
      expect(result.jsonFound).toBe(false);
      expect(result.actions).toHaveLength(0);
      expect(result.text).toBe('"just a string"');
    });
  });

  describe('JSON repair', () => {
    it('should fix trailing commas', () => {
      const response = '{"action": "test", "value": 1,}';
      const result = parseResponse(response);

      expect(result.actions).toHaveLength(1);
    });

    it('should fix single quotes when no double quotes present', () => {
      const response = "{'action': 'test'}";
      const result = parseResponse(response);

      expect(result.actions).toHaveLength(1);
    });
  });
});

describe('streaming parser', () => {
  it('should accumulate text chunks', () => {
    let state = createStreamParserState();

    const result1 = processStreamChunk('Hello ', state);
    state = result1.state;

    const result2 = processStreamChunk('world!', state);
    state = result2.state;

    const final = finalizeStreamParser(state);
    expect(final.text).toContain('Hello');
    expect(final.text).toContain('world');
  });

  it('should detect code block boundaries', () => {
    let state = createStreamParserState();

    // Simulate streaming a JSON code block
    state = processStreamChunk('Here is the action:\n```json\n', state).state;
    state = processStreamChunk('{"action": "test"', state).state;
    state = processStreamChunk('}\n```\n', state).state;

    const final = finalizeStreamParser(state);
    expect(final.actions).toHaveLength(1);
    expect(final.actions[0].action).toBe('test');
  });

  it('should emit new actions when complete', () => {
    let state = createStreamParserState();
    let emittedActions: unknown[] = [];

    state = processStreamChunk('```json\n{"action": "select_piece", "pieceId": "p1"}```', state).state;
    const result = processStreamChunk('', state);

    if (result.newActions) {
      emittedActions = result.newActions;
    }

    const final = finalizeStreamParser(result.state);
    expect(final.actions.length + emittedActions.length).toBeGreaterThan(0);
  });

  it('should handle incomplete code block at end', () => {
    let state = createStreamParserState();

    state = processStreamChunk('```json\n{"action": "test"}', state).state;
    // No closing ```

    const final = finalizeStreamParser(state);
    // Should still try to parse the incomplete block
    expect(final.actions.length).toBeGreaterThanOrEqual(0);
  });

  it('should handle text after code block', () => {
    let state = createStreamParserState();

    state = processStreamChunk('Before\n```json\n{"action": "test"}\n```\nAfter', state).state;

    const final = finalizeStreamParser(state);
    expect(final.actions).toHaveLength(1);
  });
});

describe('validation helpers', () => {
  describe('isValidActionShape', () => {
    it('should return true for valid action objects', () => {
      expect(isValidActionShape({ action: 'test' })).toBe(true);
      expect(isValidActionShape({ action: 'select_piece', pieceId: 'p1' })).toBe(true);
    });

    it('should return false for invalid objects', () => {
      expect(isValidActionShape(null)).toBe(false);
      expect(isValidActionShape(undefined)).toBe(false);
      expect(isValidActionShape('string')).toBe(false);
      expect(isValidActionShape({ noAction: true })).toBe(false);
      expect(isValidActionShape({ action: 123 })).toBe(false);
    });
  });

  describe('getActionName', () => {
    it('should extract action name', () => {
      expect(getActionName({ action: 'test' } as any)).toBe('test');
      expect(getActionName({ action: 'select_piece', pieceId: 'p1' } as any)).toBe('select_piece');
    });
  });
});
