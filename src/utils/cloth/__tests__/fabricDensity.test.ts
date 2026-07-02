/**
 * P7-density (plan drape profesional, knob descubierto en la calibración
 * Cusick post-P1): el solver corría con densidad-1 — el peso GSM solo tocaba
 * damping → chiffon (30 g/m²) y canvas (407 g/m²) caían con la MISMA masa y
 * el ratio B/ρ que gobierna el drape real no existía.
 *
 * Escala RELATIVA a una referencia (150 g/m², algodón medio): a la densidad
 * de referencia el comportamiento es idéntico al de hoy (escala 1) — no se
 * re-rompe la calibración #gummy/P1. invMass_i *= REFERENCE/ρ: tela pesada →
 * masa mayor → las correcciones de constraint pesan menos frente a la
 * gravedad → drapea más, como en la realidad.
 */
import { describe, it, expect } from 'vitest';
import { fabricInvMassScale, REFERENCE_FABRIC_DENSITY, toXPBDParams, getPhysicalFabric } from '../physicalFabric';
import { XPBDClothSolver } from '../xpbdSolver';

describe('fabricInvMassScale', () => {
  it('is exactly 1 at the reference density (today-behavior preserved)', () => {
    expect(fabricInvMassScale(REFERENCE_FABRIC_DENSITY)).toBe(1);
  });

  it('light fabrics get larger invMass (less inertia), heavy fabrics smaller', () => {
    const chiffon = toXPBDParams(getPhysicalFabric('chiffon')!);
    const canvas = toXPBDParams(getPhysicalFabric('canvas-12oz')!);
    expect(fabricInvMassScale(chiffon.density)).toBeGreaterThan(1);
    expect(fabricInvMassScale(canvas.density)).toBeLessThan(1);
  });

  it('defaults to 1 when density is missing, and clamps degenerate inputs', () => {
    expect(fabricInvMassScale(undefined)).toBe(1);
    expect(fabricInvMassScale(0)).toBe(1); // división por 0 imposible
    expect(fabricInvMassScale(NaN)).toBe(1);
    // Clamp de sanidad: ni ×100 ni ×0.01 — el solver no sobrevive extremos.
    expect(fabricInvMassScale(0.0001)).toBeLessThanOrEqual(10);
    expect(fabricInvMassScale(100)).toBeGreaterThanOrEqual(0.1);
  });
});

describe('CPU solver consumes fabricDensity', () => {
  const mesh = {
    vertices: new Float32Array([0, 1, 0, 0.1, 1, 0, 0.05, 1, 0.0866]),
    triIds: new Int32Array([0, 1, 2]),
  };

  it('scales invMass by REFERENCE/density (heavy fabric → smaller invMass)', () => {
    const ref = new XPBDClothSolver(mesh, { adaptiveSubsteps: false });
    const heavy = new XPBDClothSolver(mesh, { adaptiveSubsteps: false, fabricDensity: 0.45 });
    for (let i = 0; i < 3; i++) {
      expect(heavy.invMass[i]).toBeCloseTo(ref.invMass[i] * (REFERENCE_FABRIC_DENSITY / 0.45), 4);
    }
  });

  it('default (no fabricDensity) is bit-identical to today', () => {
    const a = new XPBDClothSolver(mesh, { adaptiveSubsteps: false });
    const b = new XPBDClothSolver(mesh, { adaptiveSubsteps: false, fabricDensity: REFERENCE_FABRIC_DENSITY });
    expect(Array.from(a.invMass)).toEqual(Array.from(b.invMass));
  });
});
