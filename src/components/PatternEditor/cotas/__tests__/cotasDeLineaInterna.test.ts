/**
 * `cotasDeLineaInterna` (spec 2026-08-30 § 3, "Línea interna seleccionada"):
 * combina `segmentPolar` (largo·ángulo por tramo) y `edgeDistances` (borde↔
 * esquina por extremo enganchado) en la lista de cotas de UNA línea interna.
 * Genérica sobre `InternalLineType` — el hilo (#1107) la recibe gratis por
 * ser también una `InternalLine` de 2 puntos.
 */
import { describe, it, expect } from 'vitest';
import type { PatternPiece, InternalLine } from '../../../../types/types';
import { cotasDeLineaInterna } from '../cotas';

const piezaBase = (internals: InternalLine[] = []): PatternPiece => ({
  id: 'p1', name: 'P1', position: { x: 0, y: 0 }, rotation: 0, mirrored: false,
  active: true, locked: false, seamAllowance: 0,
  outline: [
    { type: 'M', values: [0, 0] }, { type: 'L', values: [100, 0] },
    { type: 'L', values: [100, 60] }, { type: 'L', values: [0, 60] }, { type: 'Z', values: [] },
  ],
  internals, edges: [],
} as unknown as PatternPiece);

describe('cotasDeLineaInterna — línea interna enganchada de un lado al otro', () => {
  it('un tramo con los dos extremos sobre el contorno: 2 cotas de tramo + hasta 4 de borde', () => {
    // Del lado de cierre (0,20) al lado superior (50,60) — ambos extremos
    // enganchados al contorno.
    const linea: InternalLine = {
      id: 'l1', type: 'reference',
      path: [{ type: 'M', values: [0, 20] }, { type: 'L', values: [50, 60] }],
    };
    const cotas = cotasDeLineaInterna(piezaBase([linea]), linea);
    const largo = cotas.find(c => c.kind === 'tramo-largo');
    const angulo = cotas.find(c => c.kind === 'tramo-angulo');
    expect(largo).toBeDefined();
    expect(angulo).toBeDefined();
    expect(largo!.valueMm).toBeCloseTo(Math.hypot(50, 40), 3);
    const borde = cotas.filter(c => c.kind === 'borde');
    expect(borde).toHaveLength(4); // 2 por extremo (cw + ccw), 2 extremos
  });

  it('un extremo interior (no sobre el contorno): ese extremo no aporta cotas de borde', () => {
    const linea: InternalLine = {
      id: 'l1', type: 'reference',
      path: [{ type: 'M', values: [0, 20] }, { type: 'L', values: [50, 30] }], // (50,30) es interior
    };
    const cotas = cotasDeLineaInterna(piezaBase([linea]), linea);
    expect(cotas.filter(c => c.kind === 'borde')).toHaveLength(2); // solo el extremo (0,20)
  });

  it('escribir el largo mueve el nodo final del path y conserva el resto de la línea intacto', () => {
    const linea: InternalLine = {
      id: 'l1', type: 'reference',
      path: [{ type: 'M', values: [0, 20] }, { type: 'L', values: [50, 20] }],
    };
    const pieza = piezaBase([linea]);
    const cotas = cotasDeLineaInterna(pieza, linea);
    const largo = cotas.find(c => c.kind === 'tramo-largo')!;
    const update = largo.apply(80);
    expect(update).not.toBeNull();
    expect(update!.kind).toBe('internal');
    if (update!.kind === 'internal') {
      expect(update.pieceId).toBe('p1');
      expect(update.lineId).toBe('l1');
      expect(update.path[0]).toEqual({ type: 'M', values: [0, 20] }); // el inicio no se toca
      expect(update.path[1].values[0]).toBeCloseTo(80, 3);
      expect(update.path[1].values[1]).toBeCloseTo(20, 3);
    }
  });

  it('escribir una distancia de borde mueve SOLO ese extremo por el contorno, la línea sigue enganchada', () => {
    const linea: InternalLine = {
      id: 'l1', type: 'reference',
      path: [{ type: 'M', values: [0, 20] }, { type: 'L', values: [50, 60] }],
    };
    const pieza = piezaBase([linea]);
    const cotas = cotasDeLineaInterna(pieza, linea);
    const bordeDesdeOrigen = cotas.find(c => c.kind === 'borde' && c.label.includes('(0, 0)'))
      ?? cotas.filter(c => c.kind === 'borde')[0];
    const update = bordeDesdeOrigen.apply(30);
    expect(update).not.toBeNull();
    if (update!.kind === 'internal') {
      // El nodo que se movió sigue sobre el contorno (x=0 o y=0/60, según el lado).
      const [nx, ny] = update.path[0].values;
      const sobreElBorde = Math.abs(nx) < 1e-6 || Math.abs(ny) < 1e-6 || Math.abs(ny - 60) < 1e-6;
      expect(sobreElBorde).toBe(true);
    }
  });

  it('varias líneas internas en la pieza: solo se toca la línea pedida, las demás quedan igual', () => {
    const l1: InternalLine = { id: 'l1', type: 'reference', path: [{ type: 'M', values: [0, 20] }, { type: 'L', values: [50, 20] }] };
    const l2: InternalLine = { id: 'l2', type: 'fold', path: [{ type: 'M', values: [10, 10] }, { type: 'L', values: [90, 10] }] };
    const pieza = piezaBase([l1, l2]);
    const cotas = cotasDeLineaInterna(pieza, l1);
    const largo = cotas.find(c => c.kind === 'tramo-largo')!;
    const update = largo.apply(200);
    if (update!.kind === 'internal') expect(update.lineId).toBe('l1');
  });

  it('el hilo (#1107): 2 cotas de tramo (largo, ángulo), sin cotas de borde si no toca el contorno', () => {
    const hilo: InternalLine = {
      id: 'g1', type: 'grainline',
      path: [{ type: 'M', values: [30, 10] }, { type: 'L', values: [30, 40] }],
    };
    const cotas = cotasDeLineaInterna(piezaBase([hilo]), hilo);
    expect(cotas.filter(c => c.kind === 'tramo-largo')).toHaveLength(1);
    expect(cotas.filter(c => c.kind === 'tramo-angulo')).toHaveLength(1);
    expect(cotas.filter(c => c.kind === 'borde')).toHaveLength(0);
  });

  it('escribir el ángulo del hilo a 0 lo endereza (#1107, "escribir 0 lo endereza")', () => {
    const hilo: InternalLine = {
      id: 'g1', type: 'grainline',
      path: [{ type: 'M', values: [30, 10] }, { type: 'L', values: [35, 42] }],
    };
    const cotas = cotasDeLineaInterna(piezaBase([hilo]), hilo);
    const angulo = cotas.find(c => c.kind === 'tramo-angulo')!;
    const update = angulo.apply(0);
    if (update!.kind === 'internal') {
      expect(update.path[1].values[1]).toBeCloseTo(10, 3); // mismo y que el origen: horizontal
    }
  });

  it('línea con más de un subpath propio: sin cotas de borde (misma regla que la pieza)', () => {
    const linea: InternalLine = {
      id: 'l1', type: 'reference',
      path: [
        { type: 'M', values: [0, 20] }, { type: 'L', values: [10, 20] },
        { type: 'M', values: [50, 50] }, { type: 'L', values: [60, 50] },
      ],
    };
    const cotas = cotasDeLineaInterna(piezaBase([linea]), linea);
    expect(cotas.filter(c => c.kind === 'borde')).toHaveLength(0);
  });
});
