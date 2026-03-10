/**
 * StorageBufferAttribute factory — wraps GPU solver buffers for zero-copy rendering.
 * @module gpuStorageAttributes
 */
import { StorageBufferAttribute } from 'three/webgpu';

/**
 * Wrap a GPU position buffer as a StorageBufferAttribute (vec3, itemSize 3).
 * Returns null if buffer is unavailable.
 */
export function createPositionStorageAttribute(
  buffer: GPUBuffer | null,
  particleCount: number,
): StorageBufferAttribute | null {
  if (!buffer || particleCount <= 0) return null;
  const attr = new StorageBufferAttribute(particleCount * 3, 3);
  // Bind our solver's GPU buffer directly — this is the zero-copy trick.
  // StorageBufferAttribute lacks a typed gpuBuffer setter; we patch the internal field.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (attr as any).gpuBuffer = buffer;
  return attr;
}

/**
 * Wrap a GPU normal buffer as a StorageBufferAttribute (vec3, itemSize 3).
 * Returns null if buffer is unavailable.
 */
export function createNormalStorageAttribute(
  buffer: GPUBuffer | null,
  particleCount: number,
): StorageBufferAttribute | null {
  if (!buffer || particleCount <= 0) return null;
  const attr = new StorageBufferAttribute(particleCount * 3, 3);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (attr as any).gpuBuffer = buffer;
  return attr;
}
