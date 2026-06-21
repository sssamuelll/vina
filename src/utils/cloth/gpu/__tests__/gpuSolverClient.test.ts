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
// • `uniformCalls` — captures every `uniform(value)` constructor value so the
//   init-time solver config can be observed (behavior #12): local modules are
//   NOT mocked here, so the only seam-param observable is the value each
//   config scalar is wrapped with inside `createTslSolver`'s createUniforms.
const { sharedMock, setAtomicCalls, uniformCalls } = vi.hoisted(() => {
  const setAtomicCalls: Array<{ sba: unknown; value: unknown }> = [];
  const uniformCalls: unknown[] = [];

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
    uniform: (val: unknown) => {
      uniformCalls.push(val);
      return makeUniform(val);
    },
    float: (val: unknown) => makeUniform(val),
    int: (val: unknown) => makeUniform(val),
    uint: (val: unknown) => makeUniform(val),
    vec3: () => createChainProxy(),
    instanceIndex: createChainProxy(),
    Loop: () => createChainProxy(),
    Break: () => createChainProxy(),
    If: () => createChainProxy(),
    atomicStore: () => createChainProxy(),
    atomicAdd: () => createChainProxy(),
    atomicLoad: () => createChainProxy(),
    atomicMin: () => createChainProxy(),
  });
  /* eslint-enable @typescript-eslint/no-explicit-any */

  return { sharedMock, setAtomicCalls, uniformCalls };
});

// Shape of the mock StorageBufferAttribute (kept here as a plain type so the
// hoisted MockSBA constructor doesn't need to be re-exported).
type TestSBA = {
  array: Float32Array | Uint32Array | Int32Array;
  count: number;
  itemSize: number;
  version: number;
};

// Mock-shaped SeamColorGroup (the real one carries StorageBufferAttribute;
// the mock factory above substitutes MockSBA, so per-group SBAs are TestSBAs).
type TestSeamColorGroup = {
  idsSBA: TestSBA;
  targetDistSBA: TestSBA;
  complianceSBA: TestSBA;
  count: number;
};

vi.mock('three/webgpu', () => sharedMock());
vi.mock('three/tsl', () => sharedMock());

import { GpuSolverClient, type PieceMeshData } from '../gpuSolverClient';
import { DEFAULT_SEAM_CONFIG } from '../../seamAssembly';

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
// (`bestDistSBA` filled with INT32_MAX — #921 Eje A folded bestTriIdx into it).
// PR #772 extended the dispose chain so a second `setTslCollisionBody` call
// for the same id releases BOTH sets. This guard verifies the scratch SBAs
// specifically — the BVH disposal is already covered by #771 elsewhere.

