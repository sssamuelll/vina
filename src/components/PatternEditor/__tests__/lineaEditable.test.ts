/**
 * La puerta de escritura de Editar patrón (spec 2026-09-24 § 8): una pieza con
 * los paths nuevos de sus líneas. Tiene que dar EXACTAMENTE lo que construía a
 * mano `dispatchAndRefresh` para el contorno —pivote y piquetes incluidos— y
 * no tocar ni el pivote ni los piquetes cuando solo cambia una interna.
 */
import { describe, it, expect } from 'vitest';
import type { InternalLine, PathCommand, PatternPiece } from '../../../types/types';
import {
  CLAVE_CONTORNO, claveDeInterna, conPaths, lineIdDeClave, pathDeLinea, internasEditables,
  quitarPuntos, quitarTramos,
} from '../lineaEditable';
import { esInternaEditable, seBorraEntera } from '../../../types/types';
import { compensatePositionForPivotChange } from '../pieceTransform';
import { reanchorNotches } from '../../../utils/notchReanchor';
import { computeNotchAnchor } from '../../../utils/notchAnchor';
import { generateNotchPath, DEFAULT_NOTCH_OPTIONS } from '../../../utils/notches';
import { applyDartsToInternals, extractDarts } from '../../../utils/dartEntity';

const cuadrado: PathCommand[] = [
  { type: 'M', values: [0, 0] }, { type: 'L', values: [200, 0] },
  { type: 'L', values: [200, 200] }, { type: 'L', values: [0, 200] }, { type: 'Z', values: [] },
];
const ref: InternalLine = {
  id: 'r', type: 'reference',
  path: [{ type: 'M', values: [20, 20] }, { type: 'L', values: [120, 20] }],
};
const piquete: InternalLine = {
  id: 'n', type: 'notch',
  path: generateNotchPath({ x: 100, y: 0 }, { x: 0, y: 1 }, DEFAULT_NOTCH_OPTIONS),
  notchOptions: DEFAULT_NOTCH_OPTIONS,
  notchAnchor: computeNotchAnchor(cuadrado, { x: 100, y: 0 })!,
};

function pieza(): PatternPiece {
  return {
    id: 'p', name: 'P', outline: cuadrado, position: { x: 50, y: 30 }, rotation: 30,
    mirrored: false, active: true, seamAllowance: 0, edges: [], internals: [ref, piquete],
  } as unknown as PatternPiece;
}

describe('claves de línea', () => {
  it('el contorno no tiene id de interna; una interna, el suyo', () => {
    expect(lineIdDeClave(CLAVE_CONTORNO)).toBeNull();
    expect(lineIdDeClave(claveDeInterna('r'))).toBe('r');
  });
});

describe('pathDeLinea', () => {
  it('lee el contorno y las internas; una que no existe, null', () => {
    const p = pieza();
    expect(pathDeLinea(p, CLAVE_CONTORNO)).toBe(p.outline);
    expect(pathDeLinea(p, claveDeInterna('r'))).toBe(ref.path);
    expect(pathDeLinea(p, claveDeInterna('nadie'))).toBeNull();
  });
});

describe('conPaths', () => {
  const nuevoContorno: PathCommand[] = [
    { type: 'M', values: [-40, -40] }, { type: 'L', values: [200, 0] },
    { type: 'L', values: [200, 200] }, { type: 'L', values: [0, 200] }, { type: 'Z', values: [] },
  ];

  it('el contorno: lo mismo que construía dispatchAndRefresh (pivote y piquetes)', () => {
    const p = pieza();
    const r = conPaths(p, new Map([[CLAVE_CONTORNO, nuevoContorno]]));
    expect(r.outline).toBe(nuevoContorno);
    expect(r.position).toEqual(compensatePositionForPivotChange(p, nuevoContorno));
    expect(r.internals).toEqual(reanchorNotches(p.internals, nuevoContorno, p.outline));
  });

  it('una interna: cambia su path y nada más; ni pivote, ni piquetes, ni contorno', () => {
    const p = pieza();
    const nuevo: PathCommand[] = [{ type: 'M', values: [20, 40] }, { type: 'L', values: [120, 40] }];
    const r = conPaths(p, new Map([[claveDeInterna('r'), nuevo]]));
    expect(r.outline).toBe(p.outline);
    expect(r.position).toBe(p.position);
    expect(r.internals[0].path).toBe(nuevo);
    expect(r.internals[1]).toBe(piquete);
  });

  it('null quita la interna', () => {
    const r = conPaths(pieza(), new Map([[claveDeInterna('r'), null]]));
    expect(r.internals.map(l => l.id)).toEqual(['n']);
  });

  it('las dos a la vez: la interna nueva y los piquetes re-anclados al contorno nuevo', () => {
    const p = pieza();
    const nuevo: PathCommand[] = [{ type: 'M', values: [20, 40] }, { type: 'L', values: [120, 40] }];
    const r = conPaths(p, new Map<ReturnType<typeof claveDeInterna>, PathCommand[]>([
      [CLAVE_CONTORNO, nuevoContorno], [claveDeInterna('r'), nuevo],
    ]));
    expect(r.internals[0].path).toBe(nuevo);
    expect(r.internals[1]).toEqual(reanchorNotches([piquete], nuevoContorno, p.outline)[0]);
  });
});

