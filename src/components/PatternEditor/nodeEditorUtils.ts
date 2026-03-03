/**
 * nodeEditorUtils.ts — Pure utility functions for node editing operations.
 *
 * Extracted from useNodeEditor.ts so that useEditPattern, useEditCurve,
 * and other hooks can share the same logic without React or Redux deps.
 */

import { Point2D, PathCommand, PatternPiece } from '../../types/types';

// ─── Types ───

export interface NodeRef {
  pieceId: string;
  /** Index in the outline PathCommand[] array */
  commandIndex: number;
  /** Which point within the command */
  pointType: 'anchor' | 'cp1' | 'cp2';
}

export interface EditableNode {
  ref: NodeRef;
  position: Point2D;
  /** Control point 1 (incoming handle before anchor, for C: v[2],v[3]) */
  cp1?: Point2D;
  /** Control point 2 (outgoing handle after anchor) */
  cp2?: Point2D;
}

export interface SegmentHit {
  commandIndex: number;
  t: number;
  distance: number;
  point: Point2D;
}

// ─── Internal Helpers ───

/** Extract the anchor (endpoint) from any command type. Returns null for Z. */
export function getAnchor(cmd: PathCommand): Point2D | null {
  const v = cmd.values;
  switch (cmd.type) {
    case 'M':
    case 'L':
      return { x: v[0], y: v[1] };
    case 'C':
      return { x: v[4], y: v[5] };
    case 'Q':
      return { x: v[2], y: v[3] };
    case 'Z':
      return null;
    default:
      return null;
  }
}

/**
 * Compute the distance from point (px, py) to the line segment (x1,y1)-(x2,y2),
 * returning the distance, the t parameter (0-1), and the closest point on the segment.
 */
export function distToSegmentWithT(
  px: number, py: number,
  x1: number, y1: number,
  x2: number, y2: number,
): { distance: number; t: number; point: Point2D } {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const lenSq = dx * dx + dy * dy;

  let t: number;
  if (lenSq === 0) {
    // Degenerate segment (zero length)
    t = 0;
  } else {
    t = ((px - x1) * dx + (py - y1) * dy) / lenSq;
    t = Math.max(0, Math.min(1, t));
  }

  const projX = x1 + t * dx;
  const projY = y1 + t * dy;
  const distance = Math.hypot(px - projX, py - projY);

  return { distance, t, point: { x: projX, y: projY } };
}

// ─── Public Functions ───

/** Extract editable nodes from a piece's outline */
export function extractNodes(piece: PatternPiece): EditableNode[] {
  const nodes: EditableNode[] = [];
  const cmds = piece.outline;

  for (let i = 0; i < cmds.length; i++) {
    const cmd = cmds[i];
    const v = cmd.values;

    switch (cmd.type) {
      case 'M':
        nodes.push({
          ref: { pieceId: piece.id, commandIndex: i, pointType: 'anchor' },
          position: { x: v[0], y: v[1] },
        });
        break;
      case 'L':
        nodes.push({
          ref: { pieceId: piece.id, commandIndex: i, pointType: 'anchor' },
          position: { x: v[0], y: v[1] },
        });
        break;
      case 'C': {
        // Cubic bezier: cp1(v[0],v[1]), cp2(v[2],v[3]), anchor(v[4],v[5])
        nodes.push({
          ref: { pieceId: piece.id, commandIndex: i, pointType: 'anchor' },
          position: { x: v[4], y: v[5] },
          cp1: { x: v[2], y: v[3] }, // control point before this anchor
          cp2: undefined,
        });
        break;
      }
      case 'Q': {
        // Quadratic bezier: cp1(v[0],v[1]), anchor(v[2],v[3])
        nodes.push({
          ref: { pieceId: piece.id, commandIndex: i, pointType: 'anchor' },
          position: { x: v[2], y: v[3] },
          cp1: { x: v[0], y: v[1] },
        });
        break;
      }
      // Z doesn't add a node
    }
  }

  return nodes;
}

