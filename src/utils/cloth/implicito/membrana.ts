/**
 * La membrana de la tela (spec 2026-10-13 §4.1.3 y §4.1.4). Por triángulo
 *   E = A0·[ψ_u(|f_u| − 1) + ψ_v(|f_v| − 1) + ½·kCizalla·(f_u·f_v)²]
 * con tracción lineal por hilo y pandeo de Choi y Ko al encoger, y su hessiana de Gauss-Newton:
 * k·n·nᵀ + max(ψ'/s, 0)·(I − n·nᵀ) por hilo y kCizalla·∇γ·∇γᵀ para la cizalla. A lo largo del hilo va la
 * rigidez k también en la meseta de pandeo, donde ψ'' es 0: la energía y la fuerza siguen la ley, pero el
 * paso no mueve gratis el hilo comprimido (con 0, la malla gruesa se trababa). E13: bajo la mitad de su área, la barrera
 * de área A0·κ·b(J) no deja que el triángulo se aplaste ni se dé vuelta.
 */
import type { TelaSI } from './tela';

/** E13: la fracción de su área (J = A/A0) desde la que la tela resiste aplastarse, como cuando los hilos se traban. */
export const AREA_MINIMA = 0.5;
/** La rigidez de la barrera de área, en veces la tracción más rígida de la tela. */
export const RIGIDEZ_DE_AREA = 10;

/**
 * b(J), b'(J) y b''(J) de la barrera de área (E13): −(J − J₀)²·ln(J/J₀) bajo J₀ = AREA_MINIMA y 0 encima; es la barrera de
 * IPC, C² en J₀, y crece sin tope al aplastar el triángulo (su fuerza va como 1/J). J se acota en 10⁻¹² para que un
 * triángulo hecho un punto no dé infinito.
 */
export function barreraDeArea(J: number): [number, number, number] {
  if (J >= AREA_MINIMA) return [0, 0, 0];
  const j = Math.max(J, 1e-12), d = j - AREA_MINIMA, l = Math.log(j / AREA_MINIMA);
  return [-d * d * l, -2 * d * l - (d * d) / j, -2 * l - (4 * d) / j + (d * d) / (j * j)];
}

/** J = |f_u × f_v| y sus derivadas ∂J/∂f_u = f_v × n̂ y ∂J/∂f_v = n̂ × f_u (n̂ = f_u × f_v / J), en `g` (6 números). */
function areaYGradiente(ux: number, uy: number, uz: number, vx: number, vy: number, vz: number, g: Float64Array): number {
  const cx = uy * vz - uz * vy, cy = uz * vx - ux * vz, cz = ux * vy - uy * vx, J = Math.hypot(cx, cy, cz);
  if (J < 1e-12) {
    g.fill(0);
    return J;
  }
  const nx = cx / J, ny = cy / J, nz = cz / J;
  g[0] = vy * nz - vz * ny; g[1] = vz * nx - vx * nz; g[2] = vx * ny - vy * nx;
  g[3] = ny * uz - nz * uy; g[4] = nz * ux - nx * uz; g[5] = nx * uy - ny * ux;
  return J;
}

/**
 * ψ(ε), ψ'(ε) y ψ''(ε) por unidad de área: rigidez k hasta la carga de pandeo `pcr` (N/m) al encoger;
 * desde ahí la fuerza queda en −pcr y la tela se dobla en vez de encoger. Pasado el encogimiento `tope`, la
 * tela vuelve a resistir con k: ψ suma ½·k·(ε + tope)².
 */
export function ley(eps: number, k: number, pcr: number, tope = Infinity): [number, number, number] {
  const ecr = pcr / k;
  if (eps >= -ecr) return [0.5 * k * eps * eps, k * eps, k];
  const meseta = 0.5 * k * ecr * ecr + pcr * (-eps - ecr);
  const t = Math.max(tope, ecr);
  if (eps >= -t) return [meseta, -pcr, 0];
  return [meseta + 0.5 * k * (eps + t) * (eps + t), -pcr + k * (eps + t), k];
}

/**
 * Estado de cada triángulo tras `linealizar`: f_u(3) f_v(3) |f_u| |f_v| ψ'_u/|f_u| ψ'_v/|f_v| k_u k_v
 * max(ψ'_u/|f_u|, 0) max(ψ'_v/|f_v|, 0) J κ·b'(J) κ·b''(J), con k_u y k_v la rigidez del hilo en la hessiana y b la
 * barrera de área (E13). La GPU usa la misma disposición.
 */
export const ESTADO_MEMBRANA = 17;

