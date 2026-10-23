/**
 * La costura soldada (spec 2026-10-13 §7, E17): los dos lados de cada costura se mallan con los mismos vértices. Cada
 * lado se recorre en el sentido del cosido sobre el contorno aplanado de su pieza, y su tramo cosido se parte en N
 * tramos iguales en largo de arco, con el mismo N en los dos lados (el del lado más largo, a la arista); lo que no se
 * cose de un borde cosido se parte a la arista. El mallador pone esos puntos como los vértices del borde
 * (TramoDelBorde), cada punto de costura cae en un vértice del otro lado, y al cerrar (E8) la costura es una sola arista.
 */
import type { PatternPiece, Point2D } from '../../../types/types';
import type { TramoDelBorde } from '../../mesh/cdtMesher';
import { flattenPath, TOLERANCIA_DE_DUPLICADOS } from '../../seam';
import { extenderSobreCopias, SEAM_CURVE_RESOLUTION, type SeamInitData } from '../seamAssembly';
import { resolveSegmentRange, type LocalVertexIndex, type SeamPair } from '../seamPairs';

type Muestra = Point2D & { orig: number };

export interface CosturaSoldada {
  /** el índice de la costura en la lista que llegó */
  costura: number;
  pieceAId: string;
  pieceBId: string;
  /** las muestras de cada lado en el orden del cosido, con su lugar en el contorno aplanado de su pieza */
  a: Muestra[];
  b: Muestra[];
}

export interface Soldadura {
  /** por pieza, en el orden de las piezas, los tramos de su borde para el mallador */
  tramos: TramoDelBorde[][];
  costuras: CosturaSoldada[];
  /** las costuras que no se sueldan (no se resuelven, o pisan otra en el mismo borde): siguen con E1 */
  sueltas: number[];
}

/** Un borde de una pieza: los índices del contorno aplanado de una punta a la otra y el largo de arco hasta cada uno (mm). */
interface Borde {
  pieza: number;
  fs: number;
  fe: number;
  indices: number[];
  arco: number[];
}

/** Un lado de una costura en su borde: el rango que cose en el sentido del borde, y cuántos tramos. */
interface Lado {
  borde: string;
  u0: number;
  u1: number;
  alReves: boolean;
}

const contorno = (p: PatternPiece) => flattenPath(p.outline, SEAM_CURVE_RESOLUTION);

function armarBorde(pieza: number, flat: readonly Point2D[], fs: number, fe: number): Borde {
  const N = flat.length, indices = [fs], arco = [0];
  for (let i = fs; i !== fe; ) {
    const j = (i + 1) % N;
    arco.push(arco[arco.length - 1] + Math.hypot(flat[j].x - flat[i].x, flat[j].y - flat[i].y));
    indices.push(j);
    i = j;
  }
  return { pieza, fs, fe, indices, arco };
}

/** El punto del borde a la fracción u de su largo de arco, con su lugar en el contorno; las puntas, exactas. */
function enElBorde(b: Borde, flat: readonly Point2D[], u: number): Muestra {
  if (u <= 0) return { x: flat[b.fs].x, y: flat[b.fs].y, orig: b.fs };
  if (u >= 1) return { x: flat[b.fe].x, y: flat[b.fe].y, orig: b.fe };
  const s = u * b.arco[b.arco.length - 1];
  let q = 0;
  while (q < b.arco.length - 2 && b.arco[q + 1] < s) q++;
  const tramo = b.arco[q + 1] - b.arco[q], f = tramo > 0 ? (s - b.arco[q]) / tramo : 0;
  const p = flat[b.indices[q]], r = flat[b.indices[q + 1]];
  return { x: p.x + f * (r.x - p.x), y: p.y + f * (r.y - p.y), orig: (b.indices[q] + f) % flat.length };
}

