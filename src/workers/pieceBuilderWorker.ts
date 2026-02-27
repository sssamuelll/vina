/**
 * Piece Builder Worker
 *
 * Web Worker that builds PatternPieces from construction data off the main thread.
 * Handles BUILD, WARMUP, CANCEL, PING, and TERMINATE commands.
 *
 * Protocol:
 * - Main → Worker: WorkerCommand messages
 * - Worker → Main: WorkerResponse messages
 *
 * @see docs/plans/2026-02-27-reactive-solver-middleware-design.md
 */

import type {
  WorkerCommand,
  BuildPieceJob,
  BuildPieceResult,
  CPointSerialized,
  CCurveSerialized,
  PathCommandSerialized,
} from './workerProtocol';

import {
  decodePoints,
  deserializePiece,
  serializePathCommand,
  createResultResponse,
  createReadyResponse,
  createWarmedResponse,
  createPongResponse,
  createErrorResponse,
} from './workerProtocol';

// ─── Worker State ────────────────────────────────────────────────────────────

/** Set of cancelled generation IDs - discard results for these */
const cancelledGenerations = new Set<number>();

/** Flag indicating buildPiece is loaded and ready */
let isWarmedUp = false;

/** Lazily loaded buildPiece function */
let buildPieceFn: typeof import('../utils/construction/pieceBuilder').buildPieceWithOffset | null = null;

// ─── Lazy Module Loading ─────────────────────────────────────────────────────

/**
 * Lazily import the buildPiece function.
 * This allows the worker to send READY immediately, then WARMED after import.
 */
async function loadBuildPiece(): Promise<void> {
  if (buildPieceFn) return;

  const module = await import('../utils/construction/pieceBuilder');
  buildPieceFn = module.buildPieceWithOffset;
  isWarmedUp = true;
}

// ─── Message Handler ─────────────────────────────────────────────────────────

/**
 * Handle incoming messages from the main thread.
 */
self.onmessage = async (event: MessageEvent<WorkerCommand>) => {
  const command = event.data;

  try {
    switch (command.type) {
      case 'WARMUP':
        await handleWarmup();
        break;

      case 'BUILD':
        await handleBuild(command.job);
        break;

      case 'CANCEL':
        handleCancel(command.generationId);
        break;

      case 'PING':
        self.postMessage(createPongResponse());
        break;

      case 'TERMINATE':
        self.close();
        break;

      default:
        // Unknown command - log and ignore
        console.warn('[Worker] Unknown command:', (command as { type: string }).type);
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    self.postMessage(createErrorResponse(message));
  }
};

// ─── Command Handlers ────────────────────────────────────────────────────────

/**
 * Handle WARMUP command - pre-import dependencies for faster BUILD.
 */
async function handleWarmup(): Promise<void> {
  if (isWarmedUp) {
    self.postMessage(createWarmedResponse());
    return;
  }

  await loadBuildPiece();
  self.postMessage(createWarmedResponse());
}

/**
 * Handle BUILD command - build a piece and return the result.
 */
async function handleBuild(job: BuildPieceJob): Promise<void> {
  const startTime = performance.now();

  // Check if this generation was cancelled before we start
  if (cancelledGenerations.has(job.generationId)) {
    // Silently discard - don't send result or error
    return;
  }

  // Ensure buildPiece is loaded
  if (!buildPieceFn) {
    await loadBuildPiece();
  }

  // Reconstruct points from the appropriate format
  let points: CPointSerialized[];

  if (job.pointsBuffer) {
    // Transferable ArrayBuffer format
    points = decodePoints(job.pointsBuffer, job.pointIds!);
  } else if (job.pointsShared) {
    // SharedArrayBuffer format
    const view = new Float64Array(job.pointsShared);
    points = decodePoints(view, job.pointIds!);
  } else {
    // StructuredClone format - already have serialized points
    points = job.points;
  }

  // Check cancellation again after potentially slow decode
  if (cancelledGenerations.has(job.generationId)) {
    return;
  }

  try {
    // Deserialize the piece definition
    const cPiece = deserializePiece(job.cPiece);

    // Convert serialized points to CPoint format for buildPiece
    const cPoints = points.map(p => ({
      id: p.id,
      label: p.label,
      x: p.x,
      y: p.y,
      definition: { type: 'manual' as const, x: p.x, y: p.y },
      visible: true,
    }));

    // Reconstruct curves
    const cCurves = job.curves.map((c: CCurveSerialized) => ({
      id: c.id,
      label: c.label,
      definition: c.definition,
      visible: true,
      resolvedCommands: c.resolvedCommands?.map(cmd => ({
        type: cmd.type,
        values: [...cmd.values],
      })),
    }));

    // Create formula context (empty for now - measurements already resolved)
    const ctx = {
      measurements: {},
      variables: {},
      points: {},
    };

    // Build the piece
    const { piece } = buildPieceFn!(
      cPiece,
      cPoints,
      cCurves,
      ctx,
      job.existingPieceId || undefined
    );

    // Check cancellation before sending result
    if (cancelledGenerations.has(job.generationId)) {
      return;
    }

    const endTime = performance.now();

    // Serialize the result
    const result: BuildPieceResult = {
      jobId: job.jobId,
      generationId: job.generationId,
      pieceId: piece.id,
      cPieceId: job.cPiece.id,
      outline: piece.outline.map(serializePathCommand) as PathCommandSerialized[],
      position: piece.position,
      success: true,
      metrics: {
        computeTimeMs: endTime - startTime,
        pointCount: points.length,
        curveCount: job.curves.length,
      },
    };

    self.postMessage(createResultResponse(result));
  } catch (error) {
    // Check cancellation before sending error
    if (cancelledGenerations.has(job.generationId)) {
      return;
    }

    const endTime = performance.now();
    const message = error instanceof Error ? error.message : String(error);

    const result: BuildPieceResult = {
      jobId: job.jobId,
      generationId: job.generationId,
      pieceId: job.existingPieceId || '',
      cPieceId: job.cPiece.id,
      outline: [],
      position: { x: 0, y: 0 },
      success: false,
      error: message,
      metrics: {
        computeTimeMs: endTime - startTime,
        pointCount: points.length,
        curveCount: job.curves.length,
      },
    };

    self.postMessage(createResultResponse(result));
  }
}

/**
 * Handle CANCEL command - mark generation as cancelled.
 * Results for this generation will be discarded.
 */
function handleCancel(generationId: number): void {
  cancelledGenerations.add(generationId);

  // Clean up old generation IDs to prevent memory leak
  // Keep only recent 100 cancelled generations
  if (cancelledGenerations.size > 100) {
    const toRemove = Array.from(cancelledGenerations)
      .sort((a, b) => a - b)
      .slice(0, cancelledGenerations.size - 100);

    for (const id of toRemove) {
      cancelledGenerations.delete(id);
    }
  }
}

// ─── Worker Ready ────────────────────────────────────────────────────────────

// Send READY immediately - warmup can happen later
self.postMessage(createReadyResponse());
