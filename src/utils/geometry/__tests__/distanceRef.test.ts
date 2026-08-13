/**
 * La referencia desde la que se mide una distancia, resuelta en el PRESS.
 *
 * Spec § 3.2, escalera de prioridad: gana el punto NOMBRABLE más cercano
 * dentro del radio de enganche —esquina del contorno, punto existente,
 * piquete, extremo de un tramo cosido—; si no hay ninguno, el extremo del
 * borde apretado más cercano POR ARCO.
 *
 * La razón no es de gusto, y está en el spec: "Una distancia medida desde un
 * punto anónimo de una curva no es una cantidad de patronaje: no se re-deriva,
 * no se re-edita, y el ancla se rompe en cuanto el contorno se mueve."
 *
 * Dos decisiones de forma que vienen del review adversarial:
 *
 *  - Un nodo del contorno es candidato **sea cual sea el tipo de su comando**.
 *    El primer borrador filtraba a `M`/`L` copiando el filtro de
 *    `findNearestOutlineVertex`, y así el extremo de una `C` —el final de una
 *    sisa, que es de los puntos más nombrables que hay en un patrón— quedaba
 *    fuera.
 *  - Los extremos de tramo cosido entran como candidatos EXTRA que pasa quien
 *    llama. Las costuras viven en el proyecto, no en la pieza; hacer que este
 *    módulo las buscara ataría la geometría al modelo de datos del cosido.
 */
import { describe, it, expect } from 'vitest';
import type { PathCommand, PatternPiece } from '../../../types/types';
import { buildRing, projectToRing } from '../outlineRing';
import { resolveDistanceRef } from '../distanceRef';

const OUTLINE: PathCommand[] = [
  { type: 'M', values: [0, 0] },
  { type: 'L', values: [100, 0] },
  { type: 'C', values: [130, 60, 120, 140, 100, 200] },
  { type: 'L', values: [0, 200] },
  { type: 'Z', values: [] },
];

const ok = <T>(r: { ok: true; value: T } | { ok: false }): T => {
  if (!r.ok) throw new Error('se esperaba ok:true');
  return r.value;
};

const ring = ok(buildRing(OUTLINE, 2));

/** El borde de arriba: de (0,0) a (100,0), o sea [0, 100] de arco. */
const BORDE_ARRIBA: [number, number] = [0, 100];

/** El costado curvo: del final del borde de arriba al final de la `C`. */
const FIN_CURVA = projectToRing(ring, { x: 100, y: 200 }).distanceMm;
const BORDE_CURVO: [number, number] = [100, FIN_CURVA];

const pieza = (over: Partial<PatternPiece> = {}): PatternPiece => ({
  id: 'p', name: 'p', outline: OUTLINE, position: { x: 0, y: 0 }, rotation: 0,
  seamAllowance: 0, internals: [], ...over,
} as PatternPiece);

