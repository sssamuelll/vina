/**
 * `transferDart` de punta a punta: registro → tool → op geométrica → dispatch →
 * estado → **lo que el lienzo dibuja**.
 *
 * Corre contra el registry de verdad (`getDefaultRegistry`) y un store de
 * verdad, no contra mocks: si el tool se desregistra, si cambia la firma, o si
 * el dispatch deja de aplicarse, esto se pone rojo.
 *
 * Nacido en #1009 (donde solo llegaba hasta `piece.darts`) y completado en
 * #1016: el render 2D dibuja `piece.internals` (`PieceRenderer.tsx:209`), así
 * que las aserciones que valen son las que miran ahí. Ver la enmienda de
 * D1-real § 3.1 — el bridge ahora tiene escritura de vuelta obligatoria.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { configureStore } from '@reduxjs/toolkit';
import projectReducer, { addPiece } from '../../../../store/projectSlice';
import { getDefaultRegistry, resetDefaultRegistry } from '../registry';
import type { AppDispatch, RootState } from '../../../../store';
import type { Dart, InternalLine, PatternPiece } from '../../../../types/types';

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

/** Lo que el lienzo 2D dibuja de esta pieza. */
function dartLinesFrom(store: ReturnType<typeof makeStore>): InternalLine[] {
  return pieceFrom(store).internals.filter(l => l.type === 'dart');
}

describe('transferDart — camino copilot→tool→lienzo (#1009, #1016)', () => {
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

  // El corazón de #1016: sin esto la pinza se movía en Redux y en pantalla se
  // quedaba clavada en el escote.
  it('mueve la línea que el lienzo dibuja, no solo el estado de dominio', async () => {
    const registry = getDefaultRegistry();
    await registry.execute('extractDarts', { pieceId: PIECE_ID });
    const dartId = (pieceFrom(store).darts as Dart[])[0].id;

    await registry.execute('transferDart', { pieceId: PIECE_ID, dartId, toEdge: 'sideSeam' });

    const lines = dartLinesFrom(store);
    expect(lines).toHaveLength(1);            // ni duplicada ni huérfana

    // Bases sobre el borde destino (y ≈ 120 = 20% del alto), centradas en x=200
    // con el intake de 24 intacto. Antes: bases en y=0, x≈88/112.
    const [base1, apex, base2] = lines[0].path.map(c => c.values);
    expect(base1[0]).toBeCloseTo(188, 6);
    expect(base1[1]).toBeCloseTo(120, 6);
    expect(base2[0]).toBeCloseTo(212, 6);
    expect(base2[1]).toBeCloseTo(120, 6);
    expect(apex[0]).toBeCloseTo(200, 6);
    expect(apex[1]).toBeCloseTo(300, 6);
  });

  // Espacio de ids unificado (#1016): el dart de dominio y su línea de
  // almacenamiento son el mismo id, así que `listDarts` devuelve ids que
  // `segmentDart` y `shapeDartCap` aceptan.
  it('el id del dart es el de su línea, y sobrevive a la transferencia', async () => {
    const registry = getDefaultRegistry();
    await registry.execute('extractDarts', { pieceId: PIECE_ID });
    expect((pieceFrom(store).darts as Dart[])[0].id).toBe('dart-line-1');

    await registry.execute('transferDart', { pieceId: PIECE_ID, dartId: 'dart-line-1', toEdge: 'sideSeam' });

    expect((pieceFrom(store).darts as Dart[])[0].id).toBe('dart-line-1');
    expect(dartLinesFrom(store)[0].id).toBe('dart-line-1');

    // Y el tool de la otra convención lo acepta: era el síntoma que separaba
    // las dos mitades de la familia de tools.
    const shaped = await registry.execute('shapeDartCap', {
      pieceId: PIECE_ID, dartId: 'dart-line-1', capShape: 'curved',
    });
    expect(shaped.success).toBe(true);
  });

  // El camino que recorre María: pedirle al copilot que mueva la pinza sin
  // haber corrido `extractDarts` a mano antes.
  it('funciona sin extractDarts previo (piece.darts viene undefined)', async () => {
    expect(pieceFrom(store).darts).toBeUndefined();

    const result = await getDefaultRegistry().execute('transferDart', {
      pieceId: PIECE_ID,
      dartId: 'dart-line-1',
      toEdge: 'sideSeam',
    });

    expect(result.success).toBe(true);
    expect(dartLinesFrom(store)[0].path[0].values[1]).toBeCloseTo(120, 6);
  });

  it('devuelve success:false con el motivo si el dart no existe', async () => {
    const before = dartLinesFrom(store)[0];

    const result = await getDefaultRegistry().execute('transferDart', {
      pieceId: PIECE_ID,
      dartId: 'no-existe',
      toEdge: 'sideSeam',
    });

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/no-existe/);
    expect(dartLinesFrom(store)[0]).toEqual(before); // y no tocó nada
  });

  it('devuelve success:false con el motivo si el borde destino no existe', async () => {
    const before = dartLinesFrom(store)[0];

    const result = await getDefaultRegistry().execute('transferDart', {
      pieceId: PIECE_ID,
      dartId: 'dart-line-1',
      toEdge: 'costadillo-que-no-existe',
    });

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/costadillo-que-no-existe/);
    expect(dartLinesFrom(store)[0]).toEqual(before);
  });
});
