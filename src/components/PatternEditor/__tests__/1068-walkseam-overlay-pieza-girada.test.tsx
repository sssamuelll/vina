// @vitest-environment jsdom
/**
 * #1068 — coser caminando se dibujaba entero sobre el fantasma sin girar.
 *
 * El overlay cuelga del grupo de pan/zoom, o sea espacio de patron, y sus
 * cuatro piezas —resalte de borde, franja de desajuste, indicador de caminado
 * y panel de metricas— sumaban `position` a puntos LOCALES. La quinta, el
 * fantasma, componia su propio `transform` y omitia el
 * `rotate(piece.rotation, cx, cy)` del renderizador.
 *
 * El hook ya media bien la distancia desde el lote 1 (#1075), asi que hasta
 * hoy la herramienta media bien y dibujaba mal: medio dibujo.
 */
import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { PatternPiece, SemanticEdge } from '../../../types/types';
import WalkSeamOverlay from '../renderers/overlays/WalkSeamOverlay';
import { computeGhostTransform, type WalkSeamEdge } from '../useWalkSeamTool';

/** 100 x 80; centro del bbox (50, 40). Borde 'top' = comando 1, 100mm. */
function rect(id: string, x: number, rotation: number): PatternPiece {
  return {
    id, name: id,
    position: { x, y: 0 },
    outline: [
      { type: 'M', values: [0, 0] },
      { type: 'L', values: [100, 0] },
      { type: 'L', values: [100, 80] },
      { type: 'L', values: [0, 80] },
      { type: 'Z', values: [] },
    ],
    edges: [{ id: `${id}:top`, name: 'top', segmentRange: [1, 2], edgeType: 'seam' }] as SemanticEdge[],
    internals: [], rotation, mirrored: false, seamAllowance: 0,
    layer: 1, sublayer: 0, active: true, createdAt: 0, updatedAt: 0,
  } as unknown as PatternPiece;
}

const borde = (piece: PatternPiece): WalkSeamEdge => ({
  pieceId: piece.id, piece, edge: piece.edges![0], arcLength: 100,
});

function pintar(rotEstacionaria: number, rotMovil: number, extra: Partial<React.ComponentProps<typeof WalkSeamOverlay>> = {}) {
  const A = rect('A', 0, rotEstacionaria);
  const B = rect('B', 200, rotMovil);
  const { container } = render(
    <svg>
      <WalkSeamOverlay
        zoom2D={1}
        stationaryEdge={borde(A)}
        mobileEdge={borde(B)}
        walkDistance={50}
        ghostTransform={computeGhostTransform(A, [1, 2], B, [1, 2], 50)}
        ghostOpacity={50}
        mismatchSamples={[]}
        metrics={null}
        formatDistance={(d) => `${d}`}
        hoveredSnapPoint={null}
        {...extra}
      />
    </svg>,
  );
  return container;
}

const coords = (s: string) => s.trim().split(/\s+/).map(p => p.split(',').map(Number));

describe('#1068 — coser caminando sobre una pieza girada', () => {
  it('el resalte del borde estacionario sigue el borde que se VE', () => {
    // A girada 90 sobre (50,40): su 'top' se ve vertical en x=90, y de -10 a 90.
    const polys = pintar(90, 0).querySelectorAll('polyline');
    const pts = coords(polys[0].getAttribute('points')!);
    expect(pts[0][0]).toBeCloseTo(90, 3);
    expect(pts[0][1]).toBeCloseTo(-10, 3);
    expect(pts[pts.length - 1][0]).toBeCloseTo(90, 3);
    expect(pts[pts.length - 1][1]).toBeCloseTo(90, 3);
  });

  it('el indicador de caminado cae donde la mano esta caminando', () => {
    // 50mm sobre un borde de 100mm girado: el medio de la vertical, (90,40).
    const c = pintar(90, 0).querySelector('circle')!;
    expect(Number(c.getAttribute('cx'))).toBeCloseTo(90, 3);
    expect(Number(c.getAttribute('cy'))).toBeCloseTo(40, 3);
  });

  it('la franja de desajuste se pinta sobre el borde que se VE', () => {
    const c = pintar(90, 0, {
      mismatchSamples: [
        { distance: 0, pointA: { x: 0, y: 0 }, pointB: { x: 0, y: 0 }, delta: 0, color: 'green' },
        { distance: 100, pointA: { x: 100, y: 0 }, pointB: { x: 100, y: 0 }, delta: 0, color: 'green' },
      ],
    });
    const linea = c.querySelector('line')!;
    expect(Number(linea.getAttribute('x1'))).toBeCloseTo(90, 3);
    expect(Number(linea.getAttribute('y1'))).toBeCloseTo(-10, 3);
    expect(Number(linea.getAttribute('x2'))).toBeCloseTo(90, 3);
    expect(Number(linea.getAttribute('y2'))).toBeCloseTo(90, 3);
  });

  it('el panel de metricas se ancla al medio del borde que se VE', () => {
    const c = pintar(90, 0, {
      metrics: { lengthA: 100, lengthB: 100, delta: 0, easePercent: 0, walkPosition: 50 },
    });
    // El panel es el unico `<g>` con SOLO un translate: el del fantasma
    // tambien empieza por translate, pero sigue con dos rotate.
    const g = [...c.querySelectorAll('g')]
      .find(el => /^translate\([-\d.]+, [-\d.]+\)$/.test(el.getAttribute('transform') ?? ''))!;
    expect(g).toBeTruthy();
    const [, px, py] = g.getAttribute('transform')!.match(/translate\(([-\d.]+), ([-\d.]+)\)/)!;
    expect(Number(px)).toBeCloseTo(90, 3);
    expect(Number(py)).toBeCloseTo(40 - 30, 3);
  });

  it('el fantasma COMPONE la pose de la pieza, no la reemplaza', () => {
    // Las dos giradas 90: no falta giro de alineacion (0), pero el fantasma
    // tiene que seguir llevando el giro propio de la pieza movil.
    const c = pintar(90, 90);
    const g = [...c.querySelectorAll('g')]
      .map(el => el.getAttribute('transform') ?? '')
      .find(t => t.includes('rotate('))!;
    expect(g).toBe('translate(-200, 0) rotate(0, 290, 40) translate(200, 0) rotate(90, 50, 40)');
  });

  it('sin rotacion se comporta igual que siempre', () => {
    const c = pintar(0, 0);
    const pts = coords(c.querySelectorAll('polyline')[0].getAttribute('points')!);
    expect(pts[0][0]).toBeCloseTo(0, 3);
    expect(pts[0][1]).toBeCloseTo(0, 3);
    expect(pts[pts.length - 1][0]).toBeCloseTo(100, 3);
    expect(pts[pts.length - 1][1]).toBeCloseTo(0, 3);
    const circ = c.querySelector('circle')!;
    expect(Number(circ.getAttribute('cx'))).toBeCloseTo(50, 3);
    expect(Number(circ.getAttribute('cy'))).toBeCloseTo(0, 3);
  });
});
