/**
 * Cloth Simulation Web Worker
 *
 * Runs the XPBD solver in a separate thread to keep the UI at 60fps.
 * Communicates via postMessage with the main thread client.
 *
 * @module clothWorker
 */

import { XPBDClothSolver, type ClothSimConfig, type ClothMeshData, type SphereCollider, type CapsuleCollider } from './xpbdSolver';
import { getComplianceForFabric } from './fabricLibrary';
import { type SDFData } from './sdfGenerator';
import { mergeMeshes, buildSeamConstraints, type MergedMesh } from './seamAssembly';

// ─── Message Protocol ───────────────────────────────────────────────────────

/** Data needed to build seam constraints in the worker */
export interface SeamInitData {
  id: string;
  pieceAId: string;
  pieceAEdgeStart: number;
  pieceAEdgeEnd: number;
  pieceBId: string;
  pieceBEdgeStart: number;
  pieceBEdgeEnd: number;
  type: 'standard' | 'french' | 'flat-felled' | 'overlock';
}

/** Messages sent from main thread → worker */
export type WorkerInMessage =
  | { type: 'init'; meshData: { vertices: number[]; triIds: number[] }; config?: Partial<ClothSimConfig> }
  | { type: 'initMultiPiece'; pieces: Array<{ pieceId: string; vertices: number[]; triIds: number[]; outline: Array<{ type: string; values: number[] }> }>; seams: SeamInitData[]; config?: Partial<ClothSimConfig> }
  | { type: 'setSeams'; seams: SeamInitData[] }
  | { type: 'start' }
  | { type: 'stop' }
  | { type: 'reset' }
  | { type: 'step' }
  | { type: 'setFabric'; fabricId: string }
  | { type: 'setGravity'; gravity: [number, number, number] }
  | { type: 'setConfig'; config: Partial<ClothSimConfig> }
  | { type: 'setSphereColliders'; colliders: SphereCollider[] }
  | { type: 'setCapsuleColliders'; colliders: CapsuleCollider[] }
  | { type: 'setSDF'; sdf: SDFData }
  | { type: 'pinParticle'; index: number }
  | { type: 'unpinParticle'; index: number }
  | { type: 'getEdgeData' };

/** Messages sent from worker → main thread */
export type WorkerOutMessage =
  | { type: 'ready' }
  | { type: 'frame'; positions: Float32Array; numParticles: number; triIds: Int32Array }
  | { type: 'edgeData'; stretchingIds: Int32Array; stretchingLengths: Float32Array }
  | { type: 'stopped' }
  | { type: 'progress'; stage: string }
  | { type: 'error'; message: string };

// ─── Worker State ───────────────────────────────────────────────────────────

let solver: XPBDClothSolver | null = null;
let running = false;
let animFrameId: ReturnType<typeof setTimeout> | null = null;
let cachedMergedMesh: MergedMesh | null = null;
let cachedOutlines: Map<string, Array<{ type: string; values: number[] }>> | null = null;

/** Max time budget per frame in ms. If substeps exceed this, skip remaining. */
const FRAME_BUDGET_MS = 14; // ~60fps target, leave 2ms headroom

/**
 * Run one simulation step and post the result.
 * Respects frame budget — if step takes too long, reduces effective substeps.
 */
function simulationLoop(): void {
  if (!running || !solver) return;

  const t0 = performance.now();
  solver.step();
  const elapsed = performance.now() - t0;

  const snap = solver.getSnapshot();
  const msg: WorkerOutMessage = {
    type: 'frame',
    positions: snap.positions,
    numParticles: snap.numParticles,
    triIds: snap.triIds,
  };

  // Transfer the positions buffer for zero-copy perf
  (self as unknown as Worker).postMessage(msg, [snap.positions.buffer]);

  // Adaptive scheduling: if frame took too long, add delay to prevent backpressure
  const delay = elapsed > FRAME_BUDGET_MS ? Math.min(elapsed, 50) : 1000 / 60;
  animFrameId = setTimeout(simulationLoop, delay);
}

/**
 * Handle messages from the main thread.
 */
