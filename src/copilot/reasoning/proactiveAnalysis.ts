/**
 * Proactive Analysis — automatic pattern quality checks run after state changes.
 *
 * After every user action that modifies pieces, these checks run silently
 * to detect common issues: missing seam allowance, missing grainline,
 * dart alignment problems, seam length mismatches, and missing notches.
 *
 * Results are surfaced via the agentic chat (UnifiedBar) as subtle hints, not blocking alerts.
 *
 * @module proactiveAnalysis
 */

import type { PatternPiece, Seam, PathCommand, InternalLine, Point2D } from '../../types/types';
import { findEdgeByName, findEdgeForPoint } from '../../utils/seam/notchMirror';
import { computePathArcLength, distanceAlongPath } from '../../utils/geometry/arcLength';

// ─── Types ──────────────────────────────────────────────────────────────────

/** Severity level for proactive warnings */
export type WarningSeverity = 'info' | 'warning' | 'error';

/** Category of the proactive check */
export type WarningCategory =
  | 'seam-allowance'
  | 'grainline'
  | 'dart-alignment'
  | 'seam-length'
  | 'notch';

/**
 * A proactive warning detected during automatic analysis.
 */
export interface ProactiveWarning {
  /** Warning category for grouping and filtering */
  category: WarningCategory;
  /** Severity level */
  severity: WarningSeverity;
  /** Affected piece ID(s) */
  pieceIds: string[];
  /** Human-readable message (bilingual) */
  message: string;
  /** Machine-readable suggestion for auto-fix */
  suggestion?: string;
}

// ─── Analysis Functions ─────────────────────────────────────────────────────

/**
 * Check all pieces for seam allowance issues.
 *
 * Detects: missing SA (0mm), inconsistent SA widths, non-standard values.
 *
 * @param pieces - All pattern pieces
 * @returns Array of SA-related warnings
 */
export function auditSeamAllowances(pieces: PatternPiece[]): ProactiveWarning[] {
  const warnings: ProactiveWarning[] = [];

  if (pieces.length === 0) return warnings;

  // Collect SA values
  const saValues = new Map<number, string[]>();
  for (const piece of pieces) {
    const list = saValues.get(piece.seamAllowance) ?? [];
    list.push(piece.id);
    saValues.set(piece.seamAllowance, list);
  }

  // Check for missing SA
  const missingSA = saValues.get(0);
  if (missingSA && missingSA.length > 0) {
    const names = pieces
      .filter(p => missingSA.includes(p.id))
      .map(p => p.name);
    warnings.push({
      category: 'seam-allowance',
      severity: 'error',
      pieceIds: missingSA,
      message: `Missing seam allowance on: ${names.join(', ')}`,
      suggestion: 'setSeamAllowance:10',
    });
  }

  // Check for inconsistent SA (more than 2 different non-zero values)
  const nonZeroValues = [...saValues.keys()].filter(v => v > 0);
  if (nonZeroValues.length > 2) {
    warnings.push({
      category: 'seam-allowance',
      severity: 'warning',
      pieceIds: pieces.map(p => p.id),
      message: `Inconsistent seam allowances: ${nonZeroValues.map(v => v + 'mm').join(', ')}`,
    });
  }

  return warnings;
}

/**
 * Check all pieces for missing grainlines.
 *
 * Every pattern piece should have a grainline indicating fabric grain direction.
 *
 * @param pieces - All pattern pieces
 * @returns Array of grainline-related warnings
 */
export function auditGrainlines(pieces: PatternPiece[]): ProactiveWarning[] {
  const warnings: ProactiveWarning[] = [];

  const missingGrainline = pieces.filter(
    p => !p.internals.some(i => i.type === 'grainline'),
  );

  if (missingGrainline.length > 0) {
    warnings.push({
      category: 'grainline',
      severity: 'warning',
      pieceIds: missingGrainline.map(p => p.id),
      message: `Missing grainline on: ${missingGrainline.map(p => p.name).join(', ')}`,
      suggestion: 'addGrainline:vertical',
    });
  }

  return warnings;
}

/**
 * Compute perimeter length of a piece outline.
 */
