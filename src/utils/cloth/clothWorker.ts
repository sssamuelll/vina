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
import { mergeMeshes, buildSeamConstraints, type MergedMesh } from './seamAssembly';

// ─── Message Protocol ───────────────────────────────────────────────────────

/** Data needed to build seam constraints in the worker */
export interface SeamInitData {
  id: string;
  pieceAId: string;
  pieceAEdgeName: string;
  pieceBId: string;
  pieceBEdgeName: string;
  type: 'standard' | 'french' | 'flat-felled' | 'overlock';
  /** t-parameter range on piece A side (partial-edge sewing) */
  pieceARange?: [number, number];
  /** t-parameter range on piece B side (partial-edge sewing) */
  pieceBRange?: [number, number];
  /** Tension applied to seam (0-200, default 100) */
  tension: number;
  /** Strength of the seam bond (0-1, default 1.0) */
  strength: number;
  /** Whether this seam participates in simulation */
  active: boolean;
  /** Whether seam tape is applied */
  taped: boolean;
}

/** Messages sent from main thread → worker */
export type WorkerInMessage =
  | { type: 'init'; meshData: { vertices: Float32Array; triIds: Int32Array }; config?: Partial<ClothSimConfig> }
  | { type: 'initMultiPiece'; pieces: Array<{ pieceId: string; vertices: Float32Array; triIds: Int32Array; outline: Array<{ type: string; values: number[] }>; edges?: Array<{ name: string; segmentRange: [number, number] }> }>; seams: SeamInitData[]; config?: Partial<ClothSimConfig> }
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
  | { type: 'setCollisionMesh'; mesh: { vertices: Float32Array; normals: Float32Array; triCount: number } }
  | { type: 'setCollisionBodies'; bodies: Array<{ id: string; mesh: { vertices: Float32Array; normals: Float32Array; triCount: number }; friction: number; margin: number }> }
  | { type: 'updateCollisionBody'; id: string; mesh: { vertices: Float32Array; normals: Float32Array; triCount: number }; friction: number; margin: number }
  | { type: 'removeCollisionBody'; id: string }
  | { type: 'pinParticle'; index: number }
  | { type: 'unpinParticle'; index: number }
  | { type: 'getEdgeData' }
  | { type: 'saveSnapshot'; id: string }
  | { type: 'restoreSnapshot'; id: string }
  | { type: 'deleteSnapshot'; id: string }
  | { type: 'warmStart'; positions: Float32Array }
  | { type: 'updateConstraints'; restLengths: Float32Array };

/** Messages sent from worker → main thread */
export type WorkerOutMessage =
  | { type: 'ready' }
  | { type: 'frame'; positions: Float32Array; numParticles: number; triIds: Int32Array }
  | { type: 'edgeData'; stretchingIds: Int32Array; stretchingLengths: Float32Array }
  | { type: 'stopped' }
  | { type: 'progress'; stage: string }
  | { type: 'error'; message: string }
  | { type: 'snapshotSaved'; id: string; particleCount: number }
  | { type: 'snapshotRestored'; id: string }
  | { type: 'snapshotDeleted'; id: string }
  | { type: 'constraintsUpdated' };

// ─── Worker State ───────────────────────────────────────────────────────────

let solver: XPBDClothSolver | null = null;
let running = false;
let animFrameId: ReturnType<typeof setTimeout> | null = null;
let cachedMergedMesh: MergedMesh | null = null;
let cachedOutlines: Map<string, Array<{ type: string; values: number[] }>> | null = null;
let cachedPieceEdges: Map<string, { edges?: Array<{ name: string; segmentRange: [number, number] }> }> | null = null;

