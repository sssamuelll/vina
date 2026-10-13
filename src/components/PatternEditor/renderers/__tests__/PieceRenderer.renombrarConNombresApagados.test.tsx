// @vitest-environment jsdom
/**
 * «Renombrar…» con los nombres de pieza apagados, que es como viene de
 * fábrica. El campo vive en el bloque de la etiqueta y ese bloque solo se
 * pintaba con `showPieceNames`: el menú prometía renombrar y no aparecía
 * nada. Mientras se renombra, el campo se pinta aunque los nombres estén
 * apagados; al terminar, la etiqueta vuelve a no verse.
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
  name: 'Delantero',
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
  active: true,
  createdAt: 0,
  updatedAt: 0,
};

function renderPieza(showPieceNames: boolean, editingPieceNameId: string | null) {
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
          showPieceNames={showPieceNames}
          renderMode2D="wireframe"
          piezaConPuntosDeCurva={null}
          piezaEditadaEnQ={null}
          units="mm"
          editingPieceNameId={editingPieceNameId}
        />
      </svg>
    </Provider>,
  );
}

describe('Renombrar con los nombres de pieza apagados', () => {
  it('pinta el campo con el nombre de la pieza', () => {
    const { container } = renderPieza(false, piece.id);
    const campo = container.querySelector('input[type="text"]') as HTMLInputElement | null;
    expect(campo).not.toBeNull();
    expect(campo!.defaultValue).toBe('Delantero');
  });

  it('sin renombrar, la etiqueta sigue sin verse', () => {
    const { container } = renderPieza(false, null);
    expect(container.querySelector('input[type="text"]')).toBeNull();
    expect(container.querySelector('.piece-label-block')).toBeNull();
  });

  it('con los nombres encendidos, la etiqueta se ve como siempre', () => {
    const { container } = renderPieza(true, null);
    expect(container.querySelector('.piece-label-block')).not.toBeNull();
  });
});
