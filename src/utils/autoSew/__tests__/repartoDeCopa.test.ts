/**
 * repartirCopas — la copa de la manga se parte donde cada mitad mide, en
 * proporción, lo que mide la sisa que la recibe (2026-10-06). Partirla por la
 * mitad dejaba cada media costura de la camisa de María a 5,2 y 5,5 mm de su
 * sisa, sobre un patrón con 0,4 mm de embebido en total.
 */
import { describe, it, expect } from 'vitest';
import { repartirCopas } from '../repartoDeCopa';
import type { PatternPiece, Seam } from '../../../types/types';

/** Una pieza cuyo primer lado, recto, es el borde nombrado. */
const pieza = (id: string, category: string, borde: string, largo: number): PatternPiece => ({
  id, name: id, category,
  outline: [
    { type: 'M', values: [0, 0] }, { type: 'L', values: [largo, 0] },
    { type: 'L', values: [largo, 50] }, { type: 'L', values: [0, 50] }, { type: 'Z', values: [] },
  ],
  edges: [{ id: `${id}-borde`, name: borde, segmentRange: [1, 2], edgeType: 'seam' }],
  internals: [], position: { x: 0, y: 0 }, rotation: 0, mirrored: false, seamAllowance: 0,
  active: true, createdAt: 0, updatedAt: 0,
} as unknown as PatternPiece);

const costura = (id: string, pieceA: Seam['pieceA'], pieceB: Seam['pieceB']): Seam => ({
  id, pieceA, pieceB, type: 'standard', tension: 100, strength: 1, active: true, taped: false, tapeWidth: 10,
});

const piezas = [
  pieza('manga', 'sleeve', 'sleeveCap', 450),
  pieza('del', 'bodice', 'armhole', 230),
  pieza('esp', 'bodice', 'armhole', 220),
];

describe('repartirCopas', () => {
  it('con la copa en el lado A, el corte cae donde la primera mitad mide lo que su sisa', () => {
    const [s1, s2] = repartirCopas([
      costura('s1', { pieceId: 'manga', edgeName: 'sleeveCap', tStart: 0, tEnd: 0.5 }, { pieceId: 'del', edgeName: 'armhole', tStart: 0, tEnd: 1 }),
      costura('s2', { pieceId: 'manga', edgeName: 'sleeveCap', tStart: 0.5, tEnd: 1 }, { pieceId: 'esp', edgeName: 'armhole', tStart: 0, tEnd: 1 }),
    ], piezas);
    expect(s1.pieceA.tStart).toBe(0);
    expect(s1.pieceA.tEnd).toBeCloseTo(230 / 450, 9);
    expect(s2.pieceA.tStart).toBeCloseTo(230 / 450, 9);
    expect(s2.pieceA.tEnd).toBe(1);
  });

  it('con la copa en un lado B invertido, el rango se lee y se escribe en sentido de cosido (seamRange.ts)', () => {
    // Físicamente s1 cose [0,5; 1] de la copa (guardado [0; 0,5] invertido) a
    // la delantera, y s2 cose [0; 0,5] a la espalda: la primera mitad física
    // va a la espalda, así que el corte cae en 220/450.
    const [s1, s2] = repartirCopas([
      costura('s1', { pieceId: 'del', edgeName: 'armhole', tStart: 0, tEnd: 1 }, { pieceId: 'manga', edgeName: 'sleeveCap', tStart: 0, tEnd: 0.5, reversed: true }),
      costura('s2', { pieceId: 'esp', edgeName: 'armhole', tStart: 0, tEnd: 1 }, { pieceId: 'manga', edgeName: 'sleeveCap', tStart: 0, tEnd: 0.5 }),
    ], piezas);
    const corte = 220 / 450;
    expect(s2.pieceB.tStart).toBe(0);
    expect(s2.pieceB.tEnd).toBeCloseTo(corte, 9);
    // [corte; 1] físico, guardado en sentido de cosido: [0; 1 − corte].
    expect(s1.pieceB).toMatchObject({ tStart: 0, reversed: true });
    expect(s1.pieceB.tEnd).toBeCloseTo(1 - corte, 9);
  });

  it('no toca lo que no es una copa partida en dos: entera, con hueco, o sin la pieza de una sisa', () => {
    const entera = [costura('e', { pieceId: 'manga', edgeName: 'sleeveCap' }, { pieceId: 'del', edgeName: 'armhole' })];
    expect(repartirCopas(entera, piezas)).toEqual(entera);
    const conHueco = [
      costura('h1', { pieceId: 'manga', edgeName: 'sleeveCap', tStart: 0, tEnd: 0.4 }, { pieceId: 'del', edgeName: 'armhole' }),
      costura('h2', { pieceId: 'manga', edgeName: 'sleeveCap', tStart: 0.6, tEnd: 1 }, { pieceId: 'esp', edgeName: 'armhole' }),
    ];
    expect(repartirCopas(conHueco, piezas)).toEqual(conHueco);
    const sinSisa = [
      costura('x1', { pieceId: 'manga', edgeName: 'sleeveCap', tStart: 0, tEnd: 0.5 }, { pieceId: 'del', edgeName: 'armhole' }),
      costura('x2', { pieceId: 'manga', edgeName: 'sleeveCap', tStart: 0.5, tEnd: 1 }, { pieceId: 'no-existe', edgeName: 'armhole' }),
    ];
    expect(repartirCopas(sinSisa, piezas)).toEqual(sinSisa);
  });
});
