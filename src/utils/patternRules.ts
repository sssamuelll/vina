/**
 * #79 — Patternmaking Rules Engine
 * Encodes professional patternmaking knowledge for validation.
 * The copilot queries these rules, never generates geometry from imagination.
 */

import type { PatternPiece, SemanticEdge, GrainLine, PathCommand } from '../types/types';
import { extractDarts } from './dartEntity';

// ─── Types ───────────────────────────────────────────────────────────────────

export type RuleCategory = 'fit' | 'construction' | 'grading' | 'fabric';
export type RuleSeverity = 'error' | 'warning' | 'info';

export interface ProjectContext {
  pieces: PatternPiece[];
  fabricWeight?: 'light' | 'medium' | 'heavy';
  garmentType?: string;
}

export interface PatternRule {
  id: string;
  name: string;
  category: RuleCategory;
  description: string;
  severity: RuleSeverity;
  /** Return null if rule passes, or a message if it fails */
  check: (piece: PatternPiece, context: ProjectContext) => string | null;
}

export interface RuleViolation {
  ruleId: string;
  ruleName: string;
  severity: RuleSeverity;
  category: RuleCategory;
  pieceId: string;
  pieceName: string;
  message: string;
}

// ─── Geometry helpers ────────────────────────────────────────────────────────

function pathLength(commands: PathCommand[]): number {
  let len = 0;
  let px = 0, py = 0;
  for (const cmd of commands) {
    if (cmd.type === 'M') {
      px = cmd.values[0]; py = cmd.values[1];
    } else if (cmd.type === 'L') {
      const dx = cmd.values[0] - px, dy = cmd.values[1] - py;
      len += Math.sqrt(dx * dx + dy * dy);
      px = cmd.values[0]; py = cmd.values[1];
    } else if (cmd.type === 'C') {
      // approximate cubic bezier with 10 segments
      const x0 = px, y0 = py;
      const [cx1, cy1, cx2, cy2, x3, y3] = cmd.values;
      for (let i = 1; i <= 10; i++) {
        const t = i / 10;
        const u = 1 - t;
        const nx = u * u * u * x0 + 3 * u * u * t * cx1 + 3 * u * t * t * cx2 + t * t * t * x3;
        const ny = u * u * u * y0 + 3 * u * u * t * cy1 + 3 * u * t * t * cy2 + t * t * t * y3;
        const ddx = nx - px, ddy = ny - py;
        len += Math.sqrt(ddx * ddx + ddy * ddy);
        px = nx; py = ny;
      }
    }
  }
  return len;
}

function outlinePerimeter(piece: PatternPiece): number {
  return piece.outline ? pathLength(piece.outline) : 0;
}

function pieceBounds(piece: PatternPiece): { width: number; height: number; cx: number; cy: number } {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const cmd of (piece.outline || [])) {
    for (let i = 0; i < cmd.values.length; i += 2) {
      const x = cmd.values[i], y = cmd.values[i + 1];
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
  }
  return {
    width: maxX - minX,
    height: maxY - minY,
    cx: (minX + maxX) / 2,
    cy: (minY + maxY) / 2,
  };
}

function grainAngleDeg(gl: GrainLine): number {
  if (!gl.path || gl.path.length < 2) return 0;
  const m = gl.path[0];
  const last = gl.path[gl.path.length - 1];
  const x0 = m.values[0], y0 = m.values[1];
  let x1: number, y1: number;
  if (last.type === 'L') { x1 = last.values[0]; y1 = last.values[1]; }
  else if (last.type === 'C') { x1 = last.values[4]; y1 = last.values[5]; }
  else { return 0; }
  return Math.atan2(y1 - y0, x1 - x0) * 180 / Math.PI;
}

function edgeAngleDeg(edge: SemanticEdge, piece: PatternPiece): number | null {
  if (!piece.outline || !edge.segmentRange) return null;
  const [start, end] = edge.segmentRange;
  const s = piece.outline[start];
  const e = piece.outline[Math.min(end, piece.outline.length - 1)];
  if (!s || !e) return null;
  const x0 = s.values[0], y0 = s.values[1];
  const x1 = e.values[e.values.length - 2], y1 = e.values[e.values.length - 1];
  return Math.atan2(y1 - y0, x1 - x0) * 180 / Math.PI;
}

function angleDiff(a: number, b: number): number {
  let d = ((a - b) % 360 + 360) % 360;
  if (d > 180) d = 360 - d;
  return d;
}