/** Apply a node position change back to the PathCommand array (immutable) */
export function applyNodeMove(
  outline: PathCommand[],
  commandIndex: number,
  pointType: 'anchor' | 'cp1' | 'cp2',
  newPos: Point2D,
): PathCommand[] {
  const cmds = outline.map(c => ({ ...c, values: [...c.values] }));
  const cmd = cmds[commandIndex];

  if (!cmd) return cmds;

  switch (cmd.type) {
    case 'M':
    case 'L':
      if (pointType === 'anchor') {
        cmd.values[0] = newPos.x;
        cmd.values[1] = newPos.y;
      }
      break;
    case 'C':
      if (pointType === 'anchor') {
        // Move anchor (v[4], v[5]) and drag control points with it
        const dx = newPos.x - cmd.values[4];
        const dy = newPos.y - cmd.values[5];
        cmd.values[4] = newPos.x;
        cmd.values[5] = newPos.y;
        // Move cp2 (incoming handle) with anchor
        cmd.values[2] += dx;
        cmd.values[3] += dy;
        // Also move cp1 of NEXT command if it's a C
        const nextIdx = commandIndex + 1;
        if (nextIdx < cmds.length && cmds[nextIdx].type === 'C') {
          cmds[nextIdx].values[0] += dx;
          cmds[nextIdx].values[1] += dy;
        }
      } else if (pointType === 'cp1') {
        // cp1 = outgoing handle of PREVIOUS node = values[0,1]
        cmd.values[0] = newPos.x;
        cmd.values[1] = newPos.y;
      } else if (pointType === 'cp2') {
        // cp2 = incoming handle of THIS node = values[2,3]
        cmd.values[2] = newPos.x;
        cmd.values[3] = newPos.y;
      }
      break;
    case 'Q':
      if (pointType === 'anchor') {
        const qdx = newPos.x - cmd.values[2];
        const qdy = newPos.y - cmd.values[3];
        cmd.values[2] = newPos.x;
        cmd.values[3] = newPos.y;
        cmd.values[0] += qdx;
        cmd.values[1] += qdy;
      } else if (pointType === 'cp1') {
        cmd.values[0] = newPos.x;
        cmd.values[1] = newPos.y;
      }
      break;
  }

  return cmds;
}

/** Check if a point is within threshold of any node's anchor position */
export function hitTestNode(
  point: Point2D,
  nodes: EditableNode[],
  threshold: number,
): NodeRef | null {
  let closest: NodeRef | null = null;
  let closestDist = Infinity;

  for (const node of nodes) {
    const d = Math.hypot(point.x - node.position.x, point.y - node.position.y);
    if (d < threshold && d < closestDist) {
      closestDist = d;
      closest = node.ref;
    }
  }

  return closest;
}

/**
 * Find the nearest segment in an outline to a given point.
 * Returns the commandIndex, t parameter, distance, and the projected point.
 * Also checks the closing segment (last anchor back to first anchor).
 *
 * NOTE: For C/Q bezier segments, distance is computed against the chord (straight
 * line between anchors), not the actual curve arc. This means clicks on a visible
 * bezier arc far from the chord may not register. A future improvement should
 * sample the bezier at N points and compute distance to the polyline approximation.
 */
