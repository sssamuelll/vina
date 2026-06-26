import { describe, it, expect, vi } from 'vitest';

// vi.hoisted runs before vi.mock hoisting, so MockSBA + setAtomicCalls are
// available to both mocks. `setAtomicCalls` is exposed for the atomic
// regression guards on the per-body scratch buffers.
const { MockSBA, setAtomicCalls, atomicLoadCalls, selectCalls, intCalls, floatCalls, storageCalls, breakCalls } = vi.hoisted(() => {
  const setAtomicCalls: Array<{ sba: unknown; value: unknown }> = [];
  // `atomicLoadCalls` is exposed for #554 spec-compliance regression tests —
  // WGSL spec requires atomicLoad on every read of an array<atomic<T>>
  // buffer. Symmetric to `setAtomicCalls`.
  const atomicLoadCalls: Array<unknown> = [];
  // `selectCalls` / `intCalls` / `floatCalls` are exposed for the #897 F2
  // NaN-guard + i32-clamp pins (§9 candidates 5-6). All args are opaque chain
  // proxies except literal numbers, so the pins assert presence + count + the
  // literal constants (INT32_MAX fallback, 2.0 m clamp) — not dataflow.
  const selectCalls: Array<unknown[]> = [];
  const intCalls: Array<unknown> = [];
  const floatCalls: Array<unknown> = [];
  // `storageCalls` / `breakCalls` are exposed for the #897 F4.3b threaded-
  // traversal pins: the skip (escape-pointer) buffer must be wired as a
  // 'uint' storage node, and the bounded Loop must carry a Break() guard for
  // the cursor walk-off.
  const storageCalls: Array<unknown[]> = [];
  const breakCalls: Array<unknown> = [];
  const MockSBA = class MockSBA {
    array: ArrayLike<number>;
    itemSize: number;
    constructor(array: ArrayLike<number>, itemSize: number) {
      this.array = array;
      this.itemSize = itemSize;
    }
  };
  return { MockSBA, setAtomicCalls, atomicLoadCalls, selectCalls, intCalls, floatCalls, storageCalls, breakCalls };
});

vi.mock('three/webgpu', () => ({
  StorageBufferAttribute: MockSBA,
}));

