/**
 * Fake Web Worker stand-in for `WasmSolverClient` unit tests.
 *
 * Covers only the surface the client actually calls — `postMessage`,
 * `terminate`, and event-listener routing for `'message'` + `'error'`.
 * Extending these with new methods is fine, but every addition should match
 * a real call site so tests fail loudly if the contract drifts.
 *
 * Sketch ratified in #761 (companion to #762's `fakeDevice.ts` for the GPU tier).
 */
import { vi } from 'vitest';

/**
 * Minimal `Worker` stand-in. Extends `EventTarget` so the bridge's
 * `addEventListener('message', ...)` / `addEventListener('error', ...)`
 * route to native `dispatchEvent`; tests drive incoming worker messages
 * via `emitMessage` / `emitError`.
 *
 * `postMessage` and `terminate` are `vi.fn()` so call args + counts are
 * inspectable per assertion.
 */
export class FakeWorker extends EventTarget {
  postMessage = vi.fn();
  terminate = vi.fn();

  /** Drive a `'message'` event to the bridge's `handleMessage`. */
  emitMessage(data: unknown): void {
    this.dispatchEvent(new MessageEvent('message', { data }));
  }

  /**
   * Drive a DOM `'error'` event to the bridge's error handler. The bridge
   * reads `e.message` and calls `e.preventDefault()`; both are satisfied by
   * `ErrorEvent`. Falls back to a generic `Event` with `.message` attached
   * for environments where `ErrorEvent` is unavailable.
   */
  emitError(message: string): void {
    let event: Event;
    try {
      event = new ErrorEvent('error', { message, cancelable: true });
    } catch {
      event = Object.assign(new Event('error', { cancelable: true }), { message });
    }
    this.dispatchEvent(event);
  }
}

/**
 * Stub `globalThis.Worker` so `new Worker(url, opts)` inside the bridge
 * returns a captured `FakeWorker` instance. Caller is responsible for
 * `vi.unstubAllGlobals()` (or `restore()`) in `afterEach`.
 *
 * The stub is a class (not an arrow function) because the bridge invokes
 * it with `new Worker(...)`; arrow functions are not constructible.
 * Returning an object from a constructor overrides the implicit `this`,
 * so each `new Worker(...)` evaluates to the same `FakeWorker` instance
 * — sufficient for tests, which only construct the bridge once per case.
 */
export function stubWorkerGlobal(): { worker: FakeWorker; ctor: ReturnType<typeof vi.fn>; restore: () => void } {
  const worker = new FakeWorker();
  const ctor = vi.fn(function WorkerStub(this: unknown) {
    return worker;
  });
  vi.stubGlobal('Worker', ctor);
  return {
    worker,
    ctor,
    restore: () => vi.unstubAllGlobals(),
  };
}