describe('setTslCollisionBody dispose chain (behavior #8 — #772 regression)', () => {
  it('routes the previous body composite-key scratch SBA through renderer._attributes.delete on replace', async () => {
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
    expect(firstBestDist).toBeDefined();

    // Replace the body with the same id — the previous body's dispose must
    // route the composite-key scratch SBA through renderer._attributes.delete
    // (#921 Eje A folded bestTriIdx into the key buffer, so there is one now).
    client.setTslCollisionBody('avatar', makeTriCollisionMesh());

    expect(renderer._attributes.delete).toHaveBeenCalledWith(firstBestDist);
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

    client.removeTslCollisionBody('prop');

    expect(renderer._attributes.delete).toHaveBeenCalledWith(bestDist);
  });

  // #897 F4.3b: setTslCollisionBody now allocates a 4th BVH SBA — the
  // escape-pointer (skip) buffer for the threaded findBest traversal. It must
  // ride the same per-body dispose chain as nodes/triVerts/triNormals (#753):
  // replace-by-id, removeTslCollisionBody, and disposeTslResources.

  it('tracks the skip SBA (escape pointers, #897 F4.3b) and disposes it on replace', async () => {
    const device = new FakeGPUDevice();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const client = new GpuSolverClient(device as any);
    await client.initMultiPieceTsl([makeQuadPiece()]);

    const renderer = new FakeRenderer();
    await client.readbackPositionsToGeometry(
      renderer as unknown as Parameters<typeof client.readbackPositionsToGeometry>[0],
      makeMockGeometry(),
    );

    client.setTslCollisionBody('avatar', makeTriCollisionMesh());
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const tracked = (client as any).collisionBodySBAs.get('avatar');
    expect(tracked.bvhSkipSBA).toBeDefined();
    expect((tracked.bvhSkipSBA as TestSBA).array).toBeInstanceOf(Uint32Array);
    // One escape pointer per BVH node.
    expect((tracked.bvhSkipSBA as TestSBA).array.length).toBe(
      (tracked.bvhNodesSBA as TestSBA).array.length / 8,
    );

    client.setTslCollisionBody('avatar', makeTriCollisionMesh());
    expect(renderer._attributes.delete).toHaveBeenCalledWith(tracked.bvhSkipSBA);
  });

  it('removeTslCollisionBody also disposes the skip SBA (#897 F4.3b)', async () => {
    const device = new FakeGPUDevice();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const client = new GpuSolverClient(device as any);
    await client.initMultiPieceTsl([makeQuadPiece()]);

    const renderer = new FakeRenderer();
    await client.readbackPositionsToGeometry(
      renderer as unknown as Parameters<typeof client.readbackPositionsToGeometry>[0],
      makeMockGeometry(),
    );

    client.setTslCollisionBody('prop', makeTriCollisionMesh());
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const tracked = (client as any).collisionBodySBAs.get('prop');
    expect(tracked.bvhSkipSBA).toBeDefined();

    client.removeTslCollisionBody('prop');
    expect(renderer._attributes.delete).toHaveBeenCalledWith(tracked.bvhSkipSBA);
  });
});

// ─── Behavior #9 — readPositionsToCPU TSL readback (#759) ────────────────────
//
// Closes the Phase-1 stub that returned the SBA's stale CPU-side array with a
// `console.warn`. The TSL branch now routes through
// `renderer.getArrayBufferAsync(positionSBA)` so callers receive post-compute
// positions, mirroring the WGSL `solver.readPositions()` contract
// (`numParticles * 3` flat Float32Array). The renderer can be passed
// explicitly or picked up from the ref captured during
// `readbackPositionsToGeometry`. When neither is available, the method throws
// loudly instead of silently degrading.