vi.mock('three/tsl', () => {
  // Same chain proxy pattern as tslSelfCollision.test.ts — any property access
  // or function call returns another proxy, so arbitrarily chained TSL
  // operations work without explicit stubs.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const createChainProxy = (): any => {
    const handler: ProxyHandler<(...args: unknown[]) => unknown> = {
      get() { return createChainProxy(); },
      apply() { return createChainProxy(); },
    };
    return new Proxy(function () {}, handler);
  };
  const proxy = createChainProxy();

  // Wrap callback invocation — partial coverage on missing mock surface.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const tryInvoke = (cb: unknown, arg?: any) => {
    if (typeof cb === 'function') {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      try { (cb as (...a: any[]) => any)(arg ?? proxy); } catch { /* mock surface incomplete */ }
    }
  };

  return {
    StorageBufferAttribute: MockSBA,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    Fn: (cb?: (...args: any[]) => any) => () => { tryInvoke(cb); return proxy; },
    storage: (...args: unknown[]) => {
      storageCalls.push(args);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const node: any = new Proxy(function () {}, {
        get(_target, prop) {
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
    compute: () => proxy,
    uniform: () => proxy,
    instanceIndex: proxy,
    uint: () => proxy,
    int: (v: unknown) => { intCalls.push(v); return proxy; },
    float: (v: unknown) => { floatCalls.push(v); return proxy; },
    select: (...args: unknown[]) => { selectCalls.push(args); return proxy; },
    // If(...) returns a chainable whose Else/ElseIf ALSO invoke their
    // callbacks — the §9 cand. 5-6 guard lives in the edge-fallback Else
    // branch, which a bare-proxy return would silently skip (the proxy's
    // apply() does not invoke function args).
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    If: (_cond: unknown, cb?: (...args: any[]) => any) => {
      tryInvoke(cb);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const ifChain: any = {
        Else: (ecb?: unknown) => { tryInvoke(ecb); return ifChain; },
        ElseIf: (_c: unknown, ecb?: unknown) => { tryInvoke(ecb); return ifChain; },
      };
      return ifChain;
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    Loop: (_count: unknown, cb?: (...args: any[]) => any) => { tryInvoke(cb, { i: proxy }); return proxy; },
    Break: () => { breakCalls.push(true); return proxy; },
    atomicAdd: () => proxy,
    atomicStore: () => proxy,
    atomicLoad: (dest: unknown) => {
      atomicLoadCalls.push(dest);
      return proxy;
    },
    atomicMin: () => proxy,
  };
});

import { createTslCollisionBody } from '../tslCollision';
import { StorageBufferAttribute } from 'three/webgpu';

// Test fixture builder — minimal valid BVH/tri data so the kernel factory has
// something to size its storage() calls against. We don't dispatch the kernels
// (jsdom has no WebGPU), only construct + assert shape.
function buildKernel(opts?: {
  numParticles?: number;
  numNodes?: number;
  numTris?: number;
  margin?: number;
  friction?: number;
  id?: string;
}) {
  setAtomicCalls.length = 0;
  selectCalls.length = 0;
  intCalls.length = 0;
  floatCalls.length = 0;
  storageCalls.length = 0;
  breakCalls.length = 0;
  const numParticles = opts?.numParticles ?? 16;
  const numNodes = opts?.numNodes ?? 4;
  const numTris = opts?.numTris ?? 2;

  const bvhNodesSBA = new StorageBufferAttribute(new Float32Array(numNodes * 8), 1);
  // Escape pointers for the threaded traversal (#897 F4.3b) — Uint32, one per node.
  const bvhSkipSBA = new StorageBufferAttribute(new Uint32Array(numNodes), 1);
  const triVertsSBA = new StorageBufferAttribute(new Float32Array(numTris * 9), 1);
  const triNormalsSBA = new StorageBufferAttribute(new Float32Array(numTris * 3), 1);
  // Pseudonormal SBAs for closest-feature inside/outside sign (Task 2-3).
  const edgePseudoSBA = new StorageBufferAttribute(new Float32Array(numTris * 9), 1);
  const vertexPseudoSBA = new StorageBufferAttribute(new Float32Array(numTris * 9), 1);

  // Full chain-proxy mock TSL node — same pattern as the three/tsl mock. The
  // kernel body calls `.toVar()`, `.equal()`, etc. on posBuf elements; a plain
  // object literal would throw on the first missing method and (because the
  // mock's tryInvoke swallows errors) silently skip the rest of the pass-1
  // body — leaving the select/int/float recorders empty (#897 F2 pins).
  /* eslint-disable @typescript-eslint/no-explicit-any */
  const chainNode = (): any =>
    new Proxy(function () {}, { get: () => chainNode(), apply: () => chainNode() });
  const mockNode: any = chainNode();

  return createTslCollisionBody(
    mockNode,
    mockNode,
    mockNode,
    bvhNodesSBA,
    bvhSkipSBA,
    triVertsSBA,
    triNormalsSBA,
    edgePseudoSBA,
    vertexPseudoSBA,
    numParticles,
    numNodes,
    numTris,
    opts?.id ?? 'test-body',
    opts?.margin ?? 0.005,
    opts?.friction ?? 0.3,
  );
  /* eslint-enable @typescript-eslint/no-explicit-any */
}

describe('createTslCollisionBody', () => {
  it('exports the factory', () => {
    expect(createTslCollisionBody).toBeDefined();
  });

  it('returns body with both pass nodes and metadata', () => {
    const body = buildKernel();
    expect(body.id).toBe('test-body');
    expect(body.findBestNode).toBeDefined();
    expect(body.applyPushNode).toBeDefined();
    expect(body.margin).toBe(0.005);
    expect(body.friction).toBe(0.3);
  });

  it('preserves nodeCount and triCount for telemetry', () => {
    const body = buildKernel({ numNodes: 17, numTris: 9 });
    expect(body.nodeCount).toBe(17);
    expect(body.triCount).toBe(9);
  });

  it('honors custom margin and friction', () => {
    const body = buildKernel({ margin: 0.02, friction: 0.7 });
    expect(body.margin).toBe(0.02);
    expect(body.friction).toBe(0.7);
  });

  it('honors custom body id (multi-body composition)', () => {
    const body = buildKernel({ id: '__avatar__' });
    expect(body.id).toBe('__avatar__');
  });

  it('returns a body with a dispose function', () => {
    const body = buildKernel();
    expect(typeof body.dispose).toBe('function');
  });
});

// ─── #771 follow-up: per-body atomic scratch SBA disposal ──────────────────
// `createTslCollisionBody` allocates the composite-key scratch `bestDistSBA`
// (#921 Eje A folded the former `bestTriIdxSBA` into its low bits) internal to the
// closure. PR #771 left its lifecycle out-of-scope; this guard ensures
// `dispose(renderer?)` routes the SBA through `renderer._attributes.delete`.

describe('TslCollisionBody.dispose', () => {
  it('routes the composite-key scratch SBA through renderer._attributes.delete', () => {
    const numParticles = 8;
    setAtomicCalls.length = 0;
    const body = buildKernel({ numParticles });

    // The single atomic SBA registered during construction is the per-body
    // composite-key scratch buffer (init filled with the INT32_MAX sentinel).
    const atomicSBAs = setAtomicCalls
      .map((c) => c.sba as { array: Int32Array })
      .filter((sba) => sba.array instanceof Int32Array);
    const bestDistSBA = atomicSBAs.find((s) => s.array[0] === 0x7fffffff);
    expect(bestDistSBA).toBeDefined();

    const deleteSpy = vi.fn();
    const renderer = { _attributes: { delete: deleteSpy } };
    body.dispose(renderer);

    expect(deleteSpy).toHaveBeenCalledWith(bestDistSBA);
    expect(deleteSpy).toHaveBeenCalledTimes(1);
  });

  it('is a no-op when renderer is omitted (best-effort, references dropped)', () => {
    const body = buildKernel();
    expect(() => body.dispose()).not.toThrow();
  });

  it('is a no-op when renderer lacks _attributes', () => {
    const body = buildKernel();
    expect(() => body.dispose({})).not.toThrow();
  });

  it('swallows errors thrown by renderer._attributes.delete', () => {
    const body = buildKernel();
    const renderer = {
      _attributes: { delete: () => { throw new Error('boom'); } },
    };
    expect(() => body.dispose(renderer)).not.toThrow();
  });
});

// ─── Atomic-buffer regression guards ────────────────────────────────────────
// The per-body composite-key scratch (`bestDistBuf`) MUST be declared atomic so
// WGSL emits `array<atomic<i32>>` with read_write access. Without this, the
// kernel falls back to the broken toVar/storage-read codegen and produces
// ~200 validation warnings (per the design doc on the prior attempt).

describe('atomic-buffer regression guards', () => {
  it('per-body composite-key scratch is declared atomic', () => {
    buildKernel();
    // The composite-key buffer is the only atomic SBA created in the factory.
    const atomicI32Calls = setAtomicCalls.filter(
      (c) => (c.sba as { array: ArrayLike<number> }).array instanceof Int32Array,
    );
    expect(atomicI32Calls.length).toBe(1);
    // The scratch buffer should have setAtomic(true) — see design doc rationale.
    expect(atomicI32Calls.every((c) => c.value === true)).toBe(true);
  });

  it('initializes bestDist scratch to INT32_MAX so first candidate wins atomicMin', () => {
    const numParticles = 8;
    setAtomicCalls.length = 0;
    buildKernel({ numParticles });
    // First atomic-tagged SBA == bestDist. Its array should be all 0x7FFFFFFF.
    const bestDistCall = setAtomicCalls.find(
      (c) => (c.sba as { array: ArrayLike<number> }).array instanceof Int32Array,
    );
    expect(bestDistCall).toBeDefined();
    const arr = (bestDistCall!.sba as { array: Int32Array }).array;
    expect(arr.length).toBe(numParticles);
    expect(arr[0]).toBe(0x7FFFFFFF);
    expect(arr[numParticles - 1]).toBe(0x7FFFFFFF);
  });

  it('uses atomicLoad on read passes (#554 WGSL spec compliance)', () => {
    // Symmetric to the setAtomic guards above. The applyPushNode pass reads the
    // composite-key bestDistBuf via atomicLoad at function-top — required because
    // the buffer is array<atomic<i32>>. Plain `.element(i)` is a WGSL validation
    // error.
    atomicLoadCalls.length = 0;
    buildKernel();
    expect(atomicLoadCalls.length).toBeGreaterThan(0);
  });

  it('per-body scratch SBA is distinct across bodies (no aliasing)', () => {
    // Multi-body composition: each call to createTslCollisionBody must allocate
    // its own composite-key bestDistBuf. If a future refactor hoists the scratch
    // SBA to module scope as a perf "optimization", two bodies dispatched in
    // sequence would race on shared atomic state and silently corrupt each
    // other's collision results. This test is the tripwire.
    setAtomicCalls.length = 0;
    buildKernel({ id: 'avatar-1', numParticles: 8 });
    const a1Scratch = setAtomicCalls
      .map((c) => c.sba)
      .filter((sba) => (sba as { array: ArrayLike<number> }).array instanceof Int32Array);

    setAtomicCalls.length = 0;
    buildKernel({ id: 'avatar-2', numParticles: 8 });
    const a2Scratch = setAtomicCalls
      .map((c) => c.sba)
      .filter((sba) => (sba as { array: ArrayLike<number> }).array instanceof Int32Array);

    expect(a1Scratch.length).toBe(1);
    expect(a2Scratch.length).toBe(1);
    // The composite-key scratch must be a distinct allocation per body.
    expect(a1Scratch[0]).not.toBe(a2Scratch[0]);
  });
});

// ─── #897 F2: NaN guard + i32 clamp on the findBest cast sites (§9 5-6) ─────
// NaN→i32 cast is UB in WGSL — a degenerate triangle (or sqrt of a negative
// epsilon) would poison atomicMin with a phantom minimum; and distances
// >2.147 m overflow i32 at scale 1e6. Both pass-1 cast sites (inside-
// projection + edge fallback) must route through select(equal-self) with an
// int(INT32_MAX) fallback, clamping the float distance to 2.0 m first.
//
// Mock limitation (stated): all select/int args are opaque chain proxies, so
// these pins assert presence + count + the literal constants — they cannot
// verify that the select RESULT is the value fed to atomicMin (dataflow).
// That end-to-end behavior is covered by F2.6 browser verification.

describe('findBest NaN guard + i32 clamp (#897 F2, §9 cand. 5-6)', () => {
  it('guards both i32 cast sites with select() — inside-projection + edge fallback', () => {
    buildKernel();
    expect(selectCalls.length).toBe(2);
    // TSL select(cond, ifTrue, ifFalse) — all three args present at each site.
    for (const call of selectCalls) {
      expect(call.length).toBe(3);
    }
  });

  it('uses int(INT32_MAX) as the NaN/sentinel at every site', () => {
    buildKernel();
    // 2 NaN-guard fallbacks (pass 1) + 1 "contact found" threshold (pass 2) +
    // 1 scratch reset (applyPush tail) = 4 (#921 Eje A: bestDistBuf is the key
    // buffer; its sentinel doubles as the no-contact fallback).
    expect(intCalls.filter((v) => v === 0x7fffffff).length).toBe(4);
  });

  it('clamps distance to 2.0 m before the ×1e6 scale at both sites (i32 overflow)', () => {
    buildKernel();
    expect(floatCalls.filter((v) => v === 2.0).length).toBe(2);
  });
});

// ─── #897 F4.3b: threaded BVH traversal structural pins ─────────────────────
// The findBest pass replaces the flat Loop(numNodes) scan (93% of the María
// frame: 29,338 particles × 11,955 nodes × 15 substeps ≈ 5.3B AABB tests) with
// an escape-pointer traversal that visits O(hit path) nodes. Structural pins
// only — the mock cannot execute WGSL. The CPU-side traversal SEMANTICS (skip
// array + cursor walk == flat-scan triangle set) are pinned for real in
// bvh.test.ts; GPU behavior is F4 browser verification. The F2 pins above
// double as leaf-code-intact guards: the per-triangle inner block (barycentric
// + edge fallback + NaN guard + atomicMin) must survive the mechanism swap.

describe('findBest threaded BVH traversal (#897 F4.3b)', () => {
  it('wires the skip buffer as a uint storage node sized numNodes', () => {
    buildKernel({ numNodes: 7 });
    const skipCall = storageCalls.find(
      (args) => (args[0] as { array?: unknown } | undefined)?.array instanceof Uint32Array,
    );
    expect(skipCall).toBeDefined();
    expect(skipCall![1]).toBe('uint');
    expect(skipCall![2]).toBe(7);
  });

  it('emits a Break() walk-off guard inside the bounded traversal Loop', () => {
    // The Loop bound stays numNodes (each node is visited at most once — the
    // cursor strictly increases), so termination does not depend on skip-array
    // integrity; the Break fires when the cursor reaches the root's escape
    // sentinel (numNodes).
    buildKernel();
    expect(breakCalls.length).toBeGreaterThanOrEqual(1);
  });
});

// ─── #921 Eje A: composite-key contact selection (order-independence) ────────
// The winner is packed as key = (distQ << TRI_BITS) | triIdx and selected via a
// single atomicMin. These pins prove the ENCODING invariant in pure JS (GPU
// execution itself is @gpu-local): atomicMin over the packed keys is
// order-independent and yields (min distance, then LOWEST triIdx on a tie) — the
// property the old split atomicMin+atomicStore design violated both on exact ties
// AND across distinct distances (the store-vs-min window). The end-to-end drape
// stabilization is the GPU-local isolation measurement tracked in #921.

describe('composite-key contact selection (#921 Eje A)', () => {
  // Mirror of the source constants (module-internal to tslCollision.ts).
  const TRI_BITS = 18;
  const TRI_MASK = 0x3ffff;
  const DIST_QUANT_MAX = 8190;
  const SENTINEL = 0x7fffffff;
  const pack = (distQ: number, tri: number) => (distQ << TRI_BITS) | tri;
  const decodeTri = (key: number) => key & TRI_MASK;
  // atomicMin over a candidate set, visited in a given order.
  const selectWinner = (cands: Array<{ distQ: number; tri: number }>, order: number[]) => {
    let best = SENTINEL;
    for (const idx of order) best = Math.min(best, pack(cands[idx].distQ, cands[idx].tri));
    return best;
  };
  const permutations = (arr: number[]): number[][] =>
    arr.length <= 1
      ? [arr]
      : arr.flatMap((x, i) =>
          permutations([...arr.slice(0, i), ...arr.slice(i + 1)]).map((p) => [x, ...p]));

  it('roundtrips triIdx through pack/decode', () => {
    for (const [distQ, tri] of [[0, 0], [1, 5], [8190, 262143], [4096, 100000]] as const) {
      expect(decodeTri(pack(distQ, tri))).toBe(tri);
    }
  });

  it('orders by distance first, then lowest triIdx on ties', () => {
    expect(pack(400, 8)).toBeLessThan(pack(500, 3)); // closer wins regardless of tri
    expect(pack(500, 3)).toBeLessThan(pack(500, 5)); // equal dist → lower tri wins
  });

  it('is order-independent across distinct distances (the old store-vs-min bug)', () => {
    // Two ties at dist=500 plus a closer triangle at dist=400. The old design
    // could leave tri 3 or 5 recorded (a worse distance); the key picks tri 8.
    const cands = [{ distQ: 500, tri: 5 }, { distQ: 500, tri: 3 }, { distQ: 400, tri: 8 }];
    const idxs = cands.map((_, i) => i);
    const winners = new Set(permutations(idxs).map((o) => decodeTri(selectWinner(cands, o))));
    expect(winners.size).toBe(1);
    expect([...winners][0]).toBe(8);
  });

  it('breaks exact-distance ties to the lowest triIdx, order-independent', () => {
    const cands = [{ distQ: 700, tri: 42 }, { distQ: 700, tri: 7 }, { distQ: 700, tri: 19 }];
    const idxs = cands.map((_, i) => i);
    const winners = new Set(permutations(idxs).map((o) => decodeTri(selectWinner(cands, o))));
    expect(winners.size).toBe(1);
    expect([...winners][0]).toBe(7);
  });

  it('keeps the max packable key below the no-contact sentinel', () => {
    expect(pack(DIST_QUANT_MAX, TRI_MASK)).toBeLessThan(SENTINEL);
  });

  it('throws when the collision mesh exceeds the composite-key triangle cap', () => {
    expect(() => buildKernel({ numTris: (1 << TRI_BITS) + 1 })).toThrow(/composite-key cap/);
  });
});