self.onmessage = (event: MessageEvent<WorkerInMessage>) => {
  const msg = event.data;

  try {
    switch (msg.type) {
      case 'init': {
        const meshData: ClothMeshData = {
          vertices: new Float32Array(msg.meshData.vertices),
          triIds: new Int32Array(msg.meshData.triIds),
        };
        solver = new XPBDClothSolver(meshData, msg.config);
        cachedMergedMesh = null;
        cachedOutlines = null;
        running = false;
        (self as unknown as Worker).postMessage({ type: 'ready' } satisfies WorkerOutMessage);
        break;
      }

      case 'initMultiPiece': {
        const progress = (stage: string) =>
          (self as unknown as Worker).postMessage({ type: 'progress', stage } satisfies WorkerOutMessage);

        // Merge all pieces into one particle system
        progress('Merging meshes...');
        const pieceMeshes = msg.pieces.map(p => ({
          pieceId: p.pieceId,
          vertices: new Float32Array(p.vertices),
          triIds: new Int32Array(p.triIds),
        }));
        const merged = mergeMeshes(pieceMeshes);
        cachedMergedMesh = merged;

        // Cache outlines for seam building
        const outlines = new Map<string, Array<{ type: string; values: number[] }>>();
        for (const p of msg.pieces) {
          outlines.set(p.pieceId, p.outline);
        }
        cachedOutlines = outlines;

        // Create solver with merged mesh
        progress('Extracting constraints...');
        const mergedMeshData: ClothMeshData = {
          vertices: merged.vertices,
          triIds: merged.triIds,
        };
        solver = new XPBDClothSolver(mergedMeshData, msg.config);

        // Build and set seam constraints
        if (msg.seams.length > 0) {
          progress('Building seam constraints...');
          const seams: import('../../types/types').Seam[] = msg.seams.map(s => ({
            id: s.id,
            pieceA: { pieceId: s.pieceAId, edgeStart: s.pieceAEdgeStart, edgeEnd: s.pieceAEdgeEnd },
            pieceB: { pieceId: s.pieceBId, edgeStart: s.pieceBEdgeStart, edgeEnd: s.pieceBEdgeEnd },
            type: s.type,
          }));
          const outlineMap = new Map<string, import('../../types/types').PathCommand[]>();
          for (const [id, cmds] of outlines) {
            outlineMap.set(id, cmds as import('../../types/types').PathCommand[]);
          }
          const seamSet = buildSeamConstraints(seams, outlineMap, merged);
          solver.setSeamConstraints(seamSet);
        }

        running = false;
        (self as unknown as Worker).postMessage({ type: 'ready' } satisfies WorkerOutMessage);
        break;
      }

      case 'setSeams': {
        if (solver && cachedMergedMesh && cachedOutlines) {
          const seams: import('../../types/types').Seam[] = msg.seams.map(s => ({
            id: s.id,
            pieceA: { pieceId: s.pieceAId, edgeStart: s.pieceAEdgeStart, edgeEnd: s.pieceAEdgeEnd },
            pieceB: { pieceId: s.pieceBId, edgeStart: s.pieceBEdgeStart, edgeEnd: s.pieceBEdgeEnd },
            type: s.type,
          }));
          const outlineMap = new Map<string, import('../../types/types').PathCommand[]>();
          for (const [id, cmds] of cachedOutlines) {
            outlineMap.set(id, cmds as import('../../types/types').PathCommand[]);
          }
          const seamSet = buildSeamConstraints(seams, outlineMap, cachedMergedMesh);
          solver.setSeamConstraints(seamSet);
        }
        break;
      }

      case 'start': {
        if (!solver) {
          (self as unknown as Worker).postMessage({ type: 'error', message: 'Solver not initialized' } satisfies WorkerOutMessage);
          return;
        }
        running = true;
        simulationLoop();
        break;
      }

      case 'stop': {
        running = false;
        if (animFrameId !== null) {
          clearTimeout(animFrameId);
          animFrameId = null;
        }
        (self as unknown as Worker).postMessage({ type: 'stopped' } satisfies WorkerOutMessage);
        break;
      }

      case 'reset': {
        running = false;
        if (animFrameId !== null) {
          clearTimeout(animFrameId);
          animFrameId = null;
        }
        if (solver) {
          solver.reset();
          const snap = solver.getSnapshot();
          const frameMsg: WorkerOutMessage = {
            type: 'frame',
            positions: snap.positions,
            numParticles: snap.numParticles,
            triIds: snap.triIds,
          };
          (self as unknown as Worker).postMessage(frameMsg, [snap.positions.buffer]);
        }
        break;
      }

      case 'step': {
        if (solver) {
          solver.step();
          const snap = solver.getSnapshot();
          const frameMsg: WorkerOutMessage = {
            type: 'frame',
            positions: snap.positions,
            numParticles: snap.numParticles,
            triIds: snap.triIds,
          };
          (self as unknown as Worker).postMessage(frameMsg, [snap.positions.buffer]);
        }
        break;
      }

      case 'setFabric': {
        if (solver) {
          const compliance = getComplianceForFabric(msg.fabricId);
          solver.updateConfig({
            stretchingCompliance: compliance.stretchingCompliance,
            bendingCompliance: compliance.bendingCompliance,
            damping: compliance.damping,
            groundFriction: compliance.groundFriction,
          });
        }
        break;
      }

      case 'setGravity': {
        if (solver) {
          solver.updateConfig({ gravity: msg.gravity });
        }
        break;
      }

      case 'setConfig': {
        if (solver) {
          solver.updateConfig(msg.config);
        }
        break;
      }

      case 'setSphereColliders': {
        if (solver) {
          solver.setSphereColliders(msg.colliders);
        }
        break;
      }

      case 'setCapsuleColliders': {
        if (solver) {
          solver.setCapsuleColliders(msg.colliders);
        }
        break;
      }

      case 'setSDF': {
        if (solver) {
          solver.setSDF(msg.sdf);
        }
        break;
      }

      case 'pinParticle': {
        if (solver) {
          solver.pinParticle(msg.index);
        }
        break;
      }

      case 'unpinParticle': {
        if (solver) {
          solver.unpinParticle(msg.index);
        }
        break;
      }
      case 'getEdgeData': {
        if (solver) {
          const edgeData = solver.getEdgeData();
          const outMsg: WorkerOutMessage = {
            type: 'edgeData',
            stretchingIds: new Int32Array(edgeData.stretchingIds),
            stretchingLengths: new Float32Array(edgeData.stretchingLengths),
          };
          (self as unknown as Worker).postMessage(outMsg, [
            (outMsg as { stretchingIds: Int32Array }).stretchingIds.buffer,
            (outMsg as { stretchingLengths: Float32Array }).stretchingLengths.buffer,
          ]);
        }
        break;
      }
    }
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    (self as unknown as Worker).postMessage({ type: 'error', message: errMsg } satisfies WorkerOutMessage);
  }
};
