/**
 * `segmentPolar` (spec 2026-08-30 § 4.2): largo y ángulo de cada tramo RECTO
 * de un `path` (0° a la derecha, 90° arriba en pantalla — `polarOf`).
 * Escribir el largo o el ángulo mueve el nodo FINAL del tramo; el inicial
 * queda plantado.
 */
import { describe, it, expect } from 'vitest';
import type { PathCommand } from '../../../../types/types';
import { segmentPolar } from '../segmentPolar';

/** Línea interna de 3 nodos, dos tramos rectos: (0,0)→(100,0)→(100,50). */
const DOS_TRAMOS: PathCommand[] = [
  { type: 'M', values: [0, 0] },
  { type: 'L', values: [100, 0] },
  { type: 'L', values: [100, 50] },
];

describe('segmentPolar — largo y ángulo por tramo recto', () => {
  it('dos tramos rectos: largo y ángulo correctos, 0° a la derecha', () => {
    const tramos = segmentPolar(DOS_TRAMOS);
    expect(tramos).toHaveLength(2);
    expect(tramos[0].from).toEqual({ x: 0, y: 0 });
    expect(tramos[0].to).toEqual({ x: 100, y: 0 });
    expect(tramos[0].lengthMm).toBeCloseTo(100, 6);
    expect(tramos[0].angleDeg).toBeCloseTo(0, 6);

    expect(tramos[1].from).toEqual({ x: 100, y: 0 });
    expect(tramos[1].to).toEqual({ x: 100, y: 50 });
    expect(tramos[1].lengthMm).toBeCloseTo(50, 6);
    expect(tramos[1].angleDeg).toBeCloseTo(-90, 6); // y crece: hacia abajo en pantalla
  });

  it('escribir el largo mueve el nodo final y conserva el ángulo', () => {
    const tramos = segmentPolar(DOS_TRAMOS);
    const nuevo = tramos[0].writeLength(150);
    expect(nuevo.x).toBeCloseTo(150, 6);
    expect(nuevo.y).toBeCloseTo(0, 6);
  });

  it('escribir el ángulo mueve el nodo final y conserva el largo', () => {
    const tramos = segmentPolar(DOS_TRAMOS);
    const nuevo = tramos[0].writeAngle(90);
    expect(nuevo.x).toBeCloseTo(0, 6);
    expect(nuevo.y).toBeCloseTo(-100, 6); // mismo largo (100), 90° es arriba: y negativo
  });

  it('un tramo C o Q no produce cota (sin infraestructura de nodos para manejadores en esta tanda)', () => {
    const conCurva: PathCommand[] = [
      { type: 'M', values: [0, 0] },
      { type: 'C', values: [10, 10, 20, 20, 100, 0] },
      { type: 'L', values: [100, 50] },
    ];
    const tramos = segmentPolar(conCurva);
    // Solo el tramo recto final produce cota; la curva no.
    expect(tramos).toHaveLength(1);
    expect(tramos[0].from).toEqual({ x: 100, y: 0 });
    expect(tramos[0].to).toEqual({ x: 100, y: 50 });
  });

  it('el hilo (grainline) es un path de 2 puntos: exactamente un tramo, con su ángulo (#1107)', () => {
    const hilo: PathCommand[] = [
      { type: 'M', values: [20, 20] },
      { type: 'L', values: [20, 120] },
    ];
    const tramos = segmentPolar(hilo);
    expect(tramos).toHaveLength(1);
    expect(tramos[0].lengthMm).toBeCloseTo(100, 6);
    expect(tramos[0].angleDeg).toBeCloseTo(-90, 6); // hacia abajo en pantalla
  });

  it('un solo punto (sin L): sin tramos', () => {
    expect(segmentPolar([{ type: 'M', values: [0, 0] }])).toHaveLength(0);
  });

  /**
   * El lado de CIERRE (#1167 § 4). Un rectángulo real es `M L L L Z`: cuatro
   * lados, pero solo tres comandos `L`. Sin esta fila el cuarto lado —el que
   * vuelve al ancla de la `M`— no tenía largo ni ángulo, que es exactamente el
   * hueco que #1120 ya pagó una vez en las etiquetas de «Largos».
   *
   * Convención: su `toCommandIndex` es el de la `M`, porque el par final de esa
   * `M` ES el nodo que se mueve — que es lo que ese campo significa.
   */
  describe('el lado de cierre', () => {
    const RECTANGULO: PathCommand[] = [
      { type: 'M', values: [0, 0] },
      { type: 'L', values: [200, 0] },
      { type: 'L', values: [200, 100] },
      { type: 'L', values: [0, 100] },
      { type: 'Z', values: [] },
    ];

    it('un rectángulo M L L L Z tiene CUATRO tramos, no tres', () => {
      expect(segmentPolar(RECTANGULO)).toHaveLength(4);
    });

    it('el cuarto va del último ancla al de la M, y su índice es el de la M', () => {
      const cierre = segmentPolar(RECTANGULO)[3];
      expect(cierre.from).toEqual({ x: 0, y: 100 });
      expect(cierre.to).toEqual({ x: 0, y: 0 });
      expect(cierre.lengthMm).toBeCloseTo(100, 6);
      expect(cierre.toCommandIndex).toBe(0);
    });

    it('escribir su largo mueve el ancla de la M sobre la misma recta', () => {
      const cierre = segmentPolar(RECTANGULO)[3];
      const nuevo = cierre.writeLength(250);
      expect(nuevo.x).toBeCloseTo(0, 6);
      expect(nuevo.y).toBeCloseTo(-150, 6); // (0,100) + 250 hacia arriba
    });

    it('un contorno ABIERTO no inventa lado de cierre', () => {
      expect(segmentPolar([
        { type: 'M', values: [0, 0] },
        { type: 'L', values: [100, 0] },
        { type: 'L', values: [100, 50] },
      ])).toHaveLength(2);
    });

    it('una Z que ya está sobre la M no produce un tramo de largo cero', () => {
      expect(segmentPolar([
        { type: 'M', values: [0, 0] },
        { type: 'L', values: [100, 0] },
        { type: 'L', values: [0, 0] },
        { type: 'Z', values: [] },
      ])).toHaveLength(2);
    });
  });
});
