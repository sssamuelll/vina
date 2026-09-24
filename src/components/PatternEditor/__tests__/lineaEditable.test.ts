/**
 * La puerta de escritura de Editar patrón (spec 2026-09-24 § 8): una pieza con
 * los paths nuevos de sus líneas. Tiene que dar EXACTAMENTE lo que construía a
 * mano `dispatchAndRefresh` para el contorno —pivote y piquetes incluidos— y
 * no tocar ni el pivote ni los piquetes cuando solo cambia una interna.
 */
import { describe, it, expect } from 'vitest';
import type { InternalLine, PathCommand, PatternPiece } from '../../../types/types';
import {
  CLAVE_CONTORNO, claveDeInterna, conPaths, lineIdDeClave, pathDeLinea,
} from '../lineaEditable';
import { compensatePositionForPivotChange } from '../pieceTransform';
import { reanchorNotches } from '../../../utils/notchReanchor';
import { computeNotchAnchor } from '../../../utils/notchAnchor';
import { generateNotchPath, DEFAULT_NOTCH_OPTIONS } from '../../../utils/notches';

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
