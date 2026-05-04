# WebGPU Debug Infrastructure (Phase 1)

**Date**: 2026-05-04
**Branch**: `feat/webgpu-debug-infra` (off `e65e0253`, post-#735 merge)
**Related**: #733 (GPU body collision — calibration anchor; see "Why" below for the cost rationale)
**Author**: developer agent (Claude Opus 4.7)

---

## Why

Three GPU-tier kernel issues — #554 (atomicAdd), #732 (seam wiring), #733
(body collision) — surfaced a recurring failure mode: **the only signal
visible to a developer is the cloth's runtime symptom** (falls through floor,
falls through avatar, NaN positions). The actual WGSL validation error never
reaches the console because:

1. Three.js TSL absorbs validation errors internally on lazy pipeline
   compilation.
2. The cascade-warning pattern (`[Invalid ComputePipeline (unlabeled)] is
   invalid due to a previous error.` repeated 100+ times per frame) hides
   the *one* root error in noise.
3. The generated WGSL source is never exposed — so even if the error
   message references a line number, the line isn't readable.

The cost: each issue burns hours of substep-by-substep diagnostic spelunking
to reconstruct what the WGSL compiler already knew. **Diagnosis cost of GPU
code without proper debug tools is ~10× the development cost** (calibration
distilled from the three issues above).

This module is the durable infra investment that pays back across all
future GPU kernel work.

---

## What it gives you

`src/utils/cloth/gpu/webgpuDebug.ts` exports four primitives:

| Helper | Catches | Active in |
|---|---|---|
| `withErrorScope<T>(device, label, fn)` | Validation / OOM / internal errors during a labeled async block | dev only |
| `attachUncapturedErrorListener(device)` | Errors that escape every `withErrorScope` (notably lazy TSL pipeline compile during `renderer.compute()`) | dev + prod |
| `instrumentShaderCapture(device)` | WGSL source for every `device.createShaderModule()` + compile errors/warnings via `getCompilationInfo()` | dev only |
| `installEarlyDeviceHook()` | Patches `GPUAdapter.prototype.requestDevice` so EVERY future device (Three.js renderer + GpuSolverClient + future) is auto-instrumented | dev only |

All four are idempotent. The early hook is installed once at `main.tsx` load
time, before any renderer/solver constructs a device. Its purpose: solver and
Three.js's renderer create **separate** `GPUDevice` instances (see
`useSimulationLifecycle.ts:332-334` for the solver's `adapter.requestDevice()`).
Without the prototype-level hook, only the device the constructor of
`GpuSolverClient` saw would be patched — TSL canvas pipelines (which use the
renderer's device) would never have their WGSL captured.

A successful smoke test on a T-Shirt + Arrange + Simulate flow captures **79
shaders**: 13 from the renderer's canvas init (mipmap, PMREM, vertex/fragment
materials), plus 60 TSL compute kernels and a handful of additional
vertex/fragment for cloth and avatar materials.

---

## How to diagnose a #733-class issue

1. Set the WebGPU feature flag and reload:

   ```js
   localStorage.setItem('openclo-use-webgpu', 'true');
   location.reload();
   ```

2. Reproduce the bug. Watch the DevTools console for one of:

   - `[WebGPU validation] <label>: <verbatim error message>` — the labeled
     init block hit a validation error. The label tells you which solver
     stage; the message tells you what was wrong.
   - `[WebGPU uncaptured] <message>` — error escaped every scope. Most
     commonly: lazy TSL compile error inside `renderer.compute()`.
   - `[WebGPU shader '<label>'] <N> compile error(s):` — a specific shader
     module failed compilation. The label matches the entry in
     `window.__OPENCLO_SHADERS__`.

3. Pull the generated WGSL source for any shader of interest:

   ```js
   for (const [key, entry] of window.__OPENCLO_SHADERS__) {
     console.log(key, entry.deviceId, entry.source.length);
   }
   const entry = window.__OPENCLO_SHADERS__.get('cloth_module');
   copy(entry.source);  // → clipboard
   ```

   Each entry carries `{ source, label, deviceId }`. `label` is the original
   (or `unlabeled_N` fallback) without the `#N` collision suffix the map key
   may carry; `deviceId` (`device_0`, `device_1`, …) tells you which
   `GPUDevice` produced the shader — useful for separating solver-device
   shaders from renderer-device shaders that happen to share labels.

   For TSL compute nodes, the label often matches the `Fn`-name passed to
   `setLabel`, or falls through to `unlabeled_N` if none was set. Cross-
   reference with the `[WebGPU validation]` line/column to locate the
   exact failing construct.

