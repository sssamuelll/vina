// Parametric morph system — maps body measurements to bone scale weights

import type { BodyMeasurements } from '../../types/types';

export interface MorphConfig {
  chest: number;         // cm
  waist: number;         // cm
  hip: number;           // cm
  shoulderWidth: number; // cm
  height: number;        // cm
  armLength?: number;    // cm
  inseam?: number;       // cm
}

export interface MorphWeights {
  chestScale: number;     // multiplier, 1.0 = default
  waistScale: number;
  hipScale: number;
  shoulderScale: number;
  heightScale: number;
  armLength: number;
  legLength: number;
}

/** Reference avatar measurements (standard male) */
export const DEFAULT_MEASUREMENTS: MorphConfig = {
  chest: 96,
  waist: 82,
  hip: 96,
  shoulderWidth: 44,
  height: 180,
  armLength: 64,
  inseam: 82,
};

/**
 * Compute bone-scale multipliers from body measurements.
 * Each weight is a ratio against `referencia`: the loaded body's own measurements
 * (a library body → all 1.0, spec 2026-09-29 § 5) or, for a user-uploaded model,
 * the default reference avatar.
 */
export function computeMorphWeights(measurements: MorphConfig, referencia: MorphConfig = DEFAULT_MEASUREMENTS): MorphWeights {
  const d = referencia;

  return {
    chestScale: measurements.chest / d.chest,
    waistScale: measurements.waist / d.waist,
    hipScale: measurements.hip / d.hip,
    shoulderScale: measurements.shoulderWidth / d.shoulderWidth,
    heightScale: measurements.height / d.height,
    armLength: (measurements.armLength ?? d.armLength!) / d.armLength!,
    legLength: (measurements.inseam ?? d.inseam!) / d.inseam!,
  };
}

/** `BodyMeasurements` → `MorphConfig` (hip←hips, shoulderWidth←shoulder). */
export function aMorph(m: BodyMeasurements): MorphConfig {
  return {
    chest: m.chest, waist: m.waist, hip: m.hips, shoulderWidth: m.shoulder,
    height: m.height, armLength: m.armLength, inseam: m.inseam,
  };
}

/** Bone names used by the morph system */
export const MORPH_BONE_MAP = {
  chest: ['Spine1', 'Spine2'],
  waist: ['Spine'],
  hip: ['Hips'],
  shoulderLeft: 'LeftShoulder',
  shoulderRight: 'RightShoulder',
  armLeft: 'LeftArm',
  armRight: 'RightArm',
  legLeft: 'LeftUpLeg',
  legRight: 'RightUpLeg',
} as const;
