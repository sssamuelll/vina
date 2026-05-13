import { describe, it, expect } from 'vitest';
import { mapClothSimConfigToWasmSolverConfig, type SharedClothSimConfigKeys } from '../configBridge';
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
    const input: Partial<Pick<ClothSimConfig, SharedClothSimConfigKeys>> = {
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

  it('rejects all 8 CPU-only fields at compile time (#696)', () => {
    // `@ts-expect-error` itself fails the type check if the next line does
    // NOT produce an error — that's the real assertion. The runtime calls
    // return `{}` (no `if` branch matches), which is incidental.
    // @ts-expect-error -- groundFriction is CPU-only (A2 § 3.1)
    mapClothSimConfigToWasmSolverConfig({ groundFriction: 0.5 });
    // @ts-expect-error -- adaptiveSubsteps is CPU-only (A7 § 3.1.6)
    mapClothSimConfigToWasmSolverConfig({ adaptiveSubsteps: true });
    // @ts-expect-error -- minSubsteps is CPU-only (A7 § 3.1.6)
    mapClothSimConfigToWasmSolverConfig({ minSubsteps: 10 });
    // @ts-expect-error -- maxSubsteps is CPU-only (A7 § 3.1.6)
    mapClothSimConfigToWasmSolverConfig({ maxSubsteps: 30 });
    // @ts-expect-error -- maxVelocity is CPU-only (A7 § 3.1.7)
    mapClothSimConfigToWasmSolverConfig({ maxVelocity: 5.0 });
    // @ts-expect-error -- enableLRA is CPU-only
    mapClothSimConfigToWasmSolverConfig({ enableLRA: true });
    // @ts-expect-error -- dt is CPU-only (WASM worker hardcodes 1/60)
    mapClothSimConfigToWasmSolverConfig({ dt: 1 / 60 });
    // @ts-expect-error -- windForce is CPU-only (WASM uses separate setWind() API per A6 § 3.6)
    mapClothSimConfigToWasmSolverConfig({ windForce: [1, 0, 0] });
  });

  it('does not propagate undefined values', () => {
    expect(mapClothSimConfigToWasmSolverConfig({ numSubsteps: undefined, damping: 0.5 })).toEqual({ damping: 0.5 });
  });

  it('translates a full input correctly (mixed renames + passthrough)', () => {
    const input: Partial<Pick<ClothSimConfig, SharedClothSimConfigKeys>> = {
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
