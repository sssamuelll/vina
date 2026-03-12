import { describe, it, expect, vi } from 'vitest';

// three/webgpu and three/tsl resolve to the same bundle; mock both.
vi.mock('three/webgpu', () => ({
  StorageBufferAttribute: class MockSBA {
    array: Float32Array | Uint32Array | Int32Array;
    count: number;
    itemSize: number;
    constructor(array: Float32Array | Uint32Array | Int32Array, itemSize: number) {
      this.array = array;
      this.count = array.length / itemSize;
      this.itemSize = itemSize;
    }
  },
}));

vi.mock('three/tsl', () => ({
  StorageBufferAttribute: class MockSBA {
    array: Float32Array | Uint32Array | Int32Array;
    count: number;
    itemSize: number;
    constructor(array: Float32Array | Uint32Array | Int32Array, itemSize: number) {
      this.array = array;
      this.count = array.length / itemSize;
      this.itemSize = itemSize;
    }
  },
}));

import { createTslBuffers } from '../tslBuffers';
import type { ClothMeshData, StretchConstraints, BendConstraints, SeamConstraintData } from '../gpuBuffers';
import { colorConstraints } from '../gpuBuffers';

function makeTestMesh(): ClothMeshData {
  // 4-vertex square (2 triangles)
  const positions = new Float32Array([
    -0.5, 1.0, 0.0,  // 0: top-left
     0.5, 1.0, 0.0,  // 1: top-right
     0.5, 0.0, 0.0,  // 2: bottom-right
    -0.5, 0.0, 0.0,  // 3: bottom-left
  ]);
  const triangles = new Uint32Array([0, 1, 2, 0, 2, 3]);
  const invMass = new Float32Array([1.0, 1.0, 1.0, 1.0]);
  return { positions, triangles, invMass };
}

function makeTestStretch() {
  const ids = new Uint32Array([0, 1, 1, 2, 2, 3, 3, 0, 0, 2]);
  const restLengths = new Float32Array([1.0, 1.0, 1.0, 1.0, 1.414]);
  const edgeTypes = new Uint8Array([1, 0, 1, 0, 2]);
  return { stretch: { ids, restLengths, edgeTypes } as StretchConstraints, colored: colorConstraints(ids, restLengths, 5) };
}

function makeTestBend(): BendConstraints {
  return { ids: new Uint32Array([0, 2, 1, 3]), restAngles: new Float32Array([Math.PI]), edgeTypes: new Uint8Array([1]) };
}

describe('createTslBuffers', () => {
  it('creates buffer set with correct particle count', () => {
    const mesh = makeTestMesh();
    const { colored } = makeTestStretch();
    const bend = makeTestBend();
    const buffers = createTslBuffers(mesh, colored, bend, null);

    expect(buffers.numParticles).toBe(4);
    expect(buffers.numTriangles).toBe(2);
  });

  it('positions SBA has correct length', () => {
    const mesh = makeTestMesh();
    const { colored } = makeTestStretch();
    const bend = makeTestBend();
    const buffers = createTslBuffers(mesh, colored, bend, null);

    expect(buffers.positionSBA.count).toBe(4);
    expect(buffers.positionSBA.array.length).toBe(12);
  });

  it('copies initial positions into SBA', () => {
    const mesh = makeTestMesh();
    const { colored } = makeTestStretch();
    const bend = makeTestBend();
    const buffers = createTslBuffers(mesh, colored, bend, null);

    expect(buffers.positionSBA.array[0]).toBeCloseTo(-0.5);
    expect(buffers.positionSBA.array[1]).toBeCloseTo(1.0);
    expect(buffers.positionSBA.array[2]).toBeCloseTo(0.0);
  });

  it('creates invMass SBA with correct values', () => {
    const mesh = makeTestMesh();
    const { colored } = makeTestStretch();
    const bend = makeTestBend();
    const buffers = createTslBuffers(mesh, colored, bend, null);

    expect(buffers.invMassSBA.count).toBe(4);
    expect(buffers.invMassSBA.array[0]).toBe(1.0);
  });

  it('creates per-color stretch constraint SBAs', () => {
    const mesh = makeTestMesh();
    const { colored } = makeTestStretch();
    const bend = makeTestBend();
    const buffers = createTslBuffers(mesh, colored, bend, null);

    expect(buffers.stretchColors.length).toBeGreaterThan(0);
    let totalConstraints = 0;
    for (const color of buffers.stretchColors) {
      totalConstraints += color.count;
    }
    expect(totalConstraints).toBe(5);
  });

  it('creates bend constraint SBAs', () => {
    const mesh = makeTestMesh();
    const { colored } = makeTestStretch();
    const bend = makeTestBend();
    const buffers = createTslBuffers(mesh, colored, bend, null);

    expect(buffers.bendIdsSBA).not.toBeNull();
    expect(buffers.numBendConstraints).toBe(1);
  });

  it('creates seam SBAs when seam data provided', () => {
    const mesh = makeTestMesh();
    const { colored } = makeTestStretch();
    const bend = makeTestBend();
    const seam: SeamConstraintData = { ids: new Uint32Array([0, 2]), targetDist: new Float32Array([0]) };
    const buffers = createTslBuffers(mesh, colored, bend, seam);

    expect(buffers.seamIdsSBA).not.toBeNull();
    expect(buffers.numSeamConstraints).toBe(1);
  });

  it('handles null seams', () => {
    const mesh = makeTestMesh();
    const { colored } = makeTestStretch();
    const bend = makeTestBend();
    const buffers = createTslBuffers(mesh, colored, bend, null);

    expect(buffers.seamIdsSBA).toBeNull();
    expect(buffers.numSeamConstraints).toBe(0);
  });
});
