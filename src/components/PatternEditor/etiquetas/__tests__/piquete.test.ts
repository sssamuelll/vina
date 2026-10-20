import { describe, expect, it } from 'vitest';
import type { InternalLine, PathCommand, PatternPiece } from '../../../../types/types';
import { resolveNotchAnchor } from '../../../../utils/notchAnchor';
import { DEFAULT_NOTCH_OPTIONS, generateNotchPath } from '../../../../utils/notches';
import { reescribirPiquete, textoDelPiquete } from '../piquete';

/**
 * Un piquete ya puesto se reescribe desde su ancla (spec 2026-10-02 § 5.2,
 * P3c): la distancia de su cota y las opciones de su etiqueta pasan por aquí.
 */

const rect: PathCommand[] = [
  { type: 'M', values: [0, 0] }, { type: 'L', values: [300, 0] }, { type: 'L', values: [300, 200] },
  { type: 'L', values: [0, 200] }, { type: 'Z', values: [] },
];
const pieza: PatternPiece = {
  id: 'p', name: 'p', outline: rect, internals: [], position: { x: 10, y: 20 }, rotation: 0, mirrored: false,
  seamAllowance: 0, active: true, createdAt: 0, updatedAt: 0,
};
const piquete = (distanceMm = 60): InternalLine => ({
  id: 'n', type: 'notch', path: [{ type: 'M', values: [distanceMm, 0] }, { type: 'L', values: [distanceMm, 8] }],
  notchAnchor: { refPoint: { x: 0, y: 0 }, direction: 'cw', distanceMm, metric: 2 },
  notchOptions: { ...DEFAULT_NOTCH_OPTIONS, length: 8 },
});

describe('reescribirPiquete', () => {
  it('cambiar la forma no lo mueve: el path sale de la misma ancla, y lo demás se conserva', () => {
    const r = reescribirPiquete(pieza, piquete(), { opciones: { shape: 't-notch' } })!;
    const ancla = resolveNotchAnchor(rect, r.notchAnchor!)!;
    expect(r.notchOptions).toEqual({ ...DEFAULT_NOTCH_OPTIONS, length: 8, shape: 't-notch' });
    expect(r.path).toEqual(generateNotchPath(ancla.point, ancla.normal, r.notchOptions!));
    expect(r.notchAnchor).toEqual(piquete().notchAnchor);
  });

  it('la distancia mueve el ancla y el path', () => {
    const r = reescribirPiquete(pieza, piquete(), { distanciaMm: 150 })!;
    expect(r.notchAnchor!.distanceMm).toBeCloseTo(150, 6);
    expect(r.path[0].values[0]).toBeCloseTo(150, 6);
    expect(r.path[0].values[1]).toBeCloseTo(0, 6);
  });

  it('sin opciones guardadas, parte de las de fábrica', () => {
    const r = reescribirPiquete(pieza, { ...piquete(), notchOptions: undefined }, { opciones: { width: 5 } })!;
    expect(r.notchOptions).toEqual({ ...DEFAULT_NOTCH_OPTIONS, width: 5 });
  });

  it('en una curva (como la sisa), cambiar la forma no mueve el ancla y dibuja donde ella cae', () => {
    const curva: PathCommand[] = [
      { type: 'M', values: [0, 0] }, { type: 'C', values: [100, -60, 200, -60, 300, 0] },
      { type: 'L', values: [300, 200] }, { type: 'L', values: [0, 200] }, { type: 'Z', values: [] },
    ];
    const conCurva: PatternPiece = { ...pieza, outline: curva };
    const r = reescribirPiquete(conCurva, piquete(), { opciones: { shape: 'v-internal', width: 6 } })!;
    expect(r.notchAnchor).toEqual(piquete().notchAnchor);
    const ancla = resolveNotchAnchor(curva, r.notchAnchor!)!;
    expect(r.path).toEqual(generateNotchPath(ancla.point, ancla.normal, r.notchOptions!));
    // Sobre la curva, no sobre la cuerda: a 60 mm de arco el punto ya subió.
    expect(ancla.point.y).toBeLessThan(-1);
  });

  it('null si no es un piquete, si no tiene ancla o si su ancla ya no cae en el contorno', () => {
    expect(reescribirPiquete(pieza, { ...piquete(), type: 'reference' }, { distanciaMm: 10 })).toBeNull();
    expect(reescribirPiquete(pieza, { ...piquete(), notchAnchor: undefined }, { distanciaMm: 10 })).toBeNull();
    const perdida: InternalLine = {
      ...piquete(), notchAnchor: { refPoint: { x: 999, y: 999 }, direction: 'cw', distanceMm: 5, metric: 2 },
    };
    expect(reescribirPiquete(pieza, perdida, {})).toBeNull();
  });
});

describe('textoDelPiquete (solace-wren, 09-10)', () => {
  const o = { ...DEFAULT_NOTCH_OPTIONS, length: 8, width: 3, count: 1 };

  it('uno: la forma y las medidas', () => {
    expect(textoDelPiquete({ ...o, shape: 'slit' })).toBe('Recta · 8 × 3 mm');
  });

  it('varios: cuántos y la forma en plural', () => {
    expect(textoDelPiquete({ ...o, shape: 'slit', count: 2 })).toBe('2 rectas · 8 × 3 mm');
    expect(textoDelPiquete({ ...o, shape: 't-notch', count: 3 })).toBe('3 en T · 8 × 3 mm');
    expect(textoDelPiquete({ ...o, shape: 'castle', count: 2 })).toBe('2 almenas · 8 × 3 mm');
  });

  it('los decimales con coma', () => {
    expect(textoDelPiquete({ ...o, shape: 'v-internal', length: 12.5 })).toBe('V hacia adentro · 12,5 × 3 mm');
  });

  it('una cantidad guardada como texto («2», la lista de antes) cuenta igual', () => {
    expect(textoDelPiquete({ ...o, count: '2' as unknown as number })).toBe('2 rectas · 8 × 3 mm');
  });
});
