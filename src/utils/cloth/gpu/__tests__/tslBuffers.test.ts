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
  // Stubs required by atomicStorage.ts's module-load probe (transitively
  // imported via tslSelfCollision / tslWind via tslBuffers). The probe asserts
  // both `storage().setAtomic` and `atomicLoad` are callable.
  storage: () => ({ setAtomic: function () { return this; } }),
  atomicLoad: () => undefined,
}));

import { createTslBuffers, destroyTslBufferSet, disposeStorageBufferAttribute, type TslSeamConstraintData } from '../tslBuffers';
import type { ClothMeshData, StretchConstraints, BendConstraints } from '../gpuBuffers';
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

  it('creates seam color groups when seam data provided', () => {
    const mesh = makeTestMesh();
    const { colored } = makeTestStretch();
    const bend = makeTestBend();
    const seam: TslSeamConstraintData = {
      ids: new Uint32Array([0, 2]),
      targetDist: new Float32Array([0]),
      compliance: new Float32Array([0.0001]),
      colorRanges: [{ offset: 0, count: 1 }],
    };
    const buffers = createTslBuffers(mesh, colored, bend, seam);

    expect(buffers.seamColors).toHaveLength(1);
    expect(buffers.numSeamConstraints).toBe(1);
  });

  it('slices seam constraints into per-color groups (#897 F1.3)', () => {
    const mesh = makeTestMesh();
    const { colored } = makeTestStretch();
    const bend = makeTestBend();
    // 2 constraints already reordered by color (colorConstraints output
    // shape): both touch vertex 2, forcing the 2-color split. Each value
    // must land in its own group's SBA slice.
    const seam: TslSeamConstraintData = {
      ids: new Uint32Array([0, 2, 1, 2]),
      targetDist: new Float32Array([0.15, 0.3]),
      compliance: new Float32Array([0.0001, 0.0002]),
      colorRanges: [{ offset: 0, count: 1 }, { offset: 1, count: 1 }],
    };
    const buffers = createTslBuffers(mesh, colored, bend, seam);

    expect(buffers.numSeamConstraints).toBe(2);
    expect(buffers.seamColors).toHaveLength(2);

    const [g0, g1] = buffers.seamColors;
    expect(Array.from(g0.idsSBA.array)).toEqual([0, 2]);
    expect(g0.idsSBA.itemSize).toBe(2);
    expect(g0.targetDistSBA.array[0]).toBeCloseTo(0.15, 6);
    expect(g0.targetDistSBA.itemSize).toBe(1);
    expect(g0.complianceSBA.array[0]).toBeCloseTo(0.0001, 8);
    expect(g0.complianceSBA.itemSize).toBe(1);
    expect(g0.count).toBe(1);

    expect(Array.from(g1.idsSBA.array)).toEqual([1, 2]);
    expect(g1.targetDistSBA.array[0]).toBeCloseTo(0.3, 6);
    expect(g1.complianceSBA.array[0]).toBeCloseTo(0.0002, 8);
    expect(g1.count).toBe(1);
  });

  it('handles null seams', () => {
    const mesh = makeTestMesh();
    const { colored } = makeTestStretch();
    const bend = makeTestBend();
    const buffers = createTslBuffers(mesh, colored, bend, null);

    expect(buffers.seamColors).toEqual([]);
    expect(buffers.numSeamConstraints).toBe(0);
  });
});

describe('disposeStorageBufferAttribute', () => {
  it('routes the SBA through renderer._attributes.delete', () => {
    const deleteSpy = vi.fn();
    const sba = { __test: true };
    disposeStorageBufferAttribute(
      sba as unknown as import('three/webgpu').StorageBufferAttribute,
      { _attributes: { delete: deleteSpy } },
    );
    expect(deleteSpy).toHaveBeenCalledOnce();
    expect(deleteSpy).toHaveBeenCalledWith(sba);
  });

  it('is a no-op when renderer is null/undefined', () => {
    const sba = {};
    expect(() => disposeStorageBufferAttribute(
      sba as unknown as import('three/webgpu').StorageBufferAttribute,
      null,
    )).not.toThrow();
    expect(() => disposeStorageBufferAttribute(
      sba as unknown as import('three/webgpu').StorageBufferAttribute,
      undefined,
    )).not.toThrow();
  });

  it('is a no-op when sba is null/undefined', () => {
    const deleteSpy = vi.fn();
    disposeStorageBufferAttribute(null, { _attributes: { delete: deleteSpy } });
    disposeStorageBufferAttribute(undefined, { _attributes: { delete: deleteSpy } });
    expect(deleteSpy).not.toHaveBeenCalled();
  });

  it('swallows errors from renderer._attributes.delete', () => {
    const sba = {};
    const renderer = {
      _attributes: { delete: () => { throw new Error('boom'); } },
    };
    expect(() => disposeStorageBufferAttribute(
      sba as unknown as import('three/webgpu').StorageBufferAttribute,
      renderer,
    )).not.toThrow();
  });
});

