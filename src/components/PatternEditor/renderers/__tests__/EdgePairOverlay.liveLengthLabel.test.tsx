// @vitest-environment jsdom
/**
 * Tanda 1 de arreglos (#1029), punto 3: "el momento del descubrimiento" — el
 * diseño define la fase de arrastre como arco resaltado + número en mm junto
 * al cursor. El arco existía (Tarea 3); el número nunca se pintó en ninguna
 * parte de la rama.
 *
 * `sewnLengthMm` (seamRange.ts) ya hace la cuenta; el largo del borde vive en
 * `piece.edges[].length`, resuelto por RANGO de comando (el `EdgeTarget` del
 * gesto no trae `edgeName`, solo `edgeRange` — la misma unidad que produce
 * `edgeRangeForCommand`).
 */
import { describe, it, expect, afterEach } from 'vitest';
import { render, cleanup } from '@testing-library/react';
import EdgePairOverlay from '../overlays/EdgePairOverlay';
import type { PatternPiece } from '../../../../types/types';
import type { EdgeTarget } from '../../edgeGesture';

afterEach(cleanup);

// Borde recto de x=0 a x=100 con largo semántico conocido (100mm) — un t
// lineal cae en x = t*100, así que la posición del número se lee directo del
// atributo `transform` del <text>, sin decodificar curvas.
const rectaConEdges = {
  id: 'p-recta',
  name: 'Recta',
  outline: [
    { type: 'M', values: [0, 0] },
    { type: 'L', values: [100, 0] },   // edge 1: el borde bajo prueba
    { type: 'L', values: [100, 100] },
    { type: 'Z', values: [] },
  ],
  edges: [
    { id: 'e1', name: 'top', segmentRange: [1, 2], edgeType: 'seam', length: 100 },
  ],
  position: { x: 0, y: 0 },
  rotation: 0, mirrored: false, seamAllowance: 0, internals: [],
  layer: 1, sublayer: 0, active: true, createdAt: 0, updatedAt: 0,
} as unknown as PatternPiece;

// Misma geometría pero SIN `edges` — el largo no resuelve (borde dibujado a
// mano, legacy "edge-N" sin SemanticEdge).
const rectaSinEdges = {
  ...rectaConEdges,
  id: 'p-recta-sin-edges',
  edges: undefined,
} as unknown as PatternPiece;

function svg(node: React.ReactElement) {
  const { container } = render(<svg>{node}</svg>);
  return container;
}

/** El texto del número en mm, o null si no se pintó ninguno. */
function mmLabelText(c: Element): string | null {
  return c.querySelector('.live-length-label text')?.textContent ?? null;
}

/** X del <g> que porta el número (leído de su `transform: translate(x, y)`). */
function mmLabelX(c: Element): number | null {
  const g = c.querySelector('.live-length-label');
  const t = g?.getAttribute('transform');
  const m = t?.match(/translate\(([-\d.]+)/);
  return m ? parseFloat(m[1]) : null;
}

describe('EdgePairOverlay — el número en mm durante el arrastre vivo', () => {
  it('arrastre hacia adelante (t creciente): pinta "50.0 mm" en el extremo del cursor (t=0.75 → x≈75)', () => {
    const target: EdgeTarget = {
      pieceId: 'p-recta', edgeIndex: 1, edgeRange: [1, 2], t: 0.25, point: { x: 25, y: 0 },
    };
    const c = svg(
      <EdgePairOverlay
        zoom2D={1} pieces={[rectaConEdges]} segmentA={null}
        hoveredTarget={target} activeTarget={target} liveRange={[0.25, 0.75]}
      />,
    );
    expect(mmLabelText(c)).toBe('50.0 mm');
    expect(mmLabelX(c)).toBeCloseTo(75, 0);
  });

  it('arrastre hacia atrás (t decreciente): el press fue el extremo SUPERIOR — el número sigue al cursor en t=0.25, no en t=0.75', () => {
    // El press fue en t=0.75 (bajó hasta t=0.25); `liveRange` siempre sale
    // ordenado ascendente [0.25, 0.75], así que "el final del arco" (t=0.75)
    // NO es donde está el cursor en este caso — es donde apretó.
    const target: EdgeTarget = {
      pieceId: 'p-recta', edgeIndex: 1, edgeRange: [1, 2], t: 0.75, point: { x: 75, y: 0 },
    };
    const c = svg(
      <EdgePairOverlay
        zoom2D={1} pieces={[rectaConEdges]} segmentA={null}
        hoveredTarget={target} activeTarget={target} liveRange={[0.25, 0.75]}
      />,
    );
    expect(mmLabelText(c)).toBe('50.0 mm');
    expect(mmLabelX(c)).toBeCloseTo(25, 0);
  });

  it('un decimal exacto, sin redondear a entero (33.3, no 33)', () => {
    const target: EdgeTarget = {
      pieceId: 'p-recta', edgeIndex: 1, edgeRange: [1, 2], t: 0.123, point: { x: 12.3, y: 0 },
    };
    const c = svg(
      <EdgePairOverlay
        zoom2D={1} pieces={[rectaConEdges]} segmentA={null}
        hoveredTarget={target} activeTarget={target} liveRange={[0.123, 0.456]}
      />,
    );
    expect(mmLabelText(c)).toBe('33.3 mm');
  });

  it('sin liveRange (hover, fuera de gesto) NO pinta ningún número', () => {
    const target: EdgeTarget = {
      pieceId: 'p-recta', edgeIndex: 1, edgeRange: [1, 2], t: 0.25, point: { x: 25, y: 0 },
    };
    const c = svg(
      <EdgePairOverlay
        zoom2D={1} pieces={[rectaConEdges]} segmentA={null}
        hoveredTarget={target} activeTarget={null} liveRange={null}
      />,
    );
    expect(mmLabelText(c)).toBeNull();
  });

  it('borde sin largo resuelto: no pinta nada — sin NaN en pantalla, sin cero falso', () => {
    const target: EdgeTarget = {
      pieceId: 'p-recta-sin-edges', edgeIndex: 1, edgeRange: [1, 2], t: 0.25, point: { x: 25, y: 0 },
    };
    const c = svg(
      <EdgePairOverlay
        zoom2D={1} pieces={[rectaSinEdges]} segmentA={null}
        hoveredTarget={target} activeTarget={target} liveRange={[0.25, 0.75]}
      />,
    );
    expect(mmLabelText(c)).toBeNull();
  });

  it('escala con el zoom: el fontSize del <text> es 10/zoom2D', () => {
    const target: EdgeTarget = {
      pieceId: 'p-recta', edgeIndex: 1, edgeRange: [1, 2], t: 0.25, point: { x: 25, y: 0 },
    };
    const c = svg(
      <EdgePairOverlay
        zoom2D={2} pieces={[rectaConEdges]} segmentA={null}
        hoveredTarget={target} activeTarget={target} liveRange={[0.25, 0.75]}
      />,
    );
    const text = c.querySelector('.live-length-label text')!;
    expect(text.getAttribute('font-size')).toBe(String(10 / 2));
  });
});