function findEdgeByName(piece: PatternPiece, name: string): SemanticEdge | undefined {
  return piece.edges?.find(e => e.name === name || e.edgeType === name);
}

// ─── Rules ───────────────────────────────────────────────────────────────────

export const PATTERN_RULES: PatternRule[] = [
  // ── Construction rules ──
  {
    id: 'GRAIN_EXISTS',
    name: 'Grainline present',
    category: 'construction',
    description: 'Every pattern piece should have a grainline for fabric layout',
    severity: 'warning',
    check: (piece) => {
      if (!piece.grainLine) return `Piece "${piece.name}" has no grainline defined`;
      return null;
    },
  },
  {
    id: 'GRAIN_PARALLEL_CF',
    name: 'Grainline parallel to center front/back',
    category: 'construction',
    description: 'Grainline should be within 2° of center front or center back edge',
    severity: 'warning',
    check: (piece) => {
      if (!piece.grainLine || piece.grainLine.direction === 'bias') return null;
      const cfEdge = findEdgeByName(piece, 'centerFront') || findEdgeByName(piece, 'centerBack');
      if (!cfEdge) return null; // can't check without reference edge
      const gAngle = grainAngleDeg(piece.grainLine);
      const eAngle = edgeAngleDeg(cfEdge, piece);
      if (eAngle === null) return null;
      const diff = angleDiff(gAngle, eAngle);
      if (diff > 2 && diff < 178) {
        return `Grainline is ${diff.toFixed(1)}° off from center line (should be within 2°)`;
      }
      return null;
    },
  },
  {
    id: 'DART_APEX_DISTANCE',
    name: 'Dart apex not on bust point',
    category: 'fit',
    description: 'Dart apex should be 20-30mm from bust point, not directly on it',
    severity: 'warning',
    check: (piece) => {
      const darts = piece.darts ?? extractDarts(piece);
      if (darts.length === 0) return null;
      if (piece.category !== 'bodice') return null;
      for (const dart of darts) {
        if (dart.depth !== undefined && dart.depth < 15) {
          return `Dart "${dart.id}" depth is ${dart.depth.toFixed(0)}mm — apex may be too close to bust point (recommend 20-30mm)`;
        }
      }
      return null;
    },
  },
  {
    id: 'DART_ANGLE_RANGE',
    name: 'Dart angle reasonable',
    category: 'fit',
    description: 'Dart intake angle should typically be 5-25° for bodice darts',
    severity: 'warning',
    check: (piece) => {
      const darts = piece.darts ?? extractDarts(piece);
      for (const dart of darts) {
        // Estimate angle from intake and depth: angle ≈ 2 * atan(intake/2 / depth)
        if (!dart.depth || dart.depth === 0) continue;
        const angle = 2 * Math.atan2(dart.intake / 2, dart.depth) * 180 / Math.PI;
        if (angle < 3) {
          return `Dart "${dart.id}" angle is ~${angle.toFixed(1)}° — too narrow, may not provide shaping`;
        }
        if (angle > 30) {
          return `Dart "${dart.id}" angle is ~${angle.toFixed(1)}° — very wide, consider splitting into two darts`;
        }
      }
      return null;
    },
  },
  {
    id: 'DART_LEGS_EQUAL',
    name: 'Dart legs approximately equal',
    category: 'construction',
    description: 'Dart legs should be within 5% of each other for clean sewing',
    severity: 'info',
    check: (piece) => {
      const darts = piece.darts ?? extractDarts(piece);
      for (const dart of darts) {
        if (!dart.legs || dart.legs.length < 2) continue;
        // Compute leg lengths from point arrays
        const legLen = (pts: { x: number; y: number }[]): number => {
          let len = 0;
          for (let i = 1; i < pts.length; i++) {
            const dx = pts[i].x - pts[i - 1].x, dy = pts[i].y - pts[i - 1].y;
            len += Math.sqrt(dx * dx + dy * dy);
          }
          return len;
        };
        const l1 = legLen(dart.legs[0]);
        const l2 = legLen(dart.legs[1]);
        if (l1 === 0 || l2 === 0) continue;
        const ratio = Math.abs(l1 - l2) / Math.max(l1, l2);
        if (ratio > 0.05) {
          return `Dart "${dart.id}" legs differ by ${(ratio * 100).toFixed(0)}% (${l1.toFixed(0)}mm vs ${l2.toFixed(0)}mm)`;
        }
      }
      return null;
    },
  },
  {
    id: 'SEAM_ALLOWANCE_EXISTS',
    name: 'Seam allowance defined',
    category: 'construction',
    description: 'Pieces should have seam allowance for production patterns',
    severity: 'info',
    check: (piece) => {
      if (!piece.seamAllowance || piece.seamAllowance <= 0) {
        return `Piece "${piece.name}" has no seam allowance — needed for production`;
      }
      return null;
    },
  },
  {
    id: 'SEAM_ALLOWANCE_RANGE',
    name: 'Seam allowance in standard range',
    category: 'construction',
    description: 'Standard seam allowance is 10-15mm; hem allowance 20-40mm',
    severity: 'warning',
    check: (piece) => {
      if (!piece.seamAllowance) return null;
      const sa = piece.seamAllowance;
      if (sa < 5) return `Seam allowance ${sa}mm is very narrow (standard: 10-15mm)`;
      if (sa > 50) return `Seam allowance ${sa}mm is unusually wide (standard: 10-15mm, hem: 20-40mm)`;
      return null;
    },
  },
  {
    id: 'PIECE_HAS_OUTLINE',
    name: 'Piece has outline',
    category: 'construction',
    description: 'Every pattern piece must have a closed outline',
    severity: 'error',
    check: (piece) => {
      if (!piece.outline || piece.outline.length < 3) {
        return `Piece "${piece.name}" has no valid outline`;
      }
      return null;
    },
  },
  {
    id: 'OUTLINE_CLOSED',
    name: 'Outline is closed',
    category: 'construction',
    description: 'Pattern outline must form a closed shape',
    severity: 'error',
    check: (piece) => {
      if (!piece.outline || piece.outline.length < 2) return null;
      const last = piece.outline[piece.outline.length - 1];
      if (last.type !== 'Z') {
        // Check if last point connects back to first
        const first = piece.outline[0];
        if (first.type !== 'M') return null;
        const fx = first.values[0], fy = first.values[1];
        const lx = last.values[last.values.length - 2];
        const ly = last.values[last.values.length - 1];
        const gap = Math.sqrt((lx - fx) ** 2 + (ly - fy) ** 2);
        if (gap > 1) { // 1mm tolerance
          return `Outline has ${gap.toFixed(1)}mm gap — not closed`;
        }
      }
      return null;
    },
  },
  {
    id: 'PIECE_MIN_SIZE',
    name: 'Piece minimum size',
    category: 'construction',
    description: 'Pattern piece should be at least 10mm in both dimensions',
    severity: 'error',
    check: (piece) => {
      if (!piece.outline || piece.outline.length < 3) return null;
      const { width, height } = pieceBounds(piece);
      if (width < 10 || height < 10) {
        return `Piece "${piece.name}" is ${width.toFixed(0)}×${height.toFixed(0)}mm — suspiciously small`;
      }
      return null;
    },
  },
  {
    id: 'PIECE_MAX_SIZE',
    name: 'Piece maximum size',
    category: 'construction',
    description: 'Pattern piece should not exceed 3000mm (3m) in any dimension',
    severity: 'warning',
    check: (piece) => {
      if (!piece.outline || piece.outline.length < 3) return null;
      const { width, height } = pieceBounds(piece);
      if (width > 3000 || height > 3000) {
        return `Piece "${piece.name}" is ${width.toFixed(0)}×${height.toFixed(0)}mm — unusually large`;
      }
      return null;
    },
  },
  // ── Fit rules ──
  {
    id: 'SLEEVE_CAP_EASE',
    name: 'Sleeve cap ease 30-50mm',
    category: 'fit',
    description: 'Set-in sleeve cap should have 30-50mm ease over armscye',
    severity: 'warning',
    check: (piece, ctx) => {
      if (piece.category !== 'sleeve') return null;
      const capEdge = piece.edges?.find(e => e.name === 'sleeveCap');
      if (!capEdge || !capEdge.length) return null;
      // Find bodice armscye
      const bodices = ctx.pieces.filter(p => p.category === 'bodice');
      let armscyeLen = 0;
      for (const b of bodices) {
        const arm = b.edges?.find(e => e.name === 'armscye');
        if (arm?.length) armscyeLen += arm.length;
      }
      if (armscyeLen === 0) return null;
      const ease = capEdge.length - armscyeLen;
      if (ease < 20) {
        return `Sleeve cap ease is ${ease.toFixed(0)}mm — too tight (recommend 30-50mm for set-in sleeve)`;
      }
      if (ease > 60) {
        return `Sleeve cap ease is ${ease.toFixed(0)}mm — excessive (recommend 30-50mm, will cause puckering)`;
      }
      return null;
    },
  },
  {
    id: 'SHOULDER_BACK_LONGER',
    name: 'Back shoulder slightly longer than front',
    category: 'fit',
    description: 'Back shoulder seam should be ~10mm longer than front for shoulder blade ease',
    severity: 'info',
    check: (_piece, ctx) => {
      const fronts = ctx.pieces.filter(p => p.category === 'bodice' && p.side === 'front');
      const backs = ctx.pieces.filter(p => p.category === 'bodice' && p.side === 'back');
      if (fronts.length === 0 || backs.length === 0) return null;
      const frontShoulder = fronts[0].edges?.find(e => e.name === 'shoulder');
      const backShoulder = backs[0].edges?.find(e => e.name === 'shoulder');
      if (!frontShoulder?.length || !backShoulder?.length) return null;
      const diff = backShoulder.length - frontShoulder.length;
      if (diff < 5) {
        return `Back shoulder (${backShoulder.length.toFixed(0)}mm) should be ~10mm longer than front (${frontShoulder.length.toFixed(0)}mm) for shoulder blade ease`;
      }
      return null;
    },
  },
  {
    id: 'NOTCH_CONVENTION',
    name: 'Notch convention: single front, double back',
    category: 'construction',
    description: 'Standard: single notch on front pieces, double on back',
    severity: 'info',
    check: (piece) => {
      // Notches stored in piece.internals with type 'notch'
      const notches = piece.internals?.filter(il => il.type === 'notch') || [];
      if (notches.length === 0) return null;
      // For now, just check if front/back has notches (detailed count check needs notch metadata)
      if (piece.side === 'front' && notches.length > 0) {
        return null; // TODO: check single vs double when NotchOptions available on InternalLine
      }
      return null;
    },
  },
  {
    id: 'HEM_PERPENDICULAR',
    name: 'Hem perpendicular to grainline',
    category: 'construction',
    description: 'Hem edge should be perpendicular to grainline (within 5°)',
    severity: 'warning',
    check: (piece) => {
      if (!piece.grainLine) return null;
      const hem = piece.edges?.find(e => e.edgeType === 'hem');
      if (!hem) return null;
      const gAngle = grainAngleDeg(piece.grainLine);
      const hAngle = edgeAngleDeg(hem, piece);
      if (hAngle === null) return null;
      const diff = angleDiff(gAngle, hAngle);
      // Should be ~90°
      const offFrom90 = Math.abs(diff - 90);
      if (offFrom90 > 5) {
        return `Hem is ${offFrom90.toFixed(1)}° off perpendicular to grainline`;
      }
      return null;
    },
  },
  {
    id: 'BIAS_GRAIN_ACKNOWLEDGED',
    name: 'Bias grain usage',
    category: 'fabric',
    description: 'Bias grain pieces require more fabric and behave differently',
    severity: 'info',
    check: (piece) => {
      if (piece.grainLine?.direction === 'bias') {
        return `Piece "${piece.name}" is on bias grain — requires ~15% more fabric and will have more stretch/drape`;
      }
      return null;
    },
  },
  {
    id: 'MATCHING_SEAM_LENGTHS',
    name: 'Matching seam lengths',
    category: 'construction',
    description: 'Edges marked for seaming should have compatible lengths',
    severity: 'warning',
    check: (piece, ctx) => {
      if (!piece.edges) return null;
      for (const edge of piece.edges) {
        if (!edge.matchHint || !edge.length) continue;
        // Find matching piece+edge by matchHint (e.g. "pairs with back-armhole")
        // Try to find an edge in another piece whose name matches the hint
        let targetEdge: SemanticEdge | undefined;
        let targetPiece: PatternPiece | undefined;
        for (const p of ctx.pieces) {
          if (p.id === piece.id) continue;
          const match = p.edges?.find(e => edge.matchHint!.includes(e.name));
          if (match) { targetEdge = match; targetPiece = p; break; }
        }
        if (!targetPiece || !targetEdge?.length) continue;
        const diff = Math.abs(edge.length - targetEdge.length);
        const tolerance = Math.max(edge.length, targetEdge.length) * 0.03; // 3%
        if (diff > tolerance && diff > 5) { // ignore <5mm
          return `Edge "${edge.edgeType}" (${edge.length.toFixed(0)}mm) doesn't match "${targetEdge.edgeType}" on "${targetPiece.name}" (${targetEdge.length.toFixed(0)}mm) — ${diff.toFixed(0)}mm difference`;
        }
      }
      return null;
    },
  },
  {
    id: 'PERIMETER_REASONABLE',
    name: 'Perimeter is reasonable for piece type',
    category: 'construction',
    description: 'Flag extremely short or long perimeters',
    severity: 'warning',
    check: (piece) => {
      if (!piece.outline || piece.outline.length < 3) return null;
      const perim = outlinePerimeter(piece);
      if (perim < 50) {
        return `Piece "${piece.name}" perimeter is only ${perim.toFixed(0)}mm — may be degenerate`;
      }
      if (perim > 10000) {
        return `Piece "${piece.name}" perimeter is ${(perim / 1000).toFixed(1)}m — unusually large`;
      }
      return null;
    },
  },
  {
    id: 'PIECE_NAMED',
    name: 'Piece has a name',
    category: 'construction',
    description: 'Every piece should be named for identification',
    severity: 'info',
    check: (piece) => {
      if (!piece.name || piece.name.trim() === '' || piece.name === 'Unnamed') {
        return `Piece has no meaningful name — hard to reference in production`;
      }
      return null;
    },
  },
  {
    id: 'CATEGORY_ASSIGNED',
    name: 'Piece has category',
    category: 'construction',
    description: 'Pieces should be classified (bodice, sleeve, skirt, etc.) for copilot reasoning',
    severity: 'info',
    check: (piece) => {
      if (!piece.category) {
        return `Piece "${piece.name}" has no category — copilot can't reason about fit`;
      }
      return null;
    },
  },
  {
    id: 'FABRIC_WEIGHT_DART',
    name: 'Dart appropriateness for fabric weight',
    category: 'fabric',
    description: 'Heavy/stiff fabrics may not press darts well; consider seam shaping instead',
    severity: 'info',
    check: (piece, ctx) => {
      const darts = piece.darts ?? extractDarts(piece);
      if (darts.length === 0) return null;
      if (ctx.fabricWeight === 'heavy') {
        return `Piece "${piece.name}" has ${darts.length} dart(s) — heavy fabric may not press darts cleanly; consider seam shaping`;
      }
      return null;
    },
  },
  {
    id: 'DUPLICATE_PIECE_NAMES',
    name: 'No duplicate piece names',
    category: 'construction',
    description: 'Each piece should have a unique name',
    severity: 'warning',
    check: (piece, ctx) => {
      if (!piece.name) return null;
      const dupes = ctx.pieces.filter(p => p.name === piece.name && p.id !== piece.id);
      if (dupes.length > 0) {
        return `Piece name "${piece.name}" is used by ${dupes.length + 1} pieces`;
      }
      return null;
    },
  },
];

