/**
 * Worker del BVH del cuerpo: corre `buildLinearBVH` fuera del hilo principal y
 * devuelve el BVH con sus buffers transferidos. Este sí carga three y
 * three-mesh-bvh (los usa bvh.ts): corre en reposo, y su arranque no cuenta
 * para el clic.
 */
import { buildLinearBVH } from './bvh';
import { transferibles } from '../transferibles';
import type { CollisionMeshData } from '../collisionMesh';

self.onmessage = (m: MessageEvent<{ mesh: CollisionMeshData }>) => {
  try {
    const bvh = buildLinearBVH(m.data.mesh);
    (self as unknown as Worker).postMessage({ bvh }, transferibles(bvh));
  } catch (err) {
    (self as unknown as Worker).postMessage({ error: err instanceof Error ? err.message : String(err) });
  }
};
