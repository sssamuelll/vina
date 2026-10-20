/**
 * La malla de una pieza para el motor implícito (spec 2026-10-13 §4.1.2): posiciones 3D iniciales y su
 * patrón plano, en metros. La colocación en 3D solo da las posiciones iniciales; el reposo sale siempre
 * del patrón.
 */
import { meshPieceOutline } from '../../mesh/cdtMesher';

export interface MallaDeTela {
  /** posiciones iniciales [x0, y0, z0, x1, …] */
  x: Float64Array;
  /** el dibujo 2D de la pieza [px0, py0, px1, …] */
  patron: Float64Array;
  tris: Uint32Array;
  /** 1 = vértice empotrado: no se mueve */
  fijos?: Uint8Array;
  /** la pieza de cada triángulo, en una prenda de varias piezas (prenda.ts): el reposo revisa el sentido por pieza */
  piezaDeTri?: Uint16Array;
}

/**
 * Malla un contorno dibujado en mm con el mallador de Vina y lo acuesta en el plano y = altura (m): el
 * punto (px, py) del dibujo queda en (px, altura, py). `lineasMm` son líneas internas que la malla
 * respeta, como el borde de un empotramiento.
 */
export function mallaDeContorno(
  contornoMm: Array<[number, number]>,
  aristaMm: number,
  altura = 0,
  lineasMm: Array<Array<[number, number]>> = [],
): MallaDeTela {
  const internas = lineasMm.map((l) => ({
    path: l.map(([x, y], k) => ({ type: k === 0 ? ('M' as const) : ('L' as const), values: [x, y] })),
  }));
  const m = meshPieceOutline(
    contornoMm.map(([x, y]) => ({ x, y })),
    internas,
    { yHeight: altura, scale: 0.001, maxEdgeLength: aristaMm, minAngle: 25, maxRefinementPasses: 3, curveResolution: 12 },
  );
  if (m.triIds.length === 0) throw new Error('mallaDeContorno: el mallador no devolvió triángulos');
  // el mallador centra la pieza en su caja: se devuelve a donde la dibuja el contorno
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const [x, y] of contornoMm) {
    minX = Math.min(minX, x);
    maxX = Math.max(maxX, x);
    minY = Math.min(minY, y);
    maxY = Math.max(maxY, y);
  }
  const cx = ((minX + maxX) / 2) * 0.001, cz = ((minY + maxY) / 2) * 0.001;
  const n = m.vertices.length / 3;
  const x = new Float64Array(3 * n), patron = new Float64Array(2 * n);
  for (let i = 0; i < n; i++) {
    x[3 * i] = m.vertices[3 * i] + cx;
    x[3 * i + 1] = altura;
    x[3 * i + 2] = m.vertices[3 * i + 2] + cz;
    patron[2 * i] = x[3 * i];
    patron[2 * i + 1] = x[3 * i + 2];
  }
  return { x, patron, tris: Uint32Array.from(m.triIds) };
}

/**
 * Gira el patrón al marco del hilo (§4.1.2): `v` a lo largo de la urdimbre y `u` perpendicular. `hilo`
 * es la dirección de la urdimbre en el dibujo; por defecto, vertical.
 */
export function aMarcoDelHilo(patron: Float64Array, hilo: readonly [number, number] = [0, 1]): Float64Array {
  const l = Math.hypot(hilo[0], hilo[1]);
  const hx = hilo[0] / l, hy = hilo[1] / l;
  const uv = new Float64Array(patron.length);
  for (let i = 0; i < patron.length / 2; i++) {
    const px = patron[2 * i], py = patron[2 * i + 1];
    uv[2 * i] = px * hy - py * hx;
    uv[2 * i + 1] = px * hx + py * hy;
  }
  return uv;
}