export function soldadura(piezas: readonly PatternPiece[], costuras: readonly SeamInitData[], aristaMm: number): Soldadura {
  const flats = piezas.map(contorno), porId = new Map(piezas.map((p, k) => [p.id, k]));
  const bordes = new Map<string, Borde>();
  const lado = (pid: string, nombre: string, rango: [number, number] | undefined, alReves: boolean): Lado | null => {
    const k = porId.get(pid);
    if (k === undefined) return null;
    const p = piezas[k], r = resolveSegmentRange({ pieceId: p.id, outline: p.outline, edges: p.edges }, nombre);
    if (!r) return null;
    const [fs, fe] = extenderSobreCopias(flats[k], r), clave = `${k}:${fs}:${fe}`;
    if (!bordes.has(clave)) bordes.set(clave, armarBorde(k, flats[k], fs, fe));
    const [t0, t1] = rango ?? [0, 1];
    if (!(t1 > t0) || !(bordes.get(clave)!.arco.at(-1)! > 0)) return null;
    return alReves ? { borde: clave, u0: 1 - t1, u1: 1 - t0, alReves } : { borde: clave, u0: t0, u1: t1, alReves };
  };
  const largo = (l: Lado) => (l.u1 - l.u0) * bordes.get(l.borde)!.arco.at(-1)!;

  // cada costura con sus dos lados y su N; la que no se resuelve, o cose un borde consigo, queda suelta
  const sueltas = new Set<number>();
  const enCurso: Array<{ j: number; A: Lado; B: Lado; n: number }> = [];
  costuras.forEach((c, j) => {
    if (c.active === false) return;
    const A = lado(c.pieceAId, c.pieceAEdgeName, c.pieceARange, false), B = lado(c.pieceBId, c.pieceBEdgeName, c.pieceBRange, c.pieceBReversed === true);
    if (!A || !B || A.borde === B.borde) {
      sueltas.add(j);
      return;
    }
    enCurso.push({ j, A, B, n: Math.max(1, Math.ceil(Math.max(largo(A), largo(B)) / aristaMm - 1e-9)) });
  });

  // dos lados que se pisan, en un mismo borde o en dos bordes de una pieza que comparten un tramo del contorno, sueltan
  // sus dos costuras
  const lados = enCurso.flatMap((c) => [{ c, l: c.A }, { c, l: c.B }]);
  const segmentos = (l: Lado) => {
    const b = bordes.get(l.borde)!, L = b.arco.at(-1)!, s: number[] = [];
    for (let q = 0; q + 1 < b.indices.length; q++) {
      if (b.arco[q + 1] > b.arco[q] && b.arco[q + 1] > l.u0 * L + 1e-9 && b.arco[q] < l.u1 * L - 1e-9) s.push(b.indices[q]);
    }
    return { pieza: b.pieza, s };
  };
  for (let p = 0; p < lados.length; p++) {
    for (let q = p + 1; q < lados.length; q++) {
      const x = lados[p], y = lados[q];
      const pisan = x.l.borde === y.l.borde
        ? x.l.u0 < y.l.u1 - 1e-9 && y.l.u0 < x.l.u1 - 1e-9
        : (() => {
            const sx = segmentos(x.l), sy = segmentos(y.l);
            return sx.pieza === sy.pieza && sx.s.some((i) => sy.s.includes(i));
          })();
      if (pisan) {
        sueltas.add(x.c.j);
        sueltas.add(y.c.j);
      }
    }
  }
  const soldadas = enCurso.filter((c) => !sueltas.has(c.j));

  // cada borde cosido: sus tramos de costura en orden, y lo de entre ellos a la arista
  const tramos: TramoDelBorde[][] = piezas.map(() => []);
  const muestras = new Map<Lado, Muestra[]>();
  for (const [clave, b] of bordes) {
    const suyos = soldadas.flatMap((c) => [c.A, c.B].filter((l) => l.borde === clave).map((l) => ({ l, n: c.n }))).sort((p, q) => p.l.u0 - q.l.u0);
    if (suyos.length === 0) continue;
    const L = b.arco.at(-1)!, us = [0], desde = new Map<Lado, number>();
    const partir = (u0: number, u1: number, n: number) => {
      for (let k = 1; k <= n; k++) us.push(k === n ? u1 : u0 + ((u1 - u0) * k) / n);
    };
    const aLaArista = (u0: number, u1: number) => {
      if (u1 - u0 > 1e-9) partir(u0, u1, Math.max(1, Math.ceil(((u1 - u0) * L) / aristaMm - 1e-9)));
    };
    let u = 0;
    for (const { l, n } of suyos) {
      aLaArista(u, l.u0);
      desde.set(l, us.length - 1);
      partir(l.u0, l.u1, n);
      u = l.u1;
    }
    aLaArista(u, 1);
    const puntos = us.map((v) => enElBorde(b, flats[b.pieza], v));
    tramos[b.pieza].push({ desde: b.fs, hasta: b.fe, puntos });
    for (const { l, n } of suyos) {
      const m = puntos.slice(desde.get(l)!, desde.get(l)! + n + 1);
      muestras.set(l, l.alReves ? m.reverse() : m);
    }
  }
  return {
    tramos,
    costuras: soldadas.map((c) => ({ costura: c.j, pieceAId: costuras[c.j].pieceAId, pieceBId: costuras[c.j].pieceBId, a: muestras.get(c.A)!, b: muestras.get(c.B)! })),
    sueltas: [...sueltas].sort((p, q) => p - q),
  };
}

