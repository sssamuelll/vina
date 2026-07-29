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

const closedCubicSpline: DXFEntity = {
  ...closedSpline,
  data: {
    degree: 3,
    closed: true,
    knots: [],
    controlPoints: [
      { x: 0, y: 0 },
      { x: 5, y: 0 },
      { x: 10, y: 5 },
      { x: 10, y: 10 },
    ],
    fitPoints: [],
  },
};

function expectExactlyOneTerminalClose(path: ReturnType<typeof entityToPath>) {
  const closes = path.filter(command => command.type === 'Z');
  expect(closes).toEqual([{ type: 'Z', values: [] }]);
  expect(path[path.length - 1]).toEqual(closes[0]);
}

describe('entityToPath closed SPLINE conversion', () => {
  it('closes a linear spline exactly once at the terminal command', () => {
    const path = entityToPath(closedSpline);

    expect(path.map(command => command.type)).toEqual(['M', 'L', 'L', 'Z']);
    expectExactlyOneTerminalClose(path);
  });

  it('closes a cubic spline exactly once at the terminal command', () => {
    const path = entityToPath(closedCubicSpline);

    expect(path.map(command => command.type)).toEqual(['M', 'C', 'Z']);
    expectExactlyOneTerminalClose(path);
  });

  it('leaves an open spline path unclosed', () => {
    const path = entityToPath({
      ...closedSpline,
      data: { ...closedSpline.data, closed: false },
    });

    expect(path.map(command => command.type)).toEqual(['M', 'L', 'L']);
    expect(path.filter(command => command.type === 'Z')).toHaveLength(0);
  });
});
