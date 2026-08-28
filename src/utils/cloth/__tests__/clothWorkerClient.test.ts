import { describe, it, expect, vi, afterEach } from 'vitest';

import { ClothWorkerClient } from '../clothWorkerClient';
import { stubWorkerGlobal } from './fakeClothWorker';
import { clearSolverEvents, getSolverEvents } from '../solverRuntimeTracker';

/**
 * Boundary-contract coverage for the main-thread bridge between
 * `ClothWorkerClient` and the CPU XPBD Web Worker.
 *
 * Companion to the WASM-tier suite ratified in #761/#774
 * (`wasm/__tests__/wasmSolverClient.test.ts`) and the GPU-tier suite
 * ratified in #762/#773 (`gpu/__tests__/gpuSolverClient.test.ts`). The
 * shape of the file — helper module + describe-per-contract + minimal
 * fixtures — mirrors that convention; the substance is distinct:
 *
 *   - The CPU bridge assigns `worker.onmessage` / `worker.onerror`
 *     directly (`clothWorkerClient.ts:77,81`), it does NOT use
 *     `addEventListener`. So the helper here drives events by invoking
 *     the assigned property handlers, not via `dispatchEvent`.
 *   - The CPU bridge keeps the single-arg `pinParticle(index)` /
 *     `unpinParticle(index)` shape, ratified per A6 #684 caveat as the
 *     CPU semantic divergence from WASM's batch `setPins`. Documented
 *     here so the divergence is enforced by a test rather than only by
 *     JSDoc.
 *
 * Why we mock the Worker rather than load the real worker:
 *   - `clothWorkerClient.ts` constructs
 *     `new Worker(new URL('./clothWorker.ts', import.meta.url),
 *     {type: 'module'})`. vitest/jsdom does not support module workers
 *     and the worker imports the full XPBD solver (`xpbdSolver.ts` +
 *     `seamAssembly.ts` + `elasticAssembly.ts`), which is multiple
 *     seconds of warm-up — orthogonal to the bridge surface this suite
 *     verifies.
 *   - The test surface is the *bridge*, not the solver — verifying
 *     message shape + callback dispatch is what the
 *     ratified #761/#762/#774 charter requires.
 */

/** Minimal mesh — single triangle. Bridge does not inspect contents. */
function makeMesh(): { vertices: Float32Array; triIds: Int32Array } {
  return {
    vertices: new Float32Array([0, 0, 0,  1, 0, 0,  0, 1, 0]),
    triIds: new Int32Array([0, 1, 2]),
  };
}

/** Minimal collision mesh — single triangle with normals. */
function makeCollisionMesh(): { vertices: Float32Array; normals: Float32Array; triCount: number } {
  return {
    vertices: new Float32Array([0, 0, 0,  1, 0, 0,  0, 1, 0]),
    normals: new Float32Array([0, 0, 1,  0, 0, 1,  0, 0, 1]),
    triCount: 1,
  };
}

