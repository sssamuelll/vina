import { describe, expect, it } from 'vitest';
import type { InternalLine, PathCommand, PatternPiece, Seam } from '../../../../types/types';
import { TIPOS_DE_COSTURA } from '../../../../utils/seam/tiposDeCostura';
import { DEFAULT_NOTCH_OPTIONS } from '../../../../utils/notches';
import { FORMAS_DE_PIQUETE, notchTool } from '../../../../tools/definitions/notch';
import { TIPOS_DE_ESQUINA } from '../../../../utils/seam/tiposDeEsquina';
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

describe('etiquetaDeLaSeleccion — la esquina del margen', () => {
  const conMargen: PatternPiece = { ...pieza, seamAllowance: 10 };
  const esquina = (over: Partial<EtiquetaInput> = {}) => base({
    pieces: [conMargen], selectedInternalLine: null,
    saSelection: { kind: 'vertex', items: [{ pieceId: 'p1', vertexIndex: 0 }] }, ...over,
  });

  it('con Seleccionar o con Margen: su etiqueta, fuera de la pieza, pasada la punta del margen', () => {
    for (const activeTool of ['select', 'seamAllowance'] as const) {
      const e = etiquetaDeLaSeleccion(esquina({ activeTool }))!;
      expect(e).toMatchObject({ que: 'esquina', pieceId: 'p1', vertexIndex: 0, tipo: 'mitered', apagada: false });
      expect(e.punto).toEqual({ x: 100, y: 100 });
      // Del centro de la pieza hacia la esquina: arriba a la izquierda.
      expect(e.hacia.x).toBeLessThan(0);
      expect(e.hacia.y).toBeLessThan(0);
      expect(e.separacionMm).toBeCloseTo(10 * Math.SQRT2, 6);
    }
  });

  it('el tipo guardado de esa esquina, si no el de la pieza, si no Inglete', () => {
    expect((etiquetaDeLaSeleccion(esquina({ pieces: [{ ...conMargen, cornerTypes: { 0: 'squared' } }] })) as { tipo: string }).tipo).toBe('squared');
    expect((etiquetaDeLaSeleccion(esquina({ pieces: [{ ...conMargen, defaultCornerType: 'envelope' }] })) as { tipo: string }).tipo).toBe('envelope');
    // Con los dos guardados manda el de la esquina, como en Propiedades y en el dibujo.
    expect((etiquetaDeLaSeleccion(esquina({
      pieces: [{ ...conMargen, defaultCornerType: 'envelope', cornerTypes: { 0: 'squared' } }],
    })) as { tipo: string }).tipo).toBe('squared');
  });

  it('con otra herramienta, con el margen oculto, sin margen o callada, nada', () => {
    expect(etiquetaDeLaSeleccion(esquina({ activeTool: 'pen' }))).toBeNull();
    expect(etiquetaDeLaSeleccion(esquina({ showSeamAllowance: false }))).toBeNull();
    expect(etiquetaDeLaSeleccion(esquina({ pieces: [pieza] }))).toBeNull();
    expect(etiquetaDeLaSeleccion(esquina({ callada: true }))).toBeNull();
  });

  it('con la pieza bloqueada, apagada; con la capa oculta, nada', () => {
    expect(etiquetaDeLaSeleccion(esquina({ pieces: [{ ...conMargen, locked: true }] }))!.apagada).toBe(true);
    expect(etiquetaDeLaSeleccion(esquina({ hiddenLayerIds: [1] }))).toBeNull();
  });

  it('una elección vieja que ya no cae en una esquina (Q insertó un punto antes) no lleva etiqueta', () => {
    // Revisión final de P3c (lente A): si no, elegir un tipo escribiría
    // `cornerTypes` en un punto del medio de un lado.
    const conPuntoEnMedio: PatternPiece = {
      ...conMargen,
      outline: [
        { type: 'M', values: [0, 0] }, { type: 'L', values: [150, 0] }, { type: 'L', values: [300, 0] },
        { type: 'L', values: [300, 200] }, { type: 'L', values: [0, 200] }, { type: 'Z', values: [] },
      ],
    };
    expect(etiquetaDeLaSeleccion(esquina({
      pieces: [conPuntoEnMedio], saSelection: { kind: 'vertex', items: [{ pieceId: 'p1', vertexIndex: 1 }] },
    }))).toBeNull();
    // La esquina de verdad, el 2, sí.
    expect(etiquetaDeLaSeleccion(esquina({
      pieces: [conPuntoEnMedio], saSelection: { kind: 'vertex', items: [{ pieceId: 'p1', vertexIndex: 2 }] },
    }))?.que).toBe('esquina');
  });

  it('un índice que no es un vértice (el Z) no lleva etiqueta', () => {
    expect(etiquetaDeLaSeleccion(esquina({ saSelection: { kind: 'vertex', items: [{ pieceId: 'p1', vertexIndex: 4 }] } }))).toBeNull();
  });

  it('presentarEtiqueta: «Tipo de esquina: Inglete», su menú y las siete alternativas', () => {
    const p = presentarEtiqueta(etiquetaDeLaSeleccion(esquina())!);
    expect(p.texto).toBe('Inglete');
    expect(p.nombre).toBe('Tipo de esquina: Inglete');
    expect(p.nombreDelMenu).toBe('Opciones de la esquina');
    expect(p.opciones).toHaveLength(1);
    expect(p.opciones[0].label).toBe('Tipo de esquina');
    expect(p.opciones[0].choices!.map((c) => [c.value, c.label])).toEqual(TIPOS_DE_ESQUINA.map((t) => [t.value, t.label]));
    expect(p.valores).toEqual({ cornerType: 'mitered' });
  });

  it('su clave', () => {
    expect(claveDeEtiqueta(etiquetaDeLaSeleccion(esquina())!)).toBe('esquina:p1:0');
  });
});

