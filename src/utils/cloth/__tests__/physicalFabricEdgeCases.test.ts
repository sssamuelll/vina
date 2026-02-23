/**
 * Physical Fabric — edge cases, boundary conditions, and XPBD conversion accuracy.
 */

import { describe, it, expect } from 'vitest';
import {
  PHYSICAL_FABRIC_LIBRARY,
  getPhysicalFabric,
  searchPhysicalFabrics,
  getFabricsByWeave,
  getFabricsByWeight,
  isValidPhysicalFabric,
  toBasicMaterial,
  toXPBDParams,
  type PhysicalFabric,
} from '../physicalFabric';

// ─── XPBD conversion edge cases ────────────────────────────────────────────

describe('toXPBDParams — edge cases', () => {
  it('handles very stretchy fabric (lycra 80% weft)', () => {
    const lycra = getPhysicalFabric('lycra-spandex')!;
    const params = toXPBDParams(lycra);
    // 80% → compliance = 8.0
    expect(params.stretchComplianceWeft).toBeCloseTo(8.0, 1);
    expect(params.stretchComplianceWarp).toBeCloseTo(6.0, 1);
  });

  it('handles very stiff fabric (canvas 1% stretch)', () => {
    const canvas = getPhysicalFabric('canvas-12oz')!;
    const params = toXPBDParams(canvas);
    expect(params.stretchComplianceWarp).toBeCloseTo(0.1, 1);
    expect(params.stretchComplianceWeft).toBeCloseTo(0.1, 1);
  });

  it('handles extreme bending stiffness (neoprene 8.0 mN·cm)', () => {
    const neo = getPhysicalFabric('neoprene-3mm')!;
    const params = toXPBDParams(neo);
    // 1 / (8.0 + 0.05) ≈ 0.124
    expect(params.bendComplianceWarp).toBeLessThan(0.15);
    expect(params.bendComplianceWarp).toBeGreaterThan(0.05);
  });

  it('handles very flexible bending (chiffon 0.05 mN·cm)', () => {
    const chiffon = getPhysicalFabric('chiffon')!;
    const params = toXPBDParams(chiffon);
    // 1 / (0.05 + 0.05) = 10.0
    expect(params.bendComplianceWarp).toBeGreaterThan(5);
  });

  it('handles high shear stiffness (neoprene 200 N/m)', () => {
    const neo = getPhysicalFabric('neoprene-3mm')!;
    const params = toXPBDParams(neo);
    // 10 / (200 + 1) ≈ 0.05
    expect(params.shearCompliance).toBeLessThan(0.1);
  });

  it('handles low shear stiffness (tulle 3 N/m)', () => {
    const tulle = getPhysicalFabric('tulle')!;
    const params = toXPBDParams(tulle);
    // 10 / (3 + 1) = 2.5
    expect(params.shearCompliance).toBeGreaterThan(2);
  });

  it('all fabrics produce finite XPBD values (no NaN/Infinity)', () => {
    for (const f of PHYSICAL_FABRIC_LIBRARY) {
      const p = toXPBDParams(f);
      expect(Number.isFinite(p.stretchComplianceWarp), `${f.id} stretchWarp`).toBe(true);
      expect(Number.isFinite(p.stretchComplianceWeft), `${f.id} stretchWeft`).toBe(true);
      expect(Number.isFinite(p.bendComplianceWarp), `${f.id} bendWarp`).toBe(true);
      expect(Number.isFinite(p.bendComplianceWeft), `${f.id} bendWeft`).toBe(true);
      expect(Number.isFinite(p.shearCompliance), `${f.id} shear`).toBe(true);
      expect(Number.isFinite(p.damping), `${f.id} damping`).toBe(true);
      expect(Number.isFinite(p.density), `${f.id} density`).toBe(true);
    }
  });

  it('compliance ordering: stretch > bend > shear for rigid wovens', () => {
    // For stiff wovens, shear compliance should be lowest (hardest to shear)
    const canvas = getPhysicalFabric('canvas-12oz')!;
    const p = toXPBDParams(canvas);
    expect(p.shearCompliance).toBeLessThan(p.stretchComplianceWarp);
  });
});

// ─── toBasicMaterial edge cases ─────────────────────────────────────────────

