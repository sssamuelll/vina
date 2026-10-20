/**
 * Instrumentos de la camiseta: miden, no cambian la física. Qué pares de tela quedaron del otro lado de su cara y
 * cuánto abre cada clase de punto de costura (reunión del 2026-10-18: primero medir, después elegir el arreglo).
 */
import { ALCANCE_MAXIMO } from '../contactoPropio';
import type { Costuras } from '../costuras';
import { percentil } from './medidas';

/**
 * De qué lado de la cara (a, b, c) está el vértice v: +1 del de su normal (b − a) × (c − a), −1 del otro, 0 si no se
 * puede juzgar: cae fuera de la cara, está más lejos que `alcance` o sobre su plano (a menos de 1 µm).
 */
export function ladoDeCara(x: ArrayLike<number>, v: number, a: number, b: number, c: number, alcance = ALCANCE_MAXIMO): -1 | 0 | 1 {
  return Math.sign(separacionDeCara(x, v, a, b, c, alcance)) as -1 | 0 | 1;
}

/** La distancia con signo de v al plano de la cara (m), con los mismos casos sin juzgar que `ladoDeCara` en 0. */
function separacionDeCara(x: ArrayLike<number>, v: number, a: number, b: number, c: number, alcance = ALCANCE_MAXIMO): number {
  const ux = x[3 * b] - x[3 * a], uy = x[3 * b + 1] - x[3 * a + 1], uz = x[3 * b + 2] - x[3 * a + 2];
  const wx = x[3 * c] - x[3 * a], wy = x[3 * c + 1] - x[3 * a + 1], wz = x[3 * c + 2] - x[3 * a + 2];
  const px = x[3 * v] - x[3 * a], py = x[3 * v + 1] - x[3 * a + 1], pz = x[3 * v + 2] - x[3 * a + 2];
  const nx = uy * wz - uz * wy, ny = uz * wx - ux * wz, nz = ux * wy - uy * wx, ln = Math.hypot(nx, ny, nz);
  if (ln === 0) return 0;
  const s = (px * nx + py * ny + pz * nz) / ln;
  if (Math.abs(s) < 1e-6 || Math.abs(s) > alcance) return 0;
  // las baricéntricas de su proyección: las componentes en el plano no ven la normal
  const d00 = ux * ux + uy * uy + uz * uz, d01 = ux * wx + uy * wy + uz * wz, d11 = wx * wx + wy * wy + wz * wz;
  const d20 = px * ux + py * uy + pz * uz, d21 = px * wx + py * wy + pz * wz, det = d00 * d11 - d01 * d01;
  const lb = (d11 * d20 - d01 * d21) / det, lc = (d00 * d21 - d01 * d20) / det;
  if (lb < 0 || lc < 0 || lb + lc > 1) return 0;
  return s;
}

/**
 * El lado de cada par vértice-cara del contacto propio, anotado la primera vez que el par llega a la lista y se puede
 * juzgar; después se revisan todos los anotados, estén o no en la lista del cuadro. No ve el cruce de un par que entra
 * por primera vez ya cruzado.
 */
export class LadosDeLosPares {
  private readonly lado = new Map<string, { v: number; a: number; b: number; c: number; lado: number }>();

  get anotados(): number {
    return this.lado.size;
  }

  /** `pares`: la lista de la GPU, 14 números por par ([i, ia, ib, ic, …], ic = −1 en una punta del cuerpo); `x`, las posiciones con que se armó. */
  anotar(pares: ArrayLike<number>, cuantos: number, x: ArrayLike<number>): void {
    for (let k = 0; k < cuantos; k++) {
      const o = 14 * k, c = pares[o + 3];
      if (c < 0) continue;
      const v = pares[o], a = pares[o + 1], b = pares[o + 2], clave = `${v},${a},${b},${c}`;
      if (this.lado.has(clave)) continue;
      const lado = ladoDeCara(x, v, a, b, c);
      if (lado !== 0) this.lado.set(clave, { v, a, b, c, lado });
    }
  }

  /** Los pares anotados que hoy están del otro lado de su cara, y sus vértices distintos. */
  revisar(x: ArrayLike<number>): { pares: number; vertices: number } {
    let pares = 0;
    const vertices = new Set<number>();
    for (const p of this.lado.values()) {
      const l = ladoDeCara(x, p.v, p.a, p.b, p.c);
      if (l !== 0 && l !== p.lado) {
        pares++;
        vertices.add(p.v);
      }
    }
    return { pares, vertices: vertices.size };
  }

  /**
   * Los cruces de hoy: sus vértices, los que tocan una costura (el vértice o uno de su cara en `costura`) y los de
   * lejos; y sus pares por hondura: bajo 0,01 mm, bajo 0,1, bajo 1 y de 1 mm o más. Separa el cruce de verdad del
   * redondeo junto a una costura.
   */
  cruces(x: ArrayLike<number>, costura: ReadonlySet<number>): { enCostura: number; lejos: number; porHondura: number[] } {
    const toca = new Set<number>(), todos = new Set<number>(), porHondura = [0, 0, 0, 0];
    for (const p of this.lado.values()) {
      const s = separacionDeCara(x, p.v, p.a, p.b, p.c);
      if (s === 0 || Math.sign(s) === p.lado) continue;
      todos.add(p.v);
      if ([p.v, p.a, p.b, p.c].some((i) => costura.has(i))) toca.add(p.v);
      porHondura[[1e-5, 1e-4, 1e-3].filter((q) => Math.abs(s) >= q).length]++;
    }
    return { enCostura: toca.size, lejos: todos.size - toca.size, porHondura };
  }
}

type Clase = 'cuerpo' | 'esquina' | 'cosido' | 'resorte';

/**
 * La separación de cada punto de costura (m) por clase: el cuerpo entre sus lados (`cruza`, con d = x_a − el punto del
 * otro lado), su vértice en dos o más puntos (una esquina), cosido (E8) o todavía en resorte; en ese orden de prioridad.
 */
export function costurasPorClase(
  x: ArrayLike<number>,
  c: Pick<Costuras, 'n' | 'a' | 'b0' | 'b1' | 's'>,
  cosidos: ArrayLike<number>,
  cruza: (e: number, d: number[]) => boolean,
): Record<Clase, { puntos: number; mediana: number; maxima: number }> {
  const veces = new Map<number, number>();
  for (let e = 0; e < c.n; e++) veces.set(c.a[e], (veces.get(c.a[e]) ?? 0) + 1);
  const sep: Record<Clase, number[]> = { cuerpo: [], esquina: [], cosido: [], resorte: [] };
  for (let e = 0; e < c.n; e++) {
    const d = [0, 1, 2].map((k) => x[3 * c.a[e] + k] - (1 - c.s[e]) * x[3 * c.b0[e] + k] - c.s[e] * x[3 * c.b1[e] + k]);
    const clase: Clase = cruza(e, d) ? 'cuerpo' : (veces.get(c.a[e]) ?? 0) >= 2 ? 'esquina' : cosidos[e] > 0.5 ? 'cosido' : 'resorte';
    sep[clase].push(Math.hypot(d[0], d[1], d[2]));
  }
  const resumen = (v: number[]) => ({ puntos: v.length, mediana: percentil(v, 0.5), maxima: v.reduce((m, q) => Math.max(m, q), 0) });
  return { cuerpo: resumen(sep.cuerpo), esquina: resumen(sep.esquina), cosido: resumen(sep.cosido), resorte: resumen(sep.resorte) };
}
