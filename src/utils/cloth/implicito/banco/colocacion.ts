/**
 * La colocación de otra malla de la misma prenda, llevada a la malla de Vina por las coordenadas del patrón (E5 del plan
 * de la parte 2). Cada pieza del OBJ trae su patrón en las coordenadas de textura: centrado en su caja, a otra escala y
 * quizá espejado. Se ajustan la escala de cada pieza (por el ancho y el alto de las cajas) y un solo espejo para todas
 * (de los cuatro, el que deja la malla de Vina más adentro de la otra); cada vértice de Vina toma la posición de su
 * punto del patrón, por los pesos del triángulo que lo contiene.
 */
import { puntoMasCercano, type PuntoEnTriangulo } from '../cuerpo';
import type { Obj } from './obj';

interface Caja {
  cx: number;
  cy: number;
  ancho: number;
  alto: number;
}

/** La caja de los puntos (x, y) que da `punto(k)` para k en [0, n). */
function caja(n: number, punto: (k: number) => [number, number]): Caja {
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
  for (let k = 0; k < n; k++) {
    const [x, y] = punto(k);
    x0 = Math.min(x0, x);
    x1 = Math.max(x1, x);
    y0 = Math.min(y0, y);
    y1 = Math.max(y1, y);
  }
  return { cx: (x0 + x1) / 2, cy: (y0 + y1) / 2, ancho: x1 - x0, alto: y1 - y0 };
}

/** Los triángulos de un grupo del OBJ en su plano de textura, con una rejilla para hallar el que contiene un punto. */
class PatronDelObj {
  private readonly celdas = new Map<string, number[]>();
  private readonly lado: number;
  private readonly p: PuntoEnTriangulo = { x: 0, y: 0, z: 0, wa: 0, wb: 0, wc: 0, rasgo: 0 };

  constructor(private readonly obj: Obj, readonly ts: readonly number[]) {
    let suma = 0;
    for (const t of ts) suma += Math.hypot(this.u(t, 1) - this.u(t, 0), this.w(t, 1) - this.w(t, 0));
    this.lado = 2 * (suma / Math.max(1, ts.length));
    for (const t of ts) {
      const us = [0, 1, 2].map((j) => this.u(t, j)), ws = [0, 1, 2].map((j) => this.w(t, j));
      for (let i = Math.floor(Math.min(...us) / this.lado); i <= Math.floor(Math.max(...us) / this.lado); i++) {
        for (let j = Math.floor(Math.min(...ws) / this.lado); j <= Math.floor(Math.max(...ws) / this.lado); j++) {
          const k = `${i},${j}`, lista = this.celdas.get(k);
          if (lista) lista.push(t);
          else this.celdas.set(k, [t]);
        }
      }
    }
  }

  u(t: number, j: number): number {
    return this.obj.vt[2 * this.obj.trisT[3 * t + j]];
  }

  w(t: number, j: number): number {
    return this.obj.vt[2 * this.obj.trisT[3 * t + j] + 1];
  }

  /** El triángulo más cercano a (u, w) en el plano de textura (distancia 0 si lo contiene) y sus pesos. */
  buscar(u: number, w: number): { t: number; d: number; pesos: [number, number, number] } {
    let mejor = { t: -1, d: Infinity, pesos: [1, 0, 0] as [number, number, number] };
    const i0 = Math.floor(u / this.lado), j0 = Math.floor(w / this.lado);
    for (let r = 1; r <= 64 && mejor.t < 0; r *= 2) {
      for (let i = i0 - r; i <= i0 + r; i++) {
        for (let j = j0 - r; j <= j0 + r; j++) {
          for (const t of this.celdas.get(`${i},${j}`) ?? []) {
            const p = puntoMasCercano(u, w, 0, this.u(t, 0), this.w(t, 0), 0, this.u(t, 1), this.w(t, 1), 0, this.u(t, 2), this.w(t, 2), 0, this.p);
            const d = Math.hypot(u - p.x, w - p.y);
            if (d < mejor.d) mejor = { t, d, pesos: [p.wa, p.wb, p.wc] };
          }
        }
      }
    }
    return mejor;
  }
}

export interface ColocacionDesdeObj {
  /** las posiciones de cada pieza de Vina (m), 3 por vértice */
  x: Float64Array[];
  /** mm de patrón por unidad de textura del OBJ */
  mmPorVt: number;
  /** por pieza, la mayor distancia (mm de patrón) de un vértice de Vina a la otra malla */
  error: number[];
  /** por pieza, el espejo (±1 en u y en w): uno solo para todas, el dado o el que deja las piezas más adentro de la otra malla */
  espejo: Array<[number, number]>;
}

