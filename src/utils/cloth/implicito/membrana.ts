/**
 * La membrana de la tela (spec 2026-10-13 §4.1.3 y §4.1.4). Por triángulo
 *   E = A0·[ψ_u(|f_u| − 1) + ψ_v(|f_v| − 1) + ½·kCizalla·(f_u·f_v)²]
 * con tracción lineal por hilo y pandeo de Choi y Ko al encoger, y su hessiana de Gauss-Newton:
 * k·n·nᵀ + max(ψ'/s, 0)·(I − n·nᵀ) por hilo y kCizalla·∇γ·∇γᵀ para la cizalla. A lo largo del hilo va la
 * rigidez k también en la meseta de pandeo, donde ψ'' es 0: la energía y la fuerza siguen la ley, pero el
 * paso no mueve gratis el hilo comprimido (con 0, la malla gruesa se trababa).
 */
import type { TelaSI } from './tela';

/**
 * ψ(ε), ψ'(ε) y ψ''(ε) por unidad de área: rigidez k hasta la carga de pandeo `pcr` (N/m) al encoger;
 * desde ahí la fuerza queda en −pcr y la tela se dobla en vez de encoger.
 */
export function ley(eps: number, k: number, pcr: number): [number, number, number] {
  const ecr = pcr / k;
  if (eps >= -ecr) return [0.5 * k * eps * eps, k * eps, k];
  return [0.5 * k * ecr * ecr + pcr * (-eps - ecr), -pcr, 0];
}

/**
 * Estado de cada triángulo tras `linealizar`: f_u(3) f_v(3) |f_u| |f_v| ψ'_u/|f_u| ψ'_v/|f_v| k_u k_v
 * max(ψ'_u/|f_u|, 0) max(ψ'_v/|f_v|, 0), con k_u y k_v la rigidez del hilo en la hessiana. La GPU usa la
 * misma disposición.
 */
export const ESTADO_MEMBRANA = 14;

export class Membrana {
  readonly nt: number;
  /** carga de pandeo por triángulo (N/m) a lo ancho y a lo largo: P = pandeo·π²·B/L², con L = √(2·A0) */
  readonly pcrU: Float64Array;
  readonly pcrV: Float64Array;
  readonly estado: Float64Array;
  private readonly f = new Float64Array(6);

  constructor(readonly tris: Uint32Array, readonly coef: Float64Array, readonly tela: TelaSI) {
    this.nt = tris.length / 3;
    this.pcrU = new Float64Array(this.nt);
    this.pcrV = new Float64Array(this.nt);
    for (let t = 0; t < this.nt; t++) {
      const L2 = 2 * coef[7 * t + 6];
      this.pcrU[t] = (tela.pandeo * Math.PI * Math.PI * tela.bTrama) / L2;
      this.pcrV[t] = (tela.pandeo * Math.PI * Math.PI * tela.bUrdimbre) / L2;
    }
    this.estado = new Float64Array(ESTADO_MEMBRANA * this.nt);
  }

  /** f_u y f_v del triángulo t en las posiciones x, en `f`. */
  private columnas(t: number, x: Float64Array, f: Float64Array): void {
    const o = 7 * t, c = this.coef;
    f.fill(0);
    for (let k = 0; k < 3; k++) {
      const q = 3 * this.tris[3 * t + k], a = c[o + k], b = c[o + 3 + k];
      f[0] += a * x[q]; f[1] += a * x[q + 1]; f[2] += a * x[q + 2];
      f[3] += b * x[q]; f[4] += b * x[q + 1]; f[5] += b * x[q + 2];
    }
  }

