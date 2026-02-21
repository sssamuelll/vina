// Parametric morph system — maps body measurements to bone scale weights

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
 * Each weight is a ratio against the default reference avatar.
 */
export function computeMorphWeights(measurements: MorphConfig): MorphWeights {
  const d = DEFAULT_MEASUREMENTS;

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
