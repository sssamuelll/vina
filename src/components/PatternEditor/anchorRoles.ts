import type { PathCommand, PatternPiece, Point2D } from '../../types/types';
import { detectCorners } from '../../utils/notchAnchor';
import { coincidentAnchorGroups, type EditableNode } from './nodeEditorUtils';

export const ANCHOR_MATCH_EPS_MM = 0.05;

export type AnchorRole =
  | 'openEndpoint'
  | 'corner'
  | 'bezierAnchor'
  | 'lineEnd'
  | 'smoothSample';

export interface ClassifiedAnchor {
  node: EditableNode;
  role: AnchorRole;
}

function isBezierCommand(command: PathCommand | undefined): boolean {
  return command?.type === 'C' || command?.type === 'Q';
}

function hasStraightIncidentEdges(
  outline: PathCommand[],
  commandIndex: number,
): boolean {
  return outline[commandIndex]?.type === 'L' &&
    (outline[commandIndex + 1]?.type === 'L' ||
      outline[commandIndex + 1]?.type === 'Z');
}

function distance(a: Point2D, b: Point2D): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

/**
 * View-only role per editable anchor. Nothing here is persisted.
 *
 * Two signals, both already in the outline. The angular break (detectCorners,
 * 30°) says whether the direction of travel snaps. The coincident group says
 * whether the vertex was *declared*: CLO writes the vertex twice wherever one
 * drawn line ends and the next begins, and never on a curve sample. That is
 * the difference María asked about in note #167.
 *
 * ponytail: lineEnd depends on CLO's doubled vertex. A piece drawn inside
 * Vina has no twins and gets no lineEnd — it still gets corners by angle.
 * If the importer ever dedupes coincident anchors, lineEnd goes to zero; the
 * counts pinned in anchorRoles.maria.test.ts go red that day, which is the
 * moment to read DXF layers 2/3 instead.
 */
export function classifyEditableAnchors(
  piece: PatternPiece,
  nodes: EditableNode[],
): ClassifiedAnchor[] {
  const closed = piece.outline.some((command) => command.type === 'Z');

  const groupOf = new Map<number, number[]>();
  for (const members of coincidentAnchorGroups(piece.outline).values()) {
    for (const index of members) groupOf.set(index, members);
  }

  // An open endpoint's role wins for its whole coincident group (spec §7),
  // not just the literal first/last command: CLO doubles the vertex at an
  // open path's endpoint too, and the twin has no angular break of its own
  // to fall back on (detectCorners reads the reversal as a break), so
  // without this it stacked a corner glyph on the endpoint diamond.
  const endpoints = new Set<number>();
  if (!closed && nodes.length > 0) {
    for (const index of [nodes[0].ref.commandIndex, nodes[nodes.length - 1].ref.commandIndex]) {
      for (const member of groupOf.get(index) ?? [index]) endpoints.add(member);
    }
  }

  // A detected corner colours every member of its group. Claiming one node per
  // corner is what stacked a 6px curve dot on top of every 10px corner square.
  const detected = detectCorners(piece.outline);
  const corners = new Set<number>();
  for (const node of nodes) {
    const hit = detected.some(
      (corner) => distance(corner, node.position) <= ANCHOR_MATCH_EPS_MM,
    );
    if (!hit) continue;
    for (const index of groupOf.get(node.ref.commandIndex) ?? [node.ref.commandIndex]) {
      corners.add(index);
    }
  }

  // authoredAnchor records the user's insertion, independently of the
  // current angle. It only has corner semantics while the two incident edges
  // remain straight. Apply every group signal to the whole coincident group so
  // the renderer never stacks different glyphs at one coordinate.
  const authoredCorners = new Set<number>();
  const bezierAnchors = new Set<number>();
  for (const members of coincidentAnchorGroups(piece.outline).values()) {
    const touchesBezier = members.some((index) =>
      isBezierCommand(piece.outline[index]) ||
      isBezierCommand(piece.outline[index + 1]));
    if (touchesBezier) {
      for (const index of members) bezierAnchors.add(index);
      continue;
    }

    const hasAuthoredStraightAnchor = members.some((index) =>
      piece.outline[index]?.authoredAnchor === true &&
      hasStraightIncidentEdges(piece.outline, index));
    if (hasAuthoredStraightAnchor) {
      for (const index of members) authoredCorners.add(index);
    }
  }

  return nodes.map((node) => {
    const index = node.ref.commandIndex;
    let role: AnchorRole = 'smoothSample';
    if (endpoints.has(index)) {
      role = 'openEndpoint';
    } else if (corners.has(index)) {
      role = 'corner';
    } else if (bezierAnchors.has(index)) {
      role = 'bezierAnchor';
    } else if (authoredCorners.has(index)) {
      role = 'corner';
    } else if ((groupOf.get(index)?.length ?? 1) >= 2) {
      role = 'lineEnd';
    }
    return { node, role };
  });
}
