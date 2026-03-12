/**
 * Type augmentations for Three.js TSL atomic builtins.
 *
 * atomicStore and atomicAdd exist at runtime in Three.js TSL but are not
 * yet included in @types/three. This module augmentation adds the missing
 * type information without replacing existing declarations.
 *
 * Note: atomicLoad is NOT exported by Three.js. Use regular element access
 * in separate passes where no concurrent writes occur.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

// Must be a module (have at least one import/export) for augmentation to work
export {};

declare module 'three/tsl' {
  export function atomicStore(dest: any, value: any): void;
  export function atomicAdd(dest: any, value: any): any;
}