describe('readPositionsToCPU TSL readback (behavior #9 — #759)', () => {
  it('returns a fresh Float32Array sourced from renderer.getArrayBufferAsync (explicit renderer)', async () => {
    const device = new FakeGPUDevice();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const client = new GpuSolverClient(device as any);
    await client.initMultiPieceTsl([makeQuadPiece()]);

    // 4 particles × vec3 = 12 floats. Encode a recognisable pattern so the
    // test asserts the bytes round-trip from the renderer, not from the SBA's
    // init-time array.
    const expected = new Float32Array([
      1, 2, 3,  4, 5, 6,  7, 8, 9,  10, 11, 12,
    ]);
    const renderer = new FakeRenderer();
    renderer.getArrayBufferAsync = vi.fn(() => Promise.resolve(expected.buffer));

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const positions = await client.readPositionsToCPU(renderer as any);

    expect(positions).not.toBeNull();
    expect(positions).toBeInstanceOf(Float32Array);
    expect(Array.from(positions!)).toEqual(Array.from(expected));
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sba = (client as any).tslSolver.positionSBA;
    expect(renderer.getArrayBufferAsync).toHaveBeenCalledWith(sba);
  });

  it('falls back to the cached rendererRef when no renderer is passed', async () => {
    const device = new FakeGPUDevice();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const client = new GpuSolverClient(device as any);
    await client.initMultiPieceTsl([makeQuadPiece()]);

    // Prime rendererRef via readbackPositionsToGeometry (same path used in
    // production by GarmentSimulation's TSL useFrame readback).
    const renderer = new FakeRenderer();
    await client.readbackPositionsToGeometry(
      renderer as unknown as Parameters<typeof client.readbackPositionsToGeometry>[0],
      makeMockGeometry(),
    );

    const expected = new Float32Array(4 * 3);
    expected[0] = 99;
    renderer.getArrayBufferAsync = vi.fn(() => Promise.resolve(expected.buffer));

    const positions = await client.readPositionsToCPU();

    expect(positions).not.toBeNull();
    expect(positions![0]).toBe(99);
    expect(renderer.getArrayBufferAsync).toHaveBeenCalled();
  });

  it('strips W when the GPU buffer is padded to vec4', async () => {
    const device = new FakeGPUDevice();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const client = new GpuSolverClient(device as any);
    await client.initMultiPieceTsl([makeQuadPiece()]);

    // 4 particles × vec4 = 16 floats. W=99 sentinel so a wrong copy is
    // immediately visible.
    const padded = new Float32Array([
      1, 2, 3, 99,   4, 5, 6, 99,   7, 8, 9, 99,   10, 11, 12, 99,
    ]);
    const renderer = new FakeRenderer();
    renderer.getArrayBufferAsync = vi.fn(() => Promise.resolve(padded.buffer));

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const positions = await client.readPositionsToCPU(renderer as any);

    expect(positions).not.toBeNull();
    expect(positions!.length).toBe(12);
    expect(Array.from(positions!)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
  });

  it('throws when TSL is active and no renderer is available', async () => {
    const device = new FakeGPUDevice();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const client = new GpuSolverClient(device as any);
    await client.initMultiPieceTsl([makeQuadPiece()]);

    await expect(client.readPositionsToCPU()).rejects.toThrow(/WebGPURenderer/);
  });

  it('does not emit console.warn on the happy path (stub regression)', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const device = new FakeGPUDevice();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const client = new GpuSolverClient(device as any);
    await client.initMultiPieceTsl([makeQuadPiece()]);

    const renderer = new FakeRenderer();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await client.readPositionsToCPU(renderer as any);

    expect(warnSpy).not.toHaveBeenCalledWith(
      expect.stringContaining('GPU readback not yet implemented'),
    );

    warnSpy.mockRestore();
  });
});

// ─── Behavior #10 — seam pair packing (parity plan Fase 4) ──────────────────
//
// Closes the Epic-746 gap: `initMultiPieceTsl(pieces, seamPairs)` had zero
// coverage (seam SBA creation was only tested at the tslBuffers layer).
// Pins the LOCAL → GLOBAL offset translation (the LocalVertexIndex brand
// contract from seamPairs.ts #738) and the loud-skip on unknown pieces.
// Also covers the vertex-offset guard that replaced the silent `?? 0`
// default in `pieceVertexRanges` packing.

