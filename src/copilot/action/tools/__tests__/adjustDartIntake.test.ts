/**
 * `adjustDartIntake` de punta a punta (#1016).
 *
 * La otra mitad del mismo bug que `transferDart`: el tool escribía
 * `piece.darts` y el lienzo 2D dibuja `piece.internals`, así que ensanchar una
 * pinza cambiaba un número en Redux y nada en pantalla. Las aserciones que
 * valen son las que miran `internals`.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { configureStore } from '@reduxjs/toolkit';
import projectReducer, { addPiece } from '../../../../store/projectSlice';
import { getDefaultRegistry, resetDefaultRegistry } from '../registry';
import type { AppDispatch, RootState } from '../../../../store';
import type { Dart, InternalLine, PatternPiece } from '../../../../types/types';

const PIECE_ID = 'front-bodice';
const DART_LINE_ID = 'dart-line-1';

/** Pinza en V: bases en (100,400) y (120,400) → intake 20mm, ápice en (110,300). */
function bodiceWithDart(): PatternPiece {
  const now = Date.now();
  return {
    id: PIECE_ID,
    name: 'Front Bodice',
    outline: [
      { type: 'M', values: [0, 0] },
      { type: 'L', values: [400, 0] },
      { type: 'L', values: [400, 600] },
      { type: 'L', values: [0, 600] },
      { type: 'Z', values: [] },
    ],
    internals: [
      { id: 'gl', type: 'grainline', path: [{ type: 'M', values: [200, 0] }, { type: 'L', values: [200, 600] }] },
      {
        id: DART_LINE_ID,
        type: 'dart',
        path: [
          { type: 'M', values: [100, 400] },
          { type: 'L', values: [110, 300] },
          { type: 'L', values: [120, 400] },
        ],
      },
    ],
    position: { x: 0, y: 0 },
    rotation: 0,
    mirrored: false,
    seamAllowance: 0,
    active: true,
    createdAt: now,
    updatedAt: now,
  };
}

function makeStore() {
  const store = configureStore({ reducer: { project: projectReducer } });
  store.dispatch(addPiece(bodiceWithDart()));
  return store;
}

function internalsFrom(store: ReturnType<typeof makeStore>): InternalLine[] {
  const piece = store.getState().project.pieces.find(p => p.id === PIECE_ID);
  if (!piece) throw new Error('fixture piece missing');
  return piece.internals;
}

function dartLineFrom(store: ReturnType<typeof makeStore>): InternalLine {
  const line = internalsFrom(store).find(l => l.id === DART_LINE_ID);
  if (!line) throw new Error('dart line missing');
  return line;
}

describe('adjustDartIntake — camino copilot→tool→lienzo (#1016)', () => {
  let store: ReturnType<typeof makeStore>;

  beforeEach(() => {
    resetDefaultRegistry();
    store = makeStore();
    getDefaultRegistry().setContext(
      store.dispatch as unknown as AppDispatch,
      () => store.getState() as unknown as RootState,
    );
  });

  it('ensancha la línea que el lienzo dibuja, no solo el estado de dominio', async () => {
    const result = await getDefaultRegistry().execute('adjustDartIntake', {
      pieceId: PIECE_ID, dartId: DART_LINE_ID, deltaMm: 10,
    });
    expect(result.success).toBe(true);

    // Bases separadas 5mm más por lado: (100,400)→(95,400) y (120,400)→(125,400).
    const path = dartLineFrom(store).path;
    expect(path[0].values[0]).toBeCloseTo(95, 6);
    expect(path[2].values[0]).toBeCloseTo(125, 6);
    // El ápice no se mueve al ajustar intake.
    expect(path[1].values).toEqual([110, 300]);
  });

  it('estrecha con delta negativo', async () => {
    await getDefaultRegistry().execute('adjustDartIntake', {
      pieceId: PIECE_ID, dartId: DART_LINE_ID, deltaMm: -8,
    });

    const path = dartLineFrom(store).path;
    expect(path[0].values[0]).toBeCloseTo(104, 6);
    expect(path[2].values[0]).toBeCloseTo(116, 6);
  });

  it('el dominio y el almacenamiento quedan de acuerdo', async () => {
    await getDefaultRegistry().execute('adjustDartIntake', {
      pieceId: PIECE_ID, dartId: DART_LINE_ID, deltaMm: 10,
    });

    const piece = store.getState().project.pieces.find(p => p.id === PIECE_ID)!;
    const dart = (piece.darts as Dart[])[0];
    expect(dart.id).toBe(DART_LINE_ID);   // mismo espacio de ids
    expect(dart.intake).toBeCloseTo(30, 6);
  });

  it('no toca los internals que no son dart', async () => {
    const grainlineBefore = internalsFrom(store).find(l => l.id === 'gl');

    await getDefaultRegistry().execute('adjustDartIntake', {
      pieceId: PIECE_ID, dartId: DART_LINE_ID, deltaMm: 10,
    });

    expect(internalsFrom(store).find(l => l.id === 'gl')).toEqual(grainlineBefore);
  });

  it('falla con motivo si el dart no existe', async () => {
    const before = dartLineFrom(store);

    const result = await getDefaultRegistry().execute('adjustDartIntake', {
      pieceId: PIECE_ID, dartId: 'no-existe', deltaMm: 10,
    });

    expect(result.success).toBe(false);
    expect(dartLineFrom(store)).toEqual(before);
  });
});
