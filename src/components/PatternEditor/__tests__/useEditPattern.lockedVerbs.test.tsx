// @vitest-environment jsdom
/**
 * Candado en los verbos de useEditPattern (hallazgo de la sesión del tool
 * Punto): convertSegment / convertSegmentToPoints / addPointOnSegment
 * resolvían la pieza por pieceId explícito SIN chequear piece.locked — el
 * gate `notLocked` vivía solo en la puerta del menú contextual
 * (actionCuration), así que cualquier caller nuevo (el tool Punto) escribía
 * sobre piezas bloqueadas. El guard vive ahora en la puerta común.
 */
import { describe, it, expect } from 'vitest';
import { act } from '@testing-library/react';
import type { PatternPiece } from '../../../types/types';
import { setup } from './editPatternHarness';

function makePiece(locked: boolean): PatternPiece {
  return {
    id: 'p1',
    name: 'P1',
    outline: [
      { type: 'M', values: [0, 0] },
      { type: 'L', values: [100, 0] },
      { type: 'L', values: [100, 100] },
      { type: 'L', values: [0, 100] },
      { type: 'Z', values: [] },
    ],
    internals: [],
    position: { x: 0, y: 0 },
    rotation: 0,
    mirrored: false,
    seamAllowance: 0,
    layer: 1,
    sublayer: 0,
    active: true,
    locked,
    createdAt: 0,
    updatedAt: 0,
  } as PatternPiece;
}

const outlineOf = (store: ReturnType<typeof setup>['store']) =>
  store.getState().project.pieces[0].outline;

describe('useEditPattern — candado en los verbos (pieceId explícito)', () => {
  it('addPointOnSegment sobre pieza bloqueada no escribe y avisa', () => {
    const { store, ref } = setup(makePiece(true));
    const before = outlineOf(store);
    act(() => ref.current!.addPointOnSegment(1, 0.5, 'p1'));
    expect(outlineOf(store)).toBe(before);
    expect(JSON.stringify(store.getState())).toContain('bloqueada');
  });

  it('convertSegment sobre pieza bloqueada no escribe', () => {
    const { store, ref } = setup(makePiece(true));
    const before = outlineOf(store);
    act(() => ref.current!.convertSegment(1, true, 'p1'));
    expect(outlineOf(store)).toBe(before);
  });

  it('convertSegmentToPoints sobre pieza bloqueada no escribe', () => {
    const { store, ref } = setup(makePiece(true));
    const before = outlineOf(store);
    act(() => ref.current!.convertSegmentToPoints(1, 'p1'));
    expect(outlineOf(store)).toBe(before);
  });

  it('control positivo: desbloqueada, addPointOnSegment inserta un comando', () => {
    const { store, ref } = setup(makePiece(false));
    const before = outlineOf(store);
    act(() => ref.current!.addPointOnSegment(1, 0.5, 'p1'));
    const after = outlineOf(store);
    expect(after.length).toBe(before.length + 1);
    expect(after[1].values).toEqual([50, 0]);
  });
});
