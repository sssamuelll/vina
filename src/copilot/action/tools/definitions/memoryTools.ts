/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * #81 — Copilot Memory tools: rememberThis, recallContext, setPreference, addNote
 * #143/#146 — Design Log tools: writeDesignNote, recallDesignLog
 * #148 — Preference Learning tools: detectFormulaChanges, saveFormulaOverride
 *
 * MVP v1 state (dark surface, ratified 2026-05-28 in #827):
 * These tools remain registered. The agent can WRITE to project memory
 * (`openclo_memory_<projectId>` localStorage) via `rememberDecision` /
 * `setUserPreference` / `addNote`, and READ via `getMemory`. There is no
 * user-reachable UI to inspect or clear this state in MVP v1 — AgentSettings
 * exposes a Clear-memory button only when its host wires `onClearMemory`, and
 * UnifiedBar (the canonical shell) does not, per Opt C partial port.
 * Trade-off accepted: the agent gains cross-session recall in the María slice;
 * the user must purge via DevTools or by clearing site data. A user-facing
 * clear surface is queued for M2+ together with the ProjectMemory UI binding.
 */

import type { ToolDefinition } from '../registry';
import { loadLongTermMemory, addLongTermDecision, setLongTermPreference, addLongTermNote, clearLongTermMemory, longTermMemoryToContext } from '../../../memory';
import { DesignLogManager, generateEntryId } from '../../../perception/designLog';
import { detectFormulaDelta, generateOverrideId } from '../../../perception/preferenceLearner';
import type { DesignLogEntryType, SkillOverride } from '../../../perception/types';

function getProjectId(getState: () => any): string {
  return getState().project?.id || 'default';
}

/**
 * Gate an irreversible clear behind a blocking native confirm. Unlike the
 * piece/seam deletes (Ctrl+Z-undoable, so they don't confirm by default), these
 * two tools have NO undo, yet the agent can invoke them — a crafted or misread
 * instruction must not silently wipe memory. The Redux confirmation dialog is a
 * dark surface (nothing renders `pendingConfirmation`), so we use the native
 * confirm; a non-browser context (no window) proceeds. (Security study #4.)
 */
function confirmIrreversible(message: string): boolean {
  if (typeof window === 'undefined' || typeof window.confirm !== 'function') return true;
  return window.confirm(message);
}

export const tools: ToolDefinition[] = [
  {
    name: 'rememberDecision',
    description: 'Save a design decision to project memory for cross-session recall. Include context for why.',
    parameters: {
      type: 'object',
      properties: {
        decision: { type: 'string', description: 'What was decided' },
        context: { type: 'string', description: 'Why / relevant context' },
      },
      required: ['decision'],
    },
    execute: async (params, _dispatch, getState) => {
      const projectId = getProjectId(getState);
      const mem = await addLongTermDecision(projectId, params.decision as string, (params.context as string) || '');
      return { success: true, totalDecisions: mem.decisions.length, saved: params.decision };
    },
  },
  {
    name: 'setUserPreference',
    description: 'Save a user preference (e.g. "ease_style: loose", "dart_type: french", "language: es").',
    parameters: {
      type: 'object',
      properties: {
        key: { type: 'string', description: 'Preference key' },
        value: { type: 'string', description: 'Preference value' },
      },
      required: ['key', 'value'],
    },
    execute: async (params, _dispatch, getState) => {
      const projectId = getProjectId(getState);
      await setLongTermPreference(projectId, params.key as string, params.value as string);
      return { success: true, key: params.key, value: params.value };
    },
  },
  {
    name: 'addProjectNote',
    description: 'Add a free-form note about the current project for future reference.',
    parameters: {
      type: 'object',
      properties: {
        note: { type: 'string', description: 'Note content' },
      },
      required: ['note'],
    },
    execute: async (params, _dispatch, getState) => {
      const projectId = getProjectId(getState);
      const mem = await addLongTermNote(projectId, params.note as string);
      return { success: true, totalNotes: mem.notes.length };
    },
  },
  {
    name: 'recallContext',
    description: 'Recall all saved memory for the current project: decisions, preferences, notes.',
    parameters: { type: 'object', properties: {} },
    execute: async (_params, _dispatch, getState) => {
      const projectId = getProjectId(getState);
      const mem = await loadLongTermMemory(projectId);
      const context = longTermMemoryToContext(mem);
      return {
        success: true,
        projectId,
        decisionCount: mem.decisions.length,
        preferenceCount: Object.keys(mem.preferences).length,
        noteCount: mem.notes.length,
        context: context || 'No memory saved yet for this project.',
        memory: mem,
      };
    },
  },
  {
    name: 'clearProjectMemory',
    description: 'Clear all copilot memory for the current project. Use with caution.',
    parameters: { type: 'object', properties: {} },
    execute: async (_params, _dispatch, getState) => {
      if (!confirmIrreversible('Clear ALL copilot memory for this project? This cannot be undone.')) {
        return { success: false, message: 'Cancelled — memory was not cleared.' };
      }
      const projectId = getProjectId(getState);
      await clearLongTermMemory(projectId);
      return { success: true, message: `Memory cleared for project ${projectId}` };
    },
  },

  // ─── Design Log Tools (#143/#146) ────────────────────────────────────────────

  {
    name: 'writeDesignNote',
    description:
      'Write a durable design note to the project log. Use this to record important decisions, constraints, or warnings that should persist across sessions. ' +
      'Types: "decision" (design choice), "constraint" (rule to preserve), "warning" (potential issue), "note" (general observation).',
    parameters: {
      type: 'object',
      properties: {
        summary: {
          type: 'string',
          description: 'Brief summary of the note (max 100 chars). E.g., "Widened hip by 5cm to improve drape"',
        },
        type: {
          type: 'string',
          enum: ['decision', 'constraint', 'warning', 'note'],
          description: 'Type of entry: decision, constraint, warning, or note',
        },
        pieceIds: {
          type: 'array',
          items: { type: 'string' },
          description: 'IDs of pieces this note relates to (optional)',
        },
      },
      required: ['summary', 'type'],
    },
    execute: async (params, _dispatch, getState) => {
      const projectId = getProjectId(getState);
      const manager = DesignLogManager.load(projectId);

      const entry = {
        id: generateEntryId(),
        timestamp: Date.now(),
        type: params.type as DesignLogEntryType,
        summary: (params.summary as string).slice(0, 100),
        relatedPieceIds: (params.pieceIds as string[]) || [],
      };

      manager.addEntry(entry);

      return {
        success: true,
        entryId: entry.id,
        type: entry.type,
        summary: entry.summary,
        totalEntries: manager.getEntries().length,
      };
    },
  },
  {
    name: 'recallDesignLog',
    description:
      'Recall the design log for the current project. Returns recent decisions, constraints, warnings, and formula overrides.',
    parameters: {
      type: 'object',
      properties: {
        limit: {
          type: 'integer',
          description: 'Maximum number of entries to return (default: 10)',
        },
      },
    },
    execute: async (params, _dispatch, getState) => {
      const projectId = getProjectId(getState);
      const manager = DesignLogManager.load(projectId);
      const limit = (params.limit as number) || 10;

      const entries = manager.getRecentEntries(limit);
      const overrides = manager.getOverrides();
      const markdown = manager.toMarkdown();

      return {
        success: true,
        projectId,
        entryCount: entries.length,
        overrideCount: overrides.length,
        entries,
        overrides,
        markdown,
      };
    },
  },
  {
    name: 'clearDesignLog',
    description: 'Clear the design log for the current project. Use with caution — this removes all persisted design decisions.',
    parameters: { type: 'object', properties: {} },
    execute: async (_params, _dispatch, getState) => {
      if (!confirmIrreversible('Clear the design log for this project? This cannot be undone.')) {
        return { success: false, message: 'Cancelled — design log was not cleared.' };
      }
      const projectId = getProjectId(getState);
      DesignLogManager.clear(projectId);
      return { success: true, message: `Design log cleared for project ${projectId}` };
    },
  },

  // ─── Preference Learning Tools (#148) ──────────────────────────────────────

  {
    name: 'detectFormulaChanges',
    description:
      'Detect when a user has manually edited a piece generated by a skill, comparing expected formula values to actual geometry. ' +
      'Use this after noticing the user modified an AI-generated piece. Returns detected deviations that can be saved as preferences.',
    parameters: {
      type: 'object',
      properties: {
        skillId: {
          type: 'string',
          description: 'The skill that generated the piece (e.g., "core:bodice", "aldrich:sleeve")',
        },
        pieceId: {
          type: 'string',
          description: 'ID of the piece to analyze',
        },
        formulas: {
          type: 'array',
          description: 'List of formulas to compare. Each has: name, expression, expectedValue, actualValue',
          items: {
            type: 'object',
            properties: {
              name: { type: 'string', description: 'Formula name (e.g., "shoulderWidth", "bustEase")' },
              expression: { type: 'string', description: 'Original formula expression (e.g., "chest / 4 + 2")' },
              expectedValue: { type: 'number', description: 'Value calculated from formula (mm)' },
              actualValue: { type: 'number', description: 'Value measured from piece geometry (mm)' },
            },
            required: ['name', 'expression', 'expectedValue', 'actualValue'],
          },
        },
        tolerance: {
          type: 'number',
          description: 'Tolerance in mm before flagging a change (default: 2mm)',
        },
      },
      required: ['skillId', 'pieceId', 'formulas'],
    },
    execute: async (params, _dispatch, _getState) => {
      const formulas = params.formulas as Array<{
        name: string;
        expression: string;
        expectedValue: number;
        actualValue: number;
      }>;
      const tolerance = (params.tolerance as number) || 2;

      const changes: Array<{
        formulaName: string;
        expression: string;
        expectedValue: number;
        actualValue: number;
        difference: number;
        percentageDiff: number;
      }> = [];

      for (const formula of formulas) {
        const delta = detectFormulaDelta({
          formulaName: formula.name,
          expectedValue: formula.expectedValue,
          actualValue: formula.actualValue,
          tolerance,
        });

        if (delta) {
          changes.push({
            formulaName: delta.formulaName,
            expression: formula.expression,
            expectedValue: delta.expectedValue,
            actualValue: delta.actualValue,
            difference: delta.difference,
            percentageDiff: delta.percentageDiff,
          });
        }
      }

      if (changes.length === 0) {
        return {
          success: true,
          changesDetected: false,
          message: 'No significant formula changes detected.',
        };
      }

      // Format a human-readable summary
      const summaries = changes.map(c =>
        `${c.formulaName}: ${c.difference > 0 ? '+' : ''}${c.difference.toFixed(1)}mm (${c.percentageDiff.toFixed(1)}%)`
      );

      return {
        success: true,
        changesDetected: true,
        changeCount: changes.length,
        changes,
        summary: summaries.join(', '),
        suggestion: `I detected ${changes.length} formula change(s): ${summaries.join(', ')}. Should I save these as your preferences for future patterns?`,
      };
    },
  },
  {
    name: 'saveFormulaOverride',
    description:
      'Save a formula override as a user preference. Use this after the user confirms they want to save a detected formula change. ' +
      'The override will be applied to future patterns generated by the same skill.',
    parameters: {
      type: 'object',
      properties: {
        skillId: {
          type: 'string',
          description: 'The skill this override applies to (e.g., "core:bodice")',
        },
        formulaName: {
          type: 'string',
          description: 'Name of the formula being overridden (e.g., "shoulderWidth")',
        },
        originalExpression: {
          type: 'string',
          description: 'Original formula expression (e.g., "chest / 4 + 2")',
        },
        difference: {
          type: 'number',
          description: 'The adjustment to apply in mm (can be positive or negative)',
        },
        reason: {
          type: 'string',
          description: 'Why the user prefers this adjustment (e.g., "User prefers wider shoulders")',
        },
      },
      required: ['skillId', 'formulaName', 'originalExpression', 'difference'],
    },
    execute: async (params, _dispatch, getState) => {
      const projectId = getProjectId(getState);
      const manager = DesignLogManager.load(projectId);

      const skillId = params.skillId as string;
      const formulaName = params.formulaName as string;
      const originalExpression = params.originalExpression as string;
      const difference = params.difference as number;
      const reason = params.reason as string | undefined;

      // Create the override
      const sign = difference >= 0 ? '+' : '-';
      const absValue = Math.abs(difference);
      const overrideValue = `${originalExpression} ${sign} ${absValue}`;

      const override: SkillOverride = {
        id: generateOverrideId(),
        skillId,
        formulaName,
        originalValue: originalExpression,
        overrideValue,
        reason: reason || `User adjusted ${formulaName} by ${difference > 0 ? '+' : ''}${difference}mm`,
        createdAt: Date.now(),
      };

      manager.addOverride(override);

      return {
        success: true,
        overrideId: override.id,
        skillId,
        formulaName,
        originalValue: originalExpression,
        overrideValue,
        reason: override.reason,
        message: `Saved preference: ${formulaName} will now use "${overrideValue}" for skill ${skillId}.`,
      };
    },
  },
  {
    name: 'listFormulaOverrides',
    description: 'List all saved formula overrides (user preferences) for the current project.',
    parameters: {
      type: 'object',
      properties: {
        skillId: {
          type: 'string',
          description: 'Optional: Filter overrides by skill ID',
        },
      },
    },
    execute: async (params, _dispatch, getState) => {
      const projectId = getProjectId(getState);
      const manager = DesignLogManager.load(projectId);
      let overrides = manager.getOverrides();

      const skillId = params.skillId as string | undefined;
      if (skillId) {
        overrides = overrides.filter(o => o.skillId === skillId);
      }

      if (overrides.length === 0) {
        return {
          success: true,
          overrideCount: 0,
          message: skillId
            ? `No formula overrides saved for skill ${skillId}.`
            : 'No formula overrides saved yet.',
        };
      }

      return {
        success: true,
        overrideCount: overrides.length,
        overrides: overrides.map(o => ({
          id: o.id,
          skillId: o.skillId,
          formulaName: o.formulaName,
          originalValue: o.originalValue,
          overrideValue: o.overrideValue,
          reason: o.reason,
        })),
      };
    },
  },
];
