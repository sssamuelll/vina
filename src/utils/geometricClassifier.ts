/**
 * geometricClassifier — piece-type classification from outline GEOMETRY
 * (camisa de María plan, M1 — docs/plans/2026-06-12-maria-shirt-plan.md).
 *
 * Real CAD exports carry no usable names ("PATRONES PARA SAMUEL-2") and the
 * existing classifiers are name-regex only, so a real pattern imported via
 * DXF got `category: undefined` and the whole downstream chain (semantic
 * edges → autoSew → anatomical placement) degraded to blind heuristics —
 * the alien-blob failure. This module classifies from the tram anatomy
 * (`analyzeOutline`), which probes showed is textbook-discriminating on
 * María's shirt:
 *
 * - sleeve:  one long CONVEX top tram (the cap bell, bow≈0.29 spanning the
 *   piece width) + straight underarms.
 * - bodice:  CONCAVE center-top tram (neckline) + concave upper-side trams
 *   (armholes) + straight hem. Front vs back is RELATIVE: the front
 *   neckline is ~3× deeper (bow 0.41 vs 0.14 on María's pattern), so side
 *   assignment lives in the set-level API.
 * - strip:   extreme aspect ratio, all-straight (neckband/waistband).
 *
 * Philosophy (ratified): automatic, no manual curation — and honest: when
 * geometry is ambiguous the result says so (low confidence + reasons)
 * instead of guessing silently. The agent's `analyzeGarment` LLM override
 * is the escalation path, not a hidden fallback.
 */

import type { PatternPiece, PieceCategory, PieceSide } from '../types/types';
import { analyzeOutline, type OutlineTram } from './outlineAnalysis';

// ─── Calibration (probed on María's shirt, 2026-06-12) ──────────────────────

/** bowRatio below this is straight (probe: real curves ≥0.06, straights 0.000). */
const STRAIGHT_MAX_BOW = 0.03;
/** Aspect ratio at/above which a piece reads as a strip (probe: neckband 11:1). */
const STRIP_MIN_ASPECT = 4;
/** Min bowRatio for a convex top tram to count as a sleeve cap (probe: 0.289). */
const CAP_MIN_BOW = 0.12;
/** A cap must span most of the piece width (probe: 451mm arc vs 381mm width). */
const CAP_MIN_WIDTH_FRACTION = 0.6;
/** Min bowRatio for a concave tram to count as neckline/armhole (probe: ≥0.14 / ≥0.06). */
const NOTCH_MIN_BOW = 0.05;
/** Trams with midpoint above this relY are "top" features. */
const TOP_MAX_RELY = 0.5;
/** Center-X band for necklines. */
const CENTER_MIN_RELX = 0.3;
const CENTER_MAX_RELX = 0.7;
/** Single-piece front/back threshold when no sibling bodice exists to compare. */
const FRONT_ABS_MIN_BOW = 0.25;

export interface GeometricClassification {
  category: PieceCategory;
  side?: PieceSide;
  /** 0..1 — below ~0.5 the caller should treat as unclassified. */
  confidence: number;
  /** Honest, human/agent-readable evidence. */
  reasons: string[];
  /** Neckline curvature depth (bowRatio of the deepest center-top concave tram); bodices only. */
  necklineBow?: number;
}

interface Features {
  aspect: number;
  width: number;
  height: number;
  allStraight: boolean;
  /** Concave top trams in the center-X band (neckline candidates). */
  centerTopConcave: OutlineTram[];
  /** Concave top trams outside the center band (armhole candidates). */
  sideTopConcave: OutlineTram[];
  /** Convex top trams (sleeve-cap candidates). */
  topConvex: OutlineTram[];
}

