import type { PathCommand, PatternPiece, Point2D } from '../../types/types';
import { detectCorners } from '../../utils/notchAnchor';
import type { EditableNode } from './nodeEditorUtils';

export const ANCHOR_MATCH_EPS_MM = 0.05;

export type AnchorRole =
  | 'openEndpoint'
  | 'corner'
  | 'bezierAnchor'
  | 'smoothSample';

export interface ClassifiedAnchor {
  node: EditableNode;
  role: AnchorRole;
}

function isBezierCommand(command: PathCommand | undefined): boolean {
  return command?.type === 'C' || command?.type === 'Q';
}

function distance(a: Point2D, b: Point2D): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function matchCornerCommandIndices(
  corners: Point2D[],
  nodes: EditableNode[],
): Set<number> {
  const available = new Set(nodes.map((node) => node.ref.commandIndex));
  const matched = new Set<number>();

  for (const corner of corners) {
    let best: EditableNode | undefined;
    let bestDistance = Infinity;
    for (const node of nodes) {
      if (!available.has(node.ref.commandIndex)) continue;
      const candidateDistance = distance(corner, node.position);
      if (
        candidateDistance <= ANCHOR_MATCH_EPS_MM &&
        (candidateDistance < bestDistance ||
          (candidateDistance === bestDistance &&
            node.ref.commandIndex < (best?.ref.commandIndex ?? Infinity)))
      ) {
        best = node;
        bestDistance = candidateDistance;
      }
    }
    if (best) {
      matched.add(best.ref.commandIndex);
      available.delete(best.ref.commandIndex);
    }
  }
  return matched;
}

export function classifyEditableAnchors(
  piece: PatternPiece,
  nodes: EditableNode[],
): ClassifiedAnchor[] {
  const closed = piece.outline.some((command) => command.type === 'Z');
  const endpoints = new Set<number>();
  if (!closed && nodes.length > 0) {
    endpoints.add(nodes[0].ref.commandIndex);
    endpoints.add(nodes[nodes.length - 1].ref.commandIndex);
  }

  const corners = matchCornerCommandIndices(detectCorners(piece.outline), nodes);

  return nodes.map((node) => {
    const index = node.ref.commandIndex;
    let role: AnchorRole = 'smoothSample';
    if (endpoints.has(index)) {
      role = 'openEndpoint';
    } else if (corners.has(index)) {
      role = 'corner';
    } else if (
      isBezierCommand(piece.outline[index]) ||
      isBezierCommand(piece.outline[index + 1])
    ) {
      role = 'bezierAnchor';
    }
    return { node, role };
  });
}
