// @vitest-environment jsdom
/**
 * #1068 — los puntitos de medir se quedaron en la sombra cuando la curva ya no
 * estaba ahi.
 *
 * Esto NO es deuda heredada: es una DIVISION que abri yo en el lote 3. Gire
 * `walkPoints` (la polilinea morada) y deje los marcadores leyendo
 * `edge.markers` crudo, que viene en LOCAL. Antes las dos cosas estaban mal
 * juntas y coincidian; despues, la curva en su sitio y sus propios puntos a
 * 40 mm de ella, con las etiquetas de milimetros colgando en el vacio.
 *
 * `SelectedEdgeInfo` YA trae `edge.pathPoints`, calculado con el helper y
 * comentado literalmente "for overlay dots" — el renderer lo ignoraba y
 * reinventaba la conversion a mano. El arreglo BORRA la conversion duplicada
 * en vez de anadir otra.
 *
 * El trinquete no lo vio por un rodeo nuevo: en `m.point.x + edge.piece.position.x`
 * la propiedad esta anidada Y a la derecha del `+`, y la primera rama de
 * ARITMETICA exige el operador pegado al identificador.
 *
 * Rectangulo con posicion NO nula: un cuadrado girado 90 ocupa el mismo sitio,
 * y con position (0,0) un fix que gira pero olvida trasladar pasaria igual.
 */
import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { PatternPiece } from '../../../types/types';
import type { SelectedEdgeInfo } from '../useMeasureTool';
import MeasureToolOverlay from '../renderers/overlays/MeasureToolOverlay';

/** 100 x 40 en local; centro del bbox (50, 20); desplazada a (200, 100). */
const pieza = (rotation: number) => ({
  id: 'p1', name: 'Delantero',
  outline: [
    { type: 'M', values: [0, 0] },
    { type: 'L', values: [100, 0] },
    { type: 'L', values: [100, 40] },
    { type: 'L', values: [0, 40] },
    { type: 'Z', values: [] },
  ],
  position: { x: 200, y: 100 }, rotation,
  mirrored: false, seamAllowance: 0, internals: [], edges: [],
}) as unknown as PatternPiece;

/** Tres marcadores sobre el borde local (0,0)->(100,0). */
const MARCADORES_LOCALES = [
  { point: { x: 0, y: 0 }, distance: 0 },
  { point: { x: 50, y: 0 }, distance: 50 },
  { point: { x: 100, y: 0 }, distance: 100 },
];

/**
 * Girado 90 sobre (50,20) y desplazado a (200,100), ese borde se ve como la
 * vertical x=270, de y=70 a y=170. Calculado a mano, no con el helper: un
 * esperado que llama a la misma funcion que el codigo bajo prueba no prueba
 * nada.
 */
const VISTOS = [
  { x: 270, y: 70 },
  { x: 270, y: 120 },
  { x: 270, y: 170 },
];

function edgeInfo(rotation: number, pathPoints: { x: number; y: number }[]): SelectedEdgeInfo {
  return {
    pieceId: 'p1',
    piece: pieza(rotation),
    edge: { segmentRange: [1, 1] },
    arcLength: 100,
    markers: MARCADORES_LOCALES,
    pathPoints,
    walkPoints: pathPoints,
  } as unknown as SelectedEdgeInfo;
}

/**
 * Los marcadores son los circulos que cuelgan de un `<g transform=translate>`.
 * El cuarto circulo del overlay —el que recorre la curva con `animateMotion`—
 * no lleva grupo con transform, y por eso se cae de esta lista.
 */
function posicionesDeLosPuntos(container: HTMLElement): { x: number; y: number }[] {
  return Array.from(container.querySelectorAll('circle'))
    .map(c => /translate\(\s*([-\d.]+)\s*,\s*([-\d.]+)\s*\)/
      .exec(c.parentElement?.getAttribute('transform') ?? ''))
    .filter((m): m is RegExpExecArray => m !== null)
    .map(m => ({ x: Number(m[1]), y: Number(m[2]) }));
}

function pintar(edge: SelectedEdgeInfo) {
  return render(
    <svg>
      <MeasureToolOverlay
        zoom2D={1}
        measurements={[]}
        currentStart={null}
        cursorPos={null}
        hoveredSnapPoint={null}
        formatDistance={(d: number) => `${d.toFixed(0)} mm`}
        measureMode="along-curve"
        selectedEdge={edge}
      />
    </svg>,
  );
}

describe('#1068 — los marcadores de medir sobre una pieza girada', () => {
  it('los puntitos caen donde la curva SE VE', () => {
    // Sin el fix salen en (200,100), (250,100) y (300,100): la horizontal
    // sin girar, a 50 mm de la polilinea que dicen marcar.
    const { container } = pintar(edgeInfo(90, VISTOS));
    const puntos = posicionesDeLosPuntos(container);
    expect(puntos).toHaveLength(3);
    puntos.forEach((p, i) => {
      expect(p.x).toBeCloseTo(VISTOS[i].x, 3);
      expect(p.y).toBeCloseTo(VISTOS[i].y, 3);
    });
  });

  it('cada puntito cae SOBRE la polilinea, no al lado', () => {
    // La propiedad que la usuaria ve: el punto y la curva son la misma cosa.
    const { container } = pintar(edgeInfo(90, VISTOS));
    const linea = container.querySelector('polyline')!;
    const dePolilinea = (linea.getAttribute('points') ?? '')
      .trim().split(/\s+/).map(par => {
        const [x, y] = par.split(',').map(Number);
        return { x, y };
      });
    const puntos = posicionesDeLosPuntos(container);
    for (const p of puntos) {
      const cerca = dePolilinea.some(q => Math.hypot(q.x - p.x, q.y - p.y) < 1e-6);
      expect(cerca).toBe(true);
    }
  });

  it('sin rotacion se comporta igual que siempre', () => {
    const sinGirar = [
      { x: 200, y: 100 },
      { x: 250, y: 100 },
      { x: 300, y: 100 },
    ];
    const { container } = pintar(edgeInfo(0, sinGirar));
    const puntos = posicionesDeLosPuntos(container);
    puntos.forEach((p, i) => {
      expect(p.x).toBeCloseTo(sinGirar[i].x, 3);
      expect(p.y).toBeCloseTo(sinGirar[i].y, 3);
    });
  });
});
