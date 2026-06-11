/**
 * Elastic Assembly — builds XPBD distance constraints for elastic edges.
 * Reuses parameterizeEdge from seamAssembly to map named edges to mesh vertices.
 * @module elasticAssembly
 */

import type { Elastic, ElasticType, PathCommand, SemanticEdge } from '../../types/types';
import { parameterizeEdge } from './seamAssembly';
import { commandRangeToFlattened } from '../seam/index';

export interface ElasticConstraint {
  vertexA: number;
  vertexB: number;
  restLength: number;
  compliance: number;
}

export interface ElasticConstraintSet {
  constraints: ElasticConstraint[];
}

interface MergedMeshInfo {
  vertices: Float32Array;
  indices: Uint32Array;
  pieceOffsets: Map<string, { vertexOffset: number; indexOffset: number }>;
}

export const ELASTIC_COMPLIANCE: Record<ElasticType, number> = {
  band: 0.00005,
  drawstring: 0.0002,
  shirring: 0.0005,
};

export function buildElasticConstraints(
  elastics: Elastic[],
  outlines: Map<string, PathCommand[]>,
  mergedMesh: MergedMeshInfo,
  pieces?: Map<string, { edges?: Array<Pick<SemanticEdge, 'name' | 'segmentRange'>> }>,
): ElasticConstraintSet {
  const constraints: ElasticConstraint[] = [];

  for (const elastic of elastics) {
    if (!elastic.active) continue;

    const outline = outlines.get(elastic.pieceId);
    const offset = mergedMesh.pieceOffsets.get(elastic.pieceId);
    const pieceData = pieces?.get(elastic.pieceId);
    if (!outline || !offset || !pieceData) continue;

    const edgeDef = pieceData.edges?.find(e => e.name === elastic.edgeName);
    if (!edgeDef) continue;

    // Semantic ranges live in COMMAND space (detectSemanticEdges contract)
    // — convert at this boundary to the flattened-point indices
    // parameterizeEdge consumes (Fase 3 / BP-3). Same default resolution
    // on both sides (CURVE_RESOLUTION = SEAM_CURVE_RESOLUTION = 12).
    const [flatStart, flatEnd] = commandRangeToFlattened(outline, edgeDef.segmentRange);
    let vertices = parameterizeEdge(
      outline,
      flatStart,
      flatEnd,
      offset.vertexOffset,
    );

    vertices = vertices.filter(v => v.t >= elastic.tStart && v.t <= elastic.tEnd);

    if (vertices.length < 2) continue;

    const compliance = ELASTIC_COMPLIANCE[elastic.type];
    const positions = mergedMesh.vertices;

    for (let i = 0; i < vertices.length - 1; i++) {
      const a = vertices[i].index;
      const b = vertices[i + 1].index;

      const ax = positions[a * 3], ay = positions[a * 3 + 1];
      const bx = positions[b * 3], by = positions[b * 3 + 1];
      const dist = Math.sqrt((bx - ax) ** 2 + (by - ay) ** 2);

      if (dist < 1e-6) continue;

      constraints.push({
        vertexA: a,
        vertexB: b,
        restLength: dist * elastic.stretchRatio,
        compliance,
      });
    }
  }

  return { constraints };
}
