import { describe, it, expect } from 'vitest';
import { contourToPathCommands, ContourToPathOptions } from '../contourToPath';

describe('contourToPathCommands', () => {
  const defaultOptions: ContourToPathOptions = {
    pixelsPerMm: 10,
    imagePosition: { x: 0, y: 0 },
    imageScale: 1,
  };

  it('returns empty array for empty points', () => {
    expect(contourToPathCommands([], defaultOptions)).toEqual([]);
  });

  it('converts pixel coords to mm with calibration (pixelsPerMm=10, so 100px = 10mm)', () => {
    const points = [
      { x: 100, y: 200 },
      { x: 300, y: 400 },
    ];
    const result = contourToPathCommands(points, defaultOptions);
    // 100px / 10 px/mm * 1 scale + 0 offset = 10mm
    // 200px / 10 px/mm * 1 scale + 0 offset = 20mm
    expect(result[0]).toEqual({ type: 'M', values: [10, 20] });
    expect(result[1]).toEqual({ type: 'L', values: [30, 40] });
  });

  it('applies image position offset', () => {
    const points = [{ x: 100, y: 200 }];
    const options: ContourToPathOptions = {
      pixelsPerMm: 10,
      imagePosition: { x: 5, y: 15 },
      imageScale: 1,
    };
    const result = contourToPathCommands(points, options);
    // 100/10 * 1 + 5 = 15
    // 200/10 * 1 + 15 = 35
    expect(result[0]).toEqual({ type: 'M', values: [15, 35] });
  });

  it('applies image scale', () => {
    const points = [{ x: 100, y: 200 }];
    const options: ContourToPathOptions = {
      pixelsPerMm: 10,
      imagePosition: { x: 0, y: 0 },
      imageScale: 2,
    };
    const result = contourToPathCommands(points, options);
    // 100/10 * 2 + 0 = 20
    // 200/10 * 2 + 0 = 40
    expect(result[0]).toEqual({ type: 'M', values: [20, 40] });
  });

  it('defaults to 1 when pixelsPerMm is null', () => {
    const points = [{ x: 100, y: 200 }];
    const options: ContourToPathOptions = {
      pixelsPerMm: null,
      imagePosition: { x: 0, y: 0 },
      imageScale: 1,
    };
    const result = contourToPathCommands(points, options);
    // 100/1 * 1 + 0 = 100
    // 200/1 * 1 + 0 = 200
    expect(result[0]).toEqual({ type: 'M', values: [100, 200] });
  });

  it('produces M, L..., Z sequence', () => {
    const points = [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 10, y: 10 },
      { x: 0, y: 10 },
    ];
    const result = contourToPathCommands(points, defaultOptions);
    expect(result).toHaveLength(5); // M + 3L + Z
    expect(result[0].type).toBe('M');
    expect(result[1].type).toBe('L');
    expect(result[2].type).toBe('L');
    expect(result[3].type).toBe('L');
    expect(result[4]).toEqual({ type: 'Z', values: [] });
  });

  it('single point produces M + Z', () => {
    const points = [{ x: 50, y: 50 }];
    const result = contourToPathCommands(points, defaultOptions);
    expect(result).toHaveLength(2);
    expect(result[0]).toEqual({ type: 'M', values: [5, 5] });
    expect(result[1]).toEqual({ type: 'Z', values: [] });
  });
});
