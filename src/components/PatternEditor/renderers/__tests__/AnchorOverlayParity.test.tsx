// @vitest-environment jsdom
import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import type { PatternPiece } from '../../../../types/types';
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

describe('anchor overlay parity', () => {
  it('renders the same role sequence for the same piece and nodes', () => {
    const nodes = extractNodes(piece);
    const view = render(
      <svg>
        <g data-testid="edit-overlay">
          <EditPatternOverlay
            zoom2D={1} pieces={[piece]} editingPieceId={'p'} nodes={nodes}
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
