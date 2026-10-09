import { describe, it, expect } from 'vitest';
import { DESHACER_DEL_AGENTE } from '../actions';
import { batchUndo, getHistory, withAgentHistorySource } from '../undoMiddleware';
import { removePieces, updatePiece } from '../projectSlice';
import { TEXTO_YA_NO_SE_PUEDE } from '../deshacerDelAgenteMiddleware';
import { pieza, tienda } from '../../copilot/superficie/__tests__/fixtures';

/** Un borrado del agente, como lo deja `remove`: quita la pieza `b` en un paso suyo. */
function borradoDelAgente(store: ReturnType<typeof tienda>['store']) {
  withAgentHistorySource('remove', () => batchUndo(store.dispatch, 'IA: borrar b', () => {
    store.dispatch({ ...removePieces(['b']), meta: { skipConfirmation: true } });
  }));
  const paso = getHistory().past.at(-1)!;
  return DESHACER_DEL_AGENTE({ etiqueta: paso.label, instante: paso.timestamp, pieza: 'b' });
}

describe('el «Deshacer» del aviso de un borrado del agente', () => {
  it('deshace ese paso mientras sea el último', () => {
    const { store } = tienda([pieza('a', [100]), pieza('b', [100])]);
    store.dispatch(borradoDelAgente(store));
    expect(store.getState().project.pieces.map(p => p.id)).toEqual(['a', 'b']);
  });
  it('si después hubo otro paso no deshace nada, y el aviso dice qué hacer', () => {
    const { store } = tienda([pieza('a', [100]), pieza('b', [100])]);
    const accion = borradoDelAgente(store);
    store.dispatch(updatePiece({ ...store.getState().project.pieces[0], name: 'de María' }));
    store.dispatch(accion);
    expect(store.getState().project.pieces.map(p => p.name)).toEqual(['de María']);
    expect(store.getState().copilotUI.toasts.at(-1)).toMatchObject({ type: 'info', message: TEXTO_YA_NO_SE_PUEDE });
  });
  it('la etiqueta y el instante tienen que ser los dos del último paso', () => {
    for (const cambio of [{ etiqueta: 'IA: borrar otra' }, { instante: 1 }]) {
      const { store } = tienda([pieza('a', [100]), pieza('b', [100])]);
      const accion = borradoDelAgente(store);
      store.dispatch({ ...accion, payload: { ...accion.payload, ...cambio } });
      expect(store.getState().project.pieces.map(p => p.id)).toEqual(['a']);
      expect(store.getState().copilotUI.toasts.at(-1)).toMatchObject({ message: TEXTO_YA_NO_SE_PUEDE });
    }
  });
});
