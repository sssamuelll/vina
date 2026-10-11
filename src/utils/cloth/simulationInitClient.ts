/**
 * Simulation Init Client — async interface to the simulation worker.
 *
 * Provides promise-based API for meshing that runs off the main thread.
 * Falls back to synchronous execution if worker fails.
 *
 * @module simulationInitClient
 */

import type { PatternPiece } from '../../types/types';
import { pushSolverEvent } from './solverRuntimeTracker';

// ─── Types ──────────────────────────────────────────────────────────────────

export interface MeshedPiece {
  pieceId: string;
  vertices: Float32Array;
  triIds: Int32Array;
  uvs?: Float32Array;
  /** Mesher boundary provenance (M4) — see ClothMeshData.boundaryOrig. */
  boundaryOrig?: Float64Array;
}

export interface SimInitProgress {
  stage: string;
  current: number;
  total: number;
}

const SCALE = 0.001; // 1 SVG unit = 1mm = 0.001m

type Malla = { vertices: Float32Array; triIds: Int32Array; uvs?: Float32Array; boundaryOrig?: Float64Array };

/**
 * Las mallas ya hechas, por lo que las decide: el contorno, las líneas
 * internas y las opciones (la densidad). Mallar la camisa de María cuesta
 * ~8,6 s (cdt2d es el 99 %) y se repetía en cada «Simular» y en cada re-mallado
 * tras una edición, aunque la pieza no hubiera cambiado (sonda del drape,
 * 2026-10-11). Entra y sale copiado: nadie comparte arrays con la caché.
 * ponytail: 64 mallas en memoria de la pestaña, la más vieja sale primero; a IDB
 * si hace falta que sobreviva a recargar.
 */
const mallasHechas = new Map<string, Malla>();
const MALLAS_GUARDADAS = 64;
const copia = (m: Malla): Malla => ({
  vertices: m.vertices.slice(),
  triIds: m.triIds.slice(),
  uvs: m.uvs?.slice(),
  boundaryOrig: m.boundaryOrig?.slice(),
});

/**
 * Las mallas que se están haciendo ahora, por la misma clave: quien pide una
 * que ya está en vuelo espera esa, en vez de mallar dos veces (el preparador y
 * «Simular» a la vez). Si la compartida falla (su cliente se soltó porque
 * cambiaron las entradas), se malla aquí.
 */
const mallasEnVuelo = new Map<string, Promise<Malla>>();

/** El área de la caja del contorno: para mallar primero las piezas grandes. */
function tamanoDe(piece: PatternPiece): number {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const c of piece.outline) {
    for (let i = 0; i + 1 < c.values.length; i += 2) {
      x0 = Math.min(x0, c.values[i]); x1 = Math.max(x1, c.values[i]);
      y0 = Math.min(y0, c.values[i + 1]); y1 = Math.max(y1, c.values[i + 1]);
    }
  }
  return x1 > x0 && y1 > y0 ? (x1 - x0) * (y1 - y0) : 0;
}

/** Workers para mallar a la vez: hasta 4, y nunca más de la mitad de los núcleos. */
function workersParaMallar(piezas: number): number {
  const nucleos = typeof navigator !== 'undefined' && navigator.hardwareConcurrency ? navigator.hardwareConcurrency : 2;
  return Math.max(1, Math.min(piezas, 4, Math.floor(nucleos / 2)));
}

// ─── Client ─────────────────────────────────────────────────────────────────

export class SimulationInitClient {
  private worker: Worker | null = null;
  /** Workers de más para mallar en paralelo (`meshAllPieces`); los suelta `dispose`. */
  private extras: Worker[] = [];
  /** `dispose` ya pasó: sus workers no contestan. */
  private suelto = false;
  private pendingMesh = new Map<string, {
    resolve: (v: { vertices: Float32Array; triIds: Int32Array; uvs?: Float32Array; boundaryOrig?: Float64Array }) => void;
    reject: (e: Error) => void;
  }>();
  onProgress?: (p: SimInitProgress) => void;

  constructor() {
    try {
      this.worker = this.nuevoWorker();
    } catch {
      console.warn('[SimInitClient] Worker not available, will use main thread fallback');
      this.worker = null;
    }
  }

  private nuevoWorker(): Worker {
    const worker = new Worker(
      new URL('./simulationWorker.ts', import.meta.url),
      { type: 'module' },
    );
    worker.addEventListener('message', this.handleMessage);
    worker.addEventListener('error', (e) => {
      e.preventDefault();
      console.error('[SimInitClient] Worker error:', e.message || e);
      this.rejectAll(new Error('Worker crashed'));
    });
    return worker;
  }

