import { describe, it, expect, vi } from 'vitest';
import { WasmSolverClient } from '../wasmSolverClient';

/**
 * Contract test for #749 — setPins boundary.
 *
 * Verifies that `WasmSolverClient.setPins`:
 *   1. Sends typed arrays directly via postMessage (no Array.from copy).
 *   2. Includes the typed-array buffers in the transferList for zero-copy
 *      handoff to the worker.
 *
 * This is intentionally narrow: the issue (#749) and audit charter ask for a
 * minimal contract test, not full coverage of WasmSolverClient. The broader
 * client coverage track is #761 / #T-1.
 */
describe('WasmSolverClient.setPins (#749)', () => {
  it('passes typed arrays directly to the worker with transferList (no Array.from)', () => {
    const postMessage = vi.fn();
    const client = new WasmSolverClient();
    // Inject a mock worker — bypasses the real Worker constructor that
    // would otherwise need an `initMultiPiece` round-trip. The class field
    // is private; the cast is the standard test escape hatch.
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