describe('resolveDistanceRef', () => {
  it('una esquina a tiro gana, y se declara nombrable', () => {
    const ref = resolveDistanceRef(ring, pieza(), { x: 95, y: 0 }, BORDE_ARRIBA, 12);
    expect(ref.kind).not.toBe('edgeEnd');
    expect(ref.point.x).toBeCloseTo(100, 6);
    expect(ref.point.y).toBeCloseTo(0, 6);
  });

  it('sin nada nombrable cerca, cae al extremo del borde apretado', () => {
    // Mitad del borde de arriba: las dos esquinas están a 50 mm, muy fuera
    // de los 12 de enganche.
    const ref = resolveDistanceRef(ring, pieza(), { x: 50, y: 0 }, BORDE_ARRIBA, 12);
    expect(ref.kind).toBe('edgeEnd');
    expect([0, 100]).toContain(Math.round(ref.distanceMm));
  });

  it('la caída al extremo se mide por ARCO, no en línea recta', () => {
    // El press está elegido con un oráculo, no a ojo, porque es el único
    // punto de esta figura donde las dos formas de medir DISCREPAN: desde
    // (120,100), por ARCO gana el final del borde y en LÍNEA RECTA ganaría el
    // principio. Una implementación que comparase cuerdas devolvería 100.
    //
    // El primer intento de este test ponía el press en (104,190), que está a
    // 10,77 mm del nodo final de la curva — dentro del radio de enganche, así
    // que ni siquiera llegaba al fallback. Y además tampoco discriminaba: en
    // esa zona el arco y la cuerda eligen el mismo extremo.
    const ref = resolveDistanceRef(ring, pieza(), { x: 120, y: 100 }, BORDE_CURVO, 12);
    expect(ref.kind).toBe('edgeEnd');
    expect(ref.distanceMm).toBeCloseTo(FIN_CURVA, 3);
    expect(ref.distanceMm).not.toBeCloseTo(100, 3);
  });

  it('el extremo de un comando C es candidato — no solo los M y L', () => {
    // (100,200) es el final de la curva. Un press a 4 mm de ahí tiene que
    // engancharlo, no caer al extremo del borde por descarte.
    const ref = resolveDistanceRef(ring, pieza(), { x: 100, y: 196 }, BORDE_CURVO, 12);
    expect(ref.point.x).toBeCloseTo(100, 6);
    expect(ref.point.y).toBeCloseTo(200, 6);
  });

  it('un piquete existente gana si está más cerca que la esquina', () => {
    const conPiquete = pieza({
      internals: [{
        id: 'n1', type: 'notch',
        path: [{ type: 'M', values: [60, 0] }, { type: 'L', values: [60, 6] }],
      }],
    } as Partial<PatternPiece>);
    const ref = resolveDistanceRef(ring, conPiquete, { x: 62, y: 0 }, BORDE_ARRIBA, 12);
    expect(ref.kind).toBe('notch');
    expect(ref.distanceMm).toBeCloseTo(60, 3);
  });

  it('los candidatos EXTRA del llamador compiten como los demás', () => {
    // Es la vía de los extremos de tramo cosido: los sabe quien llama.
    const ref = resolveDistanceRef(
      ring, pieza(), { x: 42, y: 0 }, BORDE_ARRIBA, 12,
      [{ point: { x: 40, y: 0 }, kind: 'seamEnd' }],
    );
    expect(ref.kind).toBe('seamEnd');
    expect(ref.distanceMm).toBeCloseTo(40, 3);
  });

  it('un extra fuera del radio de enganche NO gana', () => {
    const ref = resolveDistanceRef(
      ring, pieza(), { x: 50, y: 0 }, BORDE_ARRIBA, 12,
      [{ point: { x: 20, y: 0 }, kind: 'seamEnd' }],
    );
    expect(ref.kind).toBe('edgeEnd');
  });

  it('nunca devuelve un punto anónimo de la curva', () => {
    // El invariante del § 3.2. Press en medio del costado curvo, lejos de
    // todo: tiene que caer a un extremo del borde, jamás al punto del press.
    const ref = resolveDistanceRef(ring, pieza(), { x: 122, y: 100 }, BORDE_CURVO, 12);
    expect(ref.kind).toBe('edgeEnd');
    const dist = Math.min(
      Math.abs(ref.distanceMm - BORDE_CURVO[0]),
      Math.abs(ref.distanceMm - BORDE_CURVO[1]),
    );
    expect(dist).toBeLessThan(1e-6);
  });

  it('gana el más cercano, no el primero de la lista', () => {
    const conPiquete = pieza({
      internals: [{
        id: 'n1', type: 'notch',
        path: [{ type: 'M', values: [92, 0] }, { type: 'L', values: [92, 6] }],
      }],
    } as Partial<PatternPiece>);
    // Press en 97: la esquina (100,0) está a 3, el piquete (92,0) a 5.
    const ref = resolveDistanceRef(ring, conPiquete, { x: 97, y: 0 }, BORDE_ARRIBA, 12);
    expect(ref.point.x).toBeCloseTo(100, 6);
  });

  it('el radio de enganche se respeta: a 13 mm ya no engancha', () => {
    const ref = resolveDistanceRef(ring, pieza(), { x: 87, y: 0 }, BORDE_ARRIBA, 12);
    expect(ref.kind).toBe('edgeEnd');
  });
});
