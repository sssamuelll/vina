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
import { flattenPath, commandRangeToFlattened } from '../seam/index';
import { surfaceFrame, frameToEulerXYZ, type SurfaceFrame, type V3 } from './arrangement/surfaceFrame';

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
export function outlineBBox(outline: PathCommand[]): { width: number; height: number } {
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

// Cyrillic alternates are appended without `\b` because JS regex word
// boundaries are ASCII-only — `\bспинка` never matches. Seamly2D piece
// names are typically single tokens (e.g. "Спинка", "Полочка"), so plain
// substring match on Cyrillic is safe without overmatching. Coverage:
// Russian + Ukrainian since both appear in upstream Seamly2D samples
// (e.g. jacket1_52-176 mixes them — "Комір" UA collar, "Спинка" RU back).
//
// Finnish alternates are also appended without `\b` because Finnish is
// heavily compound (e.g. "Rintataskutaka" = chest-pocket-back), and a
// substantial fraction of the gent_jacket_with_tummy template's 36 piece
// names embed the root mid-word ("Alakaulus" = low-collar, "Hihayläosa" =
// sleeve-upper-part). Roots: taka=back, etu=front, hiha=sleeve,
// kaulus=collar, tasku=pocket, rinta=chest, sivu=side.
const FRONT_RE = /\b(front|delantero|delantera|frente|davanti|devant|vorder)|полочка|перед|etu|rinta|sivu/i;
const BACK_RE = /\b(back|espalda|trasero|trasera|dietro|dos|r[üu]ck)|спинка|спина|taka/i;
const SLEEVE_RE = /\b(sleeve|manga|manica|manche|[äa]rmel)|рукав|hiha/i;
const LEFT_RE = /\b(left|izquierd[ao]|sinistr[ao]|gauche|link)|ліви|лев/i;
const RIGHT_RE = /\b(right|derech[ao]|destr[ao]|droit[e]?|recht)|прав/i;
const SKIRT_RE = /\b(skirt|falda|gonna|jupe|rock)|юбка|спідниця/i;
const COLLAR_RE = /\b(collar|cuello|colletto|col|kragen|neck.?bind)|комір|воротник|kaulus/i;
// `waist[ -]?band` instead of `waistband` so that splitCamelCase("WaistBand1")
// → "Waist Band 1" still matches. The old single-token form was a silent gap
// — any camelCase'd waistband name (real example: trousers.json "WaistBand1")
// fell through to 'unknown' and onto the circle fallback at midTorso.
const WAISTBAND_RE = /\b(waist[ -]?band|cinturilla|pretina)|пояс/i;
const HOOD_RE = /\b(hood|capucha|cappuccio)|капюшон/i;
const CUFF_RE = /\b(cuff|pu[ñn]o|polsino)|манжет/i;
// Added per the male_shirt template baseline: 7/17 pieces (Yoke, Pocket×4,
// Placket×2) were falling to the circle fallback because the regex below
// didn't cover these common shirt sub-pieces. Each routes to torso so the
// avatar collider catches them; sub-pieces don't have a dedicated body
// region today, but front-torso/back-torso is a safe approximation.
const YOKE_RE = /\b(yoke|canes[uú]|sprone|empi[èe]cement|sattel)|кокетка/i;
const POCKET_RE = /\b(pocket|bolsillo|tasca|poche|tasche)|карман|кишеня|tasku/i;
const PLACKET_RE = /\b(placket|tapeta|patta|patte|knopfleiste)|планка/i;
// Facings (interior front strips, e.g. jacket lapels) had no name-fallback
// before — only the category switch in detectBodyRegion handled them. With
// Cyrillic patterns like jacket1_52-176 the LLM classifier often returns
// empty category, so name fallback is the only line of defence. Route to
// front-torso (where lapel facings actually live), honoring BACK_RE if
// the piece name explicitly says back (rare but possible for back facings).
const FACING_RE = /\b(facing|vista|guarnizione|parementure|besatz)|подборт|підборт/i;

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
  // Facings: default to front-torso (lapel facings); honor explicit BACK.
  if (FACING_RE.test(name)) return BACK_RE.test(name) ? 'back-torso' : 'front-torso';
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

export interface BodyDimensions {
  heightM: number;
  waistHeight: number;
  shoulderHeight: number;
  neckHeight: number;
  chestRadius: number;
  hipRadius: number;
  shoulderWidth: number;
  armLength: number;
  neckR: number;
  armR: number;
}

export function deriveDimensions(m: BodyMeasurements): BodyDimensions {
  const h = cmToM(m.height);
  const chestCirc = cmToM(m.chest);
  const hipCirc = cmToM(m.hips);
  const chestRadius = chestCirc / (2 * Math.PI);
  return {
    heightM: h,
    waistHeight: m.waistHeight ? cmToM(m.waistHeight) : h * 0.55,
    shoulderHeight: h * 0.82,
    neckHeight: h * 0.87,
    chestRadius,
    hipRadius: hipCirc / (2 * Math.PI),
    shoulderWidth: m.shoulderWidth ? cmToM(m.shoulderWidth) : cmToM(m.shoulder),
    armLength: m.armLength ? cmToM(m.armLength) : h * 0.33,
    neckR: m.neckCirc ? cmToM(m.neckCirc) / (2 * Math.PI) : chestRadius * 0.4,
    armR: m.upperArmCirc ? cmToM(m.upperArmCirc) / (2 * Math.PI) : 0.05,
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

// Re-export V3 and SurfaceFrame so callers don't need to reach into surfaceFrame.ts.
export type { V3, SurfaceFrame };

/**
 * Collision-aware auto pose for a region (#887 Phase 1): position = surface
 * landmark + outward normal · (radius + GAP) — tangent to and OUTSIDE the body
 * cylinder — and orientation from the surface frame (replaces the old hard-coded
 * per-region rotation that placed sleeves as a flat z=0 plane through the arm).
 */
export function computeAutoFrame(
  region: BodyRegion,
  measurements: BodyMeasurements,
  pieceGeometry: { widthMm: number; heightMm: number },
  axisHint?: V3,
): { placement: PlacementResult; frame: SurfaceFrame } {
  const d = deriveDimensions(measurements);
  const pH = mmToM(pieceGeometry.heightMm);
  const frame = surfaceFrame(region, d, axisHint, pH);

  // Hang skirts only from their landmark by half the piece height along
  // the tangent, matching the old vertical-centering behaviour.
  const hang = (region === 'front-skirt' || region === 'back-skirt') ? pH / 2 : 0;

  const offset = frame.radius + GAP;
  const position: [number, number, number] = [
    frame.point[0] + frame.normal[0] * offset - frame.tangent[0] * hang,
    frame.point[1] + frame.normal[1] * offset - frame.tangent[1] * hang,
    frame.point[2] + frame.normal[2] * offset - frame.tangent[2] * hang,
  ];
  const rotation = frameToEulerXYZ(frame.normal, frame.tangent);
  return { placement: { position, rotation }, frame };
}

export function computePlacement(
  region: BodyRegion,
  measurements: BodyMeasurements,
  pieceGeometry: { widthMm: number; heightMm: number },
): PlacementResult {
  return computeAutoFrame(region, measurements, pieceGeometry).placement;
}

// ── Placement transform (shared) ─────────────────────────────────────────────

/**
 * EXACT same rigid transform the render/solver paths apply to placed meshes
 * (GarmentSimulation staticGeometry + placedMeshes, placementWorker): Euler
 * XYZ intrinsic order (Rx, then Ry, then Rz) + translation. Any consumer
 * that reasons about world positions of pattern geometry (orientation
 * normalization below, autoSew world refinement) MUST use this, not its own
 * derivation — the mariaShirt.m4 sonda pins world coherence end-to-end.
 */
export function placementLocalToWorld(
  local: [number, number, number],
  placement: PlacementResult,
): [number, number, number] {
  const [vx, vy, vz] = local;
  const [rx, ry, rz] = placement.rotation;
  const [px, py, pz] = placement.position;
  const cx = Math.cos(rx), sx = Math.sin(rx);
  const cy = Math.cos(ry), sy = Math.sin(ry);
  const cz = Math.cos(rz), sz = Math.sin(rz);
  const y1 = vy * cx - vz * sx, z1 = vy * sx + vz * cx;
  const x2 = vx * cy + z1 * sy, z2 = -vx * sy + z1 * cy;
  const x3 = x2 * cz - y1 * sz, y3 = x2 * sz + y1 * cz;
  return [x3 + px, y3 + py, z2 + pz];
}

/**
 * Map a 2D pattern point (mm) to world (m) under a placement, using the
 * mesher's local convention: ((x−cx)·0.001, 0, (y−cy)·0.001) with cx/cy the
 * piece bbox center (cdtMesher.convertToClothMeshData).
 */
export function patternPointToWorld(
  x2d: number,
  y2d: number,
  bboxCenter: { cx: number; cy: number },
  placement: PlacementResult,
): [number, number, number] {
  return placementLocalToWorld(
    [(x2d - bboxCenter.cx) * 0.001, 0, (y2d - bboxCenter.cy) * 0.001],
    placement,
  );
}

/**
 * The VIEW realization of a placement — what PieceMesh/DraggablePiece actually
 * render: geometry local = (x·s, 0, −y·s) (commandsToShape emits −y, then
 * rotateX(π/2) → pattern Y lands NEGATED on local Z) and the Euler applied via
 * THREE `<group rotation>` ('XYZ': Rz acts on the vector FIRST, M = Rx·Ry·Rz).
 *
 * This is NOT `placementLocalToWorld` (Rz·Ry·Rx on positive-Z local): the two
 * realizations coincide on the upright family [−π/2, ry, rz] (torso/collar —
 * the path the mariaShirt.m4 sonda pinned) but DIVERGE on the sleeve triples
 * [π/2, ±π/2, 0]: the helper models a vertical card (cap up in Y) while the
 * view renders a horizontal card whose cap pointed DISTAL — the "curvas del
 * cap hacia afuera" Samuel saw (bloque cosido María-style, plan §6bis). Any
 * orientation decision about the CARD must measure here, in the space where
 * it is applied — the same lesson `computeWrapFlipFlags` already encodes for
 * the wrap (arrangementBinding).
 *
 * Takes the MESHER-local convention ((x−cx)·0.001, 0, (y−cy)·0.001) so callers
 * share `anatomyLocalEndpoints`; the view's Z-negation happens inside.
 */
export function cardLocalToWorld(
  local: [number, number, number],
  placement: PlacementResult,
): [number, number, number] {
  const [lx, ly, lz] = local;
  const x = lx, y = ly, z = -lz; // view geometry: pattern Y negated on local Z
  const [rx, ry, rz] = placement.rotation;
  const [px, py, pz] = placement.position;
  const cx = Math.cos(rx), sx = Math.sin(rx);
  const cy = Math.cos(ry), sy = Math.sin(ry);
  const cz = Math.cos(rz), sz = Math.sin(rz);
  const x1 = x * cz - y * sz, y1 = x * sz + y * cz;   // Rz (first, THREE 'XYZ')
  const x2 = x1 * cy + z * sy, z2 = -x1 * sy + z * cy; // Ry
  const y3 = y1 * cx - z2 * sx, z3 = y1 * sx + z2 * cx; // Rx (last)
  return [x2 + px, y3 + py, z3 + pz];
}

/**
 * TRUE in-plane 180° of the CARD (rotation about its normal), as an Euler
 * triple in the view's composition: M' = M·Ry_local(π) with M = Rx·Ry·Rz
 * (THREE 'XYZ'), re-extracted. Unlike the closed-form [rx, −ry, rz+π] (proven
 * for the upright family under the OTHER composition), this keeps the card's
 * face toward the camera and preserves chirality — for María's sleeve pair it
 * exactly swaps the L/R base triples ([π/2,∓π/2,0] ↔ [π/2,±π/2,0]), which is
 * how the crossed caps read: the pair was flipped.
 */
export function flipCardInPlane(
  rotation: [number, number, number],
): [number, number, number] {
  const [rx, ry, rz] = rotation;
  const cx = Math.cos(rx), sx = Math.sin(rx);
  const cy = Math.cos(ry), sy = Math.sin(ry);
  const cz = Math.cos(rz), sz = Math.sin(rz);
  // M = Rx·Ry·Rz (three.js Matrix4.makeRotationFromEuler, 'XYZ' branch) —
  // only the entries the 'XYZ' extraction reads.
  let m11 = cy * cz, m13 = sy;
  const m12 = -cy * sz;
  let m23 = -sx * cy, m33 = cx * cy;
  const m22 = cx * cz - sx * sz * sy;
  const m32 = sx * cz + cx * sz * sy;
  // … · Ry(π) = diag(−1,1,−1): negate columns 1 and 3 (the in-plane axes).
  m11 = -m11; m13 = -m13; m23 = -m23; m33 = -m33;
  // Euler 'XYZ' extraction (three.js Euler.setFromRotationMatrix).
  const ry2 = Math.asin(Math.max(-1, Math.min(1, m13)));
  if (Math.abs(m13) < 0.9999999) {
    return [Math.atan2(-m23, m33), ry2, Math.atan2(-m12, m11)];
  }
  return [Math.atan2(m32, m22), ry2, 0];
}

/** Bbox center (mm) of the flattened outline — the mesher's centering. */
export function outlineBBoxCenter(outline: PathCommand[]): { cx: number; cy: number } {
  const pts = flattenPath(outline, 12);
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const p of pts) {
    if (p.x < minX) minX = p.x;
    if (p.x > maxX) maxX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.y > maxY) maxY = p.y;
  }
  return { cx: (minX + maxX) / 2, cy: (minY + maxY) / 2 };
}

// ── Anatomical in-plane orientation (camisa de María plan, M4-C) ────────────
//
// Real CAD patterns make NO orientation promises: María's DXF draws all 5
// pieces with anatomy toward negative Y (the app's 2D editor is SVG y-down,
// so they LOOK upright), and the raw placement mapped 2D y positively into
// world Y — front and both sleeves landed upside-down (neckline at the hem
// height, sleeve cuffs above the caps) while the back came out upright only
// because its facing π happened to un-invert it. Convention guessing is
// exactly what burned the removed 2026-05-30 pass (see note below): the fix
// is to read the ANATOMY. M1's geometric classifier guarantees imported
// pieces carry role-bearing edges, so we measure where the anatomical TOP
// (neckline / shoulder / sleeveCap) and BOTTOM (hemline / cuffEdge) actually
// land in world and flip in-plane when they're inverted.
//
// The in-plane 180° flip has a closed Euler form for our [-π/2, ry, rz]
// triples: prepending a local Ry(π) (negate both in-plane axes) equals
// [-π/2, −ry, rz+π] under the Rx→Ry→Rz application order (verified
// algebraically + pinned by the mariaShirt.m4 sonda). X-mirroring across
// pieces is NOT resolved here — left/right pairing is the autoSew world
// refinement's job; this pass only guarantees anatomy-up.
//
// SLEEVE CARDS (bloque cosido María-style, 2026-07-05) are the exception on
// both counts: the closed form above is only an in-plane 180 under the
// composition the VIEW does NOT use, and world-Y never constrained a card
// whose length runs along ±X. They get their own measurement + application in
// view space (`cardLocalToWorld` + `flipCardInPlane`, below) with the wrap's
// criterion: sleeveCap PROXIMAL, facing the armhole it sews to.

export const ANATOMY_TOP_ROOTS = new Set(['neckline', 'shoulder', 'sleevecap', 'collarneckedge']);
export const ANATOMY_BOTTOM_ROOTS = new Set(['hemline', 'cuffedge', 'collarouteredge']);

export function edgeRoot(name: string): string {
  return name.toLowerCase().replace(/-\d+$/, '');
}

/**
 * Mesher-local endpoints (((x−cx)·0.001, 0, (y−cy)·0.001) — the
 * cdtMesher.convertToClothMeshData convention) of the piece's edges whose root
 * is in `roots`. The wrap consumes these to decide its own (wrap-space) flip,
 * which is NOT the rigid-Euler flip `computeFlipFlags` produces — the rigid
 * placement and the wrap map local→world differently (front/back normal and
 * the binormal basis), so they disagree on front-torso/collar. Returns [] when
 * the piece carries no matching anatomical edge.
 */
export function anatomyLocalEndpoints(
  piece: PatternPiece,
  roots: Set<string>,
): Array<[number, number, number]> {
  if (!piece.edges || piece.edges.length === 0) return [];
  const center = outlineBBoxCenter(piece.outline);
  const flat = flattenPath(piece.outline, 12);
  const out: Array<[number, number, number]> = [];
  for (const e of piece.edges) {
    if (!roots.has(edgeRoot(e.name))) continue;
    const [fs, fe] = commandRangeToFlattened(piece.outline, e.segmentRange, 12);
    for (const idx of [fs, fe % flat.length]) {
      const p = flat[idx];
      if (!p) continue;
      out.push([(p.x - center.cx) * 0.001, 0, (p.y - center.cy) * 0.001]);
    }
  }
  return out;
}

/** Mean projection onto `dir` (world) of the endpoints of the piece's edges
 * whose root is in `roots`. With dir=(0,1,0) this is FP-identical to the old
 * mean world-Y (the mariaShirt.m4 sonda pins that path byte-identical). */
function meanEdgeWorldProj(
  piece: PatternPiece,
  placement: PlacementResult,
  roots: Set<string>,
  dir: [number, number, number],
): number | null {
  if (!piece.edges || piece.edges.length === 0) return null;
  const center = outlineBBoxCenter(piece.outline);
  const flat = flattenPath(piece.outline, 12);
  let sum = 0;
  let n = 0;
  for (const e of piece.edges) {
    if (!roots.has(edgeRoot(e.name))) continue;
    const [fs, fe] = commandRangeToFlattened(piece.outline, e.segmentRange, 12);
    for (const idx of [fs, fe % flat.length]) {
      const p = flat[idx];
      if (!p) continue;
      const w = patternPointToWorld(p.x, p.y, center, placement);
      sum += w[0] * dir[0] + w[1] * dir[1] + w[2] * dir[2];
      n++;
    }
  }
  return n > 0 ? sum / n : null;
}

/**
 * Per-piece in-plane flip flags: `true` where the piece's anatomy lands
 * upside-down under its placement (anatomical TOP edges below BOTTOM in world).
 * Pieces without anatomical evidence (no semantic edges, no top/bottom roles —
 * synthetic rectangles, unclassified pieces) report `false`.
 *
 * THE anatomy-up oracle of the RIGID path: `normalizeInPlaneOrientation`
 * applies it as an Euler flip. (The wrap has its own wrap-space oracle,
 * `computeWrapFlipFlags` — the two bases differ; see arrangementBinding.)
 *
 * `regions` (bloque cosido María-style, plan §6bis 2026-07-05): upright
 * regions measure along world up (legacy world-Y, byte-identical without
 * regions — mariaShirt.m4 sonda). SLEEVE/CUFF cards are different twice over:
 * (a) their length runs along ±X in the view, so world-Y never constrained
 * them, and (b) the view realization DIVERGES from `placementLocalToWorld` on
 * their triples (see `cardLocalToWorld`) — the old oracle modeled a vertical
 * card (cap up ⇒ "fine") while the rendered card lay horizontal with the cap
 * DISTAL: las curvas del cap hacia afuera, lejos de la sisa. Sleeves therefore
 * measure IN CARD SPACE along the region's distal axis and require the
 * sleeveCap PROXIMAL (toward the armhole it sews to) — the same criterion
 * `computeWrapFlipFlags` applies in wrap space.
 */
export function computeFlipFlags(
  pieces: PatternPiece[],
  placements: PlacementResult[],
  regions?: BodyRegion[],
  axes?: Array<V3 | undefined>,
): boolean[] {
  return placements.map((placement, i) => {
    const piece = pieces[i];
    if (!piece) return false;
    const region = regions?.[i];
    const isSleeve = region === 'left-sleeve' || region === 'right-sleeve'
      || region === 'cuff-left' || region === 'cuff-right';
    if (!isSleeve) {
      const topY = meanEdgeWorldProj(piece, placement, ANATOMY_TOP_ROOTS, [0, 1, 0]);
      const bottomY = meanEdgeWorldProj(piece, placement, ANATOMY_BOTTOM_ROOTS, [0, 1, 0]);
      if (topY == null || bottomY == null) return false;
      return topY < bottomY; // anatomy inverted → flip
    }
    // Distal axis = the frame axis the card was placed with (`axes`, from
    // placeGarmentPieces — bone-hinted when the skeleton is ready). Fallback
    // in lockstep with surfaceFrame's no-hint defaults (left −X, right +X).
    // Measured via cardLocalToWorld: the space the flip is applied in.
    const dir: V3 = axes?.[i]
      ?? [region === 'right-sleeve' || region === 'cuff-right' ? 1 : -1, 0, 0];
    const proj = (roots: Set<string>): number | null => {
      const locals = anatomyLocalEndpoints(piece, roots);
      if (locals.length === 0) return null;
      let sum = 0;
      for (const lv of locals) {
        const w = cardLocalToWorld(lv, placement);
        sum += w[0] * dir[0] + w[1] * dir[1] + w[2] * dir[2];
      }
      return sum / locals.length;
    };
    const capP = proj(ANATOMY_TOP_ROOTS);
    const cuffP = proj(ANATOMY_BOTTOM_ROOTS);
    if (capP == null || cuffP == null) return false;
    return capP > cuffP; // cap distal → flip (cap must face the armhole)
  });
}

/**
 * Flip pieces whose anatomy lands upside-down in world. Returns a new array;
 * placements without anatomical evidence (no semantic edges, no top/bottom
 * roles — synthetic rectangles, unclassified pieces) pass through untouched.
 *
 * Delegates the decision to `computeFlipFlags` (single oracle) and applies it
 * as the closed-form in-plane 180° Euler flip — byte-identical to the previous
 * inline test (mariaShirt.m4 sonda pins this).
 */
export function normalizeInPlaneOrientation(
  pieces: PatternPiece[],
  placements: PlacementResult[],
  regions?: BodyRegion[],
  axes?: Array<V3 | undefined>,
): PlacementResult[] {
  const flips = computeFlipFlags(pieces, placements, regions, axes);
  return placements.map((placement, i) => {
    if (!flips[i]) return placement; // anatomy already up (or no evidence)
    const region = regions?.[i];
    if (region === 'left-sleeve' || region === 'right-sleeve'
      || region === 'cuff-left' || region === 'cuff-right') {
      // Sleeve cards flip in VIEW space (true in-plane 180 about the card
      // normal) — the closed form below is an in-plane 180 only under the
      // OTHER composition; on sleeve triples it flips the card about its
      // width axis instead (back face out, silhouette mirrored).
      return { ...placement, rotation: flipCardInPlane(placement.rotation) };
    }
    const [rx, ry, rz] = placement.rotation;
    return { ...placement, rotation: [rx, -ry, rz + Math.PI] as [number, number, number] };
  });
}

// ── Batch placement ──────────────────────────────────────────────────────────

/**
 * Place all garment pieces around the avatar.
 *
 * Uses PieceCategory + PieceSide for classification (language-independent),
 * falls back to name-based regex. Piece geometry (bounding box) is used
 * to adjust vertical positioning (skirts hang from waist, sleeves from shoulder).
 */
// NOTE: per-piece "boca abajo" correction used to live here as
// isPieceUpsideDown + applyVerticalOrientation. It was removed 2026-05-30
// because back then DXF imports never carried role-bearing edges (only
// geometric topEdge/bottomEdge/…), so the pass never fired on real input.
// M1 (camisa de María) changed that premise: the geometric classifier now
// guarantees imported pieces carry anatomy (neckline/shoulder/sleeveCap/
// hemline/cuffEdge), so the idea returned as normalizeInPlaneOrientation
// (M4-C, above) — anatomy-measured, not convention-guessed. The renderer's
// `flippedPieceIds` (DraggablePiece scale-z) remains the human override for
// true reflections.

/**
 * Toggle-reset + single deterministic `detectBodyRegion` pass — the ONE place
 * the side-effecting L/R toggles are exercised for a batch. Returns the RAW
 * regions (with `'unknown'` preserved); callers layer the `allUnknown`
 * alternation on top. Exportada para que `dress` (IA 1b-2) distinga una pieza
 * sin región de la alternancia delante/detrás que `computeEffectiveRegions` le
 * pone a un patrón sin clasificar. Sigue siendo el único sitio que reinicia
 * los toggles: nadie más la duplica.
 */
export function rawRegions(pieces: PatternPiece[]): BodyRegion[] {
  _sleeveToggle = false;
  _cuffToggle = false;
  // Compute regions ONCE to avoid double-calling detectBodyRegion
  // (it has toggle side effects for sleeve/cuff L/R assignment).
  return pieces.map(p => detectBodyRegion(p));
}

/**
 * The EFFECTIVE per-piece regions a batch placement uses — the deterministic
 * region assignment, NOT a fresh per-piece `detectBodyRegion`.
 *
 * `detectBodyRegion` has toggle side-effects (`_sleeveToggle`/`_cuffToggle`)
 * for L/R assignment of side-less sleeve/cuff pairs, so calling it per piece
 * out of band can flip L↔R relative to what the batch assigned. This helper is
 * the single deterministic source: toggle reset + one mapping pass (via
 * `rawRegions`, shared with `placeGarmentPieces`), then the same `allUnknown`
 * front/back alternation `placeGarmentPieces` uses (so a fully-unclassified
 * pattern reports the same regions it's placed with, not a row of `'unknown'`).
 * The placement path stays byte-identical (pinned by the mariaShirt.m4 sonda).
 */
export function computeEffectiveRegions(pieces: PatternPiece[]): BodyRegion[] {
  const regions = rawRegions(pieces);
  const unknownCount = regions.filter(r => r === 'unknown').length;
  const allUnknown = unknownCount === pieces.length && pieces.length > 0;
  if (!allUnknown) return regions;

  // Fully-unclassified pattern: the placement alternates front/back torso by
  // index (see placeGarmentPieces). Reflect that here so the effective region
  // matches the pose actually used, instead of leaving them all 'unknown'.
  return regions.map((_, i) => (i % 2 === 0 ? 'front-torso' : 'back-torso'));
}

export function placeGarmentPieces(
  pieces: PatternPiece[],
  measurements: BodyMeasurements,
  /** Per-piece bone axis hints (tilt A-pose, bloque cosido María-style parte
   *  2): the CARDS finally use the same hinted frames the wrap/override paths
   *  already used — sleeve cards lean along the real arm instead of the
   *  horizontal T-pose default. Omitted (all other callers) = defaults,
   *  byte-identical to before. */
  opts?: { axisHints?: Record<string, V3> },
): PlacementResult[] {
  // Raw regions (toggle reset + single detectBodyRegion pass) — same source as
  // computeEffectiveRegions. The loop below still needs the raw 'unknown'
  // marker to stagger X / pick the circle fallback, so it works off the raw
  // regions and applies the allUnknown alternation itself.
  const regions = rawRegions(pieces);
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

  // Frame axis per piece — the flip oracle measures the sleeve criterion
  // along the axis the card was actually placed with (hinted or default).
  const axes: Array<V3 | undefined> = new Array(pieces.length);

  const raw = pieces.map((piece, i) => {
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

    const { placement, frame } = computeAutoFrame(
      region,
      measurements,
      { widthMm: geo.width, heightMm: geo.height },
      opts?.axisHints?.[piece.id],
    );
    axes[i] = frame.axis;
    return placement;
  });

  // Anatomical orientation pass (M4-C): single exit point so EVERY consumer
  // (solver init, arrange view, sew tools, thunks) sees the same upright
  // placements. Regions feed the sleeve-card axial criterion (cap proximal —
  // cosido María-style); allUnknown batches carry 'unknown' → world-Y as ever.
  return normalizeInPlaneOrientation(pieces, raw, regions, axes);
}

// ─── Arrangement overrides (camisa de María plan, M2) ────────────────────────

/**
 * Apply the user's arrange-mode drag positions on top of the computed
 * anatomical placements.
 *
 * M2 fix (hallazgo A del diagnóstico del blob, ya sospechado por el
 * addendum v3 del DoD #506): `arrangementOverrides` — escrito por el drag
 * de DraggablePiece y leído por TODA la vista arrange (DraggablePiece,
 * SeamRenderer3D, Sew3DTool) — nunca llegaba al solver: `placedMeshes`
 * usaba solo `placeGarmentPieces`, así que al pulsar Simulate la
 * colocación manual del usuario se descartaba en silencio. Esta función
 * es el cable: la simulación arranca EXACTAMENTE donde la vista arrange
 * dice que están las piezas.
 *
 * Only POSITION is overridable (the drag surface moves pieces; rotation
 * stays anatomical). Pieces without an override keep their computed
 * placement untouched.
 */
export function applyArrangementOverrides(
  placements: PlacementResult[],
  pieces: Array<{ id: string }>,
  overrides: Record<string, [number, number, number]> | undefined,
): PlacementResult[] {
  if (!overrides || Object.keys(overrides).length === 0) return placements;
  return placements.map((placement, i) => {
    const override = overrides[pieces[i]?.id];
    return override ? { ...placement, position: override } : placement;
  });
}
