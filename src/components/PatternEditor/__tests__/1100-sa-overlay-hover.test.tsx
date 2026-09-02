// @vitest-environment jsdom
/**
 * Spec 2026-09-02 § 5.8: el borde bajo el ratón se resalta con menos peso que
 * el seleccionado (contrato § 4: seleccionado > hover > reposo, y la
 * diferencia no puede ser solo tono), siguiendo el TRAZO como el resalte de
 * selección (#213), y no se pinta si ese borde ya está seleccionado.
 */
import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { PatternPiece, SemanticEdge } from '../../../types/types';
import SeamAllowanceSelectionOverlay from '../renderers/overlays/SeamAllowanceSelectionOverlay';

const edges: SemanticEdge[] = [
  { id: 'p:top', name: 'top', segmentRange: [1, 2], edgeType: 'seam' },
  { id: 'p:right', name: 'right', segmentRange: [2, 3], edgeType: 'seam' },
];

const pieza = (rotation = 0) => ({
  id: 'p', name: 'Delantero',
  outline: [
    { type: 'M', values: [0, 0] },
    { type: 'L', values: [200, 0] },
    { type: 'L', values: [200, 80] },
    { type: 'L', values: [0, 80] },
    { type: 'Z', values: [] },
  ],
  position: { x: 0, y: 0 }, rotation,
  mirrored: false, seamAllowance: 0, internals: [], edges,
}) as unknown as PatternPiece;

type Props = Parameters<typeof SeamAllowanceSelectionOverlay>[0];
const pintar = (props: Partial<Props>, piece = pieza()) =>
  render(
    <svg>
      <SeamAllowanceSelectionOverlay saSelection={null} pieces={[piece]} zoom={2} {...props} />
    </svg>,
  ).container;

const coords = (puntos: string) => puntos.trim().split(/\s+/).map(p => p.split(',').map(Number));

describe('SeamAllowanceSelectionOverlay — hover', () => {
  it('pinta el borde bajo el ratón siguiendo el trazo, sin punteros', () => {
    const c = pintar({ hoverEdge: { pieceId: 'p', edgeId: 'p:top' } });
    const hover = c.querySelector('[data-testid="sa-edge-hover"]')!;
    expect(hover).not.toBeNull();
    expect(hover.getAttribute('pointer-events')).toBe('none');
    const pts = coords(hover.getAttribute('points')!);
    expect(pts[0]).toEqual([0, 0]);
    expect(pts[pts.length - 1]).toEqual([200, 0]);
  });

  it('pesa menos que la selección: más fino y más transparente', () => {
    const c = pintar({
      saSelection: { kind: 'edge', items: [{ pieceId: 'p', edgeId: 'p:right' }] },
      hoverEdge: { pieceId: 'p', edgeId: 'p:top' },
    });
    const sel = c.querySelector('[data-testid="sa-edge-highlight"]')!;
    const hover = c.querySelector('[data-testid="sa-edge-hover"]')!;
    expect(Number(hover.getAttribute('stroke-width'))).toBeLessThan(Number(sel.getAttribute('stroke-width')));
    expect(Number(hover.getAttribute('opacity'))).toBeLessThan(1);
    expect(sel.getAttribute('opacity') ?? '1').toBe('1');
  });

  it('no se pinta si el borde ya está seleccionado (sería el mismo trazo dos veces)', () => {
    const c = pintar({
      saSelection: { kind: 'edge', items: [{ pieceId: 'p', edgeId: 'p:top' }] },
      hoverEdge: { pieceId: 'p', edgeId: 'p:top' },
    });
    expect(c.querySelector('[data-testid="sa-edge-hover"]')).toBeNull();
    expect(c.querySelector('[data-testid="sa-edge-highlight"]')).not.toBeNull();
  });

  it('sin hover no pinta nada de hover; sin selección tampoco se cae', () => {
    const c = pintar({ hoverEdge: null });
    expect(c.querySelector('[data-testid="sa-edge-hover"]')).toBeNull();
  });

  it('pieza girada: el hover se pinta donde SE VE (#1068)', () => {
    const c = pintar({ hoverEdge: { pieceId: 'p', edgeId: 'p:top' } }, pieza(90));
    const pts = coords(c.querySelector('[data-testid="sa-edge-hover"]')!.getAttribute('points')!);
    expect(pts[0][0]).toBeCloseTo(140, 3);
    expect(pts[0][1]).toBeCloseTo(-60, 3);
  });
});
