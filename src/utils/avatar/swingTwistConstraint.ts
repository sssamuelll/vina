/**
 * Swing-Twist Joint Constraint System
 * 
 * Replaces per-axis Euler clamping with anatomically correct constraints.
 * Each joint is defined by:
 * - A swing cone (elliptical) limiting how far the bone can deviate from its rest direction
 * - A twist range limiting axial rotation
 * 
 * This is the same approach used by PhysX, Bullet, and Havok for ragdoll physics.
 * 
 * Reference: "Swing-Twist Decomposition in Clifford Algebra" (Dobrowolski, 2015)
 */

import * as THREE from 'three';

const DEG2RAD = Math.PI / 180;
const RAD2DEG = 180 / Math.PI;

// --- Swing-Twist Decomposition ---

/**
 * Decompose a quaternion into swing and twist components around a given axis.
 * q = swing * twist
 * twist rotates around `axis`, swing rotates perpendicular to it.
 */
export function decomposeSwingTwist(
  q: THREE.Quaternion,
  axis: THREE.Vector3
): { swing: THREE.Quaternion; twist: THREE.Quaternion } {
  // Project q's vector part onto the twist axis
  const projection = axis.clone().multiplyScalar(
    q.x * axis.x + q.y * axis.y + q.z * axis.z
  );

  const twist = new THREE.Quaternion(
    projection.x, projection.y, projection.z, q.w
  ).normalize();

  // Handle degenerate case (180° rotation perpendicular to axis)
  if (twist.lengthSq() < 1e-10) {
    twist.set(0, 0, 0, 1);
  }

  // swing = q * twist⁻¹
  const swing = q.clone().multiply(twist.clone().invert());

  return { swing, twist };
}

// --- Constraint Definitions ---

export interface SwingTwistConstraint {
  /** The bone's primary axis in local space (direction it "points along") */
  twistAxis: THREE.Vector3;
  /** Max swing angle from rest direction (degrees) — primary plane */
  swingAngle1: number;
  /** Max swing angle from rest direction (degrees) — secondary plane (elliptical cone) */
  swingAngle2: number;
  /** Twist range: [minTwist, maxTwist] in degrees */
  twistMin: number;
  twistMax: number;
}

/**
 * Clamp a rotation quaternion within its swing-twist limits.
 * Returns the clamped quaternion.
 */
