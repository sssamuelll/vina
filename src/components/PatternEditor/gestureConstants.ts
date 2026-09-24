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

/**
 * Radio de enganche de un BORDE, en píxeles de PANTALLA.
 *
 * 12 px. Antes de unificar, la herramienta de coser enganchaba a 15 y la de
 * tramos a 8: la fusión de las dos (#1029) dejó a coser en 8 y encogió el
 * objetivo a la mitad para quien la usa a diario. 12 es el valor que el spec
 * fija (§ 7), y coincide con dos umbrales ya calibrados contra la usuaria: el
 * `eThresh` del margen de costura y el `HIT_RADIUS_PX` de la herramienta Punto.
 *
 * Spec: docs/superpowers/specs/2026-08-11-arrastre-unificado-2d-design.md § 7
 */
export const EDGE_HIT_PX = 12;

/** Radio de enganche de una ESQUINA; comparte la gramática del margen. */
export const VERTEX_HIT_PX = 10;

/**
 * Shift dos veces (spec 2026-09-23 § 3.1): un TOQUE es pulsar y soltar Shift
 * en menos de esto sin pulsar el ratón entre medias. Un Shift+clic no es un
 * toque, ni lo es mantener Shift mientras se traza.
 */
export const SHIFT_TOQUE_MS = 300;

/** Tras un toque, la siguiente pulsación antes de esto es «dos veces». */
export const SHIFT_DOBLE_MS = 400;
