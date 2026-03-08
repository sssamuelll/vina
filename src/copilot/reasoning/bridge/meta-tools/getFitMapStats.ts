/**
 * getFitMapStats Meta-Tool
 *
 * Returns the current fit map statistics from Redux state, including the active
 * visualization mode, per-vertex summary statistics, and configuration ranges.
 *
 * Read-only — never modifies state.
 *
 * @module getFitMapStats
 */

import type { MetaToolDefinition, MetaToolResult } from './types';

export const getFitMapStatsTool: MetaToolDefinition = {
  name: 'getFitMapStats',
  description:
    'Returns the current fit map statistics including mode, min/max/mean values, tight/cantWear percentages, pressure point count, and visualization config. Returns an error if no fit map is active.',
  parameters: {
    type: 'object',
    properties: {},
  },
  execute: async (_params, getState): Promise<MetaToolResult> => {
    const state = getState();
    const { fitMapMode, fitMapStats, fitMapConfig } = state.simulation;

    if (fitMapMode === 'none' || fitMapStats == null) {
      return {
        success: false,
        error:
          'No fit map is currently active. Enable a fit map mode (stress, strain, fit, or pressure) first.',
      };
    }

    return {
      success: true,
      data: {
        mode: fitMapMode,
        min: fitMapStats.min,
        max: fitMapStats.max,
        mean: fitMapStats.mean,
        cantWearPct: fitMapStats.cantWearPct,
        tightPct: fitMapStats.tightPct,
        pressurePointCount: fitMapStats.pressurePointCount,
        config: {
          stressRange: fitMapConfig.stressRange,
          strainRange: fitMapConfig.strainRange,
          fitThresholds: fitMapConfig.fitThresholds,
          pressureDistance: fitMapConfig.pressureDistance,
        },
      },
    };
  },
};
