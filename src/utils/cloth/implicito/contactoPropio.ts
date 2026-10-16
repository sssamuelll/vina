/**
 * La tela contra sí misma (spec 2026-10-13 §4.3.2, con las enmiendas E3 y E6 de la entrega 4): pares de un
 * vértice de tela y un triángulo de tela cuando el vértice cae sobre la cara del triángulo más cerca que la
 * separación entre capas, y pares de un vértice del cuerpo y un triángulo de tela, para las puntas del cuerpo que
 * la malla de la tela no ve. Los halla una rejilla de puntos que cada triángulo recorre en su caja. Cada par es un
 * plano fijado al empezar el paso, como el contacto con el cuerpo (contactos.ts): la misma energía en la solución y
 * en la búsqueda en línea, con fricción, y la misma anticipación sobre el plano fijo.
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
  /** rigidez normal (N/m): la del contacto propio entre capas de tela; la del cuerpo para una punta del cuerpo */
  k: number;
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

/**
 * El lado de la celda de la rejilla de puntos (m): con la mitad del alcance, la caja de un triángulo cabe en pocas
 * celdas aunque busque hasta el alcance, y la de uno quieto no recorre celdas de más.
 */
export function celdaDeLaRejilla(sep: number, aristaMedia: number): number {
  return Math.max(2 * sep, aristaMedia, 0.5 * (sep + ALCANCE_MAXIMO));
}

/**
 * El lado de las regiones de rapidez (m): las 27 alrededor del centro de un triángulo cubren todo lo que su caja puede
 * tocar, el radio más grande más dos aristas desde el centro.
 */
export function celdaDeRegion(sep: number, aristaMedia: number): number {
  return sep + ALCANCE_MAXIMO + 2 * aristaMedia;
}

/**
 * El radio de búsqueda de un triángulo (m): la separación más lo que él (`vTriangulo`, su vértice más rápido) y la tela
 * de su región (`vRegion`) pueden acercarse en dos cuadros, más lo que la gravedad mueve en uno, hasta el alcance. Un
 * vértice rápido en otra región no agranda la búsqueda de esta.
 */
export function radioDeBusqueda(sep: number, vTriangulo: number, vRegion: number, h: number, gravedad: number): number {
  return sep + Math.min(ALCANCE_MAXIMO, 2 * h * (vTriangulo + vRegion) + Math.abs(gravedad) * h * h);
}

/** La mayor rapidez de la tela por región: celdas de `lado` (m); `alrededor` mira la del punto y sus 26 vecinas. */
export class RegionesDeRapidez {
  private readonly celdas = new Map<number, number>();

  constructor(private readonly lado: number) {}

  private clave(ix: number, iy: number, iz: number): number {
    return ((ix + 4096) * 8192 + (iy + 4096)) * 8192 + (iz + 4096);
  }

  anotar(x: number, y: number, z: number, rapidez: number): void {
    const k = this.clave(Math.floor(x / this.lado), Math.floor(y / this.lado), Math.floor(z / this.lado));
    this.celdas.set(k, Math.max(this.celdas.get(k) ?? 0, rapidez));
  }

  alrededor(x: number, y: number, z: number): number {
    const ix = Math.floor(x / this.lado), iy = Math.floor(y / this.lado), iz = Math.floor(z / this.lado);
    let v = 0;
    for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) for (let c = -1; c <= 1; c++) v = Math.max(v, this.celdas.get(this.clave(ix + a, iy + b, iz + c)) ?? 0);
    return v;
  }
}

/** Una rejilla de puntos: cada punto en la celda que lo contiene. Quien busca pasa una caja y recibe los de sus celdas. */
export class RejillaDePuntos {
  private readonly celdas = new Map<number, number[]>();
  private c = 1;

  private clave(ix: number, iy: number, iz: number): number {
    return ((ix + 4096) * 8192 + (iy + 4096)) * 8192 + (iz + 4096);
  }

  /** `puntos`: [x0, y0, z0, x1, …] (m); `celda`: el lado de cada celda (m). */
  armar(puntos: ArrayLike<number>, celda: number): void {
    this.celdas.clear();
    this.c = celda;
    for (let p = 0; p < puntos.length / 3; p++) {
      const k = this.clave(Math.floor(puntos[3 * p] / celda), Math.floor(puntos[3 * p + 1] / celda), Math.floor(puntos[3 * p + 2] / celda));
      const lista = this.celdas.get(k);
      if (lista) lista.push(p);
      else this.celdas.set(k, [p]);
    }
  }

  /** Llama a `cada` con los puntos de las celdas que toca la caja: entre ellos están todos los de adentro. */
  enCaja(x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, cada: (p: number) => void): void {
    const c = this.c;
    for (let ix = Math.floor(x0 / c); ix <= Math.floor(x1 / c); ix++) {
      for (let iy = Math.floor(y0 / c); iy <= Math.floor(y1 / c); iy++) {
        for (let iz = Math.floor(z0 / c); iz <= Math.floor(z1 / c); iz++) {
          const lista = this.celdas.get(this.clave(ix, iy, iz));
          if (lista) for (const p of lista) cada(p);
        }
      }
    }
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
