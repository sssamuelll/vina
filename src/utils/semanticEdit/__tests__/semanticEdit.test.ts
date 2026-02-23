/**
 * Tests for semantic edit engine — variable matching, adjustment calculation.
 */

import { describe, it, expect } from 'vitest';
import {
  findFitVariables,
  findLengthVariables,
  findSleeveVariables,
  calculateFitAdjustment,
  calculateLengthAdjustment,
  calculateSleeveAdjustment,
  calculateProportionAdjustment,
} from '../index';
import type { VariableDefinition } from '../../seamly2d/formulaEvaluator';

// ─── Fixtures ───────────────────────────────────────────────────────────────

const mockVariables: Record<string, VariableDefinition> = {
  '#BustCircumference': { formula: '920', description: 'bust circumference' },
  '#BustEase': { formula: '40', description: 'bust ease allowance' },
  '#WaistWidth': { formula: '740', description: 'waist width' },
  '#WaistEase': { formula: '20', description: 'waist ease' },
  '#HipCircumference': { formula: '980', description: 'hip circumference' },
  '#SleeveLength': { formula: '595', description: 'sleeve length' },
  '#SleeveWidth': { formula: '350', description: 'sleeve width at bicep' },
  '#SleeveCapHeight': { formula: '140', description: 'sleeve cap height' },
  '#HemlineLength': { formula: '650', description: 'hemline length' },
  '#TorsoHeight': { formula: '420', description: 'torso body height' },
  '#SkirtLength': { formula: '550', description: 'skirt length' },
  '#ShoulderWidth': { formula: '400', description: 'shoulder width' },
  '#NeckCircumference': { formula: '365', description: 'neck circumference' },
  '#DartAngle': { formula: '12', description: 'dart angle' },
};

const mockResolved: Record<string, number> = {
  '#BustCircumference': 920,
  '#BustEase': 40,
  '#WaistWidth': 740,
  '#WaistEase': 20,
  '#HipCircumference': 980,
  '#SleeveLength': 595,
  '#SleeveWidth': 350,
  '#SleeveCapHeight': 140,
  '#HemlineLength': 650,
  '#TorsoHeight': 420,
  '#SkirtLength': 550,
  '#ShoulderWidth': 400,
  '#NeckCircumference': 365,
  '#DartAngle': 12,
};

// ─── findFitVariables ───────────────────────────────────────────────────────

describe('findFitVariables', () => {
  it('finds bust variables', () => {
    const vars = findFitVariables(mockVariables, mockResolved, 'bust');
    expect(vars.length).toBeGreaterThanOrEqual(2);
    expect(vars.some(v => v.key === '#BustCircumference')).toBe(true);
    expect(vars.some(v => v.key === '#BustEase' && v.isEase)).toBe(true);
  });

  it('finds waist variables', () => {
    const vars = findFitVariables(mockVariables, mockResolved, 'waist');
    expect(vars.length).toBeGreaterThanOrEqual(2);
    expect(vars.some(v => v.key === '#WaistWidth')).toBe(true);
    expect(vars.some(v => v.key === '#WaistEase')).toBe(true);
  });

  it('finds shoulder variables', () => {
    const vars = findFitVariables(mockVariables, mockResolved, 'shoulder');
    expect(vars.some(v => v.key === '#ShoulderWidth')).toBe(true);
  });

  it('finds neck variables', () => {
    const vars = findFitVariables(mockVariables, mockResolved, 'neck');
    expect(vars.some(v => v.key === '#NeckCircumference')).toBe(true);
  });

  it('returns empty for unknown region variables', () => {
    const vars = findFitVariables(mockVariables, mockResolved, 'armhole');
    // No armhole variables in our mock
    expect(vars).toEqual([]);
  });
});

// ─── findLengthVariables ────────────────────────────────────────────────────

describe('findLengthVariables', () => {
  it('finds sleeve length variables', () => {
    const vars = findLengthVariables(mockVariables, mockResolved, 'sleeve');
    expect(vars.some(v => v.key === '#SleeveLength')).toBe(true);
  });

  it('finds hem variables', () => {
    const vars = findLengthVariables(mockVariables, mockResolved, 'hem');
    expect(vars.some(v => v.key === '#HemlineLength')).toBe(true);
  });

  it('finds torso variables', () => {
    const vars = findLengthVariables(mockVariables, mockResolved, 'torso');
    expect(vars.some(v => v.key === '#TorsoHeight')).toBe(true);
  });

  it('finds skirt variables', () => {
    const vars = findLengthVariables(mockVariables, mockResolved, 'skirt');
    expect(vars.some(v => v.key === '#SkirtLength')).toBe(true);
  });
});

