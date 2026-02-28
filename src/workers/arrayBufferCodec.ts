/**
 * ArrayBuffer Codec for Worker Communication
 *
 * Provides encoding/decoding utilities for zero-copy data transfer between
 * the main thread and worker pool. Includes capability detection and
 * adaptive strategy selection based on data size.
 *
 * @see docs/plans/2026-02-27-reactive-solver-middleware-design.md
 */

import type {
  TransferCapabilities,
  TransferStrategy,
  CPointSerialized,
  CCurveSerialized,
  CPieceSerialized,
  PathCommandSerialized,
  EncodedPoints,
} from '../types/reactiveSolver';
import type { CPoint, CCurve, CPiece } from '../types/construction';
import type { PathCommand } from '../types/types';

// Re-export thresholds for convenience
export { TRANSFERABLE_THRESHOLD, SHARED_BUFFER_THRESHOLD } from '../types/reactiveSolver';

// ─── Capability Detection ────────────────────────────────────────────────────

/**
 * Detect browser capabilities for transfer strategy optimization.
 *
 * SharedArrayBuffer requires Cross-Origin-Opener-Policy: same-origin
 * and Cross-Origin-Embedder-Policy: require-corp headers.
 */
export function detectCapabilities(): TransferCapabilities {
  const hasWorker = typeof Worker !== 'undefined';
  const hasArrayBuffer = typeof ArrayBuffer !== 'undefined';

  // SharedArrayBuffer requires crossOriginIsolated context
  const hasSharedArrayBuffer =
    typeof SharedArrayBuffer !== 'undefined' &&
    (typeof crossOriginIsolated !== 'undefined' ? crossOriginIsolated : false);

  return {
    sharedArrayBuffer: hasSharedArrayBuffer,
    transferable: hasArrayBuffer,
    workerSupport: hasWorker,
    hardwareConcurrency:
      typeof navigator !== 'undefined'
        ? navigator.hardwareConcurrency || 2
        : 2,
  };
}

/**
 * Select the optimal transfer strategy based on capabilities and data size.
 *
 * Strategy selection:
 * - SharedArrayBuffer: > 500 points AND available (fastest, zero-copy)
 * - Transferable: > 200 points AND available (fast, zero-copy)
 * - StructuredClone: <= 200 points (simpler, low overhead for small data)
 * - MainThread: no Worker support (fallback)
 */
export function selectStrategy(
  capabilities: TransferCapabilities,
  pointCount: number
): TransferStrategy {
  // No worker support - must run on main thread
  if (!capabilities.workerSupport) {
    return 'mainThread';
  }

  // Large datasets - use SharedArrayBuffer if available
  if (pointCount >= 500 && capabilities.sharedArrayBuffer) {
    return 'sharedArrayBuffer';
  }

  // Medium datasets - use Transferable
  if (pointCount >= 200 && capabilities.transferable) {
    return 'transferable';
  }

  // Small datasets - structured clone is simpler and fast enough
  return 'structuredClone';
}

// ─── Point Encoding/Decoding ─────────────────────────────────────────────────

/**
 * Encode CPoint array into Float64Array for zero-copy transfer.
 *
 * Layout: [x0, y0, x1, y1, x2, y2, ...]
 * IDs are passed separately to avoid hash collision issues.
 */
export function encodePoints(points: CPoint[]): EncodedPoints {
  const coords = new Float64Array(points.length * 2);
  const ids: string[] = new Array(points.length);

  for (let i = 0; i < points.length; i++) {
    const p = points[i];
    coords[i * 2] = p.x;
    coords[i * 2 + 1] = p.y;
    ids[i] = p.id;
  }

  return { coords, ids };
}

/**
 * Decode Float64Array back into CPointSerialized array.
 */
export function decodePoints(
  coords: Float64Array | ArrayBuffer,
  ids: string[]
): CPointSerialized[] {
  const floats = coords instanceof Float64Array
    ? coords
    : new Float64Array(coords);

  const points: CPointSerialized[] = new Array(ids.length);

  for (let i = 0; i < ids.length; i++) {
    points[i] = {
      id: ids[i],
      label: ids[i], // Label typically equals ID in serialized form
      x: floats[i * 2],
      y: floats[i * 2 + 1],
    };
  }

  return points;
}

/**
 * Create a SharedArrayBuffer for points (when available).
 * Must be called on main thread before posting to worker.
 */
export function createSharedPointBuffer(points: CPoint[]): SharedArrayBuffer {
  const byteLength = points.length * 2 * Float64Array.BYTES_PER_ELEMENT;
  const sharedBuffer = new SharedArrayBuffer(byteLength);
  const view = new Float64Array(sharedBuffer);

  for (let i = 0; i < points.length; i++) {
    view[i * 2] = points[i].x;
    view[i * 2 + 1] = points[i].y;
  }

  return sharedBuffer;
}

// ─── Serialization Helpers ───────────────────────────────────────────────────

/**
 * Serialize a CPoint for JSON transfer (structuredClone strategy).
 */
export function serializePoint(point: CPoint): CPointSerialized {
  return {
    id: point.id,
    label: point.label,
    x: point.x,
    y: point.y,
  };
}

/**
 * Serialize a CCurve for JSON transfer.
 */
