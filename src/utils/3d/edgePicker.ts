/**
 * Edge Picker — finds the closest SemanticEdge to a 3D hit point
 * in a piece's local coordinate space.
 *
 * Pure function: no Three.js imports, no side effects.
 *
 * @module edgePicker
 */

import type { PathCommand, SemanticEdge } from '../../types/types';
import { flattenPath } from '../seam/index';

const SCALE = 0.001; // 1mm = 0.001m
const DEFAULT_THRESHOLD = 0.015; // 15mm in meters

// ─── Types ──────────────────────────────────────────────────────────────────

export interface EdgePickResult {
  edge: SemanticEdge;
  distance: number; // distance in meters
}

export interface Local3DPoint {
  x: number; // local X (meters)
  z: number; // local Z (meters), Y is up and always 0
}

// ─── Helpers ────────────────────────────────────────────────────────────────

/**
 * Squared distance from point (px, pz) to line segment (ax, az)–(bx, bz).
 */
function pointToSegmentDistanceSq(
  px: number, pz: number,
  ax: number, az: number,
  bx: number, bz: number,
): number {
  const dx = bx - ax;
  const dz = bz - az;
  const lenSq = dx * dx + dz * dz;

  if (lenSq === 0) return (px - ax) ** 2 + (pz - az) ** 2;

  let t = ((px - ax) * dx + (pz - az) * dz) / lenSq;
  t = Math.max(0, Math.min(1, t));

  const cx = ax + t * dx;
  const cz = az + t * dz;
  return (px - cx) ** 2 + (pz - cz) ** 2;
}

/**
 * Compute the minimum squared distance from a point to a polyline
 * defined by an array of Local3DPoints, over the index range [start, end].
 */
function pointToPolylineDistanceSq(
  px: number, pz: number,
  pts: Local3DPoint[],
  start: number,
  end: number,
): number {
  let minDistSq = Infinity;

  // Clamp to valid range
  const s = Math.max(0, start);
  const e = Math.min(pts.length - 1, end);

  for (let i = s; i < e; i++) {
    const dSq = pointToSegmentDistanceSq(
      px, pz,
      pts[i].x, pts[i].z,
      pts[i + 1].x, pts[i + 1].z,
    );
    if (dSq < minDistSq) minDistSq = dSq;
  }

  // If the range yields no segments, compute distance to the single point
  if (s >= e && s < pts.length) {
    minDistSq = (px - pts[s].x) ** 2 + (pz - pts[s].z) ** 2;
  }

  return minDistSq;
}

// ─── Public API ─────────────────────────────────────────────────────────────

/**
 * Convert an outline (PathCommand[]) to centered local 3D points.
 *
 * Matches the transform used by PieceMesh:
 * 1. Flatten path to 2D points (mm)
 * 2. Convert to 3D: x3d = x * 0.001, z3d = -y * 0.001
 * 3. Compute bounding box center and subtract (centering)
 *
 * The EdgeHighlight component needs this same transform.
 */
export function outlineToLocal3D(outline: PathCommand[]): Local3DPoint[] {
  if (outline.length === 0) return [];

  const flat = flattenPath(outline);
  if (flat.length === 0) return [];

  // Convert 2D (mm) → local 3D (meters)
  const pts: Local3DPoint[] = flat.map(p => ({
    x: p.x * SCALE,
    z: -p.y * SCALE,
  }));

  // Compute bounding box center
  let minX = Infinity, maxX = -Infinity;
  let minZ = Infinity, maxZ = -Infinity;
  for (const p of pts) {
    if (p.x < minX) minX = p.x;
    if (p.x > maxX) maxX = p.x;
    if (p.z < minZ) minZ = p.z;
    if (p.z > maxZ) maxZ = p.z;
  }
  const centerX = (minX + maxX) / 2;
  const centerZ = (minZ + maxZ) / 2;

  // Subtract center (centering)
  for (const p of pts) {
    p.x -= centerX;
    p.z -= centerZ;
  }

  return pts;
}

/**
 * Yaw rotation for a piece's 3D placement, matching PieceMesh / PiecePickMesh /
 * EdgeHighlight. Shared by Sew3DTool and SeamRenderer3D so seam lines land
 * exactly on the edges (the floating-line risk if the transforms drift).
 *
 * @param pieceRotationDeg piece.rotation in degrees (optional)
 * @param rot the placement's base [x,y,z] rotation (optional)
 */
export function pieceHighlightRotation(
  pieceRotationDeg: number | undefined,
  rot?: [number, number, number],
): [number, number, number] {
  const yaw = -(pieceRotationDeg ?? 0) * (Math.PI / 180);
  if (rot) return [rot[0], rot[1] + yaw, rot[2]];
  return [0, yaw, 0];
}

/**
 * Local-space 3D midpoint of a semantic edge (meters, centered, Y plane).
 * Uses the SAME outline→local transform and segmentRange clamping as
 * EdgeHighlight, so a seam endpoint sits on the edge it represents.
 */
export function edgeMidpointLocal3D(
  outline: PathCommand[],
  edge: SemanticEdge,
): { x: number; z: number } | null {
  const local3D = outlineToLocal3D(outline);
  if (local3D.length === 0) return null;
  const [start, end] = edge.segmentRange;
  const clampedStart = Math.max(0, Math.min(start, local3D.length - 1));
  const clampedEnd = Math.max(clampedStart + 1, Math.min(end + 1, local3D.length));
  const pts = local3D.slice(clampedStart, clampedEnd);
  if (pts.length === 0) return null;
  let sx = 0;
  let sz = 0;
  for (const p of pts) {
    sx += p.x;
    sz += p.z;
  }
  return { x: sx / pts.length, z: sz / pts.length };
}

/**
 * Find the closest SemanticEdge to a 3D hit point in piece local space.
 *
 * @param localHitX  Hit point X in local space (meters)
 * @param localHitZ  Hit point Z in local space (meters), Y is up
 * @param outline    Piece outline as PathCommands
 * @param edges      Semantic edges (with segmentRange indices into flattened points)
 * @param threshold  Max picking distance in meters (default 0.015 = 15mm)
 * @returns Closest edge and its distance, or null if none within threshold
 */
export function pickEdge(
  localHitX: number,
  localHitZ: number,
  outline: PathCommand[],
  edges: SemanticEdge[] | undefined,
  threshold: number = DEFAULT_THRESHOLD,
): EdgePickResult | null {
  if (!edges || edges.length === 0) return null;
  if (outline.length === 0) return null;

  const pts = outlineToLocal3D(outline);
  if (pts.length === 0) return null;

  let bestEdge: SemanticEdge | null = null;
  let bestDistSq = Infinity;
  const thresholdSq = threshold * threshold;

  for (const edge of edges) {
    const [start, end] = edge.segmentRange;
    const distSq = pointToPolylineDistanceSq(localHitX, localHitZ, pts, start, end);

    if (distSq < bestDistSq) {
      bestDistSq = distSq;
      bestEdge = edge;
    }
  }

  if (bestEdge === null || bestDistSq > thresholdSq) return null;

  return {
    edge: bestEdge,
    distance: Math.sqrt(bestDistSq),
  };
}
