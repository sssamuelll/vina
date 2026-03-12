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
 */

import { useRef, useEffect, useCallback, useState } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import { RootState } from '../../store';
import { ClothWorkerClient } from '../../utils/cloth/clothWorkerClient';
import type { SeamInitData } from '../../utils/cloth/clothWorker';
import { isWebGPUAvailable } from '../../utils/cloth/gpu/webgpuDetect';
import { GpuSolverClient } from '../../utils/cloth/gpu/gpuSolverClient';
import { WasmSolverClient, isWasmSolverAvailable } from '../../utils/cloth/wasm/wasmSolverClient';
import { NeuralDrapeClient } from '../../utils/cloth/neural/neuralDrapeClient';
import { setSolverTier, setFrameTime, setBodyCollision, setIsWarmStarting } from '../../store/simulationSlice';
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
}

interface UseSimulationLifecycleProps {
  placedMeshes: PlacedMesh[];
  seamInitData: SeamInitData[];
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
  /** TSL solver ref for renderer.compute() dispatch */
  tslSolverRef: React.MutableRefObject<import('../../utils/cloth/gpu/tslSolver').TslSolver | null>;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Check localStorage feature flag. Default: true (WebGPU enabled). */
function isWebGPUFeatureEnabled(): boolean {
  try {
    return localStorage.getItem('webclo-use-webgpu') !== 'false';
  } catch {
    return true;
  }
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
  fabricId,
  stretchingIdsRef,
}: UseSimulationLifecycleProps): UseSimulationLifecycleResult {
  const dispatch = useDispatch();
  const simulationState = useSelector((s: RootState) => s.simulation.simulationState);
  const avatarModelUrl = useSelector((s: RootState) => s.project.avatarModelUrl);
  const avatarHeight = useSelector((s: RootState) => s.project.avatar.measurements.height) / 100;
  const collisionBodies = useSelector((s: RootState) => s.collisionBody.bodies);
  const measurements = useSelector((s: RootState) => s.project.avatar.measurements);
  const morphTargets = useSelector((s: RootState) => s.avatar.morphTargets);
  const windForce = useSelector((s: RootState) => s.simulation.windForce);
  const windEnabled = useSelector((s: RootState) => s.simulation.windEnabled);
  const dragCoefficient = useSelector((s: RootState) => s.simulation.dragCoefficient);

  const positionsRef = useRef<Float32Array | null>(null);
  const edgeDataRef = useRef<SolverEdgeData | null>(null);
  const tslSolverRef = useRef<import('../../utils/cloth/gpu/tslSolver').TslSolver | null>(null);

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

  const lastFrameTimeRef = useRef(0);
  const frameCountRef = useRef(0);

  const onFrame = useCallback((positions: Float32Array) => {
    positionsRef.current = positions;
    const now = performance.now();
    if (lastFrameTimeRef.current > 0) {
      frameCountRef.current++;
      if (frameCountRef.current % 30 === 0) {
        const avgMs = (now - lastFrameTimeRef.current) / 30;
        dispatch(setFrameTime(Math.round(avgMs * 10) / 10));
      }
    }
    lastFrameTimeRef.current = now;
  }, [dispatch]);

  // Start/stop simulation — solver tier cascade
  useEffect(() => {
    if (simulationState === 'running' && placedMeshes.length > 0) {
      let cancelled = false;
      const cancelFlag = { get value() { return cancelled; } };

      const startSim = async () => {
        // ─── WebGPU GPU solver ────────────────────────────────────────
        if (isWebGPUFeatureEnabled() && isWebGPUAvailable()) {
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
                  ...(windEnabled ? { windForce, dragCoefficient } : {}),
                };

                await withTimeout(
                  gpuClient.initMultiPieceTsl(placedMeshes, undefined, tslSolverConfig),
                  12000,
                  'TSL solver init',
                );
                if (cancelled) return;
                tslSolverRef.current = gpuClient.getTslSolver();
                setTslGeneration(g => g + 1);

                // Load collision meshes — setCollisionMesh routes through BVH builder in TSL mode
                await loadCollision(gpuClient, avatarModelUrl, avatarHeight, collisionBodies, dispatch, cancelFlag, false);

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
              await withTimeout(wasmClient.initMultiPiece(placedMeshes), 12000, 'Wasm solver init');
              wasmClient.requestEdgeData();

              // Load collision BEFORE starting (prevents explosion)
              await loadCollision(wasmClient, avatarModelUrl, avatarHeight, collisionBodies, dispatch, cancelFlag, true);

              if (!cancelled) wasmClient.start();
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
            await withTimeout(client.initMultiPiece(placedMeshes, seamInitData), 15000, 'CPU worker init');
            client.setFabric(fabricId);
            client.requestEdgeData();

            // Load collision BEFORE starting (prevents explosion)
            await loadCollision(client, avatarModelUrl, avatarHeight, collisionBodies, dispatch, cancelFlag, false);

            if (!cancelled) client.start();
            return;
          } catch (e) {
            console.warn('[SimLifecycle] CPU worker failed, falling back to Neural Drape:', e);
          }
        }

        // ─── Neural Drape (analytical fallback) ────────────────────────
        if (cancelled) return;
        console.log('[SimLifecycle] 🔵 Using Neural Drape (analytical preview)');
        dispatch(setSolverTier('neural-drape'));
        const neuralClient = new NeuralDrapeClient();
        neuralClientRef.current = neuralClient;
        neuralClient.onFrame = onFrame;
        await neuralClient.initMultiPiece(placedMeshes);
        if (!cancelled) neuralClient.start();
      };

      startSim().catch(e => console.error('[SimLifecycle] Start failed:', e));

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
      };
    } else if (simulationState === 'idle') {
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
    } else if (simulationState === 'paused') {
      clientRef.current?.stop();
      gpuClientRef.current?.stop();
      wasmClientRef.current?.stop();
      neuralClientRef.current?.stop();
    }
    return undefined;
  }, [simulationState, placedMeshes, seamInitData, fabricId, onFrame, avatarModelUrl, avatarHeight, collisionBodies, stretchingIdsRef, dispatch]);

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
  }, [windForce, windEnabled]);

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
    tslSolverRef,
  };
}
