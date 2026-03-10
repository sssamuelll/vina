// src/utils/animation/interpolation.ts
import type { Keyframe, InterpolationType } from './types';

/** Easing functions: take normalized t (0-1), return eased t (0-1) */
const easings: Record<InterpolationType, (t: number) => number> = {
  linear: (t) => t,
  easeIn: (t) => t * t,
  easeOut: (t) => 1 - (1 - t) * (1 - t),
  easeInOut: (t) => t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2,
  bezier: (t) => t, // default bezier fallback (linear); real bezier needs control points
};

/**
 * Interpolate a scalar value at the given frame from sorted keyframes.
 * Returns undefined if keyframes array is empty.
 * Holds first/last value outside keyframe range.
 * Uses the LEFT keyframe's interpolation type for the curve between two keys.
 */
export function interpolate(keyframes: Keyframe[], frame: number): number | undefined {
  if (keyframes.length === 0) return undefined;
  if (keyframes.length === 1) return keyframes[0].value;

  // Before first keyframe
  if (frame <= keyframes[0].frame) return keyframes[0].value;

  // After last keyframe
  if (frame >= keyframes[keyframes.length - 1].frame) return keyframes[keyframes.length - 1].value;

  // Find the segment
  for (let i = 0; i < keyframes.length - 1; i++) {
    const left = keyframes[i];
    const right = keyframes[i + 1];
    if (frame >= left.frame && frame <= right.frame) {
      const t = (frame - left.frame) / (right.frame - left.frame);
      const eased = easings[left.interpolation](t);
      return left.value + (right.value - left.value) * eased;
    }
  }

  return keyframes[keyframes.length - 1].value;
}

/**
 * Interpolate a Vec3 by interpolating each axis independently.
 * Returns undefined if any axis has no keyframes.
 */
export function interpolateVec3(
  kfX: Keyframe[],
  kfY: Keyframe[],
  kfZ: Keyframe[],
  frame: number,
): [number, number, number] | undefined {
  const x = interpolate(kfX, frame);
  const y = interpolate(kfY, frame);
  const z = interpolate(kfZ, frame);
  if (x === undefined || y === undefined || z === undefined) return undefined;
  return [x, y, z];
}
