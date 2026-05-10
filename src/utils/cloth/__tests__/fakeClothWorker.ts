/**
 * Fake Web Worker stand-in for `ClothWorkerClient` unit tests.
 *
 * Companion to `wasm/__tests__/fakeWorker.ts` (#761/#774) and
 * `gpu/__tests__/fakeDevice.ts` (#762/#773), but tailored to the CPU
 * bridge's surface, which differs in two subtle ways:
 *
 *   1. The bridge assigns `worker.onmessage` / `worker.onerror` directly
 *      (`clothWorkerClient.ts:77,81`), it does NOT call `addEventListener`.
 *      So driving an event via `EventTarget#dispatchEvent` would not
 *      invoke the bridge's handler — `emitMessage` / `emitError` here
 *      invoke the assigned property functions directly.
 *   2. The bridge's error handler reads `err.message` and calls
 *      `err.preventDefault()`. The `emitError` helper passes a plain
 *      object that satisfies both — no `ErrorEvent` constructor needed.
 */
import { vi } from 'vitest';

/**
 * Minimal `Worker` stand-in for `ClothWorkerClient`.
 *
 * `postMessage` and `terminate` are `vi.fn()` so call args + counts are
 * inspectable per assertion. `onmessage` / `onerror` are bridge-assigned
 * properties; `emitMessage` / `emitError` invoke whichever handler is
 * currently set.
 */
export class FakeClothWorker {
  postMessage = vi.fn();
  terminate = vi.fn();
  onmessage: ((event: MessageEvent<unknown>) => void) | null = null;
  onerror: ((event: { message: string; preventDefault: () => void }) => void) | null = null;

  /** Drive a message into the bridge's `onmessage` handler. */
  emitMessage(data: unknown): void {
    this.onmessage?.({ data } as MessageEvent<unknown>);
  }

  /**
   * Drive an error into the bridge's `onerror` handler. The bridge calls
   * `e.preventDefault()` and reads `e.message`; both are provided here.
   * `preventDefault` is a `vi.fn()` so tests can assert it was called.
   */
  emitError(message: string): { preventDefault: ReturnType<typeof vi.fn> } {
    const preventDefault = vi.fn();
    this.onerror?.({ message, preventDefault });
    return { preventDefault };
  }
}

/**
 * Stub `globalThis.Worker` so `new Worker(url, opts)` inside the bridge
 * returns a captured `FakeClothWorker` instance. Caller is responsible
 * for `vi.unstubAllGlobals()` (or `restore()`) in `afterEach`.
 *
 * The stub is a regular function (not an arrow) because the bridge
 * invokes it with `new Worker(...)`; arrow functions are not
 * constructible. Returning an object from a constructor overrides the
 * implicit `this`, so each `new Worker(...)` evaluates to the same
 * `FakeClothWorker` instance — sufficient for tests that construct the
 * bridge once per case. Tests that need multiple workers per case can
 * call `stubWorkerGlobal()` again to swap the captured instance.
 */
export function stubWorkerGlobal(): {
  worker: FakeClothWorker;
  ctor: ReturnType<typeof vi.fn>;
  restore: () => void;
} {
  const worker = new FakeClothWorker();
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
