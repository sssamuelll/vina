import { describe, expect, it } from 'vitest';
import { entityToPath } from '../converter';
import type { DXFEntity } from '../types';

const closedSpline: DXFEntity = {
  type: 'SPLINE',
  layer: '1',
  data: {
    degree: 1,
    closed: true,
    knots: [],
    controlPoints: [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 10, y: 10 },
    ],
    fitPoints: [],
  },
};

describe('entityToPath closed SPLINE conversion', () => {
  it('ends a closed spline path with Z', () => {
    const path = entityToPath(closedSpline);

    expect(path[path.length - 1]).toEqual({ type: 'Z', values: [] });
  });

  it('leaves an open spline path unclosed', () => {
    const path = entityToPath({
      ...closedSpline,
      data: { ...closedSpline.data, closed: false },
    });

    expect(path[path.length - 1]).toEqual({ type: 'L', values: [10, 10] });
  });
});
