import type { PathCommand, Point2D } from '../../types/types';

// ─── Types ───

/** An anchor point extracted from an outline, with its command index. */
interface Anchor {
  /** The world-space position (outline coordinates + piece position). */
  point: Point2D;
  /** Index of the command in the outline that ends at this anchor. */
  cmdIndex: number;
}

/** Identifies a shared edge between two outlines. */
export interface SharedEdge {
  /** Edge in outline A: the command index that DRAWS the shared edge. */
  edgeA: { startCmd: number; endCmd: number };
  /** Edge in outline B: the command index that DRAWS the shared edge. */
  edgeB: { startCmd: number; endCmd: number };
}

// ─── Helpers ───

function dist(a: Point2D, b: Point2D): number {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return Math.sqrt(dx * dx + dy * dy);
}

/**
 * Extract anchor points from an outline, offset by piece position.
 *
 * Each anchor corresponds to a command endpoint:
 * - M: [x,y]
 * - L: [x,y]
 * - C: [values[4], values[5]]
 * - Q: [values[2], values[3]]
 * - Z: closes back to M start (implicit, not added as separate anchor)
 *
 * Returns anchors in path order. The first anchor is the M point.
 */
function getAnchors(outline: PathCommand[], position: Point2D): Anchor[] {
  const anchors: Anchor[] = [];

  for (let i = 0; i < outline.length; i++) {
    const cmd = outline[i];
    let px: number | undefined;
    let py: number | undefined;

    switch (cmd.type) {
      case 'M':
      case 'L':
        px = cmd.values[0];
        py = cmd.values[1];
        break;
      case 'H':
        // Horizontal line — x changes, y stays the same
        // We need previous y, but for simplicity in anchor extraction,
        // we track current position
        px = cmd.values[0];
        py = anchors.length > 0 ? anchors[anchors.length - 1].point.y - position.y : 0;
        break;
      case 'V':
        px = anchors.length > 0 ? anchors[anchors.length - 1].point.x - position.x : 0;
        py = cmd.values[0];
        break;
      case 'C':
        px = cmd.values[4];
        py = cmd.values[5];
        break;
      case 'Q':
        px = cmd.values[2];
        py = cmd.values[3];
        break;
      case 'Z':
        // Z closes back to the M point — don't add a separate anchor,
        // but the closing segment exists as an implicit edge.
        continue;
      default:
        if (cmd.values.length >= 2) {
          px = cmd.values[cmd.values.length - 2];
          py = cmd.values[cmd.values.length - 1];
        }
        break;
    }

    if (px !== undefined && py !== undefined) {
      anchors.push({
        point: { x: px + position.x, y: py + position.y },
        cmdIndex: i,
      });
    }
  }

  return anchors;
}

/**
 * Get the "edge" command pairs: consecutive anchor pairs that form edges.
 *
 * For an outline M A B C Z, the edges are:
 *   edge 0: M→A  (drawn by command at A's cmdIndex)
 *   edge 1: A→B  (drawn by command at B's cmdIndex)
 *   edge 2: B→C  (drawn by command at C's cmdIndex)
 *   edge 3: C→M  (drawn by Z, closing segment)
 *
 * Each edge is defined by (startAnchor, endAnchor, drawingCommandIndex).
 */
interface Edge {
  start: Point2D;
  end: Point2D;
  /** The command index that draws this edge. */
  drawCmd: number;
}

function getEdges(
  outline: PathCommand[],
  anchors: Anchor[],
): Edge[] {
  const edges: Edge[] = [];

  // Edges between consecutive anchors (cmd 1 draws from anchor 0 to anchor 1, etc.)
  for (let i = 0; i < anchors.length - 1; i++) {
    edges.push({
      start: anchors[i].point,
      end: anchors[i + 1].point,
      drawCmd: anchors[i + 1].cmdIndex,
    });
  }

  // Closing edge (Z): from last anchor back to first anchor (M)
  const zIndex = outline.findIndex(c => c.type === 'Z');
  if (zIndex >= 0 && anchors.length >= 2) {
    const lastAnchor = anchors[anchors.length - 1];
    const firstAnchor = anchors[0];
    // Only add closing edge if it has non-zero length
    if (dist(lastAnchor.point, firstAnchor.point) > 0.001) {
      edges.push({
        start: lastAnchor.point,
        end: firstAnchor.point,
        drawCmd: zIndex,
      });
    }
  }

  return edges;
}

// ─── Public: findSharedEdge ───

/**
 * Find a shared edge between two outlines.
 *
 * Adjacent pattern pieces typically share edges in REVERSE direction (opposite
 * winding). For example, outline A's edge from (10,5) to (0,5) matches outline
 * B's edge from (0,5) to (10,5).
 *
 * @param outlineA - First outline path commands
 * @param posA - World position of first piece
 * @param outlineB - Second outline path commands
 * @param posB - World position of second piece
 * @param tolerance - Maximum distance for point matching
 * @returns SharedEdge info, or null if no shared edge found
 */
