/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unused-vars */
/**
 * Copilot tools for ease tracking and fit analysis.
 */

import type { ToolDefinition, ToolResult } from '../registry';
import type { AppDispatch, RootState } from '../../../store';

export const tools: ToolDefinition[] = [
  {
    name: 'getEase',
    description: 'Compute ease (garment - body measurement) for bust, waist, hip, shoulder, sleeve. Returns mm.',
    parameters: {
      type: 'object',
      properties: {},
    },
    execute: async (
      _params: Record<string, unknown>,
      _dispatch: AppDispatch,
      getState: () => RootState,
    ): Promise<ToolResult> => {
      const { computeEase, classifyFit } = await import('../../../utils/easeTracking');
      const state = getState();
      const pieces = state.project.pieces;
      const meas = state.project.avatar.measurements;

      const ease = computeEase(pieces, {
        chest: meas.chest,
        waist: meas.waist,
        hip: meas.hips,
        shoulder: meas.shoulder,
      });

      const fit = classifyFit(ease);

      return {
        success: true,
        data: {
          ease,
          fitCategory: fit,
          summary: Object.entries(ease)
            .filter(([, v]) => v !== undefined)
            .map(([k, v]) => `${k}: ${v! > 0 ? '+' : ''}${v}mm (${(v! / 10).toFixed(1)}cm)`)
            .join(', '),
        },
      };
    },
  },
  {
    name: 'compareEase',
    description: 'Compare current ease against standard fit categories (Knit Fitted, Woven Fitted, T-Shirt, etc.)',
    parameters: {
      type: 'object',
      properties: {
        standard: { type: 'string', description: 'Filter by standard name (e.g., "Woven Fitted", "T-Shirt"). Omit for all.' },
      },
    },
    execute: async (
      params: Record<string, unknown>,
      _dispatch: AppDispatch,
      getState: () => RootState,
    ): Promise<ToolResult> => {
      const { computeEase, compareToStandard } = await import('../../../utils/easeTracking');
      const state = getState();
      const pieces = state.project.pieces;
      const meas = state.project.avatar.measurements;

      const ease = computeEase(pieces, {
        chest: meas.chest,
        waist: meas.waist,
        hip: meas.hips,
        shoulder: meas.shoulder,
      });

      const comparisons = compareToStandard(ease, params.standard as string | undefined);

      return {
        success: true,
        data: {
          ease,
          comparisons: comparisons.map(c => ({
            standard: c.standard.name,
            fitCategory: c.standard.fitCategory,
            regions: c.analysis,
          })),
        },
      };
    },
  },
  {
    name: 'listEaseStandards',
    description: 'List all available ease standard references (with bust/waist/hip ranges)',
    parameters: {
      type: 'object',
      properties: {},
    },
    execute: async (
      _params: Record<string, unknown>,
      _dispatch: AppDispatch,
      _getState: () => RootState,
    ): Promise<ToolResult> => {
      const { EASE_STANDARDS } = await import('../../../utils/easeTracking');
      return {
        success: true,
        data: {
          standards: EASE_STANDARDS.map(s => ({
            name: s.name,
            fitCategory: s.fitCategory,
            bust: `${s.bust[0]}–${s.bust[1]}mm`,
            waist: `${s.waist[0]}–${s.waist[1]}mm`,
            hip: `${s.hip[0]}–${s.hip[1]}mm`,
          })),
        },
      };
    },
  },
];
