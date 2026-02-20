import { describe, it, expect } from 'vitest';
import {
  SA_DEFAULTS,
  getDefaultSA,
  getDefaultGrainline,
  getDefaultNotches,
  getDefaultPositions,
  getPieceDefaults,
} from '../defaults';

describe('SA_DEFAULTS', () => {
  it('should have standard seam at 10mm', () => {
    expect(SA_DEFAULTS.seam).toBe(10);
  });

  it('should have hem at 15mm', () => {
    expect(SA_DEFAULTS.hem).toBe(15);
  });

  it('should have armhole at 7mm', () => {
    expect(SA_DEFAULTS.armhole).toBe(7);
  });
});

describe('getDefaultSA', () => {
  it('should return standard SA for bodice', () => {
    expect(getDefaultSA('bodice-front')).toBe(10);
  });

  it('should return neckline SA for collar', () => {
    expect(getDefaultSA('collar')).toBe(7);
  });

  it('should return standard SA for unknown template', () => {
    expect(getDefaultSA('unknown')).toBe(10);
  });
});

describe('getDefaultGrainline', () => {
  it('should return vertical for bodice', () => {
    expect(getDefaultGrainline('bodice-front')).toBe('vertical');
  });

  it('should return horizontal for collar', () => {
    expect(getDefaultGrainline('collar')).toBe('horizontal');
  });

  it('should return vertical as default', () => {
    expect(getDefaultGrainline('unknown')).toBe('vertical');
  });
});

describe('getDefaultNotches', () => {
  it('should return notches for bodice-front', () => {
    const notches = getDefaultNotches('bodice-front');
    expect(notches.length).toBeGreaterThan(0);
    // Front pieces have single notches
    expect(notches[0].count).toBe(1);
  });

  it('should return double notches for back pieces', () => {
    const notches = getDefaultNotches('bodice-back');
    expect(notches.length).toBeGreaterThan(0);
    expect(notches[0].count).toBe(2);
  });

  it('should return empty for unknown template', () => {
    expect(getDefaultNotches('unknown')).toEqual([]);
  });

  it('should have 3 notches for sleeve (front, head, back)', () => {
    const notches = getDefaultNotches('sleeve');
    expect(notches.length).toBe(3);
  });
});

describe('getDefaultPositions', () => {
  it('should position front pieces before back pieces', () => {
    const positions = getDefaultPositions(['bodice-front', 'bodice-back']);
    expect(positions['bodice-front'].x).toBeLessThan(positions['bodice-back'].x);
  });

  it('should handle single template', () => {
    const positions = getDefaultPositions(['sleeve']);
    expect(positions['sleeve']).toBeDefined();
    expect(positions['sleeve'].x).toBe(50);
  });
});

describe('getPieceDefaults', () => {
  it('should return complete defaults for bodice-front in Spanish', () => {
    const defaults = getPieceDefaults('bodice-front', 'es', ['bodice-front', 'bodice-back']);
    expect(defaults.name).toBe('Delantero Corpiño');
    expect(defaults.seamAllowance).toBe(10);
    expect(defaults.grainlineDirection).toBe('vertical');
    expect(defaults.notches.length).toBeGreaterThan(0);
  });

  it('should return complete defaults for bodice-front in English', () => {
    const defaults = getPieceDefaults('bodice-front', 'en', ['bodice-front']);
    expect(defaults.name).toBe('Front Bodice');
  });
});
