/** @vitest-environment jsdom */
import { describe, it, expect, afterEach } from 'vitest';
import { render, cleanup } from '@testing-library/react';
import type { PatternPiece, Seam, SemanticEdge } from '../../../../types/types';
import SeamRenderer from '../SeamRenderer';

/**
 * El lienzo medía un solo comando de cada borde
 * (`getEdgeArcLength(outline, segmentRange[0])`). Con los bordes de muchos
 * comandos del DXF de María, la etiqueta de desajuste y los largos que se
 * enseñan al pasar el ratón comparaban un microsegmento con otro. Ahora miden
 * lo mismo que la superficie: el largo cosido del borde entero.
 */
afterEach(cleanup);

const pieza = (id: string, xs: number[], x0: number): PatternPiece => ({
  id, name: id, position: { x: x0, y: 0 },
  outline: [
    { type: 'M', values: [0, 0] },
    ...xs.map(x => ({ type: 'L' as const, values: [x, 0] })),
    { type: 'L', values: [xs[xs.length - 1], 50] },
    { type: 'L', values: [0, 50] },
    { type: 'Z', values: [] },
  ],
  edges: [{ id: `${id}:top`, name: 'top', segmentRange: [1, 1 + xs.length], edgeType: 'seam' }] as SemanticEdge[],
  internals: [], rotation: 0, mirrored: false, seamAllowance: 0, layer: 1, sublayer: 0, active: true, createdAt: 0, updatedAt: 0,
});

const seam: Seam = {
  id: 's1', pieceA: { pieceId: 'a', edgeName: 'top' }, pieceB: { pieceId: 'b', edgeName: 'top' },
  type: 'standard', tension: 1, strength: 1, active: true, taped: false, tapeWidth: 0,
};

const textos = (container: HTMLElement) => Array.from(container.querySelectorAll('text')).map(t => t.textContent ?? '');
const desajustes = (container: HTMLElement) => textos(container).filter(t => t.includes('de diferencia'));

describe('SeamRenderer: la medida de una costura', () => {
  it('dos bordes de 100 mm partidos distinto no se marcan como desajustados', () => {
    const { container } = render(
      <svg><SeamRenderer seams={[seam]} pieces={[pieza('a', [50, 80, 100], 0), pieza('b', [20, 50, 100], 300)]} zoom2D={1} selectedSeamId={null} /></svg>,
    );
    expect(desajustes(container)).toEqual([]);
  });
  it('un desajuste de verdad se marca con su número', () => {
    const { container } = render(
      <svg><SeamRenderer seams={[seam]} pieces={[pieza('a', [50, 80, 100], 0), pieza('b', [20, 50, 110], 300)]} zoom2D={1} selectedSeamId={null} /></svg>,
    );
    expect(desajustes(container)).toEqual(['⚠ 10.0mm de diferencia']);
  });
  it('con la costura encendida, los largos son los del borde entero', () => {
    const { container } = render(
      <svg><SeamRenderer seams={[seam]} pieces={[pieza('a', [50, 80, 100], 0), pieza('b', [20, 50, 110], 300)]} zoom2D={1} selectedSeamId="s1" /></svg>,
    );
    expect(textos(container)).toEqual(expect.arrayContaining(['100.0mm', '110.0mm']));
  });
});
