/**
 * El margen de costura (spec 2026-10-13 §4.3.3): una franja a lo largo de cada borde cosido, del ancho del
 * margen de la pieza (o 10 mm), con la masa de sus capas y más flexión. Se mide en el patrón, en metros: la
 * misma franja con cualquier malla, en vez de los dos anillos de malla de la banda de hoy (prepararTela.ts, F3).
 */

/** Ancho del margen (mm) de una pieza que no trae el suyo (§4.3.3). */
export const MARGEN_POR_DEFECTO_MM = 10;

/** Capas de la franja: la tela y su margen doblado debajo (§4.3.3, «más masa, por capas»). */
export const CAPAS_DEL_MARGEN = 2;

/**
 * ponytail: la flexión de la franja es la de hoy, ×3 (la banda F3 de prepararTela.ts), sin medir. Se calibra
 * con prendas reales (subproyecto 2 del programa); el banco de la camiseta la corre también con 1.
 */
export const FLEXION_DEL_MARGEN = 3;

function distanciaASegmento(px: number, py: number, ax: number, ay: number, bx: number, by: number): number {
  const ux = bx - ax, uy = by - ay, l2 = ux * ux + uy * uy;
  const t = l2 > 0 ? Math.max(0, Math.min(1, ((px - ax) * ux + (py - ay) * uy) / l2)) : 0;
  return Math.hypot(px - ax - t * ux, py - ay - t * uy);
}

/**
 * Los triángulos de la franja: los que tienen el centro, en el patrón, a menos del ancho de su pieza (m) de un
 * borde cosido de esa misma pieza. `bordes` son segmentos entre dos vértices cosidos seguidos.
 */
export function franjaDelMargen(
  patron: ArrayLike<number>,
  tris: ArrayLike<number>,
  piezaDeTri: ArrayLike<number>,
  bordes: ReadonlyArray<readonly [number, number]>,
  anchoDePieza: ArrayLike<number>,
): Uint8Array {
  const nt = tris.length / 3;
  const piezaDe = new Map<number, number>();
  for (let t = 0; t < nt; t++) for (let k = 0; k < 3; k++) piezaDe.set(tris[3 * t + k], piezaDeTri[t]);
  const porPieza = new Map<number, Array<readonly [number, number]>>();
  for (const [p, q] of bordes) {
    const k = piezaDe.get(p);
    if (k === undefined || piezaDe.get(q) !== k) continue;
    const lista = porPieza.get(k) ?? [];
    lista.push([p, q]);
    porPieza.set(k, lista);
  }
  const franja = new Uint8Array(nt);
  for (let t = 0; t < nt; t++) {
    const lista = porPieza.get(piezaDeTri[t]);
    if (!lista) continue;
    const a = tris[3 * t], b = tris[3 * t + 1], c = tris[3 * t + 2];
    const cx = (patron[2 * a] + patron[2 * b] + patron[2 * c]) / 3, cy = (patron[2 * a + 1] + patron[2 * b + 1] + patron[2 * c + 1]) / 3;
    const ancho = anchoDePieza[piezaDeTri[t]];
    for (const [p, q] of lista) {
      if (distanciaASegmento(cx, cy, patron[2 * p], patron[2 * p + 1], patron[2 * q], patron[2 * q + 1]) < ancho) {
        franja[t] = 1;
        break;
      }
    }
  }
  return franja;
}
