/**
 * WebGPU debug infrastructure for dev-mode kernel diagnosis.
 *
 * Three tools that surface WGSL validation errors with minutes-not-hours latency:
 *
 *   1. {@link withErrorScope} — async wrapper that pushes 3 GPU error scopes
 *      (validation, out-of-memory, internal) around an init/setup operation.
 *      Catches validation errors verbatim with a label.
 *
 *   2. {@link attachUncapturedErrorListener} — device-level listener for errors
 *      that escape every withErrorScope block (e.g., lazy TSL pipeline
 *      compilation triggered inside `renderer.compute()` outside any scope).
 *
 *   3. {@link instrumentShaderCapture} — patches `device.createShaderModule`
 *      so every WGSL source the renderer compiles is captured into
 *      `window.__OPENCLO_SHADERS__` and `getCompilationInfo()` warnings/errors
 *      surface via `console.error`/`console.warn`.
 *
 * All three are gated on `import.meta.env.DEV`. In production builds:
 *   - `withErrorScope` becomes a pass-through (no scope push/pop).
 *   - `attachUncapturedErrorListener` and `instrumentShaderCapture` no-op.
 *
 * Calibration: diagnosis cost of GPU code without proper debug tools is ~10×
 * the development cost. This module is the durable infra investment that pays
 * back across all future GPU kernel work.
 *
 * @module webgpuDebug
 */

/**
 * Captured WGSL shader entry. The map key carries an optional `#N` suffix on
 * label collision; `label` is the original (or `unlabeled_N` fallback) without
 * that suffix; `deviceId` distinguishes solver-device shaders from
 * renderer-device shaders when both contribute identical labels.
 */
export interface ShaderEntry {
  source: string;
  label: string;
  deviceId: string;
}

declare global {
  interface Window {
    /** Map of shader key → {@link ShaderEntry}. Populated by {@link instrumentShaderCapture} in dev mode. */
    __OPENCLO_SHADERS__?: Map<string, ShaderEntry>;
  }
}

const SHADER_PATCH_MARKER = Symbol.for('openclo.webgpuDebug.shaderPatched');
const LISTENER_MARKER = Symbol.for('openclo.webgpuDebug.listenerAttached');
const ADAPTER_HOOK_INSTALLED = Symbol.for('openclo.webgpuDebug.adapterHookInstalled');

type MarkedDevice = GPUDevice & {
  [SHADER_PATCH_MARKER]?: true;
  [LISTENER_MARKER]?: true;
};

const deviceIds = new WeakMap<GPUDevice, string>();
let deviceIdCounter = 0;

function getOrAssignDeviceId(device: GPUDevice): string {
  let id = deviceIds.get(device);
  if (id === undefined) {
    id = `device_${deviceIdCounter++}`;
    deviceIds.set(device, id);
  }
  return id;
}

/**
 * Wrap a sync or async operation with WebGPU error scopes.
 * Captures validation, out-of-memory, and internal errors via `console.error`.
 *
 * Push order: validation → out-of-memory → internal.
 * Pop order: internal → out-of-memory → validation (LIFO).
 *
 * Production: pass-through (returns `await fn()` directly).
 *
 * @example
 *   await withErrorScope(device, 'gpuSolver.init', async () => {
 *     await solver.init(meshData, stretch, bend, seam, triangles);
 *   });
 */
export async function withErrorScope<T>(
  device: GPUDevice,
  label: string,
  fn: () => Promise<T> | T,
): Promise<T> {
  if (!import.meta.env.DEV) {
    return await fn();
  }

  device.pushErrorScope('validation');
  device.pushErrorScope('out-of-memory');
  device.pushErrorScope('internal');

  try {
    return await fn();
  } finally {
    // Issue all 3 pops together so a rejection on one (device lost, malformed
    // stack) doesn't leak the remaining scopes. WebGPU processes pops in the
    // order they're called, so LIFO ordering is preserved: internal → oom →
    // validation, regardless of resolution order.
    const [internalRes, oomRes, validationRes] = await Promise.allSettled([
      device.popErrorScope(),
      device.popErrorScope(),
      device.popErrorScope(),
    ]);

    if (validationRes.status === 'fulfilled' && validationRes.value) {
      console.error(`[WebGPU validation] ${label}: ${validationRes.value.message}`);
    }
    if (oomRes.status === 'fulfilled' && oomRes.value) {
      console.error(`[WebGPU OOM] ${label}: ${oomRes.value.message}`);
    }
    if (internalRes.status === 'fulfilled' && internalRes.value) {
      console.error(`[WebGPU internal] ${label}: ${internalRes.value.message}`);
    }
  }
}

/**
 * Attach a device-level `uncapturederror` listener that logs with a consistent
 * `[WebGPU uncaptured]` prefix. Idempotent: multiple calls on the same device
 * attach a single listener.
 *
 * Catches errors that escape every {@link withErrorScope} block — most importantly,
 * validation errors from lazy TSL pipeline compilation inside `renderer.compute()`
 * when no scope is active.
 *
 * Active in production too: an idle event listener has zero cost until an error
 * fires, and prod telemetry benefits from surfacing GPU validation errors that
 * would otherwise be silently swallowed.
 */
export function attachUncapturedErrorListener(device: GPUDevice): void {
  const d = device as MarkedDevice;
  if (d[LISTENER_MARKER]) return;
  d[LISTENER_MARKER] = true;

  device.addEventListener('uncapturederror', (event) => {
    const err = (event as GPUUncapturedErrorEvent).error;
    console.error(`[WebGPU uncaptured] ${err.message}`);
  });
}

