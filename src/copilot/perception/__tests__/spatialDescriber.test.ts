import { describe, it, expect } from 'vitest';
import { distance3D, computeBoundingBox3D, boundingBoxesOverlap, findMinimumDistance, extractPieceInfo, analyzePieceRelationship, describeSpatialRelationships, type PieceSpatialInfo, type SpatialDescriptionInput } from '../spatialDescriber';

describe('Spatial Describer - Distance Functions', () => {
  it('should calculate 3D distance between two points', () => {
    const p1 = { x: 0, y: 0, z: 0 };
    const p2 = { x: 3, y: 4, z: 0 };
    expect(distance3D(p1, p2)).toBeCloseTo(5);
  });

  it('should calculate 3D distance with z component', () => {
    const p1 = { x: 0, y: 0, z: 0 };
    const p2 = { x: 1, y: 2, z: 2 };
    expect(distance3D(p1, p2)).toBeCloseTo(3);
  });

  it('should compute bounding box from vertices', () => {
    const vertices = new Float32Array([
      0, 0, 0,
      100, 0, 0,
      100, 50, 0,
      0, 50, 0,
    ]);
    const bbox = computeBoundingBox3D(vertices);
    expect(bbox.minX).toBe(0);
    expect(bbox.maxX).toBe(100);
    expect(bbox.minY).toBe(0);
    expect(bbox.maxY).toBe(50);
    expect(bbox.minZ).toBe(0);
    expect(bbox.maxZ).toBe(0);
  });

  it('should detect overlapping bounding boxes', () => {
    const box1 = { minX: 0, maxX: 10, minY: 0, maxY: 10, minZ: 0, maxZ: 10 };
    const box2 = { minX: 5, maxX: 15, minY: 5, maxY: 15, minZ: 5, maxZ: 15 };
    expect(boundingBoxesOverlap(box1, box2)).toBe(true);
  });

  it('should detect non-overlapping bounding boxes', () => {
    const box1 = { minX: 0, maxX: 10, minY: 0, maxY: 10, minZ: 0, maxZ: 10 };
    const box2 = { minX: 20, maxX: 30, minY: 20, maxY: 30, minZ: 20, maxZ: 30 };
    expect(boundingBoxesOverlap(box1, box2)).toBe(false);
  });
});

describe('Spatial Describer - Vertex Distance', () => {
  it('should find minimum distance between two vertex sets', () => {
    const verticesA = new Float32Array([0, 0, 0, 10, 0, 0, 10, 10, 0, 0, 10, 0]);
    const verticesB = new Float32Array([20, 0, 0, 30, 0, 0, 30, 10, 0, 20, 10, 0]);

    const result = findMinimumDistance(verticesA, verticesB);
    expect(result.distance).toBeCloseTo(10);
    expect(result.indexA).toBeDefined();
    expect(result.indexB).toBeDefined();
  });

  it('should detect overlapping vertices (distance ~0)', () => {
    const verticesA = new Float32Array([0, 0, 0, 5, 5, 0]);
    const verticesB = new Float32Array([5, 5, 0, 10, 10, 0]);

    const result = findMinimumDistance(verticesA, verticesB);
    expect(result.distance).toBeCloseTo(0);
  });

  it('should handle empty vertex arrays', () => {
    const empty = new Float32Array([]);
    const vertices = new Float32Array([0, 0, 0]);

    const result = findMinimumDistance(empty, vertices);
    expect(result.distance).toBe(Infinity);
  });
});

describe('Spatial Describer - Piece Info', () => {
  it('should extract spatial info from piece data', () => {
    const pieceId = 'piece-1';
    const vertices = new Float32Array([0, 0, 0, 100, 0, 0, 100, 50, 10, 0, 50, 10]);
    const position: [number, number, number] = [10, 20, 30];

    const info = extractPieceInfo(pieceId, vertices, position);

    expect(info.pieceId).toBe('piece-1');
    expect(info.position).toEqual([10, 20, 30]);
    expect(info.worldBounds.minX).toBe(10);
    expect(info.worldBounds.maxX).toBe(110);
    expect(info.worldBounds.minY).toBe(20);
    expect(info.worldBounds.maxY).toBe(70);
    expect(info.worldBounds.minZ).toBe(30);
    expect(info.worldBounds.maxZ).toBe(40);
  });

  it('should store world-space vertices', () => {
    const vertices = new Float32Array([0, 0, 0, 10, 10, 10]);
    const position: [number, number, number] = [5, 5, 5];

    const info = extractPieceInfo('p1', vertices, position);

    expect(info.worldVertices[0]).toBe(5);
    expect(info.worldVertices[1]).toBe(5);
    expect(info.worldVertices[2]).toBe(5);
    expect(info.worldVertices[3]).toBe(15);
    expect(info.worldVertices[4]).toBe(15);
    expect(info.worldVertices[5]).toBe(15);
  });
});

