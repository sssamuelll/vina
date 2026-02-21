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

// ─── Message Protocol ───────────────────────────────────────────────────────

/** Messages sent from main thread → worker */
export type WorkerInMessage =
  | { type: 'init'; meshData: { vertices: number[]; triIds: number[] }; config?: Partial<ClothSimConfig> }
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
  | { type: 'unpinParticle'; index: number };

/** Messages sent from worker → main thread */
export type WorkerOutMessage =
  | { type: 'ready' }
  | { type: 'frame'; positions: Float32Array; numParticles: number; triIds: Int32Array }
  | { type: 'stopped' }
  | { type: 'error'; message: string };

// ─── Worker State ───────────────────────────────────────────────────────────

let solver: XPBDClothSolver | null = null;
let running = false;
let animFrameId: ReturnType<typeof setTimeout> | null = null;

/**
 * Run one simulation step and post the result.
 */
function simulationLoop(): void {
  if (!running || !solver) return;

  solver.step();

  const snap = solver.getSnapshot();
  const msg: WorkerOutMessage = {
    type: 'frame',
    positions: snap.positions,
    numParticles: snap.numParticles,
    triIds: snap.triIds,
  };

  // Transfer the positions buffer for zero-copy perf
  (self as unknown as Worker).postMessage(msg, [snap.positions.buffer]);

  // Schedule next step at ~60fps
  animFrameId = setTimeout(simulationLoop, 1000 / 60);
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
        running = false;
        (self as unknown as Worker).postMessage({ type: 'ready' } satisfies WorkerOutMessage);
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
    }
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    (self as unknown as Worker).postMessage({ type: 'error', message: errMsg } satisfies WorkerOutMessage);
  }
};
