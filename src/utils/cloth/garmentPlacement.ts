/**
 * Garment Placement — positions flat 2D pattern pieces around the 3D avatar.
 *
 * CLO3D-style approach: each piece is placed as a flat plane tangent to the
 * body surface at the appropriate region. Uses PieceCategory + PieceSide
 * (from semantic classification) for robust, language-independent placement.
 * Falls back to name-based regex for unclassified pieces.
 *
 * @module garmentPlacement
 */

import type { PatternPiece, PathCommand } from '../../types/types';
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
  | 'cuff-left'
  | 'cuff-right'
  | 'unknown';

export interface PlacementResult {
  position: [number, number, number];
  rotation: [number, number, number]; // Euler angles in radians
}

// ── Piece geometry helpers ───────────────────────────────────────────────────

/** Compute bounding box of outline in mm */
function outlineBBox(outline: PathCommand[]): { width: number; height: number } {
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const cmd of outline) {
    for (let i = 0; i < cmd.values.length - 1; i += 2) {
      const x = cmd.values[i], y = cmd.values[i + 1];
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
  }
  return {
    width: maxX > minX ? maxX - minX : 0,
    height: maxY > minY ? maxY - minY : 0,
  };
}

// ── Region detection (category-first, name-fallback) ─────────────────────────

let _sleeveToggle = false;
let _cuffToggle = false;

const FRONT_RE = /\b(front|delantero|delantera|frente|davanti|devant|vorder)/i;
const BACK_RE = /\b(back|espalda|trasero|trasera|dietro|dos|r[üu]ck)/i;
const SLEEVE_RE = /\b(sleeve|manga|manica|manche|[äa]rmel)/i;
const LEFT_RE = /\b(left|izquierd[ao]|sinistr[ao]|gauche|link)/i;
const RIGHT_RE = /\b(right|derech[ao]|destr[ao]|droit[e]?|recht)/i;
const SKIRT_RE = /\b(skirt|falda|gonna|jupe|rock)/i;
const COLLAR_RE = /\b(collar|cuello|colletto|col|kragen|neck.?bind)/i;
const WAISTBAND_RE = /\b(waistband|cinturilla|pretina)/i;
const HOOD_RE = /\b(hood|capucha|cappuccio)/i;
const CUFF_RE = /\b(cuff|pu[ñn]o|polsino)/i;

function detectFromName(name: string): BodyRegion {
  if (COLLAR_RE.test(name)) return 'collar';
  if (WAISTBAND_RE.test(name)) return 'waistband';
  if (HOOD_RE.test(name)) return 'hood';
  if (CUFF_RE.test(name)) {
    if (LEFT_RE.test(name)) return 'cuff-left';
    if (RIGHT_RE.test(name)) return 'cuff-right';
    _cuffToggle = !_cuffToggle;
    return _cuffToggle ? 'cuff-left' : 'cuff-right';
  }
  if (SLEEVE_RE.test(name)) {
    if (LEFT_RE.test(name)) return 'left-sleeve';
    if (RIGHT_RE.test(name)) return 'right-sleeve';
    _sleeveToggle = !_sleeveToggle;
    return _sleeveToggle ? 'left-sleeve' : 'right-sleeve';
  }
  if (SKIRT_RE.test(name)) return BACK_RE.test(name) ? 'back-skirt' : 'front-skirt';
  if (BACK_RE.test(name)) return 'back-torso';
  if (FRONT_RE.test(name)) return 'front-torso';
  return 'unknown';
}

/**
 * Determine body region from piece metadata (category + side).
 * Falls back to name-based regex for unclassified pieces.
 */
export function detectBodyRegion(piece: PatternPiece): BodyRegion {
  const cat = piece.category;
  const side = piece.side;

  if (cat) {
    switch (cat) {
      case 'collar': return 'collar';
      case 'hood': return 'hood';
      case 'waistband': return 'waistband';
      case 'cuff':
        if (side === 'left') return 'cuff-left';
        if (side === 'right') return 'cuff-right';
        _cuffToggle = !_cuffToggle;
        return _cuffToggle ? 'cuff-left' : 'cuff-right';
      case 'sleeve':
        if (side === 'left') return 'left-sleeve';
        if (side === 'right') return 'right-sleeve';
        _sleeveToggle = !_sleeveToggle;
        return _sleeveToggle ? 'left-sleeve' : 'right-sleeve';
      case 'skirt':
      case 'trouser':
        return side === 'back' ? 'back-skirt' : 'front-skirt';
      case 'bodice':
      case 'yoke':
      case 'facing':
      case 'lining':
        return side === 'back' ? 'back-torso' : 'front-torso';
      case 'pocket':
        return side === 'back' ? 'back-torso' : 'front-torso';
      default:
        break;
    }
  }

  // Fallback: name-based detection
  return detectFromName(piece.name);
}

// ── Derived body dimensions (cm → meters) ────────────────────────────────────

interface BodyDimensions {
  heightM: number;
  waistHeight: number;
  shoulderHeight: number;
  neckHeight: number;
  chestRadius: number;
  hipRadius: number;
  shoulderWidth: number;
  armLength: number;
}

export function deriveDimensions(m: BodyMeasurements): BodyDimensions {
  const h = m.height / 100;
  const chestCirc = m.chest / 100;
  const hipCirc = m.hips / 100;
  return {
    heightM: h,
    waistHeight: m.waistHeight ? m.waistHeight / 100 : h * 0.55,
    shoulderHeight: h * 0.82,
    neckHeight: h * 0.87,
    chestRadius: chestCirc / (2 * Math.PI),
    hipRadius: hipCirc / (2 * Math.PI),
    shoulderWidth: m.shoulderWidth ? m.shoulderWidth / 100 : (m.shoulder / 100),
    armLength: m.armLength ? m.armLength / 100 : h * 0.33,
  };
}

