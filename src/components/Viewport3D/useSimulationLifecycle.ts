/**
 * useSimulationLifecycle — Manages solver selection cascade and client lifecycle.
 *
 * Owns the solver tier selection (GPU → WASM → CPU → Neural), client refs,
 * start/stop/pause logic, collision loading, and frame callbacks.
 *
 * Collision loading is integrated into the startup sequence because it MUST
 * complete before the solver starts (otherwise cloth falls through the avatar).
 * The collision code is deduplicated via a helper function — previously it was
 * copy-pasted for WASM and CPU paths.
 *
 * Extracted from GarmentSimulation.tsx for separation of concerns.
 *
 * ─── Tier dispatch convention (post-A6) ─────────────────────────────────────
 *
 * Per A6 RFC § 4.5, the cloth solver `ClothSolverClient` interface declares
 * only the lifecycle subset (`start`/`stop`/`dispose`/`capabilities`) — init,
 * callbacks, and setters remain per-tier divergent (structural shapes that
 * cannot be uniformly typed without behavioral changes).
 *
 * Until the consumer migration follow-ups land, this hook hand-rolls the
 * 4-rama dispatch (GPU / WASM / CPU / Neural) with tier-specific init args,
 * callback wiring, and setter access.
 *
 * **Migration target (`#UUU-init` + `#UUU-callbacks` follow-ups):**
 *
 * - `#UUU-init`: factory pattern that maps tier identity to constructor +
 *   per-tier init args resolution from a common config shape. The 4 init
 *   call sites below (gpuClient.initMultiPiece*, wasmClient.initMultiPiece,
 *   client.init+initMultiPiece, neuralClient.initMultiPiece) collapse into
 *   a single tier-aware factory call.
 *
 * - `#UUU-callbacks`: wrapper layer that adapts `(positions)` →
 *   `(positions, numParticles, triIds)` for CPU consumer code, OR
 *   migrates CPU emission to single-arg + emits mesh data via separate
 *   `onMeshData` event. Currently CPU's `FrameCallback` 3-arg shape
 *   diverges from WASM/GPU/Neural's single-arg `(positions)` — the
 *   `onFrame` assignment at lines 269/321/359/388 sees this as
 *   loose-typed compatibility (TypeScript bivariance under non-strict
 *   contexts), but a polymorphic dispatch would surface the divergence.
 *
 * **Polymorphic lifecycle dispatch IS available now** — any of the 4
 * client refs can be cast to `ClothSolverClient` and invoked uniformly
 * for `start()`, `stop()`, `dispose()`, and `capabilities` reads:
 *
 * @example
 * // Polymorphic stop across whichever tier is currently active:
 * const active: ClothSolverClient | null =
 *   gpuClientRef.current ?? wasmClientRef.current ??
 *   clientRef.current ?? neuralClientRef.current;
 * if (active) {
 *   if (active.capabilities.frameDriven) {
 *     // GPU/TSL — useFrame manages dispatch; start() is a no-op.
 *   } else {
 *     active.start();
 *   }
 * }
 *
 * Cross-ref: `src/utils/cloth/solverProtocol.ts` (interface),
 *            `docs/reports/2026-05-01-rfc-a6-worker-protocol.md` § 4.5.
 *
 * ─── Hook composition canonical (post-C4 ratification) ───────────────────────
 *
 * Per C4 RFC § 3.5.A, this hook is the **de facto tier coordinator** for the
 * 4-way solver orchestration. Together with `useCollisionBodies` (pin sync)
 * and `useMeshing` (warm-start dispatch), the 3-hook composition owns:
 *
 * - **Tier selection cascade** (search marker `─── Tier cascade ───`):
 *   GPU → WASM → CPU → Neural fallthrough. Driven by `WEBGPU_FEATURE_FLAG_KEY`
 *   opt-in + per-tier availability checks. The 4 inner section markers
 *   (`─── WebGPU GPU solver ───`, `─── WASM XPBD ───`, `─── CPU Web Worker ───`,
 *   `─── Neural Drape (analytical fallback) ───`) anchor each tier's init
 *   block within the cascade.
 * - **Setter dispatch** (search markers `─── Push wind config to GPU solver ───`,
 *   `─── Push wind config to WASM solver ───`, `─── Sync frozen pieces to GPU
 *   solver ───`, `─── Push elastic constraints to active solver ───`):
 *   wind / freeze / elastics distributed across per-tier `useEffect`s.
 *   Per-tier divergence ratified by A6 § 3.5 (setter migrations queued
 *   #683-689) + A2 § 3.4 (gravity follow-up #686 — per-tier divergence
 *   ratified).
 * - **Cleanup cascade** (search markers `─── Cleanup cascade ───`,
 *   3 occurrences for running→state-change, idle, and paused branches):
 *   all 4 tiers disposed (`?.dispose()`) on running→idle and on cleanup
 *   effect; paused branch stops without disposing.
 *
 * **NO TierCoordinator class** — sub-decisión 3.5.A ratified hook composition
 * as canonical. Class extraction (3.5.B) would have triggered cross-eje
 * cascade reopens (A2 § 7 #4 + A4 § 7 #6 + A6 § 7 #2). See C4 RFC.
 *
 * @see docs/reports/2026-05-02-drift-fase2-c4-4way-tier-orchestration.md § 3.5
 */