// ─── findSleeveVariables ────────────────────────────────────────────────────

describe('findSleeveVariables', () => {
  it('finds sleeve length', () => {
    const vars = findSleeveVariables(mockVariables, mockResolved, 'length');
    expect(vars.some(v => v.key === '#SleeveLength')).toBe(true);
  });

  it('finds sleeve width', () => {
    const vars = findSleeveVariables(mockVariables, mockResolved, 'width');
    expect(vars.some(v => v.key === '#SleeveWidth')).toBe(true);
  });

  it('finds sleeve cap height', () => {
    const vars = findSleeveVariables(mockVariables, mockResolved, 'cap_height');
    expect(vars.some(v => v.key === '#SleeveCapHeight')).toBe(true);
  });
});

// ─── calculateFitAdjustment ─────────────────────────────────────────────────

describe('calculateFitAdjustment', () => {
  it('makes bust looser by mm', () => {
    const adj = calculateFitAdjustment(mockVariables, mockResolved, 'bust', 'looser', 10);
    expect(adj.length).toBeGreaterThan(0);
    // Prefers ease variables — should increase BustEase
    const easeAdj = adj.find(a => a.variableKey === '#BustEase');
    expect(easeAdj).toBeDefined();
    expect(easeAdj!.newValue).toBeGreaterThan(easeAdj!.oldValue);
  });

  it('makes waist tighter by mm', () => {
    const adj = calculateFitAdjustment(mockVariables, mockResolved, 'waist', 'tighter', 15);
    expect(adj.length).toBeGreaterThan(0);
    const easeAdj = adj.find(a => a.variableKey === '#WaistEase');
    expect(easeAdj).toBeDefined();
    expect(easeAdj!.newValue).toBeLessThan(easeAdj!.oldValue);
  });

  it('supports percentage unit', () => {
    const adj = calculateFitAdjustment(mockVariables, mockResolved, 'bust', 'looser', 10, '%');
    expect(adj.length).toBeGreaterThan(0);
    // 10% of BustEase (40) = 4mm increase per variable
    const easeAdj = adj.find(a => a.variableKey === '#BustEase');
    expect(easeAdj).toBeDefined();
    expect(easeAdj!.newValue).toBeCloseTo(easeAdj!.oldValue + 4, 0);
  });

  it('returns empty for region with no variables', () => {
    const adj = calculateFitAdjustment(mockVariables, mockResolved, 'armhole', 'looser', 10);
    expect(adj).toEqual([]);
  });

  it('does not go below 0', () => {
    const adj = calculateFitAdjustment(mockVariables, mockResolved, 'waist', 'tighter', 1000);
    for (const a of adj) {
      expect(a.newValue).toBeGreaterThanOrEqual(0);
    }
  });
});

// ─── calculateLengthAdjustment ──────────────────────────────────────────────

describe('calculateLengthAdjustment', () => {
  it('shortens sleeves', () => {
    const adj = calculateLengthAdjustment(mockVariables, mockResolved, 'sleeve', 'shorter', 20);
    expect(adj.length).toBeGreaterThan(0);
    const sleeveAdj = adj.find(a => a.variableKey === '#SleeveLength');
    expect(sleeveAdj).toBeDefined();
    expect(sleeveAdj!.newValue).toBe(595 - 20);
  });

  it('lengthens hem', () => {
    const adj = calculateLengthAdjustment(mockVariables, mockResolved, 'hem', 'longer', 30);
    expect(adj.length).toBeGreaterThan(0);
    expect(adj[0].newValue).toBeGreaterThan(adj[0].oldValue);
  });

  it('percentage length change', () => {
    const adj = calculateLengthAdjustment(mockVariables, mockResolved, 'sleeve', 'shorter', 10, '%');
    expect(adj.length).toBeGreaterThan(0);
    // 10% of 595 = 59.5
    const sleeveAdj = adj.find(a => a.variableKey === '#SleeveLength');
    expect(sleeveAdj!.newValue).toBeCloseTo(595 - 59.5, 0);
  });
});

// ─── calculateSleeveAdjustment ──────────────────────────────────────────────

describe('calculateSleeveAdjustment', () => {
  it('increases sleeve width', () => {
    const adj = calculateSleeveAdjustment(mockVariables, mockResolved, 'width', 15);
    expect(adj.length).toBeGreaterThan(0);
    expect(adj[0].newValue).toBe(350 + 15);
  });

  it('decreases sleeve cap height', () => {
    const adj = calculateSleeveAdjustment(mockVariables, mockResolved, 'cap_height', -10);
    expect(adj.length).toBeGreaterThan(0);
    expect(adj[0].newValue).toBe(140 - 10);
  });

  it('shortens sleeve via negative amount', () => {
    const adj = calculateSleeveAdjustment(mockVariables, mockResolved, 'length', -30);
    expect(adj.length).toBeGreaterThan(0);
    expect(adj[0].newValue).toBe(595 - 30);
  });
});

