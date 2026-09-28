import { describe, it, expect } from 'vitest';
import { restringirAHoja45, restringirA45, guiasShift, enderezarDesplazamiento } from '../restriccionShift';
import { relativeAngle, type AngleReference } from '../angleReference';
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

/**
 * Shift dos veces (spec 2026-09-23): la misma regla en un marco girado —el
 * borde o el tramo que da la píldora— y las dos guías que se pintan, de una
 * sola función.
 */
// El costado de la escena firmada: dirección 1:3 recorrida en el sentido
// corregido (deja la pieza a +90°), el que devuelve `borderReference`.
const COSTADO: AngleReference = { kind: 'border', baseDeg: polarOf({ x: 0, y: 0 }, { x: -60, y: -180 }).angleDeg };
const DESDE = { x: 430, y: 240 };
const CURSOR = { x: 291, y: 276 };

describe('restringirA45 — un marco girado', () => {
  it('con base 0 es exactamente la hoja', () => {
    expect(restringirA45(DESDE, CURSOR, 0)).toEqual(restringirAHoja45(DESDE, CURSOR));
  });

  it('desde el costado, el rumbo de 86° al borde sale a 90,0° exactos', () => {
    const p = restringirA45(DESDE, CURSOR, COSTADO.baseDeg);
    expect(relativeAngle(polarOf(DESDE, p).angleDeg, COSTADO)).toBeCloseTo(90, 9);
  });

  it('una base múltiplo de 45° usa los vectores exactos de la hoja', () => {
    expect(restringirA45({ x: 0, y: 0 }, { x: 100, y: 3 }, 90)).toEqual({ x: 100, y: 0 });
  });

  it('el desplazamiento de Q gira con la misma base', () => {
    const d = enderezarDesplazamiento({ x: CURSOR.x - DESDE.x, y: CURSOR.y - DESDE.y }, COSTADO.baseDeg);
    expect(relativeAngle(polarOf({ x: 0, y: 0 }, d).angleDeg, COSTADO)).toBeCloseTo(90, 9);
  });
});

describe('guiasShift — el punto y lo que se pinta salen de lo mismo', () => {
  it('Shift una vez: activa la hoja, tenue el borde', () => {
    const g = guiasShift(DESDE, CURSOR, COSTADO, false);
    expect(g.punto).toEqual(restringirAHoja45(DESDE, CURSOR));
    expect(g.activa).toEqual({ desde: DESDE, angleDeg: 180 });
    expect(relativeAngle(g.tenue!.angleDeg, COSTADO)).toBeCloseTo(90, 9);
  });

  it('Shift dos veces invierte: activa el borde, tenue la hoja', () => {
    const g = guiasShift(DESDE, CURSOR, COSTADO, true);
    expect(relativeAngle(g.activa!.angleDeg, COSTADO)).toBeCloseTo(90, 9);
    expect(g.tenue).toEqual({ desde: DESDE, angleDeg: 180 });
    expect(relativeAngle(polarOf(DESDE, g.punto).angleDeg, COSTADO)).toBeCloseTo(90, 9);
  });

  it('marcos coincidentes: una sola guía', () => {
    expect(guiasShift(DESDE, CURSOR, { kind: 'absolute', baseDeg: 0 }, true).tenue).toBeNull();
    expect(guiasShift(DESDE, CURSOR, { kind: 'border', baseDeg: -90 }, false).tenue).toBeNull();
  });

  it('con el cursor sobre el origen no hay dirección que pintar', () => {
    expect(guiasShift(DESDE, DESDE, COSTADO, true)).toEqual({ punto: DESDE, activa: null, tenue: null });
  });
});
