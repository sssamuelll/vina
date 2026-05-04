/**
 * WebGPU debug infrastructure for dev-mode kernel diagnosis (#733 follow-up).
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
 * Calibration anchor: design doc § 8.4 for #733 (GPU body collision) — diagnosis
 * cost of GPU code without proper debug tools is ~10× the development cost. This
 * module is the durable infra investment that pays back across all future GPU
 * kernel work.
 *
 * @module webgpuDebug
 */

declare global {
  interface Window {
    /** Map of shader label → WGSL source. Populated by {@link instrumentShaderCapture} in dev mode. */
    __OPENCLO_SHADERS__?: Map<string, string>;
  }
}

const SHADER_PATCH_MARKER = Symbol.for('openclo.webgpuDebug.shaderPatched');
const LISTENER_MARKER = Symbol.for('openclo.webgpuDebug.listenerAttached');

type MarkedDevice = GPUDevice & {
  [SHADER_PATCH_MARKER]?: true;
  [LISTENER_MARKER]?: true;
};

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
    const internalError = await device.popErrorScope();
    const oomError = await device.popErrorScope();
    const validationError = await device.popErrorScope();

    if (validationError) {
      console.error(`[WebGPU validation] ${label}: ${validationError.message}`);
    }
    if (oomError) {
      console.error(`[WebGPU OOM] ${label}: ${oomError.message}`);
    }
    if (internalError) {
      console.error(`[WebGPU internal] ${label}: ${internalError.message}`);
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
 *   for (const [label, code] of window.__OPENCLO_SHADERS__) {
 *     console.log(label, code.length);
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
    shaders.set(key, descriptor.code);

    const module = original(descriptor);

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