import { useRef, useEffect, useCallback, useState } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import { RootState } from '../../store';
import { ClothWorkerClient } from '../../utils/cloth/clothWorkerClient';
import type { SeamInitData } from '../../utils/cloth/clothWorker';
import { seamInitDataToPairs, summarizeSeamResolution } from '../../utils/cloth/seamPairs';
import { isWebGPUAvailable, WEBGPU_FEATURE_FLAG_KEY } from '../../utils/cloth/gpu/webgpuDetect';
import { SIMULATION_MODES } from '../../utils/cloth/gpu/qualityPresets';
import { mapClothSimConfigToWasmSolverConfig } from '../../utils/cloth/configBridge';
import { cmToM } from '../../utils/geometry';
import { GpuSolverClient } from '../../utils/cloth/gpu/gpuSolverClient';
import { WasmSolverClient, isWasmSolverAvailable } from '../../utils/cloth/wasm/wasmSolverClient';
import { NeuralDrapeClient } from '../../utils/cloth/neural/neuralDrapeClient';
import { setSolverTier, setFrameTime, setBodyCollision, setIsWarmStarting, setSeamResolution } from '../../store/simulationSlice';
import { setSeamResolutionErrors } from '../../store/inspectorSlice';
import { showWarningToast, showErrorToast } from '../../store/copilotUISlice';
import { GPU_CAPABILITIES, NEURAL_CAPABILITIES } from '../../utils/cloth/solverCapabilities';
import { safeGetItem } from '../../utils/safeStorage';
import { getPhysicalFabric } from '../../utils/cloth/physicalFabric';
import { extractAvatarCollisionMesh } from '../../utils/cloth/avatarCollisionMesh';
import { extractMeshData } from '../../utils/cloth/avatarMeshExtractor';
import { collisionMeshFromBuffers } from '../../utils/cloth/collisionMesh';
import { importMesh } from '../../utils/import/meshImporter';
import type { SolverEdgeData } from '../../utils/cloth/fitMaps';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface SimulationClients {
  cpu: ClothWorkerClient | null;
  wasm: WasmSolverClient | null;
  gpu: GpuSolverClient | null;
  neural: NeuralDrapeClient | null;
}

export interface PlacedMesh {
  pieceId: string;
  vertices: Float32Array;
  triIds: Int32Array;
  outline: Array<{ type: string; values: number[] }>;
  edges?: Array<{ name: string; segmentRange: [number, number] }>;
  uvs?: Float32Array;
  /** Per-piece stiffness multiplier (>1 = stiffer, from interfacing/solidify). Default 1. */
  stiffnessMultiplier?: number;
}

interface UseSimulationLifecycleProps {
  placedMeshes: PlacedMesh[];
  seamInitData: SeamInitData[];
  elastics: import('../../types/types').Elastic[];
  fabricId: string;
  /** Ref populated by this hook with stretching constraint IDs (for warm-start) */
  stretchingIdsRef: React.MutableRefObject<Int32Array | null>;
}

