/**
 * Physical Fabric Library tests — data integrity, conversion accuracy,
 * search, and physical reasonableness.
 */

import { describe, it, expect } from 'vitest';
import {
  PHYSICAL_FABRIC_LIBRARY,
  getAllPhysicalFabrics,
  getPhysicalFabric,
  searchPhysicalFabrics,
  getFabricsByWeave,
  getFabricsByWeight,
  isValidPhysicalFabric,
  toXPBDParams,
} from '../physicalFabric';

// ─── Library completeness ───────────────────────────────────────────────────

describe('Physical Fabric Library — contents', () => {
  it('has at least 30 fabrics', () => {
    expect(getAllPhysicalFabrics().length).toBeGreaterThanOrEqual(30);
  });

  it('covers all major weave types', () => {
    const weaves = new Set(PHYSICAL_FABRIC_LIBRARY.map(f => f.weaveType));
    expect(weaves.has('plain')).toBe(true);
    expect(weaves.has('twill')).toBe(true);
    expect(weaves.has('satin')).toBe(true);
    expect(weaves.has('knit-jersey')).toBe(true);
    expect(weaves.has('knit-interlock')).toBe(true);
    expect(weaves.has('knit-rib')).toBe(true);
    expect(weaves.has('nonwoven')).toBe(true);
    expect(weaves.has('leather')).toBe(true);
  });

  it('has no duplicate IDs', () => {
    const ids = PHYSICAL_FABRIC_LIBRARY.map(f => f.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('all entries have Spanish names', () => {
    for (const f of PHYSICAL_FABRIC_LIBRARY) {
      expect(f.nameEs.length).toBeGreaterThan(0);
    }
  });

  it('all entries have at least one tag', () => {
    for (const f of PHYSICAL_FABRIC_LIBRARY) {
      expect(f.tags.length).toBeGreaterThan(0);
    }
  });
});

// ─── Validation ─────────────────────────────────────────────────────────────

describe('Physical Fabric Library — validation', () => {
  it('all library entries pass validation', () => {
    for (const f of PHYSICAL_FABRIC_LIBRARY) {
      expect(isValidPhysicalFabric(f), `${f.id} failed validation`).toBe(true);
    }
  });

  it('rejects fabric with zero weight', () => {
    const bad = { ...PHYSICAL_FABRIC_LIBRARY[0], weight: 0 };
    expect(isValidPhysicalFabric(bad)).toBe(false);
  });

  it('rejects fabric with negative stretch', () => {
    const bad = { ...PHYSICAL_FABRIC_LIBRARY[0], stretchWarp: -5 };
    expect(isValidPhysicalFabric(bad)).toBe(false);
  });

  it('rejects fabric with empty ID', () => {
    const bad = { ...PHYSICAL_FABRIC_LIBRARY[0], id: '' };
    expect(isValidPhysicalFabric(bad)).toBe(false);
  });
});

// ─── Physical reasonableness ────────────────────────────────────────────────

describe('Physical Fabric Library — physical reasonableness', () => {
  it('silk is lighter than denim', () => {
    const silk = getPhysicalFabric('silk-charmeuse')!;
    const denim = getPhysicalFabric('denim-12oz')!;
    expect(silk.weight).toBeLessThan(denim.weight);
  });

  it('chiffon has more drape than canvas', () => {
    const chiffon = getPhysicalFabric('chiffon')!;
    const canvas = getPhysicalFabric('canvas-12oz')!;
    expect(chiffon.drapeCoefficient).toBeGreaterThan(canvas.drapeCoefficient);
  });

  it('lycra stretches more than denim in weft', () => {
    const lycra = getPhysicalFabric('lycra-spandex')!;
    const denim = getPhysicalFabric('denim-12oz')!;
    expect(lycra.stretchWeft).toBeGreaterThan(denim.stretchWeft);
  });

  it('lycra has higher recovery than cotton poplin', () => {
    const lycra = getPhysicalFabric('lycra-spandex')!;
    const poplin = getPhysicalFabric('cotton-poplin')!;
    expect(lycra.recoveryRate).toBeGreaterThan(poplin.recoveryRate);
  });

  it('neoprene is thicker than chiffon', () => {
    const neo = getPhysicalFabric('neoprene-3mm')!;
    const chiffon = getPhysicalFabric('chiffon')!;
    expect(neo.thickness).toBeGreaterThan(chiffon.thickness);
  });

  it('weft stretch >= warp stretch for all knits (cross-grain stretches more)', () => {
    const knits = PHYSICAL_FABRIC_LIBRARY.filter(f =>
      f.weaveType.startsWith('knit')
    );
    for (const k of knits) {
      expect(k.stretchWeft, `${k.id}: weft should >= warp`).toBeGreaterThanOrEqual(k.stretchWarp);
    }
  });

  it('bias stretch > warp stretch for wovens', () => {
    const wovens = PHYSICAL_FABRIC_LIBRARY.filter(f =>
      ['plain', 'twill', 'satin'].includes(f.weaveType)
    );
    for (const w of wovens) {
      expect(w.stretchBias, `${w.id}: bias should > warp`).toBeGreaterThan(w.stretchWarp);
    }
  });

  it('tensile strength warp >= weft for wovens', () => {
    const wovens = PHYSICAL_FABRIC_LIBRARY.filter(f =>
      ['plain', 'twill', 'satin'].includes(f.weaveType)
    );
    for (const w of wovens) {
      expect(
        w.tensileStrengthWarp,
        `${w.id}: warp tensile should >= weft`
      ).toBeGreaterThanOrEqual(w.tensileStrengthWeft);
    }
  });

  it('nonwovens have isotropic bending (warp ≈ weft)', () => {
    const nonwovens = PHYSICAL_FABRIC_LIBRARY.filter(f => f.weaveType === 'nonwoven');
    for (const nw of nonwovens) {
      expect(Math.abs(nw.bendingWarp - nw.bendingWeft)).toBeLessThan(1.0);
    }
  });
});

// ─── Conversion to XPBD params ──────────────────────────────────────────────

describe('toXPBDParams', () => {
  it('stretchy fabrics get higher stretch compliance', () => {
    const lycra = toXPBDParams(getPhysicalFabric('lycra-spandex')!);
    const denim = toXPBDParams(getPhysicalFabric('denim-12oz')!);
    expect(lycra.stretchComplianceWarp).toBeGreaterThan(denim.stretchComplianceWarp);
    expect(lycra.stretchComplianceWeft).toBeGreaterThan(denim.stretchComplianceWeft);
  });

  it('stiff fabrics get lower bend compliance', () => {
    const neoprene = toXPBDParams(getPhysicalFabric('neoprene-3mm')!);
    const chiffon = toXPBDParams(getPhysicalFabric('chiffon')!);
    expect(neoprene.bendComplianceWarp).toBeLessThan(chiffon.bendComplianceWarp);
  });

  it('all compliance values are positive', () => {
    for (const f of PHYSICAL_FABRIC_LIBRARY) {
      const params = toXPBDParams(f);
      expect(params.stretchComplianceWarp).toBeGreaterThan(0);
      expect(params.stretchComplianceWeft).toBeGreaterThan(0);
      expect(params.bendComplianceWarp).toBeGreaterThan(0);
      expect(params.bendComplianceWeft).toBeGreaterThan(0);
      expect(params.shearCompliance).toBeGreaterThan(0);
    }
  });

  it('stretch + shear compliance land in the solver live alpha band (#gummy STEP 3)', () => {
    // Same alpha=compliance/sdt² band as bend. The old scale (stretchWarp/10 →
    // 0.2-8, shear 0.01-10) gave null constraints. Rescaled so the fabric's
    // real stretch/shear stiffness differentiates materials when wired to the GPU.
    for (const f of PHYSICAL_FABRIC_LIBRARY) {
      const p = toXPBDParams(f);
      for (const c of [p.stretchComplianceWarp, p.stretchComplianceWeft]) {
        expect(c).toBeGreaterThanOrEqual(5e-7);
        expect(c).toBeLessThanOrEqual(1e-5);
      }
      expect(p.shearCompliance).toBeGreaterThanOrEqual(1e-5);
      expect(p.shearCompliance).toBeLessThanOrEqual(1e-4);
    }
  });

  it('bend compliance lands in the solver live alpha band (dead-bend fix)', () => {
    // The GPU/WASM/CPU solvers compute alpha = compliance/sdt² with sdt=1/900
    // (sdt²≈1.23e-6). A bend compliance on the old 0.05-20 scale gives
    // alpha=40k-16M → correction ≈0 → the bend constraint is DEAD (floppy cloth).
    // Every fabric must land in ~[1.2e-6, 2e-4] so the bend actually resists folding.
    for (const f of PHYSICAL_FABRIC_LIBRARY) {
      const p = toXPBDParams(f);
      for (const c of [p.bendComplianceWarp, p.bendComplianceWeft]) {
        expect(c).toBeGreaterThanOrEqual(1.2e-6);
        expect(c).toBeLessThanOrEqual(2e-4);
      }
    }
  });

  it('preserves diagnostic thresholds', () => {
    const poplin = getPhysicalFabric('cotton-poplin')!;
    const params = toXPBDParams(poplin);
    expect(params.maxStretchPercent).toBe(poplin.maxStretchBeforeBreak);
    expect(params.tensileStrengthWarp).toBe(poplin.tensileStrengthWarp);
  });

  it('density conversion is correct (g/m² → kg/m²)', () => {
    const poplin = getPhysicalFabric('cotton-poplin')!;
    const params = toXPBDParams(poplin);
    expect(params.density).toBeCloseTo(0.13, 2);
  });

  it('heavier fabrics get more damping', () => {
    const chiffon = toXPBDParams(getPhysicalFabric('chiffon')!);
    const canvas = toXPBDParams(getPhysicalFabric('canvas-12oz')!);
    expect(canvas.damping).toBeGreaterThan(chiffon.damping);
  });
});

// ─── Search ─────────────────────────────────────────────────────────────────

describe('searchPhysicalFabrics', () => {
  it('finds cotton poplin by English name', () => {
    const results = searchPhysicalFabrics('poplin');
    expect(results.some(f => f.id === 'cotton-poplin')).toBe(true);
  });

  it('finds denim by Spanish name', () => {
    const results = searchPhysicalFabrics('denim');
    expect(results.some(f => f.id === 'denim-12oz')).toBe(true);
  });

  it('finds fabrics by tag', () => {
    const results = searchPhysicalFabrics('sportswear');
    expect(results.some(f => f.id === 'lycra-spandex')).toBe(true);
  });

  it('finds fabrics by composition', () => {
    const results = searchPhysicalFabrics('silk');
    expect(results.some(f => f.id === 'silk-charmeuse')).toBe(true);
  });

  it('finds fabrics by use case', () => {
    const results = searchPhysicalFabrics('jacket');
    expect(results.length).toBeGreaterThan(0);
  });

  it('returns empty for nonsense query', () => {
    const results = searchPhysicalFabrics('xyzzyplugh');
    expect(results).toHaveLength(0);
  });
});

// ─── Filter ─────────────────────────────────────────────────────────────────

describe('getFabricsByWeave', () => {
  it('returns only knit-jersey fabrics', () => {
    const knits = getFabricsByWeave('knit-jersey');
    expect(knits.length).toBeGreaterThan(0);
    expect(knits.every(f => f.weaveType === 'knit-jersey')).toBe(true);
  });
});

describe('getFabricsByWeight', () => {
  it('finds lightweight fabrics (< 100 gsm)', () => {
    const light = getFabricsByWeight(0, 100);
    expect(light.length).toBeGreaterThan(0);
    expect(light.every(f => f.weight <= 100)).toBe(true);
  });

  it('finds heavyweight fabrics (> 400 gsm)', () => {
    const heavy = getFabricsByWeight(400, 2000);
    expect(heavy.length).toBeGreaterThan(0);
    expect(heavy.every(f => f.weight >= 400)).toBe(true);
  });
});

// ─── Lookup ─────────────────────────────────────────────────────────────────

describe('getPhysicalFabric', () => {
  it('returns fabric by ID', () => {
    const f = getPhysicalFabric('cotton-jersey');
    expect(f).toBeDefined();
    expect(f!.name).toBe('Cotton Jersey');
  });

  it('returns undefined for unknown ID', () => {
    expect(getPhysicalFabric('unicorn-silk')).toBeUndefined();
  });
});
