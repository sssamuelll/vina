/**
 * Standard size tables for pattern grading.
 * All measurements in cm.
 *
 * @module sizeTable
 */

/** Standard size table for EU women's sizes */
export const EU_WOMEN_SIZES: Record<string, Record<string, number>> = {
  '34': { height: 168, chest: 80, waist: 64, hips: 88, shoulder: 38, armLength: 60, inseam: 79 },
  '36': { height: 168, chest: 84, waist: 68, hips: 92, shoulder: 39, armLength: 60, inseam: 79 },
  '38': { height: 168, chest: 88, waist: 72, hips: 96, shoulder: 40, armLength: 60, inseam: 79 },
  '40': { height: 168, chest: 92, waist: 76, hips: 100, shoulder: 41, armLength: 61, inseam: 80 },
  '42': { height: 168, chest: 96, waist: 80, hips: 104, shoulder: 42, armLength: 61, inseam: 80 },
  '44': { height: 168, chest: 100, waist: 84, hips: 108, shoulder: 43, armLength: 61, inseam: 80 },
  '46': { height: 168, chest: 104, waist: 88, hips: 112, shoulder: 44, armLength: 62, inseam: 81 },
  '48': { height: 168, chest: 108, waist: 94, hips: 118, shoulder: 45, armLength: 62, inseam: 81 },
  'XS': { height: 168, chest: 80, waist: 64, hips: 88, shoulder: 38, armLength: 60, inseam: 79 },
  'S':  { height: 168, chest: 84, waist: 68, hips: 92, shoulder: 39, armLength: 60, inseam: 79 },
  'M':  { height: 168, chest: 88, waist: 72, hips: 96, shoulder: 40, armLength: 60, inseam: 79 },
  'L':  { height: 168, chest: 92, waist: 78, hips: 102, shoulder: 42, armLength: 61, inseam: 80 },
  'XL': { height: 168, chest: 96, waist: 84, hips: 108, shoulder: 43, armLength: 61, inseam: 80 },
  'XXL':{ height: 168, chest: 100, waist: 90, hips: 114, shoulder: 44, armLength: 62, inseam: 81 },
};

/**
 * Parse a size string into a key matching EU_WOMEN_SIZES.
 * Handles "EU 40", "talla 40", "40", "M", etc.
 */
export function parseSize(sizeStr: string): string | null {
  const cleaned = sizeStr.replace(/^(eu|talla|size|us|uk)\s*/i, '').trim().toUpperCase();
  if (EU_WOMEN_SIZES[cleaned]) return cleaned;
  const lower = cleaned.toLowerCase();
  for (const key of Object.keys(EU_WOMEN_SIZES)) {
    if (key.toLowerCase() === lower) return key;
  }
  return null;
}
