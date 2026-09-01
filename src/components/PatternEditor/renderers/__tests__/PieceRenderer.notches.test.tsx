// @vitest-environment jsdom
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
      id: 'notch-top',
      type: 'notch',
      path: [
        { type: 'M', values: [50, 0] },
        { type: 'L', values: [50, 8] },
      ],
    },
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

function renderPiece(showNotches: boolean) {
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
          showNotches={showNotches}
          showPieceNames={false}
          renderMode2D="wireframe"
          showLineLengths={false}
          units="mm"
        />
      </svg>
    </Provider>,
  );
}

describe('PieceRenderer — visibilidad de piquetes', () => {
  it('oculta solo el piquete y conserva las demás líneas internas', () => {
    const view = renderPiece(false);

    expect(view.container.querySelector('[data-internal-line-type="notch"]')).toBeNull();
    expect(view.container.querySelector('[data-internal-line-type="reference"]')).not.toBeNull();
  });

  it('dibuja el piquete cuando su capa está activa', () => {
    const view = renderPiece(true);

    expect(view.container.querySelector('[data-internal-line-type="notch"]')).not.toBeNull();
  });
});
