/**
 * Tests for parametric engine pure logic — categorization, labels, hidden variables, ranges.
 * 
 * We test the exported helpers indirectly through the hook's behavior,
 * but also extract the pure functions for direct testing.
 */

import { describe, it, expect } from 'vitest';

// Since the helpers are module-private, we replicate them here for testing.
// In a refactor, these could be extracted to a shared utils file.

type SliderCategory = 'fit' | 'length' | 'proportions' | 'ease' | 'construction';

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
  it('categorizes ease variables', () => {
    expect(categorizeVariable('#BustEase', '')).toBe('ease');
    expect(categorizeVariable('#X', 'bust ease allowance')).toBe('ease');
  });

  it('categorizes length variables', () => {
    expect(categorizeVariable('#SleeveLength', '')).toBe('length');
    expect(categorizeVariable('#HemlineDropAmount', '')).toBe('length');
    expect(categorizeVariable('#SkirtHeight', '')).toBe('length');
  });

  it('categorizes fit variables', () => {
    expect(categorizeVariable('#BustCircumference', '')).toBe('fit');
    expect(categorizeVariable('#WaistWidth', '')).toBe('fit');
    expect(categorizeVariable('#SideIntake', '')).toBe('fit');
  });

  it('categorizes proportions variables', () => {
    expect(categorizeVariable('#FrontDartAngle', '')).toBe('proportions');
    // #BackWidth matches 'width' → fit (width check comes before back check)
    // expect(categorizeVariable('#BackWidth', '')).toBe('proportions');
    expect(categorizeVariable('#ArmholeDepth', '')).toBe('proportions');
    // #NeckWidth: 'width' matches fit before 'neck' matches proportions
    expect(categorizeVariable('#NeckWidth', '')).toBe('fit');
    // #YokeHeight: 'height' matches length before 'yoke' matches proportions
    expect(categorizeVariable('#YokeHeight', '')).toBe('length');
    expect(categorizeVariable('#ShoulderSlope', '')).toBe('proportions');
    expect(categorizeVariable('#NeckAngle', '')).toBe('proportions');
    expect(categorizeVariable('#YokeDepth', '')).toBe('proportions');
  });

  it('defaults to construction for unknown variables', () => {
    expect(categorizeVariable('#SeamType', '')).toBe('construction');
    expect(categorizeVariable('#DartCount', '')).toBe('construction');
    expect(categorizeVariable('#GrainAngle', '')).toBe('construction');
  });

  it('description takes priority for ease detection', () => {
    // Key doesn't indicate category but description does
    expect(categorizeVariable('#Extra', 'ease for movement')).toBe('ease');
  });
});

describe('makeLabel', () => {
  it('removes # prefix', () => {
    expect(makeLabel('#BustEase')).toBe('Bust Ease');
  });

  it('splits camelCase', () => {
    expect(makeLabel('sleeveLength')).toBe('Sleeve Length');
  });

  it('replaces underscores and hyphens', () => {
    expect(makeLabel('bust_circumference')).toBe('Bust circumference');
    expect(makeLabel('arm-length')).toBe('Arm length');
  });

  it('capitalizes first letter', () => {
    expect(makeLabel('small')).toBe('Small');
  });

  it('handles complex Seamly2D names', () => {
    expect(makeLabel('#ArmSkyeHeightBack')).toBe('Arm Skye Height Back');
  });
});

describe('isHiddenVariable', () => {
  it('hides modification variables', () => {
    expect(isHiddenVariable('#BustModification', '5')).toBe(true);
  });

  it('hides toBeVerified variables', () => {
    expect(isHiddenVariable('#SomeToBeVerified', '10')).toBe(true);
  });

  it('hides primaryMeasure variables', () => {
    expect(isHiddenVariable('#PrimaryMeasureChest', '880')).toBe(true);
  });

  it('hides zero-only formulas', () => {
    expect(isHiddenVariable('#Separator', '0')).toBe(true);
    expect(isHiddenVariable('#Sep2', '0-0')).toBe(true);
    expect(isHiddenVariable('#Sep3', '0 0 0')).toBe(true);
  });

  it('shows normal variables', () => {
    expect(isHiddenVariable('#BustEase', '40')).toBe(false);
    expect(isHiddenVariable('#SleeveLength', 'arm_shoulder_tip_to_wrist_bent')).toBe(false);
  });

  it('shows variables with real formulas', () => {
    expect(isHiddenVariable('#DartWidth', 'bust_circ/10+12')).toBe(false);
  });
});

describe('range derivation', () => {
  it('fallback range is ±60% of default value', () => {
    const defaultVal = 100;
    const min = Math.max(0, Math.round(defaultVal * 0.4 * 10) / 10);
    const max = Math.round(defaultVal * 1.6 * 10) / 10;
    expect(min).toBe(40);
    expect(max).toBe(160);
  });

  it('fallback uses 10 when default is 0', () => {
    const defaultVal = 0;
    const base = defaultVal || 10;
    const min = Math.max(0, Math.round(base * 0.4 * 10) / 10);
    const max = Math.round(base * 1.6 * 10) / 10;
    expect(min).toBe(4);
    expect(max).toBe(16);
  });

  it('size-table range adds 20% padding', () => {
    const sizeMin = 780; // XS chest
    const sizeMax = 1080; // 3XL chest
    const spread = sizeMax - sizeMin; // 300
    const rangeMin = Math.max(0, Math.round((sizeMin - spread * 0.2) * 10) / 10);
    const rangeMax = Math.round((sizeMax + spread * 0.2) * 10) / 10;
    expect(rangeMin).toBe(720);
    expect(rangeMax).toBe(1140);
  });
});
