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
    if (!update || update.kind !== 'internal') throw new Error('se esperaba una actualización interna');
    expect(update.pieceId).toBe('p1');
    expect(update.lineId).toBe('l1');
    expect(update.path[0]).toEqual({ type: 'M', values: [0, 20] }); // el inicio no se toca
    expect(update.path[1].values[0]).toBeCloseTo(80, 3);
    expect(update.path[1].values[1]).toBeCloseTo(20, 3);
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
    if (!update || update.kind !== 'internal') throw new Error('se esperaba una actualización interna');
    // El nodo que se movió sigue sobre el contorno (x=0 o y=0/60, según el lado).
    const [nx, ny] = update.path[0].values;
    const sobreElBorde = Math.abs(nx) < 1e-6 || Math.abs(ny) < 1e-6 || Math.abs(ny - 60) < 1e-6;
    expect(sobreElBorde).toBe(true);
  });

  it('varias líneas internas en la pieza: solo se toca la línea pedida, las demás quedan igual', () => {
    const l1: InternalLine = { id: 'l1', type: 'reference', path: [{ type: 'M', values: [0, 20] }, { type: 'L', values: [50, 20] }] };
    const l2: InternalLine = { id: 'l2', type: 'fold', path: [{ type: 'M', values: [10, 10] }, { type: 'L', values: [90, 10] }] };
    const pieza = piezaBase([l1, l2]);
    const cotas = cotasDeLineaInterna(pieza, l1);
    const largo = cotas.find(c => c.kind === 'tramo-largo')!;
    const update = largo.apply(200);
    if (!update || update.kind !== 'internal') throw new Error('se esperaba una actualización interna');
    expect(update.lineId).toBe('l1');
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
    if (!update || update.kind !== 'internal') throw new Error('se esperaba una actualización interna');
    expect(update.path[1].values[1]).toBeCloseTo(10, 3); // mismo y que el origen: horizontal
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

  // Revisión adversarial de codex (`codex review --base main`, tanda 4).
  describe('pieza girada — el ángulo es de PANTALLA, no local (hallazgo P1)', () => {
    const piezaGirada = (rotation: number, internals: InternalLine[]): PatternPiece => ({
      ...piezaBase(internals), rotation,
    } as PatternPiece);

    it('un tramo interior sin borde, en una pieza girada 90°, se lee -90° en el eje de pantalla', () => {
      const linea: InternalLine = {
        id: 'l1', type: 'reference',
        path: [{ type: 'M', values: [10, 10] }, { type: 'L', values: [90, 10] }],
      };
      const cotas = cotasDeLineaInterna(piezaGirada(90, [linea]), linea);
      const angulo = cotas.find(c => c.kind === 'tramo-angulo')!;
      expect(angulo.valueMm).toBeCloseTo(-90, 3);
    });

    it('escribir el ángulo recién leído no mueve el punto (round-trip patrón→local→patrón)', () => {
      const linea: InternalLine = {
        id: 'l1', type: 'reference',
        path: [{ type: 'M', values: [10, 10] }, { type: 'L', values: [60, 25] }],
      };
      const cotas = cotasDeLineaInterna(piezaGirada(37, [linea]), linea);
      const angulo = cotas.find(c => c.kind === 'tramo-angulo')!;
      const update = angulo.apply(angulo.valueMm);
      if (!update || update.kind !== 'internal') throw new Error('se esperaba una actualización interna');
      expect(update.path[1].values[0]).toBeCloseTo(60, 3);
      expect(update.path[1].values[1]).toBeCloseTo(25, 3);
    });

    // Cobertura esquivada: el fixture de arriba (10,10)→(90,10)) es interior a
    // propósito para conservar el −90 histórico, así que "borde + pieza
    // girada" nunca se ejercitó junta. Aquí el PRIMER tramo sale exactamente
    // de un borde (x=0, el lado izquierdo) en una pieza girada 37°.
    it('primer tramo pegado al borde EN UNA PIEZA GIRADA: referencia al borde, ida y vuelta exacta, y 90° entra en la pieza', () => {
      const linea: InternalLine = {
        id: 'l1', type: 'reference',
        path: [{ type: 'M', values: [0, 10] }, { type: 'L', values: [20, 25] }],
      };
      const pieza = piezaGirada(37, [linea]);
      const cotas = cotasDeLineaInterna(pieza, linea);
      const angulo = cotas.find(c => c.kind === 'tramo-angulo')!;
      expect(angulo.referenceLabel).toBe('al borde');

      // Ida y vuelta con precisión estricta — no el toBeCloseTo(x, 3) (≈5e-4)
      // de la prueba de arriba: aquí se pide < 1e-9 mm.
      const roundTrip = angulo.apply(angulo.valueMm);
      if (!roundTrip || roundTrip.kind !== 'internal') throw new Error('se esperaba una actualización interna');
      const distanciaIdaYVuelta = Math.hypot(roundTrip.path[1].values[0] - 20, roundTrip.path[1].values[1] - 25);
      expect(distanciaIdaYVuelta).toBeLessThan(1e-9);

      // Escribir 90° (relativo al borde) mete el destino DENTRO del
      // rectángulo local (0..100 × 0..60): es el signo que decide si el
      // cuarto de vuelta entra a la pieza o sale de ella (borderReference),
      // y con rotación de por medio es justo lo que el fixture viejo evitaba.
      const update90 = angulo.apply(90);
      if (!update90 || update90.kind !== 'internal') throw new Error('se esperaba una actualización interna');
      const [x, y] = update90.path[1].values;
      expect(x).toBeGreaterThan(0);
      expect(x).toBeLessThan(100);
      expect(y).toBeGreaterThan(0);
      expect(y).toBeLessThan(60);
    });
  });

  it('revisión adversarial (hallazgo P2): mover un extremo enganchado que ABRE en curva también traslada su control de salida', () => {
    // M(0,20) está sobre el lado de cierre; la curva sale de ahí hacia (50,50).
    const linea: InternalLine = {
      id: 'l1', type: 'reference',
      path: [
        { type: 'M', values: [0, 20] },
        { type: 'C', values: [20, 20, 40, 40, 50, 50] },
      ],
    };
    const cotas = cotasDeLineaInterna(piezaBase([linea]), linea);
    const borde = cotas.find(c => c.kind === 'borde')!;
    const update = borde.apply(30);
    if (!update || update.kind !== 'internal') throw new Error('se esperaba una actualización interna');
    const [mx, my] = update.path[0].values;
    const dx = mx - 0;
    const dy = my - 20;
    // El control de salida (los dos primeros valores de la C) viaja por el
    // MISMO delta que M: si no, la tangente con la que la curva sale queda
    // torcida hacia el punto viejo.
    expect(update.path[1].values[0]).toBeCloseTo(20 + dx, 3);
    expect(update.path[1].values[1]).toBeCloseTo(20 + dy, 3);
  });
});

