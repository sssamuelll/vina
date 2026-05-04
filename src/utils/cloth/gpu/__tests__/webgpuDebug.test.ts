/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  withErrorScope,
  attachUncapturedErrorListener,
  instrumentShaderCapture,
  installEarlyDeviceHook,
} from '../webgpuDebug';

// ─── Mock device factory ───────────────────────────────────────────────────

interface MockDeviceState {
  pushedScopes: GPUErrorFilter[];
  poppedResults: Array<GPUError | null>;
  listeners: Map<string, EventListener[]>;
  shaderModulesCreated: Array<{ label?: string; code: string }>;
}

function createMockDevice(poppedResults: Array<GPUError | null> = []): {
  device: GPUDevice;
  state: MockDeviceState;
} {
  const state: MockDeviceState = {
    pushedScopes: [],
    poppedResults: [...poppedResults],
    listeners: new Map(),
    shaderModulesCreated: [],
  };

  const device = {
    pushErrorScope: vi.fn((filter: GPUErrorFilter) => {
      state.pushedScopes.push(filter);
    }),
    popErrorScope: vi.fn(async () => {
      // FIFO drain matches LIFO push if caller pre-arranges results in pop order.
      return state.poppedResults.shift() ?? null;
    }),
    addEventListener: vi.fn((type: string, listener: EventListener) => {
      const list = state.listeners.get(type) ?? [];
      list.push(listener);
      state.listeners.set(type, list);
    }),
    createShaderModule: vi.fn((descriptor: GPUShaderModuleDescriptor) => {
      state.shaderModulesCreated.push({ label: descriptor.label, code: descriptor.code });
      return {
        getCompilationInfo: () => Promise.resolve({ messages: [] }),
      } as unknown as GPUShaderModule;
    }),
  } as unknown as GPUDevice;

  return { device, state };
}

