import { describe, it, expect } from 'vitest';
import { mapClothSimConfigToWasmSolverConfig } from '../configBridge';
import type { ClothSimConfig } from '../xpbdSolver';

describe('mapClothSimConfigToWasmSolverConfig', () => {
  it('returns empty object for empty input', () => {
    expect(mapClothSimConfigToWasmSolverConfig({})).toEqual({});
  });

  it('renames numSubsteps → substeps', () => {
    expect(mapClothSimConfigToWasmSolverConfig({ numSubsteps: 25 })).toEqual({ substeps: 25 });
  });

  it('extracts gravity[1] → gravityY (drops X and Z components)', () => {
    expect(mapClothSimConfigToWasmSolverConfig({ gravity: [1.0, -9.81, 2.0] })).toEqual({ gravityY: -9.81 });
  });

  it('renames stretchingCompliance → stretchCompliance', () => {
    expect(mapClothSimConfigToWasmSolverConfig({ stretchingCompliance: 0.5 })).toEqual({ stretchCompliance: 0.5 });
  });

  it('renames bendingCompliance → bendCompliance', () => {
    expect(mapClothSimConfigToWasmSolverConfig({ bendingCompliance: 1.0 })).toEqual({ bendCompliance: 1.0 });
  });

  it('renames clothThickness → thickness', () => {
    expect(mapClothSimConfigToWasmSolverConfig({ clothThickness: 0.003 })).toEqual({ thickness: 0.003 });
  });

  it('passes through same-name shared fields unchanged', () => {
    const input: Partial<ClothSimConfig> = {
      damping: 0.99,
      selfCollision: false,
      groundY: 0.5,
      dragCoefficient: 1.5,
      stretchComplianceWarp: 0.0,
      stretchComplianceWeft: 0.1,
      stretchComplianceShear: 0.001,
      bendComplianceWarp: 1.0,
      bendComplianceWeft: 0.5,
      internalDamping: 0.3,
    };
    expect(mapClothSimConfigToWasmSolverConfig(input)).toEqual(input);
  });

  it('silently drops CPU-only fields', () => {
    const input: Partial<ClothSimConfig> = {
      groundFriction: 0.5,
      adaptiveSubsteps: true,
      minSubsteps: 10,
      maxSubsteps: 30,
      maxVelocity: 5.0,
      enableLRA: true,
      dt: 1 / 60,
      windForce: [1, 0, 0],
    };
    expect(mapClothSimConfigToWasmSolverConfig(input)).toEqual({});
  });

  it('does not propagate undefined values', () => {
    const input = { numSubsteps: undefined, damping: 0.5 } as Partial<ClothSimConfig>;
    expect(mapClothSimConfigToWasmSolverConfig(input)).toEqual({ damping: 0.5 });
  });

  it('translates a full input correctly (mixed renames + passthrough + drops)', () => {
    const input: Partial<ClothSimConfig> = {
      numSubsteps: 15,
      gravity: [0, -9.81, 0],
      damping: 0.99,
      stretchingCompliance: 0.0,
      bendingCompliance: 1.0,
      selfCollision: true,
      clothThickness: 0.002,
      groundY: 0.0,
      dragCoefficient: 1.0,
      stretchComplianceWarp: 0.0,
      stretchComplianceWeft: 0.0,
      stretchComplianceShear: 0.001,
      bendComplianceWarp: 1.0,
      bendComplianceWeft: 1.0,
      internalDamping: 0.3,
      // CPU-only — should be dropped:
      groundFriction: 0.5,
      adaptiveSubsteps: true,
      minSubsteps: 10,
      maxSubsteps: 30,
      maxVelocity: 5.0,
      enableLRA: true,
      dt: 1 / 60,
      windForce: [0, 0, 0],
    };
    expect(mapClothSimConfigToWasmSolverConfig(input)).toEqual({
      substeps: 15,
      gravityY: -9.81,
      damping: 0.99,
      stretchCompliance: 0.0,
      bendCompliance: 1.0,
      selfCollision: true,
      thickness: 0.002,
      groundY: 0.0,
      dragCoefficient: 1.0,
      stretchComplianceWarp: 0.0,
      stretchComplianceWeft: 0.0,
      stretchComplianceShear: 0.001,
      bendComplianceWarp: 1.0,
      bendComplianceWeft: 1.0,
      internalDamping: 0.3,
    });
  });

  it('preserves selfCollision=false (boolean false should not be dropped)', () => {
    expect(mapClothSimConfigToWasmSolverConfig({ selfCollision: false })).toEqual({ selfCollision: false });
  });

  it('preserves numeric zero (0 should not be dropped)', () => {
    expect(mapClothSimConfigToWasmSolverConfig({ damping: 0, groundY: 0 })).toEqual({ damping: 0, groundY: 0 });
  });

  it('handles invalid gravity shape defensively', () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(mapClothSimConfigToWasmSolverConfig({ gravity: [] as any })).toEqual({});
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(mapClothSimConfigToWasmSolverConfig({ gravity: [0] as any })).toEqual({});
  });
});
