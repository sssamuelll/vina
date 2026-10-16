/**
 * Las costuras del motor implícito (spec 2026-10-13 §4.3.3, con la enmienda E1 del plan de la entrega 4):
 * cada vértice de un lado se cose a un PUNTO del otro, sobre el segmento que le toca por largo de arco en el
 * patrón (si el muestreo coincide, el punto cae en un vértice y es el par de siempre). Cada punto es un resorte
 * dentro del sistema:
 *   E = ½·k·max(|d| − L, 0)²,   d = x_a − (1 − s)·x_b0 − s·x_b1,
 * con un largo de reposo L que arranca en la separación de la colocación y se cierra a 0 como hoy. La costura
 * tira y no empuja. Con L = 0 la energía es cuadrática y la hessiana, k·I, exacta; con L > 0 también es la
 * exacta: k·(L/|d|)·n·nᵀ + k·(1 − L/|d|)·I.
 */
import type { TelaSI } from './tela';

/** Un vértice cosido al punto (1 − s)·x_b0 + s·x_b1 del otro lado. */
export interface PuntoDeCostura {
  a: number;
  b0: number;
  b1: number;
  s: number;
}

/** Cuánto se cierra el largo de reposo por cuadro: el cierre de hoy, ×0,97 por subpaso de 15. */
export const CIERRE_POR_CUADRO = 0.97 ** 15;
/** Largo (m) bajo el cual la costura queda cerrada: desde ahí, L = 0. */
export const LARGO_CERRADO = 1e-4;

/** El largo de arco de cada vértice del lado, medido en el patrón y normalizado a [0, 1]. */
export function largosEnElPatron(patron: ArrayLike<number>, lado: readonly number[]): number[] {
  const t = [0];
  for (let k = 1; k < lado.length; k++) {
    const p = lado[k - 1], q = lado[k];
    t.push(t[k - 1] + Math.hypot(patron[2 * q] - patron[2 * p], patron[2 * q + 1] - patron[2 * p + 1]));
  }
  const total = t[t.length - 1];
  return t.map((v) => (total > 0 ? v / total : 0));
}

/** El segmento del lado que contiene la fracción t, y dónde cae t en él. */
function sobre(t: number, lado: readonly number[], tl: readonly number[]): Omit<PuntoDeCostura, 'a'> {
  if (lado.length === 1) return { b0: lado[0], b1: lado[0], s: 0 };
  let j = 0;
  while (j < lado.length - 2 && tl[j + 1] < t) j++;
  const tramo = tl[j + 1] - tl[j];
  return { b0: lado[j], b1: lado[j + 1], s: tramo > 0 ? Math.min(1, Math.max(0, (t - tl[j]) / tramo)) : 0 };
}

/**
 * Los puntos de una costura: cada vértice de A sobre B, y cada vértice de B que no coincide con uno de A,
 * sobre A. Los lados van en orden de cosido (el B ya invertido si va al revés) y con índices globales.
 */
export function puntosDeCostura(patron: ArrayLike<number>, ladoA: readonly number[], ladoB: readonly number[]): PuntoDeCostura[] {
  if (ladoA.length === 0 || ladoB.length === 0) return [];
  const tA = largosEnElPatron(patron, ladoA), tB = largosEnElPatron(patron, ladoB);
  const puntos: PuntoDeCostura[] = [];
  const agregar = (p: PuntoDeCostura) => {
    // un vértice cosido a un segmento suyo (lados que comparten una punta) no es costura
    if (p.a !== p.b0 && p.a !== p.b1) puntos.push(p);
  };
  ladoA.forEach((a, i) => agregar({ a, ...sobre(tA[i], ladoB, tB) }));
  ladoB.forEach((b, i) => {
    if (!tA.some((t) => Math.abs(t - tB[i]) < 1e-9)) agregar({ a: b, ...sobre(tB[i], ladoA, tA) });
  });
  return puntos;
}

export class Costuras {
  readonly n: number;
  readonly a: Uint32Array;
  readonly b0: Uint32Array;
  readonly b1: Uint32Array;
  readonly s: Float64Array;
  /** largo de reposo al coser (la separación en la colocación) y el de ahora (m) */
  readonly L0: Float64Array;
  readonly L: Float64Array;
  /** por punto, del último `linealizar`: d (3), el factor del gradiente sobre d, el de I y el de d·dᵀ en la hessiana */
  readonly estado: Float64Array;
  /** cuadros de cierre */
  cuadros = 0;

  /** `cierreMaximo`: lo más que baja L en un cuadro (m); sin tope, el cierre de hoy */
  constructor(puntos: readonly PuntoDeCostura[], x: ArrayLike<number>, readonly k: number, readonly cierreMaximo = Infinity) {
    this.n = puntos.length;
    this.a = Uint32Array.from(puntos, (p) => p.a);
    this.b0 = Uint32Array.from(puntos, (p) => p.b0);
    this.b1 = Uint32Array.from(puntos, (p) => p.b1);
    this.s = Float64Array.from(puntos, (p) => p.s);
    this.L0 = new Float64Array(this.n);
    const d = [0, 0, 0];
    for (let e = 0; e < this.n; e++) {
      this.separacion(e, x, d);
      this.L0[e] = Math.hypot(d[0], d[1], d[2]);
    }
    this.L = Float64Array.from(this.L0);
    this.estado = new Float64Array(6 * this.n);
  }

