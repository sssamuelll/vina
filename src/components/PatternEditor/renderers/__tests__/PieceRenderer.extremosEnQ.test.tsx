// @vitest-environment jsdom
/**
 * En Q, la pieza en edición ya pinta los puntos de sus internas en el overlay
 * (`EditPatternOverlay`): dos glifos en la misma coordenada son ruido (spec
 * 2026-09-24 § 3.3). `internal-line-endpoints` —el círculo de arrastre de una
 * interna elegida entera— se apaga solo para la pieza en edición en Q; para
 * cualquier otra sigue siendo la única señal. En V (`NodeEditorOverlay`)
 * todavía no hay puntos de internas —eso es la fase 5 de la spec—, así que
 * ahí también se quedan (revisión final de la frontera, M-5).
 */
import { configureStore } from '@reduxjs/toolkit';
import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { Provider } from 'react-redux';
import constructionReducer from '../../../../store/constructionSlice';
import projectReducer from '../../../../store/projectSlice';
import simulationReducer from '../../../../store/simulationSlice';
import type { PatternPiece } from '../../../../types/types';
import PieceRenderer from '../PieceRenderer';

afterEach(cleanup);

const piece: PatternPiece = {
  id: 'piece-with-internals',
  name: 'Pieza con internas',
  outline: [
    { type: 'M', values: [0, 0] },
    { type: 'L', values: [100, 0] },
    { type: 'L', values: [100, 100] },
    { type: 'L', values: [0, 100] },
    { type: 'Z', values: [] },
  ],
  internals: [
    {
      id: 'reference-center',
      type: 'reference',
      path: [
        { type: 'M', values: [20, 50] },
        { type: 'L', values: [80, 50] },
      ],
    },
  ],
  position: { x: 0, y: 0 },
  rotation: 0,
  mirrored: false,
  seamAllowance: 0,
  active: true,
  createdAt: 0,
  updatedAt: 0,
};

/** `piezaEditadaEnQ`: la pieza en edición en Q; con V, `null` y la pieza en `piezaConPuntosDeCurva`. */
function renderPiece(piezaConPuntosDeCurva: string | null, piezaEditadaEnQ: string | null = piezaConPuntosDeCurva) {
  const store = configureStore({
    reducer: {
      construction: constructionReducer,
      project: projectReducer,
      simulation: simulationReducer,
    },
  });
  return render(
    <Provider store={store}>
      <svg>
        <PieceRenderer
          pieces={[piece]}
          selectedPieceIds={[]}
          zoom2D={1}
          showSeamAllowance={false}
          showGrainlines
          showNotches
          showPieceNames={false}
          renderMode2D="wireframe"
          piezaConPuntosDeCurva={piezaConPuntosDeCurva}
          piezaEditadaEnQ={piezaEditadaEnQ}
          units="mm"
          selectedInternalLine={{ pieceId: piece.id, lineId: 'reference-center' }}
        />
      </svg>
    </Provider>,
  );
}

describe('PieceRenderer — extremos de interna en Q (spec 2026-09-24 § 3.3)', () => {
  it('con la pieza en edición en Q, no dibuja internal-line-endpoints: el overlay ya los pinta', () => {
    const view = renderPiece(piece.id);
    expect(view.container.querySelector('.internal-line-endpoints')).toBeNull();
  });

  it('con la pieza en edición en V, sí: su overlay no pinta todavía los puntos de las internas', () => {
    const view = renderPiece(piece.id, null);
    expect(view.container.querySelector('.internal-line-endpoints')).not.toBeNull();
  });

  it('sin ninguna pieza en edición de puntos, sigue dibujando internal-line-endpoints', () => {
    const view = renderPiece(null);
    expect(view.container.querySelector('.internal-line-endpoints')).not.toBeNull();
  });

  it('con OTRA pieza en edición de puntos, sigue dibujando internal-line-endpoints de esta', () => {
    const view = renderPiece('otra-pieza');
    expect(view.container.querySelector('.internal-line-endpoints')).not.toBeNull();
  });
});
