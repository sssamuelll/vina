/**
 * slicePolylineByT — recorte por fracción de arco de la polilínea de un edge.
 *
 * Consumidor: SeamRenderer (#1022). Un seam parcial (tStart/tEnd) debe
 * PINTARSE sobre el sub-tramo cosido, no sobre el borde entero — si no, el
 * fix del segment sewing es visualmente mudo (el solver cose el tramo pero
 * el 2D enseña la línea completa).
 */
import { describe, it, expect } from 'vitest';
import { slicePolylineByT } from '../index';

const straight = [
  { x: 0, y: 0 },
  { x: 100, y: 0 },
];

// Dos segmentos de largos 60 + 40 con vértice interior en (60,0).
const bent = [
  { x: 0, y: 0 },
  { x: 60, y: 0 },
  { x: 100, y: 0 },
];

describe('slicePolylineByT', () => {
  it('rango completo [0,1] devuelve la polilínea intacta', () => {
    expect(slicePolylineByT(straight, 0, 1)).toEqual(straight);
  });

  it('recorta un segmento recto por fracción de arco con extremos interpolados', () => {
    expect(slicePolylineByT(straight, 0.25, 0.75)).toEqual([
      { x: 25, y: 0 },
      { x: 75, y: 0 },
    ]);
  });

  it('conserva los vértices interiores dentro del rango', () => {
    // Arco total 100: [0.25,0.75] → 25..75, el vértice (60,0) queda dentro.
    expect(slicePolylineByT(bent, 0.25, 0.75)).toEqual([
      { x: 25, y: 0 },
      { x: 60, y: 0 },
      { x: 75, y: 0 },
    ]);
  });

  it('un extremo del rango que cae SOBRE un vértice no lo duplica', () => {
    expect(slicePolylineByT(bent, 0.6, 1)).toEqual([
      { x: 60, y: 0 },
      { x: 100, y: 0 },
    ]);
  });

  it('polilínea degenerada (largo cero) vuelve intacta, sin NaN', () => {
    const dot = [{ x: 5, y: 5 }, { x: 5, y: 5 }];
    expect(slicePolylineByT(dot, 0.2, 0.8)).toEqual(dot);
  });
});
