import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

import { type PieceMeshData, WasmSolverClient } from '../wasmSolverClient';
import type { SeamInitData } from '../../clothWorker';
import { stubWorkerGlobal } from './fakeWorker';
import { clearSolverEvents, getSolverEvents } from '../../solverRuntimeTracker';

/**
 * Boundary-contract coverage for the main-thread bridge between
 * `WasmSolverClient` and the WASM Web Worker (#761 / #T-1).
 *
 * Companion to the GPU-tier suite ratified in #762/#773
 * (`gpu/__tests__/gpuSolverClient.test.ts`). The shape of the file —
 * helper module + describe-per-contract + minimal fixtures — mirrors that
 * convention; the substance is distinct (Worker postMessage vs GPUDevice
 * compute pipelines).
 *
 * Why we mock the Worker rather than load the real binary:
 *   - `wasmSolverClient.ts` constructs `new Worker(new URL('./wasmSolverWorker.ts',
 *     import.meta.url), {type: 'module'})`. jsdom does not support module
 *     workers and the WASM binary itself is not loadable from a node test.
 *   - The test surface is the *bridge*, not the worker — verifying message
 *     shape + callback dispatch is exactly what the 4 production bugs
 *     #604–#607 missed at the JS layer.
 *
 * Pre-existing narrow coverage for #749 (setPins boundary) is preserved
 * verbatim under "setPins boundary (#5 / #749)" — it satisfies contract #5
 * unchanged.
 */

/** Minimal piece — single triangle, no UVs/edges/outline. The bridge does
 *  not inspect the contents during init; the worker would, but it's mocked. */
function makePiece(id: string = 'p0'): PieceMeshData {
  return {
    pieceId: id,
    vertices: new Float32Array([0, 0, 0,  1, 0, 0,  0, 1, 0]),
    triIds: new Int32Array([0, 1, 2]),
  };
}