/**
 * `piezas`: el patrón (m) y los triángulos de cada pieza de Vina; `grupoDePieza[k]`: el grupo del OBJ que es la pieza k.
 * Las posiciones del OBJ van en mm. `espejo`, si se da, fija el espejo en lugar de buscarlo: con piezas simétricas y
 * gemelas espejadas (el delantero, la espalda y las dos mangas), una prenda entera espejada encaja igual de bien, y solo
 * el espejo fijo deja ver una gemela asignada a la otra.
 */
export function colocarDesdeObj(
  piezas: ReadonlyArray<{ patron: Float64Array; tris: ArrayLike<number> }>,
  obj: Obj,
  grupoDePieza: readonly number[],
  espejoDado?: readonly [number, number],
): ColocacionDesdeObj {
  const ESPEJOS: Array<[number, number]> = [[1, 1], [1, -1], [-1, 1], [-1, -1]];
  const datos = piezas.map((pieza, k) => {
    const g = obj.grupos[grupoDePieza[k]];
    if (!g) throw new Error(`colocarDesdeObj: la pieza ${k} no tiene grupo en el OBJ`);
    const ref = new PatronDelObj(obj, Array.from({ length: g.nt }, (_, i) => g.t0 + i));
    // la caja de los vértices que usa algún triángulo: la de su contorno
    const n = pieza.patron.length / 2, usado = new Uint8Array(n);
    for (let q = 0; q < pieza.tris.length; q++) usado[pieza.tris[q]] = 1;
    const usados: number[] = [];
    for (let i = 0; i < n; i++) if (usado[i]) usados.push(i);
    const cv = caja(usados.length, (q) => [1000 * pieza.patron[2 * usados[q]], 1000 * pieza.patron[2 * usados[q] + 1]]);
    const cr = caja(3 * ref.ts.length, (q) => [ref.u(ref.ts[Math.floor(q / 3)], q % 3), ref.w(ref.ts[Math.floor(q / 3)], q % 3)]);
    const su = cr.ancho / cv.ancho, sw = cr.alto / cv.alto, s = (su + sw) / 2;
    if (Math.abs(su - sw) > 0.01 * s) throw new Error(`colocarDesdeObj: la pieza ${k} no tiene el mismo tamaño que su grupo (escalas ${su} y ${sw})`);
    const llevar = (i: number, [fu, fw]: [number, number]) =>
      ref.buscar(cr.cx + fu * s * (1000 * pieza.patron[2 * i] - cv.cx), cr.cy + fw * s * (1000 * pieza.patron[2 * i + 1] - cv.cy));
    return { pieza, n, usado, usados, s, llevar };
  });
  // un solo espejo para todas: las piezas de un DXF llevan la misma transformación, y una pieza simétrica (la tira, un
  // rectángulo) encaja con los cuatro y no puede elegir sola
  let espejo: [number, number] = espejoDado ? [espejoDado[0], espejoDado[1]] : ESPEJOS[0], mejor = Infinity;
  for (const e of espejoDado ? [] : ESPEJOS) {
    let d = 0;
    for (const p of datos) {
      const paso = Math.max(1, Math.floor(p.usados.length / 400));
      for (let q = 0; q < p.usados.length; q += paso) d += p.llevar(p.usados[q], e).d / p.s;
    }
    if (d < mejor) {
      mejor = d;
      espejo = e;
    }
  }
  const x = datos.map((p) => {
    const xs = new Float64Array(3 * p.n);
    for (let i = 0; i < p.n; i++) {
      const r = p.llevar(i, espejo);
      for (let d = 0; d < 3; d++) {
        let q = 0;
        for (let j = 0; j < 3; j++) q += r.pesos[j] * obj.v[3 * obj.tris[3 * r.t + j] + d];
        xs[3 * i + d] = q / 1000;
      }
    }
    return xs;
  });
  const error = datos.map((p) => p.usados.reduce((peor, i) => Math.max(peor, p.llevar(i, espejo).d / p.s), 0));
  return { x, mmPorVt: 1 / (datos.reduce((a, p) => a + p.s, 0) / datos.length), error, espejo: datos.map(() => espejo) };
}
