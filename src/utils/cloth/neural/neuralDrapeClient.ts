/**
 * Neural Drape Client — instant cloth preview via ML inference.
 *
 * Tier 4 in the simulation fallback pipeline.
 * Uses ONNX Runtime Web (loaded from CDN) for neural cloth prediction,
 * with an analytical drape fallback when no model is available.
 *
 * **Architecture:**
 * - Input: garment mesh vertices (flat) + body pose (joint angles).
 * - Output: predicted draped vertex positions.
 * - Model: PBNS/HOOD-style network (ONNX format, ~2-10MB).
 * - Fallback: analytical gravity drape (fast but less accurate).
 *
 * **Interface contract (post-A6 Constraint C resolution — partial enforce + partial reframe):**
 *
 * Implements `ClothSolverClient` (cf. `../solverProtocol.ts`) for the
 * **lifecycle subset**: `start()`, `stop()`, `dispose()`, and `capabilities`.
 * The original "Drop-in replacement" claim is now **type-enforced for that
 * subset** — TypeScript guarantees Neural can substitute any other
 * `ClothSolverClient` for those four members.
 *
 * The "drop-in" framing was previously aspirational across the FULL surface
 * (init + callbacks + setters); A6 § 4.5 documented why that's structurally
 * unenforceable without behavioral changes (init seam shape divergence; CPU
 * 3-arg `FrameCallback` vs single-arg shape; per-tier setter divergence).
 * Those parts remain **by-convention only** until the `#UUU-init` +
 * `#UUU-callbacks` consumer migration follow-ups land. Specifically:
 *
 * - `initMultiPiece(pieces)` — Neural takes no seams, no config. CPU/WASM
 *   take `SeamInitData[]` + tier-specific config; GPU takes a different
 *   `seamPairs` shape. Polymorphic init = consumer responsibility.
 * - `onFrame: (positions: Float32Array) => void` — Neural's single-arg
 *   shape matches WASM/GPU but NOT CPU's 3-arg `FrameCallback`. Consumer
 *   wiring must reconcile per-tier.
 * - All physics setters (snapshots, wind, pins, fabric, gravity) are
 *   tier-specific concrete-class methods, NOT in the interface. Neural
 *   exposes none of these — it's ML inference, not a physics solver.
 *
 * **Capability surface:** all physics flags `false`; `frameDriven: false`
 * (Neural manages its own animation loop via `requestAnimationFrame`).
 * See `NEURAL_CAPABILITIES` for the full declaration + rationale.
 *
 * @module neuralDrapeClient
 * @see docs/reports/2026-05-01-rfc-a6-worker-protocol.md § 4.5
 * @see ../solverProtocol.ts (ClothSolverClient interface)
 */

import { type SolverCapabilities, NEURAL_CAPABILITIES } from '../solverCapabilities';
import { pushSolverEvent } from '../solverRuntimeTracker';
import type { ClothSolverClient } from '../solverProtocol';

// ─── Types ──────────────────────────────────────────────────────────────────

interface OrtSession {
  run(feeds: Record<string, OrtTensor>): Promise<Record<string, OrtTensor>>;
  release(): Promise<void>;
}

interface OrtTensor {
  data: Float32Array;
  dims: number[];
  dispose(): void;
}

interface OrtModule {
  InferenceSession: {
    create(uri: string, options?: Record<string, unknown>): Promise<OrtSession>;
  };
  Tensor: new (type: string, data: Float32Array, dims: number[]) => OrtTensor;
  env: {
    wasm: { wasmPaths: string };
  };
}

export interface NeuralDrapeConfig {
  /** URL to the ONNX model file */
  modelUrl?: string;
  /** Use analytical fallback instead of neural network */
  useAnalytical?: boolean;
  /** Target FPS for the prediction loop */
  targetFps?: number;
  /** Gravity strength for analytical drape */
  gravity?: number;
  /** Drape stiffness (0=full gravity, 1=no drape) */
  stiffness?: number;
}

export interface PieceMeshData {
  pieceId: string;
  vertices: Float32Array;
  triIds: Int32Array;
}

// ─── Constants ──────────────────────────────────────────────────────────────

