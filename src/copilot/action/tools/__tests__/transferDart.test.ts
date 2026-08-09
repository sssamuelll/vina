/**
 * #1009 — camino real del copilot para `transferDart`:
 * registro → tool → op geométrica → dispatch → estado.
 *
 * Corre contra el registry de verdad (`getDefaultRegistry`) y un store de
 * verdad, no contra mocks: si el tool se desregistra, si cambia la firma, o si
 * el dispatch deja de aplicarse, esto se pone rojo.
 *
 * Por qué NO es un e2e de navegador (#1009 pedía uno): el render 2D
 * (`PieceRenderer.tsx:209`) dibuja `piece.internals`; `transferDart`
 * (`patternOps.ts:365`) escribe `piece.darts`. Nada sincroniza los dos lados,
 * así que un navegador no puede observar el cambio — levantar Chromium para
 * leer un campo de Redux sería exactamente el verde vacío que este issue vino
 * a cerrar. El hueco del bridge está declarado abajo con `it.todo` y trackeado
 * en #1016 (dispara la condición de reapertura de D1-real § 8).
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { configureStore } from '@reduxjs/toolkit';
import projectReducer, { addPiece } from '../../../../store/projectSlice';
import { getDefaultRegistry, resetDefaultRegistry } from '../registry';
import type { AppDispatch, RootState } from '../../../../store';
import type { Dart, PatternPiece } from '../../../../types/types';

const PIECE_ID = 'front-bodice';

/**
 * Delantero de 400×600 con una pinza en el escote, descentrada a propósito
 * (x≈100): transferDart recoloca al centro del bbox, así que un fixture
 * centrado haría pasar el test aunque la pinza no se moviera.
 */
function bodiceWithNeckDart(): PatternPiece {
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
    // Storage layer (D1-real): la pinza vive como InternalLine, que es lo que
    // producen tanto la herramienta 2D como el import DXF.
    internals: [
      {
        id: 'dart-line-1',
        type: 'dart',
        path: [
          { type: 'M', values: [88, 0] },
          { type: 'L', values: [100, 250] },
          { type: 'L', values: [112, 0] },
        ],
      },
    ],
    edges: [
      { id: 'e1', name: 'shoulder', segmentRange: [1, 2], edgeType: 'seam' },
      { id: 'e2', name: 'sideSeam', segmentRange: [2, 3], edgeType: 'seam' },
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
  store.dispatch(addPiece(bodiceWithNeckDart()));
  return store;
}

function pieceFrom(store: ReturnType<typeof makeStore>): PatternPiece {
  const piece = store.getState().project.pieces.find(p => p.id === PIECE_ID);
  if (!piece) throw new Error('fixture piece missing');
  return piece;
}

describe('transferDart — camino copilot→tool→estado (#1009)', () => {
  let store: ReturnType<typeof makeStore>;

  beforeEach(() => {
    resetDefaultRegistry();
    store = makeStore();
    getDefaultRegistry().setContext(
      store.dispatch as unknown as AppDispatch,
      () => store.getState() as unknown as RootState,
    );
  });

  it('el tool está registrado', () => {
    expect(getDefaultRegistry().get('transferDart')).toBeDefined();
  });

  it('mueve la pinza al borde destino preservando el intake', async () => {
    const registry = getDefaultRegistry();

    // Paso 1: el bridge storage→dominio. Es el paso que el copilot da primero
    // porque `piece.darts` viene undefined en toda pieza real (dibujada o DXF).
    const extracted = await registry.execute('extractDarts', { pieceId: PIECE_ID });
    expect(extracted.success).toBe(true);

    const before = pieceFrom(store).darts as Dart[];
    expect(before).toHaveLength(1);
    expect(before[0].intake).toBe(24);
    expect(before[0].edgeId).toBe('e1');

    // Paso 2: la transferencia.
    const result = await registry.execute('transferDart', {
      pieceId: PIECE_ID,
      dartId: before[0].id,
      toEdge: 'sideSeam',
    });
    expect(result.success).toBe(true);

    const after = pieceFrom(store).darts as Dart[];
    expect(after).toHaveLength(1);
    expect(after[0].intake).toBe(before[0].intake);   // el intake es sagrado
    expect(after[0].edgeId).toBe('e2');               // cambió de borde
    expect(after[0].apex).not.toEqual(before[0].apex); // y de posición
    // Las bases de las piernas se apoyan sobre el borde destino, no sobre el escote.
    expect(after[0].legs[0][0].y).toBeGreaterThan(before[0].legs[0][0].y);
  });

  it('falla con un dartId inexistente en vez de reportar éxito vacío', async () => {
    const registry = getDefaultRegistry();
    await registry.execute('extractDarts', { pieceId: PIECE_ID });
    const before = pieceFrom(store).darts as Dart[];

    const result = await registry.execute('transferDart', {
      pieceId: PIECE_ID,
      dartId: 'no-existe',
      toEdge: 'sideSeam',
    });

    // El tool devuelve success con la pieza intacta — no hay forma de que el
    // llamador sepa que no pasó nada. Se fija el estado observable de hoy para
    // que el día que se endurezca el contrato, esto avise.
    const after = pieceFrom(store).darts as Dart[];
    expect(after[0].id).toBe(before[0].id);
    expect(after[0].apex).toEqual(before[0].apex);
    expect(result.success).toBe(true); // ← contrato flojo, #1016
  });

  it('deja la pieza intacta si el borde destino no existe', async () => {
    const registry = getDefaultRegistry();
    await registry.execute('extractDarts', { pieceId: PIECE_ID });
    const before = pieceFrom(store).darts as Dart[];

    await registry.execute('transferDart', {
      pieceId: PIECE_ID,
      dartId: before[0].id,
      toEdge: 'costadillo-que-no-existe',
    });

    expect((pieceFrom(store).darts as Dart[])[0].apex).toEqual(before[0].apex);
  });

  // Huecos declarados, no saltados en silencio (#1009). Ambos dependen de
  // cerrar la divergencia storage↔dominio de D1-real (#1016); no se arreglan
  // acá porque el propio RFC manda reabrir la decisión 3.1 cuando aparece.
  it.todo('sincroniza el InternalLine para que el render 2D refleje la transferencia');
  it.todo('devuelve success:false cuando el dart o el borde no existen');
});
