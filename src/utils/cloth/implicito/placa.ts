/**
 * La flexión de la tela (spec 2026-10-13 §4.1.5): placa ortótropa por triángulo. La curvatura
 * s = (κuu, κuv, κvv) de cada triángulo sale de los ángulos entre caras de sus bordes interiores,
 * θ_k ≈ g_k·s con g_k = t_kᵀ·(J_N − J_T), y la energía es E = ½·θᵀKθ con K = A0·(G·D⁻¹·Gᵀ)⁻¹: la mínima
 * compatible con esos ángulos (un borde libre no lleva momento). K se calcula una vez, en el patrón; la
 * hessiana de Gauss-Newton es Σ K_kl·∇θ_k·∇θ_lᵀ.
 */
import type { BisagraDeCostura } from './costuras';
import type { TelaSI } from './tela';

/**
 * Ángulo entre caras con signo (plano = 0) de la bisagra a-b con alas c y d, y su gradiente respecto de
 * a, b, c y d en `grad` (12 números). Misma convención que dihedral.ts, en doble precisión y con mínimos
 * pensados para mallas de 1 mm (los de dihedral.ts son de precisión simple). null si es degenerada.
 */
export function anguloYGradiente(x: Float64Array, a: number, b: number, c: number, d: number, grad: Float64Array): number | null {
  const ax = x[3 * a], ay = x[3 * a + 1], az = x[3 * a + 2];
  const bx = x[3 * b], by = x[3 * b + 1], bz = x[3 * b + 2];
  const cx = x[3 * c], cy = x[3 * c + 1], cz = x[3 * c + 2];
  const dx = x[3 * d], dy = x[3 * d + 1], dz = x[3 * d + 2];
  const ex = bx - ax, ey = by - ay, ez = bz - az;
  const e2 = ex * ex + ey * ey + ez * ez;
  if (e2 < 1e-16) return null;
  const el = Math.sqrt(e2);
  // n1 = (a − c) × (b − c) y n2 = (b − d) × (a − d), como en dihedral.ts
  const acx = ax - cx, acy = ay - cy, acz = az - cz, bcx = bx - cx, bcy = by - cy, bcz = bz - cz;
  const n1x = acy * bcz - acz * bcy, n1y = acz * bcx - acx * bcz, n1z = acx * bcy - acy * bcx;
  const bdx = bx - dx, bdy = by - dy, bdz = bz - dz, adx = ax - dx, ady = ay - dy, adz = az - dz;
  const n2x = bdy * adz - bdz * ady, n2y = bdz * adx - bdx * adz, n2z = bdx * ady - bdy * adx;
  const n1s = n1x * n1x + n1y * n1y + n1z * n1z, n2s = n2x * n2x + n2y * n2y + n2z * n2z;
  if (n1s < 1e-24 || n2s < 1e-24) return null;
  const i1 = 1 / Math.sqrt(n1s), i2 = 1 / Math.sqrt(n2s);
  const u1x = n1x * i1, u1y = n1y * i1, u1z = n1z * i1, u2x = n2x * i2, u2y = n2y * i2, u2z = n2z * i2;
  const cosT = Math.max(-1, Math.min(1, u1x * u2x + u1y * u2y + u1z * u2z));
  const sinT = ((u1y * u2z - u1z * u2y) * ex + (u1z * u2x - u1x * u2z) * ey + (u1x * u2y - u1y * u2x) * ez) / el;
  // gradientes de Bridson: las alas van con ±|e|·n/|n|²; el eje, con las proyecciones de las alas sobre e
  const g1x = n1x / n1s, g1y = n1y / n1s, g1z = n1z / n1s, g2x = n2x / n2s, g2y = n2y / n2s, g2z = n2z / n2s;
  const cb = ((cx - bx) * ex + (cy - by) * ey + (cz - bz) * ez) / el;
  const db = ((dx - bx) * ex + (dy - by) * ey + (dz - bz) * ez) / el;
  const ac = ((ax - cx) * ex + (ay - cy) * ey + (az - cz) * ez) / el;
  const ad = ((ax - dx) * ex + (ay - dy) * ey + (az - dz) * ez) / el;
  grad[0] = -(g1x * cb + g2x * db); grad[1] = -(g1y * cb + g2y * db); grad[2] = -(g1z * cb + g2z * db);
  grad[3] = -(g1x * ac + g2x * ad); grad[4] = -(g1y * ac + g2y * ad); grad[5] = -(g1z * ac + g2z * ad);
  grad[6] = -g1x * el; grad[7] = -g1y * el; grad[8] = -g1z * el;
  grad[9] = -g2x * el; grad[10] = -g2y * el; grad[11] = -g2z * el;
  return Math.atan2(sinT, cosT);
}

