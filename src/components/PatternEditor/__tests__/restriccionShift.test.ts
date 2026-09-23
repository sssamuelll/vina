import { describe, it, expect } from 'vitest';
import { restringirAHoja45 } from '../restriccionShift';
import { polarOf, polarPoint } from '../polyPenGeometry';

/**
 * Firma de María del 23-09 (opción B): Shift endereza respecto a la HOJA —
 * horizontal, vertical o diagonal— sea cual sea el borde del que sale la
 * línea: «todas siempre parten de unas perpendiculares que son las que envuelven
 * el cuerpo».
 */
describe('restringirAHoja45', () => {
  const origen = { x: 100, y: 200 };

  it.each([
    [86.1, 90],
    [71.6, 90],
    [30, 45],
    [20, 0],
    [-20, 0],
    [-30, -45],
    [-108.4, -90],
    [170, 180],
    [-170, 180],
    [135.2, 135],
  ])('un rumbo de %s° queda en %s°', (rumbo, esperado) => {
    const cursor = polarPoint(origen, 150, rumbo);
    const { angleDeg } = polarOf(origen, restringirAHoja45(origen, cursor));
    // ±180 son la misma dirección; `polarOf` puede devolver cualquiera de los dos.
    const normalizado = Math.abs(angleDeg) === 180 ? 180 : angleDeg;
    expect(normalizado).toBeCloseTo(esperado, 9);
  });

  it('el largo es la proyección del cursor sobre la dirección elegida', () => {
    const cursor = polarPoint(origen, 150, 80);
    const { lengthMm } = polarOf(origen, restringirAHoja45(origen, cursor));
    expect(lengthMm).toBeCloseTo(150 * Math.cos((10 * Math.PI) / 180), 9);
  });

  it('una línea horizontal queda exactamente horizontal: la y no se mueve ni una centésima', () => {
    const punto = restringirAHoja45(origen, { x: 260, y: 203.7 });
    expect(punto.y).toBe(origen.y);
    expect(punto.x).toBeCloseTo(260, 9);
  });

  it('una vertical queda exactamente vertical', () => {
    const punto = restringirAHoja45(origen, { x: 98.2, y: 80 });
    expect(punto.x).toBe(origen.x);
    expect(punto.y).toBeCloseTo(80, 9);
  });

  it('el cursor encima del origen no inventa un rumbo', () => {
    expect(restringirAHoja45(origen, { ...origen })).toEqual(origen);
  });
});
