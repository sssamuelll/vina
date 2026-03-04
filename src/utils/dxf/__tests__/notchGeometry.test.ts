import { describe, it, expect } from 'vitest';
import { dxfToPatternPieces } from '../converter';
import type { DXFDocument, DXFEntity } from '../types';

function makeDoc(entities: DXFEntity[]): DXFDocument {
  return {
    header: new Map(),
    layers: [],
    blocks: new Map(),
    entities,
  };
}

describe('Geometric notch detection (layer 4)', () => {
  it('detects a short LINE on layer 4 as a slit notch', () => {
    const entities: DXFEntity[] = [
      { type: 'LWPOLYLINE', layer: '1', data: {
        closed: true,
        vertices: [
          { x: 0, y: 0, bulge: 0 },
          { x: 100, y: 0, bulge: 0 },
          { x: 100, y: 200, bulge: 0 },
          { x: 0, y: 200, bulge: 0 },
        ],
      }},
      { type: 'LINE', layer: '4', data: { x1: 50, y1: 0, x2: 50, y2: 10 } },
    ];
    const pieces = dxfToPatternPieces(makeDoc(entities));
    expect(pieces).toHaveLength(1);
    const notches = pieces[0].internals.filter(i => i.type === 'notch');
    expect(notches.length).toBeGreaterThanOrEqual(1);
  });

  it('ignores a long LINE on layer 4 (> 15mm)', () => {
    const entities: DXFEntity[] = [
      { type: 'LWPOLYLINE', layer: '1', data: {
        closed: true,
        vertices: [
          { x: 0, y: 0, bulge: 0 },
          { x: 100, y: 0, bulge: 0 },
          { x: 100, y: 200, bulge: 0 },
          { x: 0, y: 200, bulge: 0 },
        ],
      }},
      { type: 'LINE', layer: '4', data: { x1: 50, y1: 0, x2: 50, y2: 30 } },
    ];
    const pieces = dxfToPatternPieces(makeDoc(entities));
    const notches = pieces[0].internals.filter(i => i.type === 'notch');
    const slitNotches = notches.filter(n => n.notchOptions?.shape === 'slit');
    expect(slitNotches).toHaveLength(0);
  });

  it('detects a short LWPOLYLINE on layer 4 as a notch', () => {
    const entities: DXFEntity[] = [
      { type: 'LWPOLYLINE', layer: '1', data: {
        closed: true,
        vertices: [
          { x: 0, y: 0, bulge: 0 },
          { x: 100, y: 0, bulge: 0 },
          { x: 100, y: 200, bulge: 0 },
          { x: 0, y: 200, bulge: 0 },
        ],
      }},
      { type: 'LWPOLYLINE', layer: '4', data: {
        closed: false,
        vertices: [
          { x: 50, y: 0, bulge: 0 },
          { x: 50, y: 7, bulge: 0 },
          { x: 57, y: 7, bulge: 0 },
        ],
      }},
    ];
    const pieces = dxfToPatternPieces(makeDoc(entities));
    const notches = pieces[0].internals.filter(i => i.type === 'notch');
    expect(notches.length).toBeGreaterThanOrEqual(1);
    expect(notches.some(n => n.notchOptions?.shape === 'slit')).toBe(true);
  });
});
