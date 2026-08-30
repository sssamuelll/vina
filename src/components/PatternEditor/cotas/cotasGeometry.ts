import type { Point2D } from '../../../types/types';
import type { Cota } from './cotas';

/** Aire entre la geometría y la línea/chip de cota, en px de pantalla. */
export const COTA_OFFSET_PX = 18;

/**
 * Punto medio del segmento a→b en pantalla (la fórmula de `FloatingActionBar`:
 * pan + patrón × zoom), desplazado hacia fuera de la pieza.
 */
export function chipScreenPosition(cota: Cota, pan2D: Point2D, zoom2D: number): { left: number; top: number } {
  const mx = (cota.a.x + cota.b.x) / 2;
  const my = (cota.a.y + cota.b.y) / 2;
  return {
    left: pan2D.x + mx * zoom2D + cota.outward.x * COTA_OFFSET_PX,
    top: pan2D.y + my * zoom2D + cota.outward.y * COTA_OFFSET_PX,
  };
}
