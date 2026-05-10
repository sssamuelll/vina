import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

import { FakeGPUDevice, FakeRenderer } from './fakeDevice';

// vi.hoisted runs before vi.mock hoisting, so the shared MockSBA + setAtomicCalls
// are visible to both `three/webgpu` and `three/tsl` mock factories. Pattern
// mirrored from tslSolver.test.ts and tslCollision.test.ts post-#771/#772.
//
// • `sharedMock` — the factory body for both `three/webgpu` and `three/tsl`.
//   The mock `StorageBufferAttribute` exposes `array`, `count`, `itemSize`,
//   `version` so freezePieces can mutate `array` and bump `version`
//   (behavior #5).
// • `setAtomicCalls` — captures every `storage(sba, …).setAtomic(value)` call so
//   the per-body atomic scratch SBAs from `createTslCollisionBody` can be
//   identified by their fill values (behavior #8).
const { sharedMock, setAtomicCalls } = vi.hoisted(() => {
  const setAtomicCalls: Array<{ sba: unknown; value: unknown }> = [];

  class MockSBA {
    array: Float32Array | Uint32Array | Int32Array;
    count: number;
    itemSize: number;
    version = 0;
    constructor(array: Float32Array | Uint32Array | Int32Array, itemSize: number) {
      this.array = array;
      this.count = array.length / itemSize;
      this.itemSize = itemSize;
    }
  }

  // Chain-proxy: any property access or call returns another proxy. Used for
  // arbitrary TSL graph operations (mul/sub/dot/element/x/y/z/...) that we
  // never inspect — only construct.
  /* eslint-disable @typescript-eslint/no-explicit-any */
  const createChainProxy = (): any => {
    const handler: ProxyHandler<(...args: unknown[]) => unknown> = {
      get() { return createChainProxy(); },
      apply() { return createChainProxy(); },
    };
    return new Proxy(function () {}, handler);
  };

  // uniform()/float()/int()/uint() must each return their own object with a
  // mutable `.value` so brushNodes/grabNodes uniforms can be set + read.
  // For chain ops (mul/sub/...) and component access (x/y/z), we fall back
  // to the chain proxy.
  const makeUniform = (val: unknown): any => {
    const target = { value: val };
    return new Proxy(target, {
      get(t, prop) {
        if (prop === 'value') return t.value;
        return createChainProxy();
      },
      set(t, prop, v) {
        if (prop === 'value') {
          t.value = v;
          return true;
        }
        // Other writes are accepted but ignored (TSL kernels build, never assign).
        return true;
      },
    });
  };

  const sharedMock = () => ({
    StorageBufferAttribute: MockSBA,
    storage: (...args: unknown[]) => {
      const node: any = new Proxy(function () {}, {
        get(_t, prop) {
          if (prop === 'setAtomic') {
            return function (value: boolean) {
              setAtomicCalls.push({ sba: args[0], value });
              return node;
            };
          }
          return createChainProxy();
        },
        apply() { return createChainProxy(); },
      });
      return node;
    },
    Fn: () => () => createChainProxy(),
    compute: (_fn: unknown, count: number) => ({
      __tslCompute: true,
      dispatchCount: count,
    }),
    uniform: (val: unknown) => makeUniform(val),
    float: (val: unknown) => makeUniform(val),
    int: (val: unknown) => makeUniform(val),
    uint: (val: unknown) => makeUniform(val),
    vec3: () => createChainProxy(),
    instanceIndex: createChainProxy(),
    Loop: () => createChainProxy(),
    If: () => createChainProxy(),
    atomicStore: () => createChainProxy(),
    atomicAdd: () => createChainProxy(),
    atomicLoad: () => createChainProxy(),
    atomicMin: () => createChainProxy(),
  });
  /* eslint-enable @typescript-eslint/no-explicit-any */

  return { sharedMock, setAtomicCalls };
});

