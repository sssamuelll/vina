import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { importDXFContent } from '../../../utils/dxf';
import { extractNodes, coincidentAnchorGroups } from '../nodeEditorUtils';
import { classifyEditableAnchors } from '../anchorRoles';

const FIXTURE = resolve(
  __dirname,
  '../../../../tests/fixtures/garments/maria_patrones_samuel_2M.dxf',
);

function mariaPieces() {
  return importDXFContent(readFileSync(FIXTURE, 'utf8'), {
    unit: 'auto', autoDetect: true,
  }).pieces;
}

describe('anchor roles — patrón real de María', () => {
  it('separates macro-corners from smooth samples without changing the outline', () => {
    const pieces = mariaPieces();
    const piece = pieces.find((item) => item.outline.length > 100)!;
    const before = JSON.stringify(piece.outline);
    const result = classifyEditableAnchors(piece, extractNodes(piece));

    expect(piece.outline.some((cmd) => cmd.type === 'C' || cmd.type === 'Q')).toBe(false);
    expect(result.some((item) => item.role === 'corner')).toBe(true);
    expect(result.some((item) => item.role === 'smoothSample')).toBe(true);
    expect(result.some((item) => item.role === 'bezierAnchor')).toBe(false);
    expect(JSON.stringify(piece.outline)).toBe(before);
  });
});

// Estos conteos son el seguro contra una trampa concreta: si algún día el
// importador deduplica los vértices coincidentes de CLO —cosa razonable de
// querer hacer— `lineEnd` se iría a cero en silencio y nadie se enteraría
// hasta que María lo reporte. Este archivo se pone rojo ese día y obliga a
// decidir explícitamente si se leen las capas 2/3 del DXF en su lugar.
describe('DXF real de María — contrato de grupos y roles', () => {
  it('carries 40 coincident groups, 28 of them on corners', () => {
    let groups = 0;
    let members = 0;
    let cornerGroups = 0;
    let cornerMembers = 0;
    let smoothGroups = 0;
    let smoothMembers = 0;
    for (const piece of mariaPieces()) {
      const roleByIndex = new Map(
        classifyEditableAnchors(piece, extractNodes(piece))
          .map((item) => [item.node.ref.commandIndex, item.role]),
      );
      const multi = [...coincidentAnchorGroups(piece.outline).values()]
        .filter((g) => g.length >= 2);
      groups += multi.length;
      members += multi.reduce((sum, g) => sum + g.length, 0);
      for (const group of multi) {
        // Uniform per group — proven by the "never stacks" test below — so
        // the first member's role tells us which bucket the group is in.
        if (roleByIndex.get(group[0]) === 'corner') {
          cornerGroups += 1;
          cornerMembers += group.length;
        } else {
          smoothGroups += 1;
          smoothMembers += group.length;
        }
      }
    }
    expect(groups).toBe(40);
    expect(members).toBe(85);
    expect(cornerGroups).toBe(28);
    expect(cornerMembers).toBe(58);
    expect(smoothGroups).toBe(12);
    expect(smoothMembers).toBe(27);
    expect(cornerGroups + smoothGroups).toBe(groups);
    expect(cornerMembers + smoothMembers).toBe(members);
  });

  it('classifies 58 corners, 27 lineEnds and 802 curve samples', () => {
    const total: Record<string, number> = {};
    for (const piece of mariaPieces()) {
      for (const item of classifyEditableAnchors(piece, extractNodes(piece))) {
        total[item.role] = (total[item.role] ?? 0) + 1;
      }
    }
    expect(total).toEqual({ corner: 58, lineEnd: 27, smoothSample: 802 });
  });

  it('never stacks two different glyphs on the same coordinate', () => {
    for (const piece of mariaPieces()) {
      const roleByIndex = new Map(
        classifyEditableAnchors(piece, extractNodes(piece))
          .map((item) => [item.node.ref.commandIndex, item.role]),
      );
      for (const members of coincidentAnchorGroups(piece.outline).values()) {
        const roles = new Set(members.map((index) => roleByIndex.get(index)));
        expect(roles.size).toBe(1);
      }
    }
  });
});