function computePerimeter(outline: PathCommand[]): number {
  let perimeter = 0;
  let prevX = 0, prevY = 0;
  let startX = 0, startY = 0;

  for (const cmd of outline) {
    if (cmd.type === 'M' && cmd.values.length >= 2) {
      startX = cmd.values[0];
      startY = cmd.values[1];
      prevX = startX;
      prevY = startY;
    } else if (cmd.type === 'L' && cmd.values.length >= 2) {
      const dx = cmd.values[0] - prevX;
      const dy = cmd.values[1] - prevY;
      perimeter += Math.sqrt(dx * dx + dy * dy);
      prevX = cmd.values[0];
      prevY = cmd.values[1];
    } else if (cmd.type === 'C' && cmd.values.length >= 6) {
      // Approximate cubic bezier with straight segments
      const x0 = prevX, y0 = prevY;
      const x1 = cmd.values[0], y1 = cmd.values[1];
      const x2 = cmd.values[2], y2 = cmd.values[3];
      const x3 = cmd.values[4], y3 = cmd.values[5];
      const steps = 10;
      for (let s = 1; s <= steps; s++) {
        const t = s / steps;
        const u = 1 - t;
        const bx = u * u * u * x0 + 3 * u * u * t * x1 + 3 * u * t * t * x2 + t * t * t * x3;
        const by = u * u * u * y0 + 3 * u * u * t * y1 + 3 * u * t * t * y2 + t * t * t * y3;
        const dx = bx - prevX;
        const dy = by - prevY;
        perimeter += Math.sqrt(dx * dx + dy * dy);
        prevX = bx;
        prevY = by;
      }
    } else if (cmd.type === 'Z') {
      const dx = startX - prevX;
      const dy = startY - prevY;
      perimeter += Math.sqrt(dx * dx + dy * dy);
      prevX = startX;
      prevY = startY;
    }
  }

  return perimeter;
}

/**
 * Check dart alignment between front and back pieces.
 *
 * For standard construction, front and back waist darts should align
 * at the side seam so the seam lines match.
 *
 * @param pieces - All pattern pieces
 * @returns Array of dart alignment warnings
 */
export function auditDartAlignment(pieces: PatternPiece[]): ProactiveWarning[] {
  const warnings: ProactiveWarning[] = [];

  // Find front/back pairs by name heuristic
  const fronts = pieces.filter(p =>
    /front|delantero|frente/i.test(p.name),
  );
  const backs = pieces.filter(p =>
    /back|espalda|trasero/i.test(p.name),
  );

  for (const front of fronts) {
    const matchingBack = backs.find(b => {
      // Match by shared base name (e.g. "Front Bodice" ↔ "Back Bodice")
      const frontBase = front.name.replace(/front|delantero|frente/i, '').trim();
      const backBase = b.name.replace(/back|espalda|trasero/i, '').trim();
      return frontBase.toLowerCase() === backBase.toLowerCase();
    });

    if (!matchingBack) continue;

    // Count darts in each
    const frontDarts = front.internals.filter(i => i.type === 'dart').length;
    const backDarts = matchingBack.internals.filter(i => i.type === 'dart').length;

    // Warn if one has darts and the other doesn't (for waist darts)
    if (frontDarts > 0 && backDarts === 0) {
      warnings.push({
        category: 'dart-alignment',
        severity: 'info',
        pieceIds: [front.id, matchingBack.id],
        message: `${front.name} has ${frontDarts} dart(s) but ${matchingBack.name} has none. Consider adding waist darts to the back.`,
      });
    } else if (backDarts > 0 && frontDarts === 0) {
      warnings.push({
        category: 'dart-alignment',
        severity: 'info',
        pieceIds: [front.id, matchingBack.id],
        message: `${matchingBack.name} has ${backDarts} dart(s) but ${front.name} has none. Verify this is intentional.`,
      });
    }
  }

  return warnings;
}

/**
 * Check seam length matching between connected pieces.
 *
 * When two pieces are sewn together, the seam edges should be the same length
 * (within a tolerance for easing).
 *
 * @param pieces - All pattern pieces
 * @param seams - All seam connections
 * @returns Array of seam length mismatch warnings
 */
export function auditSeamLengths(
  pieces: PatternPiece[],
  seams: Seam[],
): ProactiveWarning[] {
  const warnings: ProactiveWarning[] = [];
  const TOLERANCE = 0.08; // 8% tolerance for easing

  for (const seam of seams) {
    const pieceA = pieces.find(p => p.id === seam.pieceA.pieceId);
    const pieceB = pieces.find(p => p.id === seam.pieceB.pieceId);
    if (!pieceA || !pieceB) continue;

    const perimA = computePerimeter(pieceA.outline);
    const perimB = computePerimeter(pieceB.outline);

    // Use perimeter as proxy since we don't have per-edge measurements
    // In a real implementation, we'd measure the specific edge segments
    if (perimA > 0 && perimB > 0) {
      const ratio = Math.abs(perimA - perimB) / Math.max(perimA, perimB);
      if (ratio > TOLERANCE) {
        warnings.push({
          category: 'seam-length',
          severity: 'warning',
          pieceIds: [pieceA.id, pieceB.id],
          message: `Seam length mismatch: ${pieceA.name} (${Math.round(perimA)}mm) vs ${pieceB.name} (${Math.round(perimB)}mm) — ${Math.round(ratio * 100)}% difference`,
        });
      }
    }
  }

  return warnings;
}

