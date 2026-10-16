/**
 * Obstáculos rígidos: los de forma analítica de los ensayos del banco (spec 2026-10-13 §4.4) y el cuerpo, una
 * malla con su BVH (§4.3.1, cuerpo.ts).
 */
import type { CuerpoRigido } from './cuerpo';

export type Obstaculo =
  /** cilindro macizo de radio `radio` con la tapa en y = `tapa` (m): el pedestal del ensayo Cusick */
  | { tipo: 'pedestal'; radio: number; tapa: number }
  /** suelo en y = `altura` */
  | { tipo: 'plano'; altura: number }
  /** malla rígida con su BVH: el cuerpo (§4.3.1) */
  | { tipo: 'cuerpo'; cuerpo: CuerpoRigido };

/** Distancia con signo a la superficie (m, negativa dentro) y normal hacia afuera. */
export interface Distancia {
  d: number;
  nx: number;
  ny: number;
  nz: number;
}

/**
 * Hasta dónde se busca el cuerpo (m): un vértice más adentro no se recupera. Es el tope de empuje del XPBD de
 * hoy (tslCollision.ts, MAX_PUSH_DIST).
 */
export const RADIO_DE_BUSQUEDA = 0.05;

export function distancia(o: Obstaculo, x: number, y: number, z: number, radio = Infinity): Distancia {
  if (o.tipo === 'plano') return { d: y - o.altura, nx: 0, ny: 1, nz: 0 };
  if (o.tipo === 'cuerpo') {
    const c = o.cuerpo.cercano(x, y, z, radio);
    return c ? { d: c.d, nx: c.nx, ny: c.ny, nz: c.nz } : { d: Infinity, nx: 0, ny: 1, nz: 0 };
  }
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
export function masCercano(obs: readonly Obstaculo[], x: number, y: number, z: number, radio = Infinity): (Distancia & { k: number }) | null {
  let mejor: (Distancia & { k: number }) | null = null;
  for (let k = 0; k < obs.length; k++) {
    const c = distancia(obs[k], x, y, z, radio);
    if (mejor === null || c.d < mejor.d) mejor = { ...c, k };
  }
  return mejor;
}