describe('WasmSolverClient', () => {
  let logSpy: ReturnType<typeof vi.spyOn>;
  let warnSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    // The bridge references `__BUILD_TIMESTAMP__` (Vite define) when
    // computing the cache-bust query string. vitest does not load the
    // vite.config define block, so the bare reference would be a
    // ReferenceError at runtime. Stubbing on globalThis lets the free
    // identifier resolve through the global scope chain.
    vi.stubGlobal('__BUILD_TIMESTAMP__', 'test-stamp');
    clearSolverEvents();

    // Bridge logs `[WasmSolver] Initialized in worker: ...` on every ready
    // and `[WasmSolver] Worker error: ...` on every error path. Silence
    // both globally to keep test output clean.
    logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    logSpy.mockRestore();
    warnSpy.mockRestore();
  });

  // ── Contract #1 — init lifecycle ────────────────────────────────────────
  describe('init lifecycle (#1)', () => {
    it('posts an init message and resolves + fires onReady on worker "ready"', async () => {
      const { worker } = stubWorkerGlobal();
      const client = new WasmSolverClient();
      const onReady = vi.fn();
      client.onReady = onReady;

      const piece = makePiece();
      const initPromise = client.initMultiPiece([piece]);

      // The Promise executor runs synchronously, so postMessage('init')
      // is observable before any await.
      expect(worker.postMessage).toHaveBeenCalledOnce();
      const [initMsg] = worker.postMessage.mock.calls[0];
      expect(initMsg).toMatchObject({
        type: 'init',
        baseUrl: expect.any(String),
        wasmVersion: 'test-stamp',
      });
      expect(initMsg.pieces).toEqual([piece]);

      // Worker emits 'ready' with particle count → init resolves, onReady fires.
      worker.emitMessage({ type: 'ready', numParticles: 3 });

      await expect(initPromise).resolves.toBeUndefined();
      expect(onReady).toHaveBeenCalledOnce();
    });
  });

  // ── Contract #2 — init error path (postMessage 'error') ─────────────────
  describe('init error path (#2)', () => {
    it('un mensaje "error" del worker deja tier:runtime-error{wasm} con su code en el ring', async () => {
      const { worker } = stubWorkerGlobal();
      const client = new WasmSolverClient();
      const initPromise = client.initMultiPiece([makePiece()]);

      worker.emitMessage({ type: 'error', code: 'wasm_memory_unavailable', message: 'WASM memory unavailable' });

      await expect(initPromise).rejects.toThrow();
      expect(getSolverEvents()).toEqual([
        expect.objectContaining({
          kind: 'tier:runtime-error',
          data: { tier: 'wasm', code: 'wasm_memory_unavailable', message: 'WASM memory unavailable' },
        }),
      ]);
    });

    it('rejects init Promise + fires onError on worker "error" message', async () => {
      const { worker } = stubWorkerGlobal();
      const client = new WasmSolverClient();
      const onError = vi.fn();
      client.onError = onError;

      const initPromise = client.initMultiPiece([makePiece()]);

      worker.emitMessage({
        type: 'error',
        code: 'wasm_memory_unavailable',
        message: 'WASM memory unavailable (stale bindings)',
      });

      await expect(initPromise).rejects.toThrow(/WASM memory unavailable/);
      expect(onError).toHaveBeenCalledOnce();
      expect(onError).toHaveBeenCalledWith('WASM memory unavailable (stale bindings)');
    });
  });

  // ── Contract #3 — frame callback ────────────────────────────────────────
  describe('frame callback (#3)', () => {
    it('invokes onFrame with the typed-array positions on "frame" message', async () => {
      const { worker } = stubWorkerGlobal();
      const client = new WasmSolverClient();
      const onFrame = vi.fn();
      client.onFrame = onFrame;

      // Frames only flow after init resolves — drive ready first.
      const initPromise = client.initMultiPiece([makePiece()]);
      worker.emitMessage({ type: 'ready', numParticles: 3 });
      await initPromise;

      const positions = new Float32Array([0.1, 0.2, 0.3, 0.4, 0.5, 0.6]);
      worker.emitMessage({ type: 'frame', positions });

      expect(onFrame).toHaveBeenCalledOnce();
      // The bridge passes the typed-array reference straight through —
      // no copy. Identity check matters because callers may mutate or
      // transfer; a hidden copy would break that contract.
      expect(onFrame.mock.calls[0][0]).toBe(positions);
    });

    it('does not invoke onFrame when the callback is not set', async () => {
      const { worker } = stubWorkerGlobal();
      const client = new WasmSolverClient();
      // No onFrame assignment — the bridge must use optional chaining.

      const initPromise = client.initMultiPiece([makePiece()]);
      worker.emitMessage({ type: 'ready', numParticles: 3 });
      await initPromise;

      // Should not throw.
      expect(() => {
        worker.emitMessage({ type: 'frame', positions: new Float32Array(3) });
      }).not.toThrow();
    });
  });

  // ── Contract #4 — snapshot lifecycle ────────────────────────────────────
  describe('snapshot lifecycle (#4)', () => {
    /**
     * Bring the bridge to post-init state and clear the init postMessage
     * call so per-test assertions on `mock.calls` stay focused on the
     * snapshot messages.
     */
    async function initialized() {
      const { worker } = stubWorkerGlobal();
      const client = new WasmSolverClient();
      const initPromise = client.initMultiPiece([makePiece()]);
      worker.emitMessage({ type: 'ready', numParticles: 3 });
      await initPromise;
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

  // ── Contract #5 — setPins boundary (preserves #749 narrow tests) ────────
  describe('setPins boundary (#5 / #749)', () => {
    it('passes typed arrays directly to the worker with transferList (no Array.from)', () => {
      const postMessage = vi.fn();
      const client = new WasmSolverClient();
      // Inject a mock worker — bypasses the real Worker constructor that
      // would otherwise need an `initMultiPiece` round-trip. The class
      // field is private; the cast is the standard test escape hatch.
      (client as unknown as { worker: { postMessage: typeof postMessage } }).worker = { postMessage };

      client.setPins([
        { vertexIndex: 5, position: [1, 2, 3] },
        { vertexIndex: 9, position: [4, 5, 6] },
      ]);

      expect(postMessage).toHaveBeenCalledOnce();
      const [msg, transferList] = postMessage.mock.calls[0];

      expect(msg.type).toBe('setPins');
      expect(msg.indices).toBeInstanceOf(Uint32Array);
      expect(msg.positions).toBeInstanceOf(Float32Array);
      expect(Array.from(msg.indices)).toEqual([5, 9]);
      expect(Array.from(msg.positions)).toEqual([1, 2, 3, 4, 5, 6]);

      expect(transferList).toEqual([msg.indices.buffer, msg.positions.buffer]);
    });

    it('sends a clearPins message and no transferList when pins is empty', () => {
      const postMessage = vi.fn();
      const client = new WasmSolverClient();
      (client as unknown as { worker: { postMessage: typeof postMessage } }).worker = { postMessage };

      client.setPins([]);

      expect(postMessage).toHaveBeenCalledOnce();
      expect(postMessage).toHaveBeenCalledWith({ type: 'clearPins' });
    });
  });

  // ── Contract #6 — dispose during init ───────────────────────────────────
  describe('dispose during init (#6)', () => {
    it('does not double-post and does not surface an unhandled rejection', async () => {
      const { worker } = stubWorkerGlobal();
      const client = new WasmSolverClient();

      const initPromise = client.initMultiPiece([makePiece()]);

      // Sanity: only the init postMessage so far.
      expect(worker.postMessage).toHaveBeenCalledOnce();
      expect(worker.postMessage.mock.calls[0][0].type).toBe('init');

      // Dispose mid-init — this posts a 'dispose' and then terminates.
      client.dispose();

      // Sequence must be exactly init then dispose — no third post.
      expect(worker.postMessage).toHaveBeenCalledTimes(2);
      expect(worker.postMessage.mock.calls.map((c) => c[0].type)).toEqual([
        'init',
        'dispose',
      ]);
      expect(worker.terminate).toHaveBeenCalledOnce();

      // The init Promise neither resolves nor rejects: dispose() nulls
      // both readyResolve and readyReject. We attach handlers and confirm
      // neither fires within a couple of microtask drains. A pending
      // Promise is not an unhandled rejection — node's tracker only
      // flags a Promise that *settles* to rejected without a handler.
      let settled: 'resolved' | 'rejected' | null = null;
      initPromise.then(
        () => {
          settled = 'resolved';
        },
        () => {
          settled = 'rejected';
        },
      );
      // Drain microtasks.
      await Promise.resolve();
      await Promise.resolve();
      expect(settled).toBeNull();
    });
  });

  // ── Contract #7 — DOM 'error' event on the worker ──────────────────────
  describe('worker DOM "error" event (#7)', () => {
    it('rejects init Promise + fires onError when the worker emits an error event', async () => {
      const { worker } = stubWorkerGlobal();
      const client = new WasmSolverClient();
      const onError = vi.fn();
      client.onError = onError;

      const initPromise = client.initMultiPiece([makePiece()]);

      worker.emitError('Worker script failed to load');

      await expect(initPromise).rejects.toThrow(/Worker script failed to load/);
      expect(onError).toHaveBeenCalledOnce();
      expect(onError).toHaveBeenCalledWith('Worker script failed to load');
    });

    it('falls back to "Wasm worker crashed" when the error event has no message', async () => {
      const { worker } = stubWorkerGlobal();
      const client = new WasmSolverClient();
      const onError = vi.fn();
      client.onError = onError;

      const initPromise = client.initMultiPiece([makePiece()]);

      worker.emitError('');

      await expect(initPromise).rejects.toThrow(/Wasm worker crashed/);
      expect(onError).toHaveBeenCalledWith('Wasm worker crashed');
    });
  });

  // ── Contract #8 — seam forwarding at init (BP-1 / Fase 1) ───────────────
  describe('init seam forwarding (#8 / BP-1)', () => {
    const seams: SeamInitData[] = [
      {
        id: 'seam-1',
        pieceAId: 'a',
        pieceAEdgeName: 'rightEdge',
        pieceBId: 'b',
        pieceBEdgeName: 'leftEdge',
        type: 'standard',
        tension: 100,
        strength: 1.0,
        active: true,
        taped: false,
      },
    ];

    it('forwards seams verbatim in the init message', async () => {
      const { worker } = stubWorkerGlobal();
      const client = new WasmSolverClient();

      const initPromise = client.initMultiPiece([makePiece('a'), makePiece('b')], seams);

      expect(worker.postMessage).toHaveBeenCalledOnce();
      const [initMsg] = worker.postMessage.mock.calls[0];
      expect(initMsg.type).toBe('init');
      // Reference pass-through: the bridge must not copy or filter — the
      // worker is the single owner of constraint construction
      // (buildSeamConstraints → set_seams_with_compliance, BUG-3 #606).
      expect(initMsg.seams).toBe(seams);

      worker.emitMessage({ type: 'ready', numParticles: 6 });
      await expect(initPromise).resolves.toBeUndefined();
    });

    it('defaults to zero seams when the argument is omitted — the BP-1 footgun', async () => {
      // This default is what silently disabled sewing on the entire WASM
      // tier: the production callsite (useSimulationLifecycle, marker
      // `─── WASM XPBD ───`) forgot the argument and no signal fired.
      // Pinned here so the default's existence is a documented contract,
      // not an accident. Observability for the 0-constraint case lands in
      // Fase 4 (capability flag + toast).
      const { worker } = stubWorkerGlobal();
      const client = new WasmSolverClient();

      const initPromise = client.initMultiPiece([makePiece()]);

      const [initMsg] = worker.postMessage.mock.calls[0];
      expect(initMsg.seams).toEqual([]);

      worker.emitMessage({ type: 'ready', numParticles: 3 });
      await expect(initPromise).resolves.toBeUndefined();
    });
  });
});
