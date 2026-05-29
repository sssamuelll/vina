/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect } from 'vitest';
import { detectBodyRegion, computePlacement, placeGarmentPieces, isPieceUpsideDown } from '../garmentPlacement';
import type { PatternPiece, BodyMeasurements, SemanticEdge } from '../../../types/types';

const MEAS: BodyMeasurements = {
  height: 168, chest: 88, waist: 72, hips: 96,
  shoulder: 40, armLength: 60, inseam: 80,
} as BodyMeasurements;

function makePiece(name: string, category?: string, side?: string): PatternPiece {
  return {
    id: '1', name,
    category: category as any,
    side: side as any,
    outline: [
      { type: 'M', values: [0, 0] },
      { type: 'L', values: [200, 0] },
      { type: 'L', values: [200, 300] },
      { type: 'L', values: [0, 300] },
      { type: 'Z', values: [] },
    ],
    internals: [],
    position: { x: 0, y: 0 },
    rotation: 0, mirrored: false, seamAllowance: 0,
    layer: 1, sublayer: 0, active: true, createdAt: Date.now(), updatedAt: Date.now(),
  };
}

describe('isPieceUpsideDown', () => {
  // Rectangle in pattern (Y-down) space: top edge at y=0, bottom edge at y=300.
  // outlineToLocal3D maps local-z = -patternY (centered), so the small-pattern-Y
  // (top-of-pattern) edge renders HIGHER on the avatar.
  const outline: PatternPiece['outline'] = [
    { type: 'M', values: [0, 0] },
    { type: 'L', values: [200, 0] },   // edge 1: top of pattern (y≈0)
    { type: 'L', values: [200, 300] }, // edge 2: right
    { type: 'L', values: [0, 300] },   // edge 3: bottom of pattern (y≈300)
    { type: 'Z', values: [] },
  ];
  function pieceWithEdges(edges: SemanticEdge[]): PatternPiece {
    return { ...makePiece('p', 'bodice', 'front'), outline, edges };
  }
  const e = (name: string, range: [number, number]): SemanticEdge =>
    ({ id: name, name, segmentRange: range, edgeType: 'seam' } as SemanticEdge);

  it('is false when neckline (top) is at the pattern top and hemline at the bottom', () => {
    const piece = pieceWithEdges([e('neckline', [0, 1]), e('hemline', [2, 3])]);
    expect(isPieceUpsideDown(piece)).toBe(false);
  });

  it('is true when neckline sits BELOW the hemline (piece laid out head-down)', () => {
    const piece = pieceWithEdges([e('neckline', [2, 3]), e('hemline', [0, 1])]);
    expect(isPieceUpsideDown(piece)).toBe(true);
  });

  it('is false when there is no top/bottom pair to compare', () => {
    expect(isPieceUpsideDown(pieceWithEdges([e('sideSeam', [1, 2])]))).toBe(false);
    expect(isPieceUpsideDown({ ...makePiece('p', 'bodice', 'front'), outline })).toBe(false);
  });

  it('flips the stand-up rotation for an upside-down classified piece', () => {
    const piece = pieceWithEdges([e('neckline', [2, 3]), e('hemline', [0, 1])]);
    const [placement] = placeGarmentPieces([piece], MEAS);
    // front-torso base rotation is [-π/2, 0, 0]; corrected to [+π/2, 0, 0].
    expect(placement.rotation[0]).toBeCloseTo(Math.PI / 2, 6);
  });
});

