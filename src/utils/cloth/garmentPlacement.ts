/**
 * Garment Placement — positions flat 2D pattern pieces near the corresponding
 * body region of the 3D avatar so cloth falls naturally during simulation.
 *
 * @module garmentPlacement
 */

import type { PatternPiece } from '../../types/types';
import type { BodyMeasurements } from '../../types/types';

// ── Types ────────────────────────────────────────────────────────────────────

export type BodyRegion =
  | 'front-torso'
  | 'back-torso'
  | 'left-sleeve'
  | 'right-sleeve'
  | 'front-skirt'
  | 'back-skirt'
  | 'collar'
  | 'waistband'
  | 'hood'
  | 'unknown';

export interface PlacementResult {
  position: [number, number, number];
  rotation: [number, number, number]; // Euler angles in radians
}

// ── Region detection ─────────────────────────────────────────────────────────

// Track sleeve alternation across calls within a single placeGarmentPieces batch
let _sleeveToggle = false;

const FRONT_RE = /\b(front|delantero|delantera|frente)\b/i;
const BACK_RE = /\b(back|espalda|trasero|trasera)\b/i;
const SLEEVE_RE = /\b(sleeve|manga)\b/i;
const LEFT_RE = /\b(left|izquierd[ao])\b/i;
const RIGHT_RE = /\b(right|derech[ao])\b/i;
const SKIRT_RE = /\b(skirt|falda)\b/i;
const COLLAR_RE = /\b(collar|cuello)\b/i;
const WAISTBAND_RE = /\b(waistband|cinturilla|pretina)\b/i;
const HOOD_RE = /\b(hood|capucha)\b/i;
const BODICE_RE = /\b(bodice|cuerpo|corpi[ñn]o)\b/i;
const PANEL_RE = /\b(panel)\b/i;

export function detectBodyRegion(pieceName: string): BodyRegion {
  const n = pieceName;

  // Collar / waistband / hood first (more specific)
  if (COLLAR_RE.test(n)) return 'collar';
  if (WAISTBAND_RE.test(n)) return 'waistband';
  if (HOOD_RE.test(n)) return 'hood';

  // Sleeve
  if (SLEEVE_RE.test(n)) {
    if (LEFT_RE.test(n)) return 'left-sleeve';
    if (RIGHT_RE.test(n)) return 'right-sleeve';
    // Alternate
    _sleeveToggle = !_sleeveToggle;
    return _sleeveToggle ? 'left-sleeve' : 'right-sleeve';
  }

  // Skirt
  if (SKIRT_RE.test(n)) {
    if (BACK_RE.test(n)) return 'back-skirt';
    return 'front-skirt'; // default skirt → front
  }

  // Torso (bodice/panel or explicit front/back)
  const isTorso = BODICE_RE.test(n) || PANEL_RE.test(n);
  if (FRONT_RE.test(n)) return isTorso || true ? 'front-torso' : 'front-torso';
  if (BACK_RE.test(n)) return 'back-torso';
  if (isTorso) return 'front-torso'; // default bodice → front

  // Standalone "Delantero" etc. already caught by FRONT_RE

  return 'unknown';
}

// ── Derived body dimensions (cm → meters) ────────────────────────────────────

interface BodyDimensions {
  heightM: number;
  waistHeight: number;
  shoulderHeight: number;
  neckHeight: number;
  chestDepth: number;
  hipDepth: number;
  shoulderWidth: number;
}

function deriveDimensions(m: BodyMeasurements): BodyDimensions {
  const h = m.height / 100; // cm → m
  return {
    heightM: h,
    waistHeight: m.waistHeight ? m.waistHeight / 100 : h * 0.55,
    shoulderHeight: h * 0.82,
    neckHeight: h * 0.87,
    chestDepth: (m.chest / 100) / (2 * Math.PI) * 0.7,
    hipDepth: (m.hips / 100) / (2 * Math.PI) * 0.7,
    shoulderWidth: m.shoulderWidth ? m.shoulderWidth / 100 : (m.shoulder / 100),
  };
}

// ── Placement computation ────────────────────────────────────────────────────

const OFFSET = 0.05; // 5 cm gap from body surface

export function computePlacement(
  region: BodyRegion,
  measurements: BodyMeasurements,
  pieceIndex: number,
  totalPieces: number,
): PlacementResult {
  const d = deriveDimensions(measurements);
  const torsoHalf = (d.shoulderHeight - d.waistHeight) / 2;

  switch (region) {
    case 'front-torso':
      return {
        position: [0, d.waistHeight + torsoHalf, -(d.chestDepth / 2 + OFFSET)],
        rotation: [0, 0, 0],
      };
    case 'back-torso':
      return {
        position: [0, d.waistHeight + torsoHalf, d.chestDepth / 2 + OFFSET],
        rotation: [0, Math.PI, 0],
      };
    case 'left-sleeve':
      return {
        position: [-(d.shoulderWidth / 2 + OFFSET), d.shoulderHeight, 0],
        rotation: [0, Math.PI / 2, 0],
      };
    case 'right-sleeve':
      return {
        position: [d.shoulderWidth / 2 + OFFSET, d.shoulderHeight, 0],
        rotation: [0, -Math.PI / 2, 0],
      };
    case 'front-skirt':
      return {
        position: [0, d.waistHeight, -(d.hipDepth / 2 + OFFSET)],
        rotation: [0, 0, 0],
      };
    case 'back-skirt':
      return {
        position: [0, d.waistHeight, d.hipDepth / 2 + OFFSET],
        rotation: [0, Math.PI, 0],
      };
    case 'collar':
      return {
        position: [0, d.neckHeight, 0],
        rotation: [-Math.PI / 2, 0, 0],
      };
    case 'waistband':
      return {
        position: [0, d.waistHeight, 0],
        rotation: [-Math.PI / 2, 0, 0],
      };
    case 'hood':
      return {
        position: [0, d.neckHeight + 0.05, d.chestDepth / 2 + OFFSET],
        rotation: [0, Math.PI, 0],
      };
    case 'unknown':
    default: {
      // Fallback: circle arrangement (same as old getPosition)
      const radius = 0.6;
      const angle = (pieceIndex / Math.max(totalPieces, 1)) * Math.PI * 2 - Math.PI / 2;
      return {
        position: [Math.cos(angle) * radius, d.waistHeight + torsoHalf, Math.sin(angle) * radius],
        rotation: [0, 0, 0],
      };
    }
  }
}

// ── Batch placement ──────────────────────────────────────────────────────────

export function placeGarmentPieces(
  pieces: PatternPiece[],
  measurements: BodyMeasurements,
): PlacementResult[] {
  // Reset sleeve toggle for deterministic results
  _sleeveToggle = false;

  return pieces.map((piece, i) => {
    const region = detectBodyRegion(piece.name);
    return computePlacement(region, measurements, i, pieces.length);
  });
}
