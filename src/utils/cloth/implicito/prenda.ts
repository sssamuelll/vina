/**
 * La prenda para el motor implícito (spec 2026-10-13 §4.1.2 y §4.5): todas las piezas en una sola malla, cada
 * una con su dibujo girado al marco de su propio hilo. Ningún triángulo cruza piezas, así que la membrana y la
 * placa ven cada pieza en su marco; las costuras (costuras.ts) las unen.
 */
import type { SeamPair } from '../seamPairs';
import { TOLERANCIA_DE_DUPLICADOS } from '../../seam';
import { bisagrasDeCostura, puntosDeCostura, type BisagraDeCostura, type PuntoDeCostura } from './costuras';
import { aMarcoDelHilo, type MallaDeTela } from './malla';
import { franjaDelMargen, MARGEN_POR_DEFECTO_MM } from './margen';
import { telaSI, type TelaFisica } from './tela';

export interface PiezaDeTela {
  id: string;
  /** posiciones iniciales (m), [x0, y0, z0, x1, …] */
  x: ArrayLike<number>;
  /** el dibujo de la pieza (m), [px0, py0, …], en los ejes del dibujo */
  patron: ArrayLike<number>;
  tris: ArrayLike<number>;
  /** la urdimbre en los ejes del dibujo; sin línea de grano, vertical (§4.1.2) */
  hilo?: readonly [number, number];
  /** 1 = vértice empotrado */
  fijos?: ArrayLike<number>;
  /** ancho del margen de costura de la pieza (mm); sin él, el de margen.ts */
  margenMm?: number;
}

/** Dónde empieza cada pieza en los vértices y en los triángulos de la prenda. */
export interface RangoDePieza {
  id: string;
  v0: number;
  nv: number;
  t0: number;
  nt: number;
  margenMm?: number;
  /**
   * El índice en la pieza armada de cada vértice de la pieza tal como llegó; −1 si ningún triángulo lo usaba y se
   * quitó. El mallador deja así los puntos de una línea interna que sale del contorno (la línea de grano de la tira
   * de María); el reposo no admite vértices sin triángulo.
   */
  local: Int32Array;
}

export interface Prenda {
  /** la malla de la prenda, con el dibujo de cada pieza ya en el marco de su hilo */
  malla: MallaDeTela;
  piezas: RangoDePieza[];
}

/** A cuánto (m) dos vértices de una pieza son el mismo punto del patrón: la tolerancia de duplicados del mallador. */
const SOLDADURA = TOLERANCIA_DE_DUPLICADOS / 1000;
/** El área (m²) bajo la cual un triángulo del patrón no es tela: un µm², lejos de cualquier triángulo de malla. */
const SIN_AREA = 1e-12;

/**
 * La malla de una pieza lista para el reposo. El mallador deja copias de un mismo punto donde una línea interna toca el
 * contorno o cruza a otra (a micras una de otra), astillas sin área entre ellas y los puntos de una línea interna que
 * sale del contorno, sin triángulo. Aquí cada copia se suelda a la primera, las astillas se quitan y los vértices que
 * ningún triángulo usa quedan fuera: `local[i]` es el índice nuevo del vértice i, o −1.
 */
function limpiarPieza(p: PiezaDeTela): { local: Int32Array; nv: number; tris: number[] } {
  const n = p.x.length / 3, rep = new Int32Array(n), celdas = new Map<string, number[]>();
  for (let i = 0; i < n; i++) {
    const u = p.patron[2 * i], v = p.patron[2 * i + 1], cu = Math.floor(u / SOLDADURA), cv = Math.floor(v / SOLDADURA);
    rep[i] = i;
    buscar: for (let du = -1; du <= 1; du++) {
      for (let dv = -1; dv <= 1; dv++) {
        for (const j of celdas.get(`${cu + du},${cv + dv}`) ?? []) {
          if (Math.hypot(p.patron[2 * j] - u, p.patron[2 * j + 1] - v) < SOLDADURA) {
            rep[i] = j;
            break buscar;
          }
        }
      }
    }
    if (rep[i] === i) {
      const k = `${cu},${cv}`, lista = celdas.get(k);
      if (lista) lista.push(i);
      else celdas.set(k, [i]);
    }
  }
  const tris: number[] = [];
  for (let t = 0; t < p.tris.length / 3; t++) {
    const a = rep[p.tris[3 * t]], b = rep[p.tris[3 * t + 1]], c = rep[p.tris[3 * t + 2]];
    if (a === b || b === c || a === c) continue;
    const det = (p.patron[2 * b] - p.patron[2 * a]) * (p.patron[2 * c + 1] - p.patron[2 * a + 1]) - (p.patron[2 * c] - p.patron[2 * a]) * (p.patron[2 * b + 1] - p.patron[2 * a + 1]);
    if (Math.abs(det) < 2 * SIN_AREA) continue;
    tris.push(a, b, c);
  }
  const nuevo = new Int32Array(n).fill(-1);
  for (const v of tris) nuevo[v] = 0;
  let k = 0;
  for (let i = 0; i < n; i++) if (nuevo[i] === 0) nuevo[i] = k++;
  const local = Int32Array.from(rep, (r) => nuevo[r]);
  return { local, nv: k, tris };
}