describe('qué internas edita Q (spec § 3.2)', () => {
  const linea = (type: InternalLine['type'], extra: Partial<InternalLine> = {}): InternalLine => ({
    id: type, type, path: [{ type: 'M', values: [0, 0] }, { type: 'L', values: [10, 0] }], ...extra,
  });

  it('las de forma propia sí; el piquete y el doblez de un pliegue no', () => {
    for (const t of ['reference', 'fold', 'topstitch', 'seam', 'grainline', 'dart', 'pleat'] as const) {
      expect(esInternaEditable(linea(t)), t).toBe(true);
    }
    expect(esInternaEditable(linea('notch'))).toBe(false);
    expect(esInternaEditable(linea('fold', { foldOptions: { direction: 'mountain', creaseAngleDeg: 180, pleatId: 'pl' } }))).toBe(false);
  });

  it('Supr sobre un tramo se lleva entera solo la línea de hilo y la pinza', () => {
    expect(seBorraEntera('grainline')).toBe(true);
    expect(seBorraEntera('dart')).toBe(true);
    for (const t of ['reference', 'fold', 'topstitch', 'seam', 'pleat'] as const) expect(seBorraEntera(t), t).toBe(false);
  });

  it('internasEditables filtra en orden de pintado', () => {
    const p = { ...pieza(), internals: [linea('reference'), linea('notch'), linea('grainline')] } as PatternPiece;
    expect(internasEditables(p).map(l => l.id)).toEqual(['reference', 'grainline']);
  });
});

describe('conPaths y la copia de las pinzas (spec § 7)', () => {
  const pinza: InternalLine = {
    id: 'd', type: 'dart', dartOptions: { capShape: 'pointed' },
    path: [{ type: 'M', values: [0, 0] }, { type: 'L', values: [10, 50] }, { type: 'L', values: [20, 0] }],
  };
  function conPinza(): PatternPiece {
    const base = { ...pieza(), internals: [pinza] } as PatternPiece;
    const darts = extractDarts(base).map(d => ({ ...d, foldDirection: 'toward-center' as const }));
    return { ...base, darts };
  }
  const apexMasHondo: PathCommand[] = [
    { type: 'M', values: [0, 0] }, { type: 'L', values: [10, 60] }, { type: 'L', values: [20, 0] },
  ];

  it('mover la punta en Q relee la pinza y conserva lo que no es dibujo', () => {
    const r = conPaths(conPinza(), new Map([[claveDeInterna('d'), apexMasHondo]]));
    expect(r.darts![0].apex).toEqual({ x: 10, y: 60 });
    expect(r.darts![0].foldDirection).toBe('toward-center');
    expect(r.darts![0].capShape).toBe('pointed');
  });

  it('una operación de pinza después no revierte la edición (Review Focus 5)', () => {
    const r = conPaths(conPinza(), new Map([[claveDeInterna('d'), apexMasHondo]]));
    const internals = applyDartsToInternals(r, r.darts!);
    const puntos = internals[0].path.map(c => c.values.slice(-2));
    expect(puntos).toContainEqual([10, 60]);
  });

  it('quitar la línea de una pinza la quita de la copia; una pinza sin línea se queda', () => {
    const sinLinea = { id: 'suelta', intake: 5, apex: { x: 0, y: 0 }, legs: [[], []] as [[], []], foldDirection: 'left' as const };
    const base = conPinza();
    const r = conPaths({ ...base, darts: [...base.darts!, sinLinea] }, new Map([[claveDeInterna('d'), null]]));
    expect(r.darts!.map(d => d.id)).toEqual(['suelta']);
  });
});

