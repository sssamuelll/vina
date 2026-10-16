/**
 * El cuerpo rígido del motor implícito (spec 2026-10-13 §4.3.1): la malla del avatar con su BVH (el
 * `LinearBVH` de #1248, el mismo que sube la GPU), recorrido con sus punteros de escape. Da el punto más cercano,
 * la distancia con signo (el lado lo decide la pseudonormal de la cara, la arista o el vértice donde cae el
 * punto, como tslCollision.ts) y la normal del plano de contacto: del punto más cercano hacia el vértice, que es
 * continua al pasar de una cara a otra.
 */
import type { LinearBVH } from '../gpu/bvh';

/** El punto de un triángulo más cercano a otro, sus pesos y la característica: 0 cara; 1, 2, 3 aristas AB, BC, CA; 4, 5, 6 vértices A, B, C. */
export interface PuntoEnTriangulo {
  x: number;
  y: number;
  z: number;
  wa: number;
  wb: number;
  wc: number;
  rasgo: number;
}

/** El punto del triángulo abc más cercano a p (Ericson, «Real-Time Collision Detection», §5.1.5), en `out`. */
export function puntoMasCercano(
  px: number, py: number, pz: number,
  ax: number, ay: number, az: number,
  bx: number, by: number, bz: number,
  cx: number, cy: number, cz: number,
  out: PuntoEnTriangulo,
): PuntoEnTriangulo {
  const poner = (wa: number, wb: number, wc: number, rasgo: number) => {
    out.wa = wa;
    out.wb = wb;
    out.wc = wc;
    out.rasgo = rasgo;
    out.x = wa * ax + wb * bx + wc * cx;
    out.y = wa * ay + wb * by + wc * cy;
    out.z = wa * az + wb * bz + wc * cz;
    return out;
  };
  const abx = bx - ax, aby = by - ay, abz = bz - az, acx = cx - ax, acy = cy - ay, acz = cz - az;
  const apx = px - ax, apy = py - ay, apz = pz - az;
  const d1 = abx * apx + aby * apy + abz * apz, d2 = acx * apx + acy * apy + acz * apz;
  if (d1 <= 0 && d2 <= 0) return poner(1, 0, 0, 4);
  const bpx = px - bx, bpy = py - by, bpz = pz - bz;
  const d3 = abx * bpx + aby * bpy + abz * bpz, d4 = acx * bpx + acy * bpy + acz * bpz;
  if (d3 >= 0 && d4 <= d3) return poner(0, 1, 0, 5);
  const vc = d1 * d4 - d3 * d2;
  if (vc <= 0 && d1 >= 0 && d3 <= 0) {
    const v = d1 / (d1 - d3);
    return poner(1 - v, v, 0, 1);
  }
  const cpx = px - cx, cpy = py - cy, cpz = pz - cz;
  const d5 = abx * cpx + aby * cpy + abz * cpz, d6 = acx * cpx + acy * cpy + acz * cpz;
  if (d6 >= 0 && d5 <= d6) return poner(0, 0, 1, 6);
  const vb = d5 * d2 - d1 * d6;
  if (vb <= 0 && d2 >= 0 && d6 <= 0) {
    const w = d2 / (d2 - d6);
    return poner(1 - w, 0, w, 3);
  }
  const va = d3 * d6 - d5 * d4;
  if (va <= 0 && d4 - d3 >= 0 && d5 - d6 >= 0) {
    const w = (d4 - d3) / (d4 - d3 + (d5 - d6));
    return poner(0, 1 - w, w, 2);
  }
  const den = va + vb + vc;
  if (!(Math.abs(den) > 0)) return poner(1, 0, 0, 4);
  const v = vb / den, w = vc / den;
  return poner(1 - v - w, v, w, 0);
}

/** El punto del cuerpo más cercano: distancia con signo (negativa dentro), normal del plano de contacto (afuera) y el punto. */
export interface Cercano {
  d: number;
  nx: number;
  ny: number;
  nz: number;
  cx: number;
  cy: number;
  cz: number;
}

