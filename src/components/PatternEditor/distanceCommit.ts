import type { NotchAnchor } from '../../types/types';
import type { DistanceRef } from '../../utils/geometry/distanceRef';
import type { OutlineRing } from '../../utils/geometry/outlineRing';

/**
 * Convierte un arrastre sobre un borde en un ancla de distancia precisa.
 *
 * La dirección sale del primer cruce del umbral porque ese punto conserva el
 * sentido con el que arrancó la mano. Si el cursor arranca hacia un lado y se
 * vuelve antes de soltar, deducirla del release invertiría la intención real.
 */
export function distanceAnchorFrom(
  ring: OutlineRing,
  ref: DistanceRef,
  releaseMm: number,
  firstDragMm: number | null,
  edgeSpanMm: [number, number],
): NotchAnchor {
  // El anillo empieza en el primer comando, así que el tramo de CIERRE de
  // cualquier pieza lo cruza y llega como `[ini, fin]` con `ini > fin`.
  // Ordenar los extremos con min/max ahí daría el COMPLEMENTO del borde —
  // medido sobre una figura de 604,88 mm: 520 en vez de 84,88, seis veces más
  // largo— y el clampeo dejaría de sujetar el piquete a su borde, que es
  // justo lo que promete el "no cruza la esquina" del spec § 3.4.
  //
  // Se resuelve desenrollando: en ese marco el borde vuelve a ser un intervalo
  // creciente y todo lo demás funciona igual. Para un borde que no cruza, el
  // desenrollado es la identidad y no cambia nada.
  const [spanStartMm, spanEndMm] = edgeSpanMm;
  const wraps = spanStartMm > spanEndMm;
  const unwrap = (distanceMm: number): number => (
    wraps && distanceMm < spanStartMm ? distanceMm + ring.totalMm : distanceMm
  );

  const edgeMinMm = spanStartMm;
  const edgeMaxMm = wraps ? spanEndMm + ring.totalMm : spanEndMm;
  const clampToEdge = (distanceMm: number): number => (
    Math.max(edgeMinMm, Math.min(edgeMaxMm, unwrap(distanceMm)))
  );

  const refMm = unwrap(ref.distanceMm);
  const clampedReleaseMm = clampToEdge(releaseMm);
  const directionMm = firstDragMm === null
    ? clampedReleaseMm
    : clampToEdge(firstDragMm);

  return {
    refPoint: ref.point,
    direction: directionMm - refMm >= 0 ? 'cw' : 'ccw',
    distanceMm: Math.abs(clampedReleaseMm - refMm),
    metric: 2,
  };
}