// Shape of the mock StorageBufferAttribute (kept here as a plain type so the
// hoisted MockSBA constructor doesn't need to be re-exported).
type TestSBA = {
  array: Float32Array | Uint32Array | Int32Array;
  count: number;
  itemSize: number;
  version: number;
};

vi.mock('three/webgpu', () => sharedMock());
vi.mock('three/tsl', () => sharedMock());

import { GpuSolverClient, type PieceMeshData } from '../gpuSolverClient';

// ─── Fixtures ────────────────────────────────────────────────────────────────

/** 4-vertex quad (2 triangles), uvs included so edge classification works. */
function makeQuadPiece(id: string = 'piece-0'): PieceMeshData {
  return {
    pieceId: id,
    vertices: new Float32Array([
      -0.5, 1.0, 0.0,
       0.5, 1.0, 0.0,
       0.5, 0.0, 0.0,
      -0.5, 0.0, 0.0,
    ]),
    triIds: new Int32Array([0, 1, 2, 0, 2, 3]),
    uvs: new Float32Array([0, 1,  1, 1,  1, 0,  0, 0]),
  };
}

/** Single-triangle collision mesh — 9 floats for verts + 3 floats for normal. */
function makeTriCollisionMesh() {
  return {
    vertices: new Float32Array([
       0.0, 0.0, 0.0,
       1.0, 0.0, 0.0,
       0.0, 1.0, 0.0,
    ]),
    normals: new Float32Array([0, 0, 1]),
    triCount: 1,
  };
}

/** Geometry stub used to drive `readbackPositionsToGeometry` for renderer capture. */
function makeMockGeometry() {
  return {
    getAttribute: vi.fn().mockReturnValue(null),
    computeBoundingSphere: vi.fn(),
  } as unknown as import('three').BufferGeometry;
}

// ─── Existing shape tests (preserved) ────────────────────────────────────────

describe('GpuSolverClient', () => {
  it('exports GpuSolverClient class', () => {
    expect(GpuSolverClient).toBeDefined();
    expect(typeof GpuSolverClient).toBe('function');
  });

  it('has initMultiPieceTsl method', () => {
    expect(typeof GpuSolverClient.prototype.initMultiPieceTsl).toBe('function');
  });

  it('has getTslSolver accessor', () => {
    expect(typeof GpuSolverClient.prototype.getTslSolver).toBe('function');
  });

  it('has setTslCollisionBody method', () => {
    expect(typeof GpuSolverClient.prototype.setTslCollisionBody).toBe('function');
  });

  it('has removeTslCollisionBody method', () => {
    expect(typeof GpuSolverClient.prototype.removeTslCollisionBody).toBe('function');
  });

  it('has updateCollisionBody method', () => {
    expect(typeof GpuSolverClient.prototype.updateCollisionBody).toBe('function');
  });

  describe('getPieceVertexRanges', () => {
    it('is a method on GpuSolverClient', () => {
      expect(typeof GpuSolverClient.prototype.getPieceVertexRanges).toBe('function');
    });
  });

  describe('freezePieces', () => {
    it('is a method on GpuSolverClient', () => {
      expect(typeof GpuSolverClient.prototype.freezePieces).toBe('function');
    });
  });

  describe('setBrushParams', () => {
    it('is a method on GpuSolverClient', () => {
      expect(typeof GpuSolverClient.prototype.setBrushParams).toBe('function');
    });
  });
});

// ─── Behavior #1 + #2 — initMultiPieceTsl lifecycle ──────────────────────────

