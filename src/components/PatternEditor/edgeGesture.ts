import type { Point2D } from '../../types/types';

/** Tramo más corto que esto = el press y el release son el mismo sitio. */
export const MIN_SEGMENT_T = 0.01;

/** Un t a menos del 1% de un extremo cuenta como el extremo exacto — evita
 *  slivers sin coser y deja que extremo-a-extremo colapse a la convención
 *  rango-completo de seamRange.ts (campos ausentes, nunca 0/1). */
export const EDGE_ENDPOINT_SNAP_T = 0.01;

export type EdgeGesturePhase = 'idle' | 'armed' | 'dragging';

/** Lo que el press enganchó. `t` va en arco del BORDE semántico, no del comando. */
export interface EdgeTarget {
  pieceId: string;
  edgeIndex: number;
  edgeRange: [number, number];
  t: number;
  point: Point2D;
}

export type EdgeCommit =
  | { kind: 'click'; target: EdgeTarget }
  | {
      kind: 'drag';
      target: EdgeTarget;
      range: [number, number];
      /**
       * El t del release, crudo: sin ordenar contra el press y sin el colapso
       * a extremo que sí lleva `range`.
       *
       * `range` va ordenado porque un TRAMO no tiene sentido de recorrido. Una
       * DISTANCIA sí lo tiene —el signo es la `direction` del ancla (spec
       * § 3.2)— y del rango ordenado no se recupera: con el press pegado a un
       * extremo, el colapso lo vuelve indistinguible del otro borde del rango.
       */
      releaseT: number;
      /**
       * La primera proyección válida después de cruzar el umbral conserva
       * el sentido con el que arrancó la mano. El release no sirve para
       * reconstruirlo: el cursor puede haberse devuelto antes de soltar.
       */
      firstDragT: number | null;
    };

/**
 * La ley, en una función: el press manda el objeto, el release manda el valor.
 *
 * Soltar sin haberse movido = clic ("esto entero", y qué signifique eso lo
 * decide la herramienta). Soltar habiéndose movido = arrastre con su rango.
 *
 * Dos caídas a clic que NO son "no pasó nada":
 *  - soltar fuera del borde (`releaseT === null`)
 *  - cruzar el umbral en pantalla con el t colapsado (arrastre perpendicular)
 *
 * Spec: docs/superpowers/specs/2026-08-11-arrastre-unificado-2d-design.md § 4.1
 */
export function resolveEdgeCommit(
  press: EdgeTarget,
  releaseT: number | null,
  /** ¿El gesto llegó a cruzar el umbral en algún momento? Es histórico, no la
   *  posición final: una vez cruzado no se re-evalúa (spec § 6, conflicto 2).
   *  Volver el cursor cerca del punto de partida NO devuelve el gesto a clic —
   *  sobre un borde curvo la cuerda en pantalla miente y el arco manda. */
  crossedThreshold: boolean,
  /** Se recibe ya fijado por el gesto; deducirlo aquí desde el release
   *  invertiría la dirección cuando la mano se devuelve antes de soltar. */
  firstDragT?: number | null,
): EdgeCommit {
  if (releaseT === null || !crossedThreshold) return { kind: 'click', target: press };
  if (Math.abs(releaseT - press.t) < MIN_SEGMENT_T) return { kind: 'click', target: press };

  let t0 = Math.min(press.t, releaseT);
  let t1 = Math.max(press.t, releaseT);
  if (t0 < EDGE_ENDPOINT_SNAP_T) t0 = 0;
  if (t1 > 1 - EDGE_ENDPOINT_SNAP_T) t1 = 1;

  return {
    kind: 'drag',
    target: press,
    range: [t0, t1],
    releaseT,
    firstDragT: firstDragT ?? null,
  };
}
