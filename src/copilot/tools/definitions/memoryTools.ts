/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * #81 — Copilot Memory tools: rememberThis, recallContext, setPreference, addNote
 * #143/#146 — Design Log tools: writeDesignNote, recallDesignLog
 */

import type { ToolDefinition } from '../registry';
import { loadLongTermMemory, addLongTermDecision, setLongTermPreference, addLongTermNote, clearLongTermMemory, longTermMemoryToContext } from '../../memory';
import { DesignLogManager, generateEntryId } from '../../vision/designLog';
import type { DesignLogEntryType } from '../../vision/types';

function getProjectId(getState: () => any): string {
  return getState().project?.id || 'default';
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
      const projectId = getProjectId(getState);
      DesignLogManager.clear(projectId);
      return { success: true, message: `Design log cleared for project ${projectId}` };
    },
  },
];
