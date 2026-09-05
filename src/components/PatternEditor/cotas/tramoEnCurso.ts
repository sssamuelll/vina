import type { Point2D } from '../../../types/types';
import { polarPoint } from '../polyPenGeometry';
import type { Cota } from './cotas';

/** El tramo congelado: desde dónde y con qué largo y ángulo de partida. */
export interface TramoEnCurso {
  from: Point2D;
  lengthMm: number;
  angleDeg: number;
}

/**
 * Los dos chips del tramo que se está dibujando (#1129, spec de cotas vivas
 * § 5.4). Sustituyen a `NextPointPanel`, que era un diálogo flotante en la
 * esquina para escribir el mismo par de números.
 *
 * Por qué muere el panel: la gramática del número dice que el número vive donde
 * vive su sujeto — objeto en pantalla, chip encima; próximo objeto a crear,
 * tira; gesto vivo, junto al cursor. El tramo en curso es un gesto vivo, así
 * que sus números van donde está el gesto, no en una esquina. Y el panel
 * además le robaba la esquina a la tira de herramienta mientras estaba abierto.
 *
 * Llevan los mismos `kind` que los chips de una línea interna a propósito:
 * `chipScreenPosition` ya separa `tramo-largo` y `tramo-angulo` ±36 px sobre la
 * tangente, que es exactamente lo que hace falta para que dos chips que
 * comparten punto medio no se tapen. Un kind nuevo habría obligado a
 * reimplementar eso en los dos sitios que hacen match por kind.
 *
 * Lo que NO son: cotas de un objeto. No hay objeto todavía — hay una intención.
 * Por eso `apply` devuelve la variante `tramoEnCurso` de `CotaUpdate`, que
 * `PatternEditor` resuelve contra el hook de la herramienta viva en vez de
 * despachar a Redux, y por eso ninguno se arrastra: el scrub tira de algo que
 * está en pantalla, y arrastrar una intención colocaría puntos sin querer.
 */
export function cotasDelTramoEnCurso(tramo: TramoEnCurso): Cota[] {
  const { from, lengthMm, angleDeg } = tramo;
  const to = polarPoint(from, lengthMm, angleDeg);

  // Hacia fuera del propio tramo: no hay pieza de la que salir, así que la
  // normal se toma a la izquierda del sentido de avance y basta — los dos chips
  // se separan después sobre la tangente, que es lo que evita que se pisen.
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const largo = Math.hypot(dx, dy);
  const outward: Point2D = largo < 1e-9
    ? { x: 0, y: -1 }
    : { x: -dy / largo, y: dx / largo };

  const base = { a: from, b: to, outward, primary: true, scrub: false, rotulo: 'del tramo' };

  return [
    {
      ...base,
      id: 'tramo-en-curso-largo',
      kind: 'tramo-largo',
      label: 'Largo',
      valueMm: lengthMm,
      unit: 'mm',
      min: 0.1,
      max: 10000,
      apply: (v) => ({ kind: 'tramoEnCurso', largoMm: v, anguloDeg: angleDeg }),
    },
    {
      ...base,
      id: 'tramo-en-curso-angulo',
      kind: 'tramo-angulo',
      label: 'Ángulo',
      valueMm: angleDeg,
      unit: 'deg',
      min: -360,
      max: 360,
      apply: (v) => ({ kind: 'tramoEnCurso', largoMm: lengthMm, anguloDeg: v }),
    },
  ];
}