interface UseSimulationLifecycleResult {
  clients: SimulationClients;
  /** Ref to current solver positions — updated every frame */
  positionsRef: React.MutableRefObject<Float32Array | null>;
  /** Ref to edge data for fit maps */
  edgeDataRef: React.MutableRefObject<SolverEdgeData | null>;
  /** Stable onFrame callback for solver clients */
  onFrame: (positions: Float32Array) => void;
  /** Tick de frame-time para tiers frame-driven (GPU TSL) — misma contabilidad que onFrame */
  recordFrameTick: () => void;
  /** TSL solver ref for renderer.compute() dispatch */
  tslSolverRef: React.MutableRefObject<import('../../utils/cloth/gpu/tslSolver').TslSolver | null>;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Check localStorage feature flag. Default: false (WebGPU disabled).
 *  Three.js 0.183 TSL atomicAdd doesn't propagate isAtomic to StorageBufferNode,
 *  so WGSL declares array<i32> instead of array<atomic<i32>>. All compute shaders
 *  silently fail. WASM XPBD solver is used until a Three.js upstream fix lands.
 *  Set 'openclo-use-webgpu' to 'true' to opt-in. */
function isWebGPUFeatureEnabled(): boolean {
  return safeGetItem(WEBGPU_FEATURE_FLAG_KEY) === 'true';
}

/** Race a promise against a timeout */
function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  return Promise.race([
    p,
    new Promise<T>((_, rej) => setTimeout(() => rej(new Error(`${label} timed out (${ms}ms)`)), ms)),
  ]);
}

/** Load avatar collision mesh and custom bodies into a solver client (shared between WASM and CPU paths) */
async function loadCollision(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  client: { setCollisionMesh: (mesh: any) => void; updateCollisionBody: (data: any) => void },
  avatarModelUrl: string | null,
  avatarHeight: number,
  collisionBodies: Array<{
    id: string;
    name: string;
    meshUrl: string;
    collision: { enabled: boolean; friction: number; offset: number };
    transform: { position: [number, number, number]; rotation: [number, number, number]; scale: [number, number, number] };
  }>,
  dispatch: ReturnType<typeof useDispatch>,
  cancelled: { value: boolean },
  isWasm: boolean,
): Promise<void> {
  // Avatar collision mesh
  if (avatarModelUrl && !cancelled.value) {
    try {
      const collisionMesh = await withTimeout(
        extractAvatarCollisionMesh(avatarModelUrl, avatarHeight),
        5000,
        'Collision mesh extraction',
      );
      if (collisionMesh && !cancelled.value) {
        console.log('[SimLifecycle] ✅ Collision mesh extracted:', collisionMesh.triCount, 'triangles');
        client.setCollisionMesh(collisionMesh);
        if (isWasm && 'applyInitialTriangleCollision' in client) {
          (client as WasmSolverClient).applyInitialTriangleCollision();
        }
        dispatch(setBodyCollision(true));
      } else if (!cancelled.value) {
        dispatch(setBodyCollision(false));
      }
    } catch (e) {
      console.warn('[SimLifecycle] Collision mesh extraction failed:', e);
      if (!cancelled.value) dispatch(setBodyCollision(false));
    }
  }

  // Custom collision bodies
  if (!cancelled.value) {
    for (const body of collisionBodies) {
      if (!body.collision.enabled || cancelled.value) continue;
      try {
        const result = await importMesh(body.meshUrl, body.name, {});
        const scene = result.scene;
        scene.position.set(...body.transform.position);
        scene.rotation.set(
          body.transform.rotation[0] * (Math.PI / 180),
          body.transform.rotation[1] * (Math.PI / 180),
          body.transform.rotation[2] * (Math.PI / 180),
        );
        scene.scale.set(...body.transform.scale);
        scene.updateMatrixWorld(true);
        const { vertices, indices, normals } = extractMeshData(scene);
        const mesh = collisionMeshFromBuffers(vertices, indices, normals);
        if (mesh && !cancelled.value) {
          client.updateCollisionBody({
            id: body.id,
            mesh,
            friction: body.collision.friction,
            margin: body.collision.offset,
          });
        }
      } catch (e) {
        console.warn('[SimLifecycle] Collision body load failed:', body.name, e);
      }
    }
  }
}

// ─── Hook ────────────────────────────────────────────────────────────────────