export function clampSwingTwist(
  rotation: THREE.Quaternion,
  constraint: SwingTwistConstraint
): THREE.Quaternion {
  const { swing, twist } = decomposeSwingTwist(rotation, constraint.twistAxis);

  // --- Clamp twist ---
  const twistAngle = 2 * Math.atan2(
    new THREE.Vector3(twist.x, twist.y, twist.z).length(),
    twist.w
  ) * RAD2DEG;

  // Get signed twist angle
  const twistDot = twist.x * constraint.twistAxis.x +
    twist.y * constraint.twistAxis.y +
    twist.z * constraint.twistAxis.z;
  const signedTwist = twistDot >= 0 ? twistAngle : -twistAngle;

  const clampedTwist = twist.clone();
  if (signedTwist < constraint.twistMin || signedTwist > constraint.twistMax) {
    const clamped = Math.max(constraint.twistMin, Math.min(constraint.twistMax, signedTwist));
    clampedTwist.setFromAxisAngle(constraint.twistAxis, clamped * DEG2RAD);
  }

  // --- Clamp swing (elliptical cone) ---
  // Get the swing axis and angle
  const swingAxis = new THREE.Vector3(swing.x, swing.y, swing.z);
  const swingAxisLen = swingAxis.length();
  const clampedSwing = swing.clone();

  if (swingAxisLen > 1e-6) {
    swingAxis.divideScalar(swingAxisLen); // normalize
    const swingAngle = 2 * Math.atan2(swingAxisLen, swing.w) * RAD2DEG;

    // Project swing axis onto the two perpendicular planes to get elliptical limit
    // We use a simple elliptical cone: the max angle varies based on direction
    // For simplicity, use the two swing angles as semi-axes of an ellipse
    // The actual limit at angle θ is: r(θ) = a*b / sqrt((b*cos(θ))² + (a*sin(θ))²)
    // where a = swingAngle1, b = swingAngle2
    
    // Get the direction of swing relative to twist axis perpendicular plane
    // We need two reference axes perpendicular to twistAxis
    const perpAxis1 = new THREE.Vector3();
    if (Math.abs(constraint.twistAxis.y) < 0.9) {
      perpAxis1.crossVectors(constraint.twistAxis, new THREE.Vector3(0, 1, 0)).normalize();
    } else {
      perpAxis1.crossVectors(constraint.twistAxis, new THREE.Vector3(1, 0, 0)).normalize();
    }
    const perpAxis2 = new THREE.Vector3().crossVectors(constraint.twistAxis, perpAxis1).normalize();

    const proj1 = swingAxis.dot(perpAxis1);
    const proj2 = swingAxis.dot(perpAxis2);
    const theta = Math.atan2(proj2, proj1);

    const a = constraint.swingAngle1;
    const b = constraint.swingAngle2;
    const cosT = Math.cos(theta);
    const sinT = Math.sin(theta);
    const maxSwing = (a * b) / Math.sqrt((b * cosT) ** 2 + (a * sinT) ** 2);

    if (swingAngle > maxSwing) {
      clampedSwing.setFromAxisAngle(swingAxis, maxSwing * DEG2RAD);
    }
  }

  // Reconstruct: q = swing * twist
  return clampedSwing.multiply(clampedTwist);
}

// --- Anatomical Constraint Definitions ---

/**
 * Joint constraints based on human biomechanics.
 * 
 * The twist axis is the bone's primary direction (Y-axis for Mixamo/Avaturn bones).
 * Swing angles define the cone of allowed movement.
 * 
 * References:
 * - Kapandji, "The Physiology of the Joints" (6th ed.)
 * - Neumann, "Kinesiology of the Musculoskeletal System" (3rd ed.)
 */
