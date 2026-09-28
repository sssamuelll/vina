// @vitest-environment jsdom
/**
 * El tramo de CIERRE de una interna cerrada, elegido, se resalta como los
 * demás: del último ancla al primero (revisión final de la frontera, M-7).
 *
 * Supr en Z se lleva el tramo elegido (spec 2026-09-24 § 4.6), también el de
 * cierre —con su `segmentIndex` en la `Z`, la convención de `nearestSegment`
 * y del resalte del overlay de Q—. Si `PieceRenderer` no lo pinta, Supr borra
 * algo que no se ve: lo contrario de «lo que se ve es lo que se borra».
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
  id: 'p',
  name: 'P',
  outline: [
    { type: 'M', values: [0, 0] },
    { type: 'L', values: [100, 0] },
    { type: 'L', values: [100, 100] },
    { type: 'L', values: [0, 100] },
    { type: 'Z', values: [] },
  ],
  internals: [
    {
      id: 'C',
      type: 'reference',
      path: [
        { type: 'M', values: [20, 20] },
        { type: 'L', values: [80, 20] },
        { type: 'L', values: [50, 70] },
        { type: 'Z', values: [] },
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

function renderTramo(segmentIndex: number) {
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
          piezaConPuntosDeCurva={null}
          piezaEditadaEnQ={null}
          units="mm"
          selectedInternalLine={{ pieceId: piece.id, lineId: 'C', segmentIndex }}
        />
      </svg>
    </Provider>,
  );
}

describe('PieceRenderer — el tramo elegido de una interna cerrada', () => {
  it('el de cierre (su índice es el de la Z) se pinta del último ancla al primero', () => {
    const view = renderTramo(3);
    const resalte = view.container.querySelector('[data-internal-line-segment="3"]');
    expect(resalte).not.toBeNull();
    expect(resalte!.getAttribute('d')).toBe('M50,70 L20,20');
  });

  it('control: uno de los otros, como siempre', () => {
    const view = renderTramo(2);
    expect(view.container.querySelector('[data-internal-line-segment="2"]')!.getAttribute('d')).toBe('M80,20 L50,70');
  });
});
