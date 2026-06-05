/** Cursor-anchored 2D zoom — the exact math previously inline in
 *  useEditorInteractions' wheel handler (range 0.1–10 preserved). */
export interface Zoom2DView {
  zoom: number;
  pan: { x: number; y: number };
}

export function zoomAtPoint(view: Zoom2DView, factor: number, cx: number, cy: number): Zoom2DView {
  const newZoom = Math.max(0.1, Math.min(10, view.zoom * factor));
  const scale = newZoom / view.zoom;
  if (scale === 1) return view;
  return {
    zoom: newZoom,
    pan: { x: cx - scale * (cx - view.pan.x), y: cy - scale * (cy - view.pan.y) },
  };
}
