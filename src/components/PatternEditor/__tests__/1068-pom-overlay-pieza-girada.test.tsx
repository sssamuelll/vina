// @vitest-environment jsdom
/**
 * #1068 — las anotaciones POM se pintaban sin girar.
 *
 * `resolveWorld` suma `piece.position` a un campo que se llama
 * `localPosition` —el nombre ya declara el espacio— y POMOverlay cuelga de
 * `ToolOverlay`, que vive en espacio de patron. Sobre una pieza girada las
 * anotaciones quedan descolocadas respecto de la pieza que anotan.
 *
 * Rectangulo, no cuadrado: un cuadrado girado 90 ocupa el mismo sitio.
 */
import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { PatternPiece, PointOfMeasure } from '../../../types/types';
import POMOverlay from '../renderers/overlays/POMOverlay';

/** 100 x 40 en local; centro del bbox (50, 20). Girada 90. */
const GIRADA = {
  id: 'p1',
  name: 'Delantero',
  outline: [
    { type: 'M', values: [0, 0] },
    { type: 'L', values: [100, 0] },
    { type: 'L', values: [100, 40] },
    { type: 'L', values: [0, 40] },
    { type: 'Z', values: [] },
  ],
  position: { x: 0, y: 0 },
  rotation: 90,
  mirrored: false,
  seamAllowance: 0,
  internals: [],
} as unknown as PatternPiece;

const POM = {
  id: 'pom1',
  name: 'Ancho de pecho',
  category: 'width',
  method: 'direct',
  pointA: { pieceId: 'p1', localPosition: { x: 10, y: 20 } },
  pointB: { pieceId: 'p1', localPosition: { x: 90, y: 20 } },
  value: 80,
  createdAt: 0,
  updatedAt: 0,
} as unknown as PointOfMeasure;

describe('#1068 — las anotaciones POM sobre una pieza girada', () => {
  it('ancla la medida donde los puntos se VEN', () => {
    // Local (10,20) y (90,20) girados 90 sobre (50,20) se ven en
    // (50,-20) y (50,60): la medida pasa de horizontal a vertical.
    const { container } = render(
      <svg>
        <POMOverlay poms={[POM]} pieces={[GIRADA]} zoom2D={1} selectedPOMId={null} />
      </svg>,
    );
    const linea = container.querySelector('line')!;
    expect(linea).not.toBeNull();
    expect(Number(linea.getAttribute('x1'))).toBeCloseTo(50, 3);
    expect(Number(linea.getAttribute('y1'))).toBeCloseTo(-20, 3);
    expect(Number(linea.getAttribute('x2'))).toBeCloseTo(50, 3);
    expect(Number(linea.getAttribute('y2'))).toBeCloseTo(60, 3);
  });

  it('sin rotacion se comporta igual que siempre', () => {
    const recta = { ...GIRADA, rotation: 0 } as PatternPiece;
    const { container } = render(
      <svg>
        <POMOverlay poms={[POM]} pieces={[recta]} zoom2D={1} selectedPOMId={null} />
      </svg>,
    );
    const linea = container.querySelector('line')!;
    expect(Number(linea.getAttribute('x1'))).toBeCloseTo(10, 3);
    expect(Number(linea.getAttribute('y1'))).toBeCloseTo(20, 3);
  });
});
