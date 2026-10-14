/**
 * Obstáculos rígidos de forma analítica: los de los ensayos del banco (spec 2026-10-13 §4.4). El cuerpo,
 * una malla con su BVH, llega con la prenda completa (§4.3.1).
 */
export type Obstaculo =
  /** cilindro macizo de radio `radio` con la tapa en y = `tapa` (m): el pedestal del ensayo Cusick */
  | { tipo: 'pedestal'; radio: number; tapa: number }
  /** suelo en y = `altura` */
  | { tipo: 'plano'; altura: number };

/** Distancia con signo a la superficie (m, negativa dentro) y normal hacia afuera. */
export interface Distancia {
  d: number;
  nx: number;
  ny: number;
  nz: number;
}

export function distancia(o: Obstaculo, x: number, y: number, z: number): Distancia {
  if (o.tipo === 'plano') return { d: y - o.altura, nx: 0, ny: 1, nz: 0 };
  const R = o.radio, T = o.tapa;
  const r = Math.hypot(x, z);
  const rx = r > 1e-12 ? x / r : 1, rz = r > 1e-12 ? z / r : 0;
  if (r <= R && y >= T) return { d: y - T, nx: 0, ny: 1, nz: 0 };
  if (r > R && y <= T) return { d: r - R, nx: rx, ny: 0, nz: rz };
  if (r > R && y > T) {
    const a = r - R, b = y - T, d = Math.hypot(a, b);
    return { d, nx: (a / d) * rx, ny: b / d, nz: (a / d) * rz };
  }
  return T - y < R - r ? { d: -(T - y), nx: 0, ny: 1, nz: 0 } : { d: -(R - r), nx: rx, ny: 0, nz: rz };
}

/** El obstáculo más cercano al punto, con su índice; null si no hay obstáculos. */
export function masCercano(obs: readonly Obstaculo[], x: number, y: number, z: number): (Distancia & { k: number }) | null {
  let mejor: (Distancia & { k: number }) | null = null;
  for (let k = 0; k < obs.length; k++) {
    const c = distancia(obs[k], x, y, z);
    if (mejor === null || c.d < mejor.d) mejor = { ...c, k };
  }
  return mejor;
}