describe('initMultiPieceTsl with seamPairs (behavior #10 — Fase 4)', () => {
  function makeSeamPairs(): Parameters<GpuSolverClient['initMultiPieceTsl']>[1] {
    return [
      {
        pieceAId: 'a',
        pieceBId: 'b',
        // LOCAL piece-relative indices (the seamPairs.ts brand contract).
        vertexPairs: [[0, 0], [1, 1]] as Array<[never, never]>,
        // Required since the param became SeamPair[] (#897 F1 retyping).
        compliance: 0.0001,
        tensionFactor: 1.0,
      },
    ];
  }

  it('packs seam pairs into per-color seam SBAs applying per-piece GLOBAL vertex offsets', async () => {
    const device = new FakeGPUDevice();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const client = new GpuSolverClient(device as any);

    await client.initMultiPieceTsl([makeQuadPiece('a'), makeQuadPiece('b')], makeSeamPairs());

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const buffers = (client as any).tslBuffers;
    const seamColors = buffers.seamColors as TestSeamColorGroup[];
    // No shared vertices between the two pairs → single color group of 2.
    expect(seamColors).toHaveLength(1);
    expect(seamColors[0].count).toBe(2);
    expect(buffers.numSeamConstraints).toBe(2);
    // Piece 'a' offset 0, piece 'b' offset 4 (4-vertex quads): local pairs
    // [0,0],[1,1] become global [0,4],[1,5]. A double-offset regression
    // (global indices fed in) would yield [0,8],[1,9] instead.
    expect(Array.from(seamColors[0].idsSBA.array)).toEqual([0, 4, 1, 5]);
    // Still [0, 0] under #897 F1 seeding (targetDist = world distance ×
    // tensionFactor): both quads are coincident, so the seeded distance is 0.
    // The non-zero seeding path is pinned by behavior #11.
    expect(Array.from(seamColors[0].targetDistSBA.array)).toEqual([0, 0]);
  });

  it('skips pairs referencing unknown pieces with a loud warn; no seam SBA when none survive', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const device = new FakeGPUDevice();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const client = new GpuSolverClient(device as any);

    const pairs = makeSeamPairs();
    pairs![0] = { ...pairs![0], pieceBId: 'ghost' };
    await client.initMultiPieceTsl([makeQuadPiece('a'), makeQuadPiece('b')], pairs);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const buffers = (client as any).tslBuffers;
    expect(buffers.seamColors).toEqual([]);
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('ghost'));
    warnSpy.mockRestore();
  });

  it('yields empty seamColors when seamPairs is omitted or empty', async () => {
    const device = new FakeGPUDevice();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const client = new GpuSolverClient(device as any);

    await client.initMultiPieceTsl([makeQuadPiece('a'), makeQuadPiece('b')], []);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const buffers = (client as any).tslBuffers;
    expect(buffers.seamColors).toEqual([]);
    expect(buffers.numSeamConstraints).toBe(0);
  });
});

// ─── Behavior #11 — seam closure packing (#897 F1) ──────────────────────────
//
// F1 replaces the rigid snap-to-zero packing (targetDist = 0, no compliance,
// no coloring) with the CPU/WASM mirror: targetDist seeds at current world
// distance × tensionFactor (decays on GPU), per-constraint compliance, and
// graph coloring (colorConstraints) for race-free parallel dispatch.
//
// Observable: since F1.3 the buffer factory slices the packed seam data into
// per-color SeamColorGroup SBAs, so seeding/compliance/coloring are asserted
// directly on `tslBuffers.seamColors` — the transitional createTslBuffers
// passthrough spy from the F1.2 commit is retired.

