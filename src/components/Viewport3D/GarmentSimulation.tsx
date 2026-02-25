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
import { useSelector } from 'react-redux';
import { RootState } from '../../store';
import { PatternPiece, Seam } from '../../types/types';
import { ClothWorkerClient } from '../../utils/cloth/clothWorkerClient';
import type { SeamInitData } from '../../utils/cloth/clothWorker';
import { SimulationInitClient, type MeshedPiece } from '../../utils/cloth/simulationInitClient';
import { placeGarmentPieces, computePlacement, detectBodyRegion } from '../../utils/cloth/garmentPlacement';
import { computeFitMapData, fabricToFitParams } from '../../utils/cloth/fitMaps';
import { PHYSICAL_FABRIC_LIBRARY, getPhysicalFabric, toMeshPhysicalParams } from '../../utils/cloth/physicalFabric';
import { isWebGPUAvailable, initWebGPU } from '../../utils/cloth/gpu/webgpuDetect';
import { GpuSolverClient } from '../../utils/cloth/gpu/gpuSolverClient';

const ClothMesh = lazy(() => import('./ClothMesh'));

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
  const [meshingStatus, setMeshingStatus] = useState<string | null>(null);
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

      // Build rotation matrix from Euler angles
      const euler = new THREE.Euler(placement.rotation[0], placement.rotation[1], placement.rotation[2]);
      const rotMatrix = new THREE.Matrix4().makeRotationFromEuler(euler);
      const pos = new THREE.Vector3(...placement.position);

      // Copy vertices with placement transform applied
      for (let vi = 0; vi < numVerts; vi++) {
        const v = new THREE.Vector3(p.vertices[vi * 3], p.vertices[vi * 3 + 1], p.vertices[vi * 3 + 2]);
        v.applyMatrix4(rotMatrix);
        v.add(pos);
        positions[(vOffset + vi) * 3] = v.x;
        positions[(vOffset + vi) * 3 + 1] = v.y;
        positions[(vOffset + vi) * 3 + 2] = v.z;
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

  const onFrame = useCallback((positions: Float32Array) => {
    positionsRef.current = positions;
  }, []);

  // GPU solver client ref
  const gpuClientRef = useRef<GpuSolverClient | null>(null);

  // Apply placement transforms
  const placedMeshes = useMemo(() => {
    return pieceMeshes.map((pm, i) => {
      const region = detectBodyRegion(pieces[i]?.name ?? '');
      const placement = computePlacement(region, avatarMeasurements, i, pieces.length);
      const euler = new THREE.Euler(placement.rotation[0], placement.rotation[1], placement.rotation[2]);
      const rotMatrix = new THREE.Matrix4().makeRotationFromEuler(euler);
      const pos = new THREE.Vector3(...placement.position);

      const numVerts = pm.vertices.length / 3;
      const transformed = new Array<number>(pm.vertices.length);
      for (let vi = 0; vi < numVerts; vi++) {
        const v = new THREE.Vector3(pm.vertices[vi * 3], pm.vertices[vi * 3 + 1], pm.vertices[vi * 3 + 2]);
        v.applyMatrix4(rotMatrix);
        v.add(pos);
        transformed[vi * 3] = v.x;
        transformed[vi * 3 + 1] = v.y;
        transformed[vi * 3 + 2] = v.z;
      }
      return { ...pm, vertices: transformed };
    });
  }, [pieceMeshes, pieces, avatarMeasurements]);

  // Start/stop simulation — WebGPU preferred, CPU Web Worker fallback
  useEffect(() => {
    if (simulationState === 'running' && placedMeshes.length > 0) {
      let cancelled = false;

      const startSim = async () => {
        // ─── Try WebGPU ───────────────────────────────────────────────
        if (isWebGPUAvailable()) {
          try {
            const gpuCtx = await initWebGPU();
            if (gpuCtx && !cancelled) {
              console.log('[GarmentSimulation] 🟢 Using WebGPU solver');
              const gpuClient = new GpuSolverClient(gpuCtx.device);
              gpuClientRef.current = gpuClient;
              gpuClient.onFrame = onFrame;

              await gpuClient.initMultiPiece(placedMeshes);

              if (!cancelled) gpuClient.start();

              // SDF loaded async after simulation starts (non-blocking)
              if (avatarModelUrl && !cancelled) {
                import('../../utils/cloth/avatarSDF').then(({ buildAvatarSDF }) =>
                  buildAvatarSDF(avatarModelUrl, avatarHeight)
                ).then(sdf => {
                  if (!cancelled) gpuClient.setSDF(sdf);
                }).catch(e => console.warn('[GarmentSimulation] Avatar SDF failed:', e));
              }
              return;
            }
          } catch (e) {
            console.warn('[GarmentSimulation] WebGPU failed, falling back to CPU:', e);
          }
        }

        // ─── Fallback: CPU Web Worker ─────────────────────────────────
        if (cancelled) return;
        console.log('[GarmentSimulation] 🟡 Using CPU solver (Web Worker fallback)');
        const client = new ClothWorkerClient();
        clientRef.current = client;
        client.onFrame = onFrame;
        client.onEdgeData = (ids, lengths) => {
          edgeDataRef.current = { stretchingIds: ids, stretchingLengths: lengths };
        };

        await client.initMultiPiece(placedMeshes, seamInitData);
        client.setFabric(fabricId);
        client.requestEdgeData();

        if (!cancelled) client.start();

        // SDF loaded async after simulation starts (non-blocking)
        if (avatarModelUrl && !cancelled) {
          import('../../utils/cloth/avatarSDF').then(({ buildAvatarSDF }) =>
            buildAvatarSDF(avatarModelUrl, avatarHeight)
          ).then(sdf => {
            if (!cancelled) client.setSDF(sdf);
          }).catch(e => console.warn('[GarmentSimulation] Avatar SDF failed:', e));
        }
      };

      startSim().catch(e => console.error('[GarmentSimulation] Start failed:', e));

      return () => {
        cancelled = true;
        clientRef.current?.dispose();
        clientRef.current = null;
        gpuClientRef.current?.dispose();
        gpuClientRef.current = null;
        positionsRef.current = null;
      };
    } else if (simulationState === 'idle') {
      clientRef.current?.dispose();
      clientRef.current = null;
      gpuClientRef.current?.dispose();
      gpuClientRef.current = null;
      positionsRef.current = null;
    } else if (simulationState === 'paused') {
      clientRef.current?.stop();
      gpuClientRef.current?.stop();
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
