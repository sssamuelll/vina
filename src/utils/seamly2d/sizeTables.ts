/**
 * Standard Size Tables — body measurements for standard clothing sizes.
 * 
 * Sources: ISO 8559, European sizing standards, common industry tables.
 * All measurements in mm (matching BodyMeasurements convention).
 *
 * @module seamly2d/sizeTables
 */

import type { BodyMeasurements } from '../../types/types';

export type StandardSize = 'XXS' | 'XS' | 'S' | 'M' | 'L' | 'XL' | 'XXL' | '3XL';
export type SizeSystem = 'eu-women' | 'eu-men' | 'eu-children';

interface SizeTable {
  system: SizeSystem;
  label: string;
  sizes: Record<StandardSize, Partial<BodyMeasurements>>;
}

// ─── European Women's Sizes ─────────────────────────────────────────────────

const EU_WOMEN: SizeTable = {
  system: 'eu-women',
  label: 'European Women',
  sizes: {
    'XXS': {
      height: 1640, chest: 780, waist: 600, hips: 840,
      shoulder: 120, armLength: 580, inseam: 760,
      neckCirc: 340, highBust: 760, shoulderWidth: 370,
    },
    'XS': {
      height: 1660, chest: 820, waist: 640, hips: 880,
      shoulder: 122, armLength: 585, inseam: 770,
      neckCirc: 345, highBust: 800, shoulderWidth: 380,
    },
    'S': {
      height: 1680, chest: 880, waist: 700, hips: 940,
      shoulder: 125, armLength: 590, inseam: 780,
      neckCirc: 355, highBust: 860, shoulderWidth: 390,
    },
    'M': {
      height: 1680, chest: 920, waist: 740, hips: 980,
      shoulder: 128, armLength: 595, inseam: 780,
      neckCirc: 365, highBust: 900, shoulderWidth: 400,
    },
    'L': {
      height: 1680, chest: 960, waist: 780, hips: 1020,
      shoulder: 132, armLength: 600, inseam: 780,
      neckCirc: 375, highBust: 940, shoulderWidth: 410,
    },
    'XL': {
      height: 1680, chest: 1020, waist: 850, hips: 1080,
      shoulder: 136, armLength: 600, inseam: 780,
      neckCirc: 390, highBust: 1000, shoulderWidth: 425,
    },
    'XXL': {
      height: 1680, chest: 1080, waist: 920, hips: 1140,
      shoulder: 140, armLength: 600, inseam: 780,
      neckCirc: 400, highBust: 1060, shoulderWidth: 440,
    },
    '3XL': {
      height: 1680, chest: 1140, waist: 980, hips: 1200,
      shoulder: 144, armLength: 600, inseam: 780,
      neckCirc: 410, highBust: 1120, shoulderWidth: 450,
    },
  },
};

// ─── European Men's Sizes ───────────────────────────────────────────────────

const EU_MEN: SizeTable = {
  system: 'eu-men',
  label: 'European Men',
  sizes: {
    'XXS': {
      height: 1720, chest: 860, waist: 720, hips: 880,
      shoulder: 135, armLength: 610, inseam: 790,
      neckCirc: 370, shoulderWidth: 420,
    },
    'XS': {
      height: 1740, chest: 900, waist: 760, hips: 920,
      shoulder: 138, armLength: 620, inseam: 800,
      neckCirc: 380, shoulderWidth: 430,
    },
    'S': {
      height: 1760, chest: 940, waist: 800, hips: 960,
      shoulder: 142, armLength: 630, inseam: 810,
      neckCirc: 390, shoulderWidth: 440,
    },
    'M': {
      height: 1780, chest: 980, waist: 840, hips: 1000,
      shoulder: 146, armLength: 640, inseam: 820,
      neckCirc: 400, shoulderWidth: 460,
    },
    'L': {
      height: 1800, chest: 1040, waist: 900, hips: 1040,
      shoulder: 150, armLength: 650, inseam: 830,
      neckCirc: 415, shoulderWidth: 475,
    },
    'XL': {
      height: 1800, chest: 1100, waist: 970, hips: 1080,
      shoulder: 154, armLength: 650, inseam: 830,
      neckCirc: 430, shoulderWidth: 490,
    },
    'XXL': {
      height: 1800, chest: 1160, waist: 1040, hips: 1140,
      shoulder: 158, armLength: 650, inseam: 830,
      neckCirc: 445, shoulderWidth: 505,
    },
    '3XL': {
      height: 1800, chest: 1220, waist: 1100, hips: 1200,
      shoulder: 162, armLength: 650, inseam: 830,
      neckCirc: 460, shoulderWidth: 520,
    },
  },
};

