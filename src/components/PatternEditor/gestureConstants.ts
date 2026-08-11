/**
 * Umbral clic-vs-arrastre, en píxeles de PANTALLA.
 *
 * 4 = `SM_CXDRAG` de Windows: la mano de quien usa la app ya viene calibrada a
 * ese número por el sistema operativo. Es GLOBAL a propósito — un umbral por
 * herramienta enseñaría "en esta hay que moverse más", que es justo lo que un
 * gesto no debe hacer. Si una herramienta pidiera otro número, es olor de
 * diseño y vuelve al spec, no se parchea aquí.
 *
 * Spec: docs/superpowers/specs/2026-08-11-arrastre-unificado-2d-design.md § 7
 */
export const DRAG_THRESHOLD_PX = 4;

/** ¿Este recorrido cruzó el umbral? Euclidiano, y `>=` — nunca `>`. */
export function isDrag(dx: number, dy: number): boolean {
  return Math.hypot(dx, dy) >= DRAG_THRESHOLD_PX;
}
