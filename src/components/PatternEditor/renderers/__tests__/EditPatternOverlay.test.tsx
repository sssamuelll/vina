// @vitest-environment jsdom
/**
 * EditPatternOverlay — geometric corners and smooth samples use the shared
 * semantic anchor grammar.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { render, cleanup } from '@testing-library/react';
import EditPatternOverlay from '../overlays/EditPatternOverlay';
import { extractNodes } from '../../nodeEditorUtils';
import type { PatternPiece } from '../../../../types/types';

afterEach(cleanup);

const outline = [
  { type: 'M', values: [0, 0] },
  { type: 'L', values: [100, 0] },
  { type: 'C', values: [120, 20, 120, 80, 100, 100] },
  { type: 'Z', values: [] },
] as PatternPiece['outline'];

const piece = {
  id: 'p', name: 'P', outline, position: { x: 0, y: 0 },
  rotation: 0, mirrored: false, active: true, seamAllowance: 0, internals: [], edges: [],
} as unknown as PatternPiece;

function renderOverlay() {
  return render(
    <svg>
      <EditPatternOverlay
        zoom2D={1}
        pieces={[piece]}
        editingPieceId="p"
        hoveredPieceId={null}
        nodes={extractNodes(piece)}
        selectedNodes={new Set()}
        selectedSegments={new Set()}
        hoveredNode={null}
        hoveredSegment={null}
        addPointPreview={null}
        marquee={null}
      />
    </svg>,
  );
}

describe('EditPatternOverlay rotation (nota de María #170)', () => {
  it('rotates the anchor group with the piece so dots track the rotated outline', () => {
    const rotated = { ...piece, rotation: 90 } as unknown as PatternPiece;
    const { container } = render(
      <svg>
        <EditPatternOverlay
          zoom2D={1}
          pieces={[rotated]}
          editingPieceId="p"
          hoveredPieceId={null}
          nodes={extractNodes(rotated)}
          selectedNodes={new Set()}
          selectedSegments={new Set()}
          hoveredNode={null}
          hoveredSegment={null}
          addPointPreview={null}
          marquee={null}
        />
      </svg>,
    );
    const g = Array.from(container.querySelectorAll('g')).find(el =>
      /rotate\(\s*90/.test(el.getAttribute('transform') ?? ''),
    );
    expect(g).toBeTruthy();
  });

  it('emits no rotate transform for an un-rotated piece', () => {
    const { container } = renderOverlay();
    const anyRotate = Array.from(container.querySelectorAll('g')).some(el =>
      /rotate\(/.test(el.getAttribute('transform') ?? ''),
    );
    expect(anyRotate).toBe(false);
  });
});

describe('EditPatternOverlay anchor marks', () => {
  it('renders geometric corners differently from smooth polyline samples', () => {
    const densePiece = {
      ...piece,
      outline: [
        { type: 'M', values: [0, 0] },
        { type: 'L', values: [50, 0] },
        { type: 'L', values: [100, 0] },
        { type: 'L', values: [100, 100] },
        { type: 'L', values: [0, 100] },
        { type: 'Z', values: [] },
      ],
    } as PatternPiece;
    const { container } = render(
      <svg>
        <EditPatternOverlay
          zoom2D={1} pieces={[densePiece]} editingPieceId="p" hoveredPieceId={null}
          nodes={extractNodes(densePiece)} selectedNodes={new Set()}
          selectedSegments={new Set()} hoveredNode={null}
          hoveredSegment={null} addPointPreview={null} marquee={null}
        />
      </svg>,
    );
    expect(container.querySelectorAll('[data-anchor-role="corner"]')).toHaveLength(4);
    expect(container.querySelectorAll('[data-anchor-role="smoothSample"]')).toHaveLength(1);
    expect(container.querySelector('[data-anchor-role="corner"] rect')).toBeTruthy();
    expect(container.querySelector('[data-anchor-role="smoothSample"] circle')).toBeTruthy();
  });
});