  /** d = x_a − (1 − s)·x_b0 − s·x_b1 del punto e, en `d`. */
  separacion(e: number, x: ArrayLike<number>, d: number[]): void {
    const a = 3 * this.a[e], b0 = 3 * this.b0[e], b1 = 3 * this.b1[e], s = this.s[e];
    for (let k = 0; k < 3; k++) d[k] = x[a + k] - (1 - s) * x[b0 + k] - s * x[b1 + k];
  }

  /** El peso de a, b0 y b1 en d. */
  pesos(e: number): [number, number, number] {
    return [1, -(1 - this.s[e]), -this.s[e]];
  }

  vertices(e: number): [number, number, number] {
    return [this.a[e], this.b0[e], this.b1[e]];
  }

  /** Un cuadro de cierre: L ← L·CIERRE_POR_CUADRO, sin bajar más de `cierreMaximo`, y 0 al bajar de LARGO_CERRADO. */
  avanzarCierre(): void {
    this.cuadros++;
    for (let e = 0; e < this.n; e++) {
      const L = Math.max(this.L[e] * CIERRE_POR_CUADRO, this.L[e] - this.cierreMaximo);
      this.L[e] = L < LARGO_CERRADO ? 0 : L;
    }
  }

  cerradas(): boolean {
    return this.L.every((L) => L === 0);
  }

  energiaDe(e: number, x: ArrayLike<number>): number {
    const d = [0, 0, 0];
    this.separacion(e, x, d);
    const r = Math.hypot(d[0], d[1], d[2]) - this.L[e];
    return r > 0 ? 0.5 * this.k * r * r : 0;
  }

  energia(x: ArrayLike<number>): number {
    let E = 0;
    for (let e = 0; e < this.n; e++) E += this.energiaDe(e, x);
    return E;
  }

  /** Guarda d y los factores de ∇E = g·d y H = c1·I + c2·d·dᵀ de cada punto, en las posiciones x. */
  linealizar(x: ArrayLike<number>): void {
    const d = [0, 0, 0], st = this.estado, k = this.k;
    for (let e = 0; e < this.n; e++) {
      this.separacion(e, x, d);
      const r = Math.hypot(d[0], d[1], d[2]), L = this.L[e], o = 6 * e;
      st[o] = d[0];
      st[o + 1] = d[1];
      st[o + 2] = d[2];
      if (L === 0) {
        st[o + 3] = k;
        st[o + 4] = k;
        st[o + 5] = 0;
      } else if (r > L) {
        const q = L / r;
        st[o + 3] = k * (1 - q);
        st[o + 4] = k * (1 - q);
        st[o + 5] = (k * q) / (r * r);
      } else {
        st[o + 3] = 0;
        st[o + 4] = 0;
        st[o + 5] = 0;
      }
    }
  }

  /** out += ∇E, del último `linealizar`. */
  gradiente(out: Float64Array): void {
    const st = this.estado;
    for (let e = 0; e < this.n; e++) {
      const o = 6 * e, g = st[o + 3];
      if (g === 0) continue;
      const w = this.pesos(e), v = this.vertices(e);
      for (let m = 0; m < 3; m++) for (let k = 0; k < 3; k++) out[3 * v[m] + k] += w[m] * g * st[o + k];
    }
  }

  /** out += H·p, del último `linealizar`. */
  hessianaPor(p: Float64Array, out: Float64Array): void {
    const st = this.estado;
    for (let e = 0; e < this.n; e++) {
      const o = 6 * e, c1 = st[o + 4], c2 = st[o + 5];
      if (c1 === 0 && c2 === 0) continue;
      const w = this.pesos(e), v = this.vertices(e), q = [0, 0, 0];
      for (let m = 0; m < 3; m++) for (let k = 0; k < 3; k++) q[k] += w[m] * p[3 * v[m] + k];
      const dq = st[o] * q[0] + st[o + 1] * q[1] + st[o + 2] * q[2];
      for (let m = 0; m < 3; m++) for (let k = 0; k < 3; k++) out[3 * v[m] + k] += w[m] * (c1 * q[k] + c2 * dq * st[o + k]);
    }
  }

  /** M[o..o+8] += el bloque (li, lj) del punto e (fila mayor), con li y lj en 0..2 = a, b0, b1. */
  sumarBloque(e: number, li: number, lj: number, M: Float64Array, o = 0): void {
    const st = this.estado, s0 = 6 * e, w = this.pesos(e), c = w[li] * w[lj], c1 = st[s0 + 4], c2 = st[s0 + 5];
    for (let r = 0; r < 3; r++) for (let q = 0; q < 3; q++) M[o + 3 * r + q] += c * ((r === q ? c1 : 0) + c2 * st[s0 + r] * st[s0 + q]);
  }

