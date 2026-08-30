import { describe, it, expect } from 'vitest';
import { cotasDelSujeto } from '../sujeto';
import type { PatternPiece, PathCommand } from '../../../../types/types';

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
  pieces: [pieza('a'), pieza('b', { locked: true })], selectedInternalLine: null, hotId: null,
  isDragging: false, contextMenuOpen: false, calibrationActive: false,
};
const def = { width: 300, height: 150 };

describe('cotasDelSujeto', () => {
  it('rectángulo sin selección: sin cotas y la línea dice el tamaño del próximo clic', () => {
    const s = cotasDelSujeto({ ...base, activeTool: 'rectangle', selectedPieceIds: [] }, def);
    expect(s.cotas).toEqual([]);
    expect(s.lineaDeSujeto).toBe('Un clic crea 300 × 150 mm · arrastra para dibujar');
  });
  it('rectángulo con la pieza recién creada seleccionada: caliente, dos cotas, "la pieza nueva"', () => {
    const s = cotasDelSujeto({ ...base, activeTool: 'rectangle', selectedPieceIds: ['a'], hotId: 'a' }, def);
    expect(s.caliente).toBe(true);
    expect(s.cotas.map(c => c.id)).toEqual(['ancho', 'alto']);
    expect(s.lineaDeSujeto).toBe('Editando: la pieza nueva');
  });
  it('select con una pieza: no caliente aunque el hotId coincida, "la pieza seleccionada"', () => {
    const s = cotasDelSujeto({ ...base, activeTool: 'select', selectedPieceIds: ['a'], hotId: 'a' }, def);
    expect(s.caliente).toBe(false);
    expect(s.cotas).toHaveLength(2);
    expect(s.lineaDeSujeto).toBe('Editando: la pieza seleccionada');
  });
  it('pieza bloqueada: cotas presentes pero deshabilitadas', () => {
    const s = cotasDelSujeto({ ...base, activeTool: 'select', selectedPieceIds: ['b'] }, def);
    expect(s.disabled).toBe(true);
    expect(s.cotas).toHaveLength(2);
  });
  it.each([
    ['dos piezas', { selectedPieceIds: ['a', 'b'] }],
    ['una interna seleccionada', { selectedPieceIds: ['a'], selectedInternalLine: { pieceId: 'a', lineId: 'l' } }],
    ['arrastrando', { selectedPieceIds: ['a'], isDragging: true }],
    ['menú abierto', { selectedPieceIds: ['a'], contextMenuOpen: true }],
    ['calibrando', { selectedPieceIds: ['a'], calibrationActive: true }],
    ['otra herramienta', { selectedPieceIds: ['a'], activeTool: 'pen' as const }],
    ['pieza que ya no existe', { selectedPieceIds: ['zzz'] }],
  ])('sin cotas: %s', (_n, over) => {
    const s = cotasDelSujeto({ ...base, activeTool: 'select', ...over } as Parameters<typeof cotasDelSujeto>[0], def);
    expect(s.cotas).toEqual([]);
  });
});
