/**
 * Internal unit conversions between cm (body data convention), mm (pattern
 * data convention), and metres (Three.js world convention).
 *
 * Convention ratified by C6 Fase 2 (drift-fase2-c6-units.md):
 * - BodyMeasurements stored in cm (industry convention).
 * - Pattern data (seamAllowance, outline coords, internal lines, etc.) in mm.
 * - Three.js world space in metres.
 *
 * Display formatters live separately in src/utils/units.ts (legacy, will move
 * to src/utils/display/units.ts when D3 lands). This file is internal-only.
 */

/** cm → m. */
export function cmToM(cm: number): number {
  return cm / 100;
}

/** m → cm. */
export function mToCm(m: number): number {
  return m * 100;
}

/** mm → m. */
export function mmToM(mm: number): number {
  return mm / 1000;
}

/** m → mm. */
export function mToMm(m: number): number {
  return m * 1000;
}

/** cm → mm. */
export function cmToMm(cm: number): number {
  return cm * 10;
}

/** mm → cm. */
export function mmToCm(mm: number): number {
  return mm / 10;
}
