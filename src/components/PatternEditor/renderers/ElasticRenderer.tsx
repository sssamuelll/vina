/**
 * ElasticRenderer — Renders zigzag SVG paths for elastic edges on the 2D pattern canvas.
 *
 * Visual encoding:
 *  - band       → blue   (#3B82F6)
 *  - shirring   → purple (#8B5CF6)
 *  - drawstring → green  (#10B981)
 *
 * Each elastic is drawn as a zigzag line along the edge segment defined by
 * [tStart, tEnd] on the piece outline, offset perpendicular to the edge.
 * Sample spacing ~4 mm; amplitude = elastic.width * 0.3.
 */

import { useMemo } from 'react';
import { useSelector } from 'react-redux';
import type { RootState } from '../../../store';
import type { Elastic, PathCommand, PatternPiece } from '../../../types/types';

// ─── Color map ───────────────────────────────────────────────────────────────

const ELASTIC_COLORS: Record<Elastic['type'], string> = {
  band: '#3B82F6',
  shirring: '#8B5CF6',
  drawstring: '#10B981',
};

// ─── Geometry helpers ────────────────────────────────────────────────────────

interface Segment {
  /** World-space start point of this path segment */
  start: { x: number; y: number };
  /** World-space end point of this path segment */
  end: { x: number; y: number };
  /** Approximate arc length */
  length: number;
}

/**
 * Extract all linear segments from the outline PathCommand[] that belong to
 * segmentRange [rangeStart, rangeEnd).  Curves are linearly approximated.
 */
function extractSegments(outline: PathCommand[], rangeStart: number, rangeEnd: number): Segment[] {
  const segments: Segment[] = [];
  let x = 0;
  let y = 0;

  for (let i = 0; i < outline.length; i++) {
    const cmd = outline[i];
    const v = cmd.values;
    const prevX = x;
    const prevY = y;

    switch (cmd.type) {
      case 'M': x = v[0]; y = v[1]; break;
      case 'L':
        if (i >= rangeStart && i < rangeEnd) {
          segments.push({ start: { x: prevX, y: prevY }, end: { x: v[0], y: v[1] }, length: Math.hypot(v[0] - prevX, v[1] - prevY) });
        }
        x = v[0]; y = v[1];
        break;
      case 'H': {
        const ex = v[0];
        if (i >= rangeStart && i < rangeEnd) {
          segments.push({ start: { x: prevX, y }, end: { x: ex, y }, length: Math.abs(ex - prevX) });
        }
        x = ex;
        break;
      }
      case 'V': {
        const ey = v[0];
        if (i >= rangeStart && i < rangeEnd) {
          segments.push({ start: { x, y: prevY }, end: { x, y: ey }, length: Math.abs(ey - prevY) });
        }
        y = ey;
        break;
      }
      case 'C': {
        // Cubic bezier — approximate with 8 linear steps
        const [cx1, cy1, cx2, cy2, ex, ey] = v;
        if (i >= rangeStart && i < rangeEnd) {
          let lx = prevX; let ly = prevY;
          const STEPS = 8;
          for (let s = 1; s <= STEPS; s++) {
            const t = s / STEPS;
            const mt = 1 - t;
            const nx = mt * mt * mt * prevX + 3 * mt * mt * t * cx1 + 3 * mt * t * t * cx2 + t * t * t * ex;
            const ny = mt * mt * mt * prevY + 3 * mt * mt * t * cy1 + 3 * mt * t * t * cy2 + t * t * t * ey;
            segments.push({ start: { x: lx, y: ly }, end: { x: nx, y: ny }, length: Math.hypot(nx - lx, ny - ly) });
            lx = nx; ly = ny;
          }
        }
        x = ex; y = ey;
        break;
      }
      case 'Q': {
        // Quadratic bezier — approximate with 6 linear steps
        const [cx1, cy1, ex, ey] = v;
        if (i >= rangeStart && i < rangeEnd) {
          let lx = prevX; let ly = prevY;
          const STEPS = 6;
          for (let s = 1; s <= STEPS; s++) {
            const t = s / STEPS;
            const mt = 1 - t;
            const nx = mt * mt * prevX + 2 * mt * t * cx1 + t * t * ex;
            const ny = mt * mt * prevY + 2 * mt * t * cy1 + t * t * ey;
            segments.push({ start: { x: lx, y: ly }, end: { x: nx, y: ny }, length: Math.hypot(nx - lx, ny - ly) });
            lx = nx; ly = ny;
          }
        }
        x = ex; y = ey;
        break;
      }
      case 'Z': {
        const m = outline[0];
        if (m.type === 'M') {
          if (i >= rangeStart && i < rangeEnd) {
            segments.push({ start: { x, y }, end: { x: m.values[0], y: m.values[1] }, length: Math.hypot(m.values[0] - x, m.values[1] - y) });
          }
          x = m.values[0]; y = m.values[1];
        }
        break;
      }
    }
  }
  return segments;
}

