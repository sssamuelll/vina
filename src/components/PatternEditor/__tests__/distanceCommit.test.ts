/**
 * El núcleo de la familia DISTANCIA: de un arrastre a un `NotchAnchor`.
 *
 * Puro a propósito, igual que `edgeGesture.ts` es puro frente al hook que lo
 * envuelve. Aquí vive lo que se puede equivocar de verdad —el sentido, el
 * arco, el clampeo— y se prueba sin montar React.
 *
 * Spec: docs/superpowers/specs/2026-08-11-arrastre-unificado-2d-design.md
 * § 3.2 (el valor y la dirección) y § 3.4 (soltar fuera).
 */
import { describe, it, expect } from 'vitest';
import type { PathCommand } from '../../../types/types';
import { buildRing, pointAt } from '../../../utils/geometry/outlineRing';
import { resolveNotchAnchor } from '../../../utils/notchAnchor';
import type { DistanceRef } from '../../../utils/geometry/distanceRef';
import { distanceAnchorFrom } from '../distanceCommit';

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

/** La esquina (100,0): 100 mm de arco desde el origen del anillo. */
const ESQUINA: DistanceRef = { point: { x: 100, y: 0 }, distanceMm: 100, kind: 'corner' };
/** El borde recto de arriba, en distancias de anillo. */
const BORDE_ARRIBA: [number, number] = [0, 100];
/** Un piquete a mitad del borde de arriba. La dirección solo se puede probar
 *  desde una referencia INTERIOR: en un extremo no hay dos lados. */
const MEDIO: DistanceRef = { point: { x: 50, y: 0 }, distanceMm: 50, kind: 'notch' };
/** El costado curvo, desde la esquina hasta el final de la `C`. */
const FIN_CURVA = ring.totalMm - 300;
const BORDE_CURVO: [number, number] = [100, FIN_CURVA];

