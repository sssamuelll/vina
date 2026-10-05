import { describe, it, expect } from 'vitest';
import type { PatternPiece } from '../../../../types/types';
import { cotasDePieza } from '../cotas';
import type { Sujeto } from '../sujeto';
import { cotasALaVista, pasarTurno, TURNO_INICIAL } from '../unaALaVez';

/**
 * Una cota de la pieza a la vez (spec 2026-10-02 § 5.5): Seleccionar y
 * Transformar enseñan Ancho, y Tab pasa a Alto. Las herramientas que crean la
 * pieza conservan las dos: su caja son sus medidas.
 */
const pieza = {
  id: 'p1', name: 'P1', position: { x: 0, y: 0 }, rotation: 0, mirrored: false, active: true, layer: 1,
  outline: [
    { type: 'M', values: [0, 0] }, { type: 'L', values: [300, 0] },
    { type: 'L', values: [300, 200] }, { type: 'L', values: [0, 200] }, { type: 'Z', values: [] },
  ],
  internals: [], seamAllowance: 0,
} as unknown as PatternPiece;

const sujetoPieza = (): Sujeto => ({
  piece: pieza, caliente: false, cotas: cotasDePieza(pieza), lectura: null, lecturaApagada: false,
  bordeLeido: null, disabled: false, esPieza: true,
});

const seleccion = ['p1'];

describe('cotasALaVista', () => {
  it('Seleccionar con una pieza: solo Ancho', () => {
    expect(cotasALaVista(sujetoPieza(), 'select', TURNO_INICIAL, seleccion).map(c => c.id)).toEqual(['ancho']);
  });
  it('Transformar también', () => {
    expect(cotasALaVista(sujetoPieza(), 'transform', TURNO_INICIAL, seleccion).map(c => c.id)).toEqual(['ancho']);
  });
  it('con el turno en Alto para esta selección, Alto ocupa su sitio', () => {
    expect(cotasALaVista(sujetoPieza(), 'select', { seleccion, indice: 1 }, seleccion).map(c => c.id)).toEqual(['alto']);
  });
  it('otra selección (otro arreglo, aunque diga lo mismo) vuelve a Ancho', () => {
    expect(cotasALaVista(sujetoPieza(), 'select', { seleccion, indice: 1 }, ['p1']).map(c => c.id)).toEqual(['ancho']);
  });
  it('Rectángulo, Círculo y Triángulo conservan las dos', () => {
    for (const herramienta of ['rectangle', 'circle', 'triangle'] as const) {
      expect(cotasALaVista(sujetoPieza(), herramienta, TURNO_INICIAL, seleccion).map(c => c.id)).toEqual(['ancho', 'alto']);
    }
  });
  it('un sujeto que no es la pieza (el lado de #1167) sale tal cual', () => {
    const lado = { ...sujetoPieza(), esPieza: false };
    expect(cotasALaVista(lado, 'select', TURNO_INICIAL, seleccion)).toBe(lado.cotas);
  });
});

describe('pasarTurno', () => {
  it('Tab desde Ancho pasa a Alto', () => {
    expect(pasarTurno(sujetoPieza(), 'select', TURNO_INICIAL, seleccion, 'siguiente')).toEqual({ seleccion, indice: 1 });
  });
  it('Tab desde Alto no tiene a dónde: sigue a la línea al pie', () => {
    expect(pasarTurno(sujetoPieza(), 'select', { seleccion, indice: 1 }, seleccion, 'siguiente')).toBeNull();
  });
  it('Shift+Tab desde Alto vuelve a Ancho; desde Ancho no tiene a dónde', () => {
    expect(pasarTurno(sujetoPieza(), 'select', { seleccion, indice: 1 }, seleccion, 'anterior')).toEqual({ seleccion, indice: 0 });
    expect(pasarTurno(sujetoPieza(), 'select', TURNO_INICIAL, seleccion, 'anterior')).toBeNull();
  });
  it('en Rectángulo el Tab es el de siempre', () => {
    expect(pasarTurno(sujetoPieza(), 'rectangle', TURNO_INICIAL, seleccion, 'siguiente')).toBeNull();
  });
});