/** Base point (M command) of a notch internal line. */
function notchPoint(n: InternalLine): Point2D | null {
  const h = n.path[0];
  return h && h.values.length >= 2 ? { x: h.values[0], y: h.values[1] } : null;
}

/** Fraction (0-1) within the sewn sub-range [t0,t1] of an edge. */
function sewnFrac(fracEdge: number, t0: number, t1: number): number {
  const span = t1 - t0;
  const f = span > 1e-9 ? (fracEdge - t0) / span : fracEdge;
  return Math.max(0, Math.min(1, f));
}

/** Greedy count of A↔B matches within tolerance, for one traversal sense. */
function countMatches(fracsA: number[], fracsB: number[], tolFrac: number): number {
  const used = new Set<number>();
  let matched = 0;
  for (const fa of fracsA) {
    let bestJ = -1, bestD = tolFrac;
    for (let j = 0; j < fracsB.length; j++) {
      if (used.has(j)) continue;
      const d = Math.abs(fa - fracsB[j]);
      if (d < bestD) { bestD = d; bestJ = j; }
    }
    if (bestJ >= 0) { used.add(bestJ); matched++; }
  }
  return matched;
}

/**
 * Check that notches on connected pieces actually LINE UP across the shared seam
 * (spec 2026-06-09-notch-mirror-design.md, Alcance C). Replaces the old
 * count-only check, which passed two notches in totally different positions as
 * long as the counts matched. Maps each notch to its sewn-fraction along the
 * edge and pairs A↔B by position, trying BOTH traversal senses (right-sides-
 * together sews edges in opposite directions) and keeping the better fit. Never
 * asserts a false "all good": a count match with positions that don't align is
 * now a warning. Falls back to the count check when edges can't be resolved.
 *
 * @param pieces - All pattern pieces
 * @param seams - All seam connections
 * @returns Array of notch-related warnings
 */
export function auditNotches(
  pieces: PatternPiece[],
  seams: Seam[],
): ProactiveWarning[] {
  const warnings: ProactiveWarning[] = [];

  for (const seam of seams) {
    const pieceA = pieces.find(p => p.id === seam.pieceA.pieceId);
    const pieceB = pieces.find(p => p.id === seam.pieceB.pieceId);
    if (!pieceA || !pieceB) continue;

    const allNotchesA = pieceA.internals.filter(i => i.type === 'notch');
    const allNotchesB = pieceB.internals.filter(i => i.type === 'notch');

    if (allNotchesA.length === 0 && allNotchesB.length === 0) {
      warnings.push({
        category: 'notch',
        severity: 'info',
        pieceIds: [pieceA.id, pieceB.id],
        message: `No notches on seam between ${pieceA.name} and ${pieceB.name}. Add alignment notches for easier assembly.`,
      });
      continue;
    }

    const edgeA = findEdgeByName(pieceA, seam.pieceA.edgeName);
    const edgeB = findEdgeByName(pieceB, seam.pieceB.edgeName);

    // Notches that actually sit on the seamed edge of each piece.
    const onEdge = (piece: PatternPiece, edge: typeof edgeA, notches: InternalLine[]) =>
      edge
        ? notches.filter(n => { const pt = notchPoint(n); return pt != null && findEdgeForPoint(piece, pt)?.id === edge.id; })
        : notches;
    const notchesA = onEdge(pieceA, edgeA, allNotchesA);
    const notchesB = onEdge(pieceB, edgeB, allNotchesB);

    const lenA = edgeA ? computePathArcLength(pieceA.outline, edgeA.segmentRange[0], edgeA.segmentRange[1]) : 0;
    const lenB = edgeB ? computePathArcLength(pieceB.outline, edgeB.segmentRange[0], edgeB.segmentRange[1]) : 0;

    // Fall back to the count check when edges/geometry can't be resolved.
    if (!edgeA || !edgeB || lenA < 1e-9 || lenB < 1e-9) {
      if (notchesA.length !== notchesB.length) {
        warnings.push({
          category: 'notch', severity: 'warning', pieceIds: [pieceA.id, pieceB.id],
          message: `Notch count mismatch: ${pieceA.name} has ${notchesA.length}, ${pieceB.name} has ${notchesB.length}`,
        });
      }
      continue;
    }

    const tA0 = seam.pieceA.tStart ?? 0, tA1 = seam.pieceA.tEnd ?? 1;
    const tB0 = seam.pieceB.tStart ?? 0, tB1 = seam.pieceB.tEnd ?? 1;
    const fracsA = notchesA.map(n => {
      const pt = notchPoint(n)!;
      return sewnFrac(distanceAlongPath(pieceA.outline, pt, edgeA.segmentRange[0], edgeA.segmentRange[1]) / lenA, tA0, tA1);
    });
    const fracsB = notchesB.map(n => {
      const pt = notchPoint(n)!;
      return sewnFrac(distanceAlongPath(pieceB.outline, pt, edgeB.segmentRange[0], edgeB.segmentRange[1]) / lenB, tB0, tB1);
    });

    // Tolerance: ~2% of the shorter sewn span, floored at ~5mm (aligned with the
    // walk-seam sampling interval). Expressed as a fraction of the sewn span.
    const sewnA = lenA * (tA1 - tA0), sewnB = lenB * (tB1 - tB0);
    const tolMm = Math.max(5, 0.02 * Math.min(sewnA, sewnB));
    const tolFrac = tolMm / Math.max(1e-9, Math.min(sewnA, sewnB));

    const matched = Math.max(
      countMatches(fracsA, fracsB, tolFrac),
      countMatches(fracsA, fracsB.map(x => 1 - x), tolFrac), // opposite sense
    );
    const unmatchedA = notchesA.length - matched;
    const unmatchedB = notchesB.length - matched;

    if (unmatchedA > 0 || unmatchedB > 0) {
      warnings.push({
        category: 'notch', severity: 'warning', pieceIds: [pieceA.id, pieceB.id],
        message: `Notches don't line up across the seam between ${pieceA.name} and ${pieceB.name} `
          + `(${matched} aligned, ${unmatchedA} on ${pieceA.name} and ${unmatchedB} on ${pieceB.name} without a match). `
          + `Mirror the missing notch to the paired edge.`,
      });
    }
  }

  return warnings;
}