describe('initMultiPieceTsl seam closure packing (behavior #11 — #897 F1)', () => {
  /** Quad piece rigidly shifted +dx in world x — local indices stay identical. */
  function makeQuadPieceAt(id: string, dx: number): PieceMeshData {
    const p = makeQuadPiece(id);
    for (let i = 0; i < p.vertices.length; i += 3) p.vertices[i] += dx;
    return p;
  }

  it('seeds targetDist = world distance × tensionFactor and per-constraint compliance, colored', async () => {
    const device = new FakeGPUDevice();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const client = new GpuSolverClient(device as any);

    // Local vertex 0 of A sits at (-0.5, 1, 0); piece B shifted +0.3 puts its
    // local vertex 0 at (-0.2, 1, 0) → world distance 0.3.
    await client.initMultiPieceTsl(
      [makeQuadPiece('A'), makeQuadPieceAt('B', 0.3)],
      [{
        pieceAId: 'A',
        pieceBId: 'B',
        vertexPairs: [[0, 0]] as Array<[never, never]>,
        compliance: 0.0001,
        tensionFactor: 0.5,
      }],
    );

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const buffers = (client as any).tslBuffers;
    const seamColors = buffers.seamColors as TestSeamColorGroup[];
    // Single constraint → one color group of 1.
    expect(seamColors).toHaveLength(1);
    expect(seamColors[0].count).toBe(1);
    expect(Array.from(seamColors[0].idsSBA.array)).toEqual([0, 4]);
    // Seeding mirror of CPU/WASM: 0.3 × 0.5 = 0.15 (rigid packing seeded 0).
    expect(seamColors[0].targetDistSBA.array[0]).toBeCloseTo(0.15, 6);
    expect(seamColors[0].complianceSBA.array[0]).toBeCloseTo(0.0001, 8);
  });

  it('splits shared-vertex pairs into separate color groups', async () => {
    const device = new FakeGPUDevice();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const client = new GpuSolverClient(device as any);

    // Pairs [[0,0],[1,0]] both touch B's local vertex 0 (global 4) →
    // colorConstraints must split them into 2 color groups of 1.
    await client.initMultiPieceTsl(
      [makeQuadPiece('A'), makeQuadPieceAt('B', 0.3)],
      [{
        pieceAId: 'A',
        pieceBId: 'B',
        vertexPairs: [[0, 0], [1, 0]] as Array<[never, never]>,
        compliance: 0.0001,
        tensionFactor: 1.0,
      }],
    );

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const buffers = (client as any).tslBuffers;
    const seamColors = buffers.seamColors as TestSeamColorGroup[];
    expect(seamColors).toHaveLength(2);
    expect(seamColors[0].count).toBe(1);
    expect(seamColors[1].count).toBe(1);
    // Both constraints survive the reorder.
    expect(buffers.numSeamConstraints).toBe(2);
  });
});

// ─── Behavior #12 — default seam decay config (#897 F1.4) ────────────────────
//
// initMultiPieceTsl's defaultConfig must seed the TSL solver with
// DEFAULT_SEAM_CONFIG.shrinkFactor / .sewedThreshold (the CPU/WASM parity
// values for in-kernel seam target decay) instead of the removed
// seamStiffness. Local modules are deliberately NOT mocked in this file (only
// three/*), so the observable is the `uniform()` constructor: createTslSolver
// wraps each config scalar in uniform(value), and 0.97 / 1e-6 appear nowhere
// else in the TSL init path (audited: wind 0/1, brush 0/0.05, grab
// 0/0.08/0.6/15, damping 0.99 — behavior #14, gravity -9.81, sdt 1/900,
// groundY 0).

describe('initMultiPieceTsl default seam decay config (behavior #12 — #897 F1.4)', () => {
  it('seeds seamShrinkFactor and seamSewedThreshold from DEFAULT_SEAM_CONFIG', async () => {
    // Anchor the literals first so the wiring assertion below can't go
    // tautological if DEFAULT_SEAM_CONFIG drifts.
    expect(DEFAULT_SEAM_CONFIG.shrinkFactor).toBe(0.97);
    expect(DEFAULT_SEAM_CONFIG.sewedThreshold).toBe(1e-6);

    uniformCalls.length = 0;
    const device = new FakeGPUDevice();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const client = new GpuSolverClient(device as any);
    await client.initMultiPieceTsl([makeQuadPiece()]);

    expect(uniformCalls).toContain(DEFAULT_SEAM_CONFIG.shrinkFactor);
    expect(uniformCalls).toContain(DEFAULT_SEAM_CONFIG.sewedThreshold);
  });
});

// ─── Behavior #13 — avatar calibration M4-D on both routes (#897 F2) ─────────
//
// The WASM tier ships the M4-D drape calibration for the avatar body
// (friction 0.4 ≈ cotton-on-skin, margin 8mm anti z-fight — see
// wasmSolverWorker.ts `setCollisionMesh`); the GPU tier never received it and
// kept the generic TSL defaults (0.3 / 5mm), so cloth slid off the TSL avatar
// and z-fought at contact. BOTH '__avatar__' routes must pass the calibrated
// values: `setCollisionMesh` (initial set) and `updateCollisionMesh` (pose
// updates — no live caller today, but a latent calibration trap).
// `setTslCollisionBody(id, mesh, friction, margin)` is a public method, so a
// prototype spy (real implementation preserved) observes the exact arg
// binding — `uniformCalls` containment alone could not distinguish friction
// from margin. The custom-body route (`updateCollisionBody`) keeps
// caller-provided values and is deliberately NOT covered here.

