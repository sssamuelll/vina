/**
 * anchorMap — arrangement anchor points MEASURED from the baked body surface.
 *
 * Consejo 2026-07-03 §3: the old bone-attached anchors (analytic offsets +
 * `SO = 1.3` fudge) were "the third definition of the body" — the same bug
 * class renderCollisionBake just killed (+10-15mm render-vs-collision drift).
 * Anchors here are extracted from the SAME triangle soup the cloth collides
 * with (bakeCollisionFromRender), so they can never diverge from what the
 * user sees: each point sits on the measured surface radius + 1cm standoff.
 *
 * The IDs are the germ of the placement contract — the postal address the
 * human (click, D2), the agent (`placePiece(pieceId, anchorId, delta)`) and
 * the heuristics-as-proponent will all share.
 *
 * Conventions (documented decisions):
 * - Ring regions are ADDRESS NAMESPACES, not piece classifications. A ring
 *   spans 360° — both front- and back- pieces bind to its bearings — so each
 *   body zone uses ONE canonical BodyRegion as namespace: torso rings under
 *   `front-torso`, neck under `collar`, legs under `front-skirt` (skirts are
 *   what wraps legs), arms under `left-sleeve`/`right-sleeve`.
 * - Bearings: 8 per ring at 45° steps, θ=0..315°, dir(θ) = cosθ·front +
 *   sinθ·(axis × front). `front` is world +Z projected perpendicular to the
 *   ring axis (same radialNormal convention as surfaceFrame.ts). For vertical
 *   rings this gives front=+Z and right=+X — i.e. GARMENT left/right (screen
 *   left/right, `left-sleeve` at −X per surfaceFrame), NOT anatomical.
 * - Arms: garment `left-sleeve` = the −X arm. The optional `armAxis` param is
 *   ANATOMICAL (same convention as `ArmAxis` in buildAxisHints / redux
 *   simulation.armAxis: anatomical-left = the +X arm), so it is cross-mapped
 *   here exactly like buildAxisHints' HANDEDNESS block: −X rings take
 *   armAxis.right, +X rings take armAxis.left. No hint → T-pose ±X (same
 *   default as surfaceFrame.ts). Arm bearings use the same dir(θ) rule with
 *   front = radialNormal(axis).
 * - Ring heights (deriveDimensions names): torso ring0 = chest at
 *   (shoulderHeight+waistHeight)/2 (surfaceFrame's midTorso), ring1 = waist
 *   at waistHeight, ring2 = hip at waistHeight − 0.10; collar ring0 at
 *   (neckHeight+shoulderHeight)/2 (surfaceFrame's collar landmark); arm rings
 *   at 25% / 60% of armLength from the shoulder joint along the arm axis;
 *   leg rings around BOTH legs (skirt address space) at 0.85·inseam (thigh,
 *   just below crotch) and 0.5·inseam (knee).
 * - Radius extraction: soup verts within ±2.5cm of the ring plane (projection
 *   on the axis); radius(θ) = MAX radial projection onto dir(θ) among band
 *   verts whose in-plane angle is within ±30° of θ (window > the 45° bearing
 *   step, so windows overlap and faceted meshes never alias). Band with < 8
 *   verts or any empty bearing window → ring omitted (short arm, weird mesh —
 *   a ring with a missing bearing would be a malformed address). Sanity
 *   clamp: radius ∈ [0.02, 0.5] m.
 * - `AnchorRing.radius` = MEAN of the 8 bearing radii (single summary number;
 *   max would overstate elliptical sections like the two-leg ring — the
 *   per-bearing truth lives in each point's position/outward).
 *
 * Pure and deterministic: no THREE, no randomness, no clock.
 *
 * @module anchorMap
 */

import type { CollisionMeshData } from '../collisionMesh';
import type { BodyMeasurements } from '../../../types/types';
import { deriveDimensions, type BodyRegion } from '../garmentPlacement';
import type { V3 } from './surfaceFrame';
import { cmToM } from '../../geometry';

export const BEARINGS = [
  'front',
  'frontRight',
  'right',
  'backRight',
  'back',
  'backLeft',
  'left',
  'frontLeft',
] as const;
export type Bearing = (typeof BEARINGS)[number];

