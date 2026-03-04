import { describe, it, expect } from 'vitest';
import { VIEW_PRESETS, DEFAULT_TARGET } from '../useCameraPresets';

describe('VIEW_PRESETS', () => {
  it('defines all 8 view presets', () => {
    expect(Object.keys(VIEW_PRESETS)).toHaveLength(8);
    expect(VIEW_PRESETS.front).toBeDefined();
    expect(VIEW_PRESETS.back).toBeDefined();
    expect(VIEW_PRESETS.left).toBeDefined();
    expect(VIEW_PRESETS.right).toBeDefined();
    expect(VIEW_PRESETS.top).toBeDefined();
    expect(VIEW_PRESETS.bottom).toBeDefined();
    expect(VIEW_PRESETS.threeQuarterLeft).toBeDefined();
    expect(VIEW_PRESETS.threeQuarterRight).toBeDefined();
  });

  it('front view looks along +Z axis', () => {
    const { position } = VIEW_PRESETS.front;
    expect(position[2]).toBeGreaterThan(0);
    expect(position[0]).toBe(0);
  });

  it('back view looks along -Z axis', () => {
    const { position } = VIEW_PRESETS.back;
    expect(position[2]).toBeLessThan(0);
    expect(position[0]).toBe(0);
  });

  it('top view looks down from +Y', () => {
    const { position } = VIEW_PRESETS.top;
    expect(position[1]).toBeGreaterThan(DEFAULT_TARGET[1]);
  });

  it('all presets use default target', () => {
    for (const preset of Object.values(VIEW_PRESETS)) {
      expect(preset.target).toEqual(DEFAULT_TARGET);
    }
  });
});
