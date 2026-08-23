// @vitest-environment jsdom
/**
 * #1068 — la vista previa del hilo se pintaba sin girar.
 *
 * `useGrainlineTool` guarda los puntos en LOCAL (pasa por `patternToPieceLocal`
 * en el press y en el move), y el overlay los devolvia a patron sumando solo
 * `piece.position`. Como `ToolOverlay` cuelga de `data-pan-zoom-group` —que
 * solo lleva pan y zoom— la linea salia donde la pieza estaba antes de girar.
 */
import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { PatternPiece } from '../../../types/types';
import GrainlineToolOverlay from '../renderers/overlays/GrainlineToolOverlay';

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

describe('#1068 — la vista previa del hilo sobre una pieza girada', () => {
  it('dibuja el hilo girado con la pieza, no en su sombra', () => {
    // Hilo local de (10,20) a (90,20): horizontal, a lo largo de la pieza.
    // Girado 90 sobre (50,20) se ve VERTICAL, de (50,-20) a (50,60).
    const { container } = render(
      <svg>
        <GrainlineToolOverlay
          zoom2D={1}
          pieces={[GIRADA]}
          grainlineStartPoint={{ x: 10, y: 20 }}
          grainlineEndPoint={{ x: 90, y: 20 }}
          grainlinePieceId="p1"
        />
      </svg>,
    );
    const linea = container.querySelector('line')!;
    expect(linea).not.toBeNull();
    // Sin el fix salia horizontal de (10,20) a (90,20) — la pieza sin girar.
    expect(Number(linea.getAttribute('x1'))).toBeCloseTo(50, 3);
    expect(Number(linea.getAttribute('y1'))).toBeCloseTo(-20, 3);
    expect(Number(linea.getAttribute('x2'))).toBeCloseTo(50, 3);
    expect(Number(linea.getAttribute('y2'))).toBeCloseTo(60, 3);
  });

  it('sin rotacion se comporta igual que siempre', () => {
    const recta = { ...GIRADA, rotation: 0 } as PatternPiece;
    const { container } = render(
      <svg>
        <GrainlineToolOverlay
          zoom2D={1}
          pieces={[recta]}
          grainlineStartPoint={{ x: 10, y: 20 }}
          grainlineEndPoint={{ x: 90, y: 20 }}
          grainlinePieceId="p1"
        />
      </svg>,
    );
    const linea = container.querySelector('line')!;
    expect(Number(linea.getAttribute('x1'))).toBeCloseTo(10, 3);
    expect(Number(linea.getAttribute('y1'))).toBeCloseTo(20, 3);
  });
});
