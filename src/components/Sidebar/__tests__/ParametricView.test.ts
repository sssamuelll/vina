/**
 * ParametricView — unit tests for variable categorization, label generation,
 * and hidden variable detection.
 */

import { describe, it, expect } from 'vitest';

// We test the pure utility functions, not the React component
// (React component testing would need jsdom + RTL, which is a separate concern)

// ─── Replicate the pure functions for testing ───────────────────────────────

type SliderCategory = 'fit' | 'length' | 'proportions' | 'construction' | 'ease';

function categorizeVariable(key: string, desc: string): SliderCategory {
  const k = key.toLowerCase();
  const d = desc.toLowerCase();
  if (k.includes('ease') || d.includes('ease')) return 'ease';
  if (k.includes('height') || k.includes('length') || k.includes('hemline') || k.includes('drop')) return 'length';
  if (k.includes('width') || k.includes('circumf') || k.includes('intake') || k.includes('bust') || k.includes('waist')) return 'fit';
  if (k.includes('front') || k.includes('back') || k.includes('arm') || k.includes('neck') || k.includes('yoke') || k.includes('shoulder')) return 'proportions';
  return 'construction';
}

function makeLabel(key: string): string {
  return key
    .replace(/^#/, '')
    .replace(/([A-Z])/g, ' $1')
    .replace(/[_-]/g, ' ')
    .trim()
    .replace(/^\w/, c => c.toUpperCase());
}

function isHiddenVariable(key: string, formula: string): boolean {
  const k = key.toLowerCase();
  if (k.includes('modification') || k.includes('tobeverified') || k.includes('primarymeasure') || k.includes('auxiliarymeasure')) return true;
  if (/^[0\-\s]+$/.test(formula)) return true;
  return false;
}

// ─── Tests ──────────────────────────────────────────────────────────────────

describe('categorizeVariable', () => {
  it('categorizes bust/waist/circumference as fit', () => {
    expect(categorizeVariable('#BustCircumfence', '')).toBe('fit');
    expect(categorizeVariable('#WaistIntake', '')).toBe('fit');
    expect(categorizeVariable('#SideIntake', '')).toBe('fit');
  });

  it('categorizes hemline/height/length/drop as length', () => {
    expect(categorizeVariable('#Hemline', '')).toBe('length');
    expect(categorizeVariable('#BackHeight', '')).toBe('length');
    expect(categorizeVariable('#SleeveLength', '')).toBe('length');
    expect(categorizeVariable('#ArmSkyeDrop', '')).toBe('length');
  });

  it('categorizes front/back/arm/neck/yoke/shoulder as proportions', () => {
    expect(categorizeVariable('#FrontWidth', '')).toBe('fit'); // width takes priority
    expect(categorizeVariable('#BackNeckline', '')).toBe('proportions');
    expect(categorizeVariable('#YokeHeight', '')).toBe('length'); // height takes priority
    expect(categorizeVariable('#ArmSkyeHeightBack', '')).toBe('length');
    expect(categorizeVariable('#ShoulderSlope', '')).toBe('proportions');
  });

  it('categorizes ease variables', () => {
    expect(categorizeVariable('#SlimFitEase', '')).toBe('ease');
    expect(categorizeVariable('#NormalVar', 'This adds ease to the fit')).toBe('ease');
  });

  it('defaults to construction for unknowns', () => {
    expect(categorizeVariable('#RandomParam', '')).toBe('construction');
    expect(categorizeVariable('#CustomValue', 'some custom value')).toBe('construction');
  });
});

describe('makeLabel', () => {
  it('removes # prefix', () => {
    expect(makeLabel('#BustCircumfence')).toBe('Bust Circumfence');
  });

  it('splits camelCase', () => {
    expect(makeLabel('#ArmSkyeHeightBack')).toBe('Arm Skye Height Back');
  });

  it('replaces underscores and dashes', () => {
    expect(makeLabel('side_intake')).toBe('Side intake');
    expect(makeLabel('front-width')).toBe('Front width');
  });

  it('capitalizes first letter', () => {
    expect(makeLabel('hemline')).toBe('Hemline');
  });

  it('handles empty string', () => {
    expect(makeLabel('')).toBe('');
  });
});

describe('isHiddenVariable', () => {
  it('hides modification variables', () => {
    expect(isHiddenVariable('#Modifications', '0-0-0')).toBe(true);
  });

  it('hides to-be-verified variables', () => {
    expect(isHiddenVariable('#ToBeVerified', '0-0-0')).toBe(true);
  });

  it('hides primary/auxiliary measurement separators', () => {
    expect(isHiddenVariable('#Primarymeasuremements', '0-0-0')).toBe(true);
    expect(isHiddenVariable('#Auxiliarymeasurements', '0-0-0')).toBe(true);
  });

  it('hides all-zeros formulas', () => {
    expect(isHiddenVariable('#SomeVar', '0-0-0-0-0-0-0-0-0-0-0-0')).toBe(true);
  });

  it('keeps real variables', () => {
    expect(isHiddenVariable('#BustCircumfence', 'bust_circ+4')).toBe(false);
    expect(isHiddenVariable('#Hemline', 'height/2-10')).toBe(false);
    expect(isHiddenVariable('#SideIntake', '(bust_circ-waist_circ)/2/2/2')).toBe(false);
  });

  it('keeps variables with numeric formulas', () => {
    expect(isHiddenVariable('#YokeHeight', '8')).toBe(false);
    expect(isHiddenVariable('#NeckLineDropBack', '1')).toBe(false);
  });
});

describe('real Seamly2D male_shirt variables', () => {
  // Test against actual variable names from the male_shirt pattern
  const shirtVars = [
    { key: '#BackHeight', formula: 'neck_back_to_waist_b' },
    { key: '#ArmSkyeHeightBack', formula: '(bust_circ/10+12)+5' },
    { key: '#BustCircumfence', formula: 'bust_circ+4' },
    { key: '#FrontWidth', formula: '(#BustCircumfence < 112 ? ...)' },
    { key: '#BackWidth', formula: '(#BustCircumfence < 100 ? ...)' },
    { key: '#Hemline', formula: 'height/2-10' },
    { key: '#Modifications', formula: '0-0-0-0-0-0' },
    { key: '#ArmSkyeDrop', formula: '1' },
    { key: '#NeckLineHeightFront', formula: 'neck_circ/6+1' },
    { key: '#YokeHeight', formula: '8' },
    { key: '#SideIntake', formula: '(bust_circ-waist_circ)/2/2/2' },
    { key: '#ToBeVerified', formula: '0-0-0-0-0-0' },
  ];

  it('hides internal variables', () => {
    const hidden = shirtVars.filter(v => isHiddenVariable(v.key, v.formula));
    expect(hidden.map(h => h.key)).toContain('#Modifications');
    expect(hidden.map(h => h.key)).toContain('#ToBeVerified');
  });

  it('keeps design-relevant variables', () => {
    const visible = shirtVars.filter(v => !isHiddenVariable(v.key, v.formula));
    const keys = visible.map(v => v.key);
    expect(keys).toContain('#BackHeight');
    expect(keys).toContain('#BustCircumfence');
    expect(keys).toContain('#Hemline');
    expect(keys).toContain('#SideIntake');
    expect(keys).toContain('#YokeHeight');
  });

  it('categorizes male_shirt variables correctly', () => {
    const categories = shirtVars
      .filter(v => !isHiddenVariable(v.key, v.formula))
      .map(v => ({ key: v.key, cat: categorizeVariable(v.key, '') }));

    // BustCircumfence → fit
    expect(categories.find(c => c.key === '#BustCircumfence')?.cat).toBe('fit');
    // BackHeight → length
    expect(categories.find(c => c.key === '#BackHeight')?.cat).toBe('length');
    // Hemline → length
    expect(categories.find(c => c.key === '#Hemline')?.cat).toBe('length');
    // SideIntake → fit
    expect(categories.find(c => c.key === '#SideIntake')?.cat).toBe('fit');
  });
});
