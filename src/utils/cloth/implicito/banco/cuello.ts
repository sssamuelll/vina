/**
 * La tira del cuello, colocada en anillo alrededor del cuello (E11 del spec 2026-10-13): la colocación de la referencia
 * la deja plana detrás de la cabeza, y sus costuras la jalan en línea recta a través del cuello hasta el escote del
 * delantero. En anillo, cada costura jala desde el cuello hacia afuera y no hay cuerpo entre los dos bordes.
 *
 * El anillo es un círculo horizontal alrededor del cuello, a la altura del punto más alto del escote (donde el escote
 * llega al hombro, en la base del cuello), con el largo de reposo del borde cosido de la tira; si el cuello es más ancho,
 * lo rodea a la separación y la tira arranca estirada. El borde libre sube lo que mide la tira de ancho. Cada vértice va
 * al ángulo que le toca por su largo de arco, girado para quedar lo más cerca posible del ángulo de su punto del escote.
 * El vértice que aun así cae dentro del cuerpo sale por la normal hasta la separación.
 */
import type { PuntoDeCostura } from '../costuras';
import type { CuerpoRigido } from '../cuerpo';

export interface TiraEnAnillo {
  /** el radio del anillo (m) */
  radio: number;
  /** el estiramiento con que arranca el borde cosido (0 = a su largo de reposo) */
  estiramiento: number;
  /** los vértices del borde cosido que tenían punto en el escote */
  cosidos: number;
  /** los vértices que salieron del cuerpo por la normal */
  proyectados: number;
}

/** Cuánto más que la separación queda el anillo del cuello más ancho (m). */
const HOLGURA = 0.002;

/**
 * Coloca en `x` (3 por vértice, m) los vértices [v0, v0 + nv) de la tira, con su dibujo en `patron` (2 por vértice, m).
 * `puntos` son los de la prenda: los de un vértice de la tira cosido a otra pieza dan el escote. `sep` es lo que la tela
 * guarda del cuerpo. Sin escote (menos de tres puntos) no toca nada y devuelve null.
 */
