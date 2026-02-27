/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unused-vars */
/**
 * #81 — Copilot Memory tools: rememberThis, recallContext, setPreference, addNote
 */

import type { ToolDefinition } from '../registry';
import { loadLongTermMemory, addLongTermDecision, setLongTermPreference, addLongTermNote, clearLongTermMemory, longTermMemoryToContext } from '../../memory';

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
];
