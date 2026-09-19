// src/utils/geometry/__tests__/path.test.ts
import { describe, it, expect } from 'vitest';
import { getEdgeEndpoints, getEdgeLength, getEdgeArcLength, getEdgePathD, computeOffsetPath, computeSegmentOffsetPath } from '../path';
import type { PathCommand } from '../../../types/types';

const triangle: PathCommand[] = [
  { type: 'M', values: [0, 0] },
  { type: 'L', values: [10, 0] },
  { type: 'L', values: [5, 10] },
  { type: 'Z', values: [] },
];

describe('getEdgeEndpoints', () => {
  it('returns start/end for first edge', () => {
    const r = getEdgeEndpoints(triangle, 1);
    expect(r).toEqual({ start: { x: 0, y: 0 }, end: { x: 10, y: 0 } });
  });
  it('returns start/end for second edge', () => {
    const r = getEdgeEndpoints(triangle, 2);
    expect(r).toEqual({ start: { x: 10, y: 0 }, end: { x: 5, y: 10 } });
  });
  it('returns null for out-of-range', () => {
    expect(getEdgeEndpoints(triangle, 0)).toBeNull();
    expect(getEdgeEndpoints(triangle, 10)).toBeNull();
  });
});

describe('getEdgeLength', () => {
  it('computes length of horizontal edge', () => {
    expect(getEdgeLength(triangle, 1)).toBe(10);
  });
  it('returns 0 for invalid index', () => {
    expect(getEdgeLength(triangle, 0)).toBe(0);
  });
});

describe('getEdgeArcLength', () => {
  it('equals the chord for straight edges', () => {
    // Horizontal L edge: arc length == straight length.
    expect(getEdgeArcLength(triangle, 1)).toBeCloseTo(10, 5);
  });

  it('returns 0 for invalid index', () => {
    expect(getEdgeArcLength(triangle, 0)).toBe(0);
  });

  it('measures a curved (C) edge by arc length, not the chord — the seam-mismatch fix', () => {
    // A cubic that bulges far above the straight chord from (0,0) to (100,0).
    const curved: PathCommand[] = [
      { type: 'M', values: [0, 0] },
      { type: 'C', values: [0, 80, 100, 80, 100, 0] },
    ];
    const chord = getEdgeLength(curved, 1); // straight endpoint distance = 100
    const arc = getEdgeArcLength(curved, 1); // sampled curve length > chord
    expect(chord).toBeCloseTo(100, 5);
    expect(arc).toBeGreaterThan(chord);
    // The bulge makes the arc materially longer — this gap is exactly what a
    // chord-based mismatch was over-reporting on curved seams.
    expect(arc).toBeGreaterThan(140);
  });
});

describe('computeOffsetPath', () => {
  it('offsets a horizontal segment', () => {
    const r = computeOffsetPath({ x: 0, y: 0 }, { x: 10, y: 0 }, 5);
    expect(r).toHaveLength(2);
    // For horizontal line (dx=10, dy=0): nx = -0/10 = 0, ny = 10/10 = 1
    // So offset is in +y direction
    expect(r[0]).toEqual({ type: 'M', values: [0, 5] });
    expect(r[1]).toEqual({ type: 'L', values: [10, 5] });
  });
  it('returns empty for zero-length segment', () => {
    expect(computeOffsetPath({ x: 5, y: 5 }, { x: 5, y: 5 }, 3)).toEqual([]);
  });
});

describe('computeSegmentOffsetPath', () => {
  it('offsets a partial segment', () => {
    const r = computeSegmentOffsetPath({ x: 0, y: 0 }, { x: 10, y: 0 }, 0, 0.5, 5);
    expect(r).toHaveLength(2);
    // Sub-segment is (0,0)-(5,0), offset by 5 in +y
    expect(r[0]).toEqual({ type: 'M', values: [0, 5] });
    expect(r[1]).toEqual({ type: 'L', values: [5, 5] });
  });
});

/**
 * #1205 — con dos subcaminos, la `Z` no vuelve a `commands[0]`.
 *
 * Una `Z` cierra contra la `M` que abre SU subcamino. Resolverla siempre
 * contra la primera `M` del contorno acierta por casualidad mientras hay un
 * solo anillo; con una pieza con agujero promete un lado que cruza la tela.
 *
 * Quien lo enseña: `usePointTool` pone `sideEnds` desde aquí y `ToolOverlay`
 * pinta esa guía al pasar el ratón. La usuaria veía «este es el lado» sobre
 * una recta que no existe, justo antes de clicar.
 */
describe('#1205 — el cierre de un subcamino se resuelve contra SU M', () => {
  const conAgujero: PathCommand[] = [
    { type: 'M', values: [0, 0] },
    { type: 'L', values: [200, 0] },
    { type: 'L', values: [200, 100] },
    { type: 'L', values: [0, 100] },
    { type: 'Z', values: [] },
    { type: 'M', values: [50, 30] },
    { type: 'L', values: [150, 30] },
    { type: 'L', values: [150, 70] },
    { type: 'L', values: [50, 70] },
    { type: 'Z', values: [] },
  ];

  it('los extremos del cierre del agujero son los suyos', () => {
    expect(getEdgeEndpoints(conAgujero, 9)).toEqual({
      start: { x: 50, y: 70 },
      end: { x: 50, y: 30 },
    });
  });

  it('el cierre del anillo exterior no cambia', () => {
    expect(getEdgeEndpoints(conAgujero, 4)).toEqual({
      start: { x: 0, y: 100 },
      end: { x: 0, y: 0 },
    });
  });

  it('el largo del cierre del agujero es el suyo, no la diagonal a la esquina', () => {
    // El lado izquierdo del agujero mide 40. La cuerda hasta (0,0) mide 86,02.
    expect(getEdgeLength(conAgujero, 9)).toBeCloseTo(40, 6);
  });

  it('el trazo del cierre del agujero se dibuja sobre el agujero', () => {
    expect(getEdgePathD(conAgujero, 9)).toBe('M50,70 L50,30');
  });

  it('el lado que sigue a una Z arranca donde su propio subcamino, no en commands[0]', () => {
    // El comando 6 es el primer lado del agujero: va de (50,30) a (150,30).
    // Si la `Z` del anillo anterior devolviera el cursor a (0,0), el arranque
    // saldría mal en cuanto faltara la `M` de en medio.
    expect(getEdgeEndpoints(conAgujero, 6)).toEqual({
      start: { x: 50, y: 30 },
      end: { x: 150, y: 30 },
    });
  });
});