export function anillarTira(
  x: Float64Array,
  patron: Float64Array,
  tira: { v0: number; nv: number },
  puntos: readonly PuntoDeCostura[],
  cuerpo: CuerpoRigido,
  sep: number,
): TiraEnAnillo | null {
  const enTira = (v: number) => v >= tira.v0 && v < tira.v0 + tira.nv;
  // el punto del escote de cada vértice cosido de la tira (el promedio, si tiene más de uno); soldada (E17), la tira
  // puede ser el lado B: su vértice es b0 = b1 y el escote, a
  const suma = new Map<number, number[]>();
  const sumar = (v: number, q: (d: number) => number) => {
    const t = suma.get(v) ?? [0, 0, 0, 0];
    for (let d = 0; d < 3; d++) t[d] += q(d);
    t[3]++;
    suma.set(v, t);
  };
  for (const p of puntos) {
    if (enTira(p.a) && !enTira(p.b0) && !enTira(p.b1)) sumar(p.a, (d) => (1 - p.s) * x[3 * p.b0 + d] + p.s * x[3 * p.b1 + d]);
    else if (!enTira(p.a) && p.b0 === p.b1 && enTira(p.b0)) sumar(p.b0, (d) => x[3 * p.a + d]);
  }
  if (suma.size < 3) return null;
  const objetivo = new Map([...suma].map(([v, t]) => [v, [t[0] / t[3], t[1] / t[3], t[2] / t[3]]]));

  // los ejes del dibujo de la tira: u a lo largo (el eje principal), w a lo ancho desde el borde cosido
  let mx = 0, my = 0;
  for (let v = tira.v0; v < tira.v0 + tira.nv; v++) {
    mx += patron[2 * v] / tira.nv;
    my += patron[2 * v + 1] / tira.nv;
  }
  let sxx = 0, sxy = 0, syy = 0;
  for (let v = tira.v0; v < tira.v0 + tira.nv; v++) {
    const dx = patron[2 * v] - mx, dy = patron[2 * v + 1] - my;
    sxx += dx * dx;
    sxy += dx * dy;
    syy += dy * dy;
  }
  const eje = 0.5 * Math.atan2(2 * sxy, sxx - syy), ux = Math.cos(eje), uy = Math.sin(eje);
  const u = (v: number) => (patron[2 * v] - mx) * ux + (patron[2 * v + 1] - my) * uy;
  const ancho = (v: number) => -(patron[2 * v] - mx) * uy + (patron[2 * v + 1] - my) * ux;
  let wCosido = 0;
  for (const v of objetivo.keys()) wCosido += ancho(v) / objetivo.size;
  // la tira queda del lado contrario al borde cosido
  const haciaLaTira = wCosido < 0 ? 1 : -1;
  const w = (v: number) => Math.max(0, haciaLaTira * (ancho(v) - wCosido));

  let u0 = Infinity, u1 = -Infinity, alto = -Infinity, cx = 0, cz = 0;
  for (const [v, t] of objetivo) {
    u0 = Math.min(u0, u(v));
    u1 = Math.max(u1, u(v));
    alto = Math.max(alto, t[1]);
    cx += t[0] / objetivo.size;
    cz += t[2] / objetivo.size;
  }
  const L = u1 - u0;

  // el cuello a esa altura: los vértices del cuerpo a menos de 15 mm de ella y a menos de 15 cm del centro del escote
  let nx = 0, nz = 0, cuantos = 0;
  const cerca = (k: number) => Math.abs(cuerpo.vertices[3 * k + 1] - alto) < 0.015 && Math.hypot(cuerpo.vertices[3 * k] - cx, cuerpo.vertices[3 * k + 2] - cz) < 0.15;
  for (let k = 0; k < cuerpo.vertices.length / 3; k++) {
    if (!cerca(k)) continue;
    nx += cuerpo.vertices[3 * k];
    nz += cuerpo.vertices[3 * k + 2];
    cuantos++;
  }
  if (cuantos > 0) {
    cx = nx / cuantos;
    cz = nz / cuantos;
  }
  let rCuello = 0;
  for (let k = 0; k < cuerpo.vertices.length / 3; k++) {
    if (cerca(k)) rCuello = Math.max(rCuello, Math.hypot(cuerpo.vertices[3 * k] - cx, cuerpo.vertices[3 * k + 2] - cz));
  }
  const radio = Math.max(L / (2 * Math.PI), rCuello + sep + HOLGURA);

  // el giro y el sentido: los que dejan cada cosido más cerca del ángulo de su punto del escote
  const angulo = (t: readonly number[]) => Math.atan2(t[2] - cz, t[0] - cx);
  const theta = (v: number, giro: number, sentido: number) => giro + (sentido * 2 * Math.PI * (u(v) - u0)) / L;
  let giro = 0, sentido = 1, menor = Infinity;
  for (const s of [1, -1]) {
    let sx = 0, sy = 0;
    for (const [v, t] of objetivo) {
      sx += Math.cos(angulo(t) - theta(v, 0, s));
      sy += Math.sin(angulo(t) - theta(v, 0, s));
    }
    const g = Math.atan2(sy, sx);
    let error = 0;
    for (const [v, t] of objetivo) error += 1 - Math.cos(angulo(t) - theta(v, g, s));
    if (error < menor) {
      menor = error;
      giro = g;
      sentido = s;
    }
  }

  let proyectados = 0;
  for (let v = tira.v0; v < tira.v0 + tira.nv; v++) {
    const th = theta(v, giro, sentido);
    x[3 * v] = cx + radio * Math.cos(th);
    x[3 * v + 1] = alto + w(v);
    x[3 * v + 2] = cz + radio * Math.sin(th);
    const c = cuerpo.cercano(x[3 * v], x[3 * v + 1], x[3 * v + 2], 0.05);
    if (c && c.d < sep) {
      const p = sep + HOLGURA - c.d;
      x[3 * v] += p * c.nx;
      x[3 * v + 1] += p * c.ny;
      x[3 * v + 2] += p * c.nz;
      proyectados++;
    }
  }
  return { radio, estiramiento: (2 * Math.PI * radio) / L - 1, cosidos: objetivo.size, proyectados };
}
