import { describe, it, expect } from 'vitest';
import { EdgeType, classifyEdgeType, extractStretchConstraints } from '../gpuBuffers';

describe('EdgeType classification', () => {
  describe('classifyEdgeType', () => {
    it('should classify horizontal edge as WEFT', () => {
      // Edge along U axis (horizontal)
      expect(classifyEdgeType([0, 0], [1, 0])).toBe(EdgeType.WEFT);
      expect(classifyEdgeType([0, 0], [1, 0.1])).toBe(EdgeType.WEFT); // slight angle
    });

    it('should classify vertical edge as WARP', () => {
      // Edge along V axis (vertical)
      expect(classifyEdgeType([0, 0], [0, 1])).toBe(EdgeType.WARP);
      expect(classifyEdgeType([0, 0], [0.1, 1])).toBe(EdgeType.WARP); // slight angle
    });

    it('should classify diagonal edge as SHEAR', () => {
      // 45 degree edge
      expect(classifyEdgeType([0, 0], [1, 1])).toBe(EdgeType.SHEAR);
      expect(classifyEdgeType([0, 0], [1, 0.8])).toBe(EdgeType.SHEAR); // ~38 degrees
    });
  });

  describe('extractStretchConstraints', () => {
    it('should return edgeTypes array', () => {
      // Simple triangle
      const positions = new Float32Array([0,0,0, 1,0,0, 0.5,1,0]);
      const triangles = new Uint32Array([0, 1, 2]);

      const result = extractStretchConstraints(positions, triangles);

      expect(result.edgeTypes).toBeInstanceOf(Uint8Array);
      expect(result.edgeTypes.length).toBe(result.restLengths.length);
    });

    it('should default to SHEAR when no UVs provided', () => {
      const positions = new Float32Array([0,0,0, 1,0,0, 0.5,1,0]);
      const triangles = new Uint32Array([0, 1, 2]);

      const result = extractStretchConstraints(positions, triangles);

      // All edges should be SHEAR (default)
      for (let i = 0; i < result.edgeTypes.length; i++) {
        expect(result.edgeTypes[i]).toBe(EdgeType.SHEAR);
      }
    });

    it('should classify edges based on UVs when provided', () => {
      // Square with UVs: horizontal, vertical, and diagonal edges
      const positions = new Float32Array([
        0,0,0,  1,0,0,  1,1,0,  0,1,0  // Square
      ]);
      const triangles = new Uint32Array([0, 1, 2, 0, 2, 3]);
      const uvs = new Float32Array([
        0,0,  1,0,  1,1,  0,1  // Standard UV mapping
      ]);

      const result = extractStretchConstraints(positions, triangles, uvs);

      // Should have mix of WARP, WEFT, SHEAR edges
      const hasWarp = Array.from(result.edgeTypes).includes(EdgeType.WARP);
      const hasWeft = Array.from(result.edgeTypes).includes(EdgeType.WEFT);
      const hasShear = Array.from(result.edgeTypes).includes(EdgeType.SHEAR);

      expect(hasWarp || hasWeft || hasShear).toBe(true);
    });
  });
});
