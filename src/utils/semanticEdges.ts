/**
 * Semantic Edge Detection — automatically labels edges on pattern pieces.
 *
 * Uses geometry heuristics (position, angle, length) and piece naming
 * to assign meaningful names like "armhole", "hemline", "sideSeam".
 *
 * @module semanticEdges
 */

import type { PatternPiece, PathCommand, SemanticEdge, SemanticEdgeType } from '../types/types';

// ─── Outline Sampling ─────────────────────────────────────────────────────────

interface Segment {
  index: number;         // index in outline array
  startX: number; startY: number;
  endX: number;   endY: number;
  length: number;
  angle: number;         // degrees, 0=right, 90=down
  midX: number;   midY: number;
}

function sampleSegments(outline: PathCommand[]): Segment[] {
  const segments: Segment[] = [];
  let cx = 0, cy = 0;

  for (let i = 0; i < outline.length; i++) {
    const cmd = outline[i];
    let ex = cx, ey = cy;

    switch (cmd.type) {
      case 'M': ex = cmd.values[0]; ey = cmd.values[1]; break;
      case 'L': ex = cmd.values[0]; ey = cmd.values[1]; break;
      case 'H': ex = cmd.values[0]; break;
      case 'V': ey = cmd.values[0]; break;
      case 'C': ex = cmd.values[4]; ey = cmd.values[5]; break;
      case 'S': ex = cmd.values[2]; ey = cmd.values[3]; break;
      case 'Q': ex = cmd.values[2]; ey = cmd.values[3]; break;
      case 'Z': continue;
      default: continue;
    }

    if (cmd.type !== 'M') {
      const dx = ex - cx, dy = ey - cy;
      const len = Math.sqrt(dx * dx + dy * dy);
      segments.push({
        index: i,
        startX: cx, startY: cy,
        endX: ex, endY: ey,
        length: len,
        angle: Math.atan2(dy, dx) * 180 / Math.PI,
        midX: (cx + ex) / 2,
        midY: (cy + ey) / 2,
      });
    }

    cx = ex; cy = ey;
  }

  return segments;
}

// ─── Bounding Box ─────────────────────────────────────────────────────────────

interface BBox {
  minX: number; maxX: number;
  minY: number; maxY: number;
  width: number; height: number;
  centerX: number; centerY: number;
}

function computeBBox(segments: Segment[]): BBox {
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const s of segments) {
    minX = Math.min(minX, s.startX, s.endX);
    maxX = Math.max(maxX, s.startX, s.endX);
    minY = Math.min(minY, s.startY, s.endY);
    maxY = Math.max(maxY, s.startY, s.endY);
  }
  return {
    minX, maxX, minY, maxY,
    width: maxX - minX, height: maxY - minY,
    centerX: (minX + maxX) / 2, centerY: (minY + maxY) / 2,
  };
}

// ─── Edge Classification ──────────────────────────────────────────────────────

type ZoneLabel = 'top' | 'bottom' | 'left' | 'right' | 'center';

function classifyZone(seg: Segment, bbox: BBox): ZoneLabel {
  const relY = (seg.midY - bbox.minY) / bbox.height;
  const relX = (seg.midX - bbox.minX) / bbox.width;

  if (relY < 0.2) return 'top';
  if (relY > 0.8) return 'bottom';
  if (relX < 0.2) return 'left';
  if (relX > 0.8) return 'right';
  return 'center';
}

function isNearlyHorizontal(angle: number): boolean {
  const a = Math.abs(angle);
  return a < 25 || a > 155;
}

function isNearlyVertical(angle: number): boolean {
  const a = Math.abs(angle);
  return a > 65 && a < 115;
}

function isCurved(outline: PathCommand[], index: number): boolean {
  const cmd = outline[index];
  return cmd?.type === 'C' || cmd?.type === 'S' || cmd?.type === 'Q';
}

// ─── Piece Type Guessing ──────────────────────────────────────────────────────

