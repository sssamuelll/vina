/**
 * Response Parser — extracts actions and text from LLM responses.
 *
 * Handles various response formats:
 * - Pure JSON action responses
 * - Natural text with embedded JSON blocks
 * - Streaming partial responses
 * - Malformed JSON with error recovery
 *
 * @module responseParser
 */

import type { CopilotAction } from '../actions/actionTypes';

// ============================================================================
// Types
// ============================================================================

/**
 * Result of parsing an LLM response.
 */
export interface ParsedResponse {
  /** Extracted actions (if any) */
  actions: CopilotAction[];
  /** Explanation or natural language text */
  text: string;
  /** Whether JSON was found and successfully parsed */
  jsonFound: boolean;
  /** Any parsing errors encountered */
  errors: ParseError[];
  /** Raw JSON string that was parsed (for debugging) */
  rawJson?: string;
}

/**
 * A parsing error with context.
 */
export interface ParseError {
  type: 'json_syntax' | 'missing_action' | 'invalid_action' | 'unknown_action';
  message: string;
  /** Position in the response where error occurred */
  position?: number;
  /** The problematic value */
  value?: unknown;
}

/**
 * Expected format of an action response from the LLM.
 */
interface ActionResponse {
  actions: Array<{ action: string; [key: string]: unknown }>;
  explanation?: string;
}

// ============================================================================
// JSON Extraction
// ============================================================================

/**
 * Extract JSON blocks from text.
 * Handles both fenced code blocks and raw JSON.
 */
function extractJsonBlocks(text: string): { json: string; position: number }[] {
  const blocks: { json: string; position: number }[] = [];

  // Pattern 1: Fenced code blocks (```json ... ``` or ``` ... ```)
  const fencedPattern = /```(?:json)?\s*\n?([\s\S]*?)```/g;
  let match;

  while ((match = fencedPattern.exec(text)) !== null) {
    const content = match[1].trim();
    if (content.startsWith('{') || content.startsWith('[')) {
      blocks.push({ json: content, position: match.index });
    }
  }

  // Pattern 2: Raw JSON objects/arrays not in code blocks
  // Only if no fenced blocks found
  if (blocks.length === 0) {
    // Look for standalone JSON starting with { or [
    const rawPattern = /(?:^|\n)\s*(\{[\s\S]*?\}|\[[\s\S]*?\])\s*(?:$|\n)/g;

    while ((match = rawPattern.exec(text)) !== null) {
      const content = match[1].trim();
      // Verify it looks like complete JSON
      if (isBalanced(content)) {
        blocks.push({ json: content, position: match.index });
      }
    }
  }

  return blocks;
}

/**
 * Check if brackets are balanced (simple heuristic).
 */
function isBalanced(str: string): boolean {
  let braces = 0;
  let brackets = 0;
  let inString = false;
  let escape = false;

  for (const char of str) {
    if (escape) {
      escape = false;
      continue;
    }

    if (char === '\\') {
      escape = true;
      continue;
    }

    if (char === '"' && !escape) {
      inString = !inString;
      continue;
    }

    if (inString) continue;

    if (char === '{') braces++;
    if (char === '}') braces--;
    if (char === '[') brackets++;
    if (char === ']') brackets--;
  }

  return braces === 0 && brackets === 0;
}

/**
 * Extract text outside of JSON blocks.
 */
function extractNonJsonText(text: string, jsonBlocks: { json: string; position: number }[]): string {
  if (jsonBlocks.length === 0) return text.trim();

  let result = text;

  // Remove fenced code blocks
  result = result.replace(/```(?:json)?\s*\n?[\s\S]*?```/g, '');

  // Clean up whitespace
  result = result.replace(/\n{3,}/g, '\n\n').trim();

  return result;
}

// ============================================================================
// JSON Repair
// ============================================================================

/**
 * Attempt to repair common JSON errors.
 */