describe('detectBodyRegion', () => {
  it('uses category when available', () => {
    expect(detectBodyRegion(makePiece('xyz', 'bodice', 'front'))).toBe('front-torso');
    expect(detectBodyRegion(makePiece('xyz', 'bodice', 'back'))).toBe('back-torso');
    expect(detectBodyRegion(makePiece('xyz', 'sleeve', 'left'))).toBe('left-sleeve');
    expect(detectBodyRegion(makePiece('xyz', 'sleeve', 'right'))).toBe('right-sleeve');
    expect(detectBodyRegion(makePiece('xyz', 'skirt', 'front'))).toBe('front-skirt');
    expect(detectBodyRegion(makePiece('xyz', 'collar'))).toBe('collar');
    expect(detectBodyRegion(makePiece('xyz', 'hood'))).toBe('hood');
  });

  it('falls back to name when no category', () => {
    expect(detectBodyRegion(makePiece('Front Panel'))).toBe('front-torso');
    expect(detectBodyRegion(makePiece('Espalda'))).toBe('back-torso');
    expect(detectBodyRegion(makePiece('Manga'))).toMatch(/sleeve/);
    expect(detectBodyRegion(makePiece('Cuello'))).toBe('collar');
    expect(detectBodyRegion(makePiece('Falda Front'))).toBe('front-skirt');
  });

  it('supports multiple languages', () => {
    // German
    expect(detectBodyRegion(makePiece('Vorderteil'))).toBe('front-torso');
    expect(detectBodyRegion(makePiece('Rückteil'))).toBe('back-torso');
    // French
    expect(detectBodyRegion(makePiece('Devant'))).toBe('front-torso');
    expect(detectBodyRegion(makePiece('Dos principal'))).toBe('back-torso');
    // Italian
    expect(detectBodyRegion(makePiece('Davanti'))).toBe('front-torso');
    expect(detectBodyRegion(makePiece('Dietro'))).toBe('back-torso');
  });

  it('returns unknown for unrecognized names', () => {
    expect(detectBodyRegion(makePiece('Piece_42'))).toBe('unknown');
  });

  // Added for the male_shirt baseline. Pre-fix these 7/17 pieces all
  // returned 'unknown' and routed to the circle fallback, dragging the
  // simulation into the canonical #531 panels-falling symptom.
  it('detects yoke, pocket, and placket sub-pieces from name (#506 baseline fix)', () => {
    // Yoke — defaults to back-torso (typical men's shirt yoke is across back)
    expect(detectBodyRegion(makePiece('Yoke'))).toBe('back-torso');
    expect(detectBodyRegion(makePiece('FrontYoke'))).toBe('front-torso');
    // Pocket — defaults to front-torso (typical front chest pocket); honors
    // BACK_RE when present.
    expect(detectBodyRegion(makePiece('Pocket'))).toBe('front-torso');
    expect(detectBodyRegion(makePiece('PocketRound'))).toBe('front-torso');
    expect(detectBodyRegion(makePiece('PocketFlap'))).toBe('front-torso');
    expect(detectBodyRegion(makePiece('PocketFlapRound'))).toBe('front-torso');
    expect(detectBodyRegion(makePiece('BackPocket'))).toBe('back-torso');
    // Placket — always front (no back-placket convention).
    expect(detectBodyRegion(makePiece('PlacketUnder'))).toBe('front-torso');
    expect(detectBodyRegion(makePiece('PlacketTop'))).toBe('front-torso');
  });

  it('multilingual sub-piece detection (yoke/pocket/placket)', () => {
    // Spanish
    expect(detectBodyRegion(makePiece('Canesú'))).toBe('back-torso');
    expect(detectBodyRegion(makePiece('Bolsillo'))).toBe('front-torso');
    expect(detectBodyRegion(makePiece('Tapeta'))).toBe('front-torso');
    // Italian
    expect(detectBodyRegion(makePiece('Sprone'))).toBe('back-torso');
    expect(detectBodyRegion(makePiece('Tasca'))).toBe('front-torso');
    expect(detectBodyRegion(makePiece('Patta'))).toBe('front-torso');
    // German
    expect(detectBodyRegion(makePiece('Sattel'))).toBe('back-torso');
    expect(detectBodyRegion(makePiece('Tasche'))).toBe('front-torso');
    expect(detectBodyRegion(makePiece('Knopfleiste'))).toBe('front-torso');
  });

  it('classifies all 17 pieces of male_shirt.json (regression for baseline #506)', () => {
    // Exact piece names from tools/seamly2d-converter/output/male_shirt.json.
    // Pre-fix: 7 returned 'unknown' (Yoke, Pocket×4, Placket×2).
    // Post-fix: 0 return 'unknown' — all route to a real body region.
    const names = [
      'Yoke', 'FrontPanel', 'BackPanel',
      'Pocket', 'PocketRound', 'PocketFlap', 'PocketFlapRound',
      'Cuff', 'CuffInterface',
      'ShortSleeve', 'FullSleeve',
      'CollarBase', 'CollarBaseInterface', 'CollarTop', 'CollarTopInterface',
      'PlacketUnder', 'PlacketTop',
    ];
    const unknowns = names.filter(n => detectBodyRegion(makePiece(n)) === 'unknown');
    expect(unknowns, `pieces still unclassified: ${unknowns.join(', ')}`).toEqual([]);
  });

  it('classifies Cyrillic piece names (jacket1_52-176 regression for #506 follow-up)', () => {
    // Exact piece names from tools/seamly2d-converter/output/jacket1_52-176.json.
    // Mix of Russian (Спинка/Полочка/Подборт/Рукав) and Ukrainian (Комір).
    // Pre-fix: all 5 returned 'unknown' → placement fallback put them at
    // midTorso (~40cm below shoulder) → DoD spec REACHES_UP gate failed with
    // maxY=1.083 vs needed 1.18. Post-fix: 0 'unknown', each routes to its
    // real body region.
    expect(detectBodyRegion(makePiece('Спинка'))).toBe('back-torso');
    expect(detectBodyRegion(makePiece('Полочка'))).toBe('front-torso');
    expect(detectBodyRegion(makePiece('Подборт'))).toBe('front-torso'); // facing → front
    expect(detectBodyRegion(makePiece('Рукав'))).toMatch(/sleeve/);
    expect(detectBodyRegion(makePiece('Комір'))).toBe('collar');
  });

  it('classifies Finnish piece names (gent_jacket_with_tummy regression for #506 follow-up)', () => {
    // Sample of gent_jacket_with_tummy.json — Finnish tailoring vocab.
    // Roots: taka=back, etu=front, hiha=sleeve, kaulus=collar, tasku=pocket,
    // rinta=chest, sivu=side. Most are compound words (e.g. "Alakaulus" =
    // "low-collar", "Rintatasku" = "chest-pocket").
    expect(detectBodyRegion(makePiece('Takakappale'))).toBe('back-torso');
    expect(detectBodyRegion(makePiece('Takakappalevuori'))).toBe('back-torso');
    expect(detectBodyRegion(makePiece('Takapalahalkio'))).toBe('back-torso');
    expect(detectBodyRegion(makePiece('Etukappale'))).toBe('front-torso');
    expect(detectBodyRegion(makePiece('Etuvuori'))).toBe('front-torso');
    expect(detectBodyRegion(makePiece('Etukappaletuki'))).toBe('front-torso');
    expect(detectBodyRegion(makePiece('Rintaliina'))).toBe('front-torso');
    expect(detectBodyRegion(makePiece('Rintaliinatuki'))).toBe('front-torso');
    // tasku wins over rinta — POCKET_RE runs before FRONT_RE
    expect(detectBodyRegion(makePiece('Rintatasku'))).toBe('front-torso');
    expect(detectBodyRegion(makePiece('Taskupussi'))).toBe('front-torso');
    expect(detectBodyRegion(makePiece('Taskunauha'))).toBe('front-torso');
    expect(detectBodyRegion(makePiece('Hihayläosa'))).toMatch(/sleeve/);
    expect(detectBodyRegion(makePiece('Hiha-alaosa'))).toMatch(/sleeve/);
    expect(detectBodyRegion(makePiece('Hihaylävuori'))).toMatch(/sleeve/);
    expect(detectBodyRegion(makePiece('Alakaulus'))).toBe('collar');
    expect(detectBodyRegion(makePiece('Yläkaulus'))).toBe('collar');
    expect(detectBodyRegion(makePiece('Yläkaulustuki'))).toBe('collar');
    // sivu (side panel) defaults to front-torso — side panels wrap the
    // torso; LEFT_RE / RIGHT_RE would refine if the name carried L/R hints.
    expect(detectBodyRegion(makePiece('Sivupala'))).toBe('front-torso');
    expect(detectBodyRegion(makePiece('Sivupalavuori'))).toBe('front-torso');
  });

  it('handles WaistBand camelCase after splitCamelCase split (regression for #820 follow-up)', () => {
    // Pre-fix: splitCamelCase("WaistBand1") → "Waist Band 1" but
    // WAISTBAND_RE only matched the single token "waistband" — so trousers.json
    // "WaistBand1" silently fell through to 'unknown' and the circle fallback.
    expect(detectBodyRegion(makePiece('WaistBand1'))).toBe('waistband');
    expect(detectBodyRegion(makePiece('WaistBand'))).toBe('waistband');
    expect(detectBodyRegion(makePiece('Waistband'))).toBe('waistband'); // single token still works
    expect(detectBodyRegion(makePiece('Waist Band'))).toBe('waistband'); // explicit space
    expect(detectBodyRegion(makePiece('waist-band'))).toBe('waistband'); // hyphen form
  });

  it('covers additional Cyrillic terms for forward compatibility', () => {
    // Russian
    expect(detectBodyRegion(makePiece('Воротник'))).toBe('collar');
    expect(detectBodyRegion(makePiece('Манжета'))).toMatch(/cuff/);
    expect(detectBodyRegion(makePiece('Юбка'))).toMatch(/skirt/);
    expect(detectBodyRegion(makePiece('Капюшон'))).toBe('hood');
    expect(detectBodyRegion(makePiece('Пояс'))).toBe('waistband');
    expect(detectBodyRegion(makePiece('Карман'))).toBe('front-torso'); // pocket
    expect(detectBodyRegion(makePiece('Кокетка'))).toBe('back-torso'); // yoke
    expect(detectBodyRegion(makePiece('Планка'))).toBe('front-torso'); // placket
    // Ukrainian
    expect(detectBodyRegion(makePiece('Спідниця'))).toMatch(/skirt/);
    expect(detectBodyRegion(makePiece('Кишеня'))).toBe('front-torso'); // pocket
    expect(detectBodyRegion(makePiece('Підборт'))).toBe('front-torso'); // facing
  });
});

