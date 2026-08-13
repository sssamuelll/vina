// @vitest-environment jsdom
import { configureStore } from '@reduxjs/toolkit';
import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { Provider } from 'react-redux';
import type { PatternPiece } from '../../../../types/types';
import constructionReducer from '../../../../store/constructionSlice';
import projectReducer from '../../../../store/projectSlice';
import simulationReducer from '../../../../store/simulationSlice';
import { pathToSVG } from '../../utils';
import PieceRenderer from '../PieceRenderer';

afterEach(cleanup);

const piece: PatternPiece = {
  id: 'net-piece',
  name: 'Neta',
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
  edges: [{
    id: 'net-piece:top',
    name: 'top',
    segmentRange: [1, 2],
    edgeType: 'seam',
    seamAllowanceSpans: [{ tStart: 0.25, tEnd: 0.75, width: 20 }],
  }],
  active: true,
  createdAt: 0,
  updatedAt: 0,
};

describe('PieceRenderer — tramo de margen en pieza neta', () => {
  it('dibuja como línea de corte el tramo ensanchado y conserva el resto neto', () => {
    const store = configureStore({
      reducer: {
        construction: constructionReducer,
        project: projectReducer,
        simulation: simulationReducer,
      },
    });
    const view = render(
      <Provider store={store}>
        <svg>
          <PieceRenderer
            pieces={[piece]}
            selectedPieceIds={[]}
            zoom2D={1}
            showSeamAllowance
            showGrainlines={false}
            showPieceNames={false}
            renderMode2D="wireframe"
            showLineLengths={false}
            units="mm"
          />
        </svg>
      </Provider>,
    );

    const cutPath = view.getByTestId('piece-cut-line').getAttribute('d');
    expect(cutPath).not.toBe(pathToSVG(piece.outline));
    expect(cutPath).toContain('25,-20');
    expect(cutPath).toContain('75,-20');
  });
});