function repairJson(json: string): string {
  let repaired = json;

  // Remove trailing commas before } or ]
  repaired = repaired.replace(/,\s*([}\]])/g, '$1');

  // Fix single quotes to double quotes (be careful with escaped quotes)
  // Only do this if there are no double quotes
  if (!repaired.includes('"') && repaired.includes("'")) {
    repaired = repaired.replace(/'/g, '"');
  }

  // Fix unquoted keys (simple cases)
  repaired = repaired.replace(/([{,]\s*)(\w+)(\s*:)/g, '$1"$2"$3');

  // Remove JavaScript-style comments
  repaired = repaired.replace(/\/\/.*$/gm, '');
  repaired = repaired.replace(/\/\*[\s\S]*?\*\//g, '');

  return repaired;
}

// ============================================================================
// Action Parsing
// ============================================================================

/**
 * Parse a JSON block into actions.
 */
function parseJsonToActions(
  json: string,
  position: number
): { actions: CopilotAction[]; explanation: string; errors: ParseError[] } {
  const actions: CopilotAction[] = [];
  const errors: ParseError[] = [];
  let explanation = '';

  // Try to parse JSON
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch (e) {
    // Try to repair and parse again
    try {
      const repaired = repairJson(json);
      parsed = JSON.parse(repaired);
    } catch {
      errors.push({
        type: 'json_syntax',
        message: e instanceof Error ? e.message : 'Invalid JSON syntax',
        position,
        value: json.slice(0, 100),
      });
      return { actions, explanation, errors };
    }
  }

  // Handle different response formats
  if (typeof parsed !== 'object' || parsed === null) {
    errors.push({
      type: 'invalid_action',
      message: 'Response must be an object or array',
      value: typeof parsed,
    });
    return { actions, explanation, errors };
  }

  // Format 1: { actions: [...], explanation: "..." }
  if ('actions' in parsed && Array.isArray((parsed as ActionResponse).actions)) {
    const response = parsed as ActionResponse;
    explanation = response.explanation || '';

    for (const rawAction of response.actions) {
      if (!rawAction.action) {
        errors.push({
          type: 'missing_action',
          message: 'Action object missing "action" field',
          value: rawAction,
        });
        continue;
      }
      actions.push(rawAction as CopilotAction);
    }
  }
  // Format 2: Single action object { action: "...", ... }
  else if ('action' in parsed && typeof (parsed as { action: string }).action === 'string') {
    actions.push(parsed as CopilotAction);
  }
  // Format 3: Array of actions [{ action: "..." }, ...]
  else if (Array.isArray(parsed)) {
    for (const item of parsed) {
      if (typeof item === 'object' && item !== null && 'action' in item) {
        actions.push(item as CopilotAction);
      } else {
        errors.push({
          type: 'invalid_action',
          message: 'Array item is not a valid action object',
          value: item,
        });
      }
    }
  }
  // Unknown format
  else {
    errors.push({
      type: 'invalid_action',
      message: 'Response format not recognized. Expected {actions: [...]} or {action: "..."}',
      value: Object.keys(parsed as object),
    });
  }

  return { actions, explanation, errors };
}

// ============================================================================
// Main Parser
// ============================================================================

/**
 * Parse an LLM response to extract actions and text.
 *
 * Handles multiple formats:
 * - Pure JSON: `{"actions": [...]}`
 * - Fenced JSON: ```json\n{"actions": [...]}\n```
 * - Text with JSON: "I'll do X.\n```json\n{...}\n```\nDone!"
 *
 * @param response - Raw LLM response text
 * @returns Parsed response with actions and text
 */
export function parseResponse(response: string): ParsedResponse {
  if (!response || typeof response !== 'string') {
    return {
      actions: [],
      text: '',
      jsonFound: false,
      errors: [],
    };
  }

  const trimmed = response.trim();

  // Quick check: if it's pure JSON, parse directly
  if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
    try {
      const { actions, explanation, errors } = parseJsonToActions(trimmed, 0);
      return {
        actions,
        text: explanation,
        jsonFound: actions.length > 0 || errors.length > 0,
        errors,
        rawJson: trimmed,
      };
    } catch {
      // Fall through to block extraction
    }
  }

  // Extract JSON blocks from the response
  const jsonBlocks = extractJsonBlocks(trimmed);

  if (jsonBlocks.length === 0) {
    // No JSON found, return as pure text
    return {
      actions: [],
      text: trimmed,
      jsonFound: false,
      errors: [],
    };
  }

  // Parse all JSON blocks
  let allActions: CopilotAction[] = [];
  let allErrors: ParseError[] = [];
  let explanationFromJson = '';
  let rawJson = '';

  for (const block of jsonBlocks) {
    const { actions, explanation, errors } = parseJsonToActions(block.json, block.position);
    allActions = allActions.concat(actions);
    allErrors = allErrors.concat(errors);
    if (explanation && !explanationFromJson) {
      explanationFromJson = explanation;
    }
    if (!rawJson) {
      rawJson = block.json;
    }
  }

  // Extract non-JSON text
  const textParts = extractNonJsonText(trimmed, jsonBlocks);
  const finalText = explanationFromJson || textParts;

  return {
    actions: allActions,
    text: finalText,
    jsonFound: true,
    errors: allErrors,
    rawJson,
  };
}

// ============================================================================
// Streaming Parser
// ============================================================================

/**
 * State for incremental streaming parsing.
 */
export interface StreamParserState {
  buffer: string;
  parsedActions: CopilotAction[];
  textChunks: string[];
  inCodeBlock: boolean;
  codeBlockContent: string;
  errors: ParseError[];
}

/**
 * Create initial streaming parser state.
 */
export function createStreamParserState(): StreamParserState {
  return {
    buffer: '',
    parsedActions: [],
    textChunks: [],
    inCodeBlock: false,
    codeBlockContent: '',
    errors: [],
  };
}

/**
 * Process a streaming chunk incrementally.
 *
 * @param chunk - New text chunk from stream
 * @param state - Current parser state
 * @returns Updated state and any newly extracted data
 */
export function processStreamChunk(
  chunk: string,
  state: StreamParserState
): {
  state: StreamParserState;
  newText?: string;
  newActions?: CopilotAction[];
  complete?: boolean;
} {
  const newState = { ...state };
  newState.buffer += chunk;

  let newText: string | undefined;
  let newActions: CopilotAction[] | undefined;

  // Check for code block boundaries
  const codeBlockStart = newState.buffer.indexOf('```');

  if (!newState.inCodeBlock && codeBlockStart !== -1) {
    // Entering a code block
    const textBefore = newState.buffer.slice(0, codeBlockStart);
    if (textBefore.trim()) {
      newState.textChunks.push(textBefore);
      newText = textBefore;
    }

    // Check if there's a complete code block
    const afterStart = newState.buffer.slice(codeBlockStart + 3);
    const codeBlockEnd = afterStart.indexOf('```');

    if (codeBlockEnd !== -1) {
      // Complete code block found
      let codeContent = afterStart.slice(0, codeBlockEnd);

      // Remove language specifier (e.g., "json\n")
      const newlineIdx = codeContent.indexOf('\n');
      if (newlineIdx !== -1 && newlineIdx < 10) {
        codeContent = codeContent.slice(newlineIdx + 1);
      }

      // Try to parse as JSON
      const { actions, errors } = parseJsonToActions(codeContent.trim(), 0);
      if (actions.length > 0) {
        newState.parsedActions.push(...actions);
        newActions = actions;
      }
      if (errors.length > 0) {
        newState.errors.push(...errors);
      }

      // Continue with content after the code block
      newState.buffer = afterStart.slice(codeBlockEnd + 3);
      newState.inCodeBlock = false;
    } else {
      // Code block started but not complete
      newState.inCodeBlock = true;
      newState.codeBlockContent = afterStart;
      newState.buffer = '';
    }
  } else if (newState.inCodeBlock) {
    // Inside a code block, look for ending
    newState.codeBlockContent += chunk;
    const endIdx = newState.codeBlockContent.indexOf('```');

    if (endIdx !== -1) {
      let codeContent = newState.codeBlockContent.slice(0, endIdx);

      // Remove language specifier
      const newlineIdx = codeContent.indexOf('\n');
      if (newlineIdx !== -1 && newlineIdx < 10) {
        codeContent = codeContent.slice(newlineIdx + 1);
      }

      // Try to parse
      const { actions, errors } = parseJsonToActions(codeContent.trim(), 0);
      if (actions.length > 0) {
        newState.parsedActions.push(...actions);
        newActions = actions;
      }
      if (errors.length > 0) {
        newState.errors.push(...errors);
      }

      // Continue with content after
      newState.buffer = newState.codeBlockContent.slice(endIdx + 3);
      newState.codeBlockContent = '';
      newState.inCodeBlock = false;
    }
  } else {
    // Not in a code block, accumulate text
    // But don't emit until we're sure there's no upcoming code block
    if (!newState.buffer.includes('`')) {
      newText = newState.buffer;
      newState.textChunks.push(newState.buffer);
      newState.buffer = '';
    }
  }

  return { state: newState, newText, newActions };
}

/**
 * Finalize streaming parser and get complete result.
 */
export function finalizeStreamParser(state: StreamParserState): ParsedResponse {
  // Process any remaining buffer
  let finalText = state.textChunks.join('');

  if (state.buffer.trim()) {
    // Check if remaining buffer is JSON
    const trimmed = state.buffer.trim();
    if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
      const { actions, explanation, errors } = parseJsonToActions(trimmed, 0);
      if (actions.length > 0) {
        return {
          actions: [...state.parsedActions, ...actions],
          text: explanation || finalText,
          jsonFound: true,
          errors: [...state.errors, ...errors],
          rawJson: trimmed,
        };
      }
    }
    // Otherwise add to text
    finalText += state.buffer;
  }

  if (state.codeBlockContent) {
    // Incomplete code block - try to parse it anyway
    const { actions, errors } = parseJsonToActions(state.codeBlockContent.trim(), 0);
    if (actions.length > 0) {
      return {
        actions: [...state.parsedActions, ...actions],
        text: finalText,
        jsonFound: true,
        errors: [...state.errors, ...errors],
      };
    }
  }

  return {
    actions: state.parsedActions,
    text: finalText.trim(),
    jsonFound: state.parsedActions.length > 0,
    errors: state.errors,
  };
}

// ============================================================================
// Validation Helpers
// ============================================================================

/**
 * Check if a parsed action has the required "action" field.
 */
export function isValidActionShape(action: unknown): action is CopilotAction {
  return (
    typeof action === 'object' &&
    action !== null &&
    'action' in action &&
    typeof (action as { action: unknown }).action === 'string'
  );
}

/**
 * Extract action name from a raw action object.
 */
export function getActionName(action: CopilotAction): string {
  return action.action;
}