describe('ClothWorkerClient', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    clearSolverEvents();
  });

  // ── Contract #1 — init lifecycle ────────────────────────────────────────
  describe('init lifecycle (#1)', () => {
    it('posts an init message synchronously and resolves on worker "ready"', async () => {
      const { worker } = stubWorkerGlobal();
      const client = new ClothWorkerClient();

      const mesh = makeMesh();
      const initPromise = client.init(mesh, { numSubsteps: 4 });

      // The Promise executor runs synchronously, so postMessage('init')
      // is observable before any await.
      expect(worker.postMessage).toHaveBeenCalledOnce();
      const [initMsg] = worker.postMessage.mock.calls[0];
      expect(initMsg).toEqual({
        type: 'init',
        meshData: mesh,
        config: { numSubsteps: 4 },
      });

      worker.emitMessage({ type: 'ready' });

      await expect(initPromise).resolves.toBeUndefined();
    });

    it('wires onmessage + onerror on the new worker before posting init', () => {
      const { worker } = stubWorkerGlobal();
      const client = new ClothWorkerClient();

      void client.init(makeMesh());

      // Both handlers must be assigned for emitMessage / emitError to do
      // anything useful — sanity check the bridge actually wired them.
      expect(worker.onmessage).toBeInstanceOf(Function);
      expect(worker.onerror).toBeInstanceOf(Function);
    });
  });

  // ── Contract #2 — initMultiPiece lifecycle ──────────────────────────────
  describe('initMultiPiece lifecycle (#2)', () => {
    it('posts an initMultiPiece message with pieces + seams and resolves on "ready"', async () => {
      const { worker } = stubWorkerGlobal();
      const client = new ClothWorkerClient();

      const piece = {
        pieceId: 'p0',
        vertices: new Float32Array([0, 0, 0,  1, 0, 0,  0, 1, 0]),
        triIds: new Int32Array([0, 1, 2]),
        outline: [{ type: 'line', values: [0, 0, 1, 0] }],
      };
      const seam = {
        id: 's0',
        pieceAId: 'p0',
        pieceAEdgeName: 'right',
        pieceBId: 'p1',
        pieceBEdgeName: 'left',
        type: 'standard' as const,
        tension: 100,
        strength: 1.0,
        active: true,
        taped: false,
      };

      const initPromise = client.initMultiPiece([piece], [seam]);

      expect(worker.postMessage).toHaveBeenCalledOnce();
      const [msg] = worker.postMessage.mock.calls[0];
      expect(msg.type).toBe('initMultiPiece');
      expect(msg.pieces).toEqual([piece]);
      expect(msg.seams).toEqual([seam]);

      worker.emitMessage({ type: 'ready' });
      await expect(initPromise).resolves.toBeUndefined();
    });
  });

  // ── Contract #3 — init error path (postMessage 'error') ─────────────────
  describe('init error path (#3)', () => {
    it('rejects init Promise + fires onError on worker "error" message', async () => {
      const { worker } = stubWorkerGlobal();
      const client = new ClothWorkerClient();
      const onError = vi.fn();
      client.onError = onError;

      const initPromise = client.init(makeMesh());

      worker.emitMessage({ type: 'error', message: 'solver build failed' });

      await expect(initPromise).rejects.toThrow(/solver build failed/);
      expect(onError).toHaveBeenCalledOnce();
      expect(onError).toHaveBeenCalledWith('solver build failed');
    });

    it('un mensaje "error" del worker deja tier:runtime-error{cpu-worker} en el ring', async () => {
      const { worker } = stubWorkerGlobal();
      const client = new ClothWorkerClient();
      const initPromise = client.init(makeMesh());

      worker.emitMessage({ type: 'error', message: 'Solver not initialized' });

      await expect(initPromise).rejects.toThrow('Solver not initialized');
      expect(getSolverEvents()).toEqual([
        expect.objectContaining({
          kind: 'tier:runtime-error',
          data: { tier: 'cpu-worker', code: 'worker_error', message: 'Solver not initialized' },
        }),
      ]);
    });
  });

  // ── Contract #4 — DOM 'error' event on the worker ───────────────────────
  describe('worker DOM "error" event (#4)', () => {
    it('rejects init Promise + fires onError when the worker emits an error event', async () => {
      const { worker } = stubWorkerGlobal();
      const client = new ClothWorkerClient();
      const onError = vi.fn();
      client.onError = onError;

      const initPromise = client.init(makeMesh());

      const { preventDefault } = worker.emitError('Worker script failed to load');

      // The bridge calls `e.preventDefault()` before reading `.message`.
      expect(preventDefault).toHaveBeenCalledOnce();
      await expect(initPromise).rejects.toThrow(/Worker script failed to load/);
      expect(onError).toHaveBeenCalledOnce();
      expect(onError).toHaveBeenCalledWith('Worker script failed to load');
    });

    it('falls back to "Cloth worker crashed" when the error event has no message', async () => {
      const { worker } = stubWorkerGlobal();
      const client = new ClothWorkerClient();
      const onError = vi.fn();
      client.onError = onError;

      const initPromise = client.init(makeMesh());

      worker.emitError('');

      await expect(initPromise).rejects.toThrow(/Cloth worker crashed/);
      expect(onError).toHaveBeenCalledWith('Cloth worker crashed');
    });
  });

  // ── Contract #5 — frame callback ────────────────────────────────────────
  describe('frame callback (#5)', () => {
    it('invokes onFrame with typed-array positions, numParticles and triIds', async () => {
      const { worker } = stubWorkerGlobal();
      const client = new ClothWorkerClient();
      const onFrame = vi.fn();
      client.onFrame = onFrame;

      const initPromise = client.init(makeMesh());
      worker.emitMessage({ type: 'ready' });
      await initPromise;

      const positions = new Float32Array([0.1, 0.2, 0.3,  0.4, 0.5, 0.6]);
      const triIds = new Int32Array([0, 1, 2]);
      worker.emitMessage({ type: 'frame', positions, numParticles: 2, triIds });

      expect(onFrame).toHaveBeenCalledOnce();
      // The bridge passes the typed-array references straight through —
      // no copy. Identity check matters because callers may transfer
      // these buffers, and a hidden copy would break that contract.
      const [posArg, numArg, triArg] = onFrame.mock.calls[0];
      expect(posArg).toBe(positions);
      expect(numArg).toBe(2);
      expect(triArg).toBe(triIds);
    });

    it('does not throw when onFrame is unset (optional chaining contract)', async () => {
      const { worker } = stubWorkerGlobal();
      const client = new ClothWorkerClient();

      const initPromise = client.init(makeMesh());
      worker.emitMessage({ type: 'ready' });
      await initPromise;

      expect(() => {
        worker.emitMessage({
          type: 'frame',
          positions: new Float32Array(3),
          numParticles: 1,
          triIds: new Int32Array([0]),
        });
      }).not.toThrow();
    });
  });

  // ── Contract #6 — start / stop / reset / step lifecycle ─────────────────
  describe('control lifecycle (#6)', () => {
    it('posts start/stop/reset/step messages and tracks isRunning', () => {
      const { worker } = stubWorkerGlobal();
      const client = new ClothWorkerClient();
      void client.init(makeMesh());
      worker.postMessage.mockClear();

      expect(client.isRunning).toBe(false);

      client.start();
      expect(client.isRunning).toBe(true);
      expect(worker.postMessage).toHaveBeenLastCalledWith({ type: 'start' });

      client.stop();
      expect(client.isRunning).toBe(false);
      expect(worker.postMessage).toHaveBeenLastCalledWith({ type: 'stop' });

      client.reset();
      expect(client.isRunning).toBe(false);
      expect(worker.postMessage).toHaveBeenLastCalledWith({ type: 'reset' });

      client.step();
      expect(worker.postMessage).toHaveBeenLastCalledWith({ type: 'step' });
    });

    it('clears isRunning when worker emits "stopped"', () => {
      const { worker } = stubWorkerGlobal();
      const client = new ClothWorkerClient();
      void client.init(makeMesh());

      client.start();
      expect(client.isRunning).toBe(true);

      worker.emitMessage({ type: 'stopped' });
      expect(client.isRunning).toBe(false);
    });
  });

  // ── Contract #7 — snapshot lifecycle ────────────────────────────────────
  describe('snapshot lifecycle (#7)', () => {
    async function initialized() {
      const { worker } = stubWorkerGlobal();
      const client = new ClothWorkerClient();
      const p = client.init(makeMesh());
      worker.emitMessage({ type: 'ready' });
      await p;
      worker.postMessage.mockClear();
      return { worker, client };
    }

    it('save / restore / delete each post the right type + id', async () => {
      const { worker, client } = await initialized();

      client.saveSnapshot('snap-1');
      client.restoreSnapshot('snap-1');
      client.deleteSnapshot('snap-1');

      expect(worker.postMessage).toHaveBeenCalledTimes(3);
      expect(worker.postMessage.mock.calls.map((c) => c[0])).toEqual([
        { type: 'saveSnapshot', id: 'snap-1' },
        { type: 'restoreSnapshot', id: 'snap-1' },
        { type: 'deleteSnapshot', id: 'snap-1' },
      ]);
    });

    it('routes snapshot ack messages to onSnapshotSaved / Restored / Deleted', async () => {
      const { worker, client } = await initialized();
      const onSaved = vi.fn();
      const onRestored = vi.fn();
      const onDeleted = vi.fn();
      client.onSnapshotSaved = onSaved;
      client.onSnapshotRestored = onRestored;
      client.onSnapshotDeleted = onDeleted;

      worker.emitMessage({ type: 'snapshotSaved', id: 'snap-1', particleCount: 42 });
      worker.emitMessage({ type: 'snapshotRestored', id: 'snap-1' });
      worker.emitMessage({ type: 'snapshotDeleted', id: 'snap-1' });

      expect(onSaved).toHaveBeenCalledWith('snap-1', 42);
      expect(onRestored).toHaveBeenCalledWith('snap-1');
      expect(onDeleted).toHaveBeenCalledWith('snap-1');
    });
  });

  // ── Contract #8 — transferable buffers (zero-copy paths) ────────────────
  describe('transferable buffers (#8)', () => {
    it('setCollisionMesh transfers vertices + normals buffers', () => {
      const { worker } = stubWorkerGlobal();
      const client = new ClothWorkerClient();
      void client.init(makeMesh());
      worker.postMessage.mockClear();

      const mesh = makeCollisionMesh();
      client.setCollisionMesh(mesh);

      expect(worker.postMessage).toHaveBeenCalledOnce();
      const [msg, transferList] = worker.postMessage.mock.calls[0];
      expect(msg).toEqual({ type: 'setCollisionMesh', mesh });
      expect(transferList).toEqual([mesh.vertices.buffer, mesh.normals.buffer]);
    });

    it('setCollisionBodies transfers each body\'s vertices + normals in order', () => {
      const { worker } = stubWorkerGlobal();
      const client = new ClothWorkerClient();
      void client.init(makeMesh());
      worker.postMessage.mockClear();

      const bodies = [
        { id: 'b1', mesh: makeCollisionMesh(), friction: 0.3, margin: 0.005 },
        { id: 'b2', mesh: makeCollisionMesh(), friction: 0.5, margin: 0.010 },
      ];
      client.setCollisionBodies(bodies);

      expect(worker.postMessage).toHaveBeenCalledOnce();
      const [msg, transferList] = worker.postMessage.mock.calls[0];
      expect(msg.type).toBe('setCollisionBodies');
      expect(msg.bodies).toHaveLength(2);
      expect(msg.bodies[0]).toMatchObject({ id: 'b1', friction: 0.3, margin: 0.005 });
      expect(msg.bodies[1]).toMatchObject({ id: 'b2', friction: 0.5, margin: 0.010 });
      // Transferables must appear in the same order they were enumerated
      // (b1.vertices, b1.normals, b2.vertices, b2.normals) so the worker
      // can reattach them to the right body.
      expect(transferList).toEqual([
        bodies[0].mesh.vertices.buffer,
        bodies[0].mesh.normals.buffer,
        bodies[1].mesh.vertices.buffer,
        bodies[1].mesh.normals.buffer,
      ]);
    });

    it('updateCollisionBody transfers the new mesh buffers', () => {
      const { worker } = stubWorkerGlobal();
      const client = new ClothWorkerClient();
      void client.init(makeMesh());
      worker.postMessage.mockClear();

      const mesh = makeCollisionMesh();
      client.updateCollisionBody({ id: 'b1', mesh, friction: 0.4, margin: 0.008 });

      expect(worker.postMessage).toHaveBeenCalledOnce();
      const [msg, transferList] = worker.postMessage.mock.calls[0];
      expect(msg).toEqual({
        type: 'updateCollisionBody',
        id: 'b1',
        mesh,
        friction: 0.4,
        margin: 0.008,
      });
      expect(transferList).toEqual([mesh.vertices.buffer, mesh.normals.buffer]);
    });

    it('updateConstraints transfers the restLengths buffer', () => {
      const { worker } = stubWorkerGlobal();
      const client = new ClothWorkerClient();
      void client.init(makeMesh());
      worker.postMessage.mockClear();

      const restLengths = new Float32Array([1.0, 1.5, 2.0]);
      client.updateConstraints(restLengths);

      expect(worker.postMessage).toHaveBeenCalledOnce();
      const [msg, transferList] = worker.postMessage.mock.calls[0];
      expect(msg).toEqual({ type: 'updateConstraints', restLengths });
      expect(transferList).toEqual([restLengths.buffer]);
    });
  });

  // ── Contract #9 — pin / unpin single-arg shape (A6 / #684 caveat) ───────
  describe('pin/unpin single-arg shape (#9)', () => {
    it('pinParticle / unpinParticle post {type, index} — NOT a batch setPins shape', () => {
      // Documents the CPU-vs-WASM divergence ratified in A6 #684:
      // CPU is freeze-at-current (no position), WASM is batched positional.
      // The CPU bridge must keep the single-arg shape so consumers that
      // dispatch per-tier can rely on the contract.
      const { worker } = stubWorkerGlobal();
      const client = new ClothWorkerClient();
      void client.init(makeMesh());
      worker.postMessage.mockClear();

      client.pinParticle(5);
      client.unpinParticle(5);

      expect(worker.postMessage).toHaveBeenCalledTimes(2);
      expect(worker.postMessage.mock.calls.map((c) => c[0])).toEqual([
        { type: 'pinParticle', index: 5 },
        { type: 'unpinParticle', index: 5 },
      ]);
    });
  });

  // ── Contract #10 — edge data round-trip ─────────────────────────────────
  describe('edge data round-trip (#10)', () => {
    it('requestEdgeData posts "getEdgeData" and routes "edgeData" to onEdgeData', async () => {
      const { worker } = stubWorkerGlobal();
      const client = new ClothWorkerClient();
      const onEdgeData = vi.fn();
      client.onEdgeData = onEdgeData;

      const initPromise = client.init(makeMesh());
      worker.emitMessage({ type: 'ready' });
      await initPromise;
      worker.postMessage.mockClear();

      client.requestEdgeData();
      expect(worker.postMessage).toHaveBeenLastCalledWith({ type: 'getEdgeData' });

      const stretchingIds = new Int32Array([0, 1, 1, 2]);
      const stretchingLengths = new Float32Array([1.0, 1.414]);
      worker.emitMessage({ type: 'edgeData', stretchingIds, stretchingLengths });

      expect(onEdgeData).toHaveBeenCalledOnce();
      // Identity check: bridge passes typed arrays straight through.
      expect(onEdgeData.mock.calls[0][0]).toBe(stretchingIds);
      expect(onEdgeData.mock.calls[0][1]).toBe(stretchingLengths);
    });
  });

  // ── Contract #11 — dispose during init ──────────────────────────────────
  describe('dispose during init (#11)', () => {
    it('terminates the worker and leaves the init Promise pending', async () => {
      const { worker } = stubWorkerGlobal();
      const client = new ClothWorkerClient();

      const initPromise = client.init(makeMesh());
      expect(worker.postMessage).toHaveBeenCalledOnce();
      expect(worker.postMessage.mock.calls[0][0].type).toBe('init');

      client.dispose();

      expect(worker.terminate).toHaveBeenCalledOnce();
      expect(client.isRunning).toBe(false);

      // The init Promise neither resolves nor rejects: dispose() nulls
      // readyResolve + readyReject. A pending Promise is not an unhandled
      // rejection — node only flags Promises that *settle* to rejected
      // without a handler. We attach handlers and verify neither fires
      // within a couple of microtask drains.
      let settled: 'resolved' | 'rejected' | null = null;
      initPromise.then(
        () => {
          settled = 'resolved';
        },
        () => {
          settled = 'rejected';
        },
      );
      await Promise.resolve();
      await Promise.resolve();
      expect(settled).toBeNull();
    });

    it('init() after dispose() spawns a fresh worker', () => {
      const { ctor } = stubWorkerGlobal();
      const client = new ClothWorkerClient();

      void client.init(makeMesh());
      expect(ctor).toHaveBeenCalledTimes(1);

      client.dispose();

      void client.init(makeMesh());
      expect(ctor).toHaveBeenCalledTimes(2);
    });
  });
});
