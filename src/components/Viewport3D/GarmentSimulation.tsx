/**
 * GarmentSimulation — R3F component that handles multi-piece cloth simulation with seams.
 *
 * Always merges all pieces into one shared solver (with or without seams).
 * All heavy work (meshing, collision mesh extraction, simulation) runs in Web Workers.
 *
 * Simulation concerns are separated into hooks:
 * - useSimulationLifecycle: solver tier cascade, collision loading, start/stop/pause
 * - useCollisionBodies: pin sync to WASM solver
 * - useMeshing: async piece meshing, edit classification, warm-start
 *
 * This component retains only rendering, geometry building, and UI interaction.
 *
 * @module GarmentSimulation
 */

import { Suspense, useRef, useEffect, useCallback, useMemo, forwardRef, useImperativeHandle } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import { useSelector, useDispatch } from 'react-redux';
import { RootState } from '../../store';
import { PatternPiece, Seam } from '../../types/types';
import type { SeamInitData } from '../../utils/cloth/clothWorker';
import { placeGarmentPieces } from '../../utils/cloth/garmentPlacement';
import { computeFitMapData, fabricToFitParams } from '../../utils/cloth/fitMaps';
import { PHYSICAL_FABRIC_LIBRARY, getPhysicalFabric, toMeshPhysicalParams } from '../../utils/cloth/physicalFabric';
import { addPin, setFitMapStats } from '../../store/simulationSlice';
import PinRenderer from './PinRenderer';
import { registerSimulationCallbacks } from '../../store/undoMiddleware';
import { ThreeEvent } from '@react-three/fiber';
import { useGeometricPreview } from './useGeometricPreview';
import { useSimulationLifecycle, SimulationClients } from './useSimulationLifecycle';
import { useCollisionBodies } from './useCollisionBodies';
import { useMeshing } from './useMeshing';

const PIECE_COLORS = ['#e8e4df', '#d4cfc8', '#c8c0b5', '#f0ece6', '#e0d8cc'];

/**
 * Convert Seam[] to SeamInitData[] for the worker.
 */