// ─── Engine ──────────────────────────────────────────────────────────────────

export function validatePiece(piece: PatternPiece, context: ProjectContext, categories?: RuleCategory[]): RuleViolation[] {
  const violations: RuleViolation[] = [];
  for (const rule of PATTERN_RULES) {
    if (categories && !categories.includes(rule.category)) continue;
    const msg = rule.check(piece, context);
    if (msg) {
      violations.push({
        ruleId: rule.id,
        ruleName: rule.name,
        severity: rule.severity,
        category: rule.category,
        pieceId: piece.id,
        pieceName: piece.name || 'Unnamed',
        message: msg,
      });
    }
  }
  return violations;
}

export function validateAllPieces(context: ProjectContext, categories?: RuleCategory[]): RuleViolation[] {
  const violations: RuleViolation[] = [];
  for (const piece of context.pieces) {
    violations.push(...validatePiece(piece, context, categories));
  }
  return violations;
}

export function getViolationSummary(violations: RuleViolation[]): string {
  if (violations.length === 0) return '✅ No issues found';
  const errors = violations.filter(v => v.severity === 'error');
  const warnings = violations.filter(v => v.severity === 'warning');
  const infos = violations.filter(v => v.severity === 'info');

  const lines: string[] = [];
  if (errors.length > 0) {
    lines.push(`🔴 ${errors.length} error(s):`);
    for (const e of errors) lines.push(`  • [${e.pieceName}] ${e.message}`);
  }
  if (warnings.length > 0) {
    lines.push(`🟡 ${warnings.length} warning(s):`);
    for (const w of warnings) lines.push(`  • [${w.pieceName}] ${w.message}`);
  }
  if (infos.length > 0) {
    lines.push(`🔵 ${infos.length} info(s):`);
    for (const i of infos) lines.push(`  • [${i.pieceName}] ${i.message}`);
  }
  return lines.join('\n');
}