const ONNX_CDN = 'https://cdn.jsdelivr.net/npm/onnxruntime-web@1.24.2/dist/';
const DEFAULT_CONFIG: Required<NeuralDrapeConfig> = {
  modelUrl: '',
  useAnalytical: true, // Default to analytical until a model is provided
  targetFps: 60,
  gravity: 9.81,
  stiffness: 0.3,
};

// ─── Client ─────────────────────────────────────────────────────────────────

export class NeuralDrapeClient implements ClothSolverClient {
  private config: Required<NeuralDrapeConfig>;
  private ort: OrtModule | null = null;
  private session: OrtSession | null = null;
  private running = false;
  private animFrameId = 0;

  // Mesh data
  private restPositions: Float32Array = new Float32Array(0);
  private currentPositions: Float32Array = new Float32Array(0);
  private numParticles = 0;
  private invMass: Float32Array = new Float32Array(0);

  // Analytical drape state
  private velocities: Float32Array = new Float32Array(0);
  private drapeTime = 0;

  onFrame?: (positions: Float32Array) => void;
  onReady?: () => void;
  onError?: (error: string) => void;

  /**
   * Solver capability surface — declares which physics features and
   * execution modes this tier supports. Per A6 § 3.4 Option A
   * (capability extension to GPU + Neural).
   *
   * All physics flags `false` — Neural drape is ML inference, not a
   * physics solver. `frameDriven: false` because Neural manages its
   * own animation loop via `requestAnimationFrame` (see `start()`).
   */
  get capabilities(): SolverCapabilities {
    return NEURAL_CAPABILITIES;
  }

  constructor(config?: NeuralDrapeConfig) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Initialize with merged multi-piece mesh data.
   */
  async initMultiPiece(pieces: PieceMeshData[]): Promise<void> {
    // Merge all pieces
    let totalVerts = 0;
    for (const p of pieces) totalVerts += p.vertices.length / 3;

    this.numParticles = totalVerts;
    this.restPositions = new Float32Array(totalVerts * 3);
    this.currentPositions = new Float32Array(totalVerts * 3);
    this.velocities = new Float32Array(totalVerts * 3);
    this.invMass = new Float32Array(totalVerts);

    let offset = 0;
    for (const p of pieces) {
      const nv = p.vertices.length / 3;
      this.restPositions.set(p.vertices, offset * 3);
      this.currentPositions.set(p.vertices, offset * 3);
      
      for (let i = 0; i < nv; i++) {
        this.invMass[offset + i] = 1.0;
      }
      offset += nv;
    }

    this.drapeTime = 0;

    // Try loading ONNX model if configured
    if (this.config.modelUrl && !this.config.useAnalytical) {
      try {
        await this.loadOnnxModel();
      } catch (err) {
        console.warn('[NeuralDrape] ONNX model failed, using analytical fallback:', err);
        pushSolverEvent('tier:diagnostic', { tier: 'neural-drape', code: 'analytical-fallback', message: String(err) });
        this.config.useAnalytical = true;
      }
    }

    console.log('[NeuralDrape] Initialized:', {
      particles: totalVerts,
      mode: this.config.useAnalytical ? 'analytical' : 'neural',
      model: this.config.modelUrl || 'none',
    });

    this.onReady?.();
  }

  /**
   * Load ONNX Runtime from CDN and create inference session.
   */
  private async loadOnnxModel(): Promise<void> {
    // Dynamic import of ONNX Runtime from CDN
    if (!this.ort) {
      const script = document.createElement('script');
      script.src = `${ONNX_CDN}ort.min.js`;
      await new Promise<void>((resolve, reject) => {
        script.onload = () => resolve();
        script.onerror = () => reject(new Error('Failed to load ONNX Runtime from CDN'));
        document.head.appendChild(script);
      });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      this.ort = (globalThis as any).ort as OrtModule;
      if (this.ort) {
        this.ort.env.wasm.wasmPaths = ONNX_CDN;
      }
    }

    if (!this.ort) throw new Error('ONNX Runtime not available');

    this.session = await this.ort.InferenceSession.create(this.config.modelUrl, {
      executionProviders: ['wasm'],
    });
  }

