import { describe, it, expect } from 'vitest';
import { cotasDelSujeto } from '../sujeto';
import type { PatternPiece, PathCommand, InternalLine } from '../../../../types/types';

/**
 * Regla del sujeto (spec 2026-08-30 § 3.1): un sujeto, el más reciente;
 * caliente solo si Rectángulo acaba de crearlo y sigue seleccionado; las
 * piezas bloqueadas muestran sus cotas apagadas; nada durante un arrastre,
 * con el menú abierto, con dos piezas o con una interna seleccionada.
 */
const rect = (w: number, h: number): PathCommand[] => [
  { type: 'M', values: [0, 0] }, { type: 'L', values: [w, 0] }, { type: 'L', values: [w, h] }, { type: 'L', values: [0, h] }, { type: 'Z', values: [] },
];
const pieza = (id: string, over: Partial<PatternPiece> = {}): PatternPiece => ({
  id, name: id, outline: rect(100, 100), internals: [], position: { x: 0, y: 0 }, rotation: 0, mirrored: false,
  seamAllowance: 0, active: true, createdAt: 0, updatedAt: 0, ...over,
} as PatternPiece);
const base = {
  pieces: [pieza('a'), pieza('b', { locked: true }), pieza('c', { layer: 2 })], selectedInternalLine: null, hotId: null,
  isDragging: false, contextMenuOpen: false, calibrationActive: false,
  hiddenLayerIds: [] as number[], layerLocked: {} as Record<number, boolean>,
};

describe('cotasDelSujeto', () => {
  it('rectángulo sin selección: sin cotas', () => {
    const s = cotasDelSujeto({ ...base, activeTool: 'rectangle', selectedPieceIds: [] });
    expect(s.cotas).toEqual([]);
  });
  it('rectángulo con la pieza recién creada seleccionada: caliente, dos cotas, "la pieza nueva"', () => {
    const s = cotasDelSujeto({ ...base, activeTool: 'rectangle', selectedPieceIds: ['a'], hotId: 'a' });
    expect(s.caliente).toBe(true);
    expect(s.cotas.map(c => c.id)).toEqual(['ancho', 'alto']);
  });
  it('select con una pieza: no caliente aunque el hotId coincida, "la pieza seleccionada"', () => {
    const s = cotasDelSujeto({ ...base, activeTool: 'select', selectedPieceIds: ['a'], hotId: 'a' });
    expect(s.caliente).toBe(false);
    expect(s.cotas).toHaveLength(2);
  });
  it('pieza bloqueada: cotas presentes pero deshabilitadas', () => {
    const s = cotasDelSujeto({ ...base, activeTool: 'select', selectedPieceIds: ['b'] });
    expect(s.disabled).toBe(true);
    expect(s.cotas).toHaveLength(2);
  });
  it('capa bloqueada: cotas presentes pero deshabilitadas, como el candado de pieza', () => {
    const s = cotasDelSujeto({ ...base, activeTool: 'select', selectedPieceIds: ['c'], layerLocked: { 2: true } });
    expect(s.disabled).toBe(true);
    expect(s.cotas).toHaveLength(2);
  });
  it.each([
    ['capa oculta', { selectedPieceIds: ['c'], hiddenLayerIds: [2] }],
    ['dos piezas', { selectedPieceIds: ['a', 'b'] }],
    ['arrastrando', { selectedPieceIds: ['a'], isDragging: true }],
    ['menú abierto', { selectedPieceIds: ['a'], contextMenuOpen: true }],
    ['calibrando', { selectedPieceIds: ['a'], calibrationActive: true }],
    ['otra herramienta', { selectedPieceIds: ['a'], activeTool: 'pen' as const }],
    ['pieza que ya no existe', { selectedPieceIds: ['zzz'] }],
  ])('sin cotas: %s', (_n, over) => {
    const s = cotasDelSujeto({ ...base, activeTool: 'select', ...over } as Parameters<typeof cotasDelSujeto>[0]);
    expect(s.cotas).toEqual([]);
  });

  // PR B (spec § 3, § 13.2 hallazgo #11): la interna seleccionada tiene sus
  // propias cotas — antes de esta ronda, `selectedInternalLine` siempre
  // devolvía nada().
  describe('una interna seleccionada (PR B)', () => {
    const linea: InternalLine = {
      id: 'l1', type: 'reference',
      path: [{ type: 'M', values: [0, 20] }, { type: 'L', values: [50, 20] }],
    };
    const conLinea = pieza('a', { internals: [linea] });
    const baseConLinea = { ...base, pieces: [conLinea, base.pieces[1], base.pieces[2]] };

    it('con la línea presente en la pieza: cotas de tramo, "Editando: la línea seleccionada"', () => {
      const s = cotasDelSujeto({
        ...baseConLinea, activeTool: 'select', selectedPieceIds: ['a'],
        selectedInternalLine: { pieceId: 'a', lineId: 'l1' },
      });
      expect(s.cotas.length).toBeGreaterThan(0);
      expect(s.cotas.some(c => c.kind === 'tramo-largo')).toBe(true);
    });

    it('hallazgo #11 — lineId colgante (la línea ya no existe, p.ej. tras un undo): cae a las cotas de la pieza, no deja la tira en blanco', () => {
      const s = cotasDelSujeto({
        ...baseConLinea, activeTool: 'select', selectedPieceIds: ['a'],
        selectedInternalLine: { pieceId: 'a', lineId: 'no-existe' },
      });
      expect(s.cotas.map(c => c.id)).toEqual(['ancho', 'alto']);
    });

    it('hallazgo #11 — pieceId colgante (la pieza ya no existe): sin cotas, sin crash', () => {
      const s = cotasDelSujeto({
        ...baseConLinea, activeTool: 'select', selectedPieceIds: [],
        selectedInternalLine: { pieceId: 'no-existe', lineId: 'l1' },
      });
      expect(s.cotas).toEqual([]);
    });

    it('la línea de una pieza bloqueada: cotas presentes pero deshabilitadas', () => {
      const bloqueada = pieza('a', { internals: [linea], locked: true });
      const s = cotasDelSujeto({
        ...baseConLinea, pieces: [bloqueada, base.pieces[1], base.pieces[2]],
        activeTool: 'select', selectedPieceIds: ['a'],
        selectedInternalLine: { pieceId: 'a', lineId: 'l1' },
      });
      expect(s.disabled).toBe(true);
      expect(s.cotas.length).toBeGreaterThan(0);
    });
  });
});