type PieceCategory = 'bodice-front' | 'bodice-back' | 'sleeve' | 'collar' |
  'skirt' | 'trouser' | 'waistband' | 'unknown';

function guessPieceCategory(name: string): PieceCategory {
  const n = name.toLowerCase();
  if (/front|delantero|frente|devant/.test(n)) return 'bodice-front';
  if (/back|espalda|trasero|dos/.test(n)) return 'bodice-back';
  if (/sleeve|manga|manche/.test(n)) return 'sleeve';
  if (/collar|cuello|col/.test(n)) return 'collar';
  if (/skirt|falda|jupe/.test(n)) return 'skirt';
  if (/trouser|pantal|pantalon/.test(n)) return 'trouser';
  if (/waist|cintura|ceinture|pretina/.test(n)) return 'waistband';
  return 'unknown';
}

/**
 * Resolve the edge-detection category, PREFERRING the piece's explicit
 * `category`/`side` (set by the agent's classifyPiece or the user) over
 * guessing from the name. This is what lets edge detection work for DXF
 * pieces: their CAD block names carry no garment role, but once the agent
 * classifies them (e.g. bodice/front, collar) we map that to the internal
 * category and emit role-bearing edges (armhole, neckline, collarNeckEdge)
 * instead of inert positional ones. Name-guessing remains the fallback.
 */
function resolveCategory(piece: PatternPiece): PieceCategory {
  switch (piece.category) {
    case 'bodice': return piece.side === 'back' ? 'bodice-back' : 'bodice-front';
    case 'sleeve': return 'sleeve';
    case 'collar': return 'collar';
    case 'skirt': return 'skirt';
    case 'trouser': return 'trouser';
    case 'waistband': return 'waistband';
    default: return guessPieceCategory(piece.name);
  }
}

// ─── Main Detection ───────────────────────────────────────────────────────────

/**
 * Auto-detect semantic edges on a pattern piece.
 * Uses geometry heuristics + piece name for classification.
 */
