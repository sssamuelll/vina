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
import { mmToM, cmToM } from '../geometry';

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
// Added per the male_shirt template baseline: 7/17 pieces (Yoke, Pocket×4,
// Placket×2) were falling to the circle fallback because the regex below
// didn't cover these common shirt sub-pieces. Each routes to torso so the
// avatar collider catches them; sub-pieces don't have a dedicated body
// region today, but front-torso/back-torso is a safe approximation.
const YOKE_RE = /\b(yoke|canes[uú]|sprone|empi[èe]cement|sattel)/i;
const POCKET_RE = /\b(pocket|bolsillo|tasca|poche|tasche)/i;
const PLACKET_RE = /\b(placket|tapeta|patta|patte|knopfleiste)/i;

/**
 * Insert spaces at camelCase boundaries so the \b word-boundary regexes can
 * match keywords that sit mid-name. Without this, "ShortSleeve" fails
 * /\bsleeve/i because there's no word boundary between "Short" and "Sleeve".
 * "ShortSleeve" → "Short Sleeve", "PocketFlapRound" → "Pocket Flap Round".
 * Also splits letter/digit transitions ("Panel2" → "Panel 2").
 */
function splitCamelCase(name: string): string {
  return name
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/([A-Za-z])(\d)/g, '$1 $2');
}