export const ANATOMICAL_CONSTRAINTS: Record<string, SwingTwistConstraint> = {
  // === SHOULDER (glenohumeral) ===
  // Ball-and-socket joint with the widest ROM in the body
  // Flexion/extension: ~180°/60°, Abduction: ~180°, Rotation: ~90°/90°
  LeftArm: {
    twistAxis: new THREE.Vector3(0, 1, 0), // bone Y = along the arm
    swingAngle1: 170,  // primary plane (elevation/depression) — can raise overhead
    swingAngle2: 100,  // secondary plane (forward/backward)
    twistMin: -90,     // internal rotation
    twistMax: 90,      // external rotation
  },
  RightArm: {
    twistAxis: new THREE.Vector3(0, 1, 0),
    swingAngle1: 170,
    swingAngle2: 100,
    twistMin: -90,
    twistMax: 90,
  },

  // === SHOULDER GIRDLE (clavicle/scapula) ===
  // Limited motion: elevation ~30°, protraction/retraction ~15°
  LeftShoulder: {
    twistAxis: new THREE.Vector3(0, 1, 0),
    swingAngle1: 25,
    swingAngle2: 15,
    twistMin: -10,
    twistMax: 10,
  },
  RightShoulder: {
    twistAxis: new THREE.Vector3(0, 1, 0),
    swingAngle1: 25,
    swingAngle2: 15,
    twistMin: -10,
    twistMax: 10,
  },

  // === ELBOW (hinge joint) ===
  // Flexion: 0-145°, very limited lateral/rotation
  // In Mixamo, forearm flexion is primarily around local X
  LeftForeArm: {
    twistAxis: new THREE.Vector3(0, 1, 0),
    swingAngle1: 145,  // flexion
    swingAngle2: 5,    // almost zero lateral — it's a hinge!
    twistMin: -85,     // pronation
    twistMax: 85,      // supination
  },
  RightForeArm: {
    twistAxis: new THREE.Vector3(0, 1, 0),
    swingAngle1: 145,
    swingAngle2: 5,
    twistMin: -85,
    twistMax: 85,
  },

  // === HIP (ball-and-socket) ===
  // Flexion: ~120°, Extension: ~20°, Abduction: ~45°, Adduction: ~30°
  LeftUpLeg: {
    twistAxis: new THREE.Vector3(0, 1, 0),
    swingAngle1: 120,  // flexion/extension
    swingAngle2: 45,   // abduction/adduction
    twistMin: -45,     // internal rotation
    twistMax: 45,      // external rotation
  },
  RightUpLeg: {
    twistAxis: new THREE.Vector3(0, 1, 0),
    swingAngle1: 120,
    swingAngle2: 45,
    twistMin: -45,
    twistMax: 45,
  },

  // === KNEE (hinge joint) ===
  // Flexion: 0-140°, essentially no lateral or rotation
  LeftLeg: {
    twistAxis: new THREE.Vector3(0, 1, 0),
    swingAngle1: 140,
    swingAngle2: 5,     // hinge — almost zero lateral
    twistMin: -5,
    twistMax: 5,
  },
  RightLeg: {
    twistAxis: new THREE.Vector3(0, 1, 0),
    swingAngle1: 140,
    swingAngle2: 5,
    twistMin: -5,
    twistMax: 5,
  },

  // === SPINE (each segment has limited ROM, cumulative effect) ===
  Spine: {
    twistAxis: new THREE.Vector3(0, 1, 0),
    swingAngle1: 20,
    swingAngle2: 15,
    twistMin: -15,
    twistMax: 15,
  },
  Spine1: {
    twistAxis: new THREE.Vector3(0, 1, 0),
    swingAngle1: 15,
    swingAngle2: 12,
    twistMin: -10,
    twistMax: 10,
  },
  Spine2: {
    twistAxis: new THREE.Vector3(0, 1, 0),
    swingAngle1: 15,
    swingAngle2: 12,
    twistMin: -10,
    twistMax: 10,
  },

  // === NECK & HEAD ===
  Neck: {
    twistAxis: new THREE.Vector3(0, 1, 0),
    swingAngle1: 40,   // flexion/extension
    swingAngle2: 35,   // lateral flexion
    twistMin: -50,     // rotation
    twistMax: 50,
  },
  Head: {
    twistAxis: new THREE.Vector3(0, 1, 0),
    swingAngle1: 25,
    swingAngle2: 20,
    twistMin: -40,
    twistMax: 40,
  },
};

// --- Integration helper ---

/**
 * Convert Euler XYZ degrees → quaternion → apply swing-twist constraint → return clamped Euler.
 * Drop-in replacement for the old clampJointRotation.
 */
export function constrainJointRotation(
  jointName: string,
  rotation: { x: number; y: number; z: number }
): { x: number; y: number; z: number } {
  const constraint = ANATOMICAL_CONSTRAINTS[jointName];
  if (!constraint) return rotation;

  // Convert Euler to Quaternion (ZYX order, matching AvatarModel)
  const euler = new THREE.Euler(
    rotation.x * DEG2RAD,
    rotation.y * DEG2RAD,
    rotation.z * DEG2RAD,
    'ZYX'
  );
  const q = new THREE.Quaternion().setFromEuler(euler);

  // Apply swing-twist constraint
  const clamped = clampSwingTwist(q, constraint);

  // Convert back to Euler
  const clampedEuler = new THREE.Euler().setFromQuaternion(clamped, 'ZYX');

  return {
    x: clampedEuler.x * RAD2DEG,
    y: clampedEuler.y * RAD2DEG,
    z: clampedEuler.z * RAD2DEG,
  };
}
