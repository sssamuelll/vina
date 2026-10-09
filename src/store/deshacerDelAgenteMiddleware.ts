import type { Middleware } from '@reduxjs/toolkit';
import { DESHACER_DEL_AGENTE } from './actions';
import { getHistory } from './undoMiddleware';
import { undo } from './editorSlice';
import { showInfoToast } from './copilotUISlice';

/** Lo que lee María si su «Deshacer» ya no puede deshacer solo el borrado (aprobado el 2026-10-09). */
export const TEXTO_YA_NO_SE_PUEDE = 'No se deshizo nada porque después hubo otros cambios; usa Deshacer hasta que vuelva lo borrado';

/**
 * El puente del «Deshacer» de un aviso de borrado del agente.
 *
 * @cascade
 * shape: plain-action bridge (como `resewBridgeMiddleware`)
 * triggers: global/deshacerDelAgente (botón de un toast)
 * dispatches: editor/undo si el paso sigue siendo el último; si no, copilotUI/showToast con qué hacer
 * guard: la etiqueta y el instante del último paso del historial
 * undo: es María deshaciendo; el timeline lo cuenta como deshacer rápido tras el agente
 * cap-depth: 1
 *
 * Por qué la guarda: si después del borrado hubo otro paso, deshacer ahora se
 * llevaría ese otro y dejaría lo borrado donde está.
 */
export const deshacerDelAgenteMiddleware: Middleware = (store) => (next) => (action) => {
  if (!DESHACER_DEL_AGENTE.match(action)) return next(action);
  const ultimo = getHistory().past.at(-1);
  if (ultimo && ultimo.label === action.payload.etiqueta && ultimo.timestamp === action.payload.instante) {
    return store.dispatch(undo());
  }
  return store.dispatch(showInfoToast(TEXTO_YA_NO_SE_PUEDE));
};