  /**
   * Run neural inference to predict draped positions.
   */
  private async predictNeural(): Promise<Float32Array> {
    if (!this.ort || !this.session) {
      throw new Error('ONNX session not initialized');
    }

    const inputTensor = new this.ort.Tensor(
      'float32',
      this.restPositions,
      [1, this.numParticles, 3],
    );

    const results = await this.session.run({ vertices: inputTensor });
    const output = results['draped_vertices'] ?? results[Object.keys(results)[0]];
    const predicted = new Float32Array(output.data);

    inputTensor.dispose();
    output.dispose();

    return predicted;
  }

  /**
   * Analytical drape — fast gravity-based position prediction.
   *
   * Uses exponential ease-in: vertices smoothly fall from rest position
   * toward a gravity-draped target. Converges in ~1-2 seconds.
   * Not physically accurate, but gives instant visual feedback.
   */
  private predictAnalytical(dt: number): Float32Array {
    this.drapeTime += dt;
    const g = this.config.gravity;
    const stiffness = this.config.stiffness;

    // Exponential drape factor: 0 at t=0, approaches 1
    const drapeFactor = 1 - Math.exp(-this.drapeTime * 2.0);

    for (let i = 0; i < this.numParticles; i++) {
      if (this.invMass[i] === 0) continue; // pinned

      const idx = i * 3;
      const restY = this.restPositions[idx + 1];

      // Simple gravity drape: Y drops proportional to distance from top
      // Higher particles fall more (simulating draping behavior)
      const heightFactor = Math.max(0, restY + 0.5); // normalize to 0-1 range
      const drop = g * heightFactor * 0.02 * drapeFactor;

      // Apply damped velocity for smooth animation
      const targetY = restY - drop;
      const currentY = this.currentPositions[idx + 1];
      const vy = (targetY - currentY) * (1 - stiffness) * 5.0;
      this.velocities[idx + 1] = vy * 0.95; // damping

      // X and Z: slight inward pull (fabric tension)
      const restX = this.restPositions[idx];
      const restZ = this.restPositions[idx + 2];
      const tensionFactor = drapeFactor * (1 - stiffness) * 0.1;
      this.currentPositions[idx] = restX * (1 - tensionFactor * heightFactor);
      this.currentPositions[idx + 1] = currentY + vy * dt;
      this.currentPositions[idx + 2] = restZ * (1 - tensionFactor * heightFactor);
    }

    return this.currentPositions;
  }

  /**
   * Start the prediction loop.
   */
  start(): void {
    if (this.running) return;
    this.running = true;
    this.drapeTime = 0;
    // Reset to rest
    this.currentPositions.set(this.restPositions);
    this.velocities.fill(0);
    this.tick();
  }

  /**
   * Stop the prediction loop.
   */
  stop(): void {
    this.running = false;
    if (this.animFrameId) {
      cancelAnimationFrame(this.animFrameId);
      this.animFrameId = 0;
    }
  }

  /**
   * Clean up resources.
   */
  async dispose(): Promise<void> {
    this.stop();
    if (this.session) {
      await this.session.release();
      this.session = null;
    }
    this.ort = null;
  }

  private tick = (): void => {
    if (!this.running) return;

    const dt = 1 / this.config.targetFps;

    if (this.config.useAnalytical) {
      const positions = this.predictAnalytical(dt);
      this.onFrame?.(new Float32Array(positions)); // copy to avoid mutation
    } else {
      // Neural: async inference
      this.predictNeural()
        .then(positions => {
          if (this.running) {
            this.onFrame?.(positions);
          }
        })
        .catch(err => {
          console.warn('[NeuralDrape] Inference failed, switching to analytical:', err);
          pushSolverEvent('tier:diagnostic', { tier: 'neural-drape', code: 'inference-failed', message: String(err) });
          this.config.useAnalytical = true;
          this.onError?.(`Neural inference failed: ${err}`);
        });
    }

    this.animFrameId = requestAnimationFrame(this.tick);
  };
}

/**
 * Check if Neural Drape is available.
 * Always returns true since analytical fallback is built-in.
 */
export function isNeuralDrapeAvailable(): boolean {
  return true;
}