describe('computePlacement', () => {
  it('front-torso is in front of body (negative Z)', () => {
    const p = computePlacement('front-torso', MEAS, { widthMm: 200, heightMm: 300 });
    expect(p.position[2]).toBeLessThan(0); // front = -Z
  });

  it('back-torso is behind body (positive Z)', () => {
    const p = computePlacement('back-torso', MEAS, { widthMm: 200, heightMm: 300 });
    expect(p.position[2]).toBeGreaterThan(0);
  });

  it('sleeves are to the sides (X offset)', () => {
    const left = computePlacement('left-sleeve', MEAS, { widthMm: 200, heightMm: 300 });
    const right = computePlacement('right-sleeve', MEAS, { widthMm: 200, heightMm: 300 });
    expect(left.position[0]).toBeLessThan(0);
    expect(right.position[0]).toBeGreaterThan(0);
  });

  it('skirt is at waist height', () => {
    const p = computePlacement('front-skirt', MEAS, { widthMm: 200, heightMm: 500 });
    const waistH = 168 * 0.55 / 100; // ~0.924
    expect(p.position[1]).toBeLessThan(waistH + 0.1);
  });

  it('collar is at neck height', () => {
    const p = computePlacement('collar', MEAS, { widthMm: 100, heightMm: 50 });
    expect(p.position[1]).toBeGreaterThan(1.3); // neck > 1.3m for 168cm person
  });
});

