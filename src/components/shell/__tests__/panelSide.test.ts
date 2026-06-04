import { describe, it, expect } from 'vitest';
import { getPanelSide } from '../panelSide';

describe('getPanelSide', () => {
  it('routes Grading to the left (2D domain)', () => {
    expect(getPanelSide('Grading')).toBe('left');
  });

  it('routes 3D-domain panels to the right', () => {
    expect(getPanelSide('Avatar')).toBe('right');
    expect(getPanelSide('BOM')).toBe('right');
  });

  it('defaults unknown / other panels to the right', () => {
    expect(getPanelSide('Inspector')).toBe('right');
    expect(getPanelSide('Nesting')).toBe('right');
    expect(getPanelSide('Zzz')).toBe('right');
  });
});