describe('distanceAnchorFrom', () => {
  it('la distancia es el arco entre la referencia y el release', () => {
    const a = distanceAnchorFrom(ring, ESQUINA, 70, 85, BORDE_ARRIBA);
    expect(a.distanceMm).toBeCloseTo(30, 6);
    expect(a.refPoint).toEqual({ x: 100, y: 0 });
    expect(a.metric).toBe(2);
  });

  it('sobre una curva mide el ARCO, no la cuerda', () => {
    // El bug del #1026 escrito como test: en una sisa la cuerda miente.
    //
    // 180 mm adentro de la curva a propósito, no 60. Medido con un oráculo
    // independiente (2M muestras sobre la cúbica): a 60 mm la cuerda vale
    // 59,72 — la diferencia es de 0,28 mm y el test pasaría casi con
    // cualquier implementación. A 180 la cuerda vale 176,30: 3,70 mm de
    // diferencia, que ya es un piquete puesto en otro sitio.
    const destino = 100 + 180;
    const a = distanceAnchorFrom(ring, ESQUINA, destino, 110, BORDE_CURVO);
    expect(a.distanceMm).toBeCloseTo(180, 6);

    const desde = pointAt(ring, 100).point;
    const hasta = pointAt(ring, destino).point;
    const cuerda = Math.hypot(hasta.x - desde.x, hasta.y - desde.y);
    expect(cuerda).toBeCloseTo(176.30, 1);
    expect(180 - cuerda).toBeGreaterThan(3);
  });

  it('el SENTIDO lo fija el primer cruce, no el release', () => {
    // Las dos llamadas difieren SOLO en el primer cruce y sueltan en el MISMO
    // sitio. Si la dirección saliera del release, serían iguales.
    //
    // La referencia va a mitad del borde a propósito: desde un extremo no hay
    // dos lados hacia los que arrancar, y el test no probaría nada.
    const arranqueArriba = distanceAnchorFrom(ring, MEDIO, 30, 60, BORDE_ARRIBA);
    const arranqueAbajo = distanceAnchorFrom(ring, MEDIO, 30, 40, BORDE_ARRIBA);
    expect(arranqueArriba.direction).not.toBe(arranqueAbajo.direction);
    // El VALOR es el mismo en los dos: el sentido no cambia cuánto se midió.
    expect(arranqueArriba.distanceMm).toBeCloseTo(20, 6);
    expect(arranqueAbajo.distanceMm).toBeCloseTo(20, 6);
  });

  it('sin primer cruce cae al signo del release, y no revienta', () => {
    const a = distanceAnchorFrom(ring, MEDIO, 30, null, BORDE_ARRIBA);
    expect(['cw', 'ccw']).toContain(a.direction);
    expect(a.distanceMm).toBeCloseTo(20, 6);
  });

  it('soltar más allá del extremo del borde clampea al extremo', () => {
    // El borde de arriba va de 0 a 100 y la referencia es su extremo 100.
    // Un release en -20 se clampea a 0, o sea el borde ENTERO: 100 mm justos.
    // Un `<= 100` a secas pasaría con cualquier implementación.
    const a = distanceAnchorFrom(ring, ESQUINA, -20, 60, BORDE_ARRIBA);
    expect(a.distanceMm).toBeCloseTo(100, 6);
  });

  it('no cruza la esquina: se queda en el borde del press', () => {
    // spec § 3.4 y The Cut #1. Un release proyectado fuera del borde del
    // press se clampea a ese borde, nunca sigue al siguiente.
    // 150 cae en el costado curvo, ya pasada la esquina. Se clampea al 100
    // del press — que es la referencia misma — así que la distancia es 0.
    // Si cruzara, saldría 50.
    const a = distanceAnchorFrom(ring, ESQUINA, 150, 60, BORDE_ARRIBA);
    expect(a.distanceMm).toBeCloseTo(0, 6);
  });

  it('la distancia nunca es negativa', () => {
    for (const release of [-50, 0, 30, 99, 100, 140]) {
      const a = distanceAnchorFrom(ring, ESQUINA, release, 60, BORDE_ARRIBA);
      expect(a.distanceMm, `release ${release}`).toBeGreaterThanOrEqual(0);
    }
  });

  it('un release en la propia referencia da distancia 0', () => {
    const a = distanceAnchorFrom(ring, ESQUINA, 100, 95, BORDE_ARRIBA);
    expect(a.distanceMm).toBeCloseTo(0, 6);
  });

  it('el ancla vuelve a resolver exactamente donde se soltó', () => {
    // El contrato de ida y vuelta, que es lo que hace el número re-editable:
    // lo que se guarda tiene que re-derivar el mismo punto.
    const a = distanceAnchorFrom(ring, ESQUINA, 70, 85, BORDE_ARRIBA);
    const resuelto = resolveNotchAnchor(OUTLINE, a);
    expect(resuelto).not.toBeNull();
    const esperado = pointAt(ring, 70).point;
    expect(resuelto!.point.x).toBeCloseTo(esperado.x, 4);
    expect(resuelto!.point.y).toBeCloseTo(esperado.y, 4);
  });

  it('la ida y vuelta también aguanta sobre la curva', () => {
    const a = distanceAnchorFrom(ring, ESQUINA, 100 + 180, 110, BORDE_CURVO);
    const resuelto = resolveNotchAnchor(OUTLINE, a);
    expect(resuelto).not.toBeNull();
    // Oráculo independiente: (107.10, 176.16) a 180 mm de arco.
    const esperado = pointAt(ring, 280).point;
    expect(esperado.x).toBeCloseTo(107.10, 1);
    expect(esperado.y).toBeCloseTo(176.16, 1);
    expect(resuelto!.point.x).toBeCloseTo(esperado.x, 4);
    expect(resuelto!.point.y).toBeCloseTo(esperado.y, 4);
  });

  it('un borde que cruza el origen del anillo NO se convierte en su complemento', () => {
    // El anillo empieza en el primer comando, así que el tramo de cierre de
    // cualquier pieza cruza ese origen y llega como [ini, fin] con ini > fin.
    // Ordenar los extremos con min/max ahí da el COMPLEMENTO del borde: sobre
    // esta figura, 520 mm en vez de 84,88 — seis veces más largo. El clampeo
    // dejaría de sujetar el piquete a su borde, que es justo lo que el
    // "no cruza la esquina" del § 3.4 promete.
    const total = ring.totalMm;
    const BORDE_CIERRE: [number, number] = [total - 44.88, 40]; // ~[560, 40]
    const refCierre: DistanceRef = {
      point: pointAt(ring, total - 24.88).point,
      distanceMm: total - 24.88,
      kind: 'corner',
    };
    const a = distanceAnchorFrom(ring, refCierre, 20, total - 10, BORDE_CIERRE);
    // De ref a release, cruzando el origen: 24,88 + 20 = 44,88.
    expect(a.distanceMm).toBeCloseTo(44.88, 6);
  });

  it('un borde normal no cambia de comportamiento por la lógica del cruce', () => {
    // Regresión del arreglo de arriba: si el desenrollado se aplicara siempre,
    // los bordes que no cruzan saldrían movidos.
    const a = distanceAnchorFrom(ring, ESQUINA, 70, 85, BORDE_ARRIBA);
    expect(a.distanceMm).toBeCloseTo(30, 6);
  });

  it('la normal que sale de resolver el ancla es unitaria', () => {
    // La usa `generateNotchPath` para pintar el piquete; si no fuera unitaria
    // el piquete saldría de otro largo que el configurado.
    const a = distanceAnchorFrom(ring, ESQUINA, 70, 85, BORDE_ARRIBA);
    const resuelto = resolveNotchAnchor(OUTLINE, a);
    expect(resuelto).not.toBeNull();
    expect(Math.hypot(resuelto!.normal.x, resuelto!.normal.y)).toBeCloseTo(1, 6);
  });
});