// ─── Main Analysis Runner ───────────────────────────────────────────────────

/**
 * Run all proactive analysis checks on the current project state.
 *
 * This is the main entry point — call this after any state change that
 * modifies pieces or seams. The results surface as agentic chat hints
 * via the UnifiedBar chat mode (the previous CopilotPanel host was
 * deleted in commit 1c6e4238).
 *
 * @param pieces - All pattern pieces in the project
 * @param seams - All seam connections in the project
 * @returns Array of all detected warnings, sorted by severity
 */
export function runProactiveAnalysis(
  pieces: PatternPiece[],
  seams: Seam[],
): ProactiveWarning[] {
  if (pieces.length === 0) return [];

  const warnings: ProactiveWarning[] = [
    ...auditSeamAllowances(pieces),
    ...auditGrainlines(pieces),
    ...auditDartAlignment(pieces),
    ...auditSeamLengths(pieces, seams),
    ...auditNotches(pieces, seams),
  ];

  // Sort by severity: error > warning > info
  const severityOrder: Record<WarningSeverity, number> = {
    error: 0,
    warning: 1,
    info: 2,
  };

  warnings.sort((a, b) => severityOrder[a.severity] - severityOrder[b.severity]);

  return warnings;
}

/**
 * Deduplicate warnings by content.
 *
 * @param warnings - Array of proactive warnings
 * @returns Deduplicated warnings array
 */
function deduplicateWarnings(warnings: ProactiveWarning[]): ProactiveWarning[] {
  const seen = new Map<string, ProactiveWarning>();
  
  for (const warning of warnings) {
    const key = `${warning.category}:${warning.severity}:${warning.message}`;
    const existing = seen.get(key);
    
    if (existing) {
      // Merge piece IDs for duplicate warnings
      const mergedPieceIds = [...new Set([...existing.pieceIds, ...warning.pieceIds])];
      seen.set(key, { ...existing, pieceIds: mergedPieceIds });
    } else {
      seen.set(key, warning);
    }
  }
  
  return Array.from(seen.values());
}

/**
 * Format warnings as a compact display string.
 *
 * @param warnings - Array of proactive warnings
 * @returns Formatted string for display
 */
export function formatWarnings(warnings: ProactiveWarning[]): string {
  if (warnings.length === 0) return '';

  // Deduplicate warnings first
  const deduped = deduplicateWarnings(warnings);

  const icons: Record<WarningSeverity, string> = {
    error: '❌',
    warning: '⚠️',
    info: '💡',
  };

  return deduped
    .map(w => `${icons[w.severity]} ${w.message}`)
    .join('\n');
}
