/**
 * Unit tests for the Fabric Material Library.
 */
import { describe, it, expect } from 'vitest';
import {
  FABRIC_LIBRARY,
  fabricToCompliance,
  getAllFabricIds,
  getFabricById,
  getComplianceForFabric,
  isValidFabricMaterial,
  type FabricMaterial,
} from '../fabricLibrary';

// ─── Library Completeness ────────────────────────────────────────────────

describe('Fabric Library - Contents', () => {
  it('should contain at least 10 fabrics', () => {
    const ids = getAllFabricIds();
    expect(ids.length).toBeGreaterThanOrEqual(10);
  });

  it('should contain all required fabric types', () => {
    const ids = getAllFabricIds();
    const required = [
      'cotton-poplin', 'denim', 'silk-charmeuse', 'wool-crepe', 'jersey-knit',
      'organza', 'linen', 'neoprene', 'chiffon', 'canvas',
    ];
    for (const id of required) {
      expect(ids).toContain(id);
    }
  });
});

// ─── Material Validation ─────────────────────────────────────────────────

describe('Fabric Library - Material Validity', () => {
  it('all materials should pass validation', () => {
    for (const id of getAllFabricIds()) {
      const mat = FABRIC_LIBRARY[id];
      expect(isValidFabricMaterial(mat)).toBe(true);
    }
  });

  it('should reject a material with zero weight', () => {
    const bad: FabricMaterial = {
      name: 'Bad', weight: 0, stretchStiffness: 0.5,
      bendStiffness: 0.5, friction: 0.5, thickness: 0.5,
    };
    expect(isValidFabricMaterial(bad)).toBe(false);
  });

  it('should reject a material with out-of-range stiffness', () => {
    const bad: FabricMaterial = {
      name: 'Bad', weight: 100, stretchStiffness: 1.5,
      bendStiffness: 0.5, friction: 0.5, thickness: 0.5,
    };
    expect(isValidFabricMaterial(bad)).toBe(false);
  });

  it('should reject a material with empty name', () => {
    const bad: FabricMaterial = {
      name: '', weight: 100, stretchStiffness: 0.5,
      bendStiffness: 0.5, friction: 0.5, thickness: 0.5,
    };
    expect(isValidFabricMaterial(bad)).toBe(false);
  });
});

// ─── Compliance Conversion ───────────────────────────────────────────────

describe('Fabric Library - Compliance Conversion', () => {
  it('should return lower stretching compliance for stiffer fabrics', () => {
    const denim = fabricToCompliance(FABRIC_LIBRARY['denim']);
    const jersey = fabricToCompliance(FABRIC_LIBRARY['jersey-knit']);
    expect(denim.stretchingCompliance).toBeLessThan(jersey.stretchingCompliance);
  });

  it('should return lower bending compliance for stiffer fabrics', () => {
    const canvas = fabricToCompliance(FABRIC_LIBRARY['canvas']);
    const chiffon = fabricToCompliance(FABRIC_LIBRARY['chiffon']);
    expect(canvas.bendingCompliance).toBeLessThan(chiffon.bendingCompliance);
  });

  it('should return non-negative compliance values', () => {
    for (const id of getAllFabricIds()) {
      const compliance = getComplianceForFabric(id);
      expect(compliance.stretchingCompliance).toBeGreaterThanOrEqual(0);
      expect(compliance.bendingCompliance).toBeGreaterThanOrEqual(0);
    }
  });

  it('should return damping in valid range (0.9 - 1.0)', () => {
    for (const id of getAllFabricIds()) {
      const compliance = getComplianceForFabric(id);
      expect(compliance.damping).toBeGreaterThanOrEqual(0.9);
      expect(compliance.damping).toBeLessThanOrEqual(1.0);
    }
  });

  it('should return ground friction matching material friction', () => {
    for (const id of getAllFabricIds()) {
      const mat = FABRIC_LIBRARY[id];
      const compliance = getComplianceForFabric(id);
      expect(compliance.groundFriction).toBeCloseTo(mat.friction);
    }
  });
});

// ─── Lookup Functions ────────────────────────────────────────────────────

describe('Fabric Library - Lookups', () => {
  it('getFabricById should return correct material', () => {
    const silk = getFabricById('silk-charmeuse');
    expect(silk).toBeDefined();
    expect(silk!.name).toBe('Silk Charmeuse');
  });

  it('getFabricById should return undefined for unknown id', () => {
    const unknown = getFabricById('unicorn-hair');
    expect(unknown).toBeUndefined();
  });

  it('getComplianceForFabric should fall back to cotton for unknown id', () => {
    const unknown = getComplianceForFabric('unicorn-hair');
    const cotton = getComplianceForFabric('cotton-poplin');
    expect(unknown.stretchingCompliance).toBeCloseTo(cotton.stretchingCompliance);
    expect(unknown.bendingCompliance).toBeCloseTo(cotton.bendingCompliance);
  });
});

// ─── Physical Reasonableness ─────────────────────────────────────────────

describe('Fabric Library - Physical Reasonableness', () => {
  it('silk should be lighter than denim', () => {
    expect(FABRIC_LIBRARY['silk-charmeuse'].weight).toBeLessThan(FABRIC_LIBRARY['denim'].weight);
  });

  it('chiffon should be more flexible (lower bend stiffness) than canvas', () => {
    expect(FABRIC_LIBRARY['chiffon'].bendStiffness).toBeLessThan(FABRIC_LIBRARY['canvas'].bendStiffness);
  });

  it('jersey knit should be stretchier (lower stretch stiffness) than denim', () => {
    expect(FABRIC_LIBRARY['jersey-knit'].stretchStiffness).toBeLessThan(FABRIC_LIBRARY['denim'].stretchStiffness);
  });

  it('neoprene should be thicker than chiffon', () => {
    expect(FABRIC_LIBRARY['neoprene'].thickness).toBeGreaterThan(FABRIC_LIBRARY['chiffon'].thickness);
  });
});