  private handleMessage = (event: MessageEvent) => {
    const msg = event.data;

    if (msg.type === 'meshPieceResult') {
      const pending = this.pendingMesh.get(msg.pieceId);
      if (pending) {
        this.pendingMesh.delete(msg.pieceId);
        if (msg.error) {
          pending.reject(new Error(msg.error));
        } else {
          pending.resolve({ vertices: msg.vertices, triIds: msg.triIds, uvs: msg.uvs, boundaryOrig: msg.boundaryOrig });
        }
      }
    }

    if (msg.type === 'progress') {
      this.onProgress?.({ stage: msg.stage, current: msg.current, total: msg.total });
    }
  };

  /**
   * Mesh a pattern piece off the main thread (in `worker`, the client's own by
   * default). Una pieza ya mallada con las mismas opciones sale de la caché.
   */
  async meshPiece(piece: PatternPiece, particleDistance: number, worker: Worker | null = this.worker): Promise<Malla> {
    const options = {
      yHeight: 0,
      scale: SCALE,
      maxEdgeLength: particleDistance,
      minAngle: 25,
      maxRefinementPasses: 3,
      curveResolution: 12,
    };
    const clave = JSON.stringify([piece.outline, piece.internals ?? null, options]);
    const hecha = mallasHechas.get(clave);
    if (hecha) {
      // La recién usada pasa al final: la que sale es la que hace más que no se usa.
      mallasHechas.delete(clave);
      mallasHechas.set(clave, hecha);
      return copia(hecha);
    }
    const enVuelo = mallasEnVuelo.get(clave);
    if (enVuelo) {
      try {
        const m = await enVuelo;
        return copia(mallasHechas.get(clave) ?? m);
      } catch {
        // El que mallaba se soltó: se malla aquí.
      }
    }
    const promesa = this.mallar(piece, options, worker);
    mallasEnVuelo.set(clave, promesa);
    let malla: Malla;
    try {
      malla = await promesa;
    } finally {
      if (mallasEnVuelo.get(clave) === promesa) mallasEnVuelo.delete(clave);
    }
    if (malla.vertices.length > 0 && malla.triIds.length > 0) {
      mallasHechas.set(clave, copia(malla));
      if (mallasHechas.size > MALLAS_GUARDADAS) mallasHechas.delete(mallasHechas.keys().next().value!);
    }
    return malla;
  }

  private async mallar(piece: PatternPiece, options: { yHeight: number; scale: number; maxEdgeLength: number; minAngle: number; maxRefinementPasses: number; curveResolution: number }, worker: Worker | null): Promise<Malla> {
    // Un cliente suelto no malla: su worker terminado no contesta, y la promesa
    // quedaría en `mallasEnVuelo` hasta el timeout de 30 s, con otros clientes
    // esperándola (las piezas que seguían en la cola de `meshAllPieces`).
    if (this.suelto) throw new Error('Disposed');
    if (!worker) {
      // Fallback: dynamic import + sync execution (yields to event loop via microtask)
      const { meshPiece } = await import('../mesh');
      return meshPiece(piece, options);
    }

    return new Promise((resolve, reject) => {
      this.pendingMesh.set(piece.id, { resolve, reject });
      worker.postMessage({ type: 'meshPiece', piece, options });

      // Timeout: 30s per piece (large pieces at 5mm can generate 5K+ interior points)
      setTimeout(() => {
        if (this.pendingMesh.has(piece.id)) {
          this.pendingMesh.delete(piece.id);
          reject(new Error(`Meshing timeout for piece ${piece.id}`));
        }
      }, 30000);
    });
  }

