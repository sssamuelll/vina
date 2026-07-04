import { describe, it, expect } from 'vitest';
import { SEAM_PALETTE, mixHex, seamPaletteColor, seamThreadColor } from '../seamPalette';

describe('seamPalette', () => {
  it('asigna hue ESTABLE por id (no depende del orden ni de otras costuras)', () => {
    const a = seamPaletteColor('seam-abc');
    expect(seamPaletteColor('seam-abc')).toBe(a);
    expect(SEAM_PALETTE).toContain(a);
  });

  it('ids distintos se reparten por la paleta (12 ids → varios hues)', () => {
    const hues = new Set(Array.from({ length: 12 }, (_, i) => seamPaletteColor(`seam-${i}`)));
    expect(hues.size).toBeGreaterThan(3);
  });

  it('proveniencia IA = mismo hue palidecido; humano = hue pleno', () => {
    const full = seamThreadColor('s1', 'human');
    const pale = seamThreadColor('s1', 'ai');
    expect(full).toBe(seamPaletteColor('s1'));
    expect(pale).not.toBe(full);
    expect(pale).toBe(mixHex(full, '#f3f4f6', 0.22));
  });

  it('mixHex interpola y mantiene formato hex', () => {
    expect(mixHex('#000000', '#ffffff', 0.5)).toBe('#808080');
    expect(mixHex('#ff0000', '#ff0000', 0.7)).toBe('#ff0000');
  });
});
