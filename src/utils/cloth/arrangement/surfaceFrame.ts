/**
 * surfaceFrame — body surface frame at a garment region's landmark (#887 / Phase 1).
 *
 * Models the avatar as implicit cylinders (deriveDimensions). For each region
 * returns {point (on the cylinder axis), normal (outward), tangent (piece "up"),
 * axis (cylinder axis), radius}. Position is parametric (grading-safe). The limb
 * axis defaults to a T-pose direction; `axisHint` (from the bone, when available)
 * overrides it. Pure function — no THREE state, no avatar scene access.
 */
import * as THREE from 'three';
import type { BodyDimensions, BodyRegion } from '../garmentPlacement';

export type V3 = [number, number, number];

export interface SurfaceFrame {
  point: V3;     // landmark point on the body primitive axis
  normal: V3;    // outward unit normal (piece faces this way)
  tangent: V3;   // unit "up"/length direction of the piece
  axis: V3;      // unit cylinder axis direction at the landmark
  radius: number;
}

const v = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
const toV3 = (t: THREE.Vector3): V3 => [t.x, t.y, t.z];

/** Outward radial normal perpendicular to `axis`, biased toward `prefer` (default +Z). */
function radialNormal(axis: THREE.Vector3, prefer = v(0, 0, 1)): THREE.Vector3 {
  // Project `prefer` onto the plane perpendicular to axis.
  const n = prefer.clone().sub(axis.clone().multiplyScalar(prefer.dot(axis)));
  if (n.lengthSq() < 1e-8) {
    // prefer is parallel to axis — fall back to +Y, then +X.
    const alt = Math.abs(axis.y) < 0.9 ? v(0, 1, 0) : v(1, 0, 0);
    n.copy(alt.sub(axis.clone().multiplyScalar(alt.dot(axis))));
  }
  return n.normalize();
}

/** Axial standoff between the shoulder joint and the sleeve-cap edge ≈ armhole
 *  depth. NOT smaller: the cylinder model breaks at the joint — a cap ring at
 *  ~2cm sits inside the deltoid/armpit volume and collision ejects the tube
 *  against the ribcage (measured 2026-07-03: sleeve verts 6640 → 16 @10s). At
 *  armhole depth the ring clears the deltoid and the short seam pulls the tube
 *  UP the arm — the seam holds the sleeve the way a real armhole does. */
export const SLEEVE_CAP_MARGIN = 0.10; // 10cm

export function surfaceFrame(region: BodyRegion, d: BodyDimensions, axisHint?: V3, pieceLengthM?: number): SurfaceFrame {
  const midTorso = (d.shoulderHeight + d.waistHeight) / 2;
  const armR = d.armR;
  const neckR = d.neckR;

  // Sleeves anchor the CAP edge adjacent to the armhole (plan §6bis item 5):
  // the mesher-local length axis is bbox-centered (±L/2, flip-invariant), so
  // point = shoulder + axis·(margin + L/2) puts the proximal edge at
  // shoulder + margin. The old armLength/2 centered the tube at mid-arm,
  // leaving the sleeveCap↔armhole seam a ~30cm gap whose closure dragged the
  // tube off the arm. Cuffs and callers without geometry keep mid-arm.
  const sleeveAlong = (isSleeve: boolean) =>
    isSleeve && pieceLengthM != null ? SLEEVE_CAP_MARGIN + pieceLengthM / 2 : d.armLength / 2;

  switch (region) {
    case 'front-torso':
      return { point: [0, midTorso, 0], normal: [0, 0, 1], tangent: [0, 1, 0], axis: [0, 1, 0], radius: d.chestRadius };
    case 'back-torso':
      return { point: [0, midTorso, 0], normal: [0, 0, -1], tangent: [0, 1, 0], axis: [0, 1, 0], radius: d.chestRadius };
    case 'front-skirt':
    case 'waistband':
      return { point: [0, d.waistHeight, 0], normal: [0, 0, 1], tangent: [0, 1, 0], axis: [0, 1, 0], radius: d.hipRadius };
    case 'back-skirt':
      return { point: [0, d.waistHeight, 0], normal: [0, 0, -1], tangent: [0, 1, 0], axis: [0, 1, 0], radius: d.hipRadius };
    case 'collar':
      return { point: [0, (d.neckHeight + d.shoulderHeight) / 2, 0], normal: [0, 0, 1], tangent: [0, 1, 0], axis: [0, 1, 0], radius: neckR };
    case 'hood':
      return { point: [0, d.neckHeight, 0], normal: [0, 0, -1], tangent: [0, 1, 0], axis: [0, 1, 0], radius: neckR };
    case 'left-sleeve':
    case 'cuff-left': {
      const axis = (axisHint ? v(...axisHint) : v(-1, 0, 0)).normalize();
      const point = v(-(d.shoulderWidth / 2), d.shoulderHeight, 0).add(axis.clone().multiplyScalar(sleeveAlong(region === 'left-sleeve')));
      const normal = radialNormal(axis);
      const tangent = axis.clone(); // sleeve length runs along the arm
      return { point: toV3(point), normal: toV3(normal), tangent: toV3(tangent), axis: toV3(axis), radius: armR };
    }
    case 'right-sleeve':
    case 'cuff-right': {
      const axis = (axisHint ? v(...axisHint) : v(1, 0, 0)).normalize();
      const point = v(d.shoulderWidth / 2, d.shoulderHeight, 0).add(axis.clone().multiplyScalar(sleeveAlong(region === 'right-sleeve')));
      const normal = radialNormal(axis);
      const tangent = axis.clone();
      return { point: toV3(point), normal: toV3(normal), tangent: toV3(tangent), axis: toV3(axis), radius: armR };
    }
    case 'unknown':
    default:
      // Fallback: front-torso-like frame so the piece still lands on the body.
      return { point: [0, midTorso, 0], normal: [0, 0, 1], tangent: [0, 1, 0], axis: [0, 1, 0], radius: Math.max(d.chestRadius, d.hipRadius) };
  }
}

/**
 * Rotation (Euler XYZ) placing a flat piece (local +X = width, +Y = surface
 * normal, +Z = length) so local +Y → `normal` and local +Z → `tangent`.
 */
export function frameToEulerXYZ(normal: V3, tangent: V3): V3 {
  const n = v(...normal).normalize();
  const t = v(...tangent).normalize();
  // Gram-Schmidt: orthogonalize tangent against normal.
  t.sub(n.clone().multiplyScalar(t.dot(n)));
  if (t.lengthSq() < 1e-8) {
    const alt = Math.abs(n.y) < 0.9 ? v(0, 1, 0) : v(1, 0, 0);
    t.copy(alt).sub(n.clone().multiplyScalar(n.dot(alt)));
  }
  t.normalize();
  const b = new THREE.Vector3().crossVectors(n, t).normalize(); // local +X (width)
  const m = new THREE.Matrix4().makeBasis(b, n, t);             // cols = images of local X,Y,Z
  const e = new THREE.Euler().setFromRotationMatrix(m, 'XYZ');
  return [e.x, e.y, e.z];
}