export function detectSemanticEdges(piece: PatternPiece): SemanticEdge[] {
  const segments = sampleSegments(piece.outline);
  if (segments.length < 3) return [];

  const bbox = computeBBox(segments);
  const category = resolveCategory(piece);
  const edges: SemanticEdge[] = [];

  // Group consecutive segments by zone
  const groups: { zone: ZoneLabel; segments: Segment[] }[] = [];
  let currentGroup: { zone: ZoneLabel; segments: Segment[] } | null = null;

  for (const seg of segments) {
    const zone = classifyZone(seg, bbox);
    if (!currentGroup || currentGroup.zone !== zone) {
      currentGroup = { zone, segments: [seg] };
      groups.push(currentGroup);
    } else {
      currentGroup.segments.push(seg);
    }
  }

  for (const group of groups) {
    const startIdx = group.segments[0].index;
    const endIdx = group.segments[group.segments.length - 1].index + 1;
    const totalLength = group.segments.reduce((sum, s) => sum + s.length, 0);
    const hasCurve = group.segments.some(s => isCurved(piece.outline, s.index));
    const avgAngle = group.segments.reduce((sum, s) => sum + s.angle, 0) / group.segments.length;
    const avgMidX = group.segments.reduce((sum, s) => sum + s.midX, 0) / group.segments.length;
    const relX = bbox.width > 0 ? (avgMidX - bbox.minX) / bbox.width : 0.5;
    const isCenterX = relX > 0.3 && relX < 0.7;

    let name = 'edge';
    let edgeType: SemanticEdgeType = 'unknown';
    let matchHint: string | undefined;

    if (category === 'bodice-front' || category === 'bodice-back') {
      const opp = category === 'bodice-front' ? 'back' : 'front';
      if (group.zone === 'top' && hasCurve && isCenterX) {
        // Curved AND centered → neckline. Without the relX check, a curved
        // neckline falls into the curved-top rule below and is mislabeled
        // 'armhole' (the failure mode behind "el cuello detectó bordes
        // incorrectos").
        name = 'neckline'; edgeType = 'opening'; matchHint = 'pairs with collarNeckEdge';
      } else if (group.zone === 'top' && hasCurve) {
        name = 'armhole'; edgeType = 'seam'; matchHint = 'pairs with sleeveCap';
      } else if (group.zone === 'top' && isNearlyHorizontal(avgAngle)) {
        name = 'shoulder'; edgeType = 'seam'; matchHint = `pairs with ${opp}-shoulder`;
      } else if (group.zone === 'bottom' && isNearlyHorizontal(avgAngle)) {
        name = 'hemline'; edgeType = 'hem';
      } else if (group.zone === 'left' && isNearlyVertical(avgAngle)) {
        name = category === 'bodice-front' ? 'centerFront' : 'centerBack';
        edgeType = 'fold';
      } else if (group.zone === 'right' && isNearlyVertical(avgAngle)) {
        name = 'sideSeam'; edgeType = 'seam';
        matchHint = `pairs with ${opp}-sideSeam`;
      } else if (group.zone === 'top') {
        name = 'neckline'; edgeType = 'opening'; matchHint = 'pairs with collarNeckEdge';
      }
    } else if (category === 'sleeve') {
      if (group.zone === 'top' && hasCurve) {
        name = 'sleeveCap'; edgeType = 'seam'; matchHint = 'pairs with armhole';
      } else if (group.zone === 'bottom' && isNearlyHorizontal(avgAngle)) {
        name = 'cuffEdge'; edgeType = 'hem';
      } else if (isNearlyVertical(avgAngle)) {
        name = 'underarmSeam'; edgeType = 'seam'; matchHint = 'self-close';
      }
    } else if (category === 'collar') {
      // A collar is a long strip: the bottom long edge sews to the neckline,
      // the top is the free outer edge, the short ends are collar points.
      // Previously collar had NO branch and fell to the generic case → inert
      // positional edges with no matchHint → autoSew mispaired the collar.
      if (group.zone === 'bottom' && isNearlyHorizontal(avgAngle)) {
        name = 'collarNeckEdge'; edgeType = 'seam'; matchHint = 'pairs with neckline';
      } else if (group.zone === 'top' && isNearlyHorizontal(avgAngle)) {
        name = 'collarOuterEdge'; edgeType = 'hem';
      } else {
        name = 'collarEnd'; edgeType = 'seam';
      }
    } else if (category === 'skirt') {
      if (group.zone === 'top' && isNearlyHorizontal(avgAngle)) {
        name = 'waistline'; edgeType = 'seam'; matchHint = 'pairs with waistbandEdge';
      } else if (group.zone === 'bottom') {
        name = 'hemline'; edgeType = 'hem';
      } else if (isNearlyVertical(avgAngle)) {
        name = 'sideSeam'; edgeType = 'seam'; matchHint = 'pairs with sideSeam';
      }
    } else if (category === 'trouser') {
      if (group.zone === 'top' && isNearlyHorizontal(avgAngle)) {
        name = 'waistline'; edgeType = 'seam'; matchHint = 'pairs with waistbandEdge';
      } else if (group.zone === 'bottom') {
        name = 'hemline'; edgeType = 'hem';
      } else if (hasCurve) {
        name = 'crotchCurve'; edgeType = 'seam'; matchHint = 'pairs with crotchCurve';
      } else if (isNearlyVertical(avgAngle)) {
        name = 'sideSeam'; edgeType = 'seam'; matchHint = 'pairs with sideSeam';
      }
    } else if (category === 'waistband') {
      // A waistband is a long strip: one long edge sews to the waistline,
      // the other is the top/fold edge, the short ends close the band.
      // (Previously waistband had no branch → generic edges, unsewable.)
      if (group.zone === 'bottom' && isNearlyHorizontal(avgAngle)) {
        name = 'waistbandEdge'; edgeType = 'seam'; matchHint = 'pairs with waistline';
      } else if (group.zone === 'top' && isNearlyHorizontal(avgAngle)) {
        name = 'waistbandFold'; edgeType = 'fold';
      } else {
        name = 'waistbandEnd'; edgeType = 'seam';
      }
    } else {
      // Generic: assign by zone
      if (group.zone === 'top') { name = 'topEdge'; edgeType = hasCurve ? 'seam' : 'unknown'; }
      else if (group.zone === 'bottom') { name = 'bottomEdge'; edgeType = 'hem'; }
      else if (group.zone === 'left') { name = 'leftEdge'; edgeType = 'fold'; }
      else if (group.zone === 'right') { name = 'rightEdge'; edgeType = 'seam'; }
    }

    // Deduplicate names within piece
    const existing = edges.filter(e => e.name === name);
    const finalName = existing.length > 0 ? `${name}-${existing.length + 1}` : name;

    edges.push({
      id: `${piece.id}:${finalName}`,
      name: finalName,
      segmentRange: [startIdx, endIdx],
      edgeType,
      matchHint,
      length: Math.round(totalLength * 100) / 100,
    });
  }

  return edges;
}

