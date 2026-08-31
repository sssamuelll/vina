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
  const dx = cota.b.x - cota.a.x;
  const dy = cota.b.y - cota.a.y;
  const length = Math.hypot(dx, dy);
  // Largo y Ángulo comparten el punto medio por contrato. Separarlos sobre la
  // tangente conserva esa ancla visual sin dejar que el segundo tape al primero
  // y vuelva imposible clicar Largo. El aire sale de la constante ya calibrada.
  const pairOffset = cota.kind === 'tramo-largo'
    ? -COTA_OFFSET_PX * 2
    : cota.kind === 'tramo-angulo'
      ? COTA_OFFSET_PX * 2
      : 0;
  const tangent = length > 1e-9
    ? { x: dx / length, y: dy / length }
    : { x: 1, y: 0 };
  return {
    left: pan2D.x + mx * zoom2D + cota.outward.x * COTA_OFFSET_PX + tangent.x * pairOffset,
    top: pan2D.y + my * zoom2D + cota.outward.y * COTA_OFFSET_PX + tangent.y * pairOffset,
  };
}
