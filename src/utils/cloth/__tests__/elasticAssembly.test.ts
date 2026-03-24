import { describe, it, expect } from 'vitest';
import { buildElasticConstraints, ELASTIC_COMPLIANCE } from '../elasticAssembly';
import type { Elastic } from '../../../types/types';
import type { PathCommand } from '../../../types/types';

const squareOutline: PathCommand[] = [
  { type: 'M', values: [0, 0] },
  { type: 'L', values: [100, 0] },
  { type: 'L', values: [100, 100] },
  { type: 'L', values: [0, 100] },
  { type: 'Z', values: [] },
];

const pieceId = 'piece1';

describe('buildElasticConstraints', () => {
  it('returns empty array when no elastics', () => {
    const result = buildElasticConstraints(
      [],
      new Map([[pieceId, squareOutline]]),
      { vertices: new Float32Array(24), indices: new Uint32Array(6), pieceOffsets: new Map([[pieceId, { vertexOffset: 0, indexOffset: 0 }]]) },
      new Map([[pieceId, { edges: [{ name: 'top', segmentRange: [0, 1] as [number, number] }] }]]),
    );
    expect(result.constraints).toEqual([]);
  });

  it('builds constraints with contracted rest lengths', () => {
    const elastic: Elastic = {
      id: 'e1', pieceId, edgeName: 'top', stretchRatio: 0.5,
      width: 12, type: 'band', tStart: 0, tEnd: 1, active: true,
    };
    // Provide non-zero vertex positions matching the square outline corners
    // 4 vertices: (0,0,0), (100,0,0), (100,100,0), (0,100,0) + 4 padding
    const vertices = new Float32Array([
      0, 0, 0,     // v0: top-left (M 0,0)
      100, 0, 0,   // v1: top-right (L 100,0)
      100, 100, 0,  // v2: bottom-right (L 100,100)
      0, 100, 0,    // v3: bottom-left (L 0,100)
      50, 0, 0,     // v4: midpoint of top edge
      50, 50, 0,    // v5
      0, 50, 0,     // v6
      100, 50, 0,   // v7
    ]);
    const result = buildElasticConstraints(
      [elastic],
      new Map([[pieceId, squareOutline]]),
      { vertices, indices: new Uint32Array(6), pieceOffsets: new Map([[pieceId, { vertexOffset: 0, indexOffset: 0 }]]) },
      new Map([[pieceId, { edges: [{ name: 'top', segmentRange: [0, 1] as [number, number] }] }]]),
    );
    expect(result.constraints.length).toBeGreaterThan(0);
    for (const c of result.constraints) {
      expect(c.compliance).toBe(ELASTIC_COMPLIANCE.band);
    }
  });

  it('skips inactive elastics', () => {
    const elastic: Elastic = {
      id: 'e1', pieceId, edgeName: 'top', stretchRatio: 0.5,
      width: 12, type: 'band', tStart: 0, tEnd: 1, active: false,
    };
    const result = buildElasticConstraints(
      [elastic],
      new Map([[pieceId, squareOutline]]),
      { vertices: new Float32Array(24), indices: new Uint32Array(6), pieceOffsets: new Map([[pieceId, { vertexOffset: 0, indexOffset: 0 }]]) },
      new Map([[pieceId, { edges: [{ name: 'top', segmentRange: [0, 1] as [number, number] }] }]]),
    );
    expect(result.constraints).toEqual([]);
  });

  it('uses correct compliance for each elastic type', () => {
    expect(ELASTIC_COMPLIANCE.band).toBeLessThan(ELASTIC_COMPLIANCE.drawstring);
    expect(ELASTIC_COMPLIANCE.drawstring).toBeLessThan(ELASTIC_COMPLIANCE.shirring);
  });

  it('skips elastic with nonexistent edge name', () => {
    const elastic: Elastic = {
      id: 'e1', pieceId, edgeName: 'nonexistent', stretchRatio: 0.5,
      width: 12, type: 'band', tStart: 0, tEnd: 1, active: true,
    };
    const result = buildElasticConstraints(
      [elastic],
      new Map([[pieceId, squareOutline]]),
      { vertices: new Float32Array(24), indices: new Uint32Array(6), pieceOffsets: new Map([[pieceId, { vertexOffset: 0, indexOffset: 0 }]]) },
      new Map([[pieceId, { edges: [{ name: 'top', segmentRange: [0, 1] as [number, number] }] }]]),
    );
    expect(result.constraints).toEqual([]);
  });

  it('skips elastic with reversed tStart/tEnd producing no vertices', () => {
    const elastic: Elastic = {
      id: 'e1', pieceId, edgeName: 'top', stretchRatio: 0.5,
      width: 12, type: 'band', tStart: 0.8, tEnd: 0.2, active: true,
    };
    const result = buildElasticConstraints(
      [elastic],
      new Map([[pieceId, squareOutline]]),
      { vertices: new Float32Array(24), indices: new Uint32Array(6), pieceOffsets: new Map([[pieceId, { vertexOffset: 0, indexOffset: 0 }]]) },
      new Map([[pieceId, { edges: [{ name: 'top', segmentRange: [0, 1] as [number, number] }] }]]),
    );
    expect(result.constraints).toEqual([]);
  });
});
