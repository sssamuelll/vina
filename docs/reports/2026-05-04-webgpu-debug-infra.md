# WebGPU Debug Infrastructure (Phase 1)

**Date**: 2026-05-04
**Branch**: `feat/webgpu-debug-infra` (off `e65e0253`, post-#735 merge)
**Related**: #733 design doc § 8.4 (calibration anchor)
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
to reconstruct what the WGSL compiler already knew. **Captured in #733
design doc § 8.4: "diagnosis cost of GPU code without proper debugging tools
is ~10× the development cost."**

This module is the durable infra investment that pays back across all
future GPU kernel work.

---

## What it gives you

`src/utils/cloth/gpu/webgpuDebug.ts` exports three primitives:

| Helper | Catches | Active in |
|---|---|---|
| `withErrorScope<T>(device, label, fn)` | Validation / OOM / internal errors during a labeled async block | dev only |
| `attachUncapturedErrorListener(device)` | Errors that escape every `withErrorScope` (notably lazy TSL pipeline compile during `renderer.compute()`) | dev + prod |
| `instrumentShaderCapture(device)` | WGSL source for every `device.createShaderModule()` + compile errors/warnings via `getCompilationInfo()` | dev only |

All three are idempotent on a given `GPUDevice`. The first two are wired by
default in `GpuSolverClient`'s constructor.

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
   for (const [label, code] of window.__OPENCLO_SHADERS__) {
     console.log(label, code.length);
   }
   const src = window.__OPENCLO_SHADERS__.get('cloth_module');
   copy(src);  // → clipboard
   ```

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

---

## References

- `src/utils/cloth/gpu/webgpuDebug.ts` — the module.
- `src/utils/cloth/gpu/__tests__/webgpuDebug.test.ts` — 17 unit tests covering all 3 helpers + idempotency + dev-mode behavior.
- `src/utils/cloth/gpu/gpuSolverClient.ts` — wire-up site (constructor + `initMultiPiece` + `initMultiPieceTsl`).
- `docs/reports/2026-05-04-733-gpu-body-collision-design.md` § 8.4 — calibration anchor.
- WebGPU spec: error scopes (§ 4.7), `GPUShaderModule.getCompilationInfo()` (§ 4.13.1), `uncapturederror` event (§ 4.7.4).
