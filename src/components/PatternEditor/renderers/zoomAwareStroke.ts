/** Mantiene un piso legible y deja que el trazo crezca al acercarse. */
export function zoomAwareStroke(minPx: number, zoom2D: number): number {
  return Math.max(minPx, (0.15 / 1.4) * minPx * zoom2D) / zoom2D;
}
