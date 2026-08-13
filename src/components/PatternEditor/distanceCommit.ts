import type { NotchAnchor } from '../../types/types';
import type { DistanceRef } from '../../utils/geometry/distanceRef';
import type { OutlineRing } from '../../utils/geometry/outlineRing';

/** Lleva una distancia de anillo al marco creciente de un borde que cruza 0. */
export function unwrapOnSpan(
  ring: OutlineRing,
  edgeSpanMm: [number, number],
  mm: number,
): number {
  const [spanStartMm, spanEndMm] = edgeSpanMm;
  return spanStartMm > spanEndMm && mm < spanStartMm ? mm + ring.totalMm : mm;
}

/** Longitud del borde en su marco desenrollado, incluido el tramo que cruza 0. */
export function spanLengthMm(
  ring: OutlineRing,
  edgeSpanMm: [number, number],
): number {
  const [spanStartMm, spanEndMm] = edgeSpanMm;
  return (spanStartMm > spanEndMm ? spanEndMm + ring.totalMm : spanEndMm) - spanStartMm;
}

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
  const spanStartMm = edgeSpanMm[0];
  const edgeMinMm = spanStartMm;
  const edgeMaxMm = spanStartMm + spanLengthMm(ring, edgeSpanMm);
  const clampToEdge = (distanceMm: number): number => (
    Math.max(edgeMinMm, Math.min(edgeMaxMm, unwrapOnSpan(ring, edgeSpanMm, distanceMm)))
  );

  const refMm = unwrapOnSpan(ring, edgeSpanMm, ref.distanceMm);
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
