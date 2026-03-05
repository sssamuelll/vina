/**
 * GarmentSimulation — R3F component that handles multi-piece cloth simulation with seams.
 *
 * Always merges all pieces into one shared solver (with or without seams).
 * All heavy work (meshing, collision mesh extraction, simulation) runs in Web Workers.
 *
 * @module GarmentSimulation
 */

import { Suspense, useRef, useEffect, useCallback, useMemo, useState, forwardRef, useImperativeHandle } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import { useSelector, useDispatch } from 'react-redux';
import { RootState } from '../../store';
import { PatternPiece, Seam } from '../../types/types';
import { ClothWorkerClient } from '../../utils/cloth/clothWorkerClient';
import type { SeamInitData } from '../../utils/cloth/clothWorker';
import { SimulationInitClient } from '../../utils/cloth/simulationInitClient';
import { placeGarmentPieces } from '../../utils/cloth/garmentPlacement';
import { computeFitMapData, fabricToFitParams } from '../../utils/cloth/fitMaps';
import { PHYSICAL_FABRIC_LIBRARY, getPhysicalFabric, toMeshPhysicalParams } from '../../utils/cloth/physicalFabric';
import { isWebGPUAvailable, initWebGPU } from '../../utils/cloth/gpu/webgpuDetect';
import { GpuSolverClient } from '../../utils/cloth/gpu/gpuSolverClient';
import { WasmSolverClient, isWasmSolverAvailable } from '../../utils/cloth/wasm/wasmSolverClient';
import { NeuralDrapeClient } from '../../utils/cloth/neural/neuralDrapeClient';
import { setSolverTier, setFrameTime, setParticleCount, setBodyCollision, addPin, setIsWarmStarting } from '../../store/simulationSlice';
import { classifyEdit } from '../../utils/cloth/editClassifier';
import { computeRestLengths } from '../../utils/cloth/restLengthComputer';
import { extractAvatarCollisionMesh } from '../../utils/cloth/avatarCollisionMesh';
import PinRenderer from './PinRenderer';
import { registerSimulationCallbacks } from '../../store/undoMiddleware';
import { ThreeEvent } from '@react-three/fiber';
import { useGeometricPreview } from './useGeometricPreview';

const PIECE_COLORS = ['#e8e4df', '#d4cfc8', '#c8c0b5', '#f0ece6', '#e0d8cc'];


/**
 * Convert Seam[] to SeamInitData[] for the worker.
 */
function seamsToInitData(seams: Seam[]): SeamInitData[] {
  return seams.map(s => ({
    id: s.id,
    pieceAId: s.pieceA.pieceId,
    pieceAEdgeStart: s.pieceA.edgeStart,
    pieceAEdgeEnd: s.pieceA.edgeEnd,
    pieceBId: s.pieceB.pieceId,
    pieceBEdgeStart: s.pieceB.edgeStart,
    pieceBEdgeEnd: s.pieceB.edgeEnd,
    type: s.type,
  }));
}

export interface GarmentSimulationHandle {
  saveSnapshot: (id: string) => void;
  restoreSnapshot: (id: string) => void;
  deleteSnapshot: (id: string) => void;
}

interface GarmentSimulationProps {
  pieces: PatternPiece[];
  seams: Seam[];
  onFitMapStats?: (stats: import('../../utils/cloth/fitMaps').FitMapStats | null) => void;
  onInspect?: (value: number | null) => void;
}

/**
 * Merged multi-piece simulation component.
 * Renders all pieces as a single merged mesh with vertex colors.
 */