describe('placeGarmentPieces', () => {
  it('places all pieces', () => {
    const pieces = [
      makePiece('Front', 'bodice', 'front'),
      makePiece('Back', 'bodice', 'back'),
      makePiece('Sleeve', 'sleeve'),
    ];
    const placements = placeGarmentPieces(pieces, MEAS);
    expect(placements.length).toBe(3);
    // Front in front, back behind
    expect(placements[0].position[2]).toBeLessThan(0);
    expect(placements[1].position[2]).toBeGreaterThan(0);
  });

  it('all-unknown patterns: alternates front/back torso with X stagger (#556 fix)', () => {
    // Pre-fix: all unknown pieces went into a 360° circle around the avatar
    // at midTorso height, fell past the avatar collider, ended up below the
    // waist as loose panels (canonical #531 symptom; measured baseline on
    // male_shirt.json: 4195 cloth vertices below waistY).
    //
    // Post-fix: when EVERY piece is unclassified (the Seamly converter case:
    // names like "A1, A2, ..." don't match any semantic regex), alternate
    // pieces between front-torso and back-torso, staggered horizontally so
    // no two pieces share coordinates. This gives the simulation a starting
    // configuration where pieces drape against the body instead of falling
    // off the sides.
    const pieces = [
      makePiece('A1'),
      makePiece('A2'),
      makePiece('A3'),
    ];
    const placements = placeGarmentPieces(pieces, MEAS);

    // Even-indexed pieces go front (Z < 0), odd go back (Z > 0).
    expect(placements[0].position[2]).toBeLessThan(0);
    expect(placements[1].position[2]).toBeGreaterThan(0);
    expect(placements[2].position[2]).toBeLessThan(0);

    // All positions must be distinct — stacked pieces produce collinear
    // vertices that crash the cloth solver with NaN constraints.
    const positions = placements.map(p => p.position.join(','));
    expect(new Set(positions).size).toBe(3);
  });

  it('all-unknown pieces include X rotation to stand upright', () => {
    const pieces = [makePiece('A'), makePiece('B')];
    const placements = placeGarmentPieces(pieces, MEAS);
    for (const p of placements) {
      // X rotation must be -π/2 to stand the piece up from horizontal XZ plane.
      // Both front-torso and back-torso placements satisfy this.
      expect(p.rotation[0]).toBeCloseTo(-Math.PI / 2, 5);
    }
  });

  it('mixed-classification patterns keep the circle UX for the lone unknown', () => {
    // When SOME pieces are classified and some aren't, the unclassified ones
    // stay in the visible circle — it's intentional UX feedback ("user, please
    // classify these"). The all-unknown shortcut only fires when EVERY piece
    // is unclassified (the Seamly converter case).
    const pieces = [
      makePiece('Front Panel'),  // classified by name regex
      makePiece('MysteryPiece'),  // unknown
    ];
    const placements = placeGarmentPieces(pieces, MEAS);

    // Classified piece on torso front.
    expect(placements[0].position[2]).toBeLessThan(0);

    // Unknown sits on a circle around the avatar at midTorso height.
    // Just sanity-check it's far enough from origin to be "in the circle"
    // rather than stacked on the front bodice.
    const distFromAxis = Math.hypot(
      placements[1].position[0],
      placements[1].position[2],
    );
    expect(distFromAxis).toBeGreaterThan(0.1);
  });

  it('does not double-toggle sleeve assignment', () => {
    const pieces = [
      makePiece('Sleeve One', 'sleeve'),
      makePiece('Sleeve Two', 'sleeve'),
    ];
    const placements = placeGarmentPieces(pieces, MEAS);
    // First sleeve should be left, second right (toggle alternation)
    expect(placements[0].position[0]).toBeLessThan(0); // left = -X
    expect(placements[1].position[0]).toBeGreaterThan(0); // right = +X
  });
});