/** Inversa de una matriz simétrica de 1×1 a 3×3; null si es singular. */
function invertir(M: number[][]): number[][] | null {
  let R: number[][];
  if (M.length === 1) R = [[1 / M[0][0]]];
  else if (M.length === 2) {
    const d = M[0][0] * M[1][1] - M[0][1] * M[1][0];
    R = [[M[1][1] / d, -M[0][1] / d], [-M[1][0] / d, M[0][0] / d]];
  } else {
    const [[a, b, c], [d, e, f], [g, h, k]] = M;
    const A = e * k - f * h, B = -(d * k - f * g), C = d * h - e * g, det = a * A + b * B + c * C;
    R = [
      [A / det, -(b * k - c * h) / det, (b * f - c * e) / det],
      [B / det, (a * k - c * g) / det, -(a * f - c * d) / det],
      [C / det, -(a * h - b * g) / det, (a * e - b * d) / det],
    ];
  }
  return R.every((fila) => fila.every(Number.isFinite)) ? R : null;
}

export interface OpcionesPlaca {
  /** bisagras que cruzan las costuras (E2): entran como un borde más de su triángulo, apagadas hasta coser */
  costura?: readonly BisagraDeCostura[];
  /** factor de la flexión de cada triángulo (el margen, margen.ts); 1 por defecto */
  factor?: ArrayLike<number>;
}

export class Placa {
  /** a b c d por bisagra; a→b va en el sentido del triángulo que tiene el ala c, así todas usan la misma convención */
  readonly bisagras: Uint32Array;
  /** por triángulo y borde k (de tris[3t+k] a tris[3t+(k+1)%3]): su bisagra, o −1 si es borde libre */
  readonly bisDeTri: Int32Array;
  /** por triángulo, K de 3×3 (fila mayor) indexado por borde; ceros en los bordes libres */
  readonly K: Float64Array;
  readonly nh: number;
  /** por bisagra de costura: dónde va su rigidez en K (el término diagonal de su borde) y cuánto vale al coser */
  readonly costura: Array<{ o: number; kh: number }>;
  /** por bisagra: θ y ∇θ respecto de a, b, c y d (13 números), del último `linealizar` */
  readonly estado: Float64Array;
  private readonly g = new Float64Array(12);
  private readonly th = new Float64Array(3);
  private readonly gi = new Float64Array(9);
  private readonly gj = new Float64Array(9);