function extractFeatures(piece: PatternPiece): Features | null {
  const a = analyzeOutline(piece.outline);
  if (!a) return null;

  const { width, height } = a.bbox;
  const aspect = Math.max(width, height) / Math.max(1e-6, Math.min(width, height));

  const top = a.trams.filter(t => t.relY < TOP_MAX_RELY);
  const concaveTop = top.filter(t => t.sagitta < 0 && t.bowRatio >= NOTCH_MIN_BOW);

  return {
    aspect,
    width,
    height,
    allStraight: a.trams.every(t => t.bowRatio < STRAIGHT_MAX_BOW),
    centerTopConcave: concaveTop.filter(t => t.relX >= CENTER_MIN_RELX && t.relX <= CENTER_MAX_RELX),
    sideTopConcave: concaveTop.filter(t => t.relX < CENTER_MIN_RELX || t.relX > CENTER_MAX_RELX),
    topConvex: top.filter(
      t => t.sagitta > 0 && t.bowRatio >= CAP_MIN_BOW && t.arcLength >= CAP_MIN_WIDTH_FRACTION * width,
    ),
  };
}

/**
 * Classify ONE piece from geometry alone. For bodices the front/back side
 * needs a sibling to compare against — prefer `classifyPiecesGeometric`,
 * which refines sides relatively across the set.
 */
export function classifyPieceGeometric(piece: PatternPiece): GeometricClassification {
  const f = extractFeatures(piece);
  if (!f) {
    return { category: 'other', confidence: 0, reasons: ['outline too small to analyze'] };
  }

  // Strip: neckband/waistband/cuff family. Geometry alone cannot tell which
  // band it is; 'collar' is the honest default for a top's only strip.
  if (f.aspect >= STRIP_MIN_ASPECT) {
    return {
      category: 'collar',
      confidence: 0.7,
      reasons: [`strip: aspect ratio ${f.aspect.toFixed(1)}:1${f.allStraight ? ', all edges straight' : ''}`],
    };
  }

  // Sleeve: the cap bell. A bodice never has a long convex top tram.
  if (f.topConvex.length > 0 && f.centerTopConcave.length === 0) {
    const cap = f.topConvex.reduce((m, t) => (t.bowRatio > m.bowRatio ? t : m), f.topConvex[0]);
    return {
      category: 'sleeve',
      confidence: 0.85,
      reasons: [
        `sleeve cap: convex top tram, bow ${cap.bowRatio.toFixed(2)}, arc ${cap.arcLength.toFixed(0)}mm over ${f.width.toFixed(0)}mm width`,
      ],
    };
  }

  // Bodice: neckline (concave, center-top) + armhole(s) (concave, side-top).
  if (f.centerTopConcave.length > 0 && f.sideTopConcave.length > 0) {
    const neckline = f.centerTopConcave.reduce(
      (m, t) => (t.bowRatio > m.bowRatio ? t : m),
      f.centerTopConcave[0],
    );
    return {
      category: 'bodice',
      // Single-piece side guess by absolute depth; the set-level pass refines.
      side: neckline.bowRatio >= FRONT_ABS_MIN_BOW ? 'front' : 'back',
      confidence: 0.8,
      necklineBow: neckline.bowRatio,
      reasons: [
        `neckline: concave center-top tram, bow ${neckline.bowRatio.toFixed(2)}`,
        `armholes: ${f.sideTopConcave.length} concave upper-side tram(s)`,
      ],
    };
  }

  return {
    category: 'other',
    confidence: 0.2,
    reasons: [
      `no decisive signature: aspect ${f.aspect.toFixed(1)}:1, ` +
        `${f.centerTopConcave.length} center-top concave, ${f.sideTopConcave.length} side-top concave, ` +
        `${f.topConvex.length} convex-top tram(s)`,
    ],
  };
}

/**
 * Classify a SET of pieces (a whole imported pattern). Same per-piece rules,
 * plus relative refinements that only make sense across the set:
 * - Among bodices, the DEEPEST neckline is the front (probe: 3× depth gap
 *   on María's shirt — far more reliable than any absolute threshold).
 */