describe('initMultiPieceTsl', () => {
  it('populates tslBuffers and computes numParticles correctly (behavior #1)', async () => {
    const device = new FakeGPUDevice();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const client = new GpuSolverClient(device as any);

    const piece = makeQuadPiece();
    await client.initMultiPieceTsl([piece]);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const buffers = (client as any).tslBuffers;
    expect(buffers).not.toBeNull();
    expect(buffers.numParticles).toBe(4);
    expect(buffers.numTriangles).toBe(2);
    expect(buffers.positionSBA).toBeDefined();
    expect(buffers.invMassSBA).toBeDefined();

    // tslSolver should be wired up and accessible via the public accessor.
    expect(client.getTslSolver()).not.toBeNull();
  });

  it('aggregates particle counts across multiple pieces', async () => {
    const device = new FakeGPUDevice();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const client = new GpuSolverClient(device as any);

    await client.initMultiPieceTsl([makeQuadPiece('a'), makeQuadPiece('b')]);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const buffers = (client as any).tslBuffers;
    expect(buffers.numParticles).toBe(8);

    const ranges = client.getPieceVertexRanges();
    expect(ranges?.get('a')).toEqual({ start: 0, count: 4 });
    expect(ranges?.get('b')).toEqual({ start: 4, count: 4 });
  });

  it('rejects when device throws during init (behavior #2)', async () => {
    const device = new FakeGPUDevice();
    // pushErrorScope is the first device call inside withErrorScope (DEV-gated).
    // Throwing here simulates a device validation failure surfacing through
    // the init path — the resulting promise must reject so callers can route
    // the error to their own onError surface (see GpuSolverClientCallbacks).
    device.pushErrorScope = vi.fn(() => {
      throw new Error('GPU device error: createBuffer failed');
    });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const client = new GpuSolverClient(device as any);

    await expect(client.initMultiPieceTsl([makeQuadPiece()])).rejects.toThrow(
      /createBuffer failed/,
    );
  });
});

// ─── Behavior #4 — re-init disposes previous TSL resources (#771 regression) ─

describe('initMultiPieceTsl re-init disposal (behavior #4 — #771 regression)', () => {
  it('releases the prior TslBufferSet via renderer._attributes.delete on re-init', async () => {
    const device = new FakeGPUDevice();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const client = new GpuSolverClient(device as any);

    // First init.
    await client.initMultiPieceTsl([makeQuadPiece()]);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const firstSet = (client as any).tslBuffers;

    // Capture renderer ref via readbackPositionsToGeometry — without this,
    // disposeTslResources degrades to a ref-drop and _attributes.delete is
    // never called (intended behavior per `disposeStorageBufferAttribute`).
    const renderer = new FakeRenderer();
    await client.readbackPositionsToGeometry(
      renderer as unknown as Parameters<typeof client.readbackPositionsToGeometry>[0],
      makeMockGeometry(),
    );
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect((client as any).rendererRef).toBe(renderer);

    // Re-init — should dispose the first set.
    await client.initMultiPieceTsl([makeQuadPiece(), makeQuadPiece('b')]);

    // Each fixed SBA from the first set should have been routed through delete.
    expect(renderer._attributes.delete).toHaveBeenCalledWith(firstSet.positionSBA);
    expect(renderer._attributes.delete).toHaveBeenCalledWith(firstSet.prevPosSBA);
    expect(renderer._attributes.delete).toHaveBeenCalledWith(firstSet.velocitySBA);
    expect(renderer._attributes.delete).toHaveBeenCalledWith(firstSet.invMassSBA);
    expect(renderer._attributes.delete).toHaveBeenCalledWith(firstSet.normalSBA);
    expect(renderer._attributes.delete).toHaveBeenCalledWith(firstSet.triangleIdsSBA);

    // Sanity: the new set is in place and distinct from the disposed set.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const secondSet = (client as any).tslBuffers;
    expect(secondSet).not.toBe(firstSet);
    expect(secondSet.numParticles).toBe(8);
  });
});

// ─── Behavior #5 — freezePieces invMass mutation ─────────────────────────────