export function serializeCurve(curve: CCurve): CCurveSerialized {
  return {
    id: curve.id,
    label: curve.label,
    definition: curve.definition,
    resolvedCommands: curve.resolvedCommands?.map(serializePathCommand),
  };
}

/**
 * Serialize a PathCommand.
 */
export function serializePathCommand(cmd: PathCommand): PathCommandSerialized {
  return {
    type: cmd.type as PathCommandSerialized['type'],
    values: [...cmd.values],
  };
}

/**
 * Deserialize PathCommands back to full PathCommand objects.
 */
export function deserializeOutline(commands: PathCommandSerialized[]): PathCommand[] {
  return commands.map(cmd => ({
    type: cmd.type,
    values: [...cmd.values],
  }));
}

/**
 * Serialize a CPiece by flattening its PieceNode structure.
 * This avoids complex nested references that could cause issues with serialization.
 */
export function serializePiece(piece: CPiece): CPieceSerialized {
  const nodeCount = piece.nodes.length;
  const nodePointIds: string[] = new Array(nodeCount);
  const nodeCurveIds: (string | null)[] = new Array(nodeCount);
  const nodeConnections: ('line' | 'curve')[] = new Array(nodeCount);
  const nodeReverse: boolean[] = new Array(nodeCount);

  for (let i = 0; i < nodeCount; i++) {
    const node = piece.nodes[i];
    nodePointIds[i] = node.pointId;
    nodeCurveIds[i] = node.curveId || null;
    nodeConnections[i] = node.connection;
    nodeReverse[i] = node.reverse || false;
  }

  return {
    id: piece.id,
    name: piece.name,
    nodePointIds,
    nodeCurveIds,
    nodeConnections,
    nodeReverse,
    seamAllowance: piece.seamAllowance,
    closed: piece.closed,
  };
}

/**
 * Deserialize CPieceSerialized back to CPiece structure (for worker usage).
 */
export function deserializePiece(serialized: CPieceSerialized): CPiece {
  const nodes = serialized.nodePointIds.map((pointId, i) => ({
    pointId,
    connection: serialized.nodeConnections[i],
    curveId: serialized.nodeCurveIds[i] || undefined,
    reverse: serialized.nodeReverse[i],
  }));

  return {
    id: serialized.id,
    name: serialized.name,
    nodes,
    seamAllowance: serialized.seamAllowance,
    closed: serialized.closed,
  };
}

// ─── Outline Encoding (for result transfer) ──────────────────────────────────

/**
 * Encode PathCommand array into Float64Array for transfer.
 *
 * Layout: [type, valueCount, ...values, type, valueCount, ...values, ...]
 * Type encoding: M=0, L=1, C=2, Q=3, Z=4
 */
const TYPE_MAP: Record<string, number> = { M: 0, L: 1, C: 2, Q: 3, Z: 4 };
const REVERSE_TYPE_MAP: Record<number, PathCommandSerialized['type']> = {
  0: 'M', 1: 'L', 2: 'C', 3: 'Q', 4: 'Z',
};

export function encodeOutline(commands: PathCommand[]): Float64Array {
  // Calculate total size needed
  let totalSize = 0;
  for (const cmd of commands) {
    totalSize += 2 + cmd.values.length; // type + valueCount + values
  }

  const buffer = new Float64Array(totalSize);
  let offset = 0;

  for (const cmd of commands) {
    buffer[offset++] = TYPE_MAP[cmd.type] ?? 4; // Default to Z if unknown
    buffer[offset++] = cmd.values.length;
    for (const val of cmd.values) {
      buffer[offset++] = val;
    }
  }

  return buffer;
}

export function decodeOutline(buffer: Float64Array): PathCommandSerialized[] {
  const commands: PathCommandSerialized[] = [];
  let offset = 0;

  while (offset < buffer.length) {
    const type = REVERSE_TYPE_MAP[buffer[offset++]] || 'Z';
    const valueCount = buffer[offset++];
    const values: number[] = new Array(valueCount);

    for (let i = 0; i < valueCount; i++) {
      values[i] = buffer[offset++];
    }

    commands.push({ type, values });
  }

  return commands;
}

// ─── Batch Encoding ──────────────────────────────────────────────────────────

/**
 * Prepare job data based on selected strategy.
 * Returns the appropriate data format for the strategy.
 */
export function prepareJobData(
  points: CPoint[],
  strategy: TransferStrategy
): {
  points: CPointSerialized[];
  pointsBuffer?: ArrayBuffer;
  pointsShared?: SharedArrayBuffer;
  pointIds?: string[];
} {
  switch (strategy) {
    case 'sharedArrayBuffer': {
      const ids = points.map(p => p.id);
      return {
        points: [],
        pointsShared: createSharedPointBuffer(points),
        pointIds: ids,
      };
    }
    case 'transferable': {
      const encoded = encodePoints(points);
      return {
        points: [],
        pointsBuffer: encoded.coords.buffer,
        pointIds: encoded.ids,
      };
    }
    case 'structuredClone':
    case 'mainThread':
    default:
      return {
        points: points.map(serializePoint),
      };
  }
}

/**
 * Extract transfer list for postMessage (Transferable objects).
 */
export function getTransferList(
  pointsBuffer?: ArrayBuffer
): Transferable[] {
  if (pointsBuffer) {
    return [pointsBuffer];
  }
  return [];
}