export function useSimulationLifecycle({
  placedMeshes,
  seamInitData,
  elastics,
  fabricId,
  stretchingIdsRef,
}: UseSimulationLifecycleProps): UseSimulationLifecycleResult {
  const dispatch = useDispatch();
  const simulationState = useSelector((s: RootState) => s.simulation.simulationState);
  const avatarModelUrl = useSelector((s: RootState) => s.project.avatarModelUrl);
  const avatarHeight = cmToM(useSelector((s: RootState) => s.project.avatar.measurements.height));
  const collisionBodies = useSelector((s: RootState) => s.collisionBody.bodies);
  const measurements = useSelector((s: RootState) => s.project.avatar.measurements);
  const morphTargets = useSelector((s: RootState) => s.avatar.morphTargets);
  const windForce = useSelector((s: RootState) => s.simulation.windForce);
  const windEnabled = useSelector((s: RootState) => s.simulation.windEnabled);
  const dragCoefficient = useSelector((s: RootState) => s.simulation.dragCoefficient);
  const frozenPieceIds = useSelector((s: RootState) => s.simulation.frozenPieceIds);
  const simulationMode = useSelector((s: RootState) => s.simulation.simulationMode);

  const positionsRef = useRef<Float32Array | null>(null);
  const edgeDataRef = useRef<SolverEdgeData | null>(null);
  const tslSolverRef = useRef<import('../../utils/cloth/gpu/tslSolver').TslSolver | null>(null);

  // ─── Refs for values used during init but NOT as effect deps ────────────────
  // These prevent reinit cascades (#315): if collisionBodies/avatarModelUrl/avatarHeight
  // are in the effect dep array, Redux actions dispatched during async init can trigger
  // cleanup → reinit loops, leaving tslSolverRef.current permanently null.
  // Live updates for these values are handled by separate effects (collision rebuild,
  // useCollisionBodies hook).
  const collisionBodiesRef = useRef(collisionBodies);
  collisionBodiesRef.current = collisionBodies;
  const avatarModelUrlRef = useRef(avatarModelUrl);
  avatarModelUrlRef.current = avatarModelUrl;
  const avatarHeightRef = useRef(avatarHeight);
  avatarHeightRef.current = avatarHeight;
  const elasticsRef = useRef(elastics);
  elasticsRef.current = elastics;
  // Quality preset at init (M4-D): the mode-sync effect in GarmentSimulation
  // is NOT guaranteed to deliver after async init (no Redux selector it
  // subscribes to changes when init completes), so the worker otherwise
  // runs on its OWN defaults — substeps 15 instead of the preset's 5, and
  // selfCollision at whatever the default says. The init call passes the
  // preset explicitly; mode CHANGES during a run still flow via the sync
  // effect. Ref (not dep) so switching mode doesn't reinit the solver.
  const simulationModeRef = useRef(simulationMode);
  simulationModeRef.current = simulationMode;

  const clientRef = useRef<ClothWorkerClient | null>(null);
  const gpuClientRef = useRef<GpuSolverClient | null>(null);
  const wasmClientRef = useRef<WasmSolverClient | null>(null);
  const neuralClientRef = useRef<NeuralDrapeClient | null>(null);

  /** Cache the WebGPU device across effect re-runs to avoid re-requesting adapter/device */
  const gpuDeviceRef = useRef<GPUDevice | null>(null);
  const gpuDeviceLostRef = useRef(false);

  // State counter to force re-render after async TSL solver init completes.
  // Without this, tslSolverRef.current changes inside an async callback but
  // no React state change occurs, so GarmentSimulation never re-renders to
  // pick up the new solver and create the TSL material.
  const [, setTslGeneration] = useState(0);

  const warmStartTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const collisionRebuildTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const windowStartRef = useRef<number | null>(null);
  const frameCountRef = useRef(0);

  /**
   * Descarta la ventana de frame-time en curso. Debe llamarse en TODO
   * cleanup que pare la sim (running→paused y branch 'idle') — si la
   * ventana sobrevive a una pausa, el gap se promedia dentro de los
   * primeros 30 frames reanudados y el FPS miente durante ~medio segundo.
   */
  const resetFrameWindow = useCallback(() => {
    windowStartRef.current = null;
    frameCountRef.current = 0;
  }, []);

  /**
   * Frame-time compartido por todos los tiers. Workers (WASM/CPU/Neural) vía
   * onFrame; el tier GPU TSL lo llama directo desde useFrame (GarmentSimulation)
   * porque ahí onFrame nunca dispara (frameDriven). Media real de ventana de 30.
   */
  const recordFrameTick = useCallback(() => {
    const now = performance.now();
    if (windowStartRef.current === null) {
      windowStartRef.current = now;
      return;
    }
    frameCountRef.current++;
    if (frameCountRef.current % 30 === 0) {
      const avgMs = (now - windowStartRef.current) / 30;
      dispatch(setFrameTime(Math.round(avgMs * 10) / 10));
      windowStartRef.current = now;
    }
  }, [dispatch]);

  const onFrame = useCallback((positions: Float32Array) => {
    positionsRef.current = positions;
    recordFrameTick();
  }, [recordFrameTick]);

  // ─── Tier cascade ─── (Start/stop simulation — solver tier cascade)
  useEffect(() => {
    if (simulationState === 'running' && placedMeshes.length > 0) {
      let cancelled = false;
      const cancelFlag = { get value() { return cancelled; } };

      const startSim = async () => {
        // Seam capability gate (CLO3D parity plan Fase 4): tiers declaring
        // `seams: false` are skipped — with a visible notice, never silently —
        // when the project has active seams. Honest capability declaration
        // per A7/C4 doctrine.
        const projectHasSeams = seamInitData.some(s => s.active !== false);

        // ─── Seam observability (parity plan Fase 4) ──────────────────
        // Same resolution the workers run (`summarizeSeamResolution` shares
        // the parameterizeEdge + matchVertices pipeline), computed here so
        // the UI can tell the user — before any solver init — which seams
        // resolve to zero constraints and will NOT sew. Dual surface per
        // E-async § 3.5.3.A: overlay summary + error toast + inspector
        // detail.
        if (projectHasSeams) {
          const entries = summarizeSeamResolution(seamInitData, placedMeshes);
          const zero = entries.filter(e => e.constraintCount === 0);
          dispatch(setSeamResolution({
            totalConstraints: entries.reduce((acc, e) => acc + e.constraintCount, 0),
            zeroConstraintSeams: zero.map(e => ({ seamId: e.seamId, reason: e.failure ?? 'empty-match' })),
          }));
          dispatch(setSeamResolutionErrors(zero.map(e => ({
            seamId: e.seamId,
            reason: e.failure ?? 'empty-match',
            message: `Seam ${e.seamId} resolved to 0 constraints (${e.failure ?? 'empty-match'})`,
            timestamp: Date.now(),
          }))));
          if (zero.length > 0) {
            console.warn('[SimLifecycle] Seams resolved to 0 constraints (will not sew):', zero);
            dispatch(showErrorToast(
              zero.length === 1
                ? '1 seam could not be resolved and will not sew — check its edge pairing'
                : `${zero.length} seams could not be resolved and will not sew — check their edge pairing`,
            ));
          }
        } else {
          dispatch(setSeamResolution(null));
          dispatch(setSeamResolutionErrors([]));
        }

        // ─── WebGPU GPU solver ────────────────────────────────────────
        const wantsWebGPU = isWebGPUFeatureEnabled() && isWebGPUAvailable();
        if (wantsWebGPU && projectHasSeams && !GPU_CAPABILITIES.seams) {
          // The TSL seam kernel lacks closure parity (no target decay) — a
          // seam would constrain but never close. Fall through to WASM
          // (seams: true) and tell the user why their opt-in was bypassed.
          console.warn('[SimLifecycle] Project has seams — WebGPU tier declares seams:false, skipping to WASM');
          dispatch(showWarningToast('Sewing is not supported on the WebGPU solver yet — using the WASM solver for this project'));
        } else if (wantsWebGPU) {
          try {
            let device = gpuDeviceRef.current;
            if (!device || gpuDeviceLostRef.current) {
              const adapter = await navigator.gpu.requestAdapter();
              if (!adapter || cancelled) throw new Error('No WebGPU adapter');
              device = await adapter.requestDevice();
              gpuDeviceRef.current = device;
              gpuDeviceLostRef.current = false;
              device.lost.then((info) => {
                console.warn('[SimLifecycle] GPU device lost:', info.reason, info.message);
                gpuDeviceLostRef.current = true;
                gpuDeviceRef.current = null;
              });
            }
            if (!cancelled) {
                console.log('[SimLifecycle] 🟢 Using WebGPU TSL solver (zero-copy)');
                dispatch(setSolverTier('webgpu'));
                const gpuClient = new GpuSolverClient(device);
                gpuClientRef.current = gpuClient;
                gpuClient.onFrame = onFrame;

                // Use default compliance values that match the CPU solver:
                // stretchWarp: 0.0, stretchWeft: 0.0, shear: 0.001,
                // bendWarp: 1.0, bendWeft: 1.0
                // The CPU solver builds per-edge compliance at init from these
                // defaults and never rebuilds them when fabric changes.
                // Passing fabricCompliance here is intentionally omitted to
                // match the CPU solver's actual behavior.
                const pf = getPhysicalFabric(fabricId);
                const tslSolverConfig: Partial<import('../../utils/cloth/gpu/tslSolver').TslSolverConfig> = {
                  ...(pf ? { internalDamping: pf.internalDamping } : {}),
                  windForce: windEnabled ? windForce : [0, 0, 0],
                  dragCoefficient,
                };

                const seamPairs = seamInitDataToPairs(seamInitData, placedMeshes);
                await withTimeout(
                  gpuClient.initMultiPieceTsl(placedMeshes, seamPairs, tslSolverConfig),
                  12000,
                  'TSL solver init',
                );
                if (cancelled) return;
                tslSolverRef.current = gpuClient.getTslSolver();
                setTslGeneration(g => g + 1);

                // Load collision meshes — setCollisionMesh routes through BVH builder in TSL mode
                // Read from refs (not closure) to avoid stale values and reinit cascades (#315)
                await loadCollision(gpuClient, avatarModelUrlRef.current, avatarHeightRef.current, collisionBodiesRef.current, dispatch, cancelFlag, false);

                // Push pre-existing freeze state — the separate freeze useEffect
                // fires on mount before gpuClientRef is set, so it's a no-op.
                if (frozenPieceIds.length > 0) gpuClient.freezePieces(frozenPieceIds);

                // Don't call gpuClient.start() — TSL compute is driven by useFrame.
                return;
            }
          } catch (e) {
            console.warn('[SimLifecycle] TSL solver failed, falling through to WASM:', e);
            gpuClientRef.current?.dispose();
            gpuClientRef.current = null;
          }
        }

        // ─── WASM XPBD ────────────────────────────────────────────────
        if (!cancelled) {
          try {
            const wasmAvailable = await withTimeout(isWasmSolverAvailable(), 5000, 'Wasm check').catch(() => false);
            if (wasmAvailable && !cancelled) {
              console.log('[SimLifecycle] 🟠 Using Wasm XPBD solver');
              dispatch(setSolverTier('wasm'));
              const wasmClient = new WasmSolverClient();
              wasmClientRef.current = wasmClient;
              wasmClient.onFrame = onFrame;
              wasmClient.onEdgeData = (ids, lengths) => {
                edgeDataRef.current = { stretchingIds: ids, stretchingLengths: lengths };
                stretchingIdsRef.current = ids;
              };
              // Preset config at init (M4-D — see simulationModeRef note).
              const wasmMode = SIMULATION_MODES[simulationModeRef.current];
              await withTimeout(
                wasmClient.initMultiPiece(
                  placedMeshes,
                  seamInitData,
                  mapClothSimConfigToWasmSolverConfig({
                    numSubsteps: wasmMode.substeps,
                    selfCollision: wasmMode.selfCollision,
                  }),
                ),
                12000, 'Wasm solver init',
              );
              wasmClient.requestEdgeData();

              // Load collision BEFORE starting (prevents explosion)
              await loadCollision(wasmClient, avatarModelUrlRef.current, avatarHeightRef.current, collisionBodiesRef.current, dispatch, cancelFlag, true);

              if (!cancelled) {
                wasmClient.start();
                // Push pre-existing wind config — the separate wind useEffect
                // fires on mount before wasmClientRef is set, so it's a no-op.
                if (windEnabled) wasmClient.setWind(windForce);
                // Push pre-existing elastic constraints
                if (elasticsRef.current.length > 0) wasmClient.setElastics(elasticsRef.current);
              }
              return;
            } else if (!cancelled) {
              console.warn('[SimLifecycle] Wasm solver not available');
            }
          } catch (e) {
            console.warn('[SimLifecycle] Wasm failed, falling back to CPU:', e);
            // Clean up broken WASM client before falling through
            wasmClientRef.current?.dispose();
            wasmClientRef.current = null;
          }
        }

        // ─── CPU Web Worker ────────────────────────────────────────────
        if (!cancelled) {
          try {
            console.log('[SimLifecycle] 🟡 Using CPU solver (Web Worker fallback)');
            dispatch(setSolverTier('cpu-worker'));
            const client = new ClothWorkerClient();
            clientRef.current = client;
            client.onFrame = onFrame;
            client.onEdgeData = (ids, lengths) => {
              edgeDataRef.current = { stretchingIds: ids, stretchingLengths: lengths };
              stretchingIdsRef.current = ids;
            };
            // Preset config at init (M4-D — see simulationModeRef note).
            const cpuMode = SIMULATION_MODES[simulationModeRef.current];
            await withTimeout(
              client.initMultiPiece(placedMeshes, seamInitData, {
                numSubsteps: cpuMode.substeps,
                selfCollision: cpuMode.selfCollision,
              }),
              15000, 'CPU worker init',
            );
            client.setFabric(fabricId);
            client.requestEdgeData();

            // Load collision BEFORE starting (prevents explosion)
            await loadCollision(client, avatarModelUrlRef.current, avatarHeightRef.current, collisionBodiesRef.current, dispatch, cancelFlag, false);

            if (!cancelled) {
              client.start();
              // Push pre-existing elastic constraints
              if (elasticsRef.current.length > 0) client.setElastics(elasticsRef.current);
            }
            return;
          } catch (e) {
            console.warn('[SimLifecycle] CPU worker failed, falling back to Neural Drape:', e);
          }
        }

        // ─── Neural Drape (analytical fallback) ────────────────────────
        if (cancelled) return;
        if (projectHasSeams && !NEURAL_CAPABILITIES.seams) {
          // Last tier in the cascade and it cannot sew (`initMultiPiece`
          // takes no seam parameter) — starting it would silently drop
          // every seam. Honest failure instead: no tier, visible error.
          console.error('[SimLifecycle] All seam-capable tiers failed and Neural Drape cannot sew — simulation not started');
          dispatch(showErrorToast('Simulation could not start: no available solver supports sewing on this device'));
          dispatch(setSolverTier('none'));
          return;
        }
        console.log('[SimLifecycle] 🔵 Using Neural Drape (analytical preview)');
        dispatch(setSolverTier('neural-drape'));
        const neuralClient = new NeuralDrapeClient();
        neuralClientRef.current = neuralClient;
        neuralClient.onFrame = onFrame;
        await neuralClient.initMultiPiece(placedMeshes);
        if (!cancelled) neuralClient.start();
      };

      startSim().catch(e => console.error('[SimLifecycle] Start failed:', e));

      // ─── Cleanup cascade ─── (running → state-change effect cleanup)
      return () => {
        if (warmStartTimerRef.current) {
          clearTimeout(warmStartTimerRef.current);
          warmStartTimerRef.current = null;
        }
        cancelled = true;
        clientRef.current?.dispose();
        clientRef.current = null;
        gpuClientRef.current?.dispose();
        gpuClientRef.current = null;
        tslSolverRef.current = null;
        wasmClientRef.current?.dispose();
        wasmClientRef.current = null;
        neuralClientRef.current?.dispose();
        neuralClientRef.current = null;
        positionsRef.current = null;
        resetFrameWindow();
      };
    } else if (simulationState === 'idle') {
      // ─── Cleanup cascade ─── (idle branch)
      if (warmStartTimerRef.current) {
        clearTimeout(warmStartTimerRef.current);
        warmStartTimerRef.current = null;
      }
      dispatch(setIsWarmStarting(false));
      clientRef.current?.dispose();
      clientRef.current = null;
      gpuClientRef.current?.dispose();
      gpuClientRef.current = null;
      tslSolverRef.current = null;
      wasmClientRef.current?.dispose();
      wasmClientRef.current = null;
      neuralClientRef.current?.dispose();
      neuralClientRef.current = null;
      positionsRef.current = null;
      dispatch(setSolverTier('none'));
      dispatch(setFrameTime(0));
      resetFrameWindow();
      // Clear the overlay summary; `inspector.seamResolutionErrors` is
      // intentionally kept for post-stop inspection (same convention as
      // `lastSolverError`) and replaced wholesale on the next init.
      dispatch(setSeamResolution(null));
    } else if (simulationState === 'paused') {
      // ─── Cleanup cascade ─── (paused branch — stop only, no dispose)
      clientRef.current?.stop();
      gpuClientRef.current?.stop();
      wasmClientRef.current?.stop();
      neuralClientRef.current?.stop();
    }
    return undefined;
    // eslint-disable-next-line react-hooks/exhaustive-deps -- collisionBodies/avatarModelUrl/avatarHeight read from refs to prevent reinit cascades (#315); live updates handled by separate effects. windEnabled/windForce/dragCoefficient also handled separately.
  }, [simulationState, placedMeshes, seamInitData, fabricId, onFrame, stretchingIdsRef, dispatch]);

  // ─── Debounced collision mesh rebuild on measurement/morph change ───────────
  useEffect(() => {
    // Only rebuild if simulation is running and we have a solver client
    const activeClient = gpuClientRef.current || wasmClientRef.current || clientRef.current;
    if (!activeClient || simulationState !== 'running' || !avatarModelUrl) return;

    // Debounce 200ms to batch rapid slider movements
    if (collisionRebuildTimer.current) {
      clearTimeout(collisionRebuildTimer.current);
    }

    collisionRebuildTimer.current = setTimeout(async () => {
      try {
        const collisionMesh = await extractAvatarCollisionMesh(avatarModelUrl, avatarHeight);
        if (!collisionMesh) return;

        // Check client is still alive (user may have stopped sim)
        const client = gpuClientRef.current || wasmClientRef.current || clientRef.current;
        if (client) {
          console.log('[SimLifecycle] ♻️ Collision mesh rebuilt for measurement change:', collisionMesh.triCount, 'tris');
          client.setCollisionMesh(collisionMesh);
        }
      } catch (e) {
        console.warn('[SimLifecycle] Collision mesh rebuild failed:', e);
      }
    }, 200);

    return () => {
      if (collisionRebuildTimer.current) {
        clearTimeout(collisionRebuildTimer.current);
        collisionRebuildTimer.current = null;
      }
    };
  }, [measurements, morphTargets, avatarModelUrl, avatarHeight, simulationState]);

  // ─── Push wind config to GPU solver when it changes ───────────────────────
  useEffect(() => {
    const gpuClient = gpuClientRef.current;
    if (!gpuClient) return;
    const force: [number, number, number] = windEnabled ? windForce : [0, 0, 0];
    gpuClient.setWind(force, dragCoefficient);
  }, [windForce, windEnabled, dragCoefficient]);

  // ─── Push wind config to WASM solver when it changes ──────────────────────
  useEffect(() => {
    const wasmClient = wasmClientRef.current;
    if (!wasmClient) return;
    const force: [number, number, number] = windEnabled ? windForce : [0, 0, 0];
    wasmClient.setWind(force);
  }, [windForce, windEnabled, dragCoefficient]);

  // Note: CPU solver (ClothWorkerClient) does not support live wind updates yet.
  // Wind is only available on GPU and WASM solver tiers.

  // ─── Sync frozen pieces to GPU solver — set invMass=0 for frozen vertices ──
  // Note: WASM and CPU solvers do not support per-piece freeze yet.
  // Freeze is only available on the GPU (TSL) solver tier.
  useEffect(() => {
    if (!gpuClientRef.current) return;
    gpuClientRef.current.freezePieces(frozenPieceIds);
  }, [frozenPieceIds]);

  // ─── Push elastic constraints to active solver ──────────────────────────────
  // Runs when elastics change or when a solver client becomes available.
  // GPU solver does not support elastics yet — only WASM and CPU paths.
  useEffect(() => {
    const wasmClient = wasmClientRef.current;
    const cpuClient = clientRef.current;
    if (wasmClient) {
      wasmClient.setElastics(elastics);
    } else if (cpuClient) {
      cpuClient.setElastics(elastics);
    }
  }, [elastics]);

  return {
    clients: {
      cpu: clientRef.current,
      wasm: wasmClientRef.current,
      gpu: gpuClientRef.current,
      neural: neuralClientRef.current,
    },
    positionsRef,
    edgeDataRef,
    onFrame,
    recordFrameTick,
    tslSolverRef,
  };
}