export function armarPrenda(piezas: readonly PiezaDeTela[]): Prenda {
  if (piezas.length > 0xffff) throw new Error('armarPrenda: más piezas de las que caben en un Uint16');
  const limpias = piezas.map(limpiarPieza);
  let nv = 0, nt = 0;
  for (const l of limpias) {
    nv += l.nv;
    nt += l.tris.length / 3;
  }
  const x = new Float64Array(3 * nv), patron = new Float64Array(2 * nv), tris = new Uint32Array(3 * nt);
  const piezaDeTri = new Uint16Array(nt), fijos = new Uint8Array(nv);
  let hayFijos = false, v0 = 0, t0 = 0;
  const rangos: RangoDePieza[] = [];
  piezas.forEach((p, k) => {
    const { local, nv: n, tris: suyos } = limpias[k], m = suyos.length / 3;
    const uv = aMarcoDelHilo(Float64Array.from(p.patron), p.hilo);
    // cada vértice nuevo toma la posición de su primera copia; empotrado si lo está cualquiera de sus copias
    const puesto = new Uint8Array(n);
    for (let i = 0; i < local.length; i++) {
      const j = local[i];
      if (j < 0) continue;
      if (!puesto[j]) {
        puesto[j] = 1;
        for (let d = 0; d < 3; d++) x[3 * (v0 + j) + d] = p.x[3 * i + d];
        patron[2 * (v0 + j)] = uv[2 * i];
        patron[2 * (v0 + j) + 1] = uv[2 * i + 1];
      }
      if (p.fijos?.[i]) {
        fijos[v0 + j] = 1;
        hayFijos = true;
      }
    }
    for (let q = 0; q < 3 * m; q++) tris[3 * t0 + q] = local[suyos[q]] + v0;
    piezaDeTri.fill(k, t0, t0 + m);
    rangos.push({ id: p.id, v0, nv: n, t0, nt: m, margenMm: p.margenMm, local });
    v0 += n;
    t0 += m;
  });
  return { malla: { x, patron, tris, piezaDeTri, ...(hayFijos ? { fijos } : {}) }, piezas: rangos };
}

/** Los dos lados de una costura en la prenda, con índices GLOBALES y en orden de cosido. */
export interface LadosDeCostura {
  a: number[];
  b: number[];
}

/**
 * Los puntos de costura de la prenda y los lados de cada costura, con índices globales. Cada par trae sus
 * lados desde `seamInitDataToPairs`, con los índices de cada pieza tal como llegó.
 */
export function costurasDePrenda(prenda: Prenda, pares: readonly SeamPair[]): { puntos: PuntoDeCostura[]; lados: LadosDeCostura[] } {
  const rango = new Map(prenda.piezas.map((p) => [p.id, p]));
  // una copia soldada cuenta una sola vez; un vértice que armarPrenda quitó no es tela (los puntos de una línea interna
  // que sale de la pieza) y la costura sigue por los vértices de al lado
  const globales = (r: RangoDePieza, lado: readonly number[]) => {
    const g: number[] = [];
    for (const v of lado) {
      const j = r.local[v];
      if (j === undefined) throw new Error(`costurasDePrenda: la pieza ${r.id} no tiene el vértice ${v}`);
      if (j >= 0 && g[g.length - 1] !== r.v0 + j) g.push(r.v0 + j);
    }
    return g;
  };
  const puntos: PuntoDeCostura[] = [], lados: LadosDeCostura[] = [];
  for (const par of pares) {
    const ra = rango.get(par.pieceAId), rb = rango.get(par.pieceBId);
    if (!ra || !rb) throw new Error(`costurasDePrenda: falta una pieza de la costura ${par.pieceAId}↔${par.pieceBId}`);
    if (!par.lados) throw new Error('costurasDePrenda: el par no trae sus lados (los arma seamInitDataToPairs)');
    const lado = { a: globales(ra, par.lados.a), b: globales(rb, par.lados.b) };
    lados.push(lado);
    puntos.push(...puntosDeCostura(prenda.malla.patron, lado.a, lado.b));
  }
  return { puntos, lados };
}

/** Las bisagras que cruzan las costuras de la prenda (E2), sobre el dibujo de cada pieza en el marco de su hilo. */
export function bisagrasDePrenda(prenda: Prenda, lados: readonly LadosDeCostura[], tela: TelaFisica): BisagraDeCostura[] {
  const si = telaSI(tela);
  return lados.flatMap((l) => bisagrasDeCostura(prenda.malla.patron, prenda.malla.tris, l.a, l.b, si));
}

/**
 * La franja del margen de la prenda (margen.ts): los segmentos de cada lado cosido, con el margen de cada
 * pieza, o el de por defecto si la pieza no trae uno mayor que 0.
 */
export function franjaDePrenda(prenda: Prenda, lados: readonly LadosDeCostura[]): Uint8Array {
  const bordes: Array<[number, number]> = [];
  for (const l of lados) for (const lado of [l.a, l.b]) for (let k = 1; k < lado.length; k++) bordes.push([lado[k - 1], lado[k]]);
  const ancho = prenda.piezas.map((p) => (p.margenMm !== undefined && p.margenMm > 0 ? p.margenMm : MARGEN_POR_DEFECTO_MM) / 1000);
  const piezaDeTri = prenda.malla.piezaDeTri ?? new Uint16Array(prenda.malla.tris.length / 3);
  return franjaDelMargen(prenda.malla.patron, prenda.malla.tris, piezaDeTri, bordes, ancho);
}