const MergedSimulation = forwardRef<GarmentSimulationHandle, GarmentSimulationProps>(function MergedSimulation({ pieces, seams, onFitMapStats }, ref) {
  const dispatch = useDispatch();
  const meshRef = useRef<THREE.Mesh>(null);
  const geometryRef = useRef<THREE.BufferGeometry | null>(null);
  const positionsRef = useRef<Float32Array | null>(null);
  const clientRef = useRef<ClothWorkerClient | null>(null);
  const edgeDataRef = useRef<import('../../utils/cloth/fitMaps').SolverEdgeData | null>(null);
  const pieceColorsRef = useRef<Float32Array | null>(null);

  const simulationState = useSelector((s: RootState) => s.simulation.simulationState);
  const fitMapMode = useSelector((s: RootState) => s.simulation.fitMapMode);
  const fitMapConfig = useSelector((s: RootState) => s.simulation.fitMapConfig);
  const fabricId = useSelector((s: RootState) => s.simulation.defaultFabricId);
  const avatarModelUrl = useSelector((s: RootState) => s.project.avatarModelUrl);
  const avatarHeight = useSelector((s: RootState) => s.project.avatar.measurements.height) / 100; // cm → m
  const globalParticleDistance = useSelector((s: RootState) => s.simulation.particleDistance);
  const pieceParticleDistances = useSelector((s: RootState) => s.simulation.pieceParticleDistance);
  const activeTool3D = useSelector((s: RootState) => s.tools.activeTool3D);
  const pinStrength = useSelector((s: RootState) => s.tools.toolOptions?.['pin']?.pinStrength || 'strong') as 'weak' | 'medium' | 'strong';
  const pinnedVertices = useSelector((s: RootState) => s.simulation.pinnedVertices);

  // Async meshing via Web Worker (never blocks main thread)
  const [pieceMeshes, setPieceMeshes] = useState<Array<{
    pieceId: string;
    vertices: Float32Array;
    triIds: Int32Array;
    outline: Array<{ type: string; values: number[] }>;
  }>>([]);
  const [, setMeshingStatus] = useState<string | null>(null);
  const initClientRef = useRef<SimulationInitClient | null>(null);

  // Track previous pieces for edit classification
  const prevPiecesRef = useRef<PatternPiece[]>([]);
  // Track warm-start debounce timer
  const warmStartTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Track current stretching IDs for rest length computation
  const stretchingIdsRef = useRef<Int32Array | null>(null);

  useEffect(() => {
    // Skip re-meshing for dimension-only edits when solver is active
    // The warm-start effect handles those
    if (prevPiecesRef.current.length > 0 && (simulationState === 'running' || simulationState === 'paused')) {
      const editType = classifyEdit(prevPiecesRef.current, pieces);
      if (editType === 'dimension') {
        return; // Warm-start effect handles this
      }
    }

    let cancelled = false;
    const client = new SimulationInitClient();
    initClientRef.current = client;
    client.onProgress = (p) => {
      if (!cancelled) setMeshingStatus(`${p.stage} (${p.current}/${p.total})`);
    };

    (async () => {
      setMeshingStatus('Meshing pieces...');
      const meshed = await client.meshAllPieces(pieces, pieceParticleDistances, globalParticleDistance);
      if (cancelled) return;

      const result = meshed.map(m => {
        const piece = pieces.find(p => p.id === m.pieceId);
        return {
          ...m,
          outline: (piece?.outline ?? []) as Array<{ type: string; values: number[] }>,
        };
      });

      setPieceMeshes(result);
      const totalParticles = result.reduce((sum, p) => sum + p.vertices.length / 3, 0);
      dispatch(setParticleCount(totalParticles));
      setMeshingStatus(null);
    })().catch(err => {
      if (!cancelled) {
        console.error('[GarmentSimulation] Async meshing failed:', err);
        setMeshingStatus(null);
      }
    });

    return () => {
      cancelled = true;
      client.dispose();
      initClientRef.current = null;
    };
  }, [pieces, globalParticleDistance, pieceParticleDistances, simulationState, dispatch]);

  // Warm-start on dimension-only edits (skip full re-mesh, update constraints in-place)
  useEffect(() => {
    const prevPieces = prevPiecesRef.current;
    prevPiecesRef.current = pieces;

    // Skip on first render or when no solver is active
    if (prevPieces.length === 0) return;
    if (simulationState !== 'running' && simulationState !== 'paused') return;

    const editType = classifyEdit(prevPieces, pieces);
    if (editType !== 'dimension') return;

    // Dimension edit detected — warm-start path
    if (warmStartTimerRef.current) {
      clearTimeout(warmStartTimerRef.current);
    }

    dispatch(setIsWarmStarting(true));

    // Debounce 500ms before re-computing constraints
    warmStartTimerRef.current = setTimeout(() => {
      const client = new SimulationInitClient();
      client.meshAllPieces(pieces, pieceParticleDistances, globalParticleDistance)
        .then(meshed => {
          client.dispose();

          const stretchIds = stretchingIdsRef.current;
          if (!stretchIds || meshed.length === 0) return;

          // Merge all piece vertices (same order as solver)
          const totalVerts = meshed.reduce((sum, p) => sum + p.vertices.length, 0);
          const mergedVerts = new Float32Array(totalVerts);
          let offset = 0;
          for (const p of meshed) {
            mergedVerts.set(p.vertices, offset);
            offset += p.vertices.length;
          }

          const newRestLengths = computeRestLengths(mergedVerts, stretchIds);

          // Send to active solver
          if (clientRef.current) {
            clientRef.current.updateConstraints(newRestLengths);
          } else if (wasmClientRef.current) {
            wasmClientRef.current.updateConstraints(newRestLengths);
          }

          // Update pieceMeshes so static rendering matches
          setPieceMeshes(meshed.map(m => {
            const piece = pieces.find(p => p.id === m.pieceId);
            return {
              ...m,
              outline: (piece?.outline ?? []) as Array<{ type: string; values: number[] }>,
            };
          }));

          dispatch(setIsWarmStarting(false));
        })
        .catch(err => {
          client.dispose();
          console.warn('[GarmentSimulation] Warm-start re-mesh failed:', err);
          dispatch(setIsWarmStarting(false));
        });
    }, 500);

    return () => {
      if (warmStartTimerRef.current) {
        clearTimeout(warmStartTimerRef.current);
        warmStartTimerRef.current = null;
      }
    };
  }, [pieces, simulationState, pieceParticleDistances, globalParticleDistance, dispatch]);

  // Compute placements for each piece
  const avatarMeasurements = useSelector((s: RootState) => s.project.avatar.measurements);

  // Build merged geometry for rendering (static initial state)
  // Uses pure math Euler rotation — no per-vertex Three.js object allocation
  const { staticGeometry } = useMemo(() => {
    if (pieceMeshes.length === 0) return { staticGeometry: null };

    // Compute placements
    const placements = placeGarmentPieces(pieces, avatarMeasurements);

    // Count totals
    let totalVerts = 0;
    for (const p of pieceMeshes) {
      totalVerts += p.vertices.length / 3;
    }

    const positions = new Float32Array(totalVerts * 3);
    const colors = new Float32Array(totalVerts * 3);
    const indices: number[] = [];
    let vOffset = 0;

    for (let pi = 0; pi < pieceMeshes.length; pi++) {
      const p = pieceMeshes[pi];
      const numVerts = p.vertices.length / 3;
      const color = new THREE.Color(PIECE_COLORS[pi % PIECE_COLORS.length]);
      const placement = placements[pi];

      // Pure math Euler rotation (XYZ order) — no Three.js objects per vertex
      const [rx, ry, rz] = placement.rotation;
      const [px, py, pz] = placement.position;
      const cx = Math.cos(rx), sx = Math.sin(rx);
      const cy = Math.cos(ry), sy = Math.sin(ry);
      const cz = Math.cos(rz), sz = Math.sin(rz);

      for (let vi = 0; vi < numVerts; vi++) {
        const vx = p.vertices[vi * 3], vy = p.vertices[vi * 3 + 1], vz = p.vertices[vi * 3 + 2];
        // Euler XYZ: Rz * Ry * Rx * v
        const y1 = vy * cx - vz * sx, z1 = vy * sx + vz * cx;
        const x2 = vx * cy + z1 * sy, z2 = -vx * sy + z1 * cy;
        const x3 = x2 * cz - y1 * sz, y3 = x2 * sz + y1 * cz;
        positions[(vOffset + vi) * 3] = x3 + px;
        positions[(vOffset + vi) * 3 + 1] = y3 + py;
        positions[(vOffset + vi) * 3 + 2] = z2 + pz;
      }

      // Set vertex colors
      for (let i = 0; i < numVerts; i++) {
        colors[(vOffset + i) * 3] = color.r;
        colors[(vOffset + i) * 3 + 1] = color.g;
        colors[(vOffset + i) * 3 + 2] = color.b;
      }

      // Copy indices with offset
      for (let i = 0; i < p.triIds.length; i++) {
        indices.push(p.triIds[i] + vOffset);
      }

      vOffset += numVerts;
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const colorAttr = new THREE.BufferAttribute(colors, 3);
    geo.setAttribute('color', colorAttr);
    geo.setIndex(indices);
    geo.computeVertexNormals();

    return { staticGeometry: geo };
  }, [pieceMeshes, pieces, avatarMeasurements]);

  const seamInitData = useMemo(() => seamsToInitData(seams), [seams]);

  const lastFrameTimeRef = useRef(0);
  const frameCountRef = useRef(0);
  const onFrame = useCallback((positions: Float32Array) => {
    positionsRef.current = positions;
    // Track frame time (report every 30 frames to avoid Redux spam)
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

  // GPU solver client ref
  const gpuClientRef = useRef<GpuSolverClient | null>(null);
  const wasmClientRef = useRef<WasmSolverClient | null>(null);
  const neuralClientRef = useRef<NeuralDrapeClient | null>(null);

  useImperativeHandle(ref, () => ({
    saveSnapshot: (id: string) => {
      clientRef.current?.saveSnapshot(id);
      wasmClientRef.current?.saveSnapshot(id);
    },
    restoreSnapshot: (id: string) => {
      clientRef.current?.restoreSnapshot(id);
      wasmClientRef.current?.restoreSnapshot(id);
    },
    deleteSnapshot: (id: string) => {
      clientRef.current?.deleteSnapshot(id);
      wasmClientRef.current?.deleteSnapshot(id);
    },
  }), []);

  // Geometric preview: instant vertex displacement on dimension edits
  useGeometricPreview({
    pieces,
    simulationState,
    positionsRef,
    onPreviewFrame: onFrame ? (positions) => {
      onFrame(positions);
    } : null,
  });

  // Apply placement transforms (pure math, no Three.js objects per vertex)
  // Uses placeGarmentPieces for consistency with staticGeometry rendering
  const placedMeshes = useMemo(() => {
    if (pieceMeshes.length === 0) return [];

    // Use placeGarmentPieces to correctly distribute pieces around avatar
    // This handles 'unknown' pieces by spreading them in a circle rather than
    // placing them all at the same position (which causes explosion on sim start)
    const placements = placeGarmentPieces(pieces, avatarMeasurements);

    return pieceMeshes.map((pm, i) => {
      const placement = placements[i] || { position: [0, 1.0, -0.2], rotation: [0, 0, 0] };
      const [rx, ry, rz] = placement.rotation;
      const [px, py, pz] = placement.position;
      const cx = Math.cos(rx), sx = Math.sin(rx);
      const cy = Math.cos(ry), sy = Math.sin(ry);
      const cz = Math.cos(rz), sz = Math.sin(rz);

      const numVerts = pm.vertices.length / 3;
      const transformed = new Float32Array(pm.vertices.length);
      for (let vi = 0; vi < numVerts; vi++) {
        const vx = pm.vertices[vi * 3], vy = pm.vertices[vi * 3 + 1], vz = pm.vertices[vi * 3 + 2];
        const y1 = vy * cx - vz * sx, z1 = vy * sx + vz * cx;
        const x2 = vx * cy + z1 * sy, z2 = -vx * sy + z1 * cy;
        const x3 = x2 * cz - y1 * sz, y3 = x2 * sz + y1 * cz;
        transformed[vi * 3] = x3 + px;
        transformed[vi * 3 + 1] = y3 + py;
        transformed[vi * 3 + 2] = z2 + pz;
      }
      return { ...pm, vertices: transformed };
    });
  }, [pieceMeshes, pieces, avatarMeasurements]);

  // Start/stop simulation — WebGPU preferred, CPU Web Worker fallback
  useEffect(() => {
    if (simulationState === 'running' && placedMeshes.length > 0) {
      let cancelled = false;

      // Race a promise against a timeout
      function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
        return Promise.race([
          p,
          new Promise<T>((_, rej) => setTimeout(() => rej(new Error(`${label} timed out (${ms}ms)`)), ms)),
        ]);
      }

      const startSim = async () => {
        // ─── WebGPU (DISABLED) ─────────────────────────────────────────
        // WebGPU shader compilation blocks the main thread (sync GPU calls).
        // WGSL shaders are unvalidated on real GPU. Skipping until validated.
        // TODO: Re-enable after shader validation + async compilation.
        if (false as boolean && isWebGPUAvailable()) {
          try {
            const gpuCtx = await withTimeout(initWebGPU(), 5000, 'WebGPU init');
            if (gpuCtx && !cancelled) {
              console.log('[GarmentSimulation] 🟢 Using WebGPU solver');
              dispatch(setSolverTier('webgpu'));
              const gpuClient = new GpuSolverClient(gpuCtx.device);
              gpuClientRef.current = gpuClient;
              gpuClient.onFrame = onFrame;

              await withTimeout(gpuClient.initMultiPiece(placedMeshes), 10000, 'GPU solver init');

              if (!cancelled) gpuClient.start();

              // GPU solver doesn't support triangle collision yet
              if (avatarModelUrl && !cancelled) {
                dispatch(setBodyCollision(false));
              }
              return;
            }
          } catch (e) {
            console.warn('[GarmentSimulation] WebGPU failed, falling back:', e);
          }
        }

        // ─── Try Wasm XPBD (~3x faster than JS) ──────────────────────
        if (!cancelled) {
          try {
            const wasmAvailable = await withTimeout(isWasmSolverAvailable(), 5000, 'Wasm check').catch(() => false);
            if (wasmAvailable && !cancelled) {
              console.log('[GarmentSimulation] 🟠 Using Wasm XPBD solver');
              dispatch(setSolverTier('wasm'));
              const wasmClient = new WasmSolverClient();
              wasmClientRef.current = wasmClient;
              wasmClient.onFrame = onFrame;

              await withTimeout(wasmClient.initMultiPiece(placedMeshes), 12000, 'Wasm solver init');

              // Load collision mesh BEFORE starting simulation to prevent explosion
              if (avatarModelUrl && !cancelled) {
                console.log('[GarmentSimulation] Loading avatar collision data...');
                try {
                  const collisionMesh = await withTimeout(
                    extractAvatarCollisionMesh(avatarModelUrl, avatarHeight),
                    5000,
                    'Collision mesh extraction'
                  );
                  if (collisionMesh && !cancelled) {
                    console.log('[GarmentSimulation] ✅ Collision mesh extracted:', collisionMesh.triCount, 'triangles');
                    wasmClient.setCollisionMesh(collisionMesh);
                    wasmClient.applyInitialTriangleCollision();
                    dispatch(setBodyCollision(true));
                  } else if (!cancelled) {
                    dispatch(setBodyCollision(false));
                  }
                } catch (e) {
                  console.warn('[GarmentSimulation] Collision data load failed:', e);
                  dispatch(setBodyCollision(false));
                }
              }

              if (!cancelled) wasmClient.start();
              return;
            } else if (!cancelled) {
              console.warn('[GarmentSimulation] Wasm solver not available or timed out');
            }
          } catch (e) {
            console.warn('[GarmentSimulation] Wasm failed, falling back to CPU:', e);
          }
        }

        // ─── Tier 3: CPU Web Worker ──────────────────────────────────
        if (!cancelled) {
          try {
            console.log('[GarmentSimulation] 🟡 Using CPU solver (Web Worker fallback)');
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

            // Load collision mesh BEFORE starting simulation (CPU)
            if (avatarModelUrl && !cancelled) {
              console.log('[GarmentSimulation] Extracting collision mesh (CPU)...');
              try {
                const collisionMesh = await withTimeout(
                  extractAvatarCollisionMesh(avatarModelUrl, avatarHeight),
                  5000,
                  'Collision mesh extraction'
                );
                if (collisionMesh && !cancelled) {
                  console.log('[GarmentSimulation] ✅ Collision mesh extracted for CPU:', collisionMesh.triCount, 'triangles');
                  client.setCollisionMesh(collisionMesh);
                  dispatch(setBodyCollision(true));
                } else if (!cancelled) {
                  dispatch(setBodyCollision(false));
                }
              } catch (e) {
                console.warn('[GarmentSimulation] Collision mesh extraction failed (CPU):', e);
                dispatch(setBodyCollision(false));
              }
            }

            if (!cancelled) client.start();
            return;
          } catch (e) {
            console.warn('[GarmentSimulation] CPU worker failed, falling back to Neural Drape:', e);
          }
        }

        // ─── Tier 4: Neural Drape (analytical fallback) ─────────────
        if (cancelled) return;
        console.log('[GarmentSimulation] 🔵 Using Neural Drape (analytical preview)');
        dispatch(setSolverTier('neural-drape'));
        const neuralClient = new NeuralDrapeClient();
        neuralClientRef.current = neuralClient;
        neuralClient.onFrame = onFrame;

        await neuralClient.initMultiPiece(placedMeshes);
        if (!cancelled) neuralClient.start();
      };

      startSim().catch(e => console.error('[GarmentSimulation] Start failed:', e));

      return () => {
        // Cancel any pending warm-start
        if (warmStartTimerRef.current) {
          clearTimeout(warmStartTimerRef.current);
          warmStartTimerRef.current = null;
        }
        cancelled = true;
        clientRef.current?.dispose();
        clientRef.current = null;
        gpuClientRef.current?.dispose();
        gpuClientRef.current = null;
        wasmClientRef.current?.dispose();
        wasmClientRef.current = null;
        neuralClientRef.current?.dispose();
        neuralClientRef.current = null;
        positionsRef.current = null;
      };
    } else if (simulationState === 'idle') {
      // Cancel pending warm-start and clear warm-start state
      if (warmStartTimerRef.current) {
        clearTimeout(warmStartTimerRef.current);
        warmStartTimerRef.current = null;
      }
      dispatch(setIsWarmStarting(false));
      clientRef.current?.dispose();
      clientRef.current = null;
      gpuClientRef.current?.dispose();
      gpuClientRef.current = null;
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
  }, [simulationState, placedMeshes, seamInitData, fabricId, onFrame, avatarModelUrl, avatarHeight, dispatch]);

  // Sync pinned vertices to Wasm solver
  useEffect(() => {
    const wasmClient = wasmClientRef.current;
    if (!wasmClient) return;

    const pins = Object.values(pinnedVertices);
    if (pins.length === 0) {
      wasmClient.clearPins();
    } else {
      wasmClient.setPins(pins.map(p => ({
        vertexIndex: p.vertexIndex,
        position: p.targetPosition,
      })));
    }
  }, [pinnedVertices]);

  // Per-frame geometry update
  useFrame(() => {
    if (!meshRef.current || !staticGeometry) return;
    const positions = positionsRef.current;
    if (!positions) return;

    const posAttr = staticGeometry.getAttribute('position') as THREE.BufferAttribute;
    if (posAttr && posAttr.array.length === positions.length) {
      (posAttr.array as Float32Array).set(positions);
      posAttr.needsUpdate = true;
      staticGeometry.computeVertexNormals();
      staticGeometry.computeBoundingSphere();
    }

    // Compute fit map overlay colors
    const colorAttr = staticGeometry.getAttribute('color') as THREE.BufferAttribute;
    if (fitMapMode !== 'none' && edgeDataRef.current && colorAttr) {
      // Save original piece colors on first fit-map frame
      if (!pieceColorsRef.current) {
        pieceColorsRef.current = new Float32Array(colorAttr.array as Float32Array);
      }
      const numP = positions.length / 3;
      const fabric = PHYSICAL_FABRIC_LIBRARY.find((f: { id: string }) => f.id === fabricId);
      const fitParams = fabric ? fabricToFitParams(fabric) : {
        maxStretchRatio: 0.08, weight: 150, thickness: 0.4, avgStretch: 0.025,
      };
      const mapData = computeFitMapData(
        fitMapMode, positions, numP, edgeDataRef.current, fitParams, null, fitMapConfig,
      );
      if (mapData) {
        (colorAttr.array as Float32Array).set(mapData.colors);
        colorAttr.needsUpdate = true;
        onFitMapStats?.(mapData.stats);
      }
    } else if (fitMapMode === 'none' && pieceColorsRef.current && colorAttr) {
      // Restore original piece colors
      (colorAttr.array as Float32Array).set(pieceColorsRef.current);
      colorAttr.needsUpdate = true;
      pieceColorsRef.current = null;
      onFitMapStats?.(null);
    }
  });

  useEffect(() => {
    geometryRef.current = staticGeometry;
  }, [staticGeometry]);

  // Debug hook for E2E testing — exposes mesh to window for Playwright
  useEffect(() => {
    if (typeof window !== 'undefined' && meshRef.current) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (window as any).__OPENCLO_CLOTH_MESH__ = meshRef.current;
    }
    return () => {
      if (typeof window !== 'undefined') {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        delete (window as any).__OPENCLO_CLOTH_MESH__;
      }
    };
  }, [staticGeometry]);

  // Register snapshot callbacks with undo middleware when simulation is active
  useEffect(() => {
    if (simulationState !== 'idle') {
      const unregister = registerSimulationCallbacks(
        (id) => {
          clientRef.current?.saveSnapshot(id);
          wasmClientRef.current?.saveSnapshot(id);
        },
        (id) => {
          clientRef.current?.restoreSnapshot(id);
          wasmClientRef.current?.restoreSnapshot(id);
        },
      );
      return unregister;
    }
  }, [simulationState]);

  // Listen for 3D export events from copilot tools
  useEffect(() => {
    const handler = async (e: Event) => {
      const { format, filename, scale, binary } = (e as CustomEvent).detail || {};
      if (!meshRef.current) return;

      const group = new THREE.Group();
      group.add(meshRef.current.clone(true));

      try {
        if (format === 'obj') {
          const { downloadOBJ } = await import('../../utils/export/objExporter');
          downloadOBJ(group, { filename, scale: scale || 0.1 });
        } else if (format === 'glb' || format === 'gltf') {
          const { downloadGLTF } = await import('../../utils/export/gltfExporter');
          await downloadGLTF(group, { filename, binary: binary ?? true });
        }
      } catch (err) {
        console.error('[GarmentSimulation] 3D export failed:', err);
      }
    };
    window.addEventListener('openclo:export3d', handler);
    return () => window.removeEventListener('openclo:export3d', handler);
  }, []);

  // Derive render params from selected fabric
  const renderParams = useMemo(() => {
    const fabric = getPhysicalFabric(fabricId);
    if (fabric) return toMeshPhysicalParams(fabric);
    return {
      roughness: 0.7, metalness: 0, sheen: 0.15, sheenRoughness: 0.7,
      sheenColor: '#e8e4df', clearcoat: 0, clearcoatRoughness: 0,
      transmission: 0, thickness: 0.5, ior: 1.5, opacity: 0.85,
    };
  }, [fabricId]);

  // Pin tool: click handler to find nearest vertex and add pin
  const handleMeshClick = useCallback((e: ThreeEvent<MouseEvent>) => {
    if (activeTool3D !== 'pin') return;

    e.stopPropagation();
    const positions = positionsRef.current;
    if (!positions) return;

    // Find the nearest vertex to the click point
    const clickPoint = e.point;
    const numParticles = positions.length / 3;

    let minDistSq = Infinity;
    let nearestIdx = 0;

    for (let i = 0; i < numParticles; i++) {
      const dx = positions[i * 3] - clickPoint.x;
      const dy = positions[i * 3 + 1] - clickPoint.y;
      const dz = positions[i * 3 + 2] - clickPoint.z;
      const distSq = dx * dx + dy * dy + dz * dz;

      if (distSq < minDistSq) {
        minDistSq = distSq;
        nearestIdx = i;
      }
    }

    // Add pin at the nearest vertex
    const pinPosition: [number, number, number] = [
      positions[nearestIdx * 3],
      positions[nearestIdx * 3 + 1],
      positions[nearestIdx * 3 + 2],
    ];

    dispatch(addPin({
      vertexIndex: nearestIdx,
      position: pinPosition,
      strength: pinStrength,
    }));

    console.log(`[Pin Tool] Added pin at vertex ${nearestIdx}, position:`, pinPosition);
  }, [activeTool3D, dispatch, pinStrength]);

  if (!staticGeometry) return null;

  return (
    <>
      <mesh
        ref={meshRef}
        geometry={staticGeometry}
        onClick={handleMeshClick}
      >
        <meshPhysicalMaterial
          vertexColors
          side={THREE.DoubleSide}
          transparent
          opacity={renderParams.opacity}
          roughness={renderParams.roughness}
          metalness={renderParams.metalness}
          sheen={renderParams.sheen}
          sheenRoughness={renderParams.sheenRoughness}
          sheenColor={renderParams.sheenColor}
          clearcoat={renderParams.clearcoat}
          clearcoatRoughness={renderParams.clearcoatRoughness}
          transmission={renderParams.transmission}
          thickness={renderParams.thickness}
          ior={renderParams.ior}
        />
      </mesh>
      <PinRenderer livePositions={positionsRef.current || undefined} />
    </>
  );
});

/**
 * GarmentSimulation — always uses MergedSimulation for all pieces.
 *
 * Previously had a ClothMesh-per-piece fallback for no-seam patterns,
 * but that path ran CDT meshing + SDF generation on the main thread,
 * freezing the browser. MergedSimulation uses Web Workers for everything.
 * When no seams exist, the solver simply has no seam constraints.
 */
const GarmentSimulation = forwardRef<GarmentSimulationHandle, GarmentSimulationProps>(function GarmentSimulation({ pieces, seams, onFitMapStats, onInspect }, ref) {
  return (
    <Suspense fallback={null}>
      <MergedSimulation ref={ref} pieces={pieces} seams={seams} onFitMapStats={onFitMapStats} onInspect={onInspect} />
    </Suspense>
  );
});

export default GarmentSimulation;