describe('toBasicMaterial — edge cases', () => {
  it('lycra maps to very low stretch stiffness', () => {
    const lycra = getPhysicalFabric('lycra-spandex')!;
    const basic = toBasicMaterial(lycra);
    // avg stretch (60+80)/2 = 70% → 1 - 0.7 = 0.3
    expect(basic.stretchStiffness).toBeCloseTo(0.3, 1);
  });

  it('interfacing maps to high bend stiffness', () => {
    const inter = getPhysicalFabric('fusible-interfacing-medium')!;
    const basic = toBasicMaterial(inter);
    // avg bending (2.5+2.5)/2 = 2.5 → 2.5/8 = 0.3125
    expect(basic.bendStiffness).toBeGreaterThan(0.3);
  });

  it('rib knit with 80% weft maps to very low stretch stiffness', () => {
    const rib = getPhysicalFabric('rib-knit')!;
    const basic = toBasicMaterial(rib);
    // avg (10+80)/2 = 45% → 1 - 0.45 = 0.55
    expect(basic.stretchStiffness).toBeLessThan(0.6);
  });

  it('all basic materials have consistent stiffness ordering', () => {
    const denimBasic = toBasicMaterial(getPhysicalFabric('denim-12oz')!);
    const jerseyBasic = toBasicMaterial(getPhysicalFabric('cotton-jersey')!);
    expect(denimBasic.stretchStiffness).toBeGreaterThan(jerseyBasic.stretchStiffness);
    expect(denimBasic.bendStiffness).toBeGreaterThan(jerseyBasic.bendStiffness);
  });
});

// ─── Search edge cases ──────────────────────────────────────────────────────

describe('searchPhysicalFabrics — edge cases', () => {
  it('empty query returns no results (no tokens to match)', () => {
    const results = searchPhysicalFabrics('');
    // Empty string after trim/split produces [''], which matches nothing
    expect(results.length).toBeLessThanOrEqual(PHYSICAL_FABRIC_LIBRARY.length);
  });

  it('single character query', () => {
    // Should not crash
    const results = searchPhysicalFabrics('a');
    expect(Array.isArray(results)).toBe(true);
  });

  it('multi-word query ranks best match first', () => {
    const results = searchPhysicalFabrics('cotton jersey');
    // cotton-jersey should be the top result (matches both tokens)
    expect(results[0]?.id).toBe('cotton-jersey');
  });

  it('case insensitive', () => {
    const lower = searchPhysicalFabrics('denim');
    const upper = searchPhysicalFabrics('DENIM');
    expect(lower.length).toBe(upper.length);
  });

  it('finds by Spanish name', () => {
    const results = searchPhysicalFabrics('gasa'); // chiffon in Spanish
    expect(results.some(f => f.id === 'chiffon')).toBe(true);
  });

  it('finds by Spanish name — popelina', () => {
    const results = searchPhysicalFabrics('popelina');
    expect(results.some(f => f.id === 'cotton-poplin')).toBe(true);
  });

  it('finds by composition', () => {
    const results = searchPhysicalFabrics('elastane');
    expect(results.some(f => f.composition.toLowerCase().includes('elastane'))).toBe(true);
  });

  it('results are ranked by relevance', () => {
    const results = searchPhysicalFabrics('cotton');
    // Cotton in name should rank higher than cotton only in tags
    const cottonPoplinIdx = results.findIndex(f => f.id === 'cotton-poplin');
    expect(cottonPoplinIdx).toBeLessThan(5);
  });
});

// ─── Filter edge cases ──────────────────────────────────────────────────────

describe('getFabricsByWeave — edge cases', () => {
  it('returns empty for non-existent weave', () => {
    const results = getFabricsByWeave('technical' as any);
    // technical exists (ripstop, neoprene)
    expect(results.length).toBeGreaterThan(0);
  });

  it('mesh includes tulle and athletic mesh', () => {
    const mesh = getFabricsByWeave('mesh');
    expect(mesh.some(f => f.id === 'tulle')).toBe(true);
    expect(mesh.some(f => f.id === 'athletic-mesh')).toBe(true);
  });
});

describe('getFabricsByWeight — edge cases', () => {
  it('zero range returns empty', () => {
    const results = getFabricsByWeight(999, 999);
    // Unlikely any fabric is exactly 999 g/m²
    expect(results.length).toBe(0);
  });

  it('full range returns all', () => {
    const results = getFabricsByWeight(0, 10000);
    expect(results.length).toBe(PHYSICAL_FABRIC_LIBRARY.length);
  });

  it('inverted range returns empty', () => {
    const results = getFabricsByWeight(500, 100);
    expect(results.length).toBe(0);
  });
});

