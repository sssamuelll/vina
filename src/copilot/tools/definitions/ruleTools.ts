/**
 * Copilot tools for pattern validation rules engine (#79)
 */

import type { ToolDefinition } from '../registry';
import { validateAllPieces, getViolationSummary, PATTERN_RULES, type RuleCategory, type ProjectContext } from '../../../utils/patternRules';

export const tools: ToolDefinition[] = [
  {
    name: 'validatePattern',
    description: 'Run patternmaking rules engine on all pieces. Returns violations grouped by severity. Optional category filter: fit, construction, grading, fabric.',
    parameters: {
      type: 'object',
      properties: {
        category: {
          type: 'string',
          enum: ['fit', 'construction', 'grading', 'fabric'],
          description: 'Filter to specific rule category (optional)',
        },
      },
    },
    execute: async (_params, _dispatch, getState) => {
      const state = getState();
      const pieces = state.project?.pieces || [];
      if (pieces.length === 0) {
        return { success: false, error: 'No pieces loaded to validate' };
      }
      const context: ProjectContext = { pieces };
      const categories = _params.category ? [_params.category as RuleCategory] : undefined;
      const violations = validateAllPieces(context, categories);
      const summary = getViolationSummary(violations);
      return {
        success: true,
        totalPieces: pieces.length,
        totalViolations: violations.length,
        errors: violations.filter(v => v.severity === 'error').length,
        warnings: violations.filter(v => v.severity === 'warning').length,
        infos: violations.filter(v => v.severity === 'info').length,
        summary,
        violations,
      };
    },
  },
  {
    name: 'listPatternRules',
    description: 'List all available patternmaking rules with their categories and descriptions.',
    parameters: { type: 'object', properties: {} },
    execute: async () => {
      const rules = PATTERN_RULES.map(r => ({
        id: r.id,
        name: r.name,
        category: r.category,
        severity: r.severity,
        description: r.description,
      }));
      return {
        success: true,
        totalRules: rules.length,
        rules,
      };
    },
  },
];
