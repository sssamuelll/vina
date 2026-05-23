/**
 * Type augmentations for Three.js TSL atomic builtins.
 *
 * The runtime `atomicStore` / `atomicAdd` / `atomicLoad` / `atomicMin` /
 * `atomicMax` functions exist in `three/tsl` (`three/src/Three.TSL.js:60-63`,
 * re-exported from `three/src/nodes/gpgpu/AtomicFunctionNode.js:186-208`).
 * `@types/three` v0.183.1 declares them only loosely (`(pointerNode: Node, ...)`)
 * with no notion of which buffers are actually atomic.
 *
 * **What this augment adds**: each builtin's `dest` parameter is narrowed to
 * `AtomicElement` — the branded element type produced by
 * `makeAtomicStorage(...).element(i)`. The brand prevents accidental use of
 * an atomic builtin against a non-atomic buffer's element (which is a WGSL
 * validation error, see `atomicStorage.ts` JSDoc).
 *
 * **Why also augment `StorageBufferNode`**: `@types/three` mistypes the
 * runtime `setAtomic(boolean)` method as `setAtmoic` (typo); callers that
 * need to flip atomicness without going through `makeAtomicStorage` still
 * have to `as any` the storage node. The `makeAtomicStorage` helper hides
 * that cast — see `atomicStorage.ts`.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

import type { AtomicElement } from './atomicStorage';

declare module 'three/tsl' {
  export function atomicStore(dest: AtomicElement, value: any): void;
  export function atomicAdd(dest: AtomicElement, value: any): any;
  export function atomicLoad(dest: AtomicElement): any;
  // atomicMin / atomicMax return the OLD value at `dest` before the operation —
  // callers compare returned vs. supplied to detect whether THIS thread won
  // (used by the atomic-emulation pattern in tslCollision.ts).
  export function atomicMin(dest: AtomicElement, value: any): any;
  export function atomicMax(dest: AtomicElement, value: any): any;
}
