/**
 * El paquete de la tela para la GPU (spec 2026-10-13 §4.2.2): todo lo que lee el WGSL, en arreglos planos.
 * La matriz se arma por bloques 3×3 «por recolección»: cada bloque sabe de qué elementos se suma, así que
 * la GPU no necesita atómicas. Los bloques van en franjas de 32 filas, para que hilos vecinos lean memoria
 * vecina.
 */
import type { SistemaTela } from '../sistema';

/** Índice que no apunta a nada: borde libre o relleno de una franja. */
export const NINGUNA = 0xffffffff;

export interface PaqueteGpu {
  n: number;
  nt: number;
  nh: number;
  /** bloques de la matriz */
  nb: number;
  /** posiciones de las franjas, con relleno */
  nq: number;
  /** Σ m·|g| de los vértices libres (N), para la quietud */
  pesoTotal: number;
  /** puntos de costura */
  nc: number;
  /** bisagras de costura que se encienden al cerrar */
  nch: number;
  f32: {
    x: Float32Array;
    masa: Float32Array;
    /** 7 por triángulo, como `SistemaTela.coef` */
    coef: Float32Array;
    /** 9 por triángulo, como `Placa.K` */
    K: Float32Array;
    /** pcrU y pcrV por triángulo, finitos */
    pcr: Float32Array;
    /** s de cada punto de costura */
    cs: Float32Array;
    /** el largo de reposo de cada punto de costura, ahora */
    cl: Float32Array;
    /** la rigidez de cada bisagra de costura al encenderse */
    ckh: Float32Array;
  };
  u32: {
    tris: Uint32Array;
    bisagras: Uint32Array;
    /** 3 por triángulo; NINGUNA = borde libre */
    bisDeTri: Uint32Array;
    fijo: Uint32Array;
    /** CSR de las ranuras que suma cada vértice: membrana 3t + j, placa 3nt + 12t + 4k + r, costura 15nt + 3e + m */
    aporOff: Uint32Array;
    aporIdx: Uint32Array;
    /**
     * de qué elementos se arma cada bloque: membrana (t << 4 | li << 2 | lj), costura (0x40000000 | e << 4 | li << 2 | lj)
     * o placa (0x80000000 | t)
     */
    blqOff: Uint32Array;
    blqCod: Uint32Array;
    blqFila: Uint32Array;
    blqCol: Uint32Array;
    /** franjas de 32 filas: el bloque k de la fila 32·f + c va en franjaBase[f] + 32·k + c */
    franjaBase: Uint32Array;
    franjaAncho: Uint32Array;
    /** la columna del bloque en cada posición; NINGUNA = relleno */
    colSell: Uint32Array;
    /** la posición de cada bloque */
    posDe: Uint32Array;
    /** la posición del bloque diagonal de cada fila */
    diag: Uint32Array;
    /** a, b0 y b1 de cada punto de costura */
    costura: Uint32Array;
    /** dónde va en K (9 por triángulo) la rigidez de cada bisagra de costura */
    costuraK: Uint32Array;
  };
}