  constructor(uv: Float64Array, readonly tris: Uint32Array, tela: TelaSI, op: OpcionesPlaca = {}) {
    const nt = tris.length / 3, n = uv.length / 2;
    const clave = (a: number, b: number) => (a < b ? a * n + b : b * n + a);
    const deArista = new Map<number, Array<[number, number]>>();
    for (let t = 0; t < nt; t++) {
      for (let k = 0; k < 3; k++) {
        const key = clave(tris[3 * t + k], tris[3 * t + ((k + 1) % 3)]);
        const lista = deArista.get(key);
        if (lista) lista.push([t, k]);
        else deArista.set(key, [[t, k]]);
      }
    }
    const tercero = (t: number, a: number, b: number) => {
      for (let k = 0; k < 3; k++) {
        const v = tris[3 * t + k];
        if (v !== a && v !== b) return v;
      }
      return -1;
    };
    const bis: number[] = [];
    const bisDeArista = new Map<number, number>();
    for (const [key, lista] of deArista) {
      if (lista.length !== 2) continue;
      const [t0, k0] = lista[0];
      const a = tris[3 * t0 + k0], b = tris[3 * t0 + ((k0 + 1) % 3)];
      bisDeArista.set(key, bis.length / 4);
      bis.push(a, b, tercero(t0, a, b), tercero(lista[1][0], a, b));
    }
    // las bisagras de costura van después de las de adentro, con a→b en el sentido del triángulo que tiene el ala c
    const deCostura: Array<{ t: number; k: number; h: number; kh: number }> = [];
    for (const c of op.costura ?? []) {
      const a = tris[3 * c.t + c.k], b = tris[3 * c.t + ((c.k + 1) % 3)];
      deCostura.push({ t: c.t, k: c.k, h: bis.length / 4, kh: c.kh * (op.factor ? op.factor[c.t] : 1) });
      bis.push(a, b, tercero(c.t, a, b), c.d);
    }
    this.bisagras = Uint32Array.from(bis);
    this.nh = bis.length / 4;
    this.estado = new Float64Array(13 * this.nh);
    this.bisDeTri = new Int32Array(3 * nt).fill(-1);
    this.K = new Float64Array(9 * nt);

    // pendiente exacta de cada triángulo plano sobre h = ½·pᵀ·S·p: ∇L_T = J_T·s (J_T de 2×3), con el origen
    // común de toda la pieza para que la diferencia entre vecinos no pierda el término lineal
    const J = new Float64Array(6 * nt), A0 = new Float64Array(nt);
    for (let t = 0; t < nt; t++) {
      const p0 = tris[3 * t];
      const q: number[][] = [], fil: number[][] = [];
      for (let j = 1; j <= 2; j++) {
        const pj = tris[3 * t + j];
        const qu = uv[2 * pj] - uv[2 * p0], qv = uv[2 * pj + 1] - uv[2 * p0 + 1];
        const ru = uv[2 * pj] + uv[2 * p0], rv = uv[2 * pj + 1] + uv[2 * p0 + 1];
        q.push([qu, qv]);
        fil.push([0.5 * qu * ru, 0.5 * (qu * rv + qv * ru), 0.5 * qv * rv]);
      }
      // ∇L·q_j = fil_j·s  ⇒  ∇L = (Qᵀ)⁻¹·fil·s
      const det = q[0][0] * q[1][1] - q[0][1] * q[1][0];
      A0[t] = Math.abs(det) / 2;
      const i00 = q[1][1] / det, i01 = -q[0][1] / det, i10 = -q[1][0] / det, i11 = q[0][0] / det;
      for (let c = 0; c < 3; c++) {
        J[6 * t + c] = i00 * fil[0][c] + i01 * fil[1][c];
        J[6 * t + 3 + c] = i10 * fil[0][c] + i11 * fil[1][c];
      }
    }
    const centro = (t: number): [number, number] => {
      let cu = 0, cv = 0;
      for (let k = 0; k < 3; k++) {
        const p = tris[3 * t + k];
        cu += uv[2 * p] / 3;
        cv += uv[2 * p + 1] / 3;
      }
      return [cu, cv];
    };
    const { bTrama: bu, bUrdimbre: bv, bBies: bb } = tela;
    const D66 = Math.max(1e-3 * Math.min(bu, bv), bb - (bu + bv) / 4);
    const Dinv = [1 / bu, 1 / (4 * D66), 1 / bv];
    for (let t = 0; t < nt; t++) {
      const [cu, cv] = centro(t);
      const filas: number[][] = [], cuales: number[] = [];
      for (let k = 0; k < 3; k++) {
        const pa = tris[3 * t + k], pb = tris[3 * t + ((k + 1) % 3)];
        const key = clave(pa, pb), e = bisDeArista.get(key), lista = deArista.get(key);
        if (e === undefined || !lista) continue;
        const vecino = lista[0][0] === t ? lista[1][0] : lista[0][0];
        const [nu, nv] = centro(vecino);
        // normal del borde en el patrón, hacia el vecino
        let tu = -(uv[2 * pb + 1] - uv[2 * pa + 1]), tv = uv[2 * pb] - uv[2 * pa];
        const tl = Math.hypot(tu, tv);
        tu /= tl;
        tv /= tl;
        if (tu * (nu - cu) + tv * (nv - cv) < 0) {
          tu = -tu;
          tv = -tv;
        }
        filas.push([0, 1, 2].map((c) => tu * (J[6 * vecino + c] - J[6 * t + c]) + tv * (J[6 * vecino + 3 + c] - J[6 * t + 3 + c])));
        cuales.push(k);
        this.bisDeTri[3 * t + k] = e;
      }
      if (filas.length === 0) continue;
      const M = filas.map((gi) => filas.map((gj) => gi[0] * gj[0] * Dinv[0] + gi[1] * gj[1] * Dinv[1] + gi[2] * gj[2] * Dinv[2]));
      const Mi = invertir(M);
      // si sus bordes no miden curvaturas independientes, el triángulo queda sin flexión propia
      if (!Mi) continue;
      const f = op.factor ? op.factor[t] : 1;
      for (let r = 0; r < filas.length; r++) {
        for (let c = 0; c < filas.length; c++) this.K[9 * t + 3 * cuales[r] + cuales[c]] = f * A0[t] * Mi[r][c];
      }
    }
    this.costura = [];
    for (const c of deCostura) {
      if (this.bisDeTri[3 * c.t + c.k] >= 0) continue; // el borde no era libre: queda su bisagra de adentro
      this.bisDeTri[3 * c.t + c.k] = c.h;
      this.costura.push({ o: 9 * c.t + 4 * c.k, kh: c.kh });
    }
  }

