/** Cursor-anchored 2D zoom — the exact math previously inline in
 *  useEditorInteractions' wheel handler (range 0.1–40 preserved). */
export interface Zoom2DView {
  zoom: number;
  pan: { x: number; y: number };
}

export const ZOOM_MIN = 0.1;
export const ZOOM_MAX = 40;

export function zoomAtPoint(view: Zoom2DView, factor: number, cx: number, cy: number): Zoom2DView {
  const newZoom = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, view.zoom * factor));
  const scale = newZoom / view.zoom;
  if (scale === 1) return view;
  return {
    zoom: newZoom,
    pan: { x: cx - scale * (cx - view.pan.x), y: cy - scale * (cy - view.pan.y) },
  };
}

/** True cuando un gesto de acercar no tuvo efecto porque ya se está en el
 *  tope — el momento exacto en el que hay que avisar (una vez, no en cada
 *  tick de rueda: eso lo hace el limitador de tiempo en el caller). */
export function isPinnedAtZoomCeiling(prevZoom: number, factor: number): boolean {
  return factor > 1 && prevZoom >= ZOOM_MAX;
}
