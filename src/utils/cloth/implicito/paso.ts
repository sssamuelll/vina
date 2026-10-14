/**
 * Un cuadro del motor implícito (spec 2026-10-13 §4.2.1): Euler implícito resuelto con un paso de Newton
 * de Gauss-Newton desde el estado actual y gradiente conjugado precondicionado por bloques 3×3, con los planos
 * de contacto del cuadro (E4 del plan de la entrega 4), su anticipación (una ronda más) y búsqueda en línea
 * sobre G con la misma energía de contacto, de un solo lado. La GPU (gpu/wgsl.ts) hace el mismo cuadro.
 */
import type { SistemaTela } from './sistema';

export interface InfoPaso {
  /** iteraciones de gradiente conjugado de las dos rondas */
  cg: number;
  /** contactos agregados por anticipación; si hubo, se resolvió dos veces */
  anticipados: number;
  /** fracción del paso que aceptó la búsqueda en línea (0 = no se movió) */
  alfa: number;
  /** G al empezar y al terminar el cuadro */
  G0: number;
  G1: number;
}

export function pasoImplicito(s: SistemaTela): InfoPaso {
  const { n, aj } = s;
  const { h, aire, maxCG, tolCG } = aj;
  s.xt.set(s.x);
  s.linealizar();
  s.armarContactos();
  s.armarParesPropios();

  // bloques de la diagonal sin el contacto: elástica + (m/h² + aire·m/h)·I
  const base = new Float64Array(9 * n), diag = new Float64Array(n);
  s.bloquesDiagonales(base);
  for (let i = 0; i < n; i++) {
    diag[i] = s.masa[i] / (h * h) + (aire * s.masa[i]) / h;
    base[9 * i] += diag[i];
    base[9 * i + 4] += diag[i];
    base[9 * i + 8] += diag[i];
  }
  const A = (p: Float64Array, out: Float64Array) => {
    s.hessianaPor(p, out);
    for (let i = 0; i < n; i++) for (let d = 0; d < 3; d++) out[3 * i + d] += diag[i] * p[3 * i + d];
    s.sumarContactosPor(p, out);
    for (let i = 0; i < n; i++) if (s.fijo[i]) out[3 * i] = out[3 * i + 1] = out[3 * i + 2] = 0;
  };

  const r = new Float64Array(3 * n), dx = new Float64Array(3 * n), Pinv = new Float64Array(9 * n);
  const tmp = { z: new Float64Array(3 * n), p: new Float64Array(3 * n), Ap: new Float64Array(3 * n) };
  let cg = 0, anticipados = 0;
  for (let ronda = 0; ronda < 2; ronda++) {
    s.residuo(r);
    // el precondicionador: las inversas de los bloques de la diagonal, con los planos
    Pinv.set(base);
    s.sumarBloquesDeContacto(Pinv);
    for (let o = 0; o < Pinv.length; o += 9) invertir3(Pinv, o);
    cg += gradienteConjugado(A, r, Pinv, dx, maxCG, tolCG, tmp);
    if (ronda === 1 || !aj.anticipar) break;
    anticipados = s.anticiparContactos(dx);
    if (anticipados === 0) break;
  }

  // búsqueda en línea: el paso no puede subir G (§4.2.1, paso 5), con los mismos planos de un solo lado
  const G0 = s.energiaIncremental(s.xt);
  const prueba = new Float64Array(3 * n);
  let alfa = 1, G1 = G0;
  for (let intento = 0; intento < (aj.busqueda ? 8 : 1); intento++, alfa *= 0.5) {
    for (let q = 0; q < 3 * n; q++) prueba[q] = s.xt[q] + alfa * dx[q];
    G1 = s.energiaIncremental(prueba);
    if (!aj.busqueda || G1 <= G0) break;
  }
  if (aj.busqueda && !(G1 <= G0)) {
    alfa = 0;
    G1 = G0;
  }
  for (let q = 0; q < 3 * n; q++) {
    s.x[q] = s.xt[q] + alfa * dx[q];
    s.v[q] = (s.x[q] - s.xt[q]) / h;
    s.vPedida[q] = dx[q] / h;
  }
  s.alTerminarCuadro();
  return { cg, anticipados, alfa, G0, G1 };
}

/** Invierte en su lugar la matriz 3×3 (fila mayor) que empieza en o; deja ceros si es singular. */
function invertir3(M: Float64Array, o: number): void {
  const a = M[o], b = M[o + 1], c = M[o + 2], d = M[o + 3], e = M[o + 4], f = M[o + 5], g = M[o + 6], h = M[o + 7], k = M[o + 8];
  const A = e * k - f * h, B = -(d * k - f * g), C = d * h - e * g;
  const det = a * A + b * B + c * C;
  if (!(Math.abs(det) > 1e-300)) {
    M.fill(0, o, o + 9);
    return;
  }
  M[o] = A / det; M[o + 1] = -(b * k - c * h) / det; M[o + 2] = (b * f - c * e) / det;
  M[o + 3] = B / det; M[o + 4] = (a * k - c * g) / det; M[o + 5] = -(a * f - c * d) / det;
  M[o + 6] = C / det; M[o + 7] = -(a * h - b * g) / det; M[o + 8] = (a * e - b * d) / det;
}

/** Gradiente conjugado precondicionado desde dx = 0; para cuando rᵀz ≤ tol²·r0ᵀz0. Deja en r el residuo final. */
function gradienteConjugado(
  A: (p: Float64Array, out: Float64Array) => void,
  r: Float64Array,
  Pinv: Float64Array,
  dx: Float64Array,
  max: number,
  tol: number,
  { z, p, Ap }: { z: Float64Array; p: Float64Array; Ap: Float64Array },
): number {
  dx.fill(0);
  precondicionar(Pinv, r, z);
  p.set(z);
  let rz = punto(r, z);
  const rz0 = rz;
  let k = 0;
  while (k < max) {
    A(p, Ap);
    const pAp = punto(p, Ap);
    if (!(pAp > 0)) break;
    const alfa = rz / pAp;
    for (let q = 0; q < r.length; q++) {
      dx[q] += alfa * p[q];
      r[q] -= alfa * Ap[q];
    }
    k++;
    precondicionar(Pinv, r, z);
    const rzN = punto(r, z);
    if (rzN <= tol * tol * rz0) break;
    const beta = rzN / rz;
    rz = rzN;
    for (let q = 0; q < r.length; q++) p[q] = z[q] + beta * p[q];
  }
  return k;
}

function precondicionar(Pinv: Float64Array, r: Float64Array, z: Float64Array): void {
  for (let i = 0; i < r.length / 3; i++) {
    const o = 9 * i, x = r[3 * i], y = r[3 * i + 1], w = r[3 * i + 2];
    z[3 * i] = Pinv[o] * x + Pinv[o + 1] * y + Pinv[o + 2] * w;
    z[3 * i + 1] = Pinv[o + 3] * x + Pinv[o + 4] * y + Pinv[o + 5] * w;
    z[3 * i + 2] = Pinv[o + 6] * x + Pinv[o + 7] * y + Pinv[o + 8] * w;
  }
}

function punto(a: Float64Array, b: Float64Array): number {
  let s = 0;
  for (let q = 0; q < a.length; q++) s += a[q] * b[q];
  return s;
}