describe('avatar collision calibration M4-D (behavior #13 — #897 F2)', () => {
  afterEach(() => {
    // Restores the prototype spy; fakes are re-created per test so the
    // blanket restore cannot strand stale vi.fn state.
    vi.restoreAllMocks();
  });

  it('setCollisionMesh routes __avatar__ with friction 0.4 and margin 0.008', async () => {
    const spy = vi.spyOn(GpuSolverClient.prototype, 'setTslCollisionBody');
    const device = new FakeGPUDevice();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const client = new GpuSolverClient(device as any);
    await client.initMultiPieceTsl([makeQuadPiece()]);

    const mesh = makeTriCollisionMesh();
    client.setCollisionMesh(mesh);

    expect(spy).toHaveBeenCalledWith('__avatar__', mesh, 0.4, 0.008);
  });

  it('updateCollisionMesh routes __avatar__ with friction 0.4 and margin 0.008', async () => {
    const spy = vi.spyOn(GpuSolverClient.prototype, 'setTslCollisionBody');
    const device = new FakeGPUDevice();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const client = new GpuSolverClient(device as any);
    await client.initMultiPieceTsl([makeQuadPiece()]);

    const { vertices, normals } = makeTriCollisionMesh();
    client.updateCollisionMesh(vertices, normals);

    expect(spy).toHaveBeenCalledWith(
      '__avatar__',
      { vertices, normals, triCount: 1 },
      0.4,
      0.008,
    );
  });
});

// ─── Behavior #14 — default damping 0.99, not 0.9603 (#897 F2) ───────────────
//
// The TSL preSolve kernel multiplies damping × (1 − internalDamping×0.1)
// (same formula as Rust pre_solve). WASM ships damping=0.99 +
// internalDamping=0.3 → effective 0.99×0.97 = 0.9603/substep. The old GPU
// defaultConfig baked the EFFECTIVE value (0.9603) in, so the kernel applied
// the ×0.97 factor AGAIN → 0.9315/substep → velocity ×0.34/frame vs ×0.54 on
// WASM — depressed momentum, wrong settling. Observable: the `uniform()`
// constructor capture (same mechanism as behavior #12); 0.99 appears nowhere
// else in the TSL init path (audit in the behavior #12 comment), and 0.9603
// must be gone entirely. The WGSL path (gpuSolver.ts damping 0.9603) is
// intentionally untouched: its kernel has no internalDamping term, so the
// pre-multiplied value is correct there.

describe('initMultiPieceTsl default damping (behavior #14 — #897 F2)', () => {
  it('seeds the damping uniform with 0.99 (raw), not 0.9603 (pre-multiplied)', async () => {
    uniformCalls.length = 0;
    const device = new FakeGPUDevice();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const client = new GpuSolverClient(device as any);
    await client.initMultiPieceTsl([makeQuadPiece()]);

    expect(uniformCalls).toContain(0.99);
    expect(uniformCalls).not.toContain(0.9603);
  });
});

