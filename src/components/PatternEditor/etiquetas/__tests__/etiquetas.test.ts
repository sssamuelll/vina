import { describe, expect, it } from 'vitest';
import type { InternalLine, PathCommand, PatternPiece } from '../../../../types/types';
import { DEFAULT_NOTCH_OPTIONS } from '../../../../utils/notches';
import { FORMAS_DE_PIQUETE, notchTool } from '../../../../tools/definitions/notch';
import {
  claveDeEtiqueta, etiquetaDeLaSeleccion, posicionDeEtiqueta, presentarEtiqueta, type EtiquetaInput,
} from '../etiquetas';

/**
 * Qué etiqueta enseña la selección, dónde va y qué dice (spec 2026-10-02
 * § 5.2, P3c). Una función pura sobre el store: el lienzo solo la pinta.
 */

const RECT: PathCommand[] = [
  { type: 'M', values: [0, 0] }, { type: 'L', values: [300, 0] }, { type: 'L', values: [300, 200] },
  { type: 'L', values: [0, 200] }, { type: 'Z', values: [] },
];
const piquete: InternalLine = {
  id: 'n1', type: 'notch', path: [{ type: 'M', values: [60, 0] }, { type: 'L', values: [60, 8] }],
  notchAnchor: { refPoint: { x: 0, y: 0 }, direction: 'cw', distanceMm: 60, metric: 2 },
  notchOptions: { ...DEFAULT_NOTCH_OPTIONS },
};
const pieza: PatternPiece = {
  id: 'p1', name: 'p1', outline: RECT, internals: [piquete], position: { x: 100, y: 100 }, rotation: 0,
  mirrored: false, seamAllowance: 0, layer: 1, active: true, createdAt: 0, updatedAt: 0,
};
const base = (over: Partial<EtiquetaInput> = {}): EtiquetaInput => ({
  activeTool: 'select', pieces: [pieza], seams: [], selectedInternalLine: { pieceId: 'p1', lineId: 'n1' },
  selectedSeamId: null, saSelection: null, showNotches: true, showSewingLines: true, showSeamAllowance: true,
  hiddenLayerIds: [], layerLocked: {}, callada: false, ...over,
});

describe('etiquetaDeLaSeleccion — el piquete', () => {
  it('con Seleccionar y un piquete elegido: su etiqueta, en el piquete, hacia dentro de la pieza', () => {
    const e = etiquetaDeLaSeleccion(base())!;
    expect(e).toMatchObject({ que: 'piquete', pieceId: 'p1', lineId: 'n1', apagada: false, separacionMm: 8 });
    expect(e.punto.x).toBeCloseTo(160, 6);
    expect(e.punto.y).toBeCloseTo(100, 6);
    // El borde de arriba: dentro es abajo.
    expect(e.hacia.x).toBeCloseTo(0, 6);
    expect(e.hacia.y).toBeCloseTo(1, 6);
  });

  it('con la pieza girada 180°, la dirección gira con ella', () => {
    // `rotation` va en grados (`pieceSpace.ts`).
    const e = etiquetaDeLaSeleccion(base({ pieces: [{ ...pieza, rotation: 180 }] }))!;
    expect(e.hacia.x).toBeCloseTo(0, 6);
    expect(e.hacia.y).toBeCloseTo(-1, 6);
  });

  it('con otra herramienta, nada: el piquete se elige con Seleccionar', () => {
    expect(etiquetaDeLaSeleccion(base({ activeTool: 'notch' }))).toBeNull();
    expect(etiquetaDeLaSeleccion(base({ activeTool: 'pen' }))).toBeNull();
  });

  it('con los piquetes ocultos, con su capa oculta o callada, nada', () => {
    expect(etiquetaDeLaSeleccion(base({ showNotches: false }))).toBeNull();
    expect(etiquetaDeLaSeleccion(base({ hiddenLayerIds: [1] }))).toBeNull();
    expect(etiquetaDeLaSeleccion(base({ callada: true }))).toBeNull();
  });

  it('con la pieza o su capa bloqueadas, apagada', () => {
    expect(etiquetaDeLaSeleccion(base({ pieces: [{ ...pieza, locked: true }] }))!.apagada).toBe(true);
    expect(etiquetaDeLaSeleccion(base({ layerLocked: { 1: true } }))!.apagada).toBe(true);
  });

  it('una línea que no es piquete, o un piquete que ya no está, no llevan etiqueta', () => {
    const conLinea: PatternPiece = { ...pieza, internals: [{ ...piquete, type: 'reference' }] };
    expect(etiquetaDeLaSeleccion(base({ pieces: [conLinea] }))).toBeNull();
    expect(etiquetaDeLaSeleccion(base({ selectedInternalLine: { pieceId: 'p1', lineId: 'otra' } }))).toBeNull();
  });

  it('sin nada elegido, nada', () => {
    expect(etiquetaDeLaSeleccion(base({ selectedInternalLine: null }))).toBeNull();
  });
});

describe('presentarEtiqueta — el piquete', () => {
  it('su texto, sus nombres, las cuatro opciones del pie y el dibujo de su forma', () => {
    const p = presentarEtiqueta(etiquetaDeLaSeleccion(base())!);
    expect(p.texto).toBe('Recta · 8 × 3 mm');
    expect(p.nombre).toBe('Piquete: Recta · 8 × 3 mm');
    expect(p.nombreDelMenu).toBe('Opciones del piquete');
    // Las mismas del pie, no una copia que se pueda desincronizar.
    expect(p.opciones).toBe(notchTool.options);
    expect(p.valores).toEqual({ shape: 'slit', count: 1, length: 8, width: 3 });
    expect(p.Dibujo).toBe(FORMAS_DE_PIQUETE[0].icon);
  });
});

describe('posicionDeEtiqueta y claveDeEtiqueta', () => {
  it('en px del lienzo: el punto, más su separación hacia dentro', () => {
    const e = etiquetaDeLaSeleccion(base())!;
    const { left, top } = posicionDeEtiqueta(e, { x: 10, y: 20 }, 2);
    expect(left).toBeCloseTo(10 + 160 * 2, 6);
    // La profundidad, a escala, más 16 px: la pastilla queda pasada la punta.
    expect(top).toBeCloseTo(20 + 100 * 2 + (8 * 2 + 16), 6);
  });

  it('la clave es la del objeto: otra selección es otra etiqueta, y su menú se cierra', () => {
    expect(claveDeEtiqueta(etiquetaDeLaSeleccion(base())!)).toBe('piquete:p1:n1');
  });
});