// ─── calculateProportionAdjustment ──────────────────────────────────────────

describe('calculateProportionAdjustment', () => {
  it('shifts shoulder_to_waist (wider shoulders, narrower waist)', () => {
    const adj = calculateProportionAdjustment(mockVariables, mockResolved, 'shoulder_to_waist', 10);
    expect(adj.length).toBeGreaterThan(0);
    // Should have shoulder increase AND waist decrease
    const shoulderAdj = adj.find(a => a.variableKey === '#ShoulderWidth');
    const waistAdj = adj.find(a => a.variableKey.includes('Waist'));
    expect(shoulderAdj).toBeDefined();
    expect(waistAdj).toBeDefined();
    expect(shoulderAdj!.newValue).toBeGreaterThan(shoulderAdj!.oldValue);
    expect(waistAdj!.newValue).toBeLessThan(waistAdj!.oldValue);
  });

  it('shifts bodice_to_skirt (longer torso, shorter skirt)', () => {
    const adj = calculateProportionAdjustment(mockVariables, mockResolved, 'bodice_to_skirt', 15);
    expect(adj.length).toBeGreaterThan(0);
    const torsoAdj = adj.find(a => a.variableKey === '#TorsoHeight');
    const skirtAdj = adj.find(a => a.variableKey === '#SkirtLength');
    expect(torsoAdj).toBeDefined();
    expect(skirtAdj).toBeDefined();
    expect(torsoAdj!.newValue).toBeGreaterThan(torsoAdj!.oldValue);
    expect(skirtAdj!.newValue).toBeLessThan(skirtAdj!.oldValue);
  });

  it('negative shift reverses direction', () => {
    const adj = calculateProportionAdjustment(mockVariables, mockResolved, 'shoulder_to_waist', -10);
    const shoulderAdj = adj.find(a => a.variableKey === '#ShoulderWidth');
    expect(shoulderAdj!.newValue).toBeLessThan(shoulderAdj!.oldValue);
  });
});

// ─── Edge cases ─────────────────────────────────────────────────────────────

describe('edge cases', () => {
  it('handles empty variables', () => {
    const adj = calculateFitAdjustment({}, {}, 'bust', 'looser', 10);
    expect(adj).toEqual([]);
  });

  it('handles zero amount', () => {
    const adj = calculateFitAdjustment(mockVariables, mockResolved, 'bust', 'looser', 0);
    for (const a of adj) {
      expect(a.newValue).toBe(a.oldValue);
    }
  });

  it('handles missing resolved values gracefully', () => {
    const adj = calculateFitAdjustment(mockVariables, {}, 'bust', 'looser', 10);
    // Should still find variables, just with 0 as current value
    expect(adj.length).toBeGreaterThan(0);
  });

  it('multilingual: Spanish variable names', () => {
    const esVars: Record<string, VariableDefinition> = {
      '#LargoDeManga': { formula: '595', description: 'largo de manga' },
      '#AnchoDeCintura': { formula: '740', description: 'ancho de cintura' },
    };
    const esResolved = { '#LargoDeManga': 595, '#AnchoDeCintura': 740 };

    const sleeveVars = findLengthVariables(esVars, esResolved, 'sleeve');
    expect(sleeveVars.some(v => v.key === '#LargoDeManga')).toBe(true);

    const waistVars = findFitVariables(esVars, esResolved, 'waist');
    expect(waistVars.some(v => v.key === '#AnchoDeCintura')).toBe(true);
  });

  it('multilingual: German variable names', () => {
    const deVars: Record<string, VariableDefinition> = {
      '#ÄrmelLänge': { formula: '595', description: 'Ärmel Länge' },
      '#TailleWeite': { formula: '740', description: 'Taille Weite' },
    };
    const deResolved = { '#ÄrmelLänge': 595, '#TailleWeite': 740 };

    const sleeveVars = findLengthVariables(deVars, deResolved, 'sleeve');
    expect(sleeveVars.some(v => v.key === '#ÄrmelLänge')).toBe(true);

    const waistVars = findFitVariables(deVars, deResolved, 'waist');
    expect(waistVars.some(v => v.key === '#TailleWeite')).toBe(true);
  });
});
