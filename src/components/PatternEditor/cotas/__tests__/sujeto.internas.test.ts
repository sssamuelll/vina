/** Las cotas del punto elegido de una interna en Q (spec 2026-09-24 § 4.5). */
import { describe, it, expect } from 'vitest';
import type { InternalLine, PatternPiece } from '../../../../types/types';
import { cotasDelSujeto, type SujetoInput } from '../sujeto';

const pieza = {
  id: 'p', name: 'P', position: { x: 0, y: 0 }, rotation: 0, mirrored: false, active: true, seamAllowance: 0, edges: [],
  outline: [{ type: 'M', values: [0, 0] }, { type: 'L', values: [200, 0] }, { type: 'L', values: [200, 150] }, { type: 'Z', values: [] }],
  internals: [{ id: 'L', type: 'reference', path: [{ type: 'M', values: [20, 20] }, { type: 'L', values: [120, 20] }, { type: 'L', values: [120, 120] }] }],
} as unknown as PatternPiece;

describe('el punto elegido de una interna es sujeto de cotas', () => {
  it('sus dos largos, de su línea', () => {
    const s = cotasDelSujeto({
      activeTool: 'editPattern', pieces: [pieza], selectedPieceIds: ['p'], selectedInternalLine: { pieceId: 'p', lineId: 'L' },
      hotId: null, isDragging: false, contextMenuOpen: false, calibrationActive: false, hiddenLayerIds: [], layerLocked: {},
      nodoSeleccionado: { pieceId: 'p', commandIndex: 1, lineId: 'L' },
    });
    expect(s.cotas.map(c => c.id)).toEqual(['nodo-L-1-anterior', 'nodo-L-1-siguiente']);
  });
});

/**
 * La tabla de § 4.5, en Q: un punto, sus dos largos (arriba); un tramo, su
 * largo y su ángulo; varios puntos, ninguna. Y lo que se escribe en Q pasa por
 * Q (`moveNodeTo`), como el lado del contorno: escrito por la línea, el hook lo
 * leía como un cambio de fuera y soltaba el tramo —y con él el campo Ángulo al
 * que iba el Tab— (revisión final de la frontera, I-2).
 */
describe('en Q, las cotas de una interna son las de lo elegido (spec § 4.5)', () => {
  const entrada = (over: Partial<SujetoInput>): SujetoInput => ({
    activeTool: 'editPattern', pieces: [pieza], selectedPieceIds: ['p'], selectedInternalLine: null,
    hotId: null, isDragging: false, contextMenuOpen: false, calibrationActive: false, hiddenLayerIds: [], layerLocked: {},
    ...over,
  });

  it('varios puntos de una interna —la elegida sin tramo y sin punto único—: ninguna cota', () => {
    const s = cotasDelSujeto(entrada({ selectedInternalLine: { pieceId: 'p', lineId: 'L' } }));
    expect(s.cotas).toEqual([]);
  });

  it('en Z, la misma línea entera conserva las suyas', () => {
    const s = cotasDelSujeto(entrada({ activeTool: 'select', selectedInternalLine: { pieceId: 'p', lineId: 'L' } }));
    expect(s.cotas.length).toBeGreaterThan(0);
  });

  it('un tramo: el mismo largo y ángulo que en Z, escritos por el punto con su lineId', () => {
    const tramo = { pieceId: 'p', lineId: 'L', segmentIndex: 1 };
    const q = cotasDelSujeto(entrada({ selectedInternalLine: tramo }));
    const z = cotasDelSujeto(entrada({ activeTool: 'select', selectedInternalLine: tramo }));
    expect(q.cotas.map(c => c.kind)).toEqual(['tramo-largo', 'tramo-angulo']);
    expect(q.cotas.map(c => [c.id, c.valueMm, c.referenceLabel])).toEqual(z.cotas.map(c => [c.id, c.valueMm, c.referenceLabel]));

    const largo = q.cotas[0].apply(150);
    expect(largo).toMatchObject({ kind: 'nodo', pieceId: 'p', commandIndex: 1, lineId: 'L' });
    const destino = (largo as { destino: { x: number; y: number } }).destino;
    expect(destino.x).toBeCloseTo(170, 9);
    expect(destino.y).toBeCloseTo(20, 9);
    expect(q.cotas[1].apply(-90)).toMatchObject({ kind: 'nodo', pieceId: 'p', commandIndex: 1, lineId: 'L' });
    // En Z, la de siempre: por la línea.
    expect(z.cotas[0].apply(150)).toMatchObject({ kind: 'internal', pieceId: 'p', lineId: 'L' });
  });

  it('un tramo de una interna que Q no edita (el doblez de un pliegue, elegido en Z) sigue escribiendo por su línea', () => {
    const doblez: InternalLine = {
      id: 'F', type: 'fold', foldOptions: { direction: 'mountain', creaseAngleDeg: 180, pleatId: 'pl' },
      path: [{ type: 'M', values: [20, 60] }, { type: 'L', values: [120, 60] }],
    };
    const conDoblez = { ...pieza, internals: [doblez] } as PatternPiece;
    const s = cotasDelSujeto(entrada({ pieces: [conDoblez], selectedInternalLine: { pieceId: 'p', lineId: 'F', segmentIndex: 1 } }));
    expect(s.cotas[0].apply(150)).toMatchObject({ kind: 'internal', pieceId: 'p', lineId: 'F' });
  });
});