4. Once the WGSL is in hand, the WGSL spec is enough to identify the issue
   (binding-count limits, missing `read_write` storage qualifier, atomic
   type mismatch, etc.). What used to take hours of TSL archeology now
   takes minutes of WGSL reading.

---

## When to extend this

The Phase 1 surface is intentionally minimal. Stretch goals deferred (per
kickoff Phase 1.4 condition: skip if 1.1–1.3 takes >6h):

- **Source-mapped error positions** — link WGSL line back to the TSL `Fn`
  callsite in TypeScript. Requires source-map plumbing through the
  `WGSLNodeBuilder` codepath. Add when a future issue actually requires
  TSL-line attribution.
- **Performance counters** — compute pipeline dispatch count + frame time
  sampling. Better surfaced via the existing `SolverMetrics` panel; add
  there when needed, not here.
- **Browser DevTools panel integration** — a custom panel that visualizes
  the shader Map. Worth doing if `window.__OPENCLO_SHADERS__` becomes a
  routine debugging surface; until then, console access is sufficient.
- **Per-frame `renderer.compute()` wrapping in `GarmentSimulation.tsx`** —
  intentionally NOT done in Phase 1. The `attachUncapturedErrorListener`
  catches lazy compile errors there with a label-less message; combined
  with the shader Map, that's enough to identify which kernel failed
  without the per-dispatch async push/pop overhead.

If a future #733-class issue surfaces and the existing infra still leaves
diagnosis at >1h, that's the signal to add the next stretch goal — not
before.

---

## Production behavior

| Helper | Production behavior |
|---|---|
| `withErrorScope` | Pass-through. `if (!import.meta.env.DEV) return await fn();` is the first line. No scope push/pop overhead. |
| `attachUncapturedErrorListener` | Active. An idle event listener is zero-cost until an error fires; surfacing prod GPU validation errors is more valuable than the listener-attach cost. |
| `instrumentShaderCapture` | No-op. The `device.createShaderModule` patch is dev-only — production keeps the original method. `window.__OPENCLO_SHADERS__` is never populated. |
| `installEarlyDeviceHook` | No-op. The `GPUAdapter.prototype.requestDevice` patch is dev-only — production leaves the prototype unmodified. |

### Accepted gap: renderer-side capture in production

With `installEarlyDeviceHook` and `instrumentShaderCapture` both no-op in prod,
the Three.js renderer's `GPUDevice` has neither shader capture nor an
`uncapturederror` listener in production builds. The solver-side device still
gets `attachUncapturedErrorListener` via the `GpuSolverClient` constructor
(prod-active), so solver validation errors do surface to console.

Renderer-side validation errors in production fail silently at the WebGPU
layer, but their downstream effect — broken visuals, NaN positions, missing
draws — cascades through existing surfaces: the simulation lifecycle hook
catches `SolverError` and falls back to CPU; the toast slice and
`ErrorBoundary` tree (see audit eje E ratification) surface user-visible
failures. Telemetry-grade prod renderer capture is out of scope for Phase 1.
Revisit when a real-world incident shows the existing fallback chain isn't
sufficient.

---

## References

- `src/utils/cloth/gpu/webgpuDebug.ts` — the module.
- `src/utils/cloth/gpu/__tests__/webgpuDebug.test.ts` — unit tests covering all 4 helpers + idempotency + dev-mode behavior.
- `src/utils/cloth/gpu/gpuSolverClient.ts` — wire-up site (constructor + `initMultiPiece` + `initMultiPieceTsl`).
- WebGPU spec: error scopes (§ 4.7), `GPUShaderModule.getCompilationInfo()` (§ 4.13.1), `uncapturederror` event (§ 4.7.4).