const P = (x: number, y: number): PathCommand => ({ type: 'L', values: [x, y] });
const M = (x: number, y: number): PathCommand => ({ type: 'M', values: [x, y] });
const anclas = (path: PathCommand[]) => path.filter(c => c.type !== 'Z').map(c => c.values.slice(-2));

describe('quitarPuntos (spec § 4.6)', () => {
  const abierta = [M(0, 0), P(100, 0), P(100, 100)];
  const cerrada = [M(0, 0), P(100, 0), P(100, 100), { type: 'Z', values: [] } as PathCommand];

  it('una abierta pierde el punto y sus vecinos se unen', () => {
    expect(anclas(quitarPuntos(abierta, new Set([1]), false) as PathCommand[])).toEqual([[0, 0], [100, 100]]);
  });
  it('quitar la M promueve el siguiente a M', () => {
    const r = quitarPuntos(abierta, new Set([0]), false) as PathCommand[];
    expect(r[0].type).toBe('M');
    expect(anclas(r)).toEqual([[100, 0], [100, 100]]);
  });
  it('una abierta que se queda con un punto deja de existir', () => {
    expect(quitarPuntos([M(0, 0), P(100, 0)], new Set([1]), false)).toBeNull();
  });
  it('una cerrada o el contorno necesitan tres: si no llegan, insuficiente', () => {
    expect(quitarPuntos(cerrada, new Set([1]), false)).toBe('insuficiente');
    expect(quitarPuntos(cerrada, new Set([1]), true)).toBe('insuficiente');
  });
  it('gemelas: quitar el grupo entero no deja un gemelo (Review Focus 1)', () => {
    const gemelas = [M(0, 0), P(100, 0), P(100, 0), P(100, 100)];
    expect(anclas(quitarPuntos(gemelas, new Set([1, 2]), false) as PathCommand[])).toEqual([[0, 0], [100, 100]]);
  });
});

describe('quitarTramos (spec § 4.6)', () => {
  const tres = [M(0, 0), P(100, 0), P(100, 100), P(0, 100)];
  const cuadradoCerrado = [M(0, 0), P(100, 0), P(100, 100), P(0, 100), { type: 'Z', values: [] } as PathCommand];

  it('el tramo del medio parte la línea en dos', () => {
    expect(quitarTramos(tres, new Set([2])).map(anclas)).toEqual([[[0, 0], [100, 0]], [[100, 100], [0, 100]]]);
  });
  it('el primero o el último la acortan', () => {
    expect(quitarTramos(tres, new Set([1])).map(anclas)).toEqual([[[100, 0], [100, 100], [0, 100]]]);
    expect(quitarTramos(tres, new Set([3])).map(anclas)).toEqual([[[0, 0], [100, 0], [100, 100]]]);
  });
  it('el único tramo de una línea de dos puntos: no queda nada', () => {
    expect(quitarTramos([M(0, 0), P(100, 0)], new Set([1]))).toEqual([]);
  });
  it('en una cerrada, el primer tramo quitado la abre en una sola línea (Review Focus 3)', () => {
    const r = quitarTramos(cuadradoCerrado, new Set([2]));
    expect(r.map(anclas)).toEqual([[[100, 100], [0, 100], [0, 0], [100, 0]]]);
    expect(r[0].some(c => c.type === 'Z')).toBe(false);
  });
  it('el cierre es un tramo más: quitarlo abre la forma por ahí', () => {
    expect(quitarTramos(cuadradoCerrado, new Set([4])).map(anclas)).toEqual([[[0, 0], [100, 0], [100, 100], [0, 100]]]);
  });
  it('un índice que no es tramo no cambia nada: la misma referencia', () => {
    const r = quitarTramos(tres, new Set([0]));
    expect(r).toHaveLength(1);
    expect(r[0]).toBe(tres);
  });
  it('conserva las curvas', () => {
    const curva = [M(0, 0), { type: 'C', values: [30, -20, 70, -20, 100, 0] } as PathCommand, P(200, 0)];
    expect(quitarTramos(curva, new Set([2]))[0][1]).toEqual(curva[1]);
  });
});