/** Un par de costura del motor implícito: sus dos piezas y sus lados (lo que lee costurasDePrenda). */
export type ParDeCostura = Pick<SeamPair, 'pieceAId' | 'pieceBId' | 'lados'>;

/**
 * Los lados de cada costura soldada en las mallas de sus piezas: cada muestra es el vértice del borde que el mallador
 * puso en su lugar, y los dos lados van muestra a muestra con el mismo t (k/N). La costura con una muestra que el
 * mallador no dejó (o que dos muestras caen en un mismo vértice) se devuelve suelta, para coserla con E1.
 */
export function ladosSoldados(
  s: Soldadura,
  piezas: readonly PatternPiece[],
  mallas: ReadonlyArray<{ pieceId: string; boundaryOrig?: ArrayLike<number> }>,
): { pares: Array<ParDeCostura & { costura: number }>; sueltas: number[] } {
  // por pieza, los vértices del borde en el dibujo: su lugar en el contorno, llevado a su punto
  const bordeDe = new Map<string, Array<{ v: number; x: number; y: number }>>();
  piezas.forEach((p) => {
    const orig = mallas.find((m) => m.pieceId === p.id)?.boundaryOrig, flat = contorno(p), N = flat.length, vs: Array<{ v: number; x: number; y: number }> = [];
    for (let v = 0; orig && v < orig.length; v++) {
      const o = orig[v];
      if (!Number.isFinite(o)) continue;
      const i = Math.floor(o), f = o - i, a = flat[i % N], b = flat[(i + 1) % N];
      vs.push({ v, x: a.x + f * (b.x - a.x), y: a.y + f * (b.y - a.y) });
    }
    bordeDe.set(p.id, vs);
  });
  const vertices = (pieza: string, ms: readonly Muestra[]): LocalVertexIndex[] | null => {
    const vs = bordeDe.get(pieza) ?? [], out: LocalVertexIndex[] = [];
    for (const m of ms) {
      let mejor = -1, d = TOLERANCIA_DE_DUPLICADOS + 1e-6;
      for (const q of vs) {
        const e = Math.hypot(q.x - m.x, q.y - m.y);
        if (e <= d) {
          d = e;
          mejor = q.v;
        }
      }
      if (mejor < 0 || out.includes(mejor as LocalVertexIndex)) return null;
      out.push(mejor as LocalVertexIndex);
    }
    return out;
  };
  const pares: Array<ParDeCostura & { costura: number }> = [], sueltas: number[] = [];
  for (const c of s.costuras) {
    const a = vertices(c.pieceAId, c.a), b = vertices(c.pieceBId, c.b);
    if (!a || !b) {
      sueltas.push(c.costura);
      continue;
    }
    const t = a.map((_, k) => k / (a.length - 1));
    pares.push({ costura: c.costura, pieceAId: c.pieceAId, pieceBId: c.pieceBId, lados: { a, b, ta: t, tb: [...t] } });
  }
  return { pares, sueltas };
}
