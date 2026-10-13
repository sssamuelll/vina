/**
 * El BVH del cuerpo, preparado en reposo: `buildLinearBVH` (~130 ms en el hilo
 * principal con el cuerpo de María) hecho en un worker y guardado por la huella
 * de la malla horneada. Al pulsar «Simular», `setTslCollisionBody` busca esa
 * huella y, si está, no lo arma.
 *
 * Se guarda y se entrega sin copiar: nadie escribe en los arreglos de un
 * LinearBVH después de armarlo. Los StorageBufferAttribute del cuerpo los
 * envuelven, la subida a la GPU los copia de ahí y los kernels de colisión y de
 * face-poke solo los leen; ninguna lectura de la GPU vuelve a ellos.
 *
 * @module bvhPreparado
 */

import { buildLinearBVH, type LinearBVH } from './bvh';
import type { CollisionMeshData } from '../collisionMesh';

/** En memoria de la pestaña, ~3,5 MB cada uno con el cuerpo de María; sale el que hace más que no se usa. */
export const BVH_GUARDADOS = 2;
/** Si el worker no contesta en este tiempo, se arma en el hilo principal (o se rechaza, con `soloFueraDelHilo`). */
const ESPERA_MAXIMA_DEL_WORKER_MS = 10_000;

const guardados = new Map<string, LinearBVH>();

export function guardarBvh(huellaDelCuerpo: string, bvh: LinearBVH): void {
  guardados.delete(huellaDelCuerpo);
  guardados.set(huellaDelCuerpo, bvh);
  while (guardados.size > BVH_GUARDADOS) guardados.delete(guardados.keys().next().value as string);
}

/** El BVH guardado con esa huella, o null. El usado pasa al final: es el último en salir. */
export function bvhGuardado(huellaDelCuerpo: string): LinearBVH | null {
  const bvh = guardados.get(huellaDelCuerpo);
  if (!bvh) return null;
  guardarBvh(huellaDelCuerpo, bvh);
  return bvh;
}

/**
 * Arma el BVH en un worker. Si el worker no puede (no hay, falla, no puede
 * recibir la malla o no contesta a tiempo), lo arma en el hilo principal
 * diciendo por qué, o rechaza con el motivo si `soloFueraDelHilo`. Es el mismo
 * patrón que `armarFueraDelHilo` de telasPreparadas: un arreglo en uno va en
 * el otro.
 */
export function armarBvhFueraDelHilo(
  mesh: CollisionMeshData,
  { soloFueraDelHilo = false }: { soloFueraDelHilo?: boolean } = {},
): Promise<LinearBVH> {
  const sinElWorker = (motivo: string): LinearBVH => {
    if (soloFueraDelHilo) throw new Error(`El BVH del cuerpo no se armó fuera del hilo principal: ${motivo}`);
    console.warn(`[bvhPreparado] El BVH del cuerpo se arma en el hilo principal: ${motivo}`);
    return buildLinearBVH(mesh);
  };
  let worker: Worker;
  try {
    worker = new Worker(new URL('./bvhWorker.ts', import.meta.url), { type: 'module' });
  } catch {
    return Promise.resolve().then(() => sinElWorker('sin worker'));
  }
  return new Promise<LinearBVH>((resolve, reject) => {
    const alHilo = (motivo: string) => {
      clearTimeout(reloj);
      worker.terminate();
      try { resolve(sinElWorker(motivo)); } catch (err) { reject(err); }
    };
    const reloj = setTimeout(
      () => alHilo(`no contestó en ${ESPERA_MAXIMA_DEL_WORKER_MS / 1000} s`),
      ESPERA_MAXIMA_DEL_WORKER_MS,
    );
    worker.onmessage = (m: MessageEvent<{ bvh?: LinearBVH; error?: string }>) => {
      if (!m.data.bvh) return alHilo(`error del worker: ${m.data.error}`);
      clearTimeout(reloj);
      worker.terminate();
      resolve(m.data.bvh);
    };
    // Un script que no carga llega como Event, sin mensaje.
    worker.onerror = (ev) => alHilo(ev.message ? `error del worker: ${ev.message}` : 'error del worker');
    // Sin transferir: la malla es de quien llama. Si no se puede clonar, se
    // sabe ya, y no 10 s después.
    try { worker.postMessage({ mesh }); } catch { alHilo('no se pudo clonar'); }
  });
}
