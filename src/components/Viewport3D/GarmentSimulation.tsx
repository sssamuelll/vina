/**
 * GarmentSimulation — R3F component that handles multi-piece cloth simulation with seams.
 *
 * When seams exist, merges all connected pieces into one shared solver.
 * When no seams exist, falls back to individual ClothMesh per piece.
 *
 * @module GarmentSimulation
 */

import { Suspense, lazy, useRef, useEffect, useCallback, useMemo, useState } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import { useSelector, useDispatch } from 'react-redux';
import { RootState } from '../../store';
import { PatternPiece, Seam } from '../../types/types';
import { ClothWorkerClient } from '../../utils/cloth/clothWorkerClient';
import type { SeamInitData } from '../../utils/cloth/clothWorker';
import { SimulationInitClient } from '../../utils/cloth/simulationInitClient';
import { placeGarmentPieces, computePlacement, detectBodyRegion } from '../../utils/cloth/garmentPlacement';
import { computeFitMapData, fabricToFitParams } from '../../utils/cloth/fitMaps';
import { PHYSICAL_FABRIC_LIBRARY, getPhysicalFabric, toMeshPhysicalParams } from '../../utils/cloth/physicalFabric';
import { isWebGPUAvailable, initWebGPU } from '../../utils/cloth/gpu/webgpuDetect';
import { GpuSolverClient } from '../../utils/cloth/gpu/gpuSolverClient';
import { WasmSolverClient, isWasmSolverAvailable } from '../../utils/cloth/wasm/wasmSolverClient';
import { NeuralDrapeClient } from '../../utils/cloth/neural/neuralDrapeClient';
import { setSolverTier, setFrameTime, setParticleCount } from '../../store/simulationSlice';

const ClothMesh = lazy(() => import('./ClothMesh'));

const PIECE_COLORS = ['#e8e4df', '#d4cfc8', '#c8c0b5', '#f0ece6', '#e0d8cc'];

/**
 * Load avatar mesh and generate SDF off the main thread.
 * GLB loading + mesh extraction happen on main thread (fast, async IO),
 * but the heavy generateSDF computation runs in the simulation worker.
 */