export function nearestSegment(
  point: Point2D,
  outline: PathCommand[],
): SegmentHit | null {
  let bestHit: SegmentHit | null = null;

  // Collect anchors with their command indices
  const anchors: { index: number; pos: Point2D }[] = [];
  for (let i = 0; i < outline.length; i++) {
    const a = getAnchor(outline[i]);
    if (a) {
      anchors.push({ index: i, pos: a });
    }
  }

  if (anchors.length < 2) return null;

  // Check each segment between consecutive anchors
  for (let i = 1; i < anchors.length; i++) {
    const prev = anchors[i - 1];
    const curr = anchors[i];

    const hit = distToSegmentWithT(
      point.x, point.y,
      prev.pos.x, prev.pos.y,
      curr.pos.x, curr.pos.y,
    );

    if (!bestHit || hit.distance < bestHit.distance) {
      bestHit = {
        commandIndex: curr.index,
        t: hit.t,
        distance: hit.distance,
        point: hit.point,
      };
    }
  }

  // Check closing segment: last anchor back to first anchor
  const first = anchors[0];
  const last = anchors[anchors.length - 1];
  const closingHit = distToSegmentWithT(
    point.x, point.y,
    last.pos.x, last.pos.y,
    first.pos.x, first.pos.y,
  );

  // The closing segment's commandIndex: use the Z command index if it exists,
  // otherwise use 0 (the M command). Convention: we use the index of the Z command
  // or fallback to the first anchor.
  const zIndex = outline.findIndex(c => c.type === 'Z');
  const closingIdx = zIndex >= 0 ? zIndex : 0;

  if (!bestHit || closingHit.distance < bestHit.distance) {
    bestHit = {
      commandIndex: closingIdx,
      t: closingHit.t,
      distance: closingHit.distance,
      point: closingHit.point,
    };
  }

  return bestHit;
}

/**
 * Split a segment at parameter t.
 * For L: inserts a new L at the interpolated point.
 * For C: de Casteljau subdivision into two C commands.
 * For Q: subdivide into two Q commands.
 */
export function splitSegmentAt(
  outline: PathCommand[],
  commandIndex: number,
  t: number,
): PathCommand[] {
  const cmds = outline.map(c => ({ ...c, values: [...c.values] }));
  const cmd = cmds[commandIndex];

  if (!cmd) return cmds;

  // Find previous anchor (the start point of this segment)
  let prevAnchor: Point2D | null = null;
  for (let i = commandIndex - 1; i >= 0; i--) {
    prevAnchor = getAnchor(cmds[i]);
    if (prevAnchor) break;
  }
  if (!prevAnchor) return cmds;

  switch (cmd.type) {
    case 'L': {
      // Interpolate along the line
      const anchor = getAnchor(cmd)!;
      const midX = prevAnchor.x + t * (anchor.x - prevAnchor.x);
      const midY = prevAnchor.y + t * (anchor.y - prevAnchor.y);

      const newL: PathCommand = { type: 'L', values: [midX, midY] };
      // Insert the new point before the current command
      cmds.splice(commandIndex, 0, newL);
      return cmds;
    }

    case 'C': {
      // De Casteljau subdivision
      const v = cmd.values;
      const p0 = prevAnchor;
      const p1 = { x: v[0], y: v[1] }; // cp1
      const p2 = { x: v[2], y: v[3] }; // cp2
      const p3 = { x: v[4], y: v[5] }; // anchor

      // Level 1
      const a = lerp2D(p0, p1, t);
      const b = lerp2D(p1, p2, t);
      const c = lerp2D(p2, p3, t);

      // Level 2
      const d = lerp2D(a, b, t);
      const e = lerp2D(b, c, t);

      // Level 3 (the split point)
      const f = lerp2D(d, e, t);

      // First half: from p0 through a, d to f
      const c1: PathCommand = {
        type: 'C',
        values: [a.x, a.y, d.x, d.y, f.x, f.y],
      };

      // Second half: from f through e, c to p3
      const c2: PathCommand = {
        type: 'C',
        values: [e.x, e.y, c.x, c.y, p3.x, p3.y],
      };

      // Replace the original C with c1, c2
      cmds.splice(commandIndex, 1, c1, c2);
      return cmds;
    }

    case 'Q': {
      // Quadratic de Casteljau
      const v = cmd.values;
      const q0 = prevAnchor;
      const q1 = { x: v[0], y: v[1] }; // cp
      const q2 = { x: v[2], y: v[3] }; // anchor

      const a = lerp2D(q0, q1, t);
      const b = lerp2D(q1, q2, t);
      const m = lerp2D(a, b, t);

      const qa: PathCommand = { type: 'Q', values: [a.x, a.y, m.x, m.y] };
      const qb: PathCommand = { type: 'Q', values: [b.x, b.y, q2.x, q2.y] };

      cmds.splice(commandIndex, 1, qa, qb);
      return cmds;
    }

    default:
      return cmds;
  }
}