// ─── Children's Sizes (by height) ──────────────────────────────────────────

const EU_CHILDREN: SizeTable = {
  system: 'eu-children',
  label: 'European Children',
  sizes: {
    'XXS': { // ~104cm / 4y
      height: 1040, chest: 560, waist: 520, hips: 580,
      shoulder: 85, armLength: 370, inseam: 440,
    },
    'XS': { // ~116cm / 6y
      height: 1160, chest: 600, waist: 540, hips: 620,
      shoulder: 90, armLength: 410, inseam: 510,
    },
    'S': { // ~128cm / 8y
      height: 1280, chest: 640, waist: 560, hips: 660,
      shoulder: 100, armLength: 450, inseam: 570,
    },
    'M': { // ~140cm / 10y
      height: 1400, chest: 680, waist: 580, hips: 720,
      shoulder: 108, armLength: 490, inseam: 630,
    },
    'L': { // ~152cm / 12y
      height: 1520, chest: 740, waist: 620, hips: 780,
      shoulder: 115, armLength: 530, inseam: 690,
    },
    'XL': { // ~164cm / 14y
      height: 1640, chest: 800, waist: 660, hips: 840,
      shoulder: 122, armLength: 560, inseam: 740,
    },
    'XXL': { // ~176cm / 16y
      height: 1760, chest: 860, waist: 700, hips: 900,
      shoulder: 130, armLength: 580, inseam: 790,
    },
    '3XL': { // not typical for children
      height: 1800, chest: 900, waist: 740, hips: 940,
      shoulder: 135, armLength: 600, inseam: 810,
    },
  },
};

// ─── Registry ───────────────────────────────────────────────────────────────

const TABLES: Record<SizeSystem, SizeTable> = {
  'eu-women': EU_WOMEN,
  'eu-men': EU_MEN,
  'eu-children': EU_CHILDREN,
};

// ─── Public API ─────────────────────────────────────────────────────────────

/** Get measurements for a standard size. */
export function getSizeMeasurements(
  size: StandardSize,
  system: SizeSystem = 'eu-women'
): Partial<BodyMeasurements> | undefined {
  return TABLES[system]?.sizes[size];
}

/** Get all available size systems. */
export function getSizeSystems(): Array<{ system: SizeSystem; label: string }> {
  return Object.values(TABLES).map(t => ({ system: t.system, label: t.label }));
}

/** Get all sizes for a system. */
export function getAvailableSizes(system: SizeSystem = 'eu-women'): StandardSize[] {
  return Object.keys(TABLES[system]?.sizes || {}) as StandardSize[];
}

/** Infer size system from gender. */
export function inferSizeSystem(gender: string): SizeSystem {
  if (gender === 'men') return 'eu-men';
  if (gender === 'children') return 'eu-children';
  return 'eu-women';
}

/** Build full BodyMeasurements from a size, filling required defaults. */
export function buildMeasurements(
  size: StandardSize,
  system: SizeSystem = 'eu-women',
  overrides?: Partial<BodyMeasurements>
): BodyMeasurements {
  const base = getSizeMeasurements(size, system) || {};
  return {
    height: 1680,
    chest: 920,
    waist: 740,
    hips: 980,
    shoulder: 128,
    armLength: 595,
    inseam: 780,
    ...base,
    ...overrides,
  } as BodyMeasurements;
}