describe('D2 — el chip del tramo lee y escribe con su referencia', () => {
  it('primer tramo desde borde derecho: 90 relativo entra en la pieza sin cambiar largo', () => {
    const line: InternalLine = { id: 'relative', type: 'reference', path: [
      { type: 'M', values: [100, 30] }, { type: 'L', values: [40, 30] },
    ] };
    const angle = cotasDeLineaInterna(piezaBase([line]), line).find(c => c.kind === 'tramo-angulo')!;
    expect(angle.valueMm).toBeCloseTo(90, 9);
    expect(angle.referenceLabel).toBe('al borde');
    expect(angle.max).toBeGreaterThanOrEqual(270);
    const equivalent = angle.apply(270);
    const negative = angle.apply(-90);
    expect(equivalent).toEqual(negative);
    const update = angle.apply(90);
    if (!update || update.kind !== 'internal') throw new Error('missing update');
    expect(update.path[1].values[0]).toBeCloseTo(40, 9);
    expect(update.path[1].values[1]).toBeCloseTo(30, 9);
  });

  it('un tramo intermedio de una pieza girada se refiere al anterior, sin depender de la rotación', () => {
    const line: InternalLine = { id: 'relative', type: 'reference', path: [
      { type: 'M', values: [20, 30] }, { type: 'L', values: [40, 10] }, { type: 'L', values: [20, -10] },
    ] };
    const piece = { ...piezaBase([line]), rotation: 37 };
    const angle = cotasDeLineaInterna(piece, line, 2).find(c => c.kind === 'tramo-angulo')!;
    expect(angle.valueMm).toBeCloseTo(90, 8);
    expect(angle.referenceLabel).toBe('al tramo');
    const update = angle.apply(angle.valueMm);
    if (!update || update.kind !== 'internal') throw new Error('missing update');
    expect(update.path[2].values[0]).toBeCloseTo(20, 8);
    expect(update.path[2].values[1]).toBeCloseTo(-10, 8);
  });
});