/**
 * Delete a point (command) from the outline.
 * Ensures the first command is M and the last is Z.
 * Throws if removing would leave fewer than 3 anchor points.
 */
export function deletePoint(
  outline: PathCommand[],
  commandIndex: number,
): PathCommand[] {
  const cmds = outline.map(c => ({ ...c, values: [...c.values] }));

  // Count current anchor points (non-Z commands)
  const anchorCount = cmds.filter(c => c.type !== 'Z').length;

  if (anchorCount <= 3) {
    throw new Error('Cannot delete point: piece must have at least 3 anchor points');
  }

  // Remove the command
  cmds.splice(commandIndex, 1);

  // Ensure first command is M
  if (cmds.length > 0 && cmds[0].type !== 'M') {
    // Promote the first non-Z command to M
    const firstAnchor = getAnchor(cmds[0]);
    if (firstAnchor) {
      cmds[0] = { type: 'M', values: [firstAnchor.x, firstAnchor.y] };
    }
  }

  // Ensure Z at the end
  if (cmds.length === 0 || cmds[cmds.length - 1].type !== 'Z') {
    cmds.push({ type: 'Z', values: [] });
  }

  return cmds;
}

/**
 * Convert an L command to a C command with control points at 1/3 and 2/3
 * along the straight segment. If the command is already C, returns unchanged.
 */
export function convertToCurve(
  outline: PathCommand[],
  commandIndex: number,
): PathCommand[] {
  const cmds = outline.map(c => ({ ...c, values: [...c.values] }));
  const cmd = cmds[commandIndex];

  if (!cmd || cmd.type !== 'L') return cmds;

  // Find previous anchor
  let prevAnchor: Point2D | null = null;
  for (let i = commandIndex - 1; i >= 0; i--) {
    prevAnchor = getAnchor(cmds[i]);
    if (prevAnchor) break;
  }
  if (!prevAnchor) return cmds;

  const anchor = getAnchor(cmd)!;

  // Control points at 1/3 and 2/3
  const cp1x = prevAnchor.x + (anchor.x - prevAnchor.x) / 3;
  const cp1y = prevAnchor.y + (anchor.y - prevAnchor.y) / 3;
  const cp2x = prevAnchor.x + (2 * (anchor.x - prevAnchor.x)) / 3;
  const cp2y = prevAnchor.y + (2 * (anchor.y - prevAnchor.y)) / 3;

  cmds[commandIndex] = {
    type: 'C',
    values: [cp1x, cp1y, cp2x, cp2y, anchor.x, anchor.y],
  };

  return cmds;
}

/**
 * Convert a C or Q command to an L command, keeping only the anchor point.
 * If the command is already L, returns unchanged.
 */
export function convertToLine(
  outline: PathCommand[],
  commandIndex: number,
): PathCommand[] {
  const cmds = outline.map(c => ({ ...c, values: [...c.values] }));
  const cmd = cmds[commandIndex];

  if (!cmd) return cmds;

  if (cmd.type === 'C' || cmd.type === 'Q') {
    const anchor = getAnchor(cmd)!;
    cmds[commandIndex] = { type: 'L', values: [anchor.x, anchor.y] };
  }

  return cmds;
}

// ─── Internal Geometry Helper ───

function lerp2D(a: Point2D, b: Point2D, t: number): Point2D {
  return {
    x: a.x + t * (b.x - a.x),
    y: a.y + t * (b.y - a.y),
  };
}