beforeEach(() => {
  if (typeof window !== 'undefined') {
    delete window.__OPENCLO_SHADERS__;
  }
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ─── withErrorScope ────────────────────────────────────────────────────────

describe('withErrorScope', () => {
  it('returns the result of fn', async () => {
    const { device } = createMockDevice();
    const result = await withErrorScope(device, 'test', () => 42);
    expect(result).toBe(42);
  });

  it('awaits an async fn', async () => {
    const { device } = createMockDevice();
    const result = await withErrorScope(device, 'test', async () => {
      await Promise.resolve();
      return 'done';
    });
    expect(result).toBe('done');
  });

  it('pushes 3 error scopes in order: validation → oom → internal', async () => {
    const { device, state } = createMockDevice();
    await withErrorScope(device, 'test', () => undefined);
    expect(state.pushedScopes).toEqual(['validation', 'out-of-memory', 'internal']);
  });

  it('pops 3 scopes after fn completes', async () => {
    const { device } = createMockDevice();
    await withErrorScope(device, 'test', () => undefined);
    expect(device.popErrorScope).toHaveBeenCalledTimes(3);
  });

  it('pops scopes even when fn throws', async () => {
    const { device } = createMockDevice();
    await expect(
      withErrorScope(device, 'test', () => { throw new Error('boom'); }),
    ).rejects.toThrow('boom');
    expect(device.popErrorScope).toHaveBeenCalledTimes(3);
  });

  it('logs validation error via console.error when popErrorScope returns one', async () => {
    const validationErr = { message: 'binding count exceeded' } as GPUError;
    const { device } = createMockDevice([
      null,           // internal pop (innermost)
      null,           // oom pop
      validationErr,  // validation pop (outermost)
    ]);
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    await withErrorScope(device, 'gpuSolver.init', () => undefined);

    expect(errorSpy).toHaveBeenCalledWith(
      expect.stringContaining('[WebGPU validation] gpuSolver.init: binding count exceeded'),
    );
  });

  it('logs all three error types when all scopes capture errors', async () => {
    const { device } = createMockDevice([
      { message: 'internal-err' } as GPUError,
      { message: 'oom-err' } as GPUError,
      { message: 'validation-err' } as GPUError,
    ]);
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    await withErrorScope(device, 'lbl', () => undefined);

    const calls = errorSpy.mock.calls.map((c) => c[0] as string);
    expect(calls.some((c) => c.includes('[WebGPU validation] lbl: validation-err'))).toBe(true);
    expect(calls.some((c) => c.includes('[WebGPU OOM] lbl: oom-err'))).toBe(true);
    expect(calls.some((c) => c.includes('[WebGPU internal] lbl: internal-err'))).toBe(true);
  });

  it('does not log when no errors occur', async () => {
    const { device } = createMockDevice([null, null, null]);
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    await withErrorScope(device, 'clean', () => undefined);
    expect(errorSpy).not.toHaveBeenCalled();
  });

  it('still issues all 3 pops when one popErrorScope rejects (no scope leak)', async () => {
    const { device } = createMockDevice();
    let popCount = 0;
    // 1st pop (internal, innermost): rejects — simulates device-lost mid-fn.
    // 2nd pop (oom): resolves with a captured error.
    // 3rd pop (validation): resolves with a captured error.
    device.popErrorScope = vi.fn(async () => {
      popCount++;
      if (popCount === 1) throw new Error('device lost');
      if (popCount === 2) return { message: 'oom-err' } as GPUError;
      return { message: 'validation-err' } as GPUError;
    });
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    // Should resolve cleanly — withErrorScope must not propagate the pop rejection.
    await withErrorScope(device, 'leaky', () => undefined);

    expect(popCount).toBe(3);
    const calls = errorSpy.mock.calls.map((c) => c[0] as string);
    expect(calls.some((c) => c.includes('[WebGPU OOM] leaky: oom-err'))).toBe(true);
    expect(calls.some((c) => c.includes('[WebGPU validation] leaky: validation-err'))).toBe(true);
  });
});

// ─── attachUncapturedErrorListener ─────────────────────────────────────────

describe('attachUncapturedErrorListener', () => {
  it('adds an uncapturederror listener on first call', () => {
    const { device, state } = createMockDevice();
    attachUncapturedErrorListener(device);
    expect(state.listeners.get('uncapturederror')?.length).toBe(1);
  });

  it('is idempotent — second call does not add a duplicate listener', () => {
    const { device, state } = createMockDevice();
    attachUncapturedErrorListener(device);
    attachUncapturedErrorListener(device);
    expect(state.listeners.get('uncapturederror')?.length).toBe(1);
  });

  it('logs error.message with [WebGPU uncaptured] prefix when listener fires', () => {
    const { device, state } = createMockDevice();
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    attachUncapturedErrorListener(device);

    const listener = state.listeners.get('uncapturederror')![0];
    const fakeEvent = { error: { message: 'kernel exploded' } } as GPUUncapturedErrorEvent;
    listener(fakeEvent as unknown as Event);

    expect(errorSpy).toHaveBeenCalledWith('[WebGPU uncaptured] kernel exploded');
  });
});

// ─── instrumentShaderCapture ───────────────────────────────────────────────

describe('instrumentShaderCapture', () => {
  it('initializes window.__OPENCLO_SHADERS__ as a Map', () => {
    const { device } = createMockDevice();
    instrumentShaderCapture(device);
    expect(window.__OPENCLO_SHADERS__).toBeInstanceOf(Map);
  });

  it('captures shader source under its label', () => {
    const { device } = createMockDevice();
    instrumentShaderCapture(device);

    device.createShaderModule({ label: 'cloth_module', code: '@compute fn main() {}' });

    expect(window.__OPENCLO_SHADERS__!.get('cloth_module')).toBe('@compute fn main() {}');
  });

  it('falls back to unlabeled_N for shaders without a label', () => {
    const { device } = createMockDevice();
    instrumentShaderCapture(device);

    device.createShaderModule({ code: 'wgsl1' });
    device.createShaderModule({ code: 'wgsl2' });

    expect(window.__OPENCLO_SHADERS__!.get('unlabeled_0')).toBe('wgsl1');
    expect(window.__OPENCLO_SHADERS__!.get('unlabeled_1')).toBe('wgsl2');
  });

  it('disambiguates duplicate labels with a #N suffix', () => {
    const { device } = createMockDevice();
    instrumentShaderCapture(device);

    device.createShaderModule({ label: 'shared', code: 'a' });
    device.createShaderModule({ label: 'shared', code: 'b' });

    expect(window.__OPENCLO_SHADERS__!.get('shared')).toBe('a');
    expect(window.__OPENCLO_SHADERS__!.get('shared#1')).toBe('b');
  });

  it('still calls the original createShaderModule and returns its result', () => {
    const { device, state } = createMockDevice();
    instrumentShaderCapture(device);

    const result = device.createShaderModule({ label: 'x', code: 'src' });

    expect(state.shaderModulesCreated).toEqual([{ label: 'x', code: 'src' }]);
    expect(result).toBeDefined();
  });

  it('is idempotent — second call does not re-patch', () => {
    const { device } = createMockDevice();
    instrumentShaderCapture(device);
    const firstPatched = device.createShaderModule;
    instrumentShaderCapture(device);
    const secondPatched = device.createShaderModule;
    expect(secondPatched).toBe(firstPatched);
  });

  it('does not leave a phantom entry when original createShaderModule throws', () => {
    const { device } = createMockDevice();
    // Capture the underlying mock before patching so we can mutate its impl.
    const originalMock = device.createShaderModule as ReturnType<typeof vi.fn>;
    instrumentShaderCapture(device);

    // Bound `original` inside the patch still calls the same vi.fn — changing
    // its impl propagates because bind() doesn't snapshot the implementation.
    originalMock.mockImplementationOnce(() => {
      throw new Error('invalid descriptor');
    });

    expect(() => {
      device.createShaderModule({ label: 'broken', code: 'invalid wgsl' });
    }).toThrow('invalid descriptor');

    expect(window.__OPENCLO_SHADERS__!.has('broken')).toBe(false);
  });
});

// ─── installEarlyDeviceHook ────────────────────────────────────────────────

describe('installEarlyDeviceHook', () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let originalGPUAdapter: any;

  beforeEach(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    originalGPUAdapter = (globalThis as any).GPUAdapter;
  });

  afterEach(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (globalThis as any).GPUAdapter = originalGPUAdapter;
  });

  it('is a no-op when GPUAdapter is undefined (non-WebGPU env)', () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    delete (globalThis as any).GPUAdapter;
    expect(() => installEarlyDeviceHook()).not.toThrow();
  });

  it('wraps requestDevice so returned devices are auto-instrumented', async () => {
    const { device: mockDevice } = createMockDevice();
    class FakeAdapter {
      async requestDevice(): Promise<GPUDevice> {
        return mockDevice;
      }
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (globalThis as any).GPUAdapter = FakeAdapter;

    installEarlyDeviceHook();

    const adapter = new FakeAdapter();
    const device = await adapter.requestDevice();

    // Auto-instrumented: shader capture installed (Map exists, listener attached).
    expect(window.__OPENCLO_SHADERS__).toBeInstanceOf(Map);
    // The device's createShaderModule should be patched (different identity).
    device.createShaderModule({ label: 'auto', code: 'wgsl_auto' });
    expect(window.__OPENCLO_SHADERS__!.get('auto')).toBe('wgsl_auto');
  });

  it('is idempotent — second call leaves prototype intact', () => {
    class FakeAdapter {
      async requestDevice(): Promise<GPUDevice> {
        return null as unknown as GPUDevice;
      }
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (globalThis as any).GPUAdapter = FakeAdapter;

    installEarlyDeviceHook();
    const firstWrapped = FakeAdapter.prototype.requestDevice;
    installEarlyDeviceHook();
    const secondWrapped = FakeAdapter.prototype.requestDevice;
    expect(secondWrapped).toBe(firstWrapped);
  });

  it('isolates instrumentation throws — device still returned, error logged', async () => {
    // Device whose createShaderModule getter throws when instrumentShaderCapture
    // tries to bind() on it. Forces the catch path inside the requestDevice patch.
    const brokenDevice = {} as GPUDevice;
    Object.defineProperty(brokenDevice, 'createShaderModule', {
      get() { throw new Error('forced instrumentation failure'); },
    });
    Object.defineProperty(brokenDevice, 'addEventListener', {
      value: () => {},
    });

    class FakeAdapter {
      async requestDevice(): Promise<GPUDevice> {
        return brokenDevice;
      }
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (globalThis as any).GPUAdapter = FakeAdapter;

    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    installEarlyDeviceHook();

    const adapter = new FakeAdapter();
    const device = await adapter.requestDevice();

    expect(device).toBe(brokenDevice);
    const calls = errorSpy.mock.calls.map((c) => c[0] as string);
    expect(calls.some((c) => c.includes('[webgpuDebug] instrumentation failed'))).toBe(true);
  });
});