export function findSharedEdge(
  outlineA: PathCommand[],
  posA: Point2D,
  outlineB: PathCommand[],
  posB: Point2D,
  tolerance: number,
): SharedEdge | null {
  const anchorsA = getAnchors(outlineA, posA);
  const anchorsB = getAnchors(outlineB, posB);
  const edgesA = getEdges(outlineA, anchorsA);
  const edgesB = getEdges(outlineB, anchorsB);

  // Try reverse-direction matching first (normal case: opposite winding)
  for (let i = 0; i < edgesA.length; i++) {
    for (let j = 0; j < edgesB.length; j++) {
      // Reverse: A's start matches B's end, A's end matches B's start
      if (
        dist(edgesA[i].start, edgesB[j].end) <= tolerance &&
        dist(edgesA[i].end, edgesB[j].start) <= tolerance
      ) {
        return {
          edgeA: { startCmd: getStartCmdForEdge(i, anchorsA), endCmd: edgesA[i].drawCmd },
          edgeB: { startCmd: getStartCmdForEdge(j, anchorsB), endCmd: edgesB[j].drawCmd },
        };
      }
    }
  }

  // Fallback: same-direction matching
  for (let i = 0; i < edgesA.length; i++) {
    for (let j = 0; j < edgesB.length; j++) {
      if (
        dist(edgesA[i].start, edgesB[j].start) <= tolerance &&
        dist(edgesA[i].end, edgesB[j].end) <= tolerance
      ) {
        return {
          edgeA: { startCmd: getStartCmdForEdge(i, anchorsA), endCmd: edgesA[i].drawCmd },
          edgeB: { startCmd: getStartCmdForEdge(j, anchorsB), endCmd: edgesB[j].drawCmd },
        };
      }
    }
  }

  return null;
}

/**
 * Get the command index of the start anchor for edge at edgeIndex.
 */
function getStartCmdForEdge(
  edgeIndex: number,
  anchors: Anchor[],
): number {
  if (edgeIndex < anchors.length - 1) {
    return anchors[edgeIndex].cmdIndex;
  }
  // Closing edge: start is the last anchor
  return anchors[anchors.length - 1].cmdIndex;
}

// ─── Public: mergeOutlines ───

/**
 * Offset all coordinates in a PathCommand by a position vector.
 */
function offsetCommand(cmd: PathCommand, pos: Point2D): PathCommand {
  switch (cmd.type) {
    case 'M':
    case 'L':
      return { type: cmd.type, values: [cmd.values[0] + pos.x, cmd.values[1] + pos.y] };
    case 'H':
      return { type: 'H', values: [cmd.values[0] + pos.x] };
    case 'V':
      return { type: 'V', values: [cmd.values[0] + pos.y] };
    case 'C':
      return {
        type: 'C',
        values: [
          cmd.values[0] + pos.x, cmd.values[1] + pos.y,
          cmd.values[2] + pos.x, cmd.values[3] + pos.y,
          cmd.values[4] + pos.x, cmd.values[5] + pos.y,
        ],
      };
    case 'Q':
      return {
        type: 'Q',
        values: [
          cmd.values[0] + pos.x, cmd.values[1] + pos.y,
          cmd.values[2] + pos.x, cmd.values[3] + pos.y,
        ],
      };
    case 'Z':
      return { type: 'Z', values: [] };
    default:
      // For unknown types, offset all value pairs
      if (cmd.values.length >= 2) {
        const newValues = [...cmd.values];
        for (let i = 0; i < newValues.length - 1; i += 2) {
          newValues[i] += pos.x;
          newValues[i + 1] += pos.y;
        }
        return { type: cmd.type, values: newValues };
      }
      return { ...cmd, values: [...cmd.values] };
  }
}

/**
 * Get the edge commands of an outline (everything between M and Z),
 * including an explicit closing segment if the Z implicitly closes a gap.
 *
 * Returns the commands that draw edges (not M, not Z) in order.
 * Also returns the M point and the indices mapping.
 */
interface OutlineEdges {
  mPoint: Point2D;
  /** Edge-drawing commands (L, C, Q, etc.) in outline order, offset by position. */
  edgeCmds: PathCommand[];
  /** Original command indices corresponding to each edgeCmd. */
  originalIndices: number[];
}

function getOutlineEdges(
  outline: PathCommand[],
  pos: Point2D,
): OutlineEdges {
  const mCmd = outline[0];
  const mPoint: Point2D = {
    x: mCmd.values[0] + pos.x,
    y: mCmd.values[1] + pos.y,
  };

  const edgeCmds: PathCommand[] = [];
  const originalIndices: number[] = [];

  let zIndex = outline.length - 1;
  for (let i = 1; i < outline.length; i++) {
    if (outline[i].type === 'Z') {
      zIndex = i;
      break;
    }
    edgeCmds.push(offsetCommand(outline[i], pos));
    originalIndices.push(i);
  }

  // Check if Z has an implicit closing segment
  if (edgeCmds.length > 0) {
    const lastCmd = edgeCmds[edgeCmds.length - 1];
    const lastPt = getEndpoint(lastCmd);
    if (dist(lastPt, mPoint) > 0.001) {
      edgeCmds.push({ type: 'L', values: [mPoint.x, mPoint.y] });
      originalIndices.push(zIndex);
    }
  }

  return { mPoint, edgeCmds, originalIndices };
}