  /** out[9v..9v+8] += el bloque diagonal de cada vértice cosido. */
  sumarBloquesDiagonales(out: Float64Array): void {
    for (let e = 0; e < this.n; e++) {
      const v = this.vertices(e);
      for (let m = 0; m < 3; m++) this.sumarBloque(e, m, m, out, 9 * v[m]);
    }
  }
}

/** Una bisagra que cruza la costura (E2): el borde k del triángulo t, del lado A, con su ala d en la otra pieza. */
export interface BisagraDeCostura {
  t: number;
  k: number;
  d: number;
  /** rigidez (N·m): E = ½·kh·θ² */
  kh: number;
}

/**
 * La rigidez a la flexión de la placa (§4.1.5) cuando la curvatura cruza el segmento p→q del patrón, en el
 * marco del hilo de su pieza: para la dirección δ ⟂ al segmento, b = δu⁴·bTrama + 4·D66·δu²·δv² + δv⁴·bUrdimbre.
 */
function rigidezQueCruza(uv: ArrayLike<number>, p: number, q: number, tela: TelaSI): number {
  const tu = uv[2 * q] - uv[2 * p], tv = uv[2 * q + 1] - uv[2 * p + 1], l = Math.hypot(tu, tv);
  const du = -tv / l, dv = tu / l;
  const D66 = Math.max(1e-3 * Math.min(tela.bTrama, tela.bUrdimbre), tela.bBies - (tela.bTrama + tela.bUrdimbre) / 4);
  return du ** 4 * tela.bTrama + 4 * D66 * du * du * dv * dv + dv ** 4 * tela.bUrdimbre;
}

/**
 * Las bisagras de una costura: por cada borde de A entre dos vértices cosidos seguidos, el triángulo de A que
 * lo tiene y, como ala, el vértice opuesto del triángulo de B en el segmento que cae a la mitad del borde. La
 * rigidez es la de una franja curvada a lo ancho, kh = b⊥·ℓ²/(A_T + A_N), con b⊥ el promedio de los dos lados.
 * Un borde que no es libre en su pieza (no debería pasar) no lleva bisagra.
 */
export function bisagrasDeCostura(
  uv: ArrayLike<number>,
  tris: ArrayLike<number>,
  ladoA: readonly number[],
  ladoB: readonly number[],
  tela: TelaSI,
): BisagraDeCostura[] {
  if (ladoA.length < 2 || ladoB.length < 2) return [];
  const nt = tris.length / 3, n = uv.length / 2;
  const clave = (a: number, b: number) => (a < b ? a * n + b : b * n + a);
  const deBorde = new Map<number, Array<[number, number]>>();
  for (let t = 0; t < nt; t++) {
    for (let k = 0; k < 3; k++) {
      const key = clave(tris[3 * t + k], tris[3 * t + ((k + 1) % 3)]);
      const lista = deBorde.get(key);
      if (lista) lista.push([t, k]);
      else deBorde.set(key, [[t, k]]);
    }
  }
  const libre = (a: number, b: number) => {
    const lista = deBorde.get(clave(a, b));
    return lista && lista.length === 1 ? lista[0] : null;
  };
  const tercero = (t: number, a: number, b: number) => {
    for (let k = 0; k < 3; k++) {
      const v = tris[3 * t + k];
      if (v !== a && v !== b) return v;
    }
    return -1;
  };
  const area = (t: number) => {
    const a = tris[3 * t], b = tris[3 * t + 1], c = tris[3 * t + 2];
    return 0.5 * Math.abs((uv[2 * b] - uv[2 * a]) * (uv[2 * c + 1] - uv[2 * a + 1]) - (uv[2 * c] - uv[2 * a]) * (uv[2 * b + 1] - uv[2 * a + 1]));
  };
  const tA = largosEnElPatron(uv, ladoA), tB = largosEnElPatron(uv, ladoB);
  const bisagras: BisagraDeCostura[] = [];
  for (let i = 0; i + 1 < ladoA.length; i++) {
    const a0 = ladoA[i], a1 = ladoA[i + 1], deA = libre(a0, a1);
    if (!deA) continue;
    const medio = (tA[i] + tA[i + 1]) / 2;
    let j = 0;
    while (j < ladoB.length - 2 && tB[j + 1] < medio) j++;
    const b0 = ladoB[j], b1 = ladoB[j + 1], deB = libre(b0, b1);
    if (!deB) continue;
    const d = tercero(deB[0], b0, b1);
    if (d < 0 || d === a0 || d === a1) continue;
    const bPerp = 0.5 * (rigidezQueCruza(uv, a0, a1, tela) + rigidezQueCruza(uv, b0, b1, tela));
    const l = Math.hypot(uv[2 * a1] - uv[2 * a0], uv[2 * a1 + 1] - uv[2 * a0 + 1]);
    bisagras.push({ t: deA[0], k: deA[1], d, kh: (bPerp * l * l) / (area(deA[0]) + area(deB[0])) });
  }
  return bisagras;
}