/**
 * Patch `device.createShaderModule` to capture WGSL source into
 * `window.__OPENCLO_SHADERS__` and surface `getCompilationInfo()` diagnostics.
 *
 * Idempotent: marks the device on first call; subsequent calls no-op.
 *
 * Must be invoked BEFORE any solver/pipeline construction so every shader
 * module created during init is captured. Typical site: `GpuSolverClient`
 * constructor, before `new GpuClothSolver(...)`.
 *
 * Browser DevTools usage:
 *   ```js
 *   for (const [key, entry] of window.__OPENCLO_SHADERS__) {
 *     console.log(key, entry.deviceId, entry.source.length);
 *   }
 *   ```
 */
export function instrumentShaderCapture(device: GPUDevice): void {
  if (!import.meta.env.DEV || typeof window === 'undefined') return;
  const d = device as MarkedDevice;
  if (d[SHADER_PATCH_MARKER]) return;
  d[SHADER_PATCH_MARKER] = true;

  window.__OPENCLO_SHADERS__ = window.__OPENCLO_SHADERS__ ?? new Map();
  const shaders = window.__OPENCLO_SHADERS__;
  const deviceId = getOrAssignDeviceId(device);

  const original = device.createShaderModule.bind(device);
  let unlabeledCounter = 0;

  // Method override is intentional: GPUDevice.createShaderModule isn't readonly
  // in the lib types but TS still flags reassignment. The cast is local to this
  // patch site — withErrorScope and the listener don't need it.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (device as any).createShaderModule = (descriptor: GPUShaderModuleDescriptor): GPUShaderModule => {
    const baseLabel = descriptor.label && descriptor.label.length > 0
      ? descriptor.label
      : `unlabeled_${unlabeledCounter++}`;
    let key = baseLabel;
    let suffix = 1;
    while (shaders.has(key)) {
      key = `${baseLabel}#${suffix++}`;
    }

    // Call original first so a sync throw (invalid descriptor) doesn't leave
    // a phantom map entry. Counter advancement on throw is cosmetic.
    const module = original(descriptor);
    shaders.set(key, { source: descriptor.code, label: baseLabel, deviceId });

    module.getCompilationInfo().then((info) => {
      const errs = info.messages.filter((m) => m.type === 'error');
      const warns = info.messages.filter((m) => m.type === 'warning');
      if (errs.length > 0) {
        const formatted = errs.map((m) => `  (${m.lineNum}:${m.linePos}) ${m.message}`).join('\n');
        console.error(`[WebGPU shader '${key}'] ${errs.length} compile error(s):\n${formatted}`);
      }
      if (warns.length > 0) {
        const formatted = warns.map((m) => `  (${m.lineNum}:${m.linePos}) ${m.message}`).join('\n');
        console.warn(`[WebGPU shader '${key}'] ${warns.length} compile warning(s):\n${formatted}`);
      }
    }).catch(() => {
      // getCompilationInfo failure is non-fatal — shader source already captured.
    });

    return module;
  };
}

/**
 * Install a `GPUAdapter.prototype.requestDevice` hook so EVERY future device —
 * Three.js renderer's, our solver's, anyone else's — is auto-instrumented with
 * shader capture + uncapturederror listener.
 *
 * The Three.js WebGPURenderer creates its own device for canvas rendering and
 * `renderer.compute(node)`, distinct from `GpuSolverClient`'s device. Without
 * the prototype-level hook, only devices we explicitly pass to
 * {@link instrumentShaderCapture} are patched — TSL kernel WGSL on the
 * renderer's device would never be captured. This hook closes that gap.
 *
 * Must be called BEFORE any code calls `adapter.requestDevice()`. Typical
 * site: top of `main.tsx`, before any React rendering. Idempotent.
 *
 * Production: no-op (gated on `import.meta.env.DEV`). The renderer-side device
 * therefore has no shader capture and no uncapturederror listener in prod;
 * renderer validation errors fail silently at the WebGPU layer but their
 * downstream effect cascades to CPU fallback via `SolverError` → toast slice
 * → ErrorBoundary tree. Phase 1 accepts this gap; revisit if telemetry needs
 * a prod renderer surface.
 */
export function installEarlyDeviceHook(): void {
  if (!import.meta.env.DEV) return;
  if (typeof globalThis === 'undefined') return;
  // GPUAdapter is the WebGPU adapter class; absent in non-WebGPU environments.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const AdapterCtor = (globalThis as any).GPUAdapter as { prototype: GPUAdapter } | undefined;
  if (!AdapterCtor || !AdapterCtor.prototype) return;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const proto = AdapterCtor.prototype as any;
  if (proto[ADAPTER_HOOK_INSTALLED]) return;
  proto[ADAPTER_HOOK_INSTALLED] = true;

  const originalRequestDevice = proto.requestDevice;
  proto.requestDevice = async function patchedRequestDevice(
    ...args: unknown[]
  ): Promise<GPUDevice> {
    const device: GPUDevice = await originalRequestDevice.apply(this, args);
    // Isolate instrumentation: a throw here would propagate to Three.js and
    // surface as "no compatible adapter" downstream — indistinguishable from
    // a real WebGPU unsupported scenario, painful to debug. Surface the
    // failure; return the device anyway.
    try {
      instrumentShaderCapture(device);
      attachUncapturedErrorListener(device);
    } catch (e) {
      console.error('[webgpuDebug] instrumentation failed (device returned anyway):', e);
    }
    return device;
  };
}
