/**
 * Type augmentations for Three.js TSL atomic builtins.
 *
 * atomicStore, atomicAdd, and atomicLoad exist at runtime in Three.js TSL
 * (`three/src/Three.TSL.js:60-63`, re-exported from
 * `three/src/nodes/gpgpu/AtomicFunctionNode.js:186-208`) but are not yet
 * included in `@types/three`. This module augmentation adds the missing
 * type information without replacing existing declarations.
 *
 * **#554 atomicAdd WGSL codegen fix path**: when a `StorageBufferNode` has
 * `.setAtomic(true)` called on it, WGSL backend emits `array<atomic<i32>>`
 * (not `array<i32>`). Read passes must then use `atomicLoad(buf.element(i))`
 * instead of plain `buf.element(i)` because WGSL spec requires `atomicLoad`
 * for `atomic<T>` access even in read-only contexts.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

// Must be a module (have at least one import/export) for augmentation to work
export {};

declare module 'three/tsl' {
  export function atomicStore(dest: any, value: any): void;
  export function atomicAdd(dest: any, value: any): any;
  export function atomicLoad(dest: any): any;
}

// `@types/three` declares `StorageBufferNode` as a type alias (not a class /
// interface), so module augmentation can't add methods to it directly. The
// runtime method is `setAtomic(value: boolean)` per
// `three/src/nodes/accessors/StorageBufferNode.js:273` (and the buggy typo'd
// `setAtmoic` is what `@types/three` exposes). Callers must use an
// `as any` cast at the callsite for now. See #554 for context.
