/**
 * nodeEditorUtils.ts — Pure utility functions for node editing operations.
 *
 * Extracted from useNodeEditor.ts so that useEditPattern, useEditCurve,
 * and other hooks can share the same logic without React or Redux deps.
 */

import { Point2D, PathCommand, PatternPiece } from '../../types/types';
import { distToSegmentWithT } from '../../utils/geometry/distance';
import { evalCubic, evalQuadratic, distToBezier, lerp2D } from '../../utils/geometry/bezier';

// Re-export for backward compatibility — other files may import from here
export { distToSegmentWithT } from '../../utils/geometry/distance';

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
  /** Drag target for cp1 — the command slot applyNodeMove writes (C: 'cp2', Q: 'cp1') */
  cp1Ref?: NodeRef;
  /** Control point 2 (outgoing handle after anchor) = v[0],v[1] of the NEXT C command */
  cp2?: Point2D;
  /** Drag target for cp2 → { commandIndex: i+1, pointType: 'cp1' } */
  cp2Ref?: NodeRef;
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

/** Devuelve el ancla del M que posee el cierre indicado. */
export function getClosingAnchor(outline: PathCommand[], zIndex: number): Point2D | null {
  for (let i = zIndex; i >= 0; i--) {
    if (outline[i]?.type === 'M') return getAnchor(outline[i]);
  }
  return null;
}

/** Grouping key for an anchor: exact coordinate quantised to the nanometre. */
function anchorKey(point: Point2D): string {
  return `${Math.round(point.x * 1e6)}|${Math.round(point.y * 1e6)}`;
}

/**
 * Command indices grouped by exact anchor coordinate. Z contributes nothing.
 *
 * CLO doubles the vertex at every turn point, so a corner arrives as two (or
 * three) commands at the identical coordinate. Treating that group as one
 * point is what keeps a drag from tearing the outline into a spike.
 *
 * ponytail: exact equality, never epsilon — epsilon grouping is non-transitive
 * (A~B, B~C, A!~C) and would make the result depend on iteration order, which
 * is the opposite of a deterministic attribute. Two anchors 0.001mm apart do
 * not group; moving one leaves the other 0.001mm away, geometrically inert.
 */
export function coincidentAnchorGroups(outline: PathCommand[]): Map<string, number[]> {
  const groups = new Map<string, number[]>();
  for (let i = 0; i < outline.length; i++) {
    const anchor = getAnchor(outline[i]);
    if (!anchor) continue;
    const key = anchorKey(anchor);
    const bucket = groups.get(key);
    if (bucket) bucket.push(i);
    else groups.set(key, [i]);
  }
  return groups;
}

/** Command indices sharing an anchor with `commandIndex`, including itself. */
export function anchorGroupOf(outline: PathCommand[], commandIndex: number): number[] {
  const anchor = getAnchor(outline[commandIndex]);
  if (!anchor) return [];
  return coincidentAnchorGroups(outline).get(anchorKey(anchor)) ?? [];
}

// ─── Public Functions ───

/** Extract editable nodes from a piece's outline */
export function extractNodes(piece: PatternPiece): EditableNode[] {
  const nodes: EditableNode[] = [];
  const cmds = piece.outline;

  for (let i = 0; i < cmds.length; i++) {
    const cmd = cmds[i];
    const v = cmd.values;
    let node: EditableNode | null = null;

    switch (cmd.type) {
      case 'M':
      case 'L':
        node = {
          ref: { pieceId: piece.id, commandIndex: i, pointType: 'anchor' },
          position: { x: v[0], y: v[1] },
        };
        break;
      case 'C': {
        // Cubic bezier: cp1(v[0],v[1]), cp2(v[2],v[3]), anchor(v[4],v[5])
        node = {
          ref: { pieceId: piece.id, commandIndex: i, pointType: 'anchor' },
          position: { x: v[4], y: v[5] },
          cp1: { x: v[2], y: v[3] }, // incoming handle of this anchor
          cp1Ref: { pieceId: piece.id, commandIndex: i, pointType: 'cp2' },
        };
        break;
      }
      case 'Q': {
        // Quadratic bezier: cp1(v[0],v[1]), anchor(v[2],v[3]). Its only
        // handle writes the 'cp1' slot — the hardcoded 'cp2' mapping made a
        // Q handle drag a silent no-op (maria-203).
        node = {
          ref: { pieceId: piece.id, commandIndex: i, pointType: 'anchor' },
          position: { x: v[2], y: v[3] },
          cp1: { x: v[0], y: v[1] },
          cp1Ref: { pieceId: piece.id, commandIndex: i, pointType: 'cp1' },
        };
        break;
      }
      // Z doesn't add a node
    }

    if (node) {
      // maria-203: the outgoing handle of this anchor lives in the NEXT C
      // command (its v[0],v[1]). Without it only half the bezier is editable.
      const next = cmds[i + 1];
      if (next?.type === 'C') {
        node.cp2 = { x: next.values[0], y: next.values[1] };
        node.cp2Ref = { pieceId: piece.id, commandIndex: i + 1, pointType: 'cp1' };
      }
      nodes.push(node);
    }
  }

  return nodes;
}