export interface AnchorPoint {
  /** `${region}.ring${i}.${bearing}` */
  id: string; // state-encoded ID
  region: BodyRegion;
  ring: number;
  /** On the measured baked surface + 1cm standoff. */
  position: V3;
  /** Unit radial direction (outward from the ring axis). */
  outward: V3;
}

export interface AnchorRing {
  region: BodyRegion;
  ring: number;
  axisPoint: V3;
  axis: V3;
  /** Mean of the 8 per-bearing measured surface radii (see module doc). */
  radius: number;
  points: AnchorPoint[];
}

export interface AnchorMap {
  rings: AnchorRing[];
  points: AnchorPoint[];
}

const BAND_HALF_WIDTH = 0.025; // ±2.5cm along the ring axis
const ANGULAR_WINDOW = Math.PI / 6; // ±30° around each bearing
const STANDOFF = 0.01; // 1cm off the measured surface
const MIN_BAND_VERTS = 8;
const RADIUS_MIN = 0.02;
const RADIUS_MAX = 0.5;
const HIP_DROP = 0.10; // hip ring sits 10cm below waistHeight

// ── tiny V3 helpers (plain arrays — hot loop over the soup) ──────────────────

const norm = (a: V3): V3 => {
  const l = Math.hypot(a[0], a[1], a[2]);
  return l > 1e-12 ? [a[0] / l, a[1] / l, a[2] / l] : [0, 1, 0];
};
const cross = (a: V3, b: V3): V3 => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];

/** World +Z projected perpendicular to `axis` — same fallback chain as
 *  surfaceFrame.radialNormal (+Z → +Y → +X). */
function ringFront(axis: V3): V3 {
  for (const prefer of [[0, 0, 1], [0, 1, 0], [1, 0, 0]] as V3[]) {
    const d = prefer[0] * axis[0] + prefer[1] * axis[1] + prefer[2] * axis[2];
    const p: V3 = [prefer[0] - axis[0] * d, prefer[1] - axis[1] * d, prefer[2] - axis[2] * d];
    if (p[0] * p[0] + p[1] * p[1] + p[2] * p[2] > 1e-8) return norm(p);
  }
  return [0, 0, 1];
}

// ── ring specs (parametric heights — grading-safe) ───────────────────────────

interface RingSpec {
  region: BodyRegion;
  ring: number;
  axisPoint: V3;
  axis: V3;
}

function ringSpecs(
  measurements: BodyMeasurements,
  armAxis?: { left: V3 | null; right: V3 | null },
): RingSpec[] {
  const d = deriveDimensions(measurements);
  const up: V3 = [0, 1, 0];
  const midTorso = (d.shoulderHeight + d.waistHeight) / 2;
  const inseamM = cmToM(measurements.inseam);

  const specs: RingSpec[] = [
    // Torso (namespace front-torso; ring0=chest, ring1=waist, ring2=hip)
    { region: 'front-torso', ring: 0, axisPoint: [0, midTorso, 0], axis: up },
    { region: 'front-torso', ring: 1, axisPoint: [0, d.waistHeight, 0], axis: up },
    { region: 'front-torso', ring: 2, axisPoint: [0, d.waistHeight - HIP_DROP, 0], axis: up },
    // Neck
    { region: 'collar', ring: 0, axisPoint: [0, (d.neckHeight + d.shoulderHeight) / 2, 0], axis: up },
    // Legs — one ring around BOTH legs (skirt address space)
    { region: 'front-skirt', ring: 0, axisPoint: [0, inseamM * 0.85, 0], axis: up },
    { region: 'front-skirt', ring: 1, axisPoint: [0, inseamM * 0.5, 0], axis: up },
  ];

  // Arms: garment left = −X arm = ANATOMICAL right (cross-mapped, see module doc).
  const arm = (region: BodyRegion, sign: -1 | 1, hint: V3 | null | undefined) => {
    const axis = norm(hint ?? [sign, 0, 0]);
    const shoulder: V3 = [(sign * d.shoulderWidth) / 2, d.shoulderHeight, 0];
    for (const [ring, t] of [[0, 0.25], [1, 0.60]] as const) {
      specs.push({
        region,
        ring,
        axisPoint: [
          shoulder[0] + axis[0] * t * d.armLength,
          shoulder[1] + axis[1] * t * d.armLength,
          shoulder[2] + axis[2] * t * d.armLength,
        ],
        axis,
      });
    }
  };
  arm('left-sleeve', -1, armAxis?.right);
  arm('right-sleeve', 1, armAxis?.left);

  return specs;
}

