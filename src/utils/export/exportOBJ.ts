import type { PatternPiece, Point2D } from '../../types/types';
import { flattenPath } from '../seam/index';

function cross2D(o: Point2D, a: Point2D, b: Point2D): number {
  return (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
}

function isPointInTriangle(p: Point2D, a: Point2D, b: Point2D, c: Point2D): boolean {
  const d1 = cross2D(p, a, b);
  const d2 = cross2D(p, b, c);
  const d3 = cross2D(p, c, a);
  const hasNeg = (d1 < 0) || (d2 < 0) || (d3 < 0);
  const hasPos = (d1 > 0) || (d2 > 0) || (d3 > 0);
  return !(hasNeg && hasPos);
}

function isConvex(prev: Point2D, curr: Point2D, next: Point2D, ccw: boolean): boolean {
  const c = cross2D(prev, curr, next);
  return ccw ? c > 0 : c < 0;
}

function polygonArea(pts: Point2D[]): number {
  let sum = 0;
  for (let i = 0; i < pts.length; i++) {
    const j = (i + 1) % pts.length;
    sum += pts[i].x * pts[j].y - pts[j].x * pts[i].y;
  }
  return sum / 2;
}

/**
 * Triangulate a simple polygon using ear-clipping.
 *
 * @remarks
 * Iteratively identifies "ear" vertices (convex vertices whose triangle
 * contains no other polygon vertex) and clips them until only a triangle remains.
 *
 * @param points - Ordered polygon vertices (CCW or CW winding)
 * @returns Array of triangle index triples `[a, b, c]` referencing the input array
 */
export function triangulate(points: Point2D[]): number[][] {
  if (points.length < 3) return [];
  if (points.length === 3) return [[0, 1, 2]];

  const indices = points.map((_, i) => i);
  const ccw = polygonArea(points) > 0;
  const triangles: number[][] = [];

  let safety = indices.length * 3;
  while (indices.length > 3 && safety-- > 0) {
    let earFound = false;
    for (let i = 0; i < indices.length; i++) {
      const prevIdx = (i - 1 + indices.length) % indices.length;
      const nextIdx = (i + 1) % indices.length;
      const prev = points[indices[prevIdx]];
      const curr = points[indices[i]];
      const next = points[indices[nextIdx]];

      if (!isConvex(prev, curr, next, ccw)) continue;

      let isEar = true;
      for (let j = 0; j < indices.length; j++) {
        if (j === prevIdx || j === i || j === nextIdx) continue;
        if (isPointInTriangle(points[indices[j]], prev, curr, next)) {
          isEar = false;
          break;
        }
      }

      if (isEar) {
        triangles.push([indices[prevIdx], indices[i], indices[nextIdx]]);
        indices.splice(i, 1);
        earFound = true;
        break;
      }
    }
    if (!earFound) break;
  }

  if (indices.length === 3) {
    triangles.push([indices[0], indices[1], indices[2]]);
  }

  return triangles;
}

/**
 * Generate a Wavefront OBJ string from an array of pattern pieces.
 *
 * Each piece becomes a named object (`o <name>`). Outlines are flattened to
 * vertices on the Z=0 plane and triangulated via ear-clipping for face output.
 *
 * @param pieces - Pattern pieces to export
 * @returns OBJ file content as a string
 */
export function generateOBJ(pieces: PatternPiece[]): string {
  const lines: string[] = ['# OpenClo OBJ Export'];
  let vertexOffset = 0;

  for (const piece of pieces) {
    const name = piece.name.replace(/\s+/g, '_');
    lines.push(`o ${name}`);

    const points = flattenPath(piece.outline);
    if (points.length < 3) { continue; }

    // Remove duplicate closing point if present
    const last = points[points.length - 1];
    const first = points[0];
    const pts = (Math.abs(last.x - first.x) < 0.001 && Math.abs(last.y - first.y) < 0.001)
      ? points.slice(0, -1)
      : points;

    for (const p of pts) {
      lines.push(`v ${p.x.toFixed(4)} ${p.y.toFixed(4)} 0.0000`);
    }

    const faces = triangulate(pts);
    for (const [a, b, c] of faces) {
      lines.push(`f ${a + 1 + vertexOffset} ${b + 1 + vertexOffset} ${c + 1 + vertexOffset}`);
    }

    vertexOffset += pts.length;
  }

  return lines.join('\n') + '\n';
}

/**
 * Generate an OBJ file from pattern pieces and trigger a browser download.
 *
 * @param pieces - Pattern pieces to export
 * @param filename - Download filename (default: `'pattern.obj'`)
 */
export function downloadOBJ(pieces: PatternPiece[], filename: string = 'pattern.obj'): void {
  const content = generateOBJ(pieces);
  const blob = new Blob([content], { type: 'text/plain' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
