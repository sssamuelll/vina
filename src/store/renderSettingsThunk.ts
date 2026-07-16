/**
 * openRenderSettings — la puerta al panel Render & Export 3D (stills en alta,
 * turntable 360°, glTF/USDZ). El panel vive en Viewport3D; su único opener
 * era un botón gateado por !hideChrome que jamás renderizó en el shell
 * actual (dark surface, audit Vex 2026-07-16). Puertas reales: File menu
 * ("Export 3D / Turntable...") y palette Ctrl+K ("export-3d").
 *
 * Si la vista es 2D-only, cambia a split primero: abrir el panel sin el
 * viewport montado sería abrir una puerta a una habitación apagada.
 */
import type { Dispatch, UnknownAction } from '@reduxjs/toolkit';
import { setViewMode } from './editorSlice';
import { setRenderSettingsOpen } from './simulationSlice';

/** Solo lo que el thunk lee — permite stores de test parciales (patrón contra RootState completo). */
interface MinimalState {
  editor: { viewMode: '2d' | 'split' | '3d' };
}

export function openRenderSettings() {
  return (dispatch: Dispatch<UnknownAction>, getState: () => MinimalState) => {
    if (getState().editor.viewMode === '2d') {
      dispatch(setViewMode('split'));
    }
    dispatch(setRenderSettingsOpen(true));
  };
}
