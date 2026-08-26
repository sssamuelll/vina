// @vitest-environment jsdom
/**
 * #1068 — el resalte del margen se pintaba sin girar.
 *
 * `SeamAllowanceSelectionOverlay` cuelga del grupo de pan/zoom, o sea espacio
 * de patron, y construia sus puntos con contorno crudo + `position`. Sobre una
 * pieza girada eso pinta el resalte sobre el fantasma: la usuaria clica el
 * borde que ve, el hit-test acierta —eso ya lo arreglo #1064— y el azul
 * aparece en otro sitio. La confirmacion contradice a la accion.
 *
 * Rectangulo, no cuadrado: un cuadrado girado 90 ocupa el mismo sitio.
 */
import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { PatternPiece, SemanticEdge } from '../../../types/types';
import SeamAllowanceSelectionOverlay from '../renderers/overlays/SeamAllowanceSelectionOverlay';

const edges: SemanticEdge[] = [
  { id: 'p:top', name: 'top', segmentRange: [1, 2], edgeType: 'seam' },
];

/** 200 x 80 en local; centro del bbox (100, 40). */
const pieza = (rotation: number) => ({
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

const pintar = (saSelection: Parameters<typeof SeamAllowanceSelectionOverlay>[0]['saSelection'], piece: PatternPiece) =>
  render(
    <svg>
      <SeamAllowanceSelectionOverlay saSelection={saSelection} pieces={[piece]} zoom={1} />
    </svg>,
  ).container;

const coords = (puntos: string) =>
  puntos.trim().split(/\s+/).map(p => p.split(',').map(Number));

describe('#1068 — el resalte del margen sobre una pieza girada', () => {
  it('el borde se resalta donde SE VE', () => {
    // Local (0,0)->(200,0) girado 90 sobre (100,40) se ve como la vertical
    // x=140, de y=-60 a y=140.
    const c = pintar({ kind: 'edge', items: [{ pieceId: 'p', edgeId: 'p:top' }] }, pieza(90));
    const pts = coords(c.querySelector('[data-testid="sa-edge-highlight"]')!.getAttribute('points')!);
    expect(pts.length).toBeGreaterThanOrEqual(2);
    expect(pts[0][0]).toBeCloseTo(140, 3);
    expect(pts[0][1]).toBeCloseTo(-60, 3);
    expect(pts[pts.length - 1][0]).toBeCloseTo(140, 3);
    expect(pts[pts.length - 1][1]).toBeCloseTo(140, 3);
  });

  it('el vertice se resalta donde SE VE', () => {
    // El comando 1 termina en local (200,0); girado se ve en (140,140).
    const c = pintar({ kind: 'vertex', items: [{ pieceId: 'p', vertexIndex: 1 }] }, pieza(90));
    const circulo = c.querySelector('circle')!;
    expect(circulo).not.toBeNull();
    expect(Number(circulo.getAttribute('cx'))).toBeCloseTo(140, 3);
    expect(Number(circulo.getAttribute('cy'))).toBeCloseTo(140, 3);
  });

  it('sin rotacion se comporta igual que siempre', () => {
    const c = pintar({ kind: 'edge', items: [{ pieceId: 'p', edgeId: 'p:top' }] }, pieza(0));
    const pts = coords(c.querySelector('[data-testid="sa-edge-highlight"]')!.getAttribute('points')!);
    expect(pts[0][0]).toBeCloseTo(0, 3);
    expect(pts[0][1]).toBeCloseTo(0, 3);
    expect(pts[pts.length - 1][0]).toBeCloseTo(200, 3);
    expect(pts[pts.length - 1][1]).toBeCloseTo(0, 3);
  });
});
