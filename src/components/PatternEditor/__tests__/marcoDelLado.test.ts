import { describe, it, expect } from 'vitest';
import type { PatternPiece, PathCommand } from '../../../types/types';
import { arrivingReference, chordReference, ABSOLUTE_REFERENCE } from '../angleReference';
import { pieceLocalToPattern } from '../../../utils/geometry/pieceSpace';
import { polarOf } from '../polyPenGeometry';

/**
 * El marco del borde en Editar patrón (spec 2026-09-23 § 3.4): al arrastrar un
 * punto con Shift dos veces, el lado que LLEGA a ese punto; al arrastrar un
 * lado, su propia recta. En espacio de patrón, para que una pieza girada salga
 * bien.
 */
const pieza = (outline: PathCommand[], rotation = 0): PatternPiece => ({
  id: 'p', name: 'P', outline, internals: [], position: { x: 200, y: 150 }, rotation, mirrored: false,
  seamAllowance: 0, layer: 1, sublayer: 0, active: true, createdAt: 1, updatedAt: 1,
} as unknown as PatternPiece);

/** El delantero de la firma del 23-09: el costado va de (200,0) a (260,180). */
const DELANTERO: PathCommand[] = [
  { type: 'M', values: [0, 0] }, { type: 'L', values: [200, 0] },
  { type: 'L', values: [260, 180] }, { type: 'L', values: [0, 180] }, { type: 'Z', values: [] },
];

describe('arrivingReference — el lado que llega al punto', () => {
  it('al punto 2 llega el costado inclinado', () => {
    const r = arrivingReference(pieza(DELANTERO), 2);
    expect(r.kind).toBe('border');
    expect(r.baseDeg).toBeCloseTo(polarOf({ x: 200, y: 0 }, { x: 260, y: 180 }).angleDeg, 9);
  });

  it('al punto del M llega el lado de cierre', () => {
    // De (0,180) a (0,0): hacia arriba en pantalla, 90° en la convención de polarPoint.
    expect(arrivingReference(pieza(DELANTERO), 0).baseDeg).toBeCloseTo(90, 9);
  });

  it('en una esquina con anclas gemelas salta el tramo de largo cero', () => {
    const gemelas: PathCommand[] = [
      { type: 'M', values: [0, 0] }, { type: 'L', values: [100, 0] }, { type: 'L', values: [100, 0] },
      { type: 'L', values: [100, 100] }, { type: 'L', values: [0, 100] }, { type: 'Z', values: [] },
    ];
    expect(arrivingReference(pieza(gemelas), 2).baseDeg).toBeCloseTo(0, 9);
  });

  it('en una pieza girada el marco gira con ella', () => {
    const p = pieza(DELANTERO, 30);
    const esperado = polarOf(pieceLocalToPattern({ x: 200, y: 0 }, p), pieceLocalToPattern({ x: 260, y: 180 }, p)).angleDeg;
    expect(arrivingReference(p, 2).baseDeg).toBeCloseTo(esperado, 9);
  });

  it('un lado curvo aporta su tangente de llegada', () => {
    // Cúbica de (0,0) a (100,0) que llega bajando: su último manejador está en (100,-50).
    const curva: PathCommand[] = [
      { type: 'M', values: [0, 0] }, { type: 'C', values: [30, -80, 100, -50, 100, 0] },
      { type: 'L', values: [100, 100] }, { type: 'L', values: [0, 100] }, { type: 'Z', values: [] },
    ];
    expect(arrivingReference(pieza(curva), 1).baseDeg).toBeCloseTo(-90, 9);
  });

  it('un contorno con arcos no tiene lado: cae al eje', () => {
    const conArco: PathCommand[] = [
      { type: 'M', values: [0, 0] }, { type: 'A', values: [50, 50, 0, 0, 1, 100, 0] },
      { type: 'L', values: [100, 100] }, { type: 'Z', values: [] },
    ];
    expect(arrivingReference(pieza(conArco), 2)).toEqual(ABSOLUTE_REFERENCE);
  });

  it('un índice que no es un ancla no tiene lado', () => {
    expect(arrivingReference(pieza(DELANTERO), 4)).toEqual(ABSOLUTE_REFERENCE);
    expect(arrivingReference(pieza(DELANTERO), 99)).toEqual(ABSOLUTE_REFERENCE);
  });
});

describe('chordReference — la recta del lado', () => {
  it('es la dirección de su ancla de salida a la de llegada', () => {
    const r = chordReference(pieza(DELANTERO), { x: 200, y: 0 }, { x: 260, y: 180 });
    expect(r.kind).toBe('border');
    expect(r.baseDeg).toBeCloseTo(polarOf({ x: 200, y: 0 }, { x: 260, y: 180 }).angleDeg, 9);
  });

  it('un lado de largo cero no tiene recta', () => {
    expect(chordReference(pieza(DELANTERO), { x: 5, y: 5 }, { x: 5, y: 5 })).toEqual(ABSOLUTE_REFERENCE);
  });
});
