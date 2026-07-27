import { describe, expect, it } from 'vitest';
import type { PatternPiece } from '../../../types/types';
import { extractNodes } from '../nodeEditorUtils';
import { classifyEditableAnchors } from '../anchorRoles';

function piece(outline: PatternPiece['outline']): PatternPiece {
  return {
    id: 'p', name: 'P', outline, internals: [], position: { x: 0, y: 0 },
    rotation: 0, mirrored: false, seamAllowance: 0, active: true,
    createdAt: 0, updatedAt: 0,
  } as PatternPiece;
}

function roles(outline: PatternPiece['outline']) {
  const value = piece(outline);
  return classifyEditableAnchors(value, extractNodes(value));
}

describe('classifyEditableAnchors', () => {
  it('marks the four vertices of a closed square as corners', () => {
    const result = roles([
      { type: 'M', values: [0, 0] }, { type: 'L', values: [100, 0] },
      { type: 'L', values: [100, 100] }, { type: 'L', values: [0, 100] },
      { type: 'Z', values: [] },
    ]);
    expect(result.map((item) => item.role)).toEqual([
      'corner', 'corner', 'corner', 'corner',
    ]);
  });

  it('does not invent corners in a dense smooth circle', () => {
    const points = Array.from({ length: 36 }, (_, index) => {
      const angle = index * Math.PI * 2 / 36;
      return [Math.cos(angle) * 100, Math.sin(angle) * 100];
    });
    const outline: PatternPiece['outline'] = [
      { type: 'M', values: points[0] },
      ...points.slice(1).map((values) => ({ type: 'L' as const, values })),
      { type: 'Z', values: [] },
    ];
    expect(roles(outline).every((item) => item.role === 'smoothSample')).toBe(true);
  });

  it('gives open endpoints priority over an angular turn', () => {
    const result = roles([
      { type: 'M', values: [0, 0] },
      { type: 'L', values: [100, 0] },
      { type: 'L', values: [100, 100] },
    ]);
    expect(result[0].role).toBe('openEndpoint');
    expect(result.at(-1)?.role).toBe('openEndpoint');
  });

  it('marks anchors in a smooth closed cubic loop as bezier anchors', () => {
    const result = roles([
      { type: 'M', values: [0, 50] },
      { type: 'C', values: [0, 22, 22, 0, 50, 0] },
      { type: 'C', values: [78, 0, 100, 22, 100, 50] },
      { type: 'C', values: [100, 78, 78, 100, 50, 100] },
      { type: 'C', values: [22, 100, 0, 78, 0, 50] },
      { type: 'Z', values: [] },
    ]);
    expect(result.every((item) => item.role === 'bezierAnchor')).toBe(true);
  });

  it('gives a C-to-L angular union the corner role', () => {
    const result = roles([
      { type: 'M', values: [0, 0] },
      { type: 'C', values: [30, 0, 70, 0, 100, 0] },
      { type: 'L', values: [100, 100] },
      { type: 'L', values: [0, 100] },
      { type: 'Z', values: [] },
    ]);
    expect(result.find((item) => item.node.ref.commandIndex === 1)?.role).toBe('corner');
  });

  it('gives the corner role to every command sharing the coordinate', () => {
    const result = roles([
      { type: 'M', values: [0, 0] },
      { type: 'L', values: [100, 0] },
      { type: 'L', values: [100, 0] },
      { type: 'L', values: [100, 100] },
      { type: 'L', values: [0, 100] },
      { type: 'Z', values: [] },
    ]);
    const coincident = result.filter((item) =>
      item.node.position.x === 100 && item.node.position.y === 0);
    expect(coincident).toHaveLength(2);
    expect(coincident.map((item) => item.role)).toEqual(['corner', 'corner']);
  });

  it('marks a smooth doubled vertex as lineEnd', () => {
    const result = roles([
      { type: 'M', values: [0, 0] },
      { type: 'L', values: [50, 0] },
      { type: 'L', values: [50, 0] },
      { type: 'L', values: [100, 0] },
      { type: 'L', values: [100, 100] },
      { type: 'L', values: [0, 100] },
      { type: 'Z', values: [] },
    ]);
    const coincident = result.filter((item) =>
      item.node.position.x === 50 && item.node.position.y === 0);
    expect(coincident.map((item) => item.role)).toEqual(['lineEnd', 'lineEnd']);
  });

  it('does not invent lineEnd where no vertex is doubled', () => {
    const result = roles([
      { type: 'M', values: [0, 0] },
      { type: 'L', values: [50, 0] },
      { type: 'L', values: [100, 0] },
      { type: 'L', values: [100, 100] },
      { type: 'L', values: [0, 100] },
      { type: 'Z', values: [] },
    ]);
    expect(result.some((item) => item.role === 'lineEnd')).toBe(false);
  });

  it('keeps openEndpoint above the group role on an open path', () => {
    const result = roles([
      { type: 'M', values: [0, 0] },
      { type: 'L', values: [50, 0] },
      { type: 'L', values: [100, 0] },
      { type: 'L', values: [100, 0] },
    ]);
    // El último nodo comparte coordenada con el anterior; el extremo abierto
    // manda igual, que es la prioridad declarada en la spec §7.
    expect(result[0].role).toBe('openEndpoint');
    expect(result[3].role).toBe('openEndpoint');
  });

  it('preserves node order and commandIndex', () => {
    const value = piece([
      { type: 'M', values: [0, 0] },
      { type: 'L', values: [50, 0] },
      { type: 'L', values: [100, 0] },
    ]);
    const nodes = extractNodes(value);
    const result = classifyEditableAnchors(value, nodes);
    expect(result.map((item) => item.node.ref.commandIndex))
      .toEqual(nodes.map((node) => node.ref.commandIndex));
  });
});
