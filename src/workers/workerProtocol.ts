/**
 * Worker Protocol
 *
 * Re-exports types from reactiveSolver.ts for the worker context.
 * This provides a clean import interface for workers and ensures
 * only serializable types are used across the thread boundary.
 *
 * @see docs/plans/2026-02-27-reactive-solver-middleware-design.md
 */

// ─── Type Re-exports for Worker Context ─────────────────────────────────────

// Message protocol
export type {
  WorkerCommand,
  WorkerResponse,
  BuildPieceJob,
  BuildPieceResult,
} from '../types/reactiveSolver';

// Serialized types (JSON-safe)
export type {
  CPointSerialized,
  CCurveSerialized,
  CPieceSerialized,
  PathCommandSerialized,
} from '../types/reactiveSolver';

// Transfer strategy types
export type {
  TransferStrategy,
  TransferCapabilities,
} from '../types/reactiveSolver';

// ─── Serialization Helpers Re-exports ───────────────────────────────────────

export {
  // Point encoding/decoding
  encodePoints,
  decodePoints,
  createSharedPointBuffer,
  // Serialization
  serializePoint,
  serializeCurve,
  serializePathCommand,
  serializePiece,
  deserializePiece,
  deserializeOutline,
  // Outline encoding
  encodeOutline,
  decodeOutline,
  // Job preparation
  prepareJobData,
  getTransferList,
  // Capability detection
  detectCapabilities,
  selectStrategy,
} from './arrayBufferCodec';

// ─── Worker Protocol Constants ──────────────────────────────────────────────

/** Commands the main thread can send to workers */
export const WORKER_COMMANDS = {
  BUILD: 'BUILD',
  CANCEL: 'CANCEL',
  WARMUP: 'WARMUP',
  PING: 'PING',
  TERMINATE: 'TERMINATE',
} as const;

/** Responses workers can send to the main thread */
export const WORKER_RESPONSES = {
  RESULT: 'RESULT',
  READY: 'READY',
  WARMED: 'WARMED',
  PONG: 'PONG',
  ERROR: 'ERROR',
} as const;

// ─── Type Guards ─────────────────────────────────────────────────────────────

import type { WorkerCommand, WorkerResponse } from '../types/reactiveSolver';

/** Type guard for WorkerCommand messages */
export function isWorkerCommand(data: unknown): data is WorkerCommand {
  return (
    typeof data === 'object' &&
    data !== null &&
    'type' in data &&
    typeof (data as { type: unknown }).type === 'string' &&
    Object.values(WORKER_COMMANDS).includes(
      (data as { type: string }).type as typeof WORKER_COMMANDS[keyof typeof WORKER_COMMANDS]
    )
  );
}

/** Type guard for WorkerResponse messages */
export function isWorkerResponse(data: unknown): data is WorkerResponse {
  return (
    typeof data === 'object' &&
    data !== null &&
    'type' in data &&
    typeof (data as { type: unknown }).type === 'string' &&
    Object.values(WORKER_RESPONSES).includes(
      (data as { type: string }).type as typeof WORKER_RESPONSES[keyof typeof WORKER_RESPONSES]
    )
  );
}

// ─── Message Creation Helpers ────────────────────────────────────────────────

import type { BuildPieceJob, BuildPieceResult } from '../types/reactiveSolver';

/** Create a BUILD command */
export function createBuildCommand(job: BuildPieceJob): WorkerCommand {
  return { type: 'BUILD', job };
}

/** Create a CANCEL command */
export function createCancelCommand(generationId: number): WorkerCommand {
  return { type: 'CANCEL', generationId };
}

/** Create a WARMUP command */
export function createWarmupCommand(): WorkerCommand {
  return { type: 'WARMUP' };
}

/** Create a PING command */
export function createPingCommand(): WorkerCommand {
  return { type: 'PING' };
}

/** Create a TERMINATE command */
export function createTerminateCommand(): WorkerCommand {
  return { type: 'TERMINATE' };
}

/** Create a RESULT response */
export function createResultResponse(result: BuildPieceResult): WorkerResponse {
  return { type: 'RESULT', result };
}

/** Create a READY response */
export function createReadyResponse(): WorkerResponse {
  return { type: 'READY' };
}

/** Create a WARMED response */
export function createWarmedResponse(): WorkerResponse {
  return { type: 'WARMED' };
}

/** Create a PONG response */
export function createPongResponse(): WorkerResponse {
  return { type: 'PONG' };
}

/** Create an ERROR response */
export function createErrorResponse(error: string, jobId?: string): WorkerResponse {
  return { type: 'ERROR', error, jobId };
}
