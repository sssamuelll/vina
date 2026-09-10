// @vitest-environment jsdom
import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import type { PatternPiece } from '../../../../types/types';
import { outlineBBoxCenter, rotatePoint } from '../../../../utils/geometry/transform';
import { extractNodes } from '../../nodeEditorUtils';
import EditPatternOverlay from '../overlays/EditPatternOverlay';
import NodeEditorOverlay from '../overlays/NodeEditorOverlay';

afterEach(cleanup);

const piece = {
  id: 'p', name: 'P', position: { x: 10, y: 20 }, rotation: 30,
  outline: [
    { type: 'M', values: [0, 0] },
    { type: 'L', values: [50, 0] },
    { type: 'L', values: [100, 0] },
    { type: 'L', values: [100, 100] },
    // Doubled vertex on the top edge (colinear, no angular break) so a
    // lineEnd role actually renders — spec §8.4 claims both overlays agree
    // on role sequence "incluyendo lineEnd"; without this the fixture never
    // produced one.
    { type: 'L', values: [50, 100] },
    { type: 'L', values: [50, 100] },
    { type: 'L', values: [0, 100] },
    { type: 'Z', values: [] },
  ],
  internals: [], mirrored: false, seamAllowance: 0, active: true,
  createdAt: 0, updatedAt: 0,
} as PatternPiece;

function roleList(root: Element): string[] {
  return Array.from(root.querySelectorAll('[data-anchor-role]'))
    .map((node) => node.getAttribute('data-anchor-role')!);
}

function selectedLabelPosition(container: HTMLElement): { x: number; y: number } {
  const transform = container.querySelector('text')?.parentElement?.getAttribute('transform') ?? '';
  const match = transform.match(/^translate\(([-\d.]+), ([-\d.]+)\)$/);
  expect(match).not.toBeNull();
  return { x: Number(match![1]), y: Number(match![2]) };
}

describe('anchor overlay parity', () => {
  it('renders the same role sequence for the same piece and nodes', () => {
    const nodes = extractNodes(piece);
    const view = render(
      <svg>
        <g data-testid="edit-overlay">
          <EditPatternOverlay
            zoom2D={1} pieces={[piece]} editingPieceId={'p'} hoveredPieceId={null} nodes={nodes}
            selectedNodes={new Set()} selectedSegments={new Set()}
            hoveredNode={null} hoveredSegment={null}
            addPointPreview={null} marquee={null}
          />
        </g>
        <g data-testid="node-overlay">
          <NodeEditorOverlay
            zoom2D={1} units="mm" pieces={[piece]}
            nodeEditorEditingPieceId="p" nodeEditorNodes={nodes}
            selectedNode={null} hoveredNode={null}
          />
        </g>
      </svg>,
    );
    expect(roleList(view.getByTestId('edit-overlay')))
      .toEqual(roleList(view.getByTestId('node-overlay')));
    expect(roleList(view.getByTestId('edit-overlay'))).toContain('corner');
    expect(roleList(view.getByTestId('edit-overlay'))).toContain('smoothSample');
    expect(roleList(view.getByTestId('edit-overlay'))).toContain('lineEnd');
  });

  it('rotates the node editor anchor group with the piece', () => {
    const nodes = extractNodes(piece);
    const { container } = render(
      <svg>
        <NodeEditorOverlay
          zoom2D={1} units="mm" pieces={[piece]}
          nodeEditorEditingPieceId="p" nodeEditorNodes={nodes}
          selectedNode={null} hoveredNode={null}
        />
      </svg>,
    );
    expect(container.querySelector('.node-editor')?.getAttribute('transform'))
      .toContain('rotate(30');
  });

  it.each([90, 0])(
    'anchors a selected-node label at its visible position for rotation %i',
    (rotation) => {
      const selectedPiece = { ...piece, rotation } as PatternPiece;
      const nodes = extractNodes(selectedPiece);
      const selected = nodes[1];
      const { container } = render(
        <svg>
          <NodeEditorOverlay
            zoom2D={1} units="mm" pieces={[selectedPiece]}
            nodeEditorEditingPieceId="p" nodeEditorNodes={nodes}
            selectedNode={selected.ref} hoveredNode={null}
          />
        </svg>,
      );
      const center = outlineBBoxCenter(selectedPiece.outline);
      const projected = rotation
        ? rotatePoint(selected.position, center, rotation * Math.PI / 180)
        : selected.position;

      expect(selectedLabelPosition(container)).toEqual({
        x: projected.x + selectedPiece.position.x,
        y: projected.y + selectedPiece.position.y - 20,
      });
    },
  );

  it('keeps a Bezier control handle red and outside the anchor-role grammar', () => {
    const curved = {
      ...piece,
      rotation: 0,
      outline: [
        { type: 'M', values: [0, 0] },
        { type: 'C', values: [30, 0, 70, 100, 100, 100] },
        { type: 'Z', values: [] },
      ],
    } as PatternPiece;
    const nodes = extractNodes(curved);
    const { container } = render(
      <svg>
        <NodeEditorOverlay
          zoom2D={1} units="mm" pieces={[curved]}
          nodeEditorEditingPieceId="p" nodeEditorNodes={nodes}
          selectedNode={null} hoveredNode={null}
        />
      </svg>,
    );
    const handle = container.querySelector('.node-editor__control-handle')!;
    expect(handle.getAttribute('stroke')).toBe('#ff6b6b');
    expect(handle.closest('[data-anchor-role]')).toBeNull();
    expect(container.querySelectorAll('[data-anchor-role]')).toHaveLength(nodes.length);
  });
});