// ─── Behavior #15 — self-collision allocation + always-on wiring (#897 F3.3) ─
//
// Production never allocated `scBuffers` (createTslBuffers hardcodes null in
// its return literal) nor passed `selfCollision: true`, so the 4-pass bucket
// pipeline from F3.1/F3.2 was dead code. F3.3 wires the allocation in
// initMultiPieceTsl: CSR adjacency built from the MERGED triangle ids (so
// cross-piece vertex offsets are baked in), bucket table sized nextPrime(2N)
// (mirror of SpatialHashGrid.build), and `selfCollision: true` + thickness
// 0.002 in the default config so createTslSolver's gate
// (`config.selfCollision && buffers.scBuffers`) constructs the nodes.
// Always-on is a RATIFIED divergence vs SIMULATION_MODES['normal'].selfCollision
// = false — that false is a WASM-measured perf decision (#608/#892 kernel at
// 1FPS) that does not apply to GPU compute (buckets K=8, 4 passes); the
// off-switch is the dispatch gate in GarmentSimulation.

describe('initMultiPieceTsl self-collision allocation (behavior #15 — #897 F3.3)', () => {
  it('allocates scBuffers with real CSR adjacency and a nextPrime(2N) bucket table', async () => {
    const device = new FakeGPUDevice();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const client = new GpuSolverClient(device as any);

    await client.initMultiPieceTsl([makeQuadPiece('a'), makeQuadPiece('b')]);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sc = (client as any).tslBuffers.scBuffers;
    expect(sc).not.toBeNull();

    // N = 8 (two 4-vertex quads) → CSR offsets carry the N+1 sentinel shape.
    const offsets = sc.adjOffsetsSBA.array as Uint32Array;
    expect(offsets.length).toBe(9);

    // REAL adjacency, not zero-fill: quad [0,1,2, 0,2,3] gives vertex 0 the
    // triangle-shared neighbor set {1,2,3}; per-vertex sizes (3,2,3,2)=10
    // per quad → offsets [0,3,5,8,10, 13,15,18,20] across both pieces.
    expect(Array.from(offsets)).toEqual([0, 3, 5, 8, 10, 13, 15, 18, 20]);
    const neighbors = sc.adjNeighborsSBA.array as Uint32Array;
    expect(neighbors.length).toBe(20);
    const p0 = Array.from(neighbors.slice(offsets[0], offsets[1])).sort((a, b) => a - b);
    expect(p0).toEqual([1, 2, 3]);
    // Piece 'b' is offset +4 in the merged mesh: its first vertex (global 4)
    // must neighbor {5,6,7} — a missing vertex offset would yield {1,2,3}.
    const p4 = Array.from(neighbors.slice(offsets[4], offsets[5])).sort((a, b) => a - b);
    expect(p4).toEqual([5, 6, 7]);

    // tableSize = nextPrime(2N) = nextPrime(16) = 17 (SpatialHashGrid.build
    // mirror); bucket entries are tableSize × CELL_CAPACITY (8).
    expect(sc.tableSize).toBe(17);
    expect(sc.cellEntriesSBA.array.length).toBe(17 * 8);
  });

  it('passes selfCollision: true + thickness to createTslSolver — selfCollisionNodes wired', async () => {
    uniformCalls.length = 0;
    const device = new FakeGPUDevice();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const client = new GpuSolverClient(device as any);

    await client.initMultiPieceTsl([makeQuadPiece('a'), makeQuadPiece('b')]);

    const solver = client.getTslSolver()!;
    // The gate is `config.selfCollision && buffers.scBuffers` — non-null
    // nodes prove BOTH halves arrived (flag + allocation).
    expect(solver.selfCollisionNodes).not.toBeNull();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const nodes = solver.selfCollisionNodes as any;
    // Dispatch counts baked into the compute() wraps: [tableSize, N, N, N].
    expect(nodes.cellClearNode.dispatchCount).toBe(17);
    expect(nodes.scatterNode.dispatchCount).toBe(8);
    expect(nodes.resolveNode.dispatchCount).toBe(8);
    expect(nodes.applyNode.dispatchCount).toBe(8);
    // thickness default 0.002 (clothThickness parity with CPU/WASM) reaches
    // the kernel as a uniform; 0.002 appears nowhere else in the TSL init
    // path (audit in the behavior #12 comment).
    expect(uniformCalls).toContain(0.002);
  });
});