describe('destroyTslBufferSet', () => {
  it('routes every SBA in the set through renderer._attributes.delete', () => {
    const deleteSpy = vi.fn();
    const renderer = { _attributes: { delete: deleteSpy } };

    const mesh = makeTestMesh();
    const { colored } = makeTestStretch();
    const bend = makeTestBend();
    const seam: TslSeamConstraintData = {
      ids: new Uint32Array([0, 2]),
      targetDist: new Float32Array([0]),
      compliance: new Float32Array([0.0001]),
      colorRanges: [{ offset: 0, count: 1 }],
    };
    const buffers = createTslBuffers(mesh, colored, bend, seam);

    destroyTslBufferSet(buffers, renderer);

    // 12 fixed SBAs (position, prevPos, velocity, invMass, normal, normalAccum,
    // triangleIds, grabMask, grabOffset, bendIds, bendRest, bendCompliance)
    // + 3 SBAs per stretch color group + 3 SBAs per seam color group.
    const expected = 12 + buffers.stretchColors.length * 3 + buffers.seamColors.length * 3;
    expect(deleteSpy).toHaveBeenCalledTimes(expected);

    // Spot-check that core SBAs were each passed.
    expect(deleteSpy).toHaveBeenCalledWith(buffers.positionSBA);
    expect(deleteSpy).toHaveBeenCalledWith(buffers.prevPosSBA);
    expect(deleteSpy).toHaveBeenCalledWith(buffers.velocitySBA);
    expect(deleteSpy).toHaveBeenCalledWith(buffers.invMassSBA);
    expect(deleteSpy).toHaveBeenCalledWith(buffers.normalSBA);
    expect(deleteSpy).toHaveBeenCalledWith(buffers.triangleIdsSBA);
    expect(deleteSpy).toHaveBeenCalledWith(buffers.bendIdsSBA);
    for (const color of buffers.stretchColors) {
      expect(deleteSpy).toHaveBeenCalledWith(color.idsSBA);
      expect(deleteSpy).toHaveBeenCalledWith(color.restLengthsSBA);
      expect(deleteSpy).toHaveBeenCalledWith(color.complianceSBA);
    }
    expect(buffers.seamColors.length).toBeGreaterThan(0);
    for (const color of buffers.seamColors) {
      expect(deleteSpy).toHaveBeenCalledWith(color.idsSBA);
      expect(deleteSpy).toHaveBeenCalledWith(color.targetDistSBA);
      expect(deleteSpy).toHaveBeenCalledWith(color.complianceSBA);
    }
  });

  it('skips null bend/seam SBAs', () => {
    const deleteSpy = vi.fn();
    const renderer = { _attributes: { delete: deleteSpy } };

    const mesh = makeTestMesh();
    const colored = colorConstraints(
      new Uint32Array([0, 1, 1, 2]),
      new Float32Array([1.0, 1.0]),
      2,
    );
    const bend: BendConstraints = {
      ids: new Uint32Array(0),
      restAngles: new Float32Array(0),
      edgeTypes: new Uint8Array(0),
    };
    const buffers = createTslBuffers(mesh, colored, bend, null);

    destroyTslBufferSet(buffers, renderer);

    // 9 fixed non-null SBAs (3 bend are null) + stretch colors * 3;
    // empty seamColors contributes nothing.
    const expected = 9 + buffers.stretchColors.length * 3;
    expect(deleteSpy).toHaveBeenCalledTimes(expected);
  });

  it('is a no-op when renderer is omitted', () => {
    const mesh = makeTestMesh();
    const { colored } = makeTestStretch();
    const bend = makeTestBend();
    const buffers = createTslBuffers(mesh, colored, bend, null);

    expect(() => destroyTslBufferSet(buffers)).not.toThrow();
  });

  it('does not throw when renderer lacks _attributes', () => {
    const mesh = makeTestMesh();
    const { colored } = makeTestStretch();
    const bend = makeTestBend();
    const buffers = createTslBuffers(mesh, colored, bend, null);

    expect(() => destroyTslBufferSet(buffers, {})).not.toThrow();
  });
});
