// @vitest-environment jsdom
/**
 * EditPatternOverlay — corner vs curve anchors must be visually distinct
 * (nota de María #167c: "parecen iguales, no se diferencian en nada").
 * Corner (M/L) anchors render as circles; curve (C/Q) anchors as squares.
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
  it('renders corner anchors as circles and curve anchors as squares', () => {
    const { container } = renderOverlay();
    // M(0,0) and L(100,0) are corner anchors → circles.
    expect(container.querySelectorAll('circle')).toHaveLength(2);
    // C anchor (has cp1) → a square mark, not a circle.
    const rects = container.querySelectorAll('rect');
    expect(rects).toHaveLength(1);
    // The square is centered on the curve anchor (100, 100). Both x AND y are
    // asserted: the corner L also sits at x=100, so y is what discriminates a
    // square drawn on the wrong node or at a broken coordinate.
    const r = rects[0];
    const x = parseFloat(r.getAttribute('x')!);
    const w = parseFloat(r.getAttribute('width')!);
    const y = parseFloat(r.getAttribute('y')!);
    const h = parseFloat(r.getAttribute('height')!);
    expect(x + w / 2).toBeCloseTo(100);
    expect(y + h / 2).toBeCloseTo(100);
  });
});