async function loadSDFInWorker(
  avatarUrl: string,
  avatarHeight: number,
  initClient: SimulationInitClient | null,
): Promise<import('../../utils/cloth/sdfGenerator').SDFData | null> {
  const { buildAvatarSDF } = await import('../../utils/cloth/avatarSDF');
  const { extractMeshData } = await import('../../utils/cloth/avatarSDF');

  // If we have a worker client, use it for the heavy SDF computation
  if (initClient) {
    // Load and extract mesh data on main thread (fast — just GLB parse + bone transforms)
    const THREE = await import('three');
    const { GLTFLoader } = await import('three/examples/jsm/loaders/GLTFLoader.js');
    const { isVRMFile, loadVRM } = await import('../../utils/avatar/vrmLoader');

    let scene: THREE.Group;
    if (isVRMFile(avatarUrl)) {
      const result = await loadVRM(avatarUrl);
      scene = result.scene;
    } else {
      const loader = new GLTFLoader();
      const gltf = await loader.loadAsync(avatarUrl);
      scene = gltf.scene as THREE.Group;
    }

    // Scale + center (same as avatarSDF.ts)
    const box = new THREE.Box3().setFromObject(scene);
    const size = new THREE.Vector3();
    box.getSize(size);
    if (size.y > 0) {
      const scale = avatarHeight / size.y;
      scene.scale.setScalar(scale);
      const scaledBox = new THREE.Box3().setFromObject(scene);
      const scaledCenter = new THREE.Vector3();
      scaledBox.getCenter(scaledCenter);
      scene.position.y = -scaledBox.min.y;
      scene.position.x = -scaledCenter.x;
      scene.position.z = -scaledCenter.z;
    }
    scene.updateMatrixWorld(true);

    const { vertices, indices } = extractMeshData(scene);
    if (vertices.length === 0 || indices.length === 0) return null;

    // Heavy SDF generation runs in the worker
    return initClient.generateSDF(vertices, indices, 64);
  }

  // Fallback: run everything on main thread (will block, but at least works)
  return buildAvatarSDF(avatarUrl, avatarHeight);
}

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
function MergedSimulation({ pieces, seams, onFitMapStats }: GarmentSimulationProps) {
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

  // Async meshing via Web Worker (never blocks main thread)
  const [pieceMeshes, setPieceMeshes] = useState<Array<{
    pieceId: string;
    vertices: number[];
    triIds: number[];
    outline: Array<{ type: string; values: number[] }>;
  }>>([]);
  const [_meshingStatus, setMeshingStatus] = useState<string | null>(null);
  const initClientRef = useRef<SimulationInitClient | null>(null);

  useEffect(() => {
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
  }, [pieces, globalParticleDistance, pieceParticleDistances]);

  // Compute placements for each piece
  const avatarMeasurements = useSelector((s: RootState) => s.project.avatar.measurements);

  // Build merged geometry for rendering (static initial state)
  // Uses pure math Euler rotation — no per-vertex Three.js object allocation
  const { staticGeometry } = useMemo(() => {
    if (pieceMeshes.length === 0) return { staticGeometry: null };

    // Compute placements
    const placements = pieces.map((piece, i) => {
      const region = detectBodyRegion(piece.name);
      return computePlacement(region, avatarMeasurements, i, pieces.length);
    });

    // Count totals
    let totalVerts = 0;
    let totalTris = 0;
    for (const p of pieceMeshes) {
      totalVerts += p.vertices.length / 3;
      totalTris += p.triIds.length;
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

  // Apply placement transforms (pure math, no Three.js objects per vertex)
  const placedMeshes = useMemo(() => {
    return pieceMeshes.map((pm, i) => {
      const region = detectBodyRegion(pieces[i]?.name ?? '');
      const placement = computePlacement(region, avatarMeasurements, i, pieces.length);
      const [rx, ry, rz] = placement.rotation;
      const [px, py, pz] = placement.position;
      const cx = Math.cos(rx), sx = Math.sin(rx);
      const cy = Math.cos(ry), sy = Math.sin(ry);
      const cz = Math.cos(rz), sz = Math.sin(rz);

      const numVerts = pm.vertices.length / 3;
      const transformed = new Array<number>(pm.vertices.length);
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

              // SDF loaded via worker after simulation starts (truly non-blocking)
              if (avatarModelUrl && !cancelled) {
                loadSDFInWorker(avatarModelUrl, avatarHeight, initClientRef.current).then(sdf => {
                  if (sdf && !cancelled) gpuClient.setSDF(sdf);
                }).catch(e => console.warn('[GarmentSimulation] Avatar SDF failed:', e));
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
            const wasmAvailable = await withTimeout(isWasmSolverAvailable(), 3000, 'Wasm check').catch(() => false);
            if (wasmAvailable && !cancelled) {
              console.log('[GarmentSimulation] 🟠 Using Wasm XPBD solver');
              dispatch(setSolverTier('wasm'));
              const wasmClient = new WasmSolverClient();
              wasmClientRef.current = wasmClient;
              wasmClient.onFrame = onFrame;

              await withTimeout(wasmClient.initMultiPiece(placedMeshes), 10000, 'Wasm solver init');

              if (!cancelled) wasmClient.start();

              // SDF loaded via worker (truly non-blocking)
              if (avatarModelUrl && !cancelled) {
                loadSDFInWorker(avatarModelUrl, avatarHeight, initClientRef.current).then(sdf => {
                  if (sdf && !cancelled) wasmClient.setSDF(sdf);
                }).catch(e => console.warn('[GarmentSimulation] Avatar SDF failed:', e));
              }
              return;
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
            };

            await withTimeout(client.initMultiPiece(placedMeshes, seamInitData), 15000, 'CPU worker init');
            client.setFabric(fabricId);
            client.requestEdgeData();

            if (!cancelled) client.start();

            // SDF loaded via worker (truly non-blocking)
            if (avatarModelUrl && !cancelled) {
              loadSDFInWorker(avatarModelUrl, avatarHeight, initClientRef.current).then(sdf => {
                if (sdf && !cancelled) client.setSDF(sdf);
              }).catch(e => console.warn('[GarmentSimulation] Avatar SDF failed:', e));
            }
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
  }, [simulationState, placedMeshes, seamInitData, fabricId, onFrame, avatarModelUrl, avatarHeight]);

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

  if (!staticGeometry) return null;

  return (
    <mesh ref={meshRef} geometry={staticGeometry}>
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
  );
}

/**
 * GarmentSimulation — decides whether to use merged or individual simulation.
 */
export default function GarmentSimulation({ pieces, seams, onFitMapStats, onInspect }: GarmentSimulationProps) {
  const { selectedPieceIds } = useSelector((s: RootState) => s.editor);
  const hasSeams = seams.length > 0;

  if (hasSeams) {
    return (
      <Suspense fallback={null}>
        <MergedSimulation pieces={pieces} seams={seams} onFitMapStats={onFitMapStats} onInspect={onInspect} />
      </Suspense>
    );
  }

  // No seams — fall back to individual ClothMesh per piece
  const measurements = useSelector((s: RootState) => s.project.avatar.measurements);
  const placements = placeGarmentPieces(pieces, measurements);
  return (
    <Suspense fallback={null}>
      {pieces.map((piece, i) => (
        <ClothMesh
          key={piece.id}
          piece={piece}
          isSelected={selectedPieceIds.includes(piece.id)}
          color={PIECE_COLORS[i % PIECE_COLORS.length]}
          position={placements[i].position}
          onFitMapStats={i === 0 ? onFitMapStats : undefined}
          onInspect={onInspect}
        />
      ))}
    </Suspense>
  );
}
