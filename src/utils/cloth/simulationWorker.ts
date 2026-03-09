/**
 * Simulation Init Worker — offloads heavy meshing from main thread.
 *
 * Runs CDT meshing and placement transforms in a Web Worker so the UI
 * never freezes during simulation startup.
 *
 * @module simulationWorker
 */

import { meshPiece } from '../mesh';
import type { PatternPiece } from '../../types/types';

// ─── Message Types ──────────────────────────────────────────────────────────

export interface MeshPieceRequest {
  type: 'meshPiece';
  piece: PatternPiece;
  options: {
    yHeight: number;
    scale: number;
    maxEdgeLength: number;
    minAngle: number;
    maxRefinementPasses: number;
    curveResolution: number;
  };
}

export interface MeshPieceResponse {
  type: 'meshPieceResult';
  pieceId: string;
  vertices: Float32Array;
  triIds: Int32Array;
  uvs?: Float32Array;
  error?: string;
}

export interface ProgressMessage {
  type: 'progress';
  stage: string;
  current: number;
  total: number;
}

export type WorkerRequest = MeshPieceRequest;
export type WorkerResponse = MeshPieceResponse | ProgressMessage;

// ─── Worker Handler ─────────────────────────────────────────────────────────

const ctx = self as unknown as Worker;

ctx.addEventListener('message', (event: MessageEvent<WorkerRequest>) => {
  const msg = event.data;

  if (msg.type === 'meshPiece') {
    try {
      const result = meshPiece(msg.piece, msg.options);
      const response: MeshPieceResponse = {
        type: 'meshPieceResult',
        pieceId: msg.piece.id,
        vertices: result.vertices,
        triIds: result.triIds,
        uvs: result.uvs,
      };
      const transfers: ArrayBuffer[] = [result.vertices.buffer, result.triIds.buffer];
      if (result.uvs) transfers.push(result.uvs.buffer);
      ctx.postMessage(response, transfers);
    } catch (err) {
      const response: MeshPieceResponse = {
        type: 'meshPieceResult',
        pieceId: msg.piece.id,
        vertices: new Float32Array(0),
        triIds: new Int32Array(0),
        error: String(err),
      };
      ctx.postMessage(response);
    }
  }

});
