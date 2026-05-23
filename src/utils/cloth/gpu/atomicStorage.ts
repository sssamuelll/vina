/**
 * Atomic StorageBufferNode helper — single source of truth for the #554
 * Three.js workaround.
 *
 * **What #554 is**: Three.js 0.183.2 `AtomicFunctionNode` does not walk up to
 * the parent `StorageBufferNode` to flip `isAtomic`, so the WGSL backend emits
 * `array<i32>` instead of `array<atomic<i32>>` for buffers used with
 * `atomicAdd` / `atomicStore` / `atomicMin`. Dawn then silently fails the
 * pipeline and the GPU tier degrades to CPU. The fix is to call
 * `.setAtomic(true)` on the storage node ourselves before any atomic op.
 *
 * **Why two casts**: `@types/three` v0.183.1
 *   1. lacks `'int'` in the `storage()` type union (only float/uint/vec*), so
 *      we pass `'int' as any`;
 *   2. mistypes the runtime `setAtomic(boolean)` method as `setAtmoic` (typo
 *      in the .d.ts), so the runtime method isn't visible on the typed node
 *      and we need `as any` to call it.
 *
 * Both quirks are upstream bugs in `@types/three`; until they're fixed, every
 * atomic storage buffer in this codebase MUST go through this helper.
 *
 * **WGSL spec reminder**: once a buffer is `array<atomic<T>>`, reads in any
 * pass MUST use `atomicLoad(buf.element(i))` — plain `buf.element(i)` is a
 * WGSL validation error. The `AtomicStorageNode` brand exists so call sites
 * carry the atomicness in their type and reviewers can spot a missing
 * `atomicLoad` on read.
 *
 * @module atomicStorage
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

import { StorageBufferAttribute } from 'three/webgpu';
import { storage, atomicLoad } from 'three/tsl';

declare const __atomicBrand: unique symbol;

/** Base storage node type (resolves the `storage()` overload return). */
type BaseStorageNode = ReturnType<typeof storage>;

/**
 * The element node produced by `atomicBuf.element(i)`. Carries the atomic
 * brand so the atomic builtins' signatures can require it.
 */
export type AtomicElement = ReturnType<BaseStorageNode['element']> & {
  readonly [__atomicBrand]: true;
};

/**
 * Branded `StorageBufferNode` returned by `makeAtomicStorage`. Its
 * `.element(i)` returns an `AtomicElement` (also branded), which is what the
 * atomic builtins (`atomicLoad`, `atomicAdd`, `atomicStore`, `atomicMin`,
 * `atomicMax`) accept — see `three-tsl-augment.d.ts`.
 */
export type AtomicStorageNode = Omit<BaseStorageNode, 'element'> & {
  readonly [__atomicBrand]: true;
  element(indexNode: Parameters<BaseStorageNode['element']>[0]): AtomicElement;
};

/**
 * Create an atomic `StorageBufferNode` for a TSL compute pipeline.
 *
 * Internally calls `storage(sba, type, count).setAtomic(true)` — the WGSL
 * backend will then emit `array<atomic<T>>` for the buffer binding, making
 * `atomicAdd` / `atomicStore` / `atomicMin` / `atomicMax` valid on its
 * elements.
 *
 * Read passes against the returned node MUST use `atomicLoad(buf.element(i))`
 * per WGSL spec — plain `buf.element(i)` will fail validation.
 *
 * @param sba   StorageBufferAttribute to wrap (typically Int32Array-backed for
 *              fixed-point atomic accumulation).
 * @param type  Element type. `'int'` is the common case; passed through the
 *              `'int' as any` cast because `@types/three` lacks it.
 * @param count Element count.
 */
export function makeAtomicStorage(
  sba: StorageBufferAttribute,
  type: 'int' | 'uint' | 'float',
  count: number,
): AtomicStorageNode {
  return (storage(sba, type as any, count) as any).setAtomic(true) as AtomicStorageNode;
}

// ─── Module-load runtime guard ──────────────────────────────────────────────
// Always-on (no flag gating) so a Three.js upgrade that renames or drops the
// API surface fails loudly at module load, not later at GPU dispatch when the
// shader pipeline silently degrades. Cheap: one storage() + one method probe
// at import time.
(() => {
  const probe = storage(
    new StorageBufferAttribute(new Int32Array([0]), 1),
    'int' as any,
    1,
  );
  if (typeof (probe as any).setAtomic !== 'function') {
    throw new Error(
      '[#554 workaround] StorageBufferNode.setAtomic missing — a Three.js ' +
        'upgrade may have renamed or removed the API. Check ' +
        'three/src/nodes/accessors/StorageBufferNode.js for the current ' +
        'method name and update src/utils/cloth/gpu/atomicStorage.ts.',
    );
  }
  if (typeof atomicLoad !== 'function') {
    throw new Error(
      '[#554 workaround] atomicLoad import resolved to non-function — a ' +
        'Three.js upgrade may have removed the export. Check ' +
        'three/src/Three.TSL.js for the current export name.',
    );
  }
})();