/**
 * Sample evenly-spaced points along a sequence of segments.
 * Returns { x, y } positions with spacing ~= `spacing` units.
 */
function samplePoints(segments: Segment[], tStart: number, tEnd: number, spacing: number): Array<{ x: number; y: number }> {
  if (segments.length === 0) return [];

  // Total arc length
  const totalLen = segments.reduce((sum, s) => sum + s.length, 0);
  if (totalLen < 0.001) return [];

  // Convert tStart/tEnd to arc-length distances
  const dStart = tStart * totalLen;
  const dEnd = tEnd * totalLen;
  const segLen = dEnd - dStart;
  if (segLen <= 0) return [];

  const points: Array<{ x: number; y: number }> = [];
  const count = Math.max(2, Math.ceil(segLen / spacing) + 1);
  const step = segLen / (count - 1);

  for (let i = 0; i < count; i++) {
    const targetDist = dStart + i * step;
    // Walk through segments to find the point at targetDist
    let walked = 0;
    for (const seg of segments) {
      const nextWalked = walked + seg.length;
      if (targetDist <= nextWalked + 0.001) {
        const t = seg.length > 0.001 ? (targetDist - walked) / seg.length : 0;
        const clampedT = Math.max(0, Math.min(1, t));
        points.push({
          x: seg.start.x + (seg.end.x - seg.start.x) * clampedT,
          y: seg.start.y + (seg.end.y - seg.start.y) * clampedT,
        });
        break;
      }
      walked = nextWalked;
    }
  }

  return points;
}

/**
 * Build a zigzag SVG path string from evenly-spaced points.
 * Alternates between +amplitude and -amplitude perpendicular offsets.
 */
function buildZigzagPath(points: Array<{ x: number; y: number }>, amplitude: number): string {
  if (points.length < 2) return '';

  const parts: string[] = [];
  for (let i = 0; i < points.length; i++) {
    const p = points[i];
    // Compute tangent from neighbors
    const prev = points[i - 1] ?? points[i];
    const next = points[i + 1] ?? points[i];
    const dx = next.x - prev.x;
    const dy = next.y - prev.y;
    const len = Math.hypot(dx, dy);
    // Perpendicular (rotate 90°)
    const px = len > 0.001 ? -dy / len : 0;
    const py = len > 0.001 ? dx / len : 1;
    // Alternate sign
    const sign = i % 2 === 0 ? 1 : -1;
    const ox = p.x + px * amplitude * sign;
    const oy = p.y + py * amplitude * sign;
    parts.push(i === 0 ? `M${ox},${oy}` : `L${ox},${oy}`);
  }
  return parts.join(' ');
}

// ─── Per-elastic rendering ────────────────────────────────────────────────────

interface SingleElasticProps {
  elastic: Elastic;
  piece: PatternPiece;
  zoom2D: number;
  isSelected: boolean;
}

function SingleElastic({ elastic, piece, zoom2D, isSelected }: SingleElasticProps) {
  const pathData = useMemo(() => {
    const edge = piece.edges?.find(e => e.name === elastic.edgeName);
    if (!edge) return null;

    const [rangeStart, rangeEnd] = edge.segmentRange;
    const segments = extractSegments(piece.outline, rangeStart, rangeEnd);
    if (segments.length === 0) return null;

    // Sample spacing ~4 mm in canvas units
    const SPACING = 4;
    const points = samplePoints(segments, elastic.tStart, elastic.tEnd, SPACING);
    if (points.length < 2) return null;

    const amplitude = elastic.width * 0.3;
    return buildZigzagPath(points, amplitude);
  }, [piece, elastic]);

  if (!pathData) return null;

  const color = ELASTIC_COLORS[elastic.type] ?? '#888';
  const opacity = isSelected ? 0.9 : 0.4;
  const strokeWidth = 1.5 / zoom2D;
  const offset = piece.position;

  return (
    <g
      data-elastic-id={elastic.id}
      transform={`translate(${offset.x}, ${offset.y})`}
      pointerEvents="none"
    >
      <path
        d={pathData}
        fill="none"
        stroke={color}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
        opacity={opacity}
      />
    </g>
  );
}

// ─── Main renderer ────────────────────────────────────────────────────────────

interface ElasticRendererProps {
  zoom2D: number;
}

export default function ElasticRenderer({ zoom2D }: ElasticRendererProps) {
  const elastics = useSelector((s: RootState) => s.project.elastics);
  const pieces = useSelector((s: RootState) => s.project.pieces);
  const selectedElasticId = useSelector((s: RootState) => (s.editor as { selectedElasticId?: string | null }).selectedElasticId ?? null);

  return (
    <>
      {elastics
        .filter(el => el.active !== false)
        .map(el => {
          const piece = pieces.find(p => p.id === el.pieceId);
          if (!piece) return null;
          return (
            <SingleElastic
              key={el.id}
              elastic={el}
              piece={piece}
              zoom2D={zoom2D}
              isSelected={selectedElasticId === el.id}
            />
          );
        })}
    </>
  );
}