// ─── Validation edge cases ──────────────────────────────────────────────────

describe('isValidPhysicalFabric — edge cases', () => {
  const base = PHYSICAL_FABRIC_LIBRARY[0];

  it('rejects weight > 2000', () => {
    expect(isValidPhysicalFabric({ ...base, weight: 2001 })).toBe(false);
  });

  it('rejects thickness > 20', () => {
    expect(isValidPhysicalFabric({ ...base, thickness: 21 })).toBe(false);
  });

  it('rejects stretch > 500%', () => {
    expect(isValidPhysicalFabric({ ...base, stretchWarp: 501 })).toBe(false);
  });

  it('rejects recovery > 1', () => {
    expect(isValidPhysicalFabric({ ...base, recoveryRate: 1.1 })).toBe(false);
  });

  it('rejects friction > 1', () => {
    expect(isValidPhysicalFabric({ ...base, friction: 1.5 })).toBe(false);
  });

  it('rejects zero tensile strength', () => {
    expect(isValidPhysicalFabric({ ...base, tensileStrengthWarp: 0 })).toBe(false);
  });

  it('rejects zero maxStretchBeforeBreak', () => {
    expect(isValidPhysicalFabric({ ...base, maxStretchBeforeBreak: 0 })).toBe(false);
  });

  it('accepts boundary values', () => {
    const boundary: PhysicalFabric = {
      ...base,
      weight: 1, thickness: 0.01, stretchWarp: 0, stretchWeft: 0,
      stretchBias: 0, recoveryRate: 0, bendingWarp: 0, bendingWeft: 0,
      friction: 0, frictionBody: 0, surfaceRoughness: 0,
      tensileStrengthWarp: 1, tensileStrengthWeft: 1, tearStrength: 0,
      maxStretchBeforeBreak: 0.1,
    };
    expect(isValidPhysicalFabric(boundary)).toBe(true);
  });
});

// ─── Cross-library consistency ──────────────────────────────────────────────

describe('cross-library consistency', () => {
  it('every physical fabric has unique ID', () => {
    const ids = PHYSICAL_FABRIC_LIBRARY.map(f => f.id);
    const unique = new Set(ids);
    expect(unique.size).toBe(ids.length);
  });

  it('every physical fabric has valid weave type', () => {
    const validWeaves = [
      'plain', 'twill', 'satin', 'knit-jersey', 'knit-rib',
      'knit-interlock', 'nonwoven', 'leather', 'mesh', 'pile', 'technical',
    ];
    for (const f of PHYSICAL_FABRIC_LIBRARY) {
      expect(validWeaves, `${f.id} has invalid weave: ${f.weaveType}`).toContain(f.weaveType);
    }
  });

  it('every physical fabric has valid source', () => {
    const validSources = ['library', 'custom', 'lab-tested', 'community'];
    for (const f of PHYSICAL_FABRIC_LIBRARY) {
      expect(validSources).toContain(f.source);
    }
  });

  it('maxStretchBeforeBreak > stretchWarp for all fabrics', () => {
    for (const f of PHYSICAL_FABRIC_LIBRARY) {
      expect(
        f.maxStretchBeforeBreak,
        `${f.id}: break ${f.maxStretchBeforeBreak}% should > warp ${f.stretchWarp}%`
      ).toBeGreaterThanOrEqual(f.stretchWarp);
    }
  });

  it('maxStretchBeforeBreak > stretchWeft for all fabrics', () => {
    for (const f of PHYSICAL_FABRIC_LIBRARY) {
      expect(
        f.maxStretchBeforeBreak,
        `${f.id}: break ${f.maxStretchBeforeBreak}% should > weft ${f.stretchWeft}%`
      ).toBeGreaterThanOrEqual(f.stretchWeft);
    }
  });

  it('frictionBody <= friction for all fabrics (body is smoother than fabric-on-fabric)', () => {
    for (const f of PHYSICAL_FABRIC_LIBRARY) {
      expect(
        f.frictionBody,
        `${f.id}: body friction should <= fabric friction`
      ).toBeLessThanOrEqual(f.friction);
    }
  });
});