/**
 * El piquete elegido con Seleccionar (spec 2026-10-02 § 5.2, P3c, la puerta de
 * vuelta): su distancia a la esquina, en reposo, que escribe por el ancla. En
 * las demás herramientas sigue sin cotas: la suya es la de lo que se pone.
 */
describe('el piquete elegido trae su distancia (P3c)', () => {
  const conPiquete = {
    ...pieza,
    outline: [
      { type: 'M', values: [0, 0] }, { type: 'L', values: [300, 0] }, { type: 'L', values: [300, 200] },
      { type: 'L', values: [0, 200] }, { type: 'Z', values: [] },
    ],
    internals: [{
      id: 'n', type: 'notch', path: [{ type: 'M', values: [60, 0] }, { type: 'L', values: [60, 8] }],
      notchAnchor: { refPoint: { x: 0, y: 0 }, direction: 'cw', distanceMm: 60, metric: 2 },
    }],
  } as unknown as PatternPiece;
  const entrada = (over: Partial<SujetoInput>): SujetoInput => ({
    activeTool: 'select', pieces: [conPiquete], selectedPieceIds: ['p'], selectedInternalLine: { pieceId: 'p', lineId: 'n' },
    hotId: null, isDragging: false, contextMenuOpen: false, calibrationActive: false, hiddenLayerIds: [], layerLocked: {},
    ...over,
  });

  it('con Seleccionar: Distancia, que escribe por el ancla', () => {
    const s = cotasDelSujeto(entrada({}));
    expect(s.cotas.map(c => c.label)).toEqual(['Distancia']);
    expect(s.cotas[0].apply(150)).toEqual({ kind: 'piqueteElegido', pieceId: 'p', lineId: 'n', distanciaMm: 150 });
    expect(s.esPieza).toBe(false);
  });

  it('con la pieza bloqueada se ve apagada', () => {
    const s = cotasDelSujeto(entrada({ pieces: [{ ...conPiquete, locked: true }] }));
    expect(s.cotas).toHaveLength(1);
    expect(s.disabled).toBe(true);
  });

  it('con otra herramienta, ninguna: la del piquete es la de lo que se pone', () => {
    expect(cotasDelSujeto(entrada({ activeTool: 'notch' })).cotas).toEqual([]);
  });

  it('arrastrando o con el menú abierto, se calla como todas', () => {
    expect(cotasDelSujeto(entrada({ isDragging: true })).cotas).toEqual([]);
    expect(cotasDelSujeto(entrada({ contextMenuOpen: true })).cotas).toEqual([]);
  });
});