// ── CLO3D-style placement ────────────────────────────────────────────────────
//
// Each piece is placed as a flat 2D plane tangent to the body surface.
// Position = center of the piece relative to the avatar origin.
// Rotation = orientation so the piece faces outward from the body.
//
// Key insight: pieces should be slightly offset from the body (GAP)
// so simulation can drape them. Too close = interpenetration. Too far = slow drape.

const GAP = 0.03; // 3cm from body surface

export function computePlacement(
  region: BodyRegion,
  measurements: BodyMeasurements,
  pieceGeometry: { widthMm: number; heightMm: number },
): PlacementResult {
  const d = deriveDimensions(measurements);
  const midTorso = (d.shoulderHeight + d.waistHeight) / 2;

  // Piece height in meters (for vertical centering)
  const pH = pieceGeometry.heightMm / 1000;

  // ShapeGeometry (PieceMesh) creates pieces in XY plane (Z=0), facing +Z.
  // Pattern X → 3D X, Pattern Y → 3D -Y (negated).
  // Pieces are already vertical. Rotations orient them around avatar.

  switch (region) {
    case 'front-torso':
      return {
        position: [0, midTorso, -(d.chestRadius + GAP)],
        rotation: [0, Math.PI, 0], // flip to face -Z (toward camera/front)
      };
    case 'back-torso':
      return {
        position: [0, midTorso, d.chestRadius + GAP],
        rotation: [0, 0, 0], // already faces +Z (away from camera/back)
      };
    case 'left-sleeve':
      return {
        // Position further out from shoulder to avoid arm penetration
        position: [-(d.shoulderWidth / 2 + 0.15), d.shoulderHeight - 0.05, 0],
        rotation: [0, -Math.PI / 2, -Math.PI / 8], // face -X (left), slight downward tilt
      };
    case 'right-sleeve':
      return {
        position: [d.shoulderWidth / 2 + 0.15, d.shoulderHeight - 0.05, 0],
        rotation: [0, Math.PI / 2, Math.PI / 8], // face +X (right), slight downward tilt
      };
    case 'front-skirt':
      return {
        position: [0, d.waistHeight - pH / 2, -(d.hipRadius + GAP)],
        rotation: [0, Math.PI, 0], // flip to face front
      };
    case 'back-skirt':
      return {
        position: [0, d.waistHeight - pH / 2, d.hipRadius + GAP],
        rotation: [0, 0, 0], // faces back
      };
    case 'collar':
      return {
        // Position in front of neck, vertical like other front pieces
        position: [0, d.neckHeight, -(d.chestRadius * 0.6 + GAP)],
        rotation: [0, Math.PI, 0], // face front (same as front-torso)
      };
    case 'waistband':
      return {
        // Position in front of waist, vertical
        position: [0, d.waistHeight + 0.02, -(d.hipRadius * 0.8 + GAP)],
        rotation: [0, Math.PI, 0], // face front
      };
    case 'hood':
      return {
        // Position behind head, vertical, facing backward
        position: [0, d.neckHeight + 0.1, d.chestRadius * 0.8],
        rotation: [0, 0, 0], // face back (default orientation)
      };
    case 'cuff-left':
      return {
        // Position at wrist level, vertical, facing outward
        position: [-(d.shoulderWidth / 2 + d.armLength * 0.9 + 0.05), d.shoulderHeight - d.armLength * 0.85, 0],
        rotation: [0, -Math.PI / 2, 0], // face left
      };
    case 'cuff-right':
      return {
        position: [d.shoulderWidth / 2 + d.armLength * 0.9 + 0.05, d.shoulderHeight - d.armLength * 0.85, 0],
        rotation: [0, Math.PI / 2, 0], // face right
      };
    case 'unknown':
    default: {
      // Fallback: arrange in a circle around the torso
      const radius = Math.max(d.chestRadius, d.hipRadius) + 0.15;
      return {
        position: [0, midTorso, -radius],
        rotation: [0, Math.PI, 0], // face front
      };
    }
  }
}

// ── Batch placement ──────────────────────────────────────────────────────────

/**
 * Place all garment pieces around the avatar.
 *
 * Uses PieceCategory + PieceSide for classification (language-independent),
 * falls back to name-based regex. Piece geometry (bounding box) is used
 * to adjust vertical positioning (skirts hang from waist, sleeves from shoulder).
 */
export function placeGarmentPieces(
  pieces: PatternPiece[],
  measurements: BodyMeasurements,
): PlacementResult[] {
  _sleeveToggle = false;
  _cuffToggle = false;

  // Track unknowns for circular fallback distribution
  let unknownIndex = 0;
  const unknownCount = pieces.filter(p => detectBodyRegion(p) === 'unknown').length;

  return pieces.map((piece) => {
    const region = detectBodyRegion(piece);
    const geo = outlineBBox(piece.outline);

    if (region === 'unknown') {
      // Distribute unknowns in a circle
      const d = deriveDimensions(measurements);
      const radius = Math.max(d.chestRadius, d.hipRadius) + 0.15;
      const angle = (unknownIndex / Math.max(unknownCount, 1)) * Math.PI * 2 - Math.PI / 2;
      unknownIndex++;
      return {
        position: [
          Math.cos(angle) * radius,
          (d.shoulderHeight + d.waistHeight) / 2,
          Math.sin(angle) * radius,
        ] as [number, number, number],
        rotation: [0, -angle - Math.PI / 2, 0] as [number, number, number],
      };
    }

    return computePlacement(region, measurements, {
      widthMm: geo.width,
      heightMm: geo.height,
    });
  });
}
