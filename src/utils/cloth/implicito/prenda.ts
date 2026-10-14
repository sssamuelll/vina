/**
 * La prenda para el motor implícito (spec 2026-10-13 §4.1.2 y §4.5): todas las piezas en una sola malla, cada
 * una con su dibujo girado al marco de su propio hilo. Ningún triángulo cruza piezas, así que la membrana y la
 * placa ven cada pieza en su marco; las costuras (costuras.ts) las unen.
 */
import type { SeamPair } from '../seamPairs';
import { bisagrasDeCostura, puntosDeCostura, type BisagraDeCostura, type PuntoDeCostura } from './costuras';
import { aMarcoDelHilo, type MallaDeTela } from './malla';
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
}

export interface Prenda {
  /** la malla de la prenda, con el dibujo de cada pieza ya en el marco de su hilo */
  malla: MallaDeTela;
  piezas: RangoDePieza[];
}

export function armarPrenda(piezas: readonly PiezaDeTela[]): Prenda {
  let nv = 0, nt = 0;
  for (const p of piezas) {
    nv += p.x.length / 3;
    nt += p.tris.length / 3;
  }
  if (piezas.length > 0xffff) throw new Error('armarPrenda: más piezas de las que caben en un Uint16');
  const x = new Float64Array(3 * nv), patron = new Float64Array(2 * nv), tris = new Uint32Array(3 * nt);
  const piezaDeTri = new Uint16Array(nt), fijos = new Uint8Array(nv);
  let hayFijos = false, v0 = 0, t0 = 0;
  const rangos: RangoDePieza[] = [];
  piezas.forEach((p, k) => {
    const n = p.x.length / 3, m = p.tris.length / 3;
    x.set(p.x, 3 * v0);
    patron.set(aMarcoDelHilo(Float64Array.from(p.patron), p.hilo), 2 * v0);
    for (let q = 0; q < 3 * m; q++) tris[3 * t0 + q] = p.tris[q] + v0;
    piezaDeTri.fill(k, t0, t0 + m);
    if (p.fijos) {
      for (let i = 0; i < n; i++) {
        if (p.fijos[i]) {
          fijos[v0 + i] = 1;
          hayFijos = true;
        }
      }
    }
    rangos.push({ id: p.id, v0, nv: n, t0, nt: m, margenMm: p.margenMm });
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
 * lados desde `seamInitDataToPairs`.
 */
export function costurasDePrenda(prenda: Prenda, pares: readonly SeamPair[]): { puntos: PuntoDeCostura[]; lados: LadosDeCostura[] } {
  const v0 = new Map(prenda.piezas.map((p) => [p.id, p.v0]));
  const puntos: PuntoDeCostura[] = [], lados: LadosDeCostura[] = [];
  for (const par of pares) {
    const oa = v0.get(par.pieceAId), ob = v0.get(par.pieceBId);
    if (oa === undefined || ob === undefined) throw new Error(`costurasDePrenda: falta una pieza de la costura ${par.pieceAId}↔${par.pieceBId}`);
    if (!par.lados) throw new Error('costurasDePrenda: el par no trae sus lados (los arma seamInitDataToPairs)');
    const lado = { a: par.lados.a.map((v) => v + oa), b: par.lados.b.map((v) => v + ob) };
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
