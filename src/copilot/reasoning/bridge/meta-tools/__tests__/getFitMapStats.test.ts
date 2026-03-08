/**
 * Tests for getFitMapStats meta-tool.
 *
 * Verifies that the tool correctly reads fit map statistics from Redux state
 * and returns appropriate errors when no fit map is active.
 */

import { describe, it, expect } from 'vitest';
import { getFitMapStatsTool } from '../getFitMapStats';

// Minimal mock state factory — returns a getState function cast as never
// to satisfy MetaToolDefinition.execute signature without importing RootState.
function mockSimState(overrides: {
  fitMapMode?: string;
  fitMapStats?: Record<string, unknown> | null;
  fitMapConfig?: Record<string, unknown>;
} = {}) {
  return () => ({
    simulation: {
      fitMapMode: overrides.fitMapMode ?? 'stress',
      fitMapStats: overrides.fitMapStats !== undefined
        ? overrides.fitMapStats
        : {
            min: 0,
            max: 85.3,
            mean: 22.1,
            cantWearPct: 5.2,
            tightPct: 12.8,
            pressurePointCount: 0,
          },
      fitMapConfig: overrides.fitMapConfig ?? {
        stressRange: [0, 100],
        strainRange: [1.0, 1.2],
        fitThresholds: [0.8, 1.0],
        pressureDistance: 0.002,
      },
    },
  }) as never;
}

describe('getFitMapStats meta-tool', () => {
  it('has correct name and description', () => {
    expect(getFitMapStatsTool.name).toBe('getFitMapStats');
    expect(getFitMapStatsTool.description).toBeTruthy();
  });

  it('requires no parameters', () => {
    expect(getFitMapStatsTool.parameters.required).toBeUndefined();
  });

  it('returns stats when fit map is active', async () => {
    const result = await getFitMapStatsTool.execute({}, mockSimState());
    expect(result.success).toBe(true);
    expect(result.data?.mode).toBe('stress');
    expect(result.data?.min).toBe(0);
    expect(result.data?.max).toBe(85.3);
    expect(result.data?.mean).toBe(22.1);
    expect(result.data?.cantWearPct).toBe(5.2);
    expect(result.data?.tightPct).toBe(12.8);
    expect(result.data?.pressurePointCount).toBe(0);
  });

  it('includes config in response', async () => {
    const result = await getFitMapStatsTool.execute({}, mockSimState());
    expect(result.success).toBe(true);
    const config = result.data?.config as Record<string, unknown>;
    expect(config).toBeDefined();
    expect(config.stressRange).toEqual([0, 100]);
    expect(config.pressureDistance).toBe(0.002);
  });

  it('returns error when fit map mode is none', async () => {
    const result = await getFitMapStatsTool.execute(
      {},
      mockSimState({ fitMapMode: 'none', fitMapStats: null }),
    );
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/no fit map/i);
  });

  it('returns error when fitMapStats is null even if mode is set', async () => {
    const result = await getFitMapStatsTool.execute(
      {},
      mockSimState({ fitMapMode: 'strain', fitMapStats: null }),
    );
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/no fit map/i);
  });
});
