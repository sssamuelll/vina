/**
 * Telas preparadas: la parte CPU del armado TSL (`prepararTela`), hecha en un
 * worker y guardada por su huella. Sin worker, o con uno que falla o no
 * contesta, se arma en el hilo principal, como antes, y se dice por qué; quien
 * pide `soloFueraDelHilo` (el preparador, en reposo) recibe el rechazo.
 *
 * @module telasPreparadas
 */

import { prepararTela, type TelaPreparada, type Interruptores } from './prepararTela';
import type { PieceMeshData } from './gpuSolverClient';
import type { SeamPair } from '../seamPairs';
import type { FabricComplianceConfig } from './tslBuffers';

/** En memoria de la pestaña, de 5-8 MB cada una en la camisa de María; sale la que hace más que no se usa. */
export const TELAS_GUARDADAS = 2;
/** Si el worker no contesta en este tiempo, se arma en el hilo principal (o se rechaza, con `soloFueraDelHilo`). */
const ESPERA_MAXIMA_DEL_WORKER_MS = 10_000;

export interface EntradasDelArmado {
  pieces: PieceMeshData[];
  seamPairs: SeamPair[] | undefined;
  fabric: FabricComplianceConfig | undefined;
  interruptores: Interruptores;
}

/** 'armada' es en un worker; 'armada-en-el-hilo', en el hilo principal porque el worker no pudo. */
export type OrigenDeLaTela = 'cache' | 'en-vuelo' | 'armada' | 'armada-en-el-hilo';

/** Lo que deja un armado y dónde se hizo. */
type Armado = { tela: TelaPreparada; origen: 'armada' | 'armada-en-el-hilo' };

const guardadas = new Map<string, TelaPreparada>();
const enVuelo = new Map<string, Promise<Armado>>();

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

/**
 * Arma la tela en un worker. Si el worker no puede (no hay, falla, no puede
 * recibir las entradas o no contesta a tiempo), la arma en el hilo principal
 * diciendo por qué, o rechaza con el motivo si `soloFueraDelHilo`.
 */
function armarFueraDelHilo(e: EntradasDelArmado, soloFueraDelHilo: boolean): Promise<Armado> {
  const sinElWorker = (motivo: string): Armado => {
    if (soloFueraDelHilo) throw new Error(`La tela no se armó fuera del hilo principal: ${motivo}`);
    console.warn(`[telasPreparadas] La tela se arma en el hilo principal: ${motivo}`);
    return { tela: enElHilo(e), origen: 'armada-en-el-hilo' };
  };
  let worker: Worker;
  try {
    worker = new Worker(new URL('./prepararTelaWorker.ts', import.meta.url), { type: 'module' });
  } catch {
    return Promise.resolve().then(() => sinElWorker('sin worker'));
  }
  return new Promise<Armado>((resolve, reject) => {
    const alHilo = (motivo: string) => {
      clearTimeout(reloj);
      worker.terminate();
      try { resolve(sinElWorker(motivo)); } catch (err) { reject(err); }
    };
    const reloj = setTimeout(
      () => alHilo(`no contestó en ${ESPERA_MAXIMA_DEL_WORKER_MS / 1000} s`),
      ESPERA_MAXIMA_DEL_WORKER_MS,
    );
    worker.onmessage = (m: MessageEvent<{ tela?: TelaPreparada; error?: string }>) => {
      if (!m.data.tela) return alHilo(`error del worker: ${m.data.error}`);
      clearTimeout(reloj);
      worker.terminate();
      resolve({ tela: m.data.tela, origen: 'armada' });
    };
    // Un script que no carga llega como Event, sin mensaje.
    worker.onerror = (ev) => alHilo(ev.message ? `error del worker: ${ev.message}` : 'error del worker');
    // Sin transferir: los arreglos de entrada son de quien llama. Si no se
    // pueden clonar, se sabe ya, y no 10 s después.
    try { worker.postMessage(e); } catch { alHilo('no se pudo clonar'); }
  });
}

/**
 * La tela de esta huella: la guardada, la que ya se está armando o una armada
 * ahora fuera del hilo principal. Cada llamada recibe SU copia: el solver
 * escribe en los arreglos que recibe (congelar piezas reescribe invMass, el
 * planchado reescribe la flexión), y la guardada tiene que quedar como salió
 * del armado para la próxima corrida.
 *
 * Una en vuelo que no coincide con las entradas, o que falla, no se usa: esta
 * llamada arma la suya, con sus opciones. Así «Simular» recibe su tela aunque
 * el preparador, que pide `soloFueraDelHilo`, no la consiga.
 *
 * `e` no puede cambiar hasta que la promesa termine: si el worker falla, se
 * arma en el hilo con las entradas de ese momento.
 */
export async function obtenerTela(
  h: string,
  e: EntradasDelArmado,
  { soloFueraDelHilo = false }: { soloFueraDelHilo?: boolean } = {},
): Promise<{ tela: TelaPreparada; origen: OrigenDeLaTela }> {
  const guardada = guardadas.get(h);
  if (guardada && coincide(guardada, e)) {
    guardar(h, guardada);
    return { tela: structuredClone(guardada), origen: 'cache' };
  }
  const vuelo = enVuelo.get(h);
  if (vuelo) {
    try {
      const { tela } = await vuelo;
      if (coincide(tela, e)) return { tela: structuredClone(tela), origen: 'en-vuelo' };
    } catch {
      // La compartida no se armó: se arma aquí.
    }
  }
  const promesa = armarFueraDelHilo(e, soloFueraDelHilo);
  enVuelo.set(h, promesa);
  try {
    const { tela, origen } = await promesa;
    guardar(h, tela);
    return { tela: structuredClone(tela), origen };
  } finally {
    enVuelo.delete(h);
  }
}