describe('freezePieces (behavior #5)', () => {
  it('zeros invMass entries for frozen pieces and bumps SBA version', async () => {
    const device = new FakeGPUDevice();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const client = new GpuSolverClient(device as any);

    await client.initMultiPieceTsl([makeQuadPiece('a'), makeQuadPiece('b')]);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const buffers = (client as any).tslBuffers;
    const initialVersion = buffers.invMassSBA.version;
    const arr = buffers.invMassSBA.array as Float32Array;

    // Pre-condition: all particles have invMass=1.
    expect(Array.from(arr)).toEqual([1, 1, 1, 1, 1, 1, 1, 1]);

    client.freezePieces(['a']);

    // Piece 'a' (verts 0-3) should be frozen; 'b' (verts 4-7) should remain.
    expect(Array.from(arr.subarray(0, 4))).toEqual([0, 0, 0, 0]);
    expect(Array.from(arr.subarray(4, 8))).toEqual([1, 1, 1, 1]);
    expect(buffers.invMassSBA.version).toBe(initialVersion + 1);
  });

  it('restores frozen pieces when unfrozen (re-bumps version)', async () => {
    const device = new FakeGPUDevice();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const client = new GpuSolverClient(device as any);
    await client.initMultiPieceTsl([makeQuadPiece('a'), makeQuadPiece('b')]);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const buffers = (client as any).tslBuffers;
    const arr = buffers.invMassSBA.array as Float32Array;

    client.freezePieces(['a']);
    expect(arr[0]).toBe(0);

    client.freezePieces([]); // unfreeze all
    expect(Array.from(arr)).toEqual([1, 1, 1, 1, 1, 1, 1, 1]);
    expect(buffers.invMassSBA.version).toBe(2); // bumped twice
  });

  it('is a no-op when called before init', () => {
    const device = new FakeGPUDevice();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const client = new GpuSolverClient(device as any);
    expect(() => client.freezePieces(['anything'])).not.toThrow();
  });
});

// ─── Behavior #6 — setBrushParams updates uniforms ───────────────────────────

describe('setBrushParams (behavior #6)', () => {
  it('writes center/radius/strength into brushNodes uniforms', async () => {
    const device = new FakeGPUDevice();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const client = new GpuSolverClient(device as any);
    await client.initMultiPieceTsl([makeQuadPiece()]);

    client.setBrushParams([1.5, 2.5, 3.5], 0.42, 0.7);

    const tslSolver = client.getTslSolver()!;
    expect(tslSolver.brushNodes.centerX.value).toBe(1.5);
    expect(tslSolver.brushNodes.centerY.value).toBe(2.5);
    expect(tslSolver.brushNodes.centerZ.value).toBe(3.5);
    expect(tslSolver.brushNodes.radius.value).toBe(0.42);
    expect(tslSolver.brushNodes.strength.value).toBe(0.7);
  });

  it('is a no-op when called before init', () => {
    const device = new FakeGPUDevice();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const client = new GpuSolverClient(device as any);
    expect(() => client.setBrushParams([0, 0, 0], 0.1, 0.5)).not.toThrow();
  });
});

// ─── Behavior #7 — grabStart / grabMove / grabRelease ────────────────────────