describe('etiquetaDeLaSeleccion — la costura', () => {
  const conLados: PatternPiece = {
    ...pieza,
    internals: [],
    edges: [
      { id: 'p1:top', name: 'top', segmentRange: [1, 2], edgeType: 'seam', length: 300 },
      { id: 'p1:bottom', name: 'bottom', segmentRange: [3, 4], edgeType: 'seam', length: 300 },
    ],
  };
  const costura = {
    id: 's1', type: 'standard', tension: 1, strength: 1, active: true, taped: false, tapeWidth: 0,
    pieceA: { pieceId: 'p1', edgeName: 'top' }, pieceB: { pieceId: 'p1', edgeName: 'bottom' },
  } as Seam;
  const conCostura = (over: Partial<EtiquetaInput> = {}) => base({
    activeTool: 'seamEdit', pieces: [conLados], seams: [costura], selectedInternalLine: null, selectedSeamId: 's1', ...over,
  });

  it('con Seleccionar, nada aunque esté elegida: la información de costura solo con las herramientas de costura (#210)', () => {
    // María (#210): «eso solo debería verse al activar el menú de costuras».
    // Coser deja elegida la costura que termina, y la elección sobrevive al
    // cambiar de herramienta: con Z no se le pega la etiqueta.
    expect(etiquetaDeLaSeleccion(conCostura({ activeTool: 'select' }))).toBeNull();
  });

  it('con Coser o Editar costuras: en el medio de su mitad A, hacia dentro de la pieza A', () => {
    for (const activeTool of ['seam', 'seamEdit'] as const) {
      const e = etiquetaDeLaSeleccion(conCostura({ activeTool }))!;
      expect(e).toMatchObject({ que: 'costura', seamId: 's1', tipo: 'standard', apagada: false, separacionMm: 0 });
      // El lado de arriba va de (100, 100) a (400, 100).
      expect(e.punto.x).toBeCloseTo(250, 6);
      expect(e.punto.y).toBeCloseTo(100, 6);
      expect(e.hacia.x).toBeCloseTo(0, 6);
      expect(e.hacia.y).toBeCloseTo(1, 6);
    }
  });

  it('con otra herramienta, con «Costuras» apagado, con la capa de A oculta o callada, nada', () => {
    expect(etiquetaDeLaSeleccion(conCostura({ activeTool: 'pen' }))).toBeNull();
    expect(etiquetaDeLaSeleccion(conCostura({ showSewingLines: false }))).toBeNull();
    expect(etiquetaDeLaSeleccion(conCostura({ hiddenLayerIds: [1] }))).toBeNull();
    expect(etiquetaDeLaSeleccion(conCostura({ callada: true }))).toBeNull();
  });

  it('una costura de un tramo: la etiqueta va en el medio del tramo cosido, no del lado', () => {
    const deUnTramo = { ...costura, pieceA: { pieceId: 'p1', edgeName: 'top', tStart: 0.5, tEnd: 1 } } as Seam;
    const e = etiquetaDeLaSeleccion(conCostura({ seams: [deUnTramo] }))!;
    // El tramo va de 250 a 400: su medio es 325.
    expect(e.punto.x).toBeCloseTo(325, 6);
  });

  it('una costura que ya no está (deshacer), nada', () => {
    expect(etiquetaDeLaSeleccion(conCostura({ selectedSeamId: 'otra' }))).toBeNull();
  });

  it('nunca apagada: el tipo de costura no es geometría de la pieza', () => {
    expect(etiquetaDeLaSeleccion(conCostura({ pieces: [{ ...conLados, locked: true }] }))!.apagada).toBe(false);
  });

  it('presentarEtiqueta: «Tipo de costura: Normal», su menú y las cuatro alternativas', () => {
    const p = presentarEtiqueta(etiquetaDeLaSeleccion(conCostura())!);
    expect(p.texto).toBe('Normal');
    expect(p.nombre).toBe('Tipo de costura: Normal');
    expect(p.nombreDelMenu).toBe('Opciones de la costura');
    expect(p.opciones).toHaveLength(1);
    expect(p.opciones[0].label).toBe('Tipo de costura');
    expect(p.opciones[0].choices!.map((c) => [c.value, c.label])).toEqual(TIPOS_DE_COSTURA.map((t) => [t.value, t.label]));
    expect(p.valores).toEqual({ type: 'standard' });
  });

  it('su clave, y 24 px de separación para no tapar sus largos', () => {
    const e = etiquetaDeLaSeleccion(conCostura())!;
    expect(claveDeEtiqueta(e)).toBe('costura:s1');
    expect(posicionDeEtiqueta(e, { x: 0, y: 0 }, 1).top).toBeCloseTo(100 + 24, 6);
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