  /** Enciende las bisagras de costura: desde aquí, la flexión cruza la costura. */
  activarCosturas(): void {
    for (const c of this.costura) this.K[c.o] = c.kh;
  }

  /** θ y ∇θ de cada bisagra en las posiciones x. */
  linealizar(x: Float64Array): void {
    const g = this.g, e = this.estado;
    for (let h = 0; h < this.nh; h++) {
      const q = 4 * h, s = 13 * h;
      const th = anguloYGradiente(x, this.bisagras[q], this.bisagras[q + 1], this.bisagras[q + 2], this.bisagras[q + 3], g);
      e[s] = th ?? 0;
      for (let k = 0; k < 12; k++) e[s + 1 + k] = th === null ? 0 : g[k];
    }
  }

  /** ½·θᵀKθ del triángulo t con `th`, el ángulo de cada bisagra. */
  energiaDe(t: number, th: Float64Array): number {
    const v = this.th;
    for (let k = 0; k < 3; k++) {
      const h = this.bisDeTri[3 * t + k];
      v[k] = h < 0 ? 0 : th[h];
    }
    let E = 0;
    for (let k = 0; k < 3; k++) for (let l = 0; l < 3; l++) E += 0.5 * this.K[9 * t + 3 * k + l] * v[k] * v[l];
    return E;
  }

  /** Energía de flexión en las posiciones x. */
  energia(x: Float64Array): number {
    const th = new Float64Array(this.nh);
    for (let h = 0; h < this.nh; h++) {
      const q = 4 * h;
      th[h] = anguloYGradiente(x, this.bisagras[q], this.bisagras[q + 1], this.bisagras[q + 2], this.bisagras[q + 3], this.g) ?? 0;
    }
    let E = 0;
    for (let t = 0; t < this.tris.length / 3; t++) E += this.energiaDe(t, th);
    return E;
  }

