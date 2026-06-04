import { describe, it, expect } from 'vitest';
import { generateRulerTicks, formatRulerLabel } from '../rulerTicks';

describe('rulerTicks', () => {
  describe('formatRulerLabel', () => {
    it('formats cm without suffix, trimming .0', () => {
      expect(formatRulerLabel(100, 'cm')).toBe('10');
      expect(formatRulerLabel(125, 'cm')).toBe('12.5');
    });
    it('formats mm as whole numbers', () => {
      expect(formatRulerLabel(100, 'mm')).toBe('100');
    });
    it('formats inches with one decimal', () => {
      expect(formatRulerLabel(25.4, 'inches')).toBe('1');
      expect(formatRulerLabel(50.8, 'inches')).toBe('2');
    });
  });

  describe('generateRulerTicks', () => {
    const base = { lengthPx: 1000, panPx: 0, zoom2D: 1, gridSizeMm: 10, units: 'cm' as const };

    it('returns empty for non-positive inputs', () => {
      expect(generateRulerTicks({ ...base, lengthPx: 0 })).toEqual([]);
      expect(generateRulerTicks({ ...base, zoom2D: 0 })).toEqual([]);
    });

    it('puts a major tick every 10 minor steps (10cm), minor every 1cm', () => {
      const ticks = generateRulerTicks(base);
      // origin (0mm) is major and labeled "0"
      const origin = ticks.find(t => t.vMm === 0);
      expect(origin?.isMajor).toBe(true);
      expect(origin?.label).toBe('0');
      // 100mm = 10cm is major
      expect(ticks.find(t => t.vMm === 100)?.isMajor).toBe(true);
      expect(ticks.find(t => t.vMm === 100)?.label).toBe('10');
      // 30mm = 3cm is a minor tick with no label
      const minor = ticks.find(t => t.vMm === 30);
      expect(minor?.isMajor).toBe(false);
      expect(minor?.label).toBeNull();
    });

    it('maps pattern mm to screen px via pan + v*zoom', () => {
      const ticks = generateRulerTicks({ ...base, panPx: 50, zoom2D: 2 });
      const t100 = ticks.find(t => t.vMm === 100);
      expect(t100?.posPx).toBe(50 + 100 * 2);
    });

    it('drops minor ticks when zoomed out (only majors survive)', () => {
      // zoom 0.2 → minor gap 10*0.2 = 2px < 7px threshold → minors suppressed
      const ticks = generateRulerTicks({ ...base, zoom2D: 0.2, lengthPx: 2000 });
      expect(ticks.every(t => t.isMajor)).toBe(true);
      // consecutive ticks are a full major step apart (100mm)
      expect(ticks[1].vMm - ticks[0].vMm).toBe(100);
    });

    it('keeps minor ticks when zoomed in enough', () => {
      const ticks = generateRulerTicks({ ...base, zoom2D: 1 });
      expect(ticks.some(t => !t.isMajor)).toBe(true);
    });
  });
});
