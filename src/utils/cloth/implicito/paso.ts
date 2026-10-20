/**
 * Un cuadro del motor implícito (spec 2026-10-13 §4.2.1): Euler implícito resuelto con un paso de Newton
 * de Gauss-Newton desde el estado actual y gradiente conjugado precondicionado por bloques 3×3, en una sola ronda. Los
 * vértices apoyados en el cuerpo no se mueven en su normal (E10: el gradiente conjugado filtra esa componente, como
 * Baraff y Witkin); el que el paso mete en el cuerpo se proyecta al terminar. Búsqueda en línea sobre G. Los vértices
 * cosidos (E8) no son incógnitas: el sistema es Pᵀ·A·P, con P = expandir y Pᵀ = restringir (costuras.ts). La GPU
 * (gpu/wgsl.ts) hace el mismo cuadro.
 */
import type { SistemaTela } from './sistema';

export interface InfoPaso {
  /** iteraciones de gradiente conjugado */
  cg: number;
  /** vértices que el paso metió en un obstáculo y se proyectaron a la separación (E10) */
  proyectados: number;
  /** fracción del paso que aceptó la búsqueda en línea (0 = no se movió) */
  alfa: number;
  /** G al empezar y al terminar el cuadro */
  G0: number;
  G1: number;
}

export function pasoImplicito(s: SistemaTela): InfoPaso {
  const { n, aj } = s;
  const { h, aire, maxCG, tolCG } = aj;
  // E8: cada puntada cierra un cuadro de su desfase y lleva a su vértice
  s.costuras.avanzarPuntadas(s.x);
  s.xt.set(s.x);
  s.linealizar();
  s.armarApoyos();
  s.armarParesPropios();

  // bloques de la diagonal: elástica + (m/h² + aire·m/h)·I + la fricción de los apoyos y los pares
  const Pinv = new Float64Array(9 * n), diag = new Float64Array(n);
  s.bloquesDiagonales(Pinv);
  for (let i = 0; i < n; i++) {
    diag[i] = s.masa[i] / (h * h) + (aire * s.masa[i]) / h;
    Pinv[9 * i] += diag[i];
    Pinv[9 * i + 4] += diag[i];
    Pinv[9 * i + 8] += diag[i];
  }
  s.sumarBloquesDeContacto(Pinv);
  s.costuras.restringirBloques(Pinv);
  for (let o = 0; o < Pinv.length; o += 9) invertir3(Pinv, o);
  const pe = new Float64Array(3 * n);
  const A = (p: Float64Array, out: Float64Array) => {
    pe.set(p);
    s.costuras.expandir(pe);
    s.hessianaPor(pe, out);
    for (let i = 0; i < n; i++) for (let d = 0; d < 3; d++) out[3 * i + d] += diag[i] * pe[3 * i + d];
    s.sumarContactosPor(pe, out);
    s.costuras.restringir(out);
    s.anularFijos(out);
  };

  const r = new Float64Array(3 * n), dx = new Float64Array(3 * n);
  const tmp = { z: new Float64Array(3 * n), p: new Float64Array(3 * n), Ap: new Float64Array(3 * n) };
  s.residuo(r);
  s.costuras.restringir(r);
  s.anularFijos(r);
  // E10: la normal del residuo de cada apoyo sigue sin filtrar, para su fuerza al terminar
  const rn = new Float64Array(s.apoyos.length), apn = new Float64Array(s.apoyos.length);
  s.normalesDeApoyo(r, rn);
  s.filtrar(r);
  const cg = gradienteConjugado(A, r, Pinv, dx, maxCG, tolCG, tmp, (v) => s.filtrar(v), (Ap, alfa) => {
    s.normalesDeApoyo(Ap, apn);
    for (let k = 0; k < rn.length; k++) rn[k] -= alfa * apn[k];
  });
  s.costuras.expandir(dx);
  s.guardarFuerzasDeApoyo(rn);

  // búsqueda en línea: el paso no puede subir G (§4.2.1, paso 5)
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
  const proyectados = s.proyectar();
  s.alTerminarCuadro();
  return { cg, proyectados, alfa, G0, G1 };
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

/**
 * Gradiente conjugado precondicionado desde dx = 0, con el filtro de Baraff y Witkin (*Large Steps*, §5.3): r llega
 * filtrado, y z y A·p se filtran, así que dx no se mueve en lo que el filtro quita (E10). `alAvanzar` recibe A·p sin
 * filtrar y el paso de cada iteración. Para cuando rᵀz ≤ tol²·r0ᵀz0. Deja en r el residuo final, filtrado.
 */
function gradienteConjugado(
  A: (p: Float64Array, out: Float64Array) => void,
  r: Float64Array,
  Pinv: Float64Array,
  dx: Float64Array,
  max: number,
  tol: number,
  { z, p, Ap }: { z: Float64Array; p: Float64Array; Ap: Float64Array },
  filtrar: (v: Float64Array) => void,
  alAvanzar: (Ap: Float64Array, alfa: number) => void,
): number {
  dx.fill(0);
  precondicionar(Pinv, r, z);
  filtrar(z);
  p.set(z);
  let rz = punto(r, z);
  const rz0 = rz;
  let k = 0;
  while (k < max) {
    A(p, Ap);
    // p ya está filtrado: p·A·p no cambia al filtrar A·p
    const pAp = punto(p, Ap);
    if (!(pAp > 0)) break;
    const alfa = rz / pAp;
    alAvanzar(Ap, alfa);
    filtrar(Ap);
    for (let q = 0; q < r.length; q++) {
      dx[q] += alfa * p[q];
      r[q] -= alfa * Ap[q];
    }
    k++;
    precondicionar(Pinv, r, z);
    filtrar(z);
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