/**
 * Find an edge by name (case-insensitive, partial match).
 */
export function findEdgeByName(edges: SemanticEdge[], query: string): SemanticEdge | undefined {
  const q = query.toLowerCase();
  return edges.find(e => e.name.toLowerCase() === q)
    ?? edges.find(e => e.name.toLowerCase().includes(q));
}

/**
 * Get matching edges for auto-sew across two pieces.
 */
export function findMatchingEdges(
  pieceA: PatternPiece,
  pieceB: PatternPiece,
): { edgeA: SemanticEdge; edgeB: SemanticEdge }[] {
  const matches: { edgeA: SemanticEdge; edgeB: SemanticEdge }[] = [];
  if (!pieceA.edges || !pieceB.edges) return matches;

  for (const eA of pieceA.edges) {
    if (!eA.matchHint) continue;
    for (const eB of pieceB.edges) {
      // Check if A's hint mentions B's name or vice versa
      const hintA = eA.matchHint.toLowerCase();
      const hintB = eB.matchHint?.toLowerCase() ?? '';
      if (hintA.includes(eB.name.toLowerCase()) || hintB.includes(eA.name.toLowerCase())) {
        matches.push({ edgeA: eA, edgeB: eB });
      }
    }
  }

  return matches;
}

// ─── Per-edge metadata preservation (parity plan Fase 6) ──────────────────────

/**
 * Carry user-set per-edge SA widths across an edge re-detection, re-keying
 * by edge NAME (stable across re-detection; positional `segmentRange`
 * indices are not).
 *
 * Fase 6 fix: the generative load path (`loadProject` → re-detect after
 * category/side classification) replaced `piece.edges` wholesale —
 * `detectSemanticEdges` never copies `seamAllowanceWidth`, so widths the
 * user set with the Seam Allowance tool silently vanished on every
 * load→save→reload round trip.
 *
 * Only widths whose edge NAME survives the re-detection are preserved; a
 * width on a renamed/vanished edge is dropped (there is no honest target
 * to re-attach it to).
 */
export function preserveEdgeWidthsByName(
  oldEdges: SemanticEdge[] | undefined,
  newEdges: SemanticEdge[],
): SemanticEdge[] {
  if (!oldEdges || oldEdges.length === 0) return newEdges;
  const widthByName = new Map<string, number>();
  for (const e of oldEdges) {
    if (e.seamAllowanceWidth != null) widthByName.set(e.name, e.seamAllowanceWidth);
  }
  if (widthByName.size === 0) return newEdges;
  return newEdges.map(e => {
    const w = widthByName.get(e.name);
    return w != null ? { ...e, seamAllowanceWidth: w } : e;
  });
}
