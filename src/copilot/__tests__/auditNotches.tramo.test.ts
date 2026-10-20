import { describe, it, expect } from 'vitest';
import type { InternalLine, PatternPiece, Seam, SemanticEdge } from '../../types/types';
import { auditNotches } from '../reasoning/proactiveAnalysis';

/**
 * Los piquetes de una costura parcial son los de su TRAMO cosido. Antes
 * contaban todos los del borde: un piquete fuera del tramo se sujetaba al
 * extremo y fingía casar con el de enfrente (revisión de la entrega 1a,
 * 2026-10-05). En la camisa de María, los dos piquetes de la manga, que están
 * en la mitad trasera de la copa, salían también en la costura delantera.
 */
const pieza = (id: string, ancho: number, piquetesX: number[]): PatternPiece => ({
  id, name: id, position: { x: 0, y: 0 },
  outline: [
    { type: 'M', values: [0, 0] },
    { type: 'L', values: [ancho, 0] },
    { type: 'L', values: [ancho, 50] },
    { type: 'L', values: [0, 50] },
    { type: 'Z', values: [] },
  ],
  edges: [{ id: `${id}:top`, name: 'top', segmentRange: [1, 2], edgeType: 'seam' }] as SemanticEdge[],
  internals: piquetesX.map((x, i) => ({
    id: `${id}-n${i}`, type: 'notch', path: [{ type: 'M', values: [x, 0] }, { type: 'L', values: [x, 6] }],
  }) as InternalLine),
  rotation: 0, mirrored: false, seamAllowance: 0, layer: 1, sublayer: 0, active: true, createdAt: 0, updatedAt: 0,
});

const costura = (pieceA: Seam['pieceA'], pieceB: Seam['pieceB']): Seam => ({
  id: 's', pieceA, pieceB, type: 'standard', tension: 100, strength: 1, active: true, taped: false, tapeWidth: 0,
});

describe('auditNotches: los piquetes del tramo cosido', () => {
  it('un piquete fuera del tramo no esconde a uno sin pareja', () => {
    // A cose solo su mitad [0, 0,5]; su piquete en 90 mm queda fuera. El de B
    // (49 de 50 mm) no tiene pareja en lo cosido.
    const avisos = auditNotches(
      [pieza('A', 100, [90]), pieza('B', 50, [49])],
      [costura({ pieceId: 'A', edgeName: 'top', tStart: 0, tEnd: 0.5 }, { pieceId: 'B', edgeName: 'top' })],
    );
    expect(avisos).toHaveLength(1);
    expect(avisos[0].message).toContain('0 on A and 1 on B without a match');
  });
  it('en un B invertido, su tramo cosido va en sentido de cosido: un piquete dentro de él casa', () => {
    // B invertido cose [0, 0,5] en sentido de cosido, o sea x de 100 a 200 en
    // el sentido del borde. Su piquete en 150 cae a la mitad del tramo, como
    // el de A en 50.
    const avisos = auditNotches(
      [pieza('A', 100, [50]), pieza('B', 200, [150])],
      [costura({ pieceId: 'A', edgeName: 'top' }, { pieceId: 'B', edgeName: 'top', tStart: 0, tEnd: 0.5, reversed: true })],
    );
    expect(avisos).toEqual([]);
  });
  it('el aviso dice el hecho y no aconseja: copiar un piquete puede ser el arreglo equivocado', () => {
    // 20 contra 50 no casan en ningún sentido (20 contra 80 sí, al revés).
    const avisos = auditNotches([pieza('A', 100, [20]), pieza('B', 100, [50])], [costura({ pieceId: 'A', edgeName: 'top' }, { pieceId: 'B', edgeName: 'top' })]);
    expect(avisos).toHaveLength(1);
    expect(avisos[0].message).not.toMatch(/mirror/i);
  });
});
