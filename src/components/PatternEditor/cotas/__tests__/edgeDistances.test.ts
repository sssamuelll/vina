/**
 * `edgeDistances` (spec 2026-08-30 § 4.1, con el arreglo de la revisión
 * adversarial #2): para un extremo de línea interna que cae sobre el
 * contorno, cuánto mide el arco hasta cada una de las dos esquinas
 * adyacentes. `cw` es la esquina ANTERIOR en el orden almacenado del
 * contorno (caminar hacia adelante desde ella llega al punto); `ccw` es la
 * esquina SIGUIENTE (caminar hacia atrás desde ella llega al punto) —
 * `notchAnchor.ts`: "`cw` follows the stored vertex order... `ccw` runs
 * against it".
 */
import { describe, it, expect } from 'vitest';
import type { PathCommand } from '../../../../types/types';
import { edgeDistances } from '../edgeDistances';
import { outlinePerimeter } from '../../../../utils/notchAnchor';

/** Rectángulo 100×60 en coordenadas LOCALES de pieza: M(0,0) L(100,0) L(100,60) L(0,60) Z. */
const RECT: PathCommand[] = [
  { type: 'M', values: [0, 0] },
  { type: 'L', values: [100, 0] },
  { type: 'L', values: [100, 60] },
  { type: 'L', values: [0, 60] },
  { type: 'Z', values: [] },
];

describe('edgeDistances — el arco desde cada esquina vecina', () => {
  it('extremo sobre el lado de cierre (0,20): 40mm de la esquina anterior, 20 de la siguiente', () => {
    const r = edgeDistances(RECT, { x: 0, y: 20 });
    expect(r).not.toBeNull();
    expect(r!.cw.corner).toEqual({ x: 0, y: 60 });
    expect(r!.cw.mm).toBeCloseTo(40, 6);
    expect(r!.ccw.corner).toEqual({ x: 0, y: 0 });
    expect(r!.ccw.mm).toBeCloseTo(20, 6);
    // Las dos distancias suman el lado completo (60mm).
    expect(r!.cw.mm + r!.ccw.mm).toBeCloseTo(60, 6);
  });

  it('extremo sobre el lado superior (50,60): a mitad de camino, 50 y 50', () => {
    const r = edgeDistances(RECT, { x: 50, y: 60 });
    expect(r).not.toBeNull();
    expect(r!.cw.corner).toEqual({ x: 100, y: 60 });
    expect(r!.cw.mm).toBeCloseTo(50, 6);
    expect(r!.ccw.corner).toEqual({ x: 0, y: 60 });
    expect(r!.ccw.mm).toBeCloseTo(50, 6);
  });

  it('extremo exactamente en una esquina: ninguna de las dos distancias es cero (las vecinas cuentan, no la propia)', () => {
    // En (100,0): la esquina propia no cuenta como "vecina de sí misma".
    const r = edgeDistances(RECT, { x: 100, y: 0 });
    expect(r).not.toBeNull();
    expect(r!.cw.mm).toBeGreaterThan(0);
    expect(r!.ccw.mm).toBeGreaterThan(0);
  });

  it('extremo interior (no sobre el contorno): sin cotas de borde', () => {
    expect(edgeDistances(RECT, { x: 50, y: 30 })).toBeNull();
  });

  it('pieza con un lado curvo: la suma de arcos coincide con outlinePerimeter (metric 2, no la cuerda)', () => {
    // M(0,0) → curva hasta (100,0) → recta → recta → cierra. El punto está en
    // la recta de abajo-derecha a arriba-derecha (100,0)-(100,60): a 20mm de (100,0).
    const outline: PathCommand[] = [
      { type: 'M', values: [0, 0] },
      { type: 'C', values: [30, -20, 70, -20, 100, 0] },
      { type: 'L', values: [100, 60] },
      { type: 'L', values: [0, 60] },
      { type: 'Z', values: [] },
    ];
    const r = edgeDistances(outline, { x: 100, y: 20 });
    expect(r).not.toBeNull();
    expect(r!.ccw.mm).toBeCloseTo(40, 3); // hacia (100,60), en línea recta
    // La suma total de las 4 esquinas alrededor del anillo tiene que dar el
    // perímetro completo (arco de la curva, no su cuerda de 100mm).
    const total = outlinePerimeter(outline, 2);
    const ladoSuperior = 100; // (100,60)-(0,60)
    const ladoIzquierdo = 60; // (0,60)-(0,0)
    expect(r!.cw.mm + r!.ccw.mm + ladoSuperior + ladoIzquierdo).toBeCloseTo(total, 3);
  });

  it('pieza girada: trabaja en coordenadas LOCALES, la rotación no la toca (mismo resultado que sin girar)', () => {
    // edgeDistances recibe el outline y el endpoint ya en local — girar la
    // pieza en el store no cambia esos números.
    const r1 = edgeDistances(RECT, { x: 0, y: 20 });
    const r2 = edgeDistances(RECT, { x: 0, y: 20 });
    expect(r2).toEqual(r1);
  });

  it('escribir una distancia nueva: pointAt cae sobre el borde y projectToRing lo confirma', () => {
    const r = edgeDistances(RECT, { x: 0, y: 20 })!;
    const nuevo = r.cw.write(50); // 50mm hacia adelante desde (0,60)
    expect(nuevo).not.toBeNull();
    // 50mm desde (0,60) caminando en orden almacenado (hacia (0,0)) es (0,10).
    expect(nuevo!.x).toBeCloseTo(0, 3);
    expect(nuevo!.y).toBeCloseTo(10, 3);
    const confirmado = edgeDistances(RECT, nuevo!);
    expect(confirmado).not.toBeNull();
  });

  it('contorno con más de un subpath (import DXF, #1092 ronda 2): sin cotas de borde', () => {
    const dosSubpaths: PathCommand[] = [
      { type: 'M', values: [0, 0] }, { type: 'L', values: [100, 0] },
      { type: 'L', values: [100, 60] }, { type: 'L', values: [0, 60] }, { type: 'Z', values: [] },
      { type: 'M', values: [500, 500] }, { type: 'L', values: [600, 500] },
      { type: 'L', values: [600, 600] }, { type: 'Z', values: [] },
    ];
    expect(edgeDistances(dosSubpaths, { x: 0, y: 20 })).toBeNull();
  });

  it('contorno con comandos H/V/A (válidos en el esquema, sin recorrido): sin cotas de borde', () => {
    const conArco: PathCommand[] = [
      { type: 'M', values: [0, 0] },
      { type: 'A', values: [50, 50, 0, 0, 1, 100, 0] },
      { type: 'L', values: [100, 60] },
      { type: 'L', values: [0, 60] },
      { type: 'Z', values: [] },
    ];
    expect(edgeDistances(conArco, { x: 100, y: 20 })).toBeNull();
  });
});
