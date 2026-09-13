import { describe, it, expect, vi, afterEach } from 'vitest';
import { cotasDePieza, cotasDeLineaInterna, cotasDeTrazo } from '../cotas';
import type { InternalLine, PatternPiece, PathCommand, Trazo } from '../../../../types/types';
import * as snapIndexModule from '../../snapIndex';

/** Cotas vivas (spec 2026-08-30 § 3, pieza): Ancho sobre el lado superior, Alto sobre el derecho, en el marco girado de la caja. */
const rect = (w: number, h: number): PathCommand[] => [
  { type: 'M', values: [0, 0] }, { type: 'L', values: [w, 0] },
  { type: 'L', values: [w, h] }, { type: 'L', values: [0, h] }, { type: 'Z', values: [] },
];
const pieza = (over: Partial<PatternPiece> = {}): PatternPiece => ({
  id: 'p1', name: 'P1', outline: rect(200, 300), internals: [], position: { x: 10, y: 20 },
  rotation: 0, mirrored: false, seamAllowance: 0, active: true, createdAt: 0, updatedAt: 0, ...over,
} as PatternPiece);

describe('cotasDePieza', () => {
  it('sin giro: Ancho sobre el lado superior hacia arriba, Alto sobre el lado derecho hacia la derecha', () => {
    const [ancho, alto] = cotasDePieza(pieza());
    expect(ancho).toMatchObject({ id: 'ancho', kind: 'ancho', valueMm: 200, unit: 'mm', primary: true, min: 1, max: 3000 });
    expect(ancho.a).toEqual({ x: 10, y: 20 });
    expect(ancho.b).toEqual({ x: 210, y: 20 });
    expect(ancho.outward).toEqual({ x: 0, y: -1 });
    expect(alto).toMatchObject({ id: 'alto', valueMm: 300 });
    expect(alto.a).toEqual({ x: 210, y: 20 });
    expect(alto.b).toEqual({ x: 210, y: 320 });
    expect(alto.outward).toEqual({ x: 1, y: 0 });
    expect(ancho.label).toBe('Ancho de la pieza');
  });

  it('con giro de 90°: los segmentos y el "hacia fuera" giran con la caja, como los handles', () => {
    const [ancho] = cotasDePieza(pieza({ rotation: 90 }));
    const dx = ancho.b.x - ancho.a.x, dy = ancho.b.y - ancho.a.y;
    expect(Math.hypot(dx, dy)).toBeCloseTo(200, 6);
    expect(Math.abs(dx)).toBeLessThan(1e-6);
    expect(Math.abs(ancho.outward.y)).toBeLessThan(1e-6);
    // el lado "superior" girado 90° en sentido horario (SVG rotate) queda a la DERECHA
    expect(ancho.outward.x).toBeCloseTo(1, 6);
  });

  it('apply escribe esa dimensión y conserva la otra (CotaUpdate discriminado: kind "piece")', () => {
    const [ancho, alto] = cotasDePieza(pieza());
    const u = ancho.apply(400)!;
    expect(u.kind).toBe('piece');
    if (u.kind !== 'piece') throw new Error('esperado kind piece');
    expect(u.outline[1].values).toEqual([400, 0]);
    expect(u.outline[2].values).toEqual([400, 300]);
    const v = alto.apply(50)!;
    if (v.kind !== 'piece') throw new Error('esperado kind piece');
    expect(v.outline[2].values).toEqual([200, 50]);
  });

  it('contorno con H/V/A (válido en el esquema, no soportado por el escalado) → sin cotas, no cotas falsas', () => {
    const conH = pieza({ outline: [{ type: 'M', values: [0, 0] }, { type: 'H', values: [200] }, { type: 'V', values: [300] }, { type: 'H', values: [0] }, { type: 'Z', values: [] }] });
    expect(cotasDePieza(conH)).toEqual([]);
  });

  it('pieza sin área → sin cotas', () => {
    expect(cotasDePieza(pieza({ outline: [] }))).toEqual([]);
  });
});

/**
 * `cotasDeTrazo` y `cotasDeLineaInterna` llamaban `buildSnapIndex` en CADA
 * invocación, pese a que ya se documentaba como caro y memoizable "por
 * identidad de `pieces`" — la ruta de RENDER (varios chips de un mismo tramo,
 * o `sujeto.ts` en cada tick) lo reconstruía sin necesidad. Una caché por
 * identidad (`WeakMap`) evita reconstruirlo cuando la pieza (o el array de
 * piezas visibles) no cambió.
 */
describe('cotasDeLineaInterna / cotasDeTrazo — el índice de enganche se cachea por identidad', () => {
  afterEach(() => vi.restoreAllMocks());

  it('cotasDeLineaInterna: dos llamadas con la MISMA pieza no reconstruyen el índice', () => {
    const spy = vi.spyOn(snapIndexModule, 'buildSnapIndex');
    const linea: InternalLine = {
      id: 'l1', type: 'reference',
      path: [{ type: 'M', values: [10, 10] }, { type: 'L', values: [50, 50] }],
    };
    const p = pieza();
    cotasDeLineaInterna(p, linea);
    cotasDeLineaInterna(p, linea);
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it('cotasDeLineaInterna: una pieza DISTINTA sí reconstruye (no es una caché ciega al cambio)', () => {
    const spy = vi.spyOn(snapIndexModule, 'buildSnapIndex');
    const linea: InternalLine = {
      id: 'l1', type: 'reference',
      path: [{ type: 'M', values: [10, 10] }, { type: 'L', values: [50, 50] }],
    };
    cotasDeLineaInterna(pieza(), linea);
    cotasDeLineaInterna(pieza(), linea);
    expect(spy).toHaveBeenCalledTimes(2);
  });

  it('cotasDeTrazo: dos llamadas con el MISMO array de piezas no reconstruyen el índice', () => {
    const spy = vi.spyOn(snapIndexModule, 'buildSnapIndex');
    const trazo: Trazo = {
      id: 't', createdAt: 1,
      path: [{ type: 'M', values: [0, 0] }, { type: 'L', values: [100, 0] }, { type: 'L', values: [100, 50] }],
    };
    const pieces: PatternPiece[] = [pieza()];
    cotasDeTrazo(trazo, 2, pieces);
    cotasDeTrazo(trazo, 2, pieces);
    expect(spy).toHaveBeenCalledTimes(1);
  });
});
