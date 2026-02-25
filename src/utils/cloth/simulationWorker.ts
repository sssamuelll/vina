/**
 * Simulation Init Worker — offloads heavy meshing + SDF computation from main thread.
 *
 * Runs CDT meshing, placement transforms, and SDF generation in a Web Worker
 * so the UI never freezes during simulation startup.
 *
 * @module simulationWorker
 */

import { meshPiece } from '../mesh';
import { generateSDF, type SDFData } from './sdfGenerator';
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
  error?: string;
}

export interface SDFRequest {
  type: 'generateSDF';
  vertices: Float32Array;
  indices: Uint32Array;
  resolution: number;
}

export interface SDFResponse {
  type: 'sdfResult';
  sdf: SDFData | null;
  error?: string;
}

export interface ProgressMessage {
  type: 'progress';
  stage: string;
  current: number;
  total: number;
}

export type WorkerRequest = MeshPieceRequest | SDFRequest;
export type WorkerResponse = MeshPieceResponse | SDFResponse | ProgressMessage;

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
      };
      ctx.postMessage(response, [result.vertices.buffer, result.triIds.buffer]);
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

  if (msg.type === 'generateSDF') {
    try {
      const sdf = generateSDF(msg.vertices, msg.indices, msg.resolution);
      const response: SDFResponse = {
        type: 'sdfResult',
        sdf,
      };
      if (sdf) {
        ctx.postMessage(response, [sdf.distances.buffer]);
      } else {
        ctx.postMessage(response);
      }
    } catch (err) {
      const response: SDFResponse = {
        type: 'sdfResult',
        sdf: null,
        error: String(err),
      };
      ctx.postMessage(response);
    }
  }
});