  /** Energía del triángulo t en las posiciones x. */
  energiaDe(t: number, x: Float64Array): number {
    const f = this.f;
    this.columnas(t, x, f);
    const su = Math.hypot(f[0], f[1], f[2]), sv = Math.hypot(f[3], f[4], f[5]);
    const g = f[0] * f[3] + f[1] * f[4] + f[2] * f[5];
    const { kTrama, kUrdimbre, kCizalla } = this.tela;
    return this.coef[7 * t + 6] * (ley(su - 1, kTrama, this.pcrU[t])[0] + ley(sv - 1, kUrdimbre, this.pcrV[t])[0] + 0.5 * kCizalla * g * g);
  }

  energia(x: Float64Array): number {
    let E = 0;
    for (let t = 0; t < this.nt; t++) E += this.energiaDe(t, x);
    return E;
  }

  /** Guarda el estado de cada triángulo en las posiciones x, para el gradiente, H·p y los bloques. */
  linealizar(x: Float64Array): void {
    const f = this.f, e = this.estado, { kTrama, kUrdimbre } = this.tela;
    for (let t = 0; t < this.nt; t++) {
      this.columnas(t, x, f);
      const su = Math.hypot(f[0], f[1], f[2]), sv = Math.hypot(f[3], f[4], f[5]);
      const du = ley(su - 1, kTrama, this.pcrU[t])[1];
      const dv = ley(sv - 1, kUrdimbre, this.pcrV[t])[1];
      // un triángulo aplastado en una dirección no tiene dirección: sin fuerza ni rigidez transversal
      const gu = su > 1e-12 ? du / su : 0, gv = sv > 1e-12 ? dv / sv : 0;
      const s = ESTADO_MEMBRANA * t;
      for (let k = 0; k < 6; k++) e[s + k] = f[k];
      e[s + 6] = su; e[s + 7] = sv; e[s + 8] = gu; e[s + 9] = gv; e[s + 10] = kTrama; e[s + 11] = kUrdimbre;
      e[s + 12] = Math.max(gu, 0); e[s + 13] = Math.max(gv, 0);
    }
  }

  /** out += ∇E, del último `linealizar`. */
  gradiente(out: Float64Array): void {
    const e = this.estado, c = this.coef, kC = this.tela.kCizalla;
    for (let t = 0; t < this.nt; t++) {
      const s = ESTADO_MEMBRANA * t, o = 7 * t, A0 = c[o + 6];
      const ux = e[s], uy = e[s + 1], uz = e[s + 2], vx = e[s + 3], vy = e[s + 4], vz = e[s + 5];
      const gu = e[s + 8], gv = e[s + 9], ks = kC * (ux * vx + uy * vy + uz * vz);
      for (let k = 0; k < 3; k++) {
        const q = 3 * this.tris[3 * t + k], a = c[o + k], b = c[o + 3 + k];
        out[q] += A0 * (gu * a * ux + gv * b * vx + ks * (a * vx + b * ux));
        out[q + 1] += A0 * (gu * a * uy + gv * b * vy + ks * (a * vy + b * uy));
        out[q + 2] += A0 * (gu * a * uz + gv * b * vz + ks * (a * vz + b * uz));
      }
    }
  }