/** Snapshot storage: id → copy of particle positions */
const snapshots = new Map<string, Float32Array>();
const MAX_SNAPSHOTS = 5; // 1 auto pre-edit + 3 manual + 1 buffer

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
        cachedPieceEdges = null;
        running = false;
        (self as unknown as Worker).postMessage({ type: 'ready' } satisfies WorkerOutMessage);
        break;
      }

      case 'initMultiPiece': {
        const progress = (stage: string) =>
          (self as unknown as Worker).postMessage({ type: 'progress', stage } satisfies WorkerOutMessage);

        // Merge all pieces into one particle system
        progress('Merging meshes...');
        // Ensure inputs are typed arrays
        const pieceMeshes = msg.pieces.map(p => ({
          pieceId: p.pieceId,
          vertices: new Float32Array(p.vertices),
          triIds: new Int32Array(p.triIds),
        }));
        const merged = mergeMeshes(pieceMeshes);
        cachedMergedMesh = merged;

        // Cache outlines and edges for seam building
        const outlines = new Map<string, Array<{ type: string; values: number[] }>>();
        const pieceEdges = new Map<string, { edges?: Array<{ name: string; segmentRange: [number, number] }> }>();
        for (const p of msg.pieces) {
          outlines.set(p.pieceId, p.outline);
          pieceEdges.set(p.pieceId, { edges: p.edges });
        }
        cachedOutlines = outlines;
        cachedPieceEdges = pieceEdges;

        // Create solver with merged mesh
        progress('Extracting constraints...');
        const mergedMeshData: ClothMeshData = {
          vertices: merged.vertices,
          triIds: merged.triIds,
        };
        solver = new XPBDClothSolver(mergedMeshData, msg.config);

        // Build and set seam constraints
        // Filter to only active seams
        const activeSeams = msg.seams.filter(s => s.active !== false);
        if (activeSeams.length > 0) {
          progress('Building seam constraints...');
          const seams: import('../../types/types').Seam[] = activeSeams.map(s => ({
            id: s.id,
            pieceA: { pieceId: s.pieceAId, edgeName: s.pieceAEdgeName, tStart: s.pieceARange?.[0], tEnd: s.pieceARange?.[1] },
            pieceB: { pieceId: s.pieceBId, edgeName: s.pieceBEdgeName, tStart: s.pieceBRange?.[0], tEnd: s.pieceBRange?.[1] },
            type: s.type,
            tension: s.tension ?? 100,
            strength: s.strength ?? 1.0,
            active: true,
            taped: s.taped ?? false,
            tapeWidth: 10,
          }));
          const outlineMap = new Map<string, import('../../types/types').PathCommand[]>();
          for (const [id, cmds] of outlines) {
            outlineMap.set(id, cmds as import('../../types/types').PathCommand[]);
          }
          const seamSet = buildSeamConstraints(seams, outlineMap, merged, pieceEdges);
          solver.setSeamConstraints(seamSet);
        }

        running = false;
        (self as unknown as Worker).postMessage({ type: 'ready' } satisfies WorkerOutMessage);
        break;
      }

      case 'setSeams': {
        if (solver && cachedMergedMesh && cachedOutlines) {
          // Filter to only active seams
          const activeSeams = msg.seams.filter(s => s.active !== false);
          const seams: import('../../types/types').Seam[] = activeSeams.map(s => ({
            id: s.id,
            pieceA: { pieceId: s.pieceAId, edgeName: s.pieceAEdgeName, tStart: s.pieceARange?.[0], tEnd: s.pieceARange?.[1] },
            pieceB: { pieceId: s.pieceBId, edgeName: s.pieceBEdgeName, tStart: s.pieceBRange?.[0], tEnd: s.pieceBRange?.[1] },
            type: s.type,
            tension: s.tension ?? 100,
            strength: s.strength ?? 1.0,
            active: true,
            taped: s.taped ?? false,
            tapeWidth: 10,
          }));
          const outlineMap = new Map<string, import('../../types/types').PathCommand[]>();
          for (const [id, cmds] of cachedOutlines) {
            outlineMap.set(id, cmds as import('../../types/types').PathCommand[]);
          }
          const seamSet = buildSeamConstraints(seams, outlineMap, cachedMergedMesh, cachedPieceEdges ?? undefined);
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

      case 'setCollisionMesh': {
        if (solver) {
          solver.setCollisionMesh(msg.mesh);
        }
        break;
      }

      case 'setCollisionBodies': {
        if (solver) {
          solver.setCollisionBodies(msg.bodies);
        }
        break;
      }

      case 'updateCollisionBody': {
        if (solver) {
          solver.updateCollisionBody(msg.id, msg.mesh, msg.friction, msg.margin);
        }
        break;
      }

      case 'removeCollisionBody': {
        if (solver) {
          solver.removeCollisionBody(msg.id);
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

      case 'saveSnapshot': {
        if (solver) {
          const positions = new Float32Array(solver.pos);
          snapshots.set(msg.id, positions);
          // Evict oldest if over limit
          if (snapshots.size > MAX_SNAPSHOTS) {
            const oldest = snapshots.keys().next().value;
            if (oldest !== undefined) snapshots.delete(oldest);
          }
          (self as unknown as Worker).postMessage({
            type: 'snapshotSaved',
            id: msg.id,
            particleCount: solver.numParticles,
          } satisfies WorkerOutMessage);
        }
        break;
      }

      case 'restoreSnapshot': {
        if (solver) {
          const saved = snapshots.get(msg.id);
          if (saved && saved.length === solver.pos.length) {
            solver.pos.set(saved);
            solver.prevPos.set(saved);
            solver.vel.fill(0);
            (self as unknown as Worker).postMessage({
              type: 'snapshotRestored',
              id: msg.id,
            } satisfies WorkerOutMessage);
            // Send frame with restored positions
            const snap = solver.getSnapshot();
            (self as unknown as Worker).postMessage(
              { type: 'frame', positions: snap.positions, numParticles: snap.numParticles, triIds: snap.triIds } satisfies WorkerOutMessage,
              [snap.positions.buffer],
            );
          }
        }
        break;
      }

      case 'deleteSnapshot': {
        snapshots.delete(msg.id);
        (self as unknown as Worker).postMessage({
          type: 'snapshotDeleted',
          id: msg.id,
        } satisfies WorkerOutMessage);
        break;
      }

      case 'warmStart': {
        if (solver) {
          const incoming = new Float32Array(msg.positions);
          // If same particle count, restore directly; otherwise ignore (topology changed)
          if (incoming.length === solver.pos.length) {
            solver.pos.set(incoming);
            solver.prevPos.set(incoming);
            solver.vel.fill(0);
          }
        }
        break;
      }

      case 'updateConstraints': {
        if (solver) {
          solver.updateRestLengths(msg.restLengths);
          (self as unknown as Worker).postMessage(
            { type: 'constraintsUpdated' } satisfies WorkerOutMessage,
          );
          // Send a frame with current positions so rendering updates
          const snap = solver.getSnapshot();
          (self as unknown as Worker).postMessage(
            { type: 'frame', ...snap } satisfies WorkerOutMessage,
            [snap.positions.buffer],
          );
        }
        break;
      }
    }
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    (self as unknown as Worker).postMessage({ type: 'error', message: errMsg } satisfies WorkerOutMessage);
  }
};