  /**
   * Mesh all pieces, returning results as they complete.
   */
  async meshAllPieces(
    pieces: PatternPiece[],
    particleDistances: Record<string, number>,
    globalPD: number,
  ): Promise<MeshedPiece[]> {
    // Varias piezas a la vez, cada una en un worker (un worker es un hilo): con
    // la camisa de María, ~8,6 s en fila pasan a lo que tarda la pieza más
    // grande. Las grandes salen primero; el resultado vuelve en el orden de
    // entrada, que fija el orden de los vértices del solver.
    if (this.worker) {
      try {
        while (this.extras.length < workersParaMallar(pieces.length) - 1) this.extras.push(this.nuevoWorker());
      } catch {
        // Sin más workers se malla con los que haya: más lento, igual de bien.
      }
    }
    const workers = this.worker ? [this.worker, ...this.extras] : [null];
    const porMallar = pieces.map((_, i) => i).sort((a, b) => tamanoDe(pieces[b]) - tamanoDe(pieces[a]));
    const mallas: Array<MeshedPiece | null> = pieces.map(() => null);
    let hechas = 0;

    const carril = async (worker: Worker | null) => {
      for (let i = porMallar.shift(); i !== undefined; i = porMallar.shift()) {
        const piece = pieces[i];
        const pd = particleDistances[piece.id] ?? globalPD;
        try {
          const { vertices, triIds, uvs, boundaryOrig } = await this.meshPiece(piece, pd, worker);
          if (vertices.length > 0 && triIds.length > 0) {
            mallas[i] = { pieceId: piece.id, vertices, triIds, uvs, boundaryOrig };
          }
        } catch (err) {
          console.warn(`[SimInitClient] Meshing failed for piece ${piece.id}:`, err);
          pushSolverEvent('meshing:piece-failed', { pieceId: piece.id, message: err instanceof Error ? err.message : String(err) });
        }
        this.onProgress?.({ stage: 'Meshing pieces', current: ++hechas, total: pieces.length });
      }
    };
    await Promise.all(workers.map(carril));
    // Los de más solo sirven mientras se malla: no se quedan vivos y ociosos.
    for (const w of this.extras) w.terminate();
    this.extras = [];

    return mallas.filter((m): m is MeshedPiece => m !== null);
  }

  private rejectAll(error: Error) {
    for (const [, p] of this.pendingMesh) {
      p.reject(error);
    }
    this.pendingMesh.clear();
  }

  /**
   * Apply placement transforms to meshed pieces off the main thread.
   * Falls back to inline math if worker unavailable.
   */
  async applyPlacements(
    pieces: Array<{
      pieceId: string; vertices: number[]; triIds: number[];
      outline: Array<{ type: string; values: number[] }>;
      rotation: [number, number, number];
      position: [number, number, number];
    }>,
  ): Promise<Array<{ pieceId: string; vertices: number[]; triIds: number[]; outline: Array<{ type: string; values: number[] }> }>> {
    // Use a dedicated placement worker
    try {
      const placementWorker = new Worker(
        new URL('./placementWorker.ts', import.meta.url),
        { type: 'module' },
      );

      return new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
          placementWorker.terminate();
          reject(new Error('Placement transform timeout'));
        }, 5000);

        placementWorker.addEventListener('message', (event) => {
          clearTimeout(timeout);
          placementWorker.terminate();
          if (event.data.type === 'transformed') {
            resolve(event.data.pieces);
          } else {
            reject(new Error('Unexpected placement response'));
          }
        });

        placementWorker.addEventListener('error', (e) => {
          clearTimeout(timeout);
          placementWorker.terminate();
          reject(new Error(`Placement worker error: ${e.message}`));
        });

        placementWorker.postMessage({ type: 'transform', pieces });
      });
    } catch {
      // Fallback: inline transforms (pure math, no Three.js)
      return pieces.map(p => {
        const numVerts = p.vertices.length / 3;
        const transformed = new Array<number>(p.vertices.length);
        const [rx, ry, rz] = p.rotation;
        const [px, py, pz] = p.position;
        const cx = Math.cos(rx), sx = Math.sin(rx);
        const cy = Math.cos(ry), sy = Math.sin(ry);
        const cz = Math.cos(rz), sz = Math.sin(rz);

        for (let i = 0; i < numVerts; i++) {
          const vx = p.vertices[i * 3], vy = p.vertices[i * 3 + 1], vz = p.vertices[i * 3 + 2];
          const y1 = vy * cx - vz * sx, z1 = vy * sx + vz * cx;
          const x2 = vx * cy + z1 * sy, z2 = -vx * sy + z1 * cy;
          const x3 = x2 * cz - y1 * sz, y3 = x2 * sz + y1 * cz;
          transformed[i * 3] = x3 + px;
          transformed[i * 3 + 1] = y3 + py;
          transformed[i * 3 + 2] = z2 + pz;
        }
        return { pieceId: p.pieceId, vertices: transformed, triIds: p.triIds, outline: p.outline };
      });
    }
  }

  dispose() {
    this.suelto = true;
    this.worker?.terminate();
    this.worker = null;
    for (const w of this.extras) w.terminate();
    this.extras = [];
    this.rejectAll(new Error('Disposed'));
  }
}
