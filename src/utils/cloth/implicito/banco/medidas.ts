/**
 * Lo que mide el banco sobre unas posiciones, sin importar qué motor las produjo (spec 2026-10-13 §2 y
 * §4.4).
 */
import { computeDrapeCoefficient, countFolds, extractOrderedBoundaryLoop } from '../../cusickMetric';
import type { PuntoDeCostura } from '../costuras';
import type { CuerpoRigido } from '../cuerpo';
import type { MallaDeTela } from '../malla';
import { CUSICK, MESA_DE_PEIRCE } from './escenas';

/** El percentil p (0..1) de unos valores; NaN si no hay. */
export function percentil(v: ArrayLike<number>, p: number): number {
  const s = Float64Array.from(v).sort();
  return s.length > 0 ? s[Math.min(s.length - 1, Math.floor(p * (s.length - 1)))] : NaN;
}

/** El estiramiento de cada arista frente a su largo en el patrón (fracción), en toda la malla o en un rango de triángulos: percentiles y el % que encogió más de 10 %. */
export function estiramiento(
  x: ArrayLike<number>,
  malla: MallaDeTela,
  desde = 0,
  cuantos = malla.tris.length / 3 - desde,
): { p05: number; p50: number; p95: number; encogidas: number } {
  const { tris, patron } = malla, n = patron.length / 2, vistas = new Set<number>(), e: number[] = [];
  for (let t = desde; t < desde + cuantos; t++) {
    for (let k = 0; k < 3; k++) {
      const a = tris[3 * t + k], b = tris[3 * t + ((k + 1) % 3)], clave = a < b ? a * n + b : b * n + a;
      if (vistas.has(clave)) continue;
      vistas.add(clave);
      const L0 = Math.hypot(patron[2 * b] - patron[2 * a], patron[2 * b + 1] - patron[2 * a + 1]);
      if (L0 > 0) e.push(Math.hypot(x[3 * b] - x[3 * a], x[3 * b + 1] - x[3 * a + 1], x[3 * b + 2] - x[3 * a + 2]) / L0 - 1);
    }
  }
  return { p05: percentil(e, 0.05), p50: percentil(e, 0.5), p95: percentil(e, 0.95), encogidas: (100 * e.filter((q) => q < -0.1).length) / e.length };
}

/** La separación de cada punto de costura (m): |x_a − (1 − s)·x_b0 − s·x_b1|, mediana y máxima. */
export function separacionDeCosturas(x: ArrayLike<number>, puntos: readonly PuntoDeCostura[]): { mediana: number; maxima: number } {
  const s = puntos.map((p) => Math.hypot(...[0, 1, 2].map((d) => x[3 * p.a + d] - (1 - p.s) * x[3 * p.b0 + d] - p.s * x[3 * p.b1 + d])));
  return { mediana: percentil(s, 0.5), maxima: s.reduce((m, q) => Math.max(m, q), 0) };
}

/** El ángulo entre las caras de cada arista interior (grados): mediana, p95 y cuántas pasan de 90° y de 150°. */
export function pliegues(x: ArrayLike<number>, malla: MallaDeTela): { p50: number; p95: number; sobre90: number; sobre150: number } {
  const { tris } = malla, nt = tris.length / 3, n = x.length / 3;
  const normal = new Float64Array(3 * nt);
  for (let t = 0; t < nt; t++) {
    const a = 3 * tris[3 * t], b = 3 * tris[3 * t + 1], c = 3 * tris[3 * t + 2];
    const ux = x[b] - x[a], uy = x[b + 1] - x[a + 1], uz = x[b + 2] - x[a + 2], wx = x[c] - x[a], wy = x[c + 1] - x[a + 1], wz = x[c + 2] - x[a + 2];
    const nx = uy * wz - uz * wy, ny = uz * wx - ux * wz, nz = ux * wy - uy * wx, l = Math.hypot(nx, ny, nz) || 1;
    normal[3 * t] = nx / l;
    normal[3 * t + 1] = ny / l;
    normal[3 * t + 2] = nz / l;
  }
  const primera = new Map<number, number>(), angulos: number[] = [];
  for (let t = 0; t < nt; t++) {
    for (let k = 0; k < 3; k++) {
      const a = tris[3 * t + k], b = tris[3 * t + ((k + 1) % 3)], clave = a < b ? a * n + b : b * n + a;
      const otra = primera.get(clave);
      if (otra === undefined) {
        primera.set(clave, t);
        continue;
      }
      const c = normal[3 * t] * normal[3 * otra] + normal[3 * t + 1] * normal[3 * otra + 1] + normal[3 * t + 2] * normal[3 * otra + 2];
      angulos.push((Math.acos(Math.max(-1, Math.min(1, c))) * 180) / Math.PI);
    }
  }
  return { p50: percentil(angulos, 0.5), p95: percentil(angulos, 0.95), sobre90: angulos.filter((q) => q > 90).length, sobre150: angulos.filter((q) => q > 150).length };
}

