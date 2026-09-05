/**
 * @vitest-environment jsdom
 *
 * Guards the Line Lengths revival (spec 2026-06-04 display-toggles-resurface §4):
 * one label per semantic edge, formatDimension output, detection fallback for
 * pieces without stored edges (DXF imports).
 */
import { describe, it, expect, afterEach } from 'vitest';
import { render, cleanup } from '@testing-library/react';
import type { PatternPiece, SemanticEdge } from '../../../../types/types';
import LineLengthLabels from '../LineLengthLabels';

afterEach(cleanup);

// Cuadrado de 100×100 mm, con la MISMA forma que emite `useRectangleTool`:
// `M L L L Z`. El cuarto lado —el izquierdo— lo dibuja la `Z`, y no tiene
// comando propio. El fixture viejo repetía el origen con un quinto `L`, y con
// eso el cierre no existía como tal: el fallo no podía aparecer (#1120).
function squarePiece(edges?: SemanticEdge[]): PatternPiece {
  return {
    id: 'p1',
    name: 'P',
    position: { x: 0, y: 0 },
    rotation: 0,
    mirrored: false,
    seamAllowance: 10,
    outline: [
      { type: 'M', values: [0, 0] },
      { type: 'L', values: [100, 0] },
      { type: 'L', values: [100, 100] },
      { type: 'L', values: [0, 100] },
      { type: 'Z', values: [] },
    ],
    internals: [],
    createdAt: 0,
    updatedAt: 0,
    active: true,
    edges,
  } as unknown as PatternPiece;
}

function renderLabels(piece: PatternPiece, units: 'cm' | 'inches' | 'mm' = 'cm') {
  return render(
    <svg>
      <LineLengthLabels piece={piece} zoom2D={1} units={units} />
    </svg>,
  );
}

describe('LineLengthLabels', () => {
  it('renders one label per stored semantic edge, formatted in active units', () => {
    const piece = squarePiece([
      { id: 'e1', name: 'hemline', segmentRange: [1, 2], edgeType: 'hem', length: 100 },
    ]);
    const { container } = renderLabels(piece, 'cm');
    const texts = container.querySelectorAll('text');
    expect(texts.length).toBe(1);
    expect(texts[0].textContent).toBe('10.0 cm');
  });

  it('formats in inches when units=inches', () => {
    const piece = squarePiece([
      { id: 'e1', name: 'hemline', segmentRange: [1, 2], edgeType: 'hem', length: 100 },
    ]);
    const { container } = renderLabels(piece, 'inches');
    expect(container.querySelector('text')!.textContent).toBe('3.9 in');
  });

  it('positions the label at the edge midpoint', () => {
    const piece = squarePiece([
      // segment 1 runs (0,0)→(100,0): midpoint (50, 0)
      { id: 'e1', name: 'hemline', segmentRange: [1, 2], edgeType: 'hem', length: 100 },
    ]);
    const { container } = renderLabels(piece);
    const text = container.querySelector('text')!;
    expect(Number(text.getAttribute('x'))).toBeCloseTo(50);
    expect(Number(text.getAttribute('y'))).toBeCloseTo(0);
  });

  it('falls back to detectSemanticEdges for pieces without stored edges (DXF path)', () => {
    // A 4-segment square groups into 4 zones (top/right/bottom/left) → 4 edges.
    const { container } = renderLabels(squarePiece(undefined));
    const texts = container.querySelectorAll('text');
    expect(texts.length).toBe(4);
    for (const t of texts) expect(t.textContent).toBe('10.0 cm');
  });

  it('el lado de cierre también enseña su medida, y en su sitio', () => {
    // Contar cuatro no basta: cuatro etiquetas pueden ser cuatro del lado
    // equivocado. El oráculo es DÓNDE cae la del cierre — el lado izquierdo
    // de un cuadrado de 100 va de (0,100) a (0,0), o sea su medio es (0,50).
    const { container } = renderLabels(squarePiece(undefined));
    const puntos = [...container.querySelectorAll('text')].map(t => ({
      x: Number(t.getAttribute('x')),
      y: Number(t.getAttribute('y')),
    }));
    expect(puntos).toContainEqual({ x: 0, y: 50 });
  });

  it('computes length from the outline when edge.length is missing', () => {
    const piece = squarePiece([
      { id: 'e1', name: 'sideSeam', segmentRange: [2, 3], edgeType: 'seam' },
    ]);
    const { container } = renderLabels(piece);
    expect(container.querySelector('text')!.textContent).toBe('10.0 cm');
  });

  it('skips degenerate edges (< 1mm)', () => {
    const piece = {
      ...squarePiece(),
      outline: [
        { type: 'M', values: [0, 0] },
        { type: 'L', values: [0.5, 0] },
      ],
      edges: [{ id: 'e1', name: 'edge', segmentRange: [1, 2], edgeType: 'unknown', length: 0.5 }],
    } as unknown as PatternPiece;
    const { container } = renderLabels(piece);
    expect(container.querySelectorAll('text').length).toBe(0);
  });
});
