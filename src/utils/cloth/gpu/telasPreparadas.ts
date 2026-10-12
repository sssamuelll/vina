/**
 * Telas preparadas: la parte CPU del armado TSL (`prepararTela`), hecha en un
 * worker y guardada por su huella. Sin worker, o con uno que falla o no
 * contesta, se arma en el hilo principal, como antes.
 *
 * @module telasPreparadas
 */

import { prepararTela, type TelaPreparada, type Interruptores } from './prepararTela';
import type { PieceMeshData } from './gpuSolverClient';
import type { SeamPair } from '../seamPairs';
import type { FabricComplianceConfig } from './tslBuffers';

/** En memoria de la pestaña, de 5-8 MB cada una en la camisa de María; sale la que hace más que no se usa. */
export const TELAS_GUARDADAS = 2;
/** Si el worker no contesta en este tiempo, se arma en el hilo principal. */
const ESPERA_MAXIMA_DEL_WORKER_MS = 10_000;

export interface EntradasDelArmado {
  pieces: PieceMeshData[];
  seamPairs: SeamPair[] | undefined;
  fabric: FabricComplianceConfig | undefined;
  interruptores: Interruptores;
}

export type OrigenDeLaTela = 'cache' | 'en-vuelo' | 'armada';

const guardadas = new Map<string, TelaPreparada>();
const enVuelo = new Map<string, Promise<TelaPreparada>>();

/** Lo barato de la spec § 4.4: las mismas piezas, en el mismo orden, con los mismos vértices. */
function coincide(t: TelaPreparada, e: EntradasDelArmado): boolean {
  return t.pieceVertexRanges.length === e.pieces.length
    && e.pieces.every((p, i) => t.pieceVertexRanges[i][0] === p.pieceId && t.pieceVertexRanges[i][1].count === p.vertices.length / 3);
}

function guardar(h: string, t: TelaPreparada): void {
  guardadas.delete(h);
  guardadas.set(h, t);
  while (guardadas.size > TELAS_GUARDADAS) guardadas.delete(guardadas.keys().next().value as string);
}

function enElHilo(e: EntradasDelArmado): TelaPreparada {
  return prepararTela(e.pieces, e.seamPairs, e.fabric, e.interruptores);
}

function armarFueraDelHilo(e: EntradasDelArmado): Promise<TelaPreparada> {
  let worker: Worker;
  try {
    worker = new Worker(new URL('./prepararTelaWorker.ts', import.meta.url), { type: 'module' });
  } catch {
    return Promise.resolve().then(() => enElHilo(e));
  }
  return new Promise<TelaPreparada>((resolve, reject) => {
    const alHilo = () => {
      clearTimeout(reloj);
      worker.terminate();
      try { resolve(enElHilo(e)); } catch (err) { reject(err); }
    };
    const reloj = setTimeout(alHilo, ESPERA_MAXIMA_DEL_WORKER_MS);
    worker.onmessage = (m: MessageEvent<{ tela?: TelaPreparada; error?: string }>) => {
      if (!m.data.tela) return alHilo();
      clearTimeout(reloj);
      worker.terminate();
      resolve(m.data.tela);
    };
    worker.onerror = alHilo;
    // Sin transferir: los arreglos de entrada son de quien llama. Si no se
    // pueden clonar, al hilo ya, y no 10 s después con la llamada rechazada.
    try { worker.postMessage(e); } catch { alHilo(); }
  });
}

/**
 * La tela de esta huella: la guardada, la que ya se está armando o una armada
 * ahora fuera del hilo principal. Cada llamada recibe SU copia: el solver
 * escribe en los arreglos que recibe (congelar piezas reescribe invMass, el
 * planchado reescribe la flexión), y la guardada tiene que quedar como salió
 * del armado para la próxima corrida.
 */
export async function obtenerTela(h: string, e: EntradasDelArmado): Promise<{ tela: TelaPreparada; origen: OrigenDeLaTela }> {
  const guardada = guardadas.get(h);
  if (guardada && coincide(guardada, e)) {
    guardar(h, guardada);
    return { tela: structuredClone(guardada), origen: 'cache' };
  }
  const vuelo = enVuelo.get(h);
  if (vuelo) return { tela: structuredClone(await vuelo), origen: 'en-vuelo' };
  const promesa = armarFueraDelHilo(e);
  enVuelo.set(h, promesa);
  try {
    const tela = await promesa;
    guardar(h, tela);
    return { tela: structuredClone(tela), origen: 'armada' };
  } finally {
    enVuelo.delete(h);
  }
}