export function empaquetar(s: SistemaTela): PaqueteGpu {
  const n = s.n, nt = s.tris.length / 3, { bisagras, bisDeTri, K, nh } = s.placa, c = s.costuras, nc = c.n;
  if (nt >= 1 << 26 || nc >= 1 << 26) throw new Error('empaquetar: más triángulos o puntos de costura de los que caben en un código de bloque');

  // las ranuras de aporte al gradiente que suma cada vértice
  const aportes: number[][] = Array.from({ length: n }, () => []);
  for (let t = 0; t < nt; t++) for (let j = 0; j < 3; j++) aportes[s.tris[3 * t + j]].push(3 * t + j);
  for (let t = 0; t < nt; t++) {
    for (let k = 0; k < 3; k++) {
      const h = bisDeTri[3 * t + k];
      if (h < 0) continue;
      for (let r = 0; r < 4; r++) aportes[bisagras[4 * h + r]].push(3 * nt + 12 * t + 4 * k + r);
    }
  }
  // después de las ranuras de la placa: 3 por punto de costura (a, b0, b1)
  for (let e = 0; e < nc; e++) {
    const v = c.vertices(e);
    for (let m = 0; m < 3; m++) aportes[v[m]].push(15 * nt + 3 * e + m);
  }
  const aporOff = new Uint32Array(n + 1);
  for (let i = 0; i < n; i++) aporOff[i + 1] = aporOff[i] + aportes[i].length;
  const aporIdx = Uint32Array.from(aportes.flat());

  // los bloques (i, j) y de qué elementos se arma cada uno
  const filas: Array<Map<number, number[]>> = Array.from({ length: n }, () => new Map());
  const aporte = (i: number, j: number, cod: number) => {
    const lista = filas[i].get(j);
    if (lista) lista.push(cod);
    else filas[i].set(j, [cod]);
  };
  for (let t = 0; t < nt; t++) {
    for (let li = 0; li < 3; li++) for (let lj = 0; lj < 3; lj++) aporte(s.tris[3 * t + li], s.tris[3 * t + lj], (t << 4) | (li << 2) | lj);
    const plantilla = s.placa.plantilla(t);
    for (const i of plantilla) for (const j of plantilla) aporte(i, j, (0x80000000 | t) >>> 0);
  }
  for (let e = 0; e < nc; e++) {
    const v = c.vertices(e);
    for (let li = 0; li < 3; li++) for (let lj = 0; lj < 3; lj++) aporte(v[li], v[lj], (0x40000000 | (e << 4) | (li << 2) | lj) >>> 0);
  }
  const filaOff = new Uint32Array(n + 1);
  const blqFila: number[] = [], blqCol: number[] = [], blqOff: number[] = [0], blqCod: number[] = [];
  for (let i = 0; i < n; i++) {
    for (const j of [...filas[i].keys()].sort((a, b) => a - b)) {
      blqFila.push(i);
      blqCol.push(j);
      for (const cod of filas[i].get(j) ?? []) blqCod.push(cod);
      blqOff.push(blqCod.length);
    }
    filaOff[i + 1] = blqCol.length;
  }

  // franjas de 32 filas
  const nFr = Math.ceil(n / 32), franjaBase = new Uint32Array(nFr + 1), franjaAncho = new Uint32Array(nFr);
  for (let f = 0; f < nFr; f++) {
    let ancho = 0;
    for (let c = 0; c < 32; c++) {
      const i = 32 * f + c;
      if (i < n) ancho = Math.max(ancho, filaOff[i + 1] - filaOff[i]);
    }
    franjaAncho[f] = ancho;
    franjaBase[f + 1] = franjaBase[f] + 32 * ancho;
  }
  const nq = franjaBase[nFr];
  const colSell = new Uint32Array(nq).fill(NINGUNA), posDe = new Uint32Array(blqCol.length), diag = new Uint32Array(n);
  for (let i = 0; i < n; i++) {
    const f = i >> 5, c = i & 31;
    for (let k = 0; k < filaOff[i + 1] - filaOff[i]; k++) {
      const b = filaOff[i] + k, q = franjaBase[f] + 32 * k + c;
      colSell[q] = blqCol[b];
      posDe[b] = q;
      if (blqCol[b] === i) diag[i] = q;
    }
  }

  const pcr = new Float32Array(2 * nt);
  for (let t = 0; t < nt; t++) {
    // sin pandeo la carga es infinita; en precisión simple alcanza con una que nunca se llega a tocar
    pcr[2 * t] = Math.min(s.membrana.pcrU[t], 3e38);
    pcr[2 * t + 1] = Math.min(s.membrana.pcrV[t], 3e38);
  }
  let pesoTotal = 0;
  for (let i = 0; i < n; i++) if (!s.fijo[i]) pesoTotal += s.masa[i] * Math.abs(s.aj.gravedad);

  return {
    n,
    nt,
    nh,
    nb: blqCol.length,
    nq,
    pesoTotal,
    nc,
    nch: s.placa.costura.length,
    f32: {
      x: Float32Array.from(s.x),
      masa: Float32Array.from(s.masa),
      coef: Float32Array.from(s.coef),
      K: Float32Array.from(K),
      pcr,
      cs: Float32Array.from(c.s),
      cl: Float32Array.from(c.L),
      ckh: Float32Array.from(s.placa.costura, (k) => k.kh),
    },
    u32: {
      tris: Uint32Array.from(s.tris),
      bisagras: Uint32Array.from(bisagras),
      bisDeTri: Uint32Array.from(bisDeTri, (h) => (h < 0 ? NINGUNA : h)),
      fijo: Uint32Array.from(s.fijo),
      aporOff,
      aporIdx,
      blqOff: Uint32Array.from(blqOff),
      blqCod: Uint32Array.from(blqCod),
      blqFila: Uint32Array.from(blqFila),
      blqCol: Uint32Array.from(blqCol),
      franjaBase,
      franjaAncho,
      colSell,
      posDe,
      diag,
      costura: Uint32Array.from({ length: 3 * nc }, (_, k) => c.vertices(Math.floor(k / 3))[k % 3]),
      costuraK: Uint32Array.from(s.placa.costura, (k) => k.o),
    },
  };
}
