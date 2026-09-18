/**
 * El lado en la escalera del sujeto (#1167, spec 2026-09-18 § 3.1).
 *
 * Un lado seleccionado manda sobre la pieza que lo contiene —la misma regla de
 * especificidad que ya hace ganar a la interna y al punto— y enseña UNA sola
 * caja, no las de sus hermanos (§ 5.1 del 08-09: «me sobresatura toda la
 * información»).
 */
import { describe, it, expect } from 'vitest';
import { cotasDelSujeto } from '../sujeto';
import type { PatternPiece, PathCommand } from '../../../../types/types';

const rect = (w: number, h: number): PathCommand[] => [
  { type: 'M', values: [0, 0] }, { type: 'L', values: [w, 0] }, { type: 'L', values: [w, h] }, { type: 'L', values: [0, h] }, { type: 'Z', values: [] },
];
const pieza = (id: string, over: Partial<PatternPiece> = {}): PatternPiece => ({
  id, name: id, outline: rect(200, 100), internals: [], position: { x: 0, y: 0 }, rotation: 0, mirrored: false,
  seamAllowance: 0, active: true, createdAt: 0, updatedAt: 0, ...over,
} as PatternPiece);
const base = {
  pieces: [pieza('a'), pieza('b', { locked: true }), pieza('c', { layer: 2 })],
  selectedInternalLine: null, hotId: null,
  isDragging: false, contextMenuOpen: false, calibrationActive: false,
  hiddenLayerIds: [] as number[], layerLocked: {} as Record<number, boolean>,
};
const def = { width: 300, height: 150 };

describe('cotasDelSujeto — el lado', () => {
  it('un lado seleccionado gana a la pieza: su caja, no Ancho y Alto', () => {
    const s = cotasDelSujeto({
      ...base, activeTool: 'select', selectedPieceIds: ['a'],
      ladoSeleccionado: { pieceId: 'a', commandIndex: 1 },
    }, def);
    expect(s.cotas.map(c => c.kind)).toEqual(['tramo-largo', 'tramo-angulo']);
    expect(s.cotas[0].valueMm).toBeCloseTo(200, 6);
    expect(s.lineaDeSujeto).toBe('Editando: el lado seleccionado');
    expect(s.piece?.id).toBe('a');
  });

  it('el lado de cierre también es sujeto', () => {
    const s = cotasDelSujeto({
      ...base, activeTool: 'select', selectedPieceIds: ['a'],
      ladoSeleccionado: { pieceId: 'a', commandIndex: 0 },
    }, def);
    expect(s.cotas).toHaveLength(2);
    expect(s.cotas[0].valueMm).toBeCloseTo(100, 6);
  });

  it('vale en Editar patrón, que es de donde llega el clic sobre el lado', () => {
    const s = cotasDelSujeto({
      ...base, activeTool: 'editPattern', selectedPieceIds: [],
      ladoSeleccionado: { pieceId: 'a', commandIndex: 2 },
    }, def);
    expect(s.cotas).toHaveLength(2);
    expect(s.cotas[0].valueMm).toBeCloseTo(100, 6);
  });

  it('un punto seleccionado gana al lado: lo más fino manda', () => {
    const s = cotasDelSujeto({
      ...base, activeTool: 'editPattern', selectedPieceIds: [],
      nodoSeleccionado: { pieceId: 'a', commandIndex: 1 },
      ladoSeleccionado: { pieceId: 'a', commandIndex: 1 },
    }, def);
    expect(s.lineaDeSujeto).toBe('Editando: el punto seleccionado');
  });

  it('pieza bloqueada: la caja sale, apagada', () => {
    const s = cotasDelSujeto({
      ...base, activeTool: 'select', selectedPieceIds: ['b'],
      ladoSeleccionado: { pieceId: 'b', commandIndex: 1 },
    }, def);
    expect(s.disabled).toBe(true);
    expect(s.cotas).toHaveLength(2);
  });

  it('capa bloqueada: mismo candado que el de pieza', () => {
    const s = cotasDelSujeto({
      ...base, activeTool: 'select', selectedPieceIds: ['c'], layerLocked: { 2: true },
      ladoSeleccionado: { pieceId: 'c', commandIndex: 1 },
    }, def);
    expect(s.disabled).toBe(true);
    expect(s.cotas).toHaveLength(2);
  });

  it('capa oculta: sin cotas, aunque el lado siga elegido', () => {
    const s = cotasDelSujeto({
      ...base, activeTool: 'select', selectedPieceIds: ['c'], hiddenLayerIds: [2],
      ladoSeleccionado: { pieceId: 'c', commandIndex: 1 },
    }, def);
    expect(s.cotas).toEqual([]);
  });

  it('arrastrando no hay caja: durante el gesto las cotas se callan', () => {
    const s = cotasDelSujeto({
      ...base, activeTool: 'select', selectedPieceIds: ['a'], isDragging: true,
      ladoSeleccionado: { pieceId: 'a', commandIndex: 1 },
    }, def);
    expect(s.cotas).toEqual([]);
  });

  it('una pieza que ya no existe (deshacer) no deja la tira mintiendo', () => {
    const s = cotasDelSujeto({
      ...base, activeTool: 'select', selectedPieceIds: ['a'],
      ladoSeleccionado: { pieceId: 'zzz', commandIndex: 1 },
    }, def);
    expect(s.lineaDeSujeto).not.toBe('Editando: el lado seleccionado');
  });

  it('un lado que ya no existe cae a la pieza, no a una caja vacía', () => {
    const s = cotasDelSujeto({
      ...base, activeTool: 'select', selectedPieceIds: ['a'],
      ladoSeleccionado: { pieceId: 'a', commandIndex: 99 },
    }, def);
    expect(s.cotas.map(c => c.id)).toEqual(['ancho', 'alto']);
  });

  it('sin lado elegido, la pieza conserva Ancho y Alto tal cual', () => {
    const s = cotasDelSujeto({ ...base, activeTool: 'select', selectedPieceIds: ['a'] }, def);
    expect(s.cotas.map(c => c.id)).toEqual(['ancho', 'alto']);
  });
});
