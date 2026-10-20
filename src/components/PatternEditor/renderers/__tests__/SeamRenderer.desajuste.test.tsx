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
  edges: [
    { id: `${id}:top`, name: 'top', segmentRange: [1, 1 + xs.length], edgeType: 'seam' },
    // El tramo de cierre (de (0, 50) a la `M`), rotulado con el índice de la `M`.
    { id: `${id}:left`, name: 'left', segmentRange: [0, 1], edgeType: 'seam' },
  ] as SemanticEdge[],
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
  it('el resalte de una costura entera cubre el borde entero, no su primer comando', () => {
    const { container } = render(
      <svg><SeamRenderer seams={[seam]} pieces={[pieza('a', [50, 80, 100], 0), pieza('b', [20, 50, 100], 300)]} zoom2D={1} selectedSeamId={null} /></svg>,
    );
    const resaltes = Array.from(container.querySelectorAll('.seam-connection > path')).map(p => p.getAttribute('d'));
    expect(resaltes).toEqual(['M0,0 L50,0 L80,0 L100,0', 'M300,0 L320,0 L350,0 L400,0']);
  });
  it('un borde de rango vacío ([1, 1]) dibuja su primer comando, como el motor (commandRangeToFlattened)', () => {
    const vacio = (id: string, x0: number): PatternPiece => ({
      ...pieza(id, [50, 80, 100], x0),
      edges: [{ id: `${id}:v`, name: 'top', segmentRange: [1, 1], edgeType: 'seam' }] as SemanticEdge[],
    });
    const { container } = render(
      <svg><SeamRenderer seams={[seam]} pieces={[vacio('a', 0), vacio('b', 300)]} zoom2D={1} selectedSeamId={null} /></svg>,
    );
    const resaltes = Array.from(container.querySelectorAll('.seam-connection > path')).map(p => p.getAttribute('d'));
    expect(resaltes).toEqual(['M0,0 L50,0', 'M300,0 L350,0']);
  });
  it('la etiqueta de desajuste se ancla en el medio de los bordes enteros', () => {
    const { container } = render(
      <svg><SeamRenderer seams={[seam]} pieces={[pieza('a', [50, 80, 100], 0), pieza('b', [20, 50, 110], 300)]} zoom2D={1} selectedSeamId={null} /></svg>,
    );
    const etiqueta = Array.from(container.querySelectorAll('text')).find(t => t.textContent?.includes('de diferencia'));
    // El medio de A es (50, 0) y el de B (355, 0); el del primer comando era (25, 0) y (310, 0).
    expect(Number(etiqueta?.getAttribute('x'))).toBeCloseTo(202.5, 6);
  });
  it('una costura sobre el tramo de cierre se pinta y se mide', () => {
    const cierre: Seam = { ...seam, pieceA: { pieceId: 'a', edgeName: 'left' }, pieceB: { pieceId: 'b', edgeName: 'left' } };
    const { container } = render(
      <svg><SeamRenderer seams={[cierre]} pieces={[pieza('a', [100], 0), pieza('b', [100], 300)]} zoom2D={1} selectedSeamId="s1" /></svg>,
    );
    expect(container.querySelectorAll('.seam-connection')).toHaveLength(1);
    expect(textos(container).filter(t => t === '50.0mm')).toHaveLength(2);
  });
});
