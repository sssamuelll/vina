/**
 * Wasm XPBD Solver Worker — runs Rust Wasm solver off the main thread.
 *
 * @module wasmSolverWorker
 */

import { extractStretchConstraints, extractBendConstraints } from '../gpu/gpuBuffers';

// ─── Types ──────────────────────────────────────────────────────────────────

interface WasmModule {
  default: (input?: RequestInfo | URL) => Promise<void>;
  XpbdSolver: new (positions: Float32Array, invMass: Float32Array) => WasmXpbdSolver;
}

interface WasmXpbdSolver {
  set_stretch(ids: Uint32Array, rest: Float32Array): void;
  set_bend(ids: Uint32Array, rest: Float32Array): void;
  set_seams(ids: Uint32Array, target: Float32Array): void;
  set_sdf(data: Float32Array, resolution: number, minX: number, minY: number, minZ: number, cellSize: number): void;
  set_adjacency(offsets: Uint32Array, neighbors: Uint32Array): void;
  configure(substeps: number, damping: number, gravityY: number,
            stretchCompliance: number, bendCompliance: number,
            selfCollision: boolean, thickness: number, collisionMargin: number): void;
  step(dt: number): void;
  positions_ptr(): number;
  num_particles(): number;
  free(): void;
}

// ─── Worker State ───────────────────────────────────────────────────────────

let solver: WasmXpbdSolver | null = null;
let wasmMemory: WebAssembly.Memory | null = null;
let numParticles = 0;
let running = false;
let animFrameId: ReturnType<typeof setTimeout> | null = null;

const FRAME_BUDGET_MS = 14;

function simulationLoop(): void {
  if (!running || !solver) return;

  const t0 = performance.now();
  solver.step(1 / 60);
  const elapsed = performance.now() - t0;

  // Read positions
  const n = numParticles;
  let positions: Float32Array;

  if (wasmMemory) {
    const ptr = solver.positions_ptr();
    positions = new Float32Array(wasmMemory.buffer, ptr, n * 3).slice(); // copy — buffer may detach
  } else {
    positions = new Float32Array(n * 3);
  }

  (self as unknown as Worker).postMessage(
    { type: 'frame', positions },
    [positions.buffer],
  );

  const delay = elapsed > FRAME_BUDGET_MS ? Math.min(elapsed, 50) : 1000 / 60;
  animFrameId = setTimeout(simulationLoop, delay);
}

self.onmessage = async (event: MessageEvent) => {
  const msg = event.data;

  try {
    switch (msg.type) {
      case 'init': {
        // Load Wasm module inside the worker
        const baseUrl = msg.baseUrl ?? '/';
        const wasmModule = await import(/* @vite-ignore */ `${baseUrl}wasm/xpbd_wasm.js`) as unknown as WasmModule;
        await wasmModule.default(`${baseUrl}wasm/xpbd_wasm_bg.wasm`);

        // Merge pieces
        const pieces: Array<{ vertices: number[]; triIds: number[] }> = msg.pieces;
        let totalVerts = 0;
        let totalTris = 0;
        for (const p of pieces) {
          totalVerts += p.vertices.length / 3;
          totalTris += p.triIds.length;
        }

        const positions = new Float32Array(totalVerts * 3);
        const invMass = new Float32Array(totalVerts);
        const triangles = new Uint32Array(totalTris);
        let vOff = 0;
        let tOff = 0;

        for (const p of pieces) {
          const numV = p.vertices.length / 3;
          for (let i = 0; i < p.vertices.length; i++) {
            positions[vOff * 3 + i] = p.vertices[i];
          }
          for (let i = 0; i < numV; i++) {
            invMass[vOff + i] = 1.0;
          }
          for (let i = 0; i < p.triIds.length; i++) {
            triangles[tOff + i] = p.triIds[i] + vOff;
          }
          vOff += numV;
          tOff += p.triIds.length;
        }

        numParticles = totalVerts;
        solver = new wasmModule.XpbdSolver(positions, invMass);

        const stretch = extractStretchConstraints(positions, triangles);
        solver.set_stretch(stretch.ids, stretch.restLengths);

        const bend = extractBendConstraints(positions, triangles);
        solver.set_bend(bend.ids, bend.restAngles);

        solver.configure(15, 0.99, -9.81, 0.0, 0.01, false, 0.002, 0.005);

        (self as unknown as Worker).postMessage({ type: 'ready', numParticles: totalVerts });
        break;
      }

      case 'start':
        running = true;
        simulationLoop();
        break;

      case 'stop':
        running = false;
        if (animFrameId !== null) {
          clearTimeout(animFrameId);
          animFrameId = null;
        }
        (self as unknown as Worker).postMessage({ type: 'stopped' });
        break;

      case 'setSDF':
        if (solver && msg.sdf) {
          solver.set_sdf(
            msg.sdf.distances, msg.sdf.resolution,
            msg.sdf.min[0], msg.sdf.min[1], msg.sdf.min[2], msg.sdf.cellSize,
          );
        }
        break;

      case 'dispose':
        running = false;
        if (animFrameId !== null) {
          clearTimeout(animFrameId);
          animFrameId = null;
        }
        solver?.free();
        solver = null;
        break;
    }
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    (self as unknown as Worker).postMessage({ type: 'error', message: errMsg });
  }
};