describe('Spatial Describer - Relationship Analysis', () => {
  it('should classify adjacent pieces', () => {
    const infoA: PieceSpatialInfo = {
      pieceId: 'piece-a',
      position: [0, 0, 0],
      worldBounds: { minX: 0, maxX: 10, minY: 0, maxY: 10, minZ: 0, maxZ: 0 },
      worldVertices: new Float32Array([0, 0, 0, 10, 0, 0, 10, 10, 0, 0, 10, 0]),
    };
    const infoB: PieceSpatialInfo = {
      pieceId: 'piece-b',
      position: [12, 0, 0],
      worldBounds: { minX: 12, maxX: 22, minY: 0, maxY: 10, minZ: 0, maxZ: 0 },
      worldVertices: new Float32Array([12, 0, 0, 22, 0, 0, 22, 10, 0, 12, 10, 0]),
    };

    const relationship = analyzePieceRelationship(infoA, infoB, false);

    expect(relationship.type).toBe('adjacent');
    expect(relationship.distance3D).toBeCloseTo(2);
    expect(relationship.hasSewingConnection).toBe(false);
  });

  it('should classify overlapping pieces', () => {
    const infoA: PieceSpatialInfo = {
      pieceId: 'piece-a',
      position: [0, 0, 0],
      worldBounds: { minX: 0, maxX: 10, minY: 0, maxY: 10, minZ: 0, maxZ: 0 },
      worldVertices: new Float32Array([5, 5, 0]),
    };
    const infoB: PieceSpatialInfo = {
      pieceId: 'piece-b',
      position: [0, 0, 0],
      worldBounds: { minX: 0, maxX: 10, minY: 0, maxY: 10, minZ: 0, maxZ: 0 },
      worldVertices: new Float32Array([5, 5, 0]),
    };

    const relationship = analyzePieceRelationship(infoA, infoB, false);

    expect(relationship.type).toBe('overlapping');
    expect(relationship.distance3D).toBeCloseTo(0);
  });

  it('should classify distant pieces', () => {
    const infoA: PieceSpatialInfo = {
      pieceId: 'piece-a',
      position: [0, 0, 0],
      worldBounds: { minX: 0, maxX: 10, minY: 0, maxY: 10, minZ: 0, maxZ: 0 },
      worldVertices: new Float32Array([0, 0, 0]),
    };
    const infoB: PieceSpatialInfo = {
      pieceId: 'piece-b',
      position: [100, 0, 0],
      worldBounds: { minX: 100, maxX: 110, minY: 0, maxY: 10, minZ: 0, maxZ: 0 },
      worldVertices: new Float32Array([100, 0, 0]),
    };

    const relationship = analyzePieceRelationship(infoA, infoB, false);

    expect(relationship.type).toBe('distant');
    expect(relationship.distance3D).toBeCloseTo(100);
  });

  it('should classify sewn pieces', () => {
    const infoA: PieceSpatialInfo = {
      pieceId: 'piece-a',
      position: [0, 0, 0],
      worldBounds: { minX: 0, maxX: 10, minY: 0, maxY: 10, minZ: 0, maxZ: 0 },
      worldVertices: new Float32Array([0, 0, 0]),
    };
    const infoB: PieceSpatialInfo = {
      pieceId: 'piece-b',
      position: [0, 0, 0],
      worldBounds: { minX: 0, maxX: 10, minY: 0, maxY: 10, minZ: 0, maxZ: 0 },
      worldVertices: new Float32Array([0, 0, 0]),
    };

    const relationship = analyzePieceRelationship(infoA, infoB, true);

    expect(relationship.type).toBe('sewn');
    expect(relationship.hasSewingConnection).toBe(true);
  });
});

describe('Spatial Describer - Main Function', () => {
  it('should describe relationships between multiple pieces', () => {
    const input: SpatialDescriptionInput = {
      pieces: [
        { id: 'front', vertices: new Float32Array([0, 0, 0, 10, 0, 0, 10, 10, 0, 0, 10, 0]) },
        { id: 'back', vertices: new Float32Array([0, 0, 0, 10, 0, 0, 10, 10, 0, 0, 10, 0]) },
      ],
      positions: {
        'front': [0, 0, 0],
        'back': [0, 0, 5],
      },
      seams: [],
    };

    const result = describeSpatialRelationships(input);

    expect(result.relationships).toHaveLength(1);
    expect(result.relationships[0].pieceAId).toBe('front');
    expect(result.relationships[0].pieceBId).toBe('back');
    expect(result.relationships[0].distance3D).toBeCloseTo(5);
    expect(result.relationships[0].type).toBe('adjacent');
  });

  it('should detect collision conflicts', () => {
    const input: SpatialDescriptionInput = {
      pieces: [
        { id: 'piece-a', vertices: new Float32Array([5, 5, 0]) },
        { id: 'piece-b', vertices: new Float32Array([5, 5, 0]) },
      ],
      positions: {
        'piece-a': [0, 0, 0],
        'piece-b': [0, 0, 0],
      },
      seams: [],
    };

    const result = describeSpatialRelationships(input);

    expect(result.conflicts).toHaveLength(1);
    expect(result.conflicts[0].type).toBe('collision');
    expect(result.conflicts[0].severity).toBe('high');
    expect(result.conflicts[0].affectedPieceIds).toContain('piece-a');
    expect(result.conflicts[0].affectedPieceIds).toContain('piece-b');
  });

  it('should respect sewing connections from seams', () => {
    const input: SpatialDescriptionInput = {
      pieces: [
        { id: 'front', vertices: new Float32Array([0, 0, 0]) },
        { id: 'back', vertices: new Float32Array([0, 0, 0]) },
      ],
      positions: {
        'front': [0, 0, 0],
        'back': [0, 0, 0],
      },
      seams: [
        { pieceAId: 'front', pieceBId: 'back' },
      ],
    };

    const result = describeSpatialRelationships(input);

    expect(result.relationships[0].type).toBe('sewn');
    expect(result.relationships[0].hasSewingConnection).toBe(true);
    expect(result.conflicts).toHaveLength(0);
  });
});
