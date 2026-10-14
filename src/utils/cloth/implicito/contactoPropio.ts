/**
 * La tela contra sí misma (spec 2026-10-13 §4.3.2, con la enmienda E3 del plan de la entrega 4): pares de un
 * vértice de tela y un triángulo de tela más cerca que la separación entre capas, hallados con una rejilla, y
 * pares de un vértice del cuerpo y un triángulo de tela, para las puntas del cuerpo que la malla de la tela no
 * ve. Cada par es un plano fijado al empezar el paso, como el contacto con el cuerpo (contactos.ts): la misma
 * energía en la solución y en la búsqueda en línea, con fricción, y la misma anticipación sobre el plano fijo.
 */

/**
 * Un par: la separación s = n·Σ w·x entre sus vértices de tela (vértice − triángulo; o triángulo − vértice del
 * cuerpo, con n la normal del cuerpo en su vértice) no baja de la separación entre capas.
 */
export interface ParPropio {
  /** los vértices de tela del par */
  v: number[];
  /** el peso de cada uno en la separación */
  w: number[];
  nx: number;
  ny: number;
  nz: number;
  /** separación entre capas − s(x_t): mayor que 0 dentro */
  p0: number;
  /** rigidez tangencial de la fricción (N/m); 0 si el par no estaba dentro al empezar */
  kt: number;
  /** entra al cuadro: estaba dentro al empezar, o el primer paso lo iba a cruzar */
  activo: boolean;
}

/** La separación entre dos capas de tela (§4.3.2): dos medios grosores más 1 mm. */
export function separacionPropia(grosor: number): number {
  return grosor + 0.001;
}

/** Hasta dónde (m) se buscan candidatos más allá de la separación: lo que un cuadro de 2 m/s alcanza a mover. */
export const ALCANCE_MAXIMO = 0.02;

/** Una rejilla de triángulos: cada uno en todas las celdas que toca su caja agrandada por la holgura. */
export class RejillaDeTriangulos {
  private readonly celdas = new Map<number, number[]>();

  constructor(readonly celda: number) {}

  private clave(ix: number, iy: number, iz: number): number {
    return ((ix + 4096) * 8192 + (iy + 4096)) * 8192 + (iz + 4096);
  }

  armar(x: ArrayLike<number>, tris: ArrayLike<number>, holgura: number): void {
    this.celdas.clear();
    const c = this.celda;
    for (let t = 0; t < tris.length / 3; t++) {
      let x0 = Infinity, y0 = Infinity, z0 = Infinity, x1 = -Infinity, y1 = -Infinity, z1 = -Infinity;
      for (let k = 0; k < 3; k++) {
        const q = 3 * tris[3 * t + k];
        x0 = Math.min(x0, x[q]);
        x1 = Math.max(x1, x[q]);
        y0 = Math.min(y0, x[q + 1]);
        y1 = Math.max(y1, x[q + 1]);
        z0 = Math.min(z0, x[q + 2]);
        z1 = Math.max(z1, x[q + 2]);
      }
      for (let ix = Math.floor((x0 - holgura) / c); ix <= Math.floor((x1 + holgura) / c); ix++) {
        for (let iy = Math.floor((y0 - holgura) / c); iy <= Math.floor((y1 + holgura) / c); iy++) {
          for (let iz = Math.floor((z0 - holgura) / c); iz <= Math.floor((z1 + holgura) / c); iz++) {
            const k = this.clave(ix, iy, iz), lista = this.celdas.get(k);
            if (lista) lista.push(t);
            else this.celdas.set(k, [t]);
          }
        }
      }
    }
  }

  /** Los triángulos de la celda del punto: están todos los que quedan a menos de la holgura. */
  cercanos(px: number, py: number, pz: number): readonly number[] {
    const c = this.celda;
    return this.celdas.get(this.clave(Math.floor(px / c), Math.floor(py / c), Math.floor(pz / c))) ?? [];
  }
}

/** ½·kc·max(p0 − n·U, 0)² + ½·kt·|U − (n·U)·n|², con U = Σ w·(x − x_t): el par en la búsqueda en línea. */
export function energiaDelPar(par: ParPropio, kc: number, x: ArrayLike<number>, xt: ArrayLike<number>): number {
  let ux = 0, uy = 0, uz = 0;
  for (let k = 0; k < par.v.length; k++) {
    const q = 3 * par.v[k];
    ux += par.w[k] * (x[q] - xt[q]);
    uy += par.w[k] * (x[q + 1] - xt[q + 1]);
    uz += par.w[k] * (x[q + 2] - xt[q + 2]);
  }
  const un = par.nx * ux + par.ny * uy + par.nz * uz, p = par.p0 - un;
  const tx = ux - un * par.nx, ty = uy - un * par.ny, tz = uz - un * par.nz;
  return (p > 0 ? 0.5 * kc * p * p : 0) + 0.5 * par.kt * (tx * tx + ty * ty + tz * tz);
}
