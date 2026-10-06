// @vitest-environment jsdom
/**
 * Lo que no se agarra no se pinta (P3b). Las puntas de un piquete se
 * arrastraban con Seleccionar y el arrastre escribía el `path` sin su ancla:
 * el siguiente cambio del contorno lo devolvía a su sitio. Ya no se agarran,
 * por la misma lista que Q (`esInternaEditable`), y por eso tampoco se pintan.
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
  id: 'pieza',
  name: 'Pieza',
  outline: [
    { type: 'M', values: [0, 0] },
    { type: 'L', values: [100, 0] },
    { type: 'L', values: [100, 100] },
    { type: 'L', values: [0, 100] },
    { type: 'Z', values: [] },
  ],
  internals: [
    {
      id: 'piquete',
      type: 'notch',
      path: [{ type: 'M', values: [40, 0] }, { type: 'L', values: [40, 8] }],
      notchAnchor: { refPoint: { x: 0, y: 0 }, direction: 'cw', distanceMm: 40, metric: 2 },
    },
    {
      id: 'referencia',
      type: 'reference',
      path: [{ type: 'M', values: [20, 50] }, { type: 'L', values: [80, 50] }],
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

function renderCon(lineId: string) {
  const store = configureStore({
    reducer: { construction: constructionReducer, project: projectReducer, simulation: simulationReducer },
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
          selectedInternalLine={{ pieceId: piece.id, lineId }}
        />
      </svg>
    </Provider>,
  );
}

describe('PieceRenderer — las puntas de un piquete (P3b)', () => {
  it('un piquete seleccionado no enseña puntas que agarrar', () => {
    expect(renderCon('piquete').container.querySelector('.internal-line-endpoints')).toBeNull();
  });

  it('control: una línea de referencia seleccionada sí las enseña', () => {
    expect(renderCon('referencia').container.querySelector('.internal-line-endpoints')).not.toBeNull();
  });
});