// ── surface measurement ──────────────────────────────────────────────────────

/** Measure one ring against the soup. Null → omitted (empty band / bearing). */
function extractRing(spec: RingSpec, verts: Float32Array): AnchorRing | null {
  const { axisPoint, axis } = spec;
  const front = ringFront(axis);
  const side = cross(axis, front); // unit: axis ⊥ front, both unit

  // Band pass: in-plane coords (u = ·front, w = ·side) + angle per soup vert.
  const bandU: number[] = [];
  const bandW: number[] = [];
  const bandPhi: number[] = [];
  for (let i = 0; i < verts.length; i += 3) {
    const dx = verts[i] - axisPoint[0];
    const dy = verts[i + 1] - axisPoint[1];
    const dz = verts[i + 2] - axisPoint[2];
    const along = dx * axis[0] + dy * axis[1] + dz * axis[2];
    if (Math.abs(along) >= BAND_HALF_WIDTH) continue;
    const u = dx * front[0] + dy * front[1] + dz * front[2];
    const w = dx * side[0] + dy * side[1] + dz * side[2];
    bandU.push(u);
    bandW.push(w);
    bandPhi.push(Math.atan2(w, u));
  }
  if (bandU.length < MIN_BAND_VERTS) return null;

  const radii: number[] = [];
  for (let k = 0; k < BEARINGS.length; k++) {
    const theta = (k * Math.PI) / 4;
    const c = Math.cos(theta);
    const s = Math.sin(theta);
    let max = -Infinity;
    for (let j = 0; j < bandPhi.length; j++) {
      let dphi = Math.abs(bandPhi[j] - theta) % (2 * Math.PI);
      if (dphi > Math.PI) dphi = 2 * Math.PI - dphi;
      if (dphi >= ANGULAR_WINDOW) continue;
      const proj = bandU[j] * c + bandW[j] * s;
      if (proj > max) max = proj;
    }
    if (max === -Infinity) return null; // empty bearing window → malformed address
    radii.push(Math.min(RADIUS_MAX, Math.max(RADIUS_MIN, max)));
  }

  const points: AnchorPoint[] = BEARINGS.map((bearing, k) => {
    const theta = (k * Math.PI) / 4;
    const c = Math.cos(theta);
    const s = Math.sin(theta);
    const outward: V3 = [
      front[0] * c + side[0] * s,
      front[1] * c + side[1] * s,
      front[2] * c + side[2] * s,
    ];
    const r = radii[k] + STANDOFF;
    return {
      id: `${spec.region}.ring${spec.ring}.${bearing}`, // state-encoded ID
      region: spec.region,
      ring: spec.ring,
      position: [
        axisPoint[0] + outward[0] * r,
        axisPoint[1] + outward[1] * r,
        axisPoint[2] + outward[2] * r,
      ],
      outward,
    };
  });

  return {
    region: spec.region,
    ring: spec.ring,
    axisPoint,
    axis,
    radius: radii.reduce((a, b) => a + b, 0) / radii.length,
    points,
  };
}

/**
 * Build the anchor map from the baked collision surface (tri soup).
 *
 * @param mesh Baked surface — bakeCollisionFromRender() in runtime, fallback
 *   getRegisteredCollisionMesh(). Callers with neither render no points (the
 *   analytic path is dead — consejo 2026-07-03 §3).
 * @param measurements Ring heights are parametric via deriveDimensions.
 * @param armAxis ANATOMICAL arm directions (redux simulation.armAxis shape);
 *   cross-mapped internally to garment sides. Absent → T-pose ±X.
 */
export function buildAnchorMap(
  mesh: CollisionMeshData,
  measurements: BodyMeasurements,
  armAxis?: { left: V3 | null; right: V3 | null },
): AnchorMap {
  const rings: AnchorRing[] = [];
  for (const spec of ringSpecs(measurements, armAxis)) {
    const ring = extractRing(spec, mesh.vertices);
    if (ring) rings.push(ring);
  }
  return { rings, points: rings.flatMap((r) => r.points) };
}