describe('grab uniforms (behavior #7)', () => {
  it('grabStart sets center/radius/strength + activates + flags init pending', async () => {
    const device = new FakeGPUDevice();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const client = new GpuSolverClient(device as any);
    await client.initMultiPieceTsl([makeQuadPiece()]);

    client.grabStart([4, 5, 6], 0.3, 0.9);

    const g = client.getTslSolver()!.grabNodes;
    expect(g.grabCenterX.value).toBe(4);
    expect(g.grabCenterY.value).toBe(5);
    expect(g.grabCenterZ.value).toBe(6);
    expect(g.grabRadius.value).toBe(0.3);
    expect(g.grabStrength.value).toBe(0.9);
    expect(g.grabActive.value).toBe(1);
    expect(g.grabInitPending.value).toBe(1);
  });

  it('grabMove updates only the center, leaves activation untouched', async () => {
    const device = new FakeGPUDevice();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const client = new GpuSolverClient(device as any);
    await client.initMultiPieceTsl([makeQuadPiece()]);

    client.grabStart([1, 2, 3], 0.2, 0.5);
    const g = client.getTslSolver()!.grabNodes;
    const radiusBefore = g.grabRadius.value;
    const strengthBefore = g.grabStrength.value;

    client.grabMove([7, 8, 9]);

    expect(g.grabCenterX.value).toBe(7);
    expect(g.grabCenterY.value).toBe(8);
    expect(g.grabCenterZ.value).toBe(9);
    expect(g.grabRadius.value).toBe(radiusBefore);
    expect(g.grabStrength.value).toBe(strengthBefore);
    expect(g.grabActive.value).toBe(1);
  });

  it('grabRelease clears grabActive only', async () => {
    const device = new FakeGPUDevice();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const client = new GpuSolverClient(device as any);
    await client.initMultiPieceTsl([makeQuadPiece()]);

    client.grabStart([1, 2, 3], 0.2, 0.5);
    const g = client.getTslSolver()!.grabNodes;
    expect(g.grabActive.value).toBe(1);

    client.grabRelease();

    expect(g.grabActive.value).toBe(0);
    // Center stays at last grabStart value — release does not touch it.
    expect(g.grabCenterX.value).toBe(1);
  });

  it('grab calls are no-ops before init', () => {
    const device = new FakeGPUDevice();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const client = new GpuSolverClient(device as any);
    expect(() => {
      client.grabStart([0, 0, 0], 0.1, 0.5);
      client.grabMove([1, 1, 1]);
      client.grabRelease();
    }).not.toThrow();
  });
});

// ─── Behavior #3 — dispose mid-readback (WGSL loop catch path) ───────────────
//
// `loop()` has a `.catch(e)` block that bails when `this.disposed` is true so
// the rejection raised by destroying a buffer mid-readback doesn't surface as
// a console warning. The full WGSL init path is heavy to mock; instead we
// inject a stub solver and stub `requestAnimationFrame` to exercise just one
// loop iteration in isolation.

