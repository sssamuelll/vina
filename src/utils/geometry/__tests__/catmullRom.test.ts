import { describe, it, expect } from 'vitest';
import type { Point2D } from '../../../types/types';
import { chainHandles, contextFor, segmentHandles, phantomEnd } from '../catmullRom';

/** Punto de un bezier cúbico en t. */
function bezierAt(p1: Point2D, c1: Point2D, c2: Point2D, p2: Point2D, t: number): Point2D {
  const u = 1 - t;
  return {
    x: u * u * u * p1.x + 3 * u * u * t * c1.x + 3 * u * t * t * c2.x + t * t * t * p2.x,
    y: u * u * u * p1.y + 3 * u * u * t * c1.y + 3 * u * t * t * c2.y + t * t * t * p2.y,
  };
}

const sub = (a: Point2D, b: Point2D): Point2D => ({ x: a.x - b.x, y: a.y - b.y });
const cross = (a: Point2D, b: Point2D) => a.x * b.y - a.y * b.x;
const norm = (a: Point2D) => Math.hypot(a.x, a.y);

/** Ángulo entre dos vectores, en grados. */
const angleBetween = (a: Point2D, b: Point2D) =>
  (Math.acos(Math.max(-1, Math.min(1, (a.x * b.x + a.y * b.y) / (norm(a) * norm(b))))) * 180) / Math.PI;

describe('catmullRom — spline interpolante (nota de María #197)', () => {
  const arc: Point2D[] = [
    { x: 0, y: 0 },
    { x: 30, y: -25 },
    { x: 70, y: -30 },
    { x: 100, y: 0 },
  ];

  it('la curva PASA por cada punto — eso es lo que la distingue de un bezier', () => {
    // El punto de curva de un patronista está SOBRE la línea. Si la curva sólo
    // se aproximara a él, el modelo entero estaría mal.
    const handles = chainHandles(arc);
    for (let i = 0; i < arc.length - 1; i++) {
      const [c1, c2] = handles[i];
      const start = bezierAt(arc[i], c1, c2, arc[i + 1], 0);
      const end = bezierAt(arc[i], c1, c2, arc[i + 1], 1);
      expect(start.x).toBeCloseTo(arc[i].x, 9);
      expect(start.y).toBeCloseTo(arc[i].y, 9);
      expect(end.x).toBeCloseTo(arc[i + 1].x, 9);
      expect(end.y).toBeCloseTo(arc[i + 1].y, 9);
    }
  });

  it('no hay pico en los puntos interiores: las tangentes entran y salen paralelas', () => {
    // G1. Sin esto, "curva por puntos" sería una polilínea con esquinas y
    // cualquier patronista lo vería al primer vistazo.
    const handles = chainHandles(arc);
    for (let i = 1; i < arc.length - 1; i++) {
      const incoming = sub(arc[i], handles[i - 1][1]); // del cp2 previo al ancla
      const outgoing = sub(handles[i][0], arc[i]);     // del ancla al cp1 siguiente
      expect(angleBetween(incoming, outgoing), `pico en el punto ${i}`).toBeCloseTo(0, 6);
    }
  });

  it('puntos alineados dan una recta — sin panza', () => {
    // Es lo que ve María justo después de convertir un lado: la curva ya existe
    // pero todavía dibuja la recta. Si aquí hubiera panza, convertir movería el
    // patrón sola, que es exactamente lo que no puede pasar.
    const straight: Point2D[] = [
      { x: 0, y: 0 }, { x: 25, y: 0 }, { x: 50, y: 0 }, { x: 75, y: 0 }, { x: 100, y: 0 },
    ];
    const handles = chainHandles(straight);
    for (let i = 0; i < handles.length; i++) {
      for (const cp of handles[i]) {
        expect(cp.y, `el manejador ${i} se sale de la recta`).toBeCloseTo(0, 9);
        expect(cp.x).toBeGreaterThanOrEqual(straight[i].x - 1e-9);
        expect(cp.x).toBeLessThanOrEqual(straight[i + 1].x + 1e-9);
      }
    }
  });

  it('la parametrización centrípeta no hace lazos cuando dos puntos se juntan', () => {
    // El caso real: arrastra un punto de curva casi encima de su vecino. Con
    // Catmull-Rom uniforme (α=0) el tramo se sale y vuelve, dibujando un rizo.
    const pinched: Point2D[] = [
      { x: 0, y: 0 }, { x: 50, y: 40 }, { x: 51, y: 40.2 }, { x: 100, y: 0 },
    ];
    const handles = chainHandles(pinched);
    // Un lazo se delata porque la curva se aleja del par de puntos mucho más
    // que la propia separación entre ellos.
    const [c1, c2] = handles[1];
    const span = norm(sub(pinched[2], pinched[1]));
    for (const cp of [c1, c2]) {
      const away = Math.min(norm(sub(cp, pinched[1])), norm(sub(cp, pinched[2])));
      expect(away, 'el manejador se dispara: hay rizo').toBeLessThan(span * 2);
    }
  });

  it('un tramo por sí solo no se dobla hacia el lado equivocado', () => {
    // Con los cuatro puntos del arco, el tramo del medio abomba hacia arriba
    // (y negativa), igual que sus vecinos. Un signo invertido en la tangente
    // daría una S donde debería haber un arco.
    const [c1, c2] = segmentHandles(arc[0], arc[1], arc[2], arc[3]);
    expect(c1.y).toBeLessThan(0);
    expect(c2.y).toBeLessThan(0);
    // Y ambos controles caen del mismo lado de la cuerda.
    const chord = sub(arc[2], arc[1]);
    expect(Math.sign(cross(chord, sub(c1, arc[1])))).toBe(Math.sign(cross(chord, sub(c2, arc[1]))));
  });

  it('en cadena abierta el extremo arranca recto, no con latigazo', () => {
    const ghost = phantomEnd({ x: 0, y: 0 }, { x: 10, y: 5 });
    expect(ghost).toEqual({ x: -10, y: -5 });

    const [p0, p1, p2, p3] = contextFor(arc, 0, false);
    expect(p1).toEqual(arc[0]);
    expect(p2).toEqual(arc[1]);
    expect(p3).toEqual(arc[2]);
    expect(p0).toEqual(phantomEnd(arc[0], arc[1]));
  });

  it('en cadena cerrada el contexto da la vuelta', () => {
    const [p0, , , p3] = contextFor(arc, 0, true);
    expect(p0).toEqual(arc[arc.length - 1]);
    expect(p3).toEqual(arc[2]);
    // Cerrada tiene un tramo más: el que vuelve al principio.
    expect(chainHandles(arc, true)).toHaveLength(arc.length);
    expect(chainHandles(arc, false)).toHaveLength(arc.length - 1);
  });

  it('puntos duplicados no producen NaN', () => {
    // Un doble clic torpe, o el vértice duplicado que escribe CLO en cada
    // esquina. Sin la guarda, el denominador centrípeto es 0.
    const dup: Point2D[] = [{ x: 0, y: 0 }, { x: 0, y: 0 }, { x: 50, y: 20 }, { x: 100, y: 0 }];
    for (const [c1, c2] of chainHandles(dup)) {
      for (const v of [c1.x, c1.y, c2.x, c2.y]) expect(Number.isFinite(v)).toBe(true);
    }
  });

  it('menos de dos puntos no da tramos', () => {
    expect(chainHandles([])).toEqual([]);
    expect(chainHandles([{ x: 1, y: 2 }])).toEqual([]);
  });
});