export class CuerpoRigido {
  /** los vértices del cuerpo sin repetir y la pseudonormal de cada uno: para el contacto propio (contactoPropio.ts) */
  readonly vertices: Float64Array;
  readonly normales: Float64Array;
  private readonly p: PuntoEnTriangulo = { x: 0, y: 0, z: 0, wa: 0, wb: 0, wc: 0, rasgo: 0 };

  constructor(readonly bvh: LinearBVH) {
    const vistos = new Set<string>(), v: number[] = [], n: number[] = [];
    const { triVerts: tv, vertexPseudonormals: pn } = bvh;
    for (let t = 0; t < bvh.triCount; t++) {
      for (let k = 0; k < 3; k++) {
        const o = 9 * t + 3 * k, clave = `${tv[o]},${tv[o + 1]},${tv[o + 2]}`;
        if (vistos.has(clave)) continue;
        vistos.add(clave);
        v.push(tv[o], tv[o + 1], tv[o + 2]);
        n.push(pn[o], pn[o + 1], pn[o + 2]);
      }
    }
    this.vertices = Float64Array.from(v);
    this.normales = Float64Array.from(n);
  }

  /** El punto del cuerpo más cercano a (px, py, pz) a menos de `radio` (m); null si no hay ninguno. */
  cercano(px: number, py: number, pz: number, radio = Infinity): Cercano | null {
    const { nodes, skip, nodeCount, triVerts: tv } = this.bvh, p = this.p;
    let mejor2 = radio * radio, mejor = -1, rasgo = 0, qx = 0, qy = 0, qz = 0;
    let i = 0;
    while (i < nodeCount) {
      const o = 8 * i;
      const dx = Math.max(nodes[o] - px, 0, px - nodes[o + 3]);
      const dy = Math.max(nodes[o + 1] - py, 0, py - nodes[o + 4]);
      const dz = Math.max(nodes[o + 2] - pz, 0, pz - nodes[o + 5]);
      if (dx * dx + dy * dy + dz * dz >= mejor2) {
        i = skip[i];
        continue;
      }
      const cuenta = nodes[o + 7];
      if (cuenta === 0) {
        i++;
        continue;
      }
      for (let t = nodes[o + 6], fin = t + cuenta; t < fin; t++) {
        const b = 9 * t;
        puntoMasCercano(px, py, pz, tv[b], tv[b + 1], tv[b + 2], tv[b + 3], tv[b + 4], tv[b + 5], tv[b + 6], tv[b + 7], tv[b + 8], p);
        const d2 = (px - p.x) ** 2 + (py - p.y) ** 2 + (pz - p.z) ** 2;
        if (d2 < mejor2) {
          mejor2 = d2;
          mejor = t;
          rasgo = p.rasgo;
          qx = p.x;
          qy = p.y;
          qz = p.z;
        }
      }
      i = skip[i];
    }
    if (mejor < 0) return null;
    // la pseudonormal de la característica donde cayó el punto decide el lado
    const { triNormals, edgePseudonormals, vertexPseudonormals } = this.bvh;
    const fuente = rasgo === 0 ? triNormals : rasgo <= 3 ? edgePseudonormals : vertexPseudonormals;
    const o = rasgo === 0 ? 3 * mejor : rasgo <= 3 ? 9 * mejor + 3 * (rasgo - 1) : 9 * mejor + 3 * (rasgo - 4);
    const ex = px - qx, ey = py - qy, ez = pz - qz, dist = Math.sqrt(mejor2);
    const signo = ex * fuente[o] + ey * fuente[o + 1] + ez * fuente[o + 2] < 0 ? -1 : 1;
    let nx = fuente[o], ny = fuente[o + 1], nz = fuente[o + 2];
    if (dist > 1e-9) {
      nx = (signo * ex) / dist;
      ny = (signo * ey) / dist;
      nz = (signo * ez) / dist;
    }
    return { d: signo * dist, nx, ny, nz, cx: qx, cy: qy, cz: qz };
  }
}