/**
 * Apply a node position change back to the PathCommand array (immutable).
 *
 * An anchor move applies to the whole coincident group: CLO doubles the vertex
 * at every turn point, and writing to only one member leaves the twin behind,
 * which tears the outline into a spike and leaves a glyph stranded at the old
 * coordinate. Control-point moves are never grouped — handles are not anchors.
 *
 * ponytail: for a group whose members are C/Q the per-command handle coupling
 * runs once per member. No known file has coincident Bézier anchors; if one
 * appears, that is the case to test.
 */
export function applyNodeMove(
  outline: PathCommand[],
  commandIndex: number,
  pointType: 'anchor' | 'cp1' | 'cp2',
  newPos: Point2D,
): PathCommand[] {
  const cmds = outline.map(c => ({ ...c, values: [...c.values] }));
  if (!cmds[commandIndex]) return cmds;

  const targets = pointType === 'anchor'
    ? anchorGroupOf(outline, commandIndex)
    : [commandIndex];

  for (const index of targets) moveOneCommand(cmds, index, pointType, newPos);

  return cmds;
}

/**
 * Mueve cada ancla a su destino, una por una, SIN reagrupar por coincidencia.
 *
 * Para arrastres que decidieron su grupo al empezar el gesto. `applyNodeMove`
 * reagrupa sobre el contorno que recibe; llamado frame a frame sobre el
 * contorno ya movido, capturaba cualquier ancla por la que el arrastre pasara
 * exactamente encima y se la llevaba (con Shift, que fija un eje, eso deja de
 * ser raro).
 */
export function applyAnchorMoves(
  outline: PathCommand[],
  moves: ReadonlyMap<number, Point2D>,
): PathCommand[] {
  const cmds = outline.map(c => ({ ...c, values: [...c.values] }));
  for (const [index, newPos] of moves) moveOneCommand(cmds, index, 'anchor', newPos);
  return cmds;
}