export function classifyPiecesGeometric(
  pieces: PatternPiece[],
): Map<string, GeometricClassification> {
  const out = new Map<string, GeometricClassification>();
  for (const p of pieces) out.set(p.id, classifyPieceGeometric(p));

  const bodices = pieces
    .map(p => ({ p, c: out.get(p.id)! }))
    .filter(x => x.c.category === 'bodice' && x.c.necklineBow != null)
    .sort((a, b) => b.c.necklineBow! - a.c.necklineBow!);

  if (bodices.length >= 2) {
    const [front, ...rest] = bodices;
    front.c.side = 'front';
    front.c.confidence = Math.max(front.c.confidence, 0.85);
    front.c.reasons.push(
      `front: deepest neckline of ${bodices.length} bodices (bow ${front.c.necklineBow!.toFixed(2)})`,
    );
    for (const r of rest) {
      r.c.side = 'back';
      r.c.confidence = Math.max(r.c.confidence, 0.85);
      r.c.reasons.push(
        `back: shallower neckline (bow ${r.c.necklineBow!.toFixed(2)} vs front ${front.c.necklineBow!.toFixed(2)})`,
      );
    }
  }

  return out;
}

// ─── Import-time hybrid classification ──────────────────────────────────────

import { classifyByName } from './pieceClassifier';

export interface ImportClassificationSummary {
  /** Pieces that received a category (by either path). */
  classified: number;
  /** Pieces left unclassified (low geometric confidence, no name signal). */
  unclassified: number;
  /** Per-piece detail for telemetry / the agent. */
  details: Array<{
    pieceId: string;
    name: string;
    category?: string;
    side?: string;
    source: 'name' | 'geometry' | 'none';
    confidence: number;
    reasons: string[];
  }>;
}

/** Below this geometric confidence a piece is honestly left unclassified. */
const IMPORT_MIN_CONFIDENCE = 0.5;

/**
 * Hybrid import-time classification (camisa de María plan, M1):
 * 1. NAME first — free and right when CAD blocks carry real names
 *    ("Front Bodice", "Manga"...): `classifyByName` multilingual regexes.
 * 2. GEOMETRY for the rest — `classifyPiecesGeometric` (set-level, so
 *    front/back resolve by relative neckline depth).
 * 3. HONESTY: low-confidence pieces stay unclassified (the agent's
 *    `classifyPiece` tool is the override surface; never guess silently).
 *
 * MUTATES `category`/`side` on the pieces (the import pipeline owns them at
 * this point — they have not been dispatched yet), so the `addPiece`
 * reducer's `detectSemanticEdges` pass emits role-bearing edges (armhole,
 * neckline, sleeveCap...) instead of inert positional ones.
 */
export function classifyImportedPieces(pieces: PatternPiece[]): ImportClassificationSummary {
  const details: ImportClassificationSummary['details'] = [];
  const needGeometry: PatternPiece[] = [];

  for (const p of pieces) {
    if (p.category && p.category !== 'other') {
      details.push({
        pieceId: p.id, name: p.name, category: p.category, side: p.side,
        source: 'name', confidence: 1, reasons: ['category already present'],
      });
      continue;
    }
    const byName = classifyByName(p.name);
    if (byName.category !== 'other') {
      p.category = byName.category;
      if (byName.side !== 'both') p.side = byName.side;
      details.push({
        pieceId: p.id, name: p.name, category: p.category, side: p.side,
        source: 'name', confidence: 0.9, reasons: [`name match: "${p.name}"`],
      });
    } else {
      needGeometry.push(p);
    }
  }

  if (needGeometry.length > 0) {
    const geo = classifyPiecesGeometric(needGeometry);
    for (const p of needGeometry) {
      const c = geo.get(p.id)!;
      if (c.category !== 'other' && c.confidence >= IMPORT_MIN_CONFIDENCE) {
        p.category = c.category;
        if (c.side) p.side = c.side;
        details.push({
          pieceId: p.id, name: p.name, category: p.category, side: p.side,
          source: 'geometry', confidence: c.confidence, reasons: c.reasons,
        });
      } else {
        details.push({
          pieceId: p.id, name: p.name,
          source: 'none', confidence: c.confidence, reasons: c.reasons,
        });
      }
    }
  }

  const classified = details.filter(d => d.source !== 'none').length;
  return { classified, unclassified: details.length - classified, details };
}