describe('dispose mid-readback (behavior #3)', () => {
  let originalRAF: typeof globalThis.requestAnimationFrame | undefined;
  let originalCAF: typeof globalThis.cancelAnimationFrame | undefined;

  beforeEach(() => {
    originalRAF = globalThis.requestAnimationFrame;
    originalCAF = globalThis.cancelAnimationFrame;
    // No-op rAF: schedules nothing, returns a stable handle. Tests below
    // drive a single loop iteration via `client.start()`.
    globalThis.requestAnimationFrame = vi.fn(() => 1) as unknown as typeof requestAnimationFrame;
    globalThis.cancelAnimationFrame = vi.fn() as unknown as typeof cancelAnimationFrame;
  });

  afterEach(() => {
    if (originalRAF) globalThis.requestAnimationFrame = originalRAF;
    else delete (globalThis as { requestAnimationFrame?: unknown }).requestAnimationFrame;
    if (originalCAF) globalThis.cancelAnimationFrame = originalCAF;
    else delete (globalThis as { cancelAnimationFrame?: unknown }).cancelAnimationFrame;
  });

  it('does not log console.error or readback-failure warning when disposed during pending readback', async () => {
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const device = new FakeGPUDevice();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const client = new GpuSolverClient(device as any);

    // Inject a stub solver: `step()` is a no-op, `readPositions()` returns a
    // deferred promise that we reject after dispose to simulate the
    // "buffer destroyed mid-mapAsync" rejection.
    let rejectReadback!: (e: Error) => void;
    const deferred = new Promise<Float32Array | null>((_resolve, reject) => {
      rejectReadback = reject;
    });
    const stubSolver = {
      step: vi.fn(),
      readPositions: vi.fn(() => deferred),
      destroy: vi.fn(),
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (client as any).solver = stubSolver;
    // Force WGSL readback path (TSL would short-circuit to zero-copy).
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (client as any).zeroCopy = false;

    client.start();
    expect(stubSolver.step).toHaveBeenCalledTimes(1);
    expect(stubSolver.readPositions).toHaveBeenCalledTimes(1);

    // Dispose while the readback promise is still pending.
    client.dispose();

    // Now the underlying GPU buffer "rejects" the mapAsync.
    rejectReadback(new Error('destroyed buffer'));

    // Drain microtasks so the catch handler runs.
    await Promise.resolve();
    await Promise.resolve();

    expect(errSpy).not.toHaveBeenCalled();
    expect(warnSpy).not.toHaveBeenCalledWith(
      expect.stringContaining('Readback failed'),
      expect.anything(),
    );

    errSpy.mockRestore();
    warnSpy.mockRestore();
  });
});

// ─── Behavior #8 — TslCollisionBody dispose chain (#772 regression) ──────────
//
// `setTslCollisionBody(id, mesh)` allocates 3 BVH SBAs (covered by #771) plus
// 2 per-body atomic scratch SBAs inside `createTslCollisionBody`
// (`bestDistSBA` filled with INT32_MAX, `bestTriIdxSBA` filled with -1).
// PR #772 extended the dispose chain so a second `setTslCollisionBody` call
// for the same id releases BOTH sets. This guard verifies the scratch SBAs
// specifically — the BVH disposal is already covered by #771 elsewhere.

describe('setTslCollisionBody dispose chain (behavior #8 — #772 regression)', () => {
  it('routes the previous body scratch SBAs (bestDist + bestTriIdx) through renderer._attributes.delete on replace', async () => {
    const device = new FakeGPUDevice();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const client = new GpuSolverClient(device as any);
    await client.initMultiPieceTsl([makeQuadPiece()]);

    // Capture renderer so the dispose chain has somewhere to route deletes.
    const renderer = new FakeRenderer();
    await client.readbackPositionsToGeometry(
      renderer as unknown as Parameters<typeof client.readbackPositionsToGeometry>[0],
      makeMockGeometry(),
    );

    // Snapshot atomic SBAs allocated by the FIRST collision body.
    setAtomicCalls.length = 0;
    client.setTslCollisionBody('avatar', makeTriCollisionMesh());

    const firstBodyAtomicSBAs = setAtomicCalls
      .map((c) => c.sba as TestSBA)
      .filter((sba) => sba.array instanceof Int32Array);
    const firstBestDist = firstBodyAtomicSBAs.find((s) => (s.array as Int32Array)[0] === 0x7fffffff);
    const firstBestTriIdx = firstBodyAtomicSBAs.find((s) => (s.array as Int32Array)[0] === -1);
    expect(firstBestDist).toBeDefined();
    expect(firstBestTriIdx).toBeDefined();

    // Replace the body with the same id — the previous body's dispose must
    // route the two scratch SBAs through renderer._attributes.delete.
    client.setTslCollisionBody('avatar', makeTriCollisionMesh());

    expect(renderer._attributes.delete).toHaveBeenCalledWith(firstBestDist);
    expect(renderer._attributes.delete).toHaveBeenCalledWith(firstBestTriIdx);
  });

  it('removeTslCollisionBody also disposes scratch SBAs', async () => {
    const device = new FakeGPUDevice();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const client = new GpuSolverClient(device as any);
    await client.initMultiPieceTsl([makeQuadPiece()]);

    const renderer = new FakeRenderer();
    await client.readbackPositionsToGeometry(
      renderer as unknown as Parameters<typeof client.readbackPositionsToGeometry>[0],
      makeMockGeometry(),
    );

    setAtomicCalls.length = 0;
    client.setTslCollisionBody('prop', makeTriCollisionMesh());
    const atomicSBAs = setAtomicCalls
      .map((c) => c.sba as TestSBA)
      .filter((sba) => sba.array instanceof Int32Array);
    const bestDist = atomicSBAs.find((s) => (s.array as Int32Array)[0] === 0x7fffffff);
    const bestTriIdx = atomicSBAs.find((s) => (s.array as Int32Array)[0] === -1);

    client.removeTslCollisionBody('prop');

    expect(renderer._attributes.delete).toHaveBeenCalledWith(bestDist);
    expect(renderer._attributes.delete).toHaveBeenCalledWith(bestTriIdx);
  });
});
