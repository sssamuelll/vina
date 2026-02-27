/**
 * Wasm XPBD Solver Worker — runs Rust Wasm solver off the main thread.
 *
 * @module wasmSolverWorker
 */

import { extractStretchConstraints, extractBendConstraints } from '../gpu/gpuBuffers';
import { mergeMeshes, buildSeamConstraints } from '../seamAssembly';
import type { PathCommand } from '../../../types/types';

// ─── Types ──────────────────────────────────────────────────────────────────

interface WasmModule {
  default: (input?: RequestInfo | URL) => Promise<WasmExportsLike | void>;
  XpbdSolver: new (positions: Float32Array, invMass: Float32Array) => WasmXpbdSolver;
  // Module-level wasm reference (set by __wbg_finalize_init)
  wasm?: WasmExportsLike;
}

interface WasmExportsLike {
  memory: WebAssembly.Memory;
  [key: string]: unknown;
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
let wasmExports: { memory: WebAssembly.Memory } | null = null;
let numParticles = 0;
let running = false;
let animFrameId: ReturnType<typeof setTimeout> | null = null;

const FRAME_BUDGET_MS = 14;

function simulationLoop(): void {
  if (!running || !solver) return;

  const t0 = performance.now();
  solver.step(1 / 60);
  const elapsed = performance.now() - t0;

  // Read positions from Wasm memory
  const n = numParticles;
  const ptr = solver.positions_ptr();
  let positions: Float32Array;

  if (wasmExports?.memory) {
    positions = new Float32Array(wasmExports.memory.buffer, ptr, n * 3).slice();
  } else {
    // Should never happen after successful init, but safety fallback
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

        // wasm-bindgen 0.2.88+ might put exports on the module or the init result
        wasmExports = (wasmModule as unknown as { wasm: { memory: WebAssembly.Memory } }).wasm;

        // Merge pieces using the standard utility (ensures consistent vertex mapping)
        const pieceInput: Array<{ pieceId: string; vertices: Float32Array; triIds: Int32Array }> = msg.pieces.map((p: any) => ({
          pieceId: p.pieceId,
          vertices: new Float32Array(p.vertices),
          triIds: new Int32Array(p.triIds),
        }));

        const merged = mergeMeshes(pieceInput);
        const totalVerts = merged.vertices.length / 3;
        
        const invMass = new Float32Array(totalVerts);
        for (let i = 0; i < totalVerts; i++) invMass[i] = 1.0;

        numParticles = totalVerts;
        solver = new wasmModule.XpbdSolver(merged.vertices, invMass);

        // Standard constraints
        const triangles = new Uint32Array(merged.triIds);
        const stretch = extractStretchConstraints(merged.vertices, triangles);
        solver.set_stretch(stretch.ids, stretch.restLengths);

        const bend = extractBendConstraints(merged.vertices, triangles);
        solver.set_bend(bend.ids, bend.restAngles);

        // Seam constraints
        if (msg.seams && msg.seams.length > 0) {
          const outlines = new Map<string, PathCommand[]>();
          for (const p of msg.pieces) {
            if (p.outline) outlines.set(p.pieceId, p.outline);
          }

          const seamConstraints = buildSeamConstraints(msg.seams, outlines, merged);
          if (seamConstraints.count > 0) {
            console.log('[WasmWorker] Adding seam constraints:', seamConstraints.count);
            // Convert pairs to Uint32Array for Wasm
            const ids = new Uint32Array(seamConstraints.ids);
            // The Rust solver expects (ids, target_lengths)
            solver.set_seams(ids, seamConstraints.restLengths);
          }
        }

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