/** Get the endpoint of an already-offset command. */
function getEndpoint(cmd: PathCommand): Point2D {
  switch (cmd.type) {
    case 'M':
    case 'L':
      return { x: cmd.values[0], y: cmd.values[1] };
    case 'C':
      return { x: cmd.values[4], y: cmd.values[5] };
    case 'Q':
      return { x: cmd.values[2], y: cmd.values[3] };
    default:
      if (cmd.values.length >= 2) {
        return { x: cmd.values[cmd.values.length - 2], y: cmd.values[cmd.values.length - 1] };
      }
      return { x: 0, y: 0 };
  }
}

/**
 * Merge two adjacent outlines by removing the shared edge from both
 * and connecting the remaining edges into a single closed path.
 *
 * The algorithm:
 * 1. Extract edge commands from both outlines (offset by position).
 * 2. Identify which edge command in each outline corresponds to the shared edge.
 * 3. Walk outline A, skipping the shared edge command.
 * 4. At the point where the shared edge was skipped, splice in outline B's
 *    non-shared edge commands.
 * 5. Produce M ... Z.
 *
 * @param outlineA - First outline path commands
 * @param posA - World position of first piece
 * @param outlineB - Second outline path commands
 * @param posB - World position of second piece
 * @param shared - Shared edge info from findSharedEdge
 * @returns Merged outline as PathCommand[]
 */
export function mergeOutlines(
  outlineA: PathCommand[],
  posA: Point2D,
  outlineB: PathCommand[],
  posB: Point2D,
  shared: SharedEdge,
): PathCommand[] {
  const edgesA = getOutlineEdges(outlineA, posA);
  const edgesB = getOutlineEdges(outlineB, posB);

  // Find which edge-command index in each outline's edgeCmds array
  // corresponds to the shared edge's drawing command.
  const sharedEdgeIdxA = findEdgeCmdIndex(edgesA, shared.edgeA.endCmd);
  const sharedEdgeIdxB = findEdgeCmdIndex(edgesB, shared.edgeB.endCmd);

  // Walk outline A, collecting non-shared edges in order.
  // Start from the edge AFTER the shared edge, so the merged path
  // begins at the endpoint of the shared edge in A (which is the start
  // of the next edge in A).
  const result: PathCommand[] = [];

  const nA = edgesA.edgeCmds.length;
  const nB = edgesB.edgeCmds.length;

  // Determine the starting point for the merged outline.
  // We start walking A from the edge command after the shared edge.
  // The start of that edge is where the shared edge ended.
  const startEdgeIdxA = (sharedEdgeIdxA + 1) % nA;

  // The starting point is the endpoint of the shared edge in A
  // (or equivalently, the start of the edge after the shared edge).
  let startPoint: Point2D;
  if (sharedEdgeIdxA >= 0) {
    startPoint = getEndpoint(edgesA.edgeCmds[sharedEdgeIdxA]);
  } else {
    startPoint = edgesA.mPoint;
  }

  result.push({ type: 'M', values: [startPoint.x, startPoint.y] });

  // Walk A's edges, starting after the shared edge, collecting all non-shared edges.
  // We walk (nA - 1) edges (all except the shared one).
  let idxA = startEdgeIdxA;
  for (let count = 0; count < nA - 1; count++) {
    result.push(edgesA.edgeCmds[idxA]);
    idxA = (idxA + 1) % nA;
  }
  // After this walk, we've arrived at the start of the shared edge in A.
  // This is also where B's shared edge starts (or ends, depending on direction).

  // Now splice in B's non-shared edges.
  // B's shared edge is at sharedEdgeIdxB. We need to walk B starting from
  // the edge after B's shared edge, collecting all of B's non-shared edges.
  const startEdgeIdxB = (sharedEdgeIdxB + 1) % nB;
  let idxB = startEdgeIdxB;
  for (let count = 0; count < nB - 1; count++) {
    result.push(edgesB.edgeCmds[idxB]);
    idxB = (idxB + 1) % nB;
  }
  // After walking B, we should be back at the start of the shared edge in B,
  // which connects back to where A started (the M point of our merged outline).

  result.push({ type: 'Z', values: [] });

  return result;
}

/**
 * Find the index in edgeCmds that corresponds to a given original command index.
 */
function findEdgeCmdIndex(edges: OutlineEdges, originalCmdIndex: number): number {
  const idx = edges.originalIndices.indexOf(originalCmdIndex);
  if (idx >= 0) return idx;

  // If the shared edge is the Z closing segment and we replaced it with
  // an explicit L, it will be the last edgeCmd.
  return edges.edgeCmds.length - 1;
}