/** Write a single command in place. Extracted so a group can reuse it. */
function moveOneCommand(
  cmds: PathCommand[],
  commandIndex: number,
  pointType: 'anchor' | 'cp1' | 'cp2',
  newPos: Point2D,
): void {
  const cmd = cmds[commandIndex];
  if (!cmd) return;
  let anchorDelta: Point2D | null = null;

  switch (cmd.type) {
    case 'M':
    case 'L':
      if (pointType === 'anchor') {
        anchorDelta = {
          x: newPos.x - cmd.values[0],
          y: newPos.y - cmd.values[1],
        };
        cmd.values[0] = newPos.x;
        cmd.values[1] = newPos.y;
      }
      break;
    case 'C':
      if (pointType === 'anchor') {
        // Move anchor (v[4], v[5]) and drag control points with it
        const dx = newPos.x - cmd.values[4];
        const dy = newPos.y - cmd.values[5];
        anchorDelta = { x: dx, y: dy };
        cmd.values[4] = newPos.x;
        cmd.values[5] = newPos.y;
        // Move cp2 (incoming handle) with anchor
        cmd.values[2] += dx;
        cmd.values[3] += dy;
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
        anchorDelta = { x: qdx, y: qdy };
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

  const next = cmds[commandIndex + 1];
  if (anchorDelta && next?.type === 'C') {
    // El cp1 es el manejador saliente del ancla anterior.
    next.values[0] += anchorDelta.x;
    next.values[1] += anchorDelta.y;
  }
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
 * For C/Q bezier segments, distance is computed by sampling the curve as a
 * polyline (cubic at 20 points, quadratic at 10) to ensure clicks on the
 * visible arc register accurately.
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
    const cmd = outline[curr.index];

    let hit: { distance: number; t: number; point: Point2D };

    if (cmd.type === 'C') {
      const v = cmd.values;
      const p0 = prev.pos;
      const p1 = { x: v[0], y: v[1] };
      const p2 = { x: v[2], y: v[3] };
      const p3 = { x: v[4], y: v[5] };
      hit = distToBezier(point.x, point.y, (t) => evalCubic(p0, p1, p2, p3, t), 20);
    } else if (cmd.type === 'Q') {
      const v = cmd.values;
      const q0 = prev.pos;
      const q1 = { x: v[0], y: v[1] };
      const q2 = { x: v[2], y: v[3] };
      hit = distToBezier(point.x, point.y, (t) => evalQuadratic(q0, q1, q2, t), 10);
    } else {
      hit = distToSegmentWithT(
        point.x, point.y,
        prev.pos.x, prev.pos.y,
        curr.pos.x, curr.pos.y,
      );
    }

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

      const newL: PathCommand = {
        type: 'L',
        values: [midX, midY],
        authoredAnchor: true,
      };
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
        ...(cmd.manualBezier ? { manualBezier: true } : {}),
        type: 'C',
        values: [a.x, a.y, d.x, d.y, f.x, f.y],
      };

      // Second half: from f through e, c to p3
      const c2: PathCommand = {
        ...cmd,
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

      const qa: PathCommand = {
        ...(cmd.manualBezier ? { manualBezier: true } : {}),
        type: 'Q', values: [a.x, a.y, m.x, m.y],
      };
      const qb: PathCommand = {
        ...cmd,
        type: 'Q',
        values: [b.x, b.y, q2.x, q2.y],
      };

      cmds.splice(commandIndex, 1, qa, qb);
      return cmds;
    }

    case 'Z': {
      // Closing segment (last anchor → first anchor). Insert an L before the
      // Z so the closing edge of a closed piece is splittable like any other
      // — nearestSegment maps clicks on this edge to the Z command's index.
      const firstAnchor = getAnchor(cmds[0]);
      if (!firstAnchor) return cmds;
      const midX = prevAnchor.x + t * (firstAnchor.x - prevAnchor.x);
      const midY = prevAnchor.y + t * (firstAnchor.y - prevAnchor.y);
      cmds.splice(commandIndex, 0, {
        type: 'L',
        values: [midX, midY],
        authoredAnchor: true,
      });
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

  // Elimina el comando antes de contar el contorno resultante.
  cmds.splice(commandIndex, 1);

  // Las anclas coincidentes son un solo punto geométrico.
  const remainingAnchorCount = coincidentAnchorGroups(cmds).size;

  if (remainingAnchorCount < 3) {
    throw new Error('Cannot delete point: piece must have at least 3 anchor points');
  }

  // Ensure first command is M
  if (cmds.length > 0 && cmds[0].type !== 'M') {
    // Promote the first non-Z command to M. Its anchor doesn't move —
    // conserva authoredAnchor; manualBezier no aplica, un M no es una curva.
    const firstAnchor = getAnchor(cmds[0]);
    if (firstAnchor) {
      cmds[0] = {
        ...(cmds[0].authoredAnchor ? { authoredAnchor: true as const } : {}),
        type: 'M',
        values: [firstAnchor.x, firstAnchor.y],
      };
    }
  }

  // Ensure Z at the end
  if (cmds.length === 0 || cmds[cmds.length - 1].type !== 'Z') {
    cmds.push({ type: 'Z', values: [] });
  }

  return cmds;
}

/** Convierte un L en C; si recibe un Z, inserta la curva antes del cierre. */
export function convertToCurve(
  outline: PathCommand[],
  commandIndex: number,
): PathCommand[] {
  const cmds = outline.map(c => ({ ...c, values: [...c.values] }));
  const cmd = cmds[commandIndex];

  if (!cmd || (cmd.type !== 'L' && cmd.type !== 'Z')) return cmds;

  // Find previous anchor
  let prevAnchor: Point2D | null = null;
  for (let i = commandIndex - 1; i >= 0; i--) {
    prevAnchor = getAnchor(cmds[i]);
    if (prevAnchor) break;
  }
  if (!prevAnchor) return cmds;

  const anchor = cmd.type === 'Z' ? getClosingAnchor(cmds, commandIndex) : getAnchor(cmd);
  if (!anchor) return cmds;

  // Control points at 1/3 and 2/3
  const cp1x = prevAnchor.x + (anchor.x - prevAnchor.x) / 3;
  const cp1y = prevAnchor.y + (anchor.y - prevAnchor.y) / 3;
  const cp2x = prevAnchor.x + (2 * (anchor.x - prevAnchor.x)) / 3;
  const cp2y = prevAnchor.y + (2 * (anchor.y - prevAnchor.y)) / 3;

  const curve: PathCommand = {
    // El ancla es la misma coordenada (no se mueve): conserva authoredAnchor
    // del comando L que sustituye. Solo aplica cuando de verdad lo sustituye
    // en sitio — no cuando se materializa antes del Z (geometría insertada).
    ...(cmd.type === 'L' && cmd.authoredAnchor ? { authoredAnchor: true as const } : {}),
    type: 'C',
    // La conversión Bézier explícita conserva sus asas aunque la curva sea recta.
    manualBezier: true,
    values: [cp1x, cp1y, cp2x, cp2y, anchor.x, anchor.y],
  };

  if (cmd.type === 'Z') {
    // El cierre se materializa antes del Z; el Z sigue cerrando el contorno.
    cmds.splice(commandIndex, 0, curve);
  } else {
    cmds[commandIndex] = curve;
  }

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
    // El ancla no se mueve: conserva authoredAnchor. manualBezier no viaja
    // — el comando resultante ya no es una curva.
    cmds[commandIndex] = {
      ...(cmd.authoredAnchor ? { authoredAnchor: true as const } : {}),
      type: 'L',
      values: [anchor.x, anchor.y],
    };
  }

  return cmds;
}

