import type { Dispatch } from '@reduxjs/toolkit';
import type { AppDispatch, RootState } from './index';
import { setActiveTool } from './editorSlice';
import { setActiveTool2D } from './toolSlice';
import type { Tool2D } from '../types/types';
import { getInternalLineEndpoints } from '../components/PatternEditor/internalShapePath';

/** Herramientas que SON el menú de costuras. Fuera de acá el patrón se está
 *  editando, no cosiendo (nota de María #210: "eso solo debería verse al
 *  activar el menu de costuras porque es información que molesta y no debería
 *  mostrarse mientras editamos el patron"). Es el único conjunto: lo lee el
 *  render de costuras (PatternEditor) y la regla de Supr (useKeyboardShortcuts,
 *  #1094) — dos listas se desincronizan, como pasó con walkSeam. */
export const SEWING_TOOL_IDS = new Set(['seam', 'seamEdit', 'walkSeam']);

/** La puerta necesita una pieza visible con geometría donde iniciar el trazo;
 *  una capa oculta no recibe clics en PatternEditor. El contorno y las internas
 *  sirven porque el primer punto también puede enganchar sus nodos o extremos.
 *  El bloqueo se comprueba al dibujar: conservar esa entrada permite explicar
 *  que la pieza está bloqueada, como exige la gramática de la herramienta. */
export function selectHasInternalShapeHost(state: RootState): boolean {
  return state.project.pieces.some(piece =>
    !state.simulation.hiddenLayerIds.includes(piece.layer ?? 1)
    && (piece.outline.length > 0 || piece.internals.some(line => getInternalLineEndpoints(line) !== null)),
  );
}

/**
 * The single writer for 2D tool activation.
 *
 * `editor.activeTool` is the drawing-engine truth (what a canvas click does);
 * `tools.activeTool2D` is the per-tool-options key + the gate for the two tools
 * (measure, walkSeam) built to read it. They are different facts, not copies —
 * so every activation site MUST set both, or a tool silently half-activates.
 * Route all 2D tool activation through here instead of hand-writing the pair.
 *
 * `id` is `string` (not `Tool2D`) because legacy bindings activate ids that
 * aren't in the union (circle/trace/dart/pin); the cast is centralized here.
 */
export function activate2DTool(dispatch: Dispatch, id: string): void {
  if (id === 'internalShape') {
    // El dock, el atajo y el copiloto atraviesan esta misma comprobación antes
    // de cambiar cualquiera de los dos estados. El thunk lee el store que
    // recibió la orden en ese instante, para que una pieza recién creada o
    // borrada no deje la disponibilidad desfasada respecto al lienzo.
    (dispatch as AppDispatch)((toolDispatch, getState) => {
      if (!selectHasInternalShapeHost(getState())) return;
      toolDispatch(setActiveTool('internalShape'));
      toolDispatch(setActiveTool2D('internalShape'));
    });
    return;
  }
  dispatch(setActiveTool(id as Tool2D));
  dispatch(setActiveTool2D(id));
}