/** La distancia con signo de cada vértice al cuerpo (m), hasta 20 cm: mediana, p05, p95 y el % de los vértices que quedó dentro. */
export function distanciaAlCuerpo(x: ArrayLike<number>, cuerpo: CuerpoRigido): { p05: number; p50: number; p95: number; dentro: number } {
  const d: number[] = [];
  for (let i = 0; i < x.length / 3; i++) {
    const c = cuerpo.cercano(x[3 * i], x[3 * i + 1], x[3 * i + 2], 0.2);
    if (c) d.push(c.d);
  }
  return { p05: percentil(d, 0.05), p50: percentil(d, 0.5), p95: percentil(d, 0.95), dentro: (100 * d.filter((q) => q < 0).length) / (x.length / 3) };
}

/** La distancia de cada vértice a otra superficie (m), hasta 20 cm: mediana, p90, p99 y máxima. */
export function distanciaASuperficie(x: ArrayLike<number>, superficie: CuerpoRigido): { p50: number; p90: number; p99: number; maxima: number } {
  const d: number[] = [];
  for (let i = 0; i < x.length / 3; i++) {
    const c = superficie.cercano(x[3 * i], x[3 * i + 1], x[3 * i + 2], 0.2);
    d.push(c ? Math.abs(c.d) : 0.2);
  }
  return { p50: percentil(d, 0.5), p90: percentil(d, 0.9), p99: percentil(d, 0.99), maxima: d.reduce((m, q) => Math.max(m, q), 0) };
}

/** Porcentaje de triángulos con menos de la mitad del área de su patrón, entre los `cuantos` que empiezan en `desde`. */
export function aplastados(x: ArrayLike<number>, malla: MallaDeTela, desde = 0, cuantos = malla.tris.length / 3 - desde): number {
  const { tris, patron } = malla;
  let bajo = 0;
  for (let t = desde; t < desde + cuantos; t++) {
    const a = tris[3 * t], b = tris[3 * t + 1], c = tris[3 * t + 2];
    const A0 = 0.5 * Math.abs(
      (patron[2 * b] - patron[2 * a]) * (patron[2 * c + 1] - patron[2 * a + 1]) -
        (patron[2 * c] - patron[2 * a]) * (patron[2 * b + 1] - patron[2 * a + 1]),
    );
    const ab = [0, 1, 2].map((d) => x[3 * b + d] - x[3 * a + d]);
    const ac = [0, 1, 2].map((d) => x[3 * c + d] - x[3 * a + d]);
    const A = 0.5 * Math.hypot(ab[1] * ac[2] - ab[2] * ac[1], ab[2] * ac[0] - ab[0] * ac[2], ab[0] * ac[1] - ab[1] * ac[0]);
    if (A < 0.5 * A0) bajo++;
  }
  return (100 * bajo) / cuantos;
}

/** Coeficiente de caída (ISO 9073-9, %) y ondas del disco Cusick. */
export function caidaCusick(x: ArrayLike<number>, malla: MallaDeTela): { coeficiente: number; ondas: number } {
  const p = Float32Array.from(x);
  const lazo = extractOrderedBoundaryLoop(malla.tris);
  return {
    coeficiente: computeDrapeCoefficient(p, lazo, { supportRadius: CUSICK.radioPedestal, specimenRadius: CUSICK.radioDisco }),
    ondas: countFolds(p, lazo),
  };
}

/** La punta de la tira: el promedio de los vértices de su borde libre (en el patrón, x = voladizo). */
export function puntaDelVoladizo(x: ArrayLike<number>, malla: MallaDeTela, voladoM: number): { x: number; y: number } {
  let sx = 0, sy = 0, k = 0;
  for (let i = 0; i < malla.patron.length / 2; i++) {
    if (malla.patron[2 * i] < voladoM - 1e-6) continue;
    sx += x[3 * i];
    sy += x[3 * i + 1];
    k++;
  }
  return { x: sx / k, y: sy / k };
}

/**
 * El voladizo apoyado (escenas.ts, escenaPeirceApoyada): el ángulo (grados) de la cuerda que va del borde de la mesa, a la
 * altura de la tira apoyada (el promedio de sus últimos 20 mm sobre la mesa), a la punta, como lo mide la referencia.
 */
export function peirceApoyado(x: ArrayLike<number>, malla: MallaDeTela, voladoM: number, apoyoM: number): { angulo: number; alturaApoyada: number } {
  const R = MESA_DE_PEIRCE.radio;
  let h = 0, nh = 0, px = 0, py = 0, np = 0;
  for (let i = 0; i < malla.patron.length / 2; i++) {
    const u = malla.patron[2 * i];
    if (u <= R - apoyoM + 0.02) {
      h += x[3 * i + 1];
      nh++;
    }
    if (u >= R + voladoM - 1e-5) {
      px += x[3 * i];
      py += x[3 * i + 1];
      np++;
    }
  }
  h /= nh;
  return { angulo: (Math.atan2(h - py / np, px / np - R) * 180) / Math.PI, alturaApoyada: h };
}

/**
 * Ensayo de Peirce: el ángulo (grados) de la cuerda que va del borde del empotramiento a la punta, y la
 * longitud de flexión c = L·(cos(θ/2) / (8·tan θ))^(1/3), en m.
 */
export function peirce(punta: { x: number; y: number }, voladoM: number, alturaDelBorde = 0): { angulo: number; longitudDeFlexion: number } {
  const th = Math.atan2(alturaDelBorde - punta.y, punta.x);
  return { angulo: (th * 180) / Math.PI, longitudDeFlexion: voladoM * Math.cbrt(Math.cos(th / 2) / (8 * Math.tan(th))) };
}
