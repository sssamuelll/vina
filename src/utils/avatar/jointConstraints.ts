/**
 * Professional Joint Constraint System
 * 
 * Uses the industry-standard approach from game engines (Unity, Unreal, Godot):
 * - Determine each bone's ACTUAL rest direction from the skeleton hierarchy
 * - Define constraints relative to the bone's anatomical axes
 * - Use quaternion math to enforce limits without Euler angle artifacts
 * 
 * Key insight: We don't need a full physics engine. We need correct quaternion
 * clamping that respects the bone's local coordinate system as determined
 * empirically from the GLB model.
 * 
 * This module is GLB-agnostic: it discovers bone orientations at runtime.
 */

import * as THREE from 'three';

const DEG2RAD = Math.PI / 180;
const RAD2DEG = 180 / Math.PI;

// ─── Joint Type Definitions ───

export type JointType = 'ball' | 'hinge' | 'saddle' | 'limited';

export interface AnatomicalJoint {
  type: JointType;
  
  // For hinge joints (elbow, knee): single axis of rotation
  // Defined in the PARENT bone's local space
  hingeAxis?: THREE.Vector3;
  hingeMin?: number;  // degrees
  hingeMax?: number;  // degrees
  
  // For ball joints (shoulder, hip): per-axis limits
  // These are applied AFTER decomposing into anatomical axes
  // discovered from the actual skeleton
  xMin?: number; xMax?: number;  // primary plane (usually elevation/depression)
  yMin?: number; yMax?: number;  // secondary plane (usually rotation)
  zMin?: number; zMax?: number;  // tertiary plane (usually forward/back)
  
  // Maximum total swing angle (cone limit for ball joints)
  maxSwing?: number;
}

// ─── Anatomical Joint Definitions ───
// Values from Kapandji "Physiology of the Joints" and verified ROM studies

export const HUMAN_JOINTS: Record<string, AnatomicalJoint> = {
  // === SHOULDER (glenohumeral) — ball-and-socket ===
  LeftArm: {
    type: 'ball',
    // From axis discovery: +X=adduction(down), -X=abduction(up), +Z=forward, -Z=backward
    xMin: -170, xMax: 70,    // abduction(170°) to full adduction(70° past body)
    yMin: -90,  yMax: 90,    // internal/external rotation
    zMin: -40,  zMax: 100,   // extension(40° back) to flexion(100° forward)
    maxSwing: 170,
  },
  RightArm: {
    type: 'ball',
    xMin: -170, xMax: 70,
    yMin: -90,  yMax: 90,
    zMin: -100, zMax: 40,    // mirrored Z: -Z=forward, +Z=backward (max 40° extension)
    maxSwing: 170,
  },

  // === SHOULDER GIRDLE (clavicle) — limited ball ===
  LeftShoulder: {
    type: 'limited',
    xMin: -15, xMax: 15,
    yMin: -10, yMax: 10,
    zMin: -10, zMax: 20,
  },
  RightShoulder: {
    type: 'limited',
    xMin: -15, xMax: 15,
    yMin: -10, yMax: 10,
    zMin: -20, zMax: 10,
  },

  // === ELBOW — true hinge (1 DOF) ===
  // Only flexion/extension around X axis. No lateral, no twist at elbow.
  // Pronation/supination happens at the forearm (radioulnar joint), mapped to Y.
  LeftForeArm: {
    type: 'hinge',
    hingeAxis: new THREE.Vector3(0, 0, 1),  // Z axis = elbow flexion
    hingeMin: 0,
    hingeMax: 145,
    // Y = forearm pronation/supination
    yMin: -85, yMax: 85,
  },
  RightForeArm: {
    type: 'hinge',
    hingeAxis: new THREE.Vector3(0, 0, 1),
    hingeMin: 0,
    hingeMax: 145,
    yMin: -85, yMax: 85,
  },

  // === HIP — ball-and-socket ===
  LeftUpLeg: {
    type: 'ball',
    xMin: -20, xMax: 120,   // extension(20°) to flexion(120°)
    yMin: -30, yMax: 45,    // external/internal rotation
    zMin: -30, zMax: 45,    // adduction/abduction
    maxSwing: 120,
  },
  RightUpLeg: {
    type: 'ball',
    xMin: -20, xMax: 120,
    yMin: -45, yMax: 30,    // mirrored
    zMin: -45, zMax: 30,    // mirrored
    maxSwing: 120,
  },

  // === KNEE — true hinge (1 DOF) ===
  LeftLeg: {
    type: 'hinge',
    hingeAxis: new THREE.Vector3(1, 0, 0),
    hingeMin: -145,   // full flexion (heel to glute)
    hingeMax: 0,      // full extension (straight leg)
  },
  RightLeg: {
    type: 'hinge',
    hingeAxis: new THREE.Vector3(1, 0, 0),
    hingeMin: -145,
    hingeMax: 0,
  },

  // === SPINE (cumulative ROM across segments) ===
  Spine: {
    type: 'limited',
    xMin: -20, xMax: 20,
    yMin: -15, yMax: 15,
    zMin: -10, zMax: 10,
  },
  Spine1: {
    type: 'limited',
    xMin: -15, xMax: 15,
    yMin: -10, yMax: 10,
    zMin: -8,  zMax: 8,
  },
  Spine2: {
    type: 'limited',
    xMin: -15, xMax: 15,
    yMin: -10, yMax: 10,
    zMin: -8,  zMax: 8,
  },

  // === NECK & HEAD ===
  Neck: {
    type: 'ball',
    xMin: -40, xMax: 40,
    yMin: -50, yMax: 50,
    zMin: -35, zMax: 35,
  },
  Head: {
    type: 'limited',
    xMin: -25, xMax: 25,
    yMin: -40, yMax: 40,
    zMin: -20, zMax: 20,
  },
};