function seamsToInitData(seams: Seam[]): SeamInitData[] {
  return seams.map(s => ({
    id: s.id,
    pieceAId: s.pieceA.pieceId,
    pieceAEdgeName: s.pieceA.edgeName,
    pieceBId: s.pieceB.pieceId,
    pieceBEdgeName: s.pieceB.edgeName,
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
  const pieceColorsRef = useRef<Float32Array | null>(null);

  // Shared refs for breaking circular dependency between useMeshing and useSimulationLifecycle
  const clientsRef = useRef<SimulationClients>({ cpu: null, wasm: null, gpu: null, neural: null });
  const stretchingIdsRef = useRef<Int32Array | null>(null);

  const simulationState = useSelector((s: RootState) => s.simulation.simulationState);
  const fitMapMode = useSelector((s: RootState) => s.simulation.fitMapMode);
  const fitMapConfig = useSelector((s: RootState) => s.simulation.fitMapConfig);
  const fabricId = useSelector((s: RootState) => s.simulation.defaultFabricId);
  const activeTool3D = useSelector((s: RootState) => s.tools.activeTool3D);
  const pinStrength = useSelector((s: RootState) => s.tools.toolOptions?.['pin']?.pinStrength || 'strong') as 'weak' | 'medium' | 'strong';
  const avatarMeasurements = useSelector((s: RootState) => s.project.avatar.measurements);

  // ─── Meshing ────────────────────────────────────────────────────────────────

  const pieceMeshes = useMeshing({ pieces, clientsRef, stretchingIdsRef });

  // ─── Geometry building ──────────────────────────────────────────────────────

  const { staticGeometry } = useMemo(() => {
    if (pieceMeshes.length === 0) return { staticGeometry: null };

    const placements = placeGarmentPieces(pieces, avatarMeasurements);

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

      const [rx, ry, rz] = placement.rotation;
      const [px, py, pz] = placement.position;
      const cx = Math.cos(rx), sx = Math.sin(rx);
      const cy = Math.cos(ry), sy = Math.sin(ry);
      const cz = Math.cos(rz), sz = Math.sin(rz);

      for (let vi = 0; vi < numVerts; vi++) {
        const vx = p.vertices[vi * 3], vy = p.vertices[vi * 3 + 1], vz = p.vertices[vi * 3 + 2];
        const y1 = vy * cx - vz * sx, z1 = vy * sx + vz * cx;
        const x2 = vx * cy + z1 * sy, z2 = -vx * sy + z1 * cy;
        const x3 = x2 * cz - y1 * sz, y3 = x2 * sz + y1 * cz;
        positions[(vOffset + vi) * 3] = x3 + px;
        positions[(vOffset + vi) * 3 + 1] = y3 + py;
        positions[(vOffset + vi) * 3 + 2] = z2 + pz;
      }

      for (let i = 0; i < numVerts; i++) {
        colors[(vOffset + i) * 3] = color.r;
        colors[(vOffset + i) * 3 + 1] = color.g;
        colors[(vOffset + i) * 3 + 2] = color.b;
      }

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

  // ─── Placed meshes for solver init ──────────────────────────────────────────

  const placedMeshes = useMemo(() => {
    if (pieceMeshes.length === 0) return [];

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

  // ─── Simulation lifecycle (solver cascade + collision) ──────────────────────

  const { clients, positionsRef, edgeDataRef, onFrame } = useSimulationLifecycle({
    placedMeshes,
    seamInitData,
    fabricId,
    stretchingIdsRef,
  });

  // Sync clientsRef so useMeshing's warm-start can access latest solver clients
  useEffect(() => {
    clientsRef.current = clients;
  });

  // ─── Pin sync ───────────────────────────────────────────────────────────────

  useCollisionBodies({ clients });

  // ─── Snapshot imperative handle ─────────────────────────────────────────────

  useImperativeHandle(ref, () => ({
    saveSnapshot: (id: string) => {
      clients.cpu?.saveSnapshot(id);
      clients.wasm?.saveSnapshot(id);
    },
    restoreSnapshot: (id: string) => {
      clients.cpu?.restoreSnapshot(id);
      clients.wasm?.restoreSnapshot(id);
    },
    deleteSnapshot: (id: string) => {
      clients.cpu?.deleteSnapshot(id);
      clients.wasm?.deleteSnapshot(id);
    },
  }), [clients]);

  // Geometric preview: instant vertex displacement on dimension edits
  useGeometricPreview({
    pieces,
    simulationState,
    positionsRef,
    onPreviewFrame: onFrame ? (positions) => {
      onFrame(positions);
    } : null,
  });

  // ─── Per-frame geometry update ──────────────────────────────────────────────

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
        dispatch(setFitMapStats(mapData.stats));
      }
    } else if (fitMapMode === 'none' && pieceColorsRef.current && colorAttr) {
      (colorAttr.array as Float32Array).set(pieceColorsRef.current);
      colorAttr.needsUpdate = true;
      pieceColorsRef.current = null;
      onFitMapStats?.(null);
      dispatch(setFitMapStats(null));
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
          clients.cpu?.saveSnapshot(id);
          clients.wasm?.saveSnapshot(id);
        },
        (id) => {
          clients.cpu?.restoreSnapshot(id);
          clients.wasm?.restoreSnapshot(id);
        },
      );
      return unregister;
    }
  }, [simulationState, clients]);

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
      color: '#e8e4df', roughness: 0.7, metalness: 0, sheen: 0.15, sheenRoughness: 0.7,
      sheenColor: '#e8e4df', clearcoat: 0, clearcoatRoughness: 0,
      transmission: 0, thickness: 0.5, ior: 1.5, opacity: 0.85, side: 'double' as const,
      map: null, normalMap: null, roughnessMap: null, aoMap: null,
      mapRepeat: [4, 4] as [number, number], mapRotation: 0,
    };
  }, [fabricId]);

  // Pin tool: click handler to find nearest vertex and add pin
  const handleMeshClick = useCallback((e: ThreeEvent<MouseEvent>) => {
    if (activeTool3D !== 'pin') return;

    e.stopPropagation();
    const positions = positionsRef.current;
    if (!positions) return;

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
  }, [activeTool3D, dispatch, pinStrength, positionsRef]);

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
 */
const GarmentSimulation = forwardRef<GarmentSimulationHandle, GarmentSimulationProps>(function GarmentSimulation({ pieces, seams, onFitMapStats, onInspect }, ref) {
  return (
    <Suspense fallback={null}>
      <MergedSimulation ref={ref} pieces={pieces} seams={seams} onFitMapStats={onFitMapStats} onInspect={onInspect} />
    </Suspense>
  );
});

export default GarmentSimulation;