  /** out += H·p con la hessiana de Gauss-Newton, del último `linealizar`. */
  hessianaPor(p: Float64Array, out: Float64Array): void {
    const e = this.estado, c = this.coef, kC = this.tela.kCizalla;
    for (let t = 0; t < this.nt; t++) {
      const s = ESTADO_MEMBRANA * t, o = 7 * t, A0 = c[o + 6];
      let du0 = 0, du1 = 0, du2 = 0, dv0 = 0, dv1 = 0, dv2 = 0;
      for (let k = 0; k < 3; k++) {
        const q = 3 * this.tris[3 * t + k], a = c[o + k], b = c[o + 3 + k];
        du0 += a * p[q]; du1 += a * p[q + 1]; du2 += a * p[q + 2];
        dv0 += b * p[q]; dv1 += b * p[q + 1]; dv2 += b * p[q + 2];
      }
      const ux = e[s], uy = e[s + 1], uz = e[s + 2], vx = e[s + 3], vy = e[s + 4], vz = e[s + 5];
      const su = e[s + 6], sv = e[s + 7];
      // por hilo: ψ''·(n·d)·n + max(ψ'/s, 0)·(d − (n·d)·n), con n = f/|f|
      let hu0 = 0, hu1 = 0, hu2 = 0, hv0 = 0, hv1 = 0, hv2 = 0;
      if (su > 1e-12) {
        const nx = ux / su, ny = uy / su, nz = uz / su, pn = nx * du0 + ny * du1 + nz * du2, h = e[s + 10], tr = e[s + 12];
        hu0 = h * pn * nx + tr * (du0 - pn * nx);
        hu1 = h * pn * ny + tr * (du1 - pn * ny);
        hu2 = h * pn * nz + tr * (du2 - pn * nz);
      }
      if (sv > 1e-12) {
        const nx = vx / sv, ny = vy / sv, nz = vz / sv, pn = nx * dv0 + ny * dv1 + nz * dv2, h = e[s + 11], tr = e[s + 13];
        hv0 = h * pn * nx + tr * (dv0 - pn * nx);
        hv1 = h * pn * ny + tr * (dv1 - pn * ny);
        hv2 = h * pn * nz + tr * (dv2 - pn * nz);
      }
      // cizalla: kCizalla·∇γ·(∇γ·p), con ∇γ·p = d_u·f_v + f_u·d_v
      const dg = kC * (du0 * vx + du1 * vy + du2 * vz + ux * dv0 + uy * dv1 + uz * dv2);
      for (let k = 0; k < 3; k++) {
        const q = 3 * this.tris[3 * t + k], a = c[o + k], b = c[o + 3 + k];
        out[q] += A0 * (a * hu0 + b * hv0 + dg * (a * vx + b * ux));
        out[q + 1] += A0 * (a * hu1 + b * hv1 + dg * (a * vy + b * uy));
        out[q + 2] += A0 * (a * hu2 + b * hv2 + dg * (a * vz + b * uz));
      }
    }
  }

  /** M[o..o+8] += el bloque (li, lj) de la hessiana del triángulo t (fila mayor). */
  sumarBloque(t: number, li: number, lj: number, M: Float64Array, o = 0): void {
    const e = this.estado, s = ESTADO_MEMBRANA * t, c = this.coef, oc = 7 * t, A0 = c[oc + 6];
    const ai = c[oc + li], bi = c[oc + 3 + li], aj = c[oc + lj], bj = c[oc + 3 + lj];
    const su = e[s + 6], sv = e[s + 7], kC = this.tela.kCizalla;
    const nu = [0, 1, 2].map((d) => (su > 1e-12 ? e[s + d] / su : 0));
    const nv = [0, 1, 2].map((d) => (sv > 1e-12 ? e[s + 3 + d] / sv : 0));
    const di = [0, 1, 2].map((d) => ai * e[s + 3 + d] + bi * e[s + d]);
    const dj = [0, 1, 2].map((d) => aj * e[s + 3 + d] + bj * e[s + d]);
    for (let r = 0; r < 3; r++) {
      for (let q = 0; q < 3; q++) {
        const id = r === q ? 1 : 0;
        const Hu = (e[s + 10] - e[s + 12]) * nu[r] * nu[q] + e[s + 12] * id;
        const Hv = (e[s + 11] - e[s + 13]) * nv[r] * nv[q] + e[s + 13] * id;
        M[o + 3 * r + q] += A0 * (ai * aj * Hu + bi * bj * Hv + kC * di[r] * dj[q]);
      }
    }
  }

  /** out[9i..9i+8] += el bloque diagonal de cada vértice. */
  sumarBloquesDiagonales(out: Float64Array): void {
    for (let t = 0; t < this.nt; t++) for (let j = 0; j < 3; j++) this.sumarBloque(t, j, j, out, 9 * this.tris[3 * t + j]);
  }
}
