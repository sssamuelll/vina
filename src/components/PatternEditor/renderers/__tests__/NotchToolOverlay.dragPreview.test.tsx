// @vitest-environment jsdom
/**
 * El lector del piquete debe seguir el trazo que se está midiendo. Una cuerda
 * entre los extremos ocultaría precisamente la diferencia de arco que motivó
 * esta tanda, así que el fixture hace imposible que ambas se confundan.
 */
import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import type { PatternPiece } from '../../../../types/types';
import type { SegmentSelection } from '../../useSegmentSewingTool';
import NotchToolOverlay from '../overlays/NotchToolOverlay';

afterEach(cleanup);

const CURVED_PIECE: PatternPiece = {
  id: 'curva',
  name: 'Sisa',
  outline: [
    { type: 'M', values: [0, 0] },
    { type: 'C', values: [20, 80, 80, 80, 100, 0] },
    { type: 'L', values: [0, 0] },
    { type: 'Z', values: [] },
  ],
  position: { x: 0, y: 0 },
  rotation: 0,
  mirrored: false,
  seamAllowance: 0,
  internals: [],
  active: true,
  createdAt: 0,
  updatedAt: 0,
};

const DRAG_SEGMENT: SegmentSelection = {
  pieceId: 'curva',
  edgeIndex: 1,
  edgeRange: [1, 2],
  startT: 0,
  endT: 1,
  startPoint: { x: 0, y: 0 },
  endPoint: { x: 100, y: 0 },
};

function svg(dragPreview: React.ComponentProps<typeof NotchToolOverlay>['dragPreview']) {
  const { container } = render(
    <svg>
      <NotchToolOverlay
        zoom2D={2}
        pieces={[CURVED_PIECE]}
        notchHoveredPoint={null}
        refineMarker={null}
        dragPreview={dragPreview}
        dragSegment={dragPreview ? DRAG_SEGMENT : null}
      />
    </svg>,
  );
  return container;
}

describe('NotchToolOverlay — lector vivo del piquete', () => {
  it('pinta la referencia, el arco real y los milímetros con coma decimal', () => {
    const c = svg({
      refWorld: { x: 0, y: 0 },
      currentWorld: { x: 100, y: 0 },
      distanceMm: 42.34,
    });

    const marker = c.querySelector('.notch-drag-preview');
    expect(marker).not.toBeNull();
    expect(marker?.querySelector('circle')?.getAttribute('cx')).toBe('0');

    const d = marker?.querySelector('path')?.getAttribute('d') ?? '';
    const ys = [...d.matchAll(/[ML]\s+-?[\d.]+\s+(-?[\d.]+)/g)].map(match => Number(match[1]));
    // La cuerda del fixture vive enteramente en y=0; cualquier y interior
    // positivo demuestra que el indicador siguió la sisa aplanada.
    expect(ys.some(y => y > 1)).toBe(true);

    const text = marker?.querySelector('text');
    expect(text?.textContent).toBe('42,3 mm');
    expect(text?.getAttribute('font-size')).toBe('5');
  });

  it('sin arrastre vivo no deja ningún lector en el lienzo', () => {
    expect(svg(null).querySelector('.notch-drag-preview')).toBeNull();
  });
});
