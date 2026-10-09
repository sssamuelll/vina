import { describe, it, expect } from 'vitest';
import { DESHACER_DEL_AGENTE } from '../actions';
import { batchUndo, getHistory, withAgentHistorySource } from '../undoMiddleware';
import { updatePiece } from '../projectSlice';
import { TEXTO_YA_NO_SE_PUEDE } from '../deshacerDelAgenteMiddleware';
import { pieza, tienda } from '../../copilot/superficie/__tests__/fixtures';

/** Un paso del agente, como lo deja `actuar`. */
function pasoDelAgente(store: ReturnType<typeof tienda>['store'], nombre: string) {
  withAgentHistorySource('remove', () => batchUndo(store.dispatch, `IA: ${nombre}`, () => {
    store.dispatch(updatePiece({ ...store.getState().project.pieces[0], name: nombre }));
  }));
  const paso = getHistory().past.at(-1)!;
  return DESHACER_DEL_AGENTE({ etiqueta: paso.label, instante: paso.timestamp });
}

describe('el «Deshacer» del aviso de un borrado del agente', () => {
  it('deshace ese paso mientras sea el último', () => {
    const { store } = tienda([pieza('a', [100])]);
    const accion = pasoDelAgente(store, 'uno');
    store.dispatch(accion);
    expect(store.getState().project.pieces[0].name).toBe('a');
  });
  it('si después hubo otro paso no deshace nada, y el aviso dice qué hacer', () => {
    const { store } = tienda([pieza('a', [100])]);
    const accion = pasoDelAgente(store, 'uno');
    store.dispatch(updatePiece({ ...store.getState().project.pieces[0], name: 'de María' }));
    store.dispatch(accion);
    expect(store.getState().project.pieces[0].name).toBe('de María');
    expect(store.getState().copilotUI.toasts.at(-1)).toMatchObject({ type: 'info', message: TEXTO_YA_NO_SE_PUEDE });
  });
});