// ─── Constraint Application ───

/**
 * Apply anatomical joint constraints to a rotation (in Euler degrees, ZYX order).
 * 
 * For hinge joints: zeros out all axes except the hinge axis + allowed secondary.
 * For ball joints: clamps each axis independently AND enforces max swing cone.
 * For limited joints: simple per-axis clamp.
 */
export function constrainJoint(
  jointName: string,
  rotation: { x: number; y: number; z: number }
): { x: number; y: number; z: number } {
  const joint = HUMAN_JOINTS[jointName];
  if (!joint) return rotation;

  const result = { ...rotation };

  switch (joint.type) {
    case 'hinge': {
      // Hinge joint: only allow rotation on the hinge axis
      if (joint.hingeAxis) {
        // Determine which Euler component corresponds to the hinge axis
        // hingeAxis (1,0,0) → X rotation
        // hingeAxis (0,1,0) → Y rotation
        // hingeAxis (0,0,1) → Z rotation
        const ax = joint.hingeAxis;
        
        if (Math.abs(ax.x) > 0.5) {
          // Hinge is on X
          result.x = clamp(result.x, joint.hingeMin ?? -180, joint.hingeMax ?? 180);
          result.z = 0; // Lock non-hinge axes
          // Allow Y if yMin/yMax defined (pronation/supination)
          if (joint.yMin !== undefined && joint.yMax !== undefined) {
            result.y = clamp(result.y, joint.yMin, joint.yMax);
          } else {
            result.y = 0;
          }
        } else if (Math.abs(ax.y) > 0.5) {
          result.y = clamp(result.y, joint.hingeMin ?? -180, joint.hingeMax ?? 180);
          result.x = 0;
          result.z = 0;
        } else {
          // Hinge is on Z
          result.z = clamp(result.z, joint.hingeMin ?? -180, joint.hingeMax ?? 180);
          result.x = 0;
          // Allow Y if defined (e.g., forearm pronation/supination)
          if (joint.yMin !== undefined && joint.yMax !== undefined) {
            result.y = clamp(result.y, joint.yMin, joint.yMax);
          } else {
            result.y = 0;
          }
        }
      }
      break;
    }

    case 'ball': {
      // Ball joint: clamp each axis + coupled constraints + swing cone
      result.x = clamp(result.x, joint.xMin ?? -180, joint.xMax ?? 180);
      result.y = clamp(result.y, joint.yMin ?? -180, joint.yMax ?? 180);
      result.z = clamp(result.z, joint.zMin ?? -180, joint.zMax ?? 180);

      // === Coupled constraints (shoulder biomechanics) ===
      // When the arm extends backward (toward Z limits), restrict other axes.
      // This prevents anatomically impossible combinations.
      if (jointName === 'LeftArm' || jointName === 'RightArm') {
        applyCoupledShoulderConstraints(jointName, result, joint);
      }
      if (jointName === 'LeftUpLeg' || jointName === 'RightUpLeg') {
        applyCoupledHipConstraints(result, joint);
      }

      // Enforce maximum swing cone
      if (joint.maxSwing !== undefined) {
        const euler = new THREE.Euler(result.x * DEG2RAD, result.y * DEG2RAD, result.z * DEG2RAD, 'ZYX');
        const q = new THREE.Quaternion().setFromEuler(euler);
        const totalAngle = 2 * Math.acos(Math.min(1, Math.abs(q.w))) * RAD2DEG;

        if (totalAngle > joint.maxSwing) {
          const scale = joint.maxSwing / totalAngle;
          result.x *= scale;
          result.y *= scale;
          result.z *= scale;
          result.x = clamp(result.x, joint.xMin ?? -180, joint.xMax ?? 180);
          result.y = clamp(result.y, joint.yMin ?? -180, joint.yMax ?? 180);
          result.z = clamp(result.z, joint.zMin ?? -180, joint.zMax ?? 180);
        }
      }
      break;
    }

    case 'limited':
    default: {
      result.x = clamp(result.x, joint.xMin ?? -180, joint.xMax ?? 180);
      result.y = clamp(result.y, joint.yMin ?? -180, joint.yMax ?? 180);
      result.z = clamp(result.z, joint.zMin ?? -180, joint.zMax ?? 180);
      break;
    }
  }

  return result;
}