  /** out += ∇E, del último `linealizar`. */
  gradiente(out: Float64Array): void {
    const e = this.estado, v = this.th;
    for (let t = 0; t < this.tris.length / 3; t++) {
      for (let k = 0; k < 3; k++) {
        const h = this.bisDeTri[3 * t + k];
        v[k] = h < 0 ? 0 : e[13 * h];
      }
      for (let k = 0; k < 3; k++) {
        const h = this.bisDeTri[3 * t + k];
        if (h < 0) continue;
        const w = this.K[9 * t + 3 * k] * v[0] + this.K[9 * t + 3 * k + 1] * v[1] + this.K[9 * t + 3 * k + 2] * v[2];
        if (w === 0) continue;
        for (let r = 0; r < 4; r++) {
          const q = 3 * this.bisagras[4 * h + r], s = 13 * h + 1 + 3 * r;
          out[q] += w * e[s];
          out[q + 1] += w * e[s + 1];
          out[q + 2] += w * e[s + 2];
        }
      }
    }
  }

  /** out += H·p con la hessiana de Gauss-Newton, del último `linealizar`. */
  hessianaPor(p: Float64Array, out: Float64Array): void {
    const e = this.estado, jp = this.th;
    for (let t = 0; t < this.tris.length / 3; t++) {
      for (let k = 0; k < 3; k++) {
        jp[k] = 0;
        const h = this.bisDeTri[3 * t + k];
        if (h < 0) continue;
        for (let r = 0; r < 4; r++) {
          const q = 3 * this.bisagras[4 * h + r], s = 13 * h + 1 + 3 * r;
          jp[k] += e[s] * p[q] + e[s + 1] * p[q + 1] + e[s + 2] * p[q + 2];
        }
      }
      for (let k = 0; k < 3; k++) {
        const h = this.bisDeTri[3 * t + k];
        if (h < 0) continue;
        const w = this.K[9 * t + 3 * k] * jp[0] + this.K[9 * t + 3 * k + 1] * jp[1] + this.K[9 * t + 3 * k + 2] * jp[2];
        if (w === 0) continue;
        for (let r = 0; r < 4; r++) {
          const q = 3 * this.bisagras[4 * h + r], s = 13 * h + 1 + 3 * r;
          out[q] += w * e[s];
          out[q + 1] += w * e[s + 1];
          out[q + 2] += w * e[s + 2];
        }
      }
    }
  }

  /** Los vértices de las bisagras del triángulo t, sin repetir: los que toca su flexión. */
  plantilla(t: number): number[] {
    const s = new Set<number>();
    for (let k = 0; k < 3; k++) {
      const h = this.bisDeTri[3 * t + k];
      if (h >= 0) for (let r = 0; r < 4; r++) s.add(this.bisagras[4 * h + r]);
    }
    return [...s];
  }

  /** M[o..o+8] += Σ K_kl·g_k(i)·g_l(j)ᵀ del triángulo t (fila mayor), del último `linealizar`. */
  sumarBloque(t: number, i: number, j: number, M: Float64Array, o = 0): void {
    const gi = this.gi, gj = this.gj, e = this.estado;
    gi.fill(0);
    gj.fill(0);
    for (let k = 0; k < 3; k++) {
      const h = this.bisDeTri[3 * t + k];
      if (h < 0) continue;
      for (let r = 0; r < 4; r++) {
        const v = this.bisagras[4 * h + r], s = 13 * h + 1 + 3 * r;
        if (v === i) for (let d = 0; d < 3; d++) gi[3 * k + d] = e[s + d];
        if (v === j) for (let d = 0; d < 3; d++) gj[3 * k + d] = e[s + d];
      }
    }
    for (let k = 0; k < 3; k++) {
      for (let l = 0; l < 3; l++) {
        const c = this.K[9 * t + 3 * k + l];
        if (c === 0) continue;
        for (let a = 0; a < 3; a++) for (let b = 0; b < 3; b++) M[o + 3 * a + b] += c * gi[3 * k + a] * gj[3 * l + b];
      }
    }
  }

  /** out[9v..9v+8] += el bloque diagonal de flexión de cada vértice. */
  sumarBloquesDiagonales(out: Float64Array): void {
    for (let t = 0; t < this.tris.length / 3; t++) for (const v of this.plantilla(t)) this.sumarBloque(t, v, v, out, 9 * v);
  }
}
