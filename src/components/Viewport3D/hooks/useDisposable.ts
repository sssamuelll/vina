import { useEffect } from 'react';

/**
 * Registers cleanup for a Three.js (or compatible) disposable resource.
 *
 * On unmount or when the `value` reference changes, invokes `value.dispose()`.
 * `null` / `undefined` are accepted as no-ops, so callers using `useMemo` with
 * a nullable factory (degenerate input → `null`) can pass the value through
 * unchanged.
 *
 * Pattern (canonical per C1 RFC, anchored 2026-05-01):
 *
 * ```tsx
 * const geometry = useMemo(() => new THREE.BufferGeometry(...), [deps]);
 * useDisposable(geometry);
 * ```
 *
 * The hook deliberately does NOT abstract the value's creation. Heterogeneity
 * across the 7 inventoried sites lives in creation (pure recipe / nullable /
 * multi-geo coupled / wrapper-object / mutate-in-place + ref); cleanup is
 * uniform. Keeping creation at the call site preserves the call-site's full
 * control over useMemo deps, return shape, and ref-store side-effects.
 *
 * For multi-geo coupled sites (Site 3 — `FloorGrid`), call the hook twice
 * (once per geometry). Semantically equivalent to a single `useEffect` that
 * disposes both, without artifically decoupling the useMemo.
 *
 * Cross-ref:
 * - `docs/reports/2026-05-01-rfc-c1-buffer-lifecycle.md` (canonical decision).
 * - `docs/reports/2026-04-28-c1-rfc-input-bug9-analysis.md` (BUG-9 site shapes).
 *
 * @param value - The disposable resource. Any object with a `dispose(): void`
 *   method works (BufferGeometry, Material, Texture, RenderTarget, etc.).
 *   `null` / `undefined` → no-op.
 */
export function useDisposable<T extends { dispose(): void }>(
  value: T | null | undefined,
): void {
  useEffect(() => {
    return () => {
      value?.dispose();
    };
  }, [value]);
}