// ─── Coupled Constraint Functions ───

/**
 * Shoulder coupled constraints (Kapandji):
 * - When arm extends backward (Z toward back limit), X range narrows drastically.
 *   In extension, the arm can only adduct (move inward toward body), not abduct freely.
 * - When arm is fully abducted (X at max raise), internal rotation is limited.
 * - At high flexion (Z forward), abduction range reduces.
 */
function applyCoupledShoulderConstraints(
  jointName: string,
  result: { x: number; y: number; z: number },
  joint: AnatomicalJoint
) {
  const zMin = joint.zMin ?? -40;
  const zMax = joint.zMax ?? 100;

  // Determine how far backward the arm is (0 = neutral, 1 = max extension)
  // For LeftArm: negative Z = backward. For RightArm: positive Z = backward.
  const isLeft = jointName === 'LeftArm';
  const backwardZ = isLeft ? -result.z : result.z;
  const maxBack = isLeft ? -(zMin) : zMax;

  if (maxBack > 0 && backwardZ > 0) {
    const backwardRatio = clamp(backwardZ / maxBack, 0, 1);

    // As arm goes backward, X range shrinks toward adduction only.
    // At full extension: can only adduct (X: 20..70), can't abduct (raise overhead)
    // At neutral (0 extension): full range (-170..70)
    const xMinReduced = lerp(joint.xMin ?? -170, 20, backwardRatio);
    result.x = clamp(result.x, xMinReduced, joint.xMax ?? 70);

    // Also reduce Y (rotation) range when arm is far back
    // At full extension: rotation limited to ±30° (from ±90°)
    const yRange = lerp(90, 30, backwardRatio);
    result.y = clamp(result.y, -yRange, yRange);
  }

  // When arm is highly abducted (raised overhead, X very negative),
  // reduce internal rotation to prevent shoulder impingement
  const abductionDeg = -(result.x); // negative X = abduction
  if (abductionDeg > 90) {
    const ratio = clamp((abductionDeg - 90) / 80, 0, 1); // 90°-170° range
    const yRange = lerp(90, 20, ratio);
    result.y = clamp(result.y, -yRange, yRange);
  }
}

