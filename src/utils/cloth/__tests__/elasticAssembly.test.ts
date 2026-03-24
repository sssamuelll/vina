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
    const result = buildElasticConstraints(
      [elastic],
      new Map([[pieceId, squareOutline]]),
      { vertices: new Float32Array(24), indices: new Uint32Array(6), pieceOffsets: new Map([[pieceId, { vertexOffset: 0, indexOffset: 0 }]]) },
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
});