export class Membrana {
  readonly nt: number;
  /** carga de pandeo por triángulo (N/m) a lo ancho y a lo largo: P = pandeo·π²·B/L², con L = √(2·A0) */
  readonly pcrU: Float64Array;
  readonly pcrV: Float64Array;
  readonly estado: Float64Array;
  /** la rigidez de la barrera de área (E13), N/m */
  readonly kArea: number;
  private readonly f = new Float64Array(6);
  private readonly gJ = new Float64Array(6);

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
    this.kArea = RIGIDEZ_DE_AREA * Math.max(tela.kTrama, tela.kUrdimbre);
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
    const { kTrama, kUrdimbre, kCizalla, topePandeo } = this.tela;
    const J = areaYGradiente(f[0], f[1], f[2], f[3], f[4], f[5], this.gJ);
    return this.coef[7 * t + 6] * (ley(su - 1, kTrama, this.pcrU[t], topePandeo)[0] + ley(sv - 1, kUrdimbre, this.pcrV[t], topePandeo)[0] + 0.5 * kCizalla * g * g + this.kArea * barreraDeArea(J)[0]);
  }

  energia(x: Float64Array): number {
    let E = 0;
    for (let t = 0; t < this.nt; t++) E += this.energiaDe(t, x);
    return E;
  }

  /** Guarda el estado de cada triángulo en las posiciones x, para el gradiente, H·p y los bloques. */
  linealizar(x: Float64Array): void {
    const f = this.f, e = this.estado, { kTrama, kUrdimbre, topePandeo } = this.tela;
    for (let t = 0; t < this.nt; t++) {
      this.columnas(t, x, f);
      const su = Math.hypot(f[0], f[1], f[2]), sv = Math.hypot(f[3], f[4], f[5]);
      const du = ley(su - 1, kTrama, this.pcrU[t], topePandeo)[1];
      const dv = ley(sv - 1, kUrdimbre, this.pcrV[t], topePandeo)[1];
      // un triángulo aplastado en una dirección no tiene dirección: sin fuerza ni rigidez transversal
      const gu = su > 1e-12 ? du / su : 0, gv = sv > 1e-12 ? dv / sv : 0;
      const s = ESTADO_MEMBRANA * t;
      for (let k = 0; k < 6; k++) e[s + k] = f[k];
      e[s + 6] = su; e[s + 7] = sv; e[s + 8] = gu; e[s + 9] = gv; e[s + 10] = kTrama; e[s + 11] = kUrdimbre;
      e[s + 12] = Math.max(gu, 0); e[s + 13] = Math.max(gv, 0);
      const J = areaYGradiente(f[0], f[1], f[2], f[3], f[4], f[5], this.gJ), [, db, hb] = barreraDeArea(J);
      e[s + 14] = J; e[s + 15] = this.kArea * db; e[s + 16] = this.kArea * hb;
    }
  }

  /** ∂J/∂f_u y ∂J/∂f_v del triángulo t (del último `linealizar`) en `gJ`; false si no hay barrera. */
  private gradienteDeArea(t: number): boolean {
    const e = this.estado, s = ESTADO_MEMBRANA * t;
    if (e[s + 15] === 0 && e[s + 16] === 0) return false;
    areaYGradiente(e[s], e[s + 1], e[s + 2], e[s + 3], e[s + 4], e[s + 5], this.gJ);
    return true;
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
      // E13: κ·b'(J)·∇J
      if (this.gradienteDeArea(t)) {
        const w = A0 * e[s + 15], g = this.gJ;
        for (let k = 0; k < 3; k++) {
          const q = 3 * this.tris[3 * t + k], a = c[o + k], b = c[o + 3 + k];
          out[q] += w * (a * g[0] + b * g[3]);
          out[q + 1] += w * (a * g[1] + b * g[4]);
          out[q + 2] += w * (a * g[2] + b * g[5]);
        }
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
      // E13: κ·b''(J)·∇J·(∇J·p), con ∇J·p = ∂J/∂f_u·d_u + ∂J/∂f_v·d_v
      if (this.gradienteDeArea(t)) {
        const g = this.gJ, w = A0 * e[s + 16] * (g[0] * du0 + g[1] * du1 + g[2] * du2 + g[3] * dv0 + g[4] * dv1 + g[5] * dv2);
        for (let k = 0; k < 3; k++) {
          const q = 3 * this.tris[3 * t + k], a = c[o + k], b = c[o + 3 + k];
          out[q] += w * (a * g[0] + b * g[3]);
          out[q + 1] += w * (a * g[1] + b * g[4]);
          out[q + 2] += w * (a * g[2] + b * g[5]);
        }
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
    // E13: κ·b''(J)·(a_i·∂J/∂f_u + b_i·∂J/∂f_v)(a_j·∂J/∂f_u + b_j·∂J/∂f_v)ᵀ
    if (this.gradienteDeArea(t)) {
      const g = this.gJ, w = A0 * e[s + 16];
      for (let r = 0; r < 3; r++) for (let q = 0; q < 3; q++) M[o + 3 * r + q] += w * (ai * g[r] + bi * g[3 + r]) * (aj * g[q] + bj * g[3 + q]);
    }
  }

  /** out[9i..9i+8] += el bloque diagonal de cada vértice. */
  sumarBloquesDiagonales(out: Float64Array): void {
    for (let t = 0; t < this.nt; t++) for (let j = 0; j < 3; j++) this.sumarBloque(t, j, j, out, 9 * this.tris[3 * t + j]);
  }
}