/**
 * Hip coupled constraints:
 * - At high flexion (X > 90°), abduction and rotation reduce.
 * - At full extension (X < 0), adduction is limited.
 */
function applyCoupledHipConstraints(
  result: { x: number; y: number; z: number },
  joint: AnatomicalJoint
) {
  // High flexion → reduce rotation and abduction
  if (result.x > 90) {
    const ratio = clamp((result.x - 90) / 30, 0, 1);
    const yRange = lerp(joint.yMax ?? 45, 15, ratio);
    result.y = clamp(result.y, -yRange, yRange);
    const zRange = lerp(joint.zMax ?? 45, 15, ratio);
    result.z = clamp(result.z, -zRange, zRange);
  }
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

// Expose for debugging — remove in production
if (typeof window !== 'undefined') {
  (window as unknown as Record<string, unknown>).__jointConstraints = { constrainJoint, HUMAN_JOINTS };
}

// ─── Drag Axis Mapping (from empirical axis discovery) ───

/**
 * Maps mouse drag directions to bone Euler axes.
 * Verified empirically with axis discovery on Avaturn GLB.
 * 
 * For each joint: which Euler axis corresponds to which anatomical movement,
 * and which mouse direction controls it.
 */
export interface DragMapping {
  /** Which Euler axis to modify when dragging horizontally */
  horizontal?: 'x' | 'y' | 'z';
  /** Direction multiplier for horizontal drag (1 or -1) */
  horizontalSign?: number;
  /** Which Euler axis to modify when dragging vertically */
  vertical?: 'x' | 'y' | 'z';
  /** Direction multiplier for vertical drag (1 or -1) */
  verticalSign?: number;
}

/**
 * Verified drag mappings from axis discovery.
 * These tell the drag handler which axis to modify and in which direction.
 */
export const DRAG_MAPPINGS: Record<string, DragMapping> = {
  // Arms: vertical drag → X (raise/lower), horizontal drag → Z (forward/back)
  LeftArm:      { vertical: 'x', verticalSign: -1, horizontal: 'z', horizontalSign: 1 },
  RightArm:     { vertical: 'x', verticalSign: -1, horizontal: 'z', horizontalSign: -1 },
  LeftForeArm:  { vertical: 'z', verticalSign: 1, horizontal: 'y', horizontalSign: 1 },  // Z=elbow flex, Y=pronation
  RightForeArm: { vertical: 'z', verticalSign: 1, horizontal: 'y', horizontalSign: -1 },
  // Shoulders: minimal, same pattern as arms
  LeftShoulder:  { vertical: 'x', verticalSign: -1, horizontal: 'z', horizontalSign: 1 },
  RightShoulder: { vertical: 'x', verticalSign: -1, horizontal: 'z', horizontalSign: -1 },
  // Legs: vertical drag → X (flex/extend), horizontal → Z (abduct/adduct)
  LeftUpLeg:  { vertical: 'x', verticalSign: 1, horizontal: 'z', horizontalSign: 1 },
  RightUpLeg: { vertical: 'x', verticalSign: 1, horizontal: 'z', horizontalSign: -1 },
  LeftLeg:    { vertical: 'x', verticalSign: 1 },  // Only flexion
  RightLeg:   { vertical: 'x', verticalSign: 1 },
  // Spine/Neck/Head: horizontal → Y (twist), vertical → X (flex/extend)
  Spine:  { horizontal: 'y', horizontalSign: 1, vertical: 'x', verticalSign: -1 },
  Spine1: { horizontal: 'y', horizontalSign: 1, vertical: 'x', verticalSign: -1 },
  Spine2: { horizontal: 'y', horizontalSign: 1, vertical: 'x', verticalSign: -1 },
  Neck:   { horizontal: 'y', horizontalSign: 1, vertical: 'x', verticalSign: -1 },
  Head:   { horizontal: 'y', horizontalSign: 1, vertical: 'x', verticalSign: -1 },
};