function detectFromName(rawName: string): BodyRegion {
  const name = splitCamelCase(rawName);
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
  // Sub-piece detection runs before the generic FRONT/BACK fallback so that
  // "FrontPocket" doesn't accidentally match FRONT_RE first and lose the
  // pocket semantic. For placement purposes both routes converge on
  // front-torso, but the order keeps the classification honest if future
  // code branches on the specific sub-piece type.
  if (POCKET_RE.test(name)) return BACK_RE.test(name) ? 'back-torso' : 'front-torso';
  // Plackets are the button strip down the front of a shirt — virtually
  // always front. No back-placket convention to worry about.
  if (PLACKET_RE.test(name)) return 'front-torso';
  // Yokes on men's shirts are typically back (across upper back); honor
  // explicit FRONT prefix when present, otherwise default to back-torso.
  if (YOKE_RE.test(name)) return FRONT_RE.test(name) ? 'front-torso' : 'back-torso';
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
  const h = cmToM(m.height);
  const chestCirc = cmToM(m.chest);
  const hipCirc = cmToM(m.hips);
  return {
    heightM: h,
    waistHeight: m.waistHeight ? cmToM(m.waistHeight) : h * 0.55,
    shoulderHeight: h * 0.82,
    neckHeight: h * 0.87,
    chestRadius: chestCirc / (2 * Math.PI),
    hipRadius: hipCirc / (2 * Math.PI),
    shoulderWidth: m.shoulderWidth ? cmToM(m.shoulderWidth) : cmToM(m.shoulder),
    armLength: m.armLength ? cmToM(m.armLength) : h * 0.33,
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
  const pH = mmToM(pieceGeometry.heightMm);

  // Both PieceMesh and CDT mesher now output pieces in XZ plane (Y=0).
  // Pattern X → 3D X (width), Pattern Y → 3D Z (height/length).
  // Pieces are flat/horizontal. Need rotation to stand them up.
  //
  // To stand up a piece: rotate -π/2 around X (Z becomes Y, -Y becomes Z)

  switch (region) {
    case 'front-torso':
      return {
        position: [0, midTorso, -(d.chestRadius + GAP)],
        rotation: [-Math.PI / 2, 0, 0], // stand up, face forward (-Z)
      };
    case 'back-torso':
      return {
        position: [0, midTorso, d.chestRadius + GAP],
        rotation: [-Math.PI / 2, Math.PI, 0], // stand up, face backward (+Z)
      };
    case 'left-sleeve':
      return {
        // Offset from shoulder, stand up, rotate to point left
        position: [-(d.shoulderWidth / 2 + 0.12), d.shoulderHeight - 0.03, 0],
        rotation: [-Math.PI / 2, Math.PI / 2, 0], // stand up, face left (-X)
      };
    case 'right-sleeve':
      return {
        position: [d.shoulderWidth / 2 + 0.12, d.shoulderHeight - 0.03, 0],
        rotation: [-Math.PI / 2, -Math.PI / 2, 0], // stand up, face right (+X)
      };
    case 'front-skirt':
      return {
        position: [0, d.waistHeight - pH / 2, -(d.hipRadius + GAP)],
        rotation: [-Math.PI / 2, 0, 0], // stand up, face front
      };
    case 'back-skirt':
      return {
        position: [0, d.waistHeight - pH / 2, d.hipRadius + GAP],
        rotation: [-Math.PI / 2, Math.PI, 0], // stand up, face back
      };
    case 'collar':
      return {
        // Collar in front of neck, standing vertical like front-torso
        position: [0, d.neckHeight, -(d.chestRadius * 0.5 + GAP)],
        rotation: [-Math.PI / 2, 0, 0], // stand up, face forward
      };
    case 'waistband':
      return {
        // Waistband in front of waist, standing vertical
        position: [0, d.waistHeight, -(d.hipRadius * 0.5 + GAP)],
        rotation: [-Math.PI / 2, 0, 0], // stand up, face forward
      };
    case 'hood':
      return {
        // Behind head, standing vertical facing backward
        position: [0, d.neckHeight + 0.05, d.chestRadius + GAP],
        rotation: [-Math.PI / 2, Math.PI, 0], // stand up, face backward
      };
    case 'cuff-left':
      return {
        // At wrist, standing vertical facing outward
        position: [-(d.shoulderWidth / 2 + d.armLength * 0.9), d.shoulderHeight - d.armLength * 0.85, 0],
        rotation: [-Math.PI / 2, Math.PI / 2, 0], // stand up, face left
      };
    case 'cuff-right':
      return {
        position: [d.shoulderWidth / 2 + d.armLength * 0.9, d.shoulderHeight - d.armLength * 0.85, 0],
        rotation: [-Math.PI / 2, -Math.PI / 2, 0], // stand up, face right
      };
    case 'unknown':
    default: {
      // Fallback: arrange in a circle around the torso, standing up
      const radius = Math.max(d.chestRadius, d.hipRadius) + 0.12;
      return {
        position: [0, midTorso, -radius],
        rotation: [-Math.PI / 2, 0, 0], // stand up
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

  // Compute regions ONCE to avoid double-calling detectBodyRegion
  // (it has toggle side effects for sleeve/cuff L/R assignment)
  const regions = pieces.map(p => detectBodyRegion(p));
  const unknownCount = regions.filter(r => r === 'unknown').length;
  // When EVERY piece is unknown, the pattern came from a source that doesn't
  // expose category metadata (notably the Seamly2D converter, which produces
  // technical names like "A1, A2, ..." that the regex in detectFromName can't
  // match against semantic words like "front" or "sleeve"). The original
  // circle fallback was visible-on-purpose UX feedback ("user, please classify
  // these") but produces the canonical #531 drape failure: pieces fall as
  // loose panels because they start arranged around the torso at midTorso
  // height with no orientation toward the body, then get caught by the avatar
  // collider at hip-level when gravity drops them. Tracked baseline (pre-fix):
  // 4195 cloth vertices fell below waist on male_shirt.json.
  //
  // Heuristic fix: when ALL pieces are unclassified, alternate front-torso /
  // back-torso by index. Not perfect — sleeves/skirts/etc. get incorrectly
  // placed as torso too — but at least they drape on the body instead of
  // dangling. Patterns with at least one classified piece keep the circle
  // fallback for the unclassified remainder (the UX-feedback case still
  // works for mixed projects).
  //
  // Proper long-term fix is upstream: the Seamly adapter should infer
  // category (via catalog metadata or geometric heuristics) so pieces never
  // arrive here as unknown. Filed as follow-up; see docs/plans for status.
  const allUnknown = unknownCount === pieces.length && pieces.length > 0;
  let unknownIndex = 0;

  return pieces.map((piece, i) => {
    const region = regions[i];
    const geo = outlineBBox(piece.outline);

    if (region === 'unknown') {
      if (allUnknown) {
        // Alternate front/back torso so the avatar collider catches them
        // and they drape, instead of falling past at hip-level. Stagger X
        // within each side group so multiple front (or multiple back) pieces
        // don't stack at identical coordinates — stacked pieces give the
        // cloth solver collinear vertices and produce NaN constraints.
        const isFront = i % 2 === 0;
        const sideIndex = Math.floor(i / 2);
        const halfCount = Math.ceil(pieces.length / 2);
        const base = computePlacement(
          isFront ? 'front-torso' : 'back-torso',
          measurements,
          { widthMm: geo.width, heightMm: geo.height },
        );
        const d = deriveDimensions(measurements);
        // Spread sideIndex across roughly ±shoulderWidth/2; single-side groups
        // (halfCount === 1) keep the centered position.
        const xOffset = halfCount > 1
          ? (sideIndex - (halfCount - 1) / 2) * (d.shoulderWidth / halfCount)
          : 0;
        return {
          position: [
            base.position[0] + xOffset,
            base.position[1],
            base.position[2],
          ] as [number, number, number],
          rotation: base.rotation,
        };
      }

      // Mixed case: keep visible circle so user notices the unclassified piece.
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
        // -π/2 on X stands the piece up from horizontal to vertical,
        // Y rotation faces it outward from the circle
        rotation: [-Math.PI / 2, -angle - Math.PI / 2, 0] as [number, number, number],
      };
    }

    return computePlacement(region, measurements, {
      widthMm: geo.width,
      heightMm: geo.height,
    });
  });
}
