import type { Point2D } from '../../types/types';

/**
 * Spline interpolante para los "puntos de curva" que pidió María (nota #197).
 *
 * Su queja no era sobre la fórmula sino sobre DÓNDE está el punto que agarras.
 * En un bezier el manejador vive fuera de la curva; lo que un patronista llama
 * punto de curva está ENCIMA y la curva pasa por él. Medido en su patrón real
 * (`maria_patrones_samuel_2M.dxf`): 0 comandos bezier en las 5 piezas, curvas
 * como polilíneas de paso 2.7–4.3 mm.
 *
 * Catmull-Rom hace exactamente eso: interpola, no aproxima. Y su conversión a
 * bezier cúbico es EXACTA, no un ajuste — la curva que se guarda es la misma
 * que se calculó. Por eso el contorno sigue siendo `C` y ni el render, ni los
 * exportadores, ni el motor de margen de costura se enteran.
 */

/** Centripetal (α = 0.5). Evita los lazos y los picos que da la uniforme (α = 0)
 *  cuando dos puntos quedan muy juntos — el caso normal al mover un punto de
 *  curva hacia su vecino. */
export const ALPHA = 0.5;

const dist = (a: Point2D, b: Point2D) => Math.hypot(b.x - a.x, b.y - a.y);

/**
 * Manejadores del tramo p1→p2, tomando p0 y p3 como vecinos de contexto.
 *
 * Los devuelve en el orden de `C`: [cp1, cp2]. Un tramo de Catmull-Rom es un
 * bezier cúbico exacto cuyos controles caen sobre las tangentes en p1 y p2.
 */
export function segmentHandles(p0: Point2D, p1: Point2D, p2: Point2D, p3: Point2D): [Point2D, Point2D] {
  // Parametrización centrípeta: t_i espaciados por la distancia^α.
  const d1 = Math.pow(dist(p0, p1), ALPHA);
  const d2 = Math.pow(dist(p1, p2), ALPHA);
  const d3 = Math.pow(dist(p2, p3), ALPHA);

  // Puntos coincidentes anulan un denominador. Cuando pasa, ese vecino no
  // aporta dirección y la tangente se reduce a la cuerda — que es justo el
  // límite geométrico correcto, no un caso especial inventado.
  const t1 = d2 + d1 > 0 && d1 > 0
    ? { x: (p2.x - p0.x) / (d1 + d2) * d2, y: (p2.y - p0.y) / (d1 + d2) * d2 }
    : { x: p2.x - p1.x, y: p2.y - p1.y };
  const t2 = d2 + d3 > 0 && d3 > 0
    ? { x: (p3.x - p1.x) / (d2 + d3) * d2, y: (p3.y - p1.y) / (d2 + d3) * d2 }
    : { x: p2.x - p1.x, y: p2.y - p1.y };

  return [
    { x: p1.x + t1.x / 3, y: p1.y + t1.y / 3 },
    { x: p2.x - t2.x / 3, y: p2.y - t2.y / 3 },
  ];
}

/**
 * Vecino de contexto en el extremo de una cadena abierta.
 *
 * Reflejar el segundo punto sobre el primero da tangente natural en la punta:
 * la curva entra recta y se dobla después, en vez de arrancar con un latigazo.
 */
export function phantomEnd(first: Point2D, second: Point2D): Point2D {
  return { x: 2 * first.x - second.x, y: 2 * first.y - second.y };
}

/** Los cuatro puntos de contexto del tramo i→i+1 de una cadena de anclas. */
export function contextFor(points: Point2D[], i: number, closed = false): [Point2D, Point2D, Point2D, Point2D] {
  const n = points.length;
  const at = (k: number): Point2D => {
    if (closed) return points[((k % n) + n) % n];
    if (k < 0) return phantomEnd(points[0], points[1]);
    if (k > n - 1) return phantomEnd(points[n - 1], points[n - 2]);
    return points[k];
  };
  return [at(i - 1), at(i), at(i + 1), at(i + 2)];
}

/**
 * Manejadores de cada tramo de la cadena. `handles[i]` corresponde al tramo
 * que va de `points[i]` a `points[i+1]`.
 */
export function chainHandles(points: Point2D[], closed = false): Array<[Point2D, Point2D]> {
  if (points.length < 2) return [];
  const last = closed ? points.length : points.length - 1;
  const out: Array<[Point2D, Point2D]> = [];
  for (let i = 0; i < last; i++) {
    const [p0, p1, p2, p3] = contextFor(points, i, closed);
    out.push(segmentHandles(p0, p1, p2, p3));
  }
  return out;
}
