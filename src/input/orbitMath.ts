/**
 * Pure 3D camera math for orbit and dolly operations.
 * Mutates the camera position in-place (same philosophy as Viewport3D's custom pan).
 * Spec: docs/superpowers/specs/2026-06-04-input-scheme-design.md
 */
import * as THREE from 'three';

/** Radians per clamped wheel-delta unit (intent deltas are ±10 max → ≤0.05 rad/event). */
export const ORBIT_SPEED = 0.005;
const MIN_PHI = 0.05;
const MAX_PHI = Math.PI - 0.05;

const _offset = new THREE.Vector3();
const _spherical = new THREE.Spherical();

/**
 * Rotate `position` around `target` by (dx, dy) intent units (mutates `position`).
 * dx → azimuth (theta), dy → polar (phi), both clamped so the camera never flips
 * over the pole. The orbit target stays fixed on the avatar.
 */
export function orbitAroundTarget(
  position: THREE.Vector3,
  target: THREE.Vector3,
  dx: number,
  dy: number,
): THREE.Vector3 {
  _offset.copy(position).sub(target);
  _spherical.setFromVector3(_offset);
  _spherical.theta -= dx * ORBIT_SPEED;
  _spherical.phi -= dy * ORBIT_SPEED;
  _spherical.phi = Math.max(MIN_PHI, Math.min(MAX_PHI, _spherical.phi));
  _spherical.makeSafe();
  _offset.setFromSpherical(_spherical);
  return position.copy(target).add(_offset);
}

/**
 * Scale camera distance to target by `factor`, clamped to [minDistance, maxDistance]
 * (mutates `position`).
 * factor < 1 → moves closer; factor > 1 → moves away.
 */
export function dollyTowardTarget(
  position: THREE.Vector3,
  target: THREE.Vector3,
  factor: number,
  minDistance: number,
  maxDistance: number,
): THREE.Vector3 {
  _offset.copy(position).sub(target);
  const currentDist = _offset.length();
  if (currentDist === 0) {
    // Camera exactly at the target — setLength on a zero vector is a no-op
    // and would lock the camera there forever. Escape along world +Z.
    _offset.set(0, 0, minDistance);
    return position.copy(target).add(_offset);
  }
  const dist = Math.max(minDistance, Math.min(maxDistance, currentDist * factor));
  _offset.setLength(dist);
  return position.copy(target).add(_offset);
}
