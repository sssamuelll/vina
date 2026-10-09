import type { Middleware } from '@reduxjs/toolkit';
import { DESHACER_DEL_AGENTE } from './actions';
import { getHistory } from './undoMiddleware';
import { undo } from './editorSlice';
import { showInfoToast } from './copilotUISlice';
import type { RootState } from './index';

/** Lo que lee María si su «Deshacer» ya no puede deshacer solo el borrado (aprobado el 2026-10-09). */
export const TEXTO_YA_NO_SE_PUEDE = 'No se deshizo nada porque después hubo otros cambios; usa Deshacer hasta que vuelva lo borrado';

/**
 * El puente del «Deshacer» de un aviso de borrado del agente.
 *
 * @cascade
 * shape: plain-action bridge (como `resewBridgeMiddleware`)
 * triggers: global/deshacerDelAgente (botón de un toast)
 * dispatches: editor/undo si el paso sigue siendo el último; si no, copilotUI/showToast con qué hacer
 * guard: lo borrado sigue sin estar, y el último paso del historial es ese (etiqueta e instante)
 * undo: es María deshaciendo; el timeline lo cuenta como deshacer rápido tras el agente
 * cap-depth: 1
 *
 * Por qué la guarda: si después del borrado hubo otro paso, deshacer ahora se
 * llevaría ese otro y dejaría lo borrado donde está.
 */
export const deshacerDelAgenteMiddleware: Middleware = (store) => (next) => (action) => {
  if (!DESHACER_DEL_AGENTE.match(action)) return next(action);
  const { etiqueta, instante, pieza, interna } = action.payload;
  // Lo borrado ya volvió (Ctrl+Z de María, `undo` del agente): no hay nada que
  // deshacer, y mandarla a deshacer más le quitaría trabajo suyo.
  const piezas = (store.getState() as RootState).project.pieces;
  const queda = piezas.find(p => p.id === pieza);
  if (interna ? queda?.internals.some(l => l.id === interna) : queda) return undefined;
  const ultimo = getHistory().past.at(-1);
  if (ultimo && ultimo.label === etiqueta && ultimo.timestamp === instante) return store.dispatch(undo());
  return store.dispatch(showInfoToast(TEXTO_YA_NO_SE_PUEDE));
};
