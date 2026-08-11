// @vitest-environment jsdom
/**
 * maria-199, segunda vuelta — "CREA COSTYRA EN RECTA, SIN SEGUIR LA CURVA".
 *
 * Los dos overlays de coser dibujaban la CUERDA del borde:
 *
 *  - `EdgePairOverlay` pintaba un `<line>` de `start` a `end`, así que el
 *    resalte de un borde curvo salía recto.
 *  - `SegmentSewingOverlay` interpolaba LINEALMENTE entre extremos con
 *    `startT`/`endT`, así que sobre una curva ni el tramo ni sus dos marcas
 *    caían donde ella había clicado.
 *
 * Mismo arreglo que recibió el resalte del margen en el #213: pasar por el
 * trazo aplanado en vez de por la recta entre extremos.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { render, cleanup } from '@testing-library/react';
import EdgePairOverlay from '../overlays/EdgePairOverlay';
import SegmentSewingOverlay from '../overlays/SegmentSewingOverlay';
import { buildEdgeSelection } from '../../sewingUtils';
import type { PatternPiece } from '../../../../types/types';
import type { SegmentSelection } from '../../useSegmentSewingTool';

afterEach(cleanup);

const arco = {
  id: 'p-arco',
  name: 'Arco',
  outline: [
    { type: 'M', values: [0, 100] },
    { type: 'C', values: [113, -20, 227, -20, 340, 100] }, // edge 1: el arco
    { type: 'L', values: [340, 290] },                     // edge 2: recta
    { type: 'Z', values: [] },
  ],
  position: { x: 0, y: 0 },
  rotation: 0, mirrored: false, seamAllowance: 0, internals: [],
  layer: 1, sublayer: 0, active: true, createdAt: 0, updatedAt: 0,
} as unknown as PatternPiece;

/** Cuenta los vértices de un atributo `d` de SVG (comandos M/L). */
const puntos = (d: string) => (d.match(/[ML]/g) ?? []).length;

/** Y mínima que alcanza un `d` de solo M/L. */
const topY = (d: string) => Math.min(
  ...[...d.matchAll(/[ML]\s*(-?[\d.]+)[ ,]+(-?[\d.]+)/g)].map(m => parseFloat(m[2])),
);

function svg(node: React.ReactElement) {
  const { container } = render(<svg>{node}</svg>);
  return container;
}

describe('EdgePairOverlay — el resalte de un borde curvo sigue la curva', () => {
  it('el borde elegido se dibuja con el trazo, no con su cuerda', () => {
    const sel = buildEdgeSelection(arco, 1)!;
    const c = svg(<EdgePairOverlay zoom2D={1} firstEdge={sel} hoveredEdge={null} />);

    // Nada de <line> para el borde: una recta entre extremos es justo el fallo.
    const paths = Array.from(c.querySelectorAll('path')) as SVGPathElement[];
    expect(paths.length).toBeGreaterThan(0);
    const d = paths[0].getAttribute('d')!;
    expect(puntos(d)).toBeGreaterThan(2);
    // La cuerda está en y=100; el arco real sube hasta y≈10.
    expect(topY(d)).toBeLessThan(40);
  });

  it('un borde recto sigue saliendo con dos puntos', () => {
    const sel = buildEdgeSelection(arco, 2)!;
    const c = svg(<EdgePairOverlay zoom2D={1} firstEdge={sel} hoveredEdge={null} />);
    const d = c.querySelector('path')!.getAttribute('d')!;
    expect(puntos(d)).toBe(2);
  });
});

describe('SegmentSewingOverlay — el tramo marcado sigue la curva', () => {
  const tramo: SegmentSelection = {
    pieceId: 'p-arco',
    edgeIndex: 1,
    edgeRange: [1, 2],
    startT: 0.25,
    endT: 0.75,
    startPoint: { x: 0, y: 0 },
    endPoint: { x: 0, y: 0 },
  };

  it('el sub-tramo de un borde curvo se pinta curvo y por encima de la cuerda', () => {
    const c = svg(
      <SegmentSewingOverlay
        zoom2D={1} pieces={[arco]} phase="a_end"
        segmentA={tramo} segmentB={null} pendingSnap={null} hoveredSnap={null}
      />,
    );
    const d = c.querySelector('path')!.getAttribute('d')!;
    expect(puntos(d)).toBeGreaterThan(2);
    expect(topY(d)).toBeLessThan(40);
  });

  it('las dos marcas caen SOBRE el trazo, no sobre la cuerda', () => {
    const c = svg(
      <SegmentSewingOverlay
        zoom2D={1} pieces={[arco]} phase="a_end"
        segmentA={tramo} segmentB={null} pendingSnap={null} hoveredSnap={null}
      />,
    );
    const marcas = Array.from(c.querySelectorAll('circle')) as SVGCircleElement[];
    expect(marcas).toHaveLength(2);
    for (const m of marcas) {
      // Interpolar sobre la cuerda las dejaba en y=100 clavado.
      expect(parseFloat(m.getAttribute('cy')!)).toBeLessThan(80);
    }
  });
});

/**
 * maria-199a — el resalte se recortaba del COMANDO clicado, no del BORDE. Un
 * tramo que cruza el corte entre dos comandos del mismo lado recto se pintaba
 * encogido dentro del primero, así que ella veía una marca que no era la suya.
 */
describe('SegmentSewingOverlay — un tramo que cruza dos comandos del mismo borde', () => {
  const partida = {
    ...arco,
    id: 'p-partida',
    outline: [
      { type: 'M', values: [0, 0] },
      { type: 'L', values: [30, 0] },    // 1: primer tramo del lado de arriba
      { type: 'L', values: [100, 0] },   // 2: el resto del MISMO lado
      { type: 'L', values: [100, 100] },
      { type: 'Z', values: [] },
    ],
  } as unknown as PatternPiece;

  /** X mínima y máxima que alcanza un `d` de solo M/L. */
  const rangoX = (d: string) => {
    const xs = [...d.matchAll(/[ML]\s*(-?[\d.]+)[ ,]+(-?[\d.]+)/g)].map(m => parseFloat(m[1]));
    return [Math.min(...xs), Math.max(...xs)];
  };

  it('el resalte llega hasta donde ella clicó, cruzando el corte', () => {
    const tramo: SegmentSelection = {
      pieceId: 'p-partida', edgeIndex: 1, edgeRange: [1, 3],
      startT: 0.2, endT: 0.6,
      startPoint: { x: 20, y: 0 }, endPoint: { x: 60, y: 0 },
    };
    const c = svg(
      <SegmentSewingOverlay
        zoom2D={1} pieces={[partida]} phase="a_end"
        segmentA={tramo} segmentB={null} pendingSnap={null} hoveredSnap={null}
      />,
    );
    const d = c.querySelector('path')!.getAttribute('d')!;
    const [minX, maxX] = rangoX(d);
    expect(minX).toBeCloseTo(20, 0);
    expect(maxX).toBeCloseTo(60, 0); // recortado al comando 1 se quedaba en 30
  });
});
