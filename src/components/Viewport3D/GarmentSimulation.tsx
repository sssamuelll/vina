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

import { Suspense, useRef, useEffect, useCallback, useMemo, useState, forwardRef, useImperativeHandle } from 'react';
import * as THREE from 'three';
import { MeshStandardNodeMaterial } from 'three/webgpu';
import { useFrame, useThree } from '@react-three/fiber';
import { useSelector, useDispatch } from 'react-redux';
import { RootState } from '../../store';
import { PatternPiece, Seam, SeamGroup } from '../../types/types';
import type { SeamInitData } from '../../utils/cloth/clothWorker';
import { placeGarmentPieces } from '../../utils/cloth/garmentPlacement';
import { computeFitMapData, fabricToFitParams } from '../../utils/cloth/fitMaps';
import { PHYSICAL_FABRIC_LIBRARY, getPhysicalFabric, toMeshPhysicalParams } from '../../utils/cloth/physicalFabric';
import { addPin, setFitMapStats } from '../../store/simulationSlice';
import { textureManager } from '../../utils/textures/TextureManager';
import type { Texture } from 'three';
import PinRenderer from './PinRenderer';
import { registerSimulationCallbacks } from '../../store/undoMiddleware';
import { ThreeEvent } from '@react-three/fiber';
import { useGeometricPreview } from './useGeometricPreview';
import { useSimulationLifecycle, SimulationClients } from './useSimulationLifecycle';
import { useCollisionBodies } from './useCollisionBodies';
import { useMeshing } from './useMeshing';
import { useSimulationRecorder } from '../../hooks/useSimulationRecorder';
import { useSimulationPlayback } from '../../hooks/useSimulationPlayback';
import { SIMULATION_MODES } from '../../utils/cloth/gpu/qualityPresets';
import { computeStiffnessMultiplier } from '../../utils/cloth/interfacing';

const PIECE_COLORS = ['#e8e4df', '#d4cfc8', '#c8c0b5', '#f0ece6', '#e0d8cc'];

/**
 * Convert Seam[] to SeamInitData[] for the worker.
 * Filters out inactive seams and passes extended fields (tension, strength, etc.).
 */
function seamsToInitData(seams: Seam[], seamGroups?: SeamGroup[]): SeamInitData[] {
  // Convert regular seams, filtering out inactive ones
  const seamEntries: SeamInitData[] = seams
    .filter(s => s.active !== false)
    .map(s => ({
      id: s.id,
      pieceAId: s.pieceA.pieceId,
      pieceAEdgeName: s.pieceA.edgeName,
      pieceBId: s.pieceB.pieceId,
      pieceBEdgeName: s.pieceB.edgeName,
      type: s.type,
      pieceARange: s.pieceA.tStart != null && s.pieceA.tEnd != null
        ? [s.pieceA.tStart, s.pieceA.tEnd] as [number, number]
        : undefined,
      pieceBRange: s.pieceB.tStart != null && s.pieceB.tEnd != null
        ? [s.pieceB.tStart, s.pieceB.tEnd] as [number, number]
        : undefined,
      tension: s.tension ?? 100,
      strength: s.strength ?? 1.0,
      active: true,
      taped: s.taped ?? false,
    }));

  // Flatten SeamGroups into additional SeamInitData entries
  if (seamGroups) {
    for (const group of seamGroups) {
      if (!group.active) continue;
      const count = Math.min(group.edgesA.length, group.edgesB.length);
      for (let i = 0; i < count; i++) {
        const edgeA = group.edgesA[i];
        const edgeB = group.edgesB[i];
        seamEntries.push({
          id: `${group.id}_${i}`,
          pieceAId: edgeA.pieceId,
          pieceAEdgeName: edgeA.edgeName,
          pieceBId: edgeB.pieceId,
          pieceBEdgeName: edgeB.edgeName,
          type: group.type,
          pieceARange: edgeA.tStart != null && edgeA.tEnd != null
            ? [edgeA.tStart, edgeA.tEnd] as [number, number]
            : undefined,
          pieceBRange: edgeB.tStart != null && edgeB.tEnd != null
            ? [edgeB.tStart, edgeB.tEnd] as [number, number]
            : undefined,
          tension: group.tension ?? 100,
          strength: group.strength ?? 1.0,
          active: true,
          taped: group.taped ?? false,
        });
      }
    }
  }

  return seamEntries;
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
  const brushDragging = useRef(false);
  const brushCursorRef = useRef<THREE.Mesh>(null);
  const grabDragging = useRef(false);
  const grabCursorRef = useRef<THREE.Mesh>(null);
  // CPU-side grab state for WASM/CPU solver fallback
  const grabIndices = useRef<number[]>([]);
  const grabBasePositions = useRef<Float32Array | null>(null);
  const grabStartPoint = useRef<[number, number, number]>([0, 0, 0]);
  const geometryRef = useRef<THREE.BufferGeometry | null>(null);
  const tslFrameCounter = useRef(0);
  const tslReadbackPending = useRef(false);
  const pieceColorsRef = useRef<Float32Array | null>(null);
  const [tslMaterial, setTslMaterial] = useState<InstanceType<typeof MeshStandardNodeMaterial> | null>(null);

  // Shared refs for breaking circular dependency between useMeshing and useSimulationLifecycle
  const clientsRef = useRef<SimulationClients>({ cpu: null, wasm: null, gpu: null, neural: null });
  const stretchingIdsRef = useRef<Int32Array | null>(null);
  const substepsRef = useRef(SIMULATION_MODES['normal'].substeps);

  const simulationState = useSelector((s: RootState) => s.simulation.simulationState);
  const fitMapMode = useSelector((s: RootState) => s.simulation.fitMapMode);
  const fitMapConfig = useSelector((s: RootState) => s.simulation.fitMapConfig);
  const fabricId = useSelector((s: RootState) => s.simulation.defaultFabricId);
  const activeTool3D = useSelector((s: RootState) => s.tools.activeTool3D);
  const pinStrength = useSelector((s: RootState) => s.tools.toolOptions?.['pin']?.pinStrength || 'strong') as 'weak' | 'medium' | 'strong';
  const avatarMeasurements = useSelector((s: RootState) => s.project.avatar.measurements);
  const pieceTints = useSelector((s: RootState) => s.simulation.pieceTints);
  const pieceUVTransforms = useSelector((s: RootState) => s.simulation.pieceUVTransforms);
  const steamBrush = useSelector((s: RootState) => s.simulation.steamBrush);
  const meshGrab = useSelector((s: RootState) => s.simulation.meshGrab);
  const simulationMode = useSelector((s: RootState) => s.simulation.simulationMode);
  const seamGroups = useSelector((s: RootState) => s.project.seamGroups);
  const hiddenPieceIds = useSelector((s: RootState) => s.simulation.hiddenPieceIds);

  // Filter inactive pieces — only active pieces participate in simulation
  // Also filter out hidden pieces (3D arrangement visibility)
  const activePieces = useMemo(
    () => pieces.filter(p => p.active !== false && !hiddenPieceIds.includes(p.id)),
    [pieces, hiddenPieceIds],
  );

  // ─── Meshing ────────────────────────────────────────────────────────────────

  const pieceMeshes = useMeshing({ pieces: activePieces, clientsRef, stretchingIdsRef });

  // ─── Geometry building ──────────────────────────────────────────────────────

  const { staticGeometry } = useMemo(() => {
    if (pieceMeshes.length === 0) return { staticGeometry: null };

    const placements = placeGarmentPieces(activePieces, avatarMeasurements);

    let totalVerts = 0;
    for (const p of pieceMeshes) {
      totalVerts += p.vertices.length / 3;
    }

    const positions = new Float32Array(totalVerts * 3);
    const colors = new Float32Array(totalVerts * 3);
    const uvs = new Float32Array(totalVerts * 2);
    const indices: number[] = [];
    let vOffset = 0;
    let hasUVs = false;

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

      // UV coordinates from 2D pattern space for texture mapping (static, set once)
      if (p.uvs && p.uvs.length >= numVerts * 2) {
        uvs.set(p.uvs.subarray(0, numVerts * 2), vOffset * 2);
        hasUVs = true;
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
    if (hasUVs) {
      geo.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
    }
    geo.setIndex(indices);
    geo.computeVertexNormals();

    return { staticGeometry: geo };
  }, [pieceMeshes, activePieces, avatarMeasurements]);

  const seamInitData = useMemo(() => seamsToInitData(seams, seamGroups), [seams, seamGroups]);

  // ─── Placed meshes for solver init ──────────────────────────────────────────

  const placedMeshes = useMemo(() => {
    if (pieceMeshes.length === 0) return [];

    const placements = placeGarmentPieces(activePieces, avatarMeasurements);

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
      const piece = activePieces[i];
      const stiffnessMultiplier = computeStiffnessMultiplier(piece?.interfacingType, piece?.solidifyFactor);
      return { ...pm, vertices: transformed, stiffnessMultiplier };
    });
  }, [pieceMeshes, activePieces, avatarMeasurements]);

  // ─── Simulation lifecycle (solver cascade + collision) ──────────────────────

  const { clients, positionsRef, edgeDataRef, onFrame, tslSolverRef } = useSimulationLifecycle({
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

  // ─── Simulation mode → solver substeps sync ────────────────────────────────

  useEffect(() => {
    const mode = SIMULATION_MODES[simulationMode];
    substepsRef.current = mode.substeps;
    // GPU/TSL path
    if (tslSolverRef.current) {
      tslSolverRef.current.updateConfig({ substeps: mode.substeps });
    }
    // WASM / CPU-Worker paths
    clients.wasm?.setConfig({ substeps: mode.substeps });
    clients.cpu?.setConfig({ numSubsteps: mode.substeps });
  }, [simulationMode, tslSolverRef, clients]);

  // ─── Animation recording + playback ────────────────────────────────────────

  const recorder = useSimulationRecorder({ positionsRef });
  const { isPlayingBack } = useSimulationPlayback({ meshRef, recorder });

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
    pieces: activePieces,
    simulationState,
    positionsRef,
    onPreviewFrame: onFrame ? (positions) => {
      onFrame(positions);
    } : null,
  });

  // ─── Per-frame geometry update ──────────────────────────────────────────────

  useFrame(({ gl }) => {
    if (!meshRef.current || !staticGeometry) return;
    if (isPlayingBack) return;

    const solver = tslSolverRef.current;

    // ─── TSL zero-copy path ──────────────────────────────────────────
    if (solver) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const renderer = gl as any;
      const substeps = substepsRef.current;

      // Mesh grab: one-shot init kernel fills per-particle mask + offset on GPU
      const grabActiveVal = solver.grabNodes.grabActive.value;
      const grabInitVal = solver.grabNodes.grabInitPending.value;
      const grabActive = grabActiveVal > 0;
      if (grabActive) {
        if (grabInitVal > 0) {
          renderer.compute(solver.grabNodes.grabInitNode);
          solver.grabNodes.grabInitPending.value = 0;
        }
      }

      for (let s = 0; s < substeps; s++) {
        renderer.compute(solver.preSolve);
        // Wind force (two-pass: accumulate per-triangle, apply per-particle)
        if (solver.windNodes) {
          renderer.compute(solver.windNodes.accumNode);
          renderer.compute(solver.windNodes.applyNode);
        }
        // Batch all stretch colors in one call — graph coloring guarantees
        // no two colors share a vertex, so parallel dispatch is race-free.
        // Reduces ~57 separate submit() calls to 1 per substep.
        renderer.compute(solver.stretchColors);
        if (solver.bend) renderer.compute(solver.bend);
        if (solver.seam) renderer.compute(solver.seam);
        for (const body of solver.collisionBodies) {
          renderer.compute(body.collisionNode);
        }
        renderer.compute(solver.groundClamp);
        // Mesh grab: lerp grabbed particles BEFORE postSolve so velocity
        // derivation (vel = (pos - prevPos) / sdt) captures grab displacement
        // → natural momentum on release instead of dead drop
        if (grabActive) {
          renderer.compute(solver.grabNodes.grabNode);
        }
        renderer.compute(solver.postSolve);
      }

      // Steam brush (once per frame, after substeps settle; skip when inactive)
      if (solver.brushNodes.strength.value > 0) {
        renderer.compute(solver.brushNodes.brushNode);
      }

      renderer.compute(solver.normalZero);
      renderer.compute(solver.normalAccum);
      renderer.compute(solver.normalNormalize);

      // GPU→CPU position readback — keeps CPU geometry in sync with GPU positions
      // so raycasting (for grab/brush tools) works against actual cloth position.
      // Always runs periodically; more frequent when an interaction tool is active.
      tslFrameCounter.current++;
      const gpuClient = clientsRef.current.gpu;
      if (gpuClient && !tslReadbackPending.current && staticGeometry) {
        const isToolActive = activeTool3D === 'meshGrab' || activeTool3D === 'steamBrush';
        const interval = isToolActive ? 3 : 15;
        if (tslFrameCounter.current % interval === 0) {
          tslReadbackPending.current = true;
          gpuClient.readbackPositionsToGeometry(renderer, staticGeometry).then(() => {
            tslReadbackPending.current = false;
          });
        }
      }

      return;
    }

    // ─── CPU readback path (WASM/CPU solvers) ────────────────────────
    {
      const positions = positionsRef.current;
      if (positions && positions.length > 0) {
        const posAttr = staticGeometry.getAttribute('position') as THREE.BufferAttribute;
        if (posAttr && posAttr.array.length === positions.length) {
          (posAttr.array as Float32Array).set(positions);
          posAttr.needsUpdate = true;
          staticGeometry.computeVertexNormals();
          staticGeometry.computeBoundingSphere();
        }
      }
    }

    // Fit map overlay (CPU readback path only)
    const positions = positionsRef.current;
    const colorAttr = staticGeometry.getAttribute('color') as THREE.BufferAttribute;
    if (fitMapMode !== 'none' && edgeDataRef.current && colorAttr && positions && positions.length > 0) {
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
        } else if (format === 'fbx') {
          const { downloadFBX } = await import('../../utils/export/fbxExporter');
          downloadFBX(group, { scale: scale || 0.1, filename });
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

  // Create TSL node material when solver initializes.
  // tslSolverRef.current is used as a dep — it's a ref value that only changes
  // when setTslGeneration triggers a re-render in useSimulationLifecycle.
  useEffect(() => {
    const solver = tslSolverRef.current;
    if (!solver || !staticGeometry) {
      setTslMaterial(null);
      return;
    }

    const mat = new MeshStandardNodeMaterial();
    // Use the SAME storage nodes that compute kernels write to.
    // Creating new storage() nodes would get separate GPU bindings/buffers.
    mat.positionNode = solver.positionBufNode.toAttribute();
    mat.normalNode = solver.normalBufNode.toAttribute();
    mat.side = THREE.DoubleSide;
    mat.transparent = true;
    mat.opacity = renderParams.opacity;
    mat.roughness = renderParams.roughness;
    mat.metalness = renderParams.metalness;
    setTslMaterial(mat);

    return () => {
      mat.dispose();
      setTslMaterial(null);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tslSolverRef.current, staticGeometry]);

  // Effective tint: first active piece with a custom tint, or fallback to fabric color
  const effectiveTint = useMemo(() => {
    for (const p of activePieces) {
      if (pieceTints[p.id]) return pieceTints[p.id];
    }
    return renderParams.color;
  }, [activePieces, pieceTints, renderParams.color]);

  // Effective UV transform: first active piece with custom UV, or fallback to fabric defaults
  const effectiveUV = useMemo(() => {
    for (const p of activePieces) {
      const uv = pieceUVTransforms[p.id];
      if (uv) return uv;
    }
    return { repeatX: renderParams.mapRepeat[0], repeatY: renderParams.mapRepeat[1], rotation: renderParams.mapRotation };
  }, [activePieces, pieceUVTransforms, renderParams.mapRepeat, renderParams.mapRotation]);

  // ─── Texture loading ───────────────────────────────────────────────────────

  const [textures, setTextures] = useState<{
    map: Texture | null;
    normalMap: Texture | null;
    roughnessMap: Texture | null;
    aoMap: Texture | null;
  }>({ map: null, normalMap: null, roughnessMap: null, aoMap: null });

  useEffect(() => {
    const fabric = getPhysicalFabric(fabricId);
    if (!fabric?.textures) {
      setTextures({ map: null, normalMap: null, roughnessMap: null, aoMap: null });
      return;
    }
    const base = '/textures/fabrics/';
    const t = fabric.textures;
    let cancelled = false;

    Promise.all([
      t.diffuse ? textureManager.load(base + t.diffuse, 'srgb') : Promise.resolve(null),
      t.normal ? textureManager.load(base + t.normal, 'srgb-linear') : Promise.resolve(null),
      t.roughness ? textureManager.load(base + t.roughness, 'srgb-linear') : Promise.resolve(null),
      t.ao ? textureManager.load(base + t.ao, 'srgb-linear') : Promise.resolve(null),
    ]).then(([map, normalMap, roughnessMap, aoMap]) => {
      if (cancelled) return;
      setTextures({ map, normalMap, roughnessMap, aoMap });
    });

    return () => { cancelled = true; };
  }, [fabricId]);

  // Apply UV repeat/rotation from effective UV (responds to Redux slider changes)
  useEffect(() => {
    const rotRad = (effectiveUV.rotation ?? 0) * Math.PI / 180;
    [textures.map, textures.normalMap, textures.roughnessMap, textures.aoMap].forEach(tex => {
      if (tex) {
        tex.repeat.set(effectiveUV.repeatX, effectiveUV.repeatY);
        tex.rotation = rotRad;
        tex.needsUpdate = true;
      }
    });
  }, [textures, effectiveUV.repeatX, effectiveUV.repeatY, effectiveUV.rotation]);

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

  // ─── Steam brush interaction ──────────────────────────────────────────────

  const handleBrushStroke = useCallback((point: THREE.Vector3) => {
    const gpuClient = clientsRef.current.gpu;
    if (gpuClient) {
      gpuClient.setBrushParams(
        [point.x, point.y, point.z],
        steamBrush.radius,
        steamBrush.strength,
      );
    }
  }, [steamBrush.radius, steamBrush.strength]);

  const handlePointerDown = useCallback((e: ThreeEvent<PointerEvent>) => {
    // Skip if manual raycaster already started interaction (TSL mode)
    if (grabDragging.current || brushDragging.current) return;
    if (activeTool3D === 'steamBrush') {
      e.stopPropagation();
      brushDragging.current = true;
      handleBrushStroke(e.point);
    } else if (activeTool3D === 'meshGrab') {
      e.stopPropagation();
      grabDragging.current = true;
      const center: [number, number, number] = [e.point.x, e.point.y, e.point.z];
      // Write grab uniforms directly to tslSolverRef (bypasses stale gpuClient ref)
      const solver = tslSolverRef.current;
      const wasmClient = clientsRef.current.wasm;
      if (solver) {
        const g = solver.grabNodes;
        g.grabCenterX.value = center[0];
        g.grabCenterY.value = center[1];
        g.grabCenterZ.value = center[2];
        g.grabRadius.value = meshGrab.radius;
        g.grabStrength.value = meshGrab.strength;
        g.grabActive.value = 1;
        g.grabInitPending.value = 1;
      } else if (wasmClient && positionsRef.current) {
        // WASM fallback: use setPins to grab particles near the click point
        const positions = positionsRef.current;
        const rSq = meshGrab.radius * meshGrab.radius;
        const indices: number[] = [];
        const N = positions.length / 3;
        for (let i = 0; i < N; i++) {
          const dx = positions[i * 3] - center[0];
          const dy = positions[i * 3 + 1] - center[1];
          const dz = positions[i * 3 + 2] - center[2];
          if (dx * dx + dy * dy + dz * dz < rSq) {
            indices.push(i);
          }
        }
        if (indices.length > 0) {
          grabIndices.current = indices;
          grabStartPoint.current = center;
          const base = new Float32Array(indices.length * 3);
          for (let j = 0; j < indices.length; j++) {
            const i = indices[j];
            base[j * 3] = positions[i * 3];
            base[j * 3 + 1] = positions[i * 3 + 1];
            base[j * 3 + 2] = positions[i * 3 + 2];
          }
          grabBasePositions.current = base;
          wasmClient.setPins(indices.map((idx, j) => ({
            vertexIndex: idx,
            position: [base[j * 3], base[j * 3 + 1], base[j * 3 + 2]] as [number, number, number],
          })));
        }
      }
    }
  }, [activeTool3D, handleBrushStroke, meshGrab.radius, meshGrab.strength, positionsRef, tslSolverRef]);

  const handlePointerMove = useCallback((e: ThreeEvent<PointerEvent>) => {
    if (activeTool3D === 'steamBrush') {
      if (brushCursorRef.current) {
        brushCursorRef.current.position.copy(e.point);
        brushCursorRef.current.visible = true;
      }
      if (!brushDragging.current) return;
      e.stopPropagation();
      handleBrushStroke(e.point);
    } else if (activeTool3D === 'meshGrab') {
      if (grabCursorRef.current) {
        grabCursorRef.current.position.copy(e.point);
        grabCursorRef.current.visible = true;
      }
      if (!grabDragging.current) return;
      e.stopPropagation();
      // Write grab center directly to tslSolverRef (bypasses stale gpuClient ref)
      const solver = tslSolverRef.current;
      const wasmClient = clientsRef.current.wasm;
      if (solver) {
        solver.grabNodes.grabCenterX.value = e.point.x;
        solver.grabNodes.grabCenterY.value = e.point.y;
        solver.grabNodes.grabCenterZ.value = e.point.z;
      } else if (wasmClient && grabIndices.current.length > 0 && grabBasePositions.current) {
        const dx = e.point.x - grabStartPoint.current[0];
        const dy = e.point.y - grabStartPoint.current[1];
        const dz = e.point.z - grabStartPoint.current[2];
        const base = grabBasePositions.current;
        const indices = grabIndices.current;
        wasmClient.setPins(indices.map((idx, j) => ({
          vertexIndex: idx,
          position: [base[j * 3] + dx, base[j * 3 + 1] + dy, base[j * 3 + 2] + dz] as [number, number, number],
        })));
      }
    }
  }, [activeTool3D, handleBrushStroke, tslSolverRef]);

  const releaseGrab = useCallback(() => {
    if (!grabDragging.current) return;
    grabDragging.current = false;
    // Write directly to tslSolverRef (bypasses stale gpuClient ref)
    const solver = tslSolverRef.current;
    const wasmClient = clientsRef.current.wasm;
    if (solver) {
      solver.grabNodes.grabActive.value = 0;
    } else if (wasmClient && grabIndices.current.length > 0) {
      wasmClient.clearPins();
      grabIndices.current = [];
      grabBasePositions.current = null;
    }
  }, [tslSolverRef]);

  const handlePointerUp = useCallback(() => {
    brushDragging.current = false;
    const gpuClient = clientsRef.current.gpu;
    if (gpuClient) {
      gpuClient.setBrushParams([0, 0, 0], 0, 0);
    }
    releaseGrab();
  }, [releaseGrab]);

  const handlePointerLeave = useCallback(() => {
    if (brushCursorRef.current) brushCursorRef.current.visible = false;
    if (grabCursorRef.current) grabCursorRef.current.visible = false;
    const gpuClient = clientsRef.current.gpu;
    if (!brushDragging.current && gpuClient) {
      gpuClient.setBrushParams([0, 0, 0], 0, 0);
    }
    releaseGrab();
  }, [releaseGrab]);

  // Global pointerup to handle drag release outside mesh
  useEffect(() => {
    const handleGlobalUp = () => {
      brushDragging.current = false;
      const gpuClient = clientsRef.current.gpu;
      if (gpuClient) {
        gpuClient.setBrushParams([0, 0, 0], 0, 0);
      }
      releaseGrab();
    };
    window.addEventListener('pointerup', handleGlobalUp);
    return () => window.removeEventListener('pointerup', handleGlobalUp);
  }, [releaseGrab]);

  // ─── Manual raycasting for TSL mode ───────────────────────────────────────
  // R3F pointer events (onPointerMove/Down) depend on Three.js raycasting which
  // reads geometry.attributes.position (CPU side). In TSL mode, the mesh is
  // rendered at GPU-computed positions while the CPU geometry may lag behind.
  // This manual raycaster listens directly on the Canvas DOM element and does
  // its own raycast against the readback-updated geometry.
  const { camera, gl: threeGl } = useThree();
  const manualRaycaster = useMemo(() => new THREE.Raycaster(), []);

  useEffect(() => {
    if (activeTool3D !== 'meshGrab' && activeTool3D !== 'steamBrush') return;
    const canvas = threeGl.domElement;
    if (!canvas) return;

    const getNDC = (e: PointerEvent) => {
      const rect = canvas.getBoundingClientRect();
      return new THREE.Vector2(
        ((e.clientX - rect.left) / rect.width) * 2 - 1,
        -((e.clientY - rect.top) / rect.height) * 2 + 1,
      );
    };

    const doRaycast = (e: PointerEvent): THREE.Vector3 | null => {
      if (!meshRef.current || !staticGeometry) return null;
      const ndc = getNDC(e);
      manualRaycaster.setFromCamera(ndc, camera);
      const hits = manualRaycaster.intersectObject(meshRef.current, false);
      return hits.length > 0 ? hits[0].point : null;
    };

    const onMove = (e: PointerEvent) => {
      const hit = doRaycast(e);
      if (activeTool3D === 'meshGrab' && grabCursorRef.current) {
        if (hit) {
          grabCursorRef.current.position.copy(hit);
          grabCursorRef.current.visible = true;
        } else {
          grabCursorRef.current.visible = false;
        }
      }
      if (activeTool3D === 'steamBrush' && brushCursorRef.current) {
        if (hit) {
          brushCursorRef.current.position.copy(hit);
          brushCursorRef.current.visible = true;
        } else {
          brushCursorRef.current.visible = false;
        }
      }
      // Handle dragging
      if (hit) {
        if (activeTool3D === 'steamBrush' && brushDragging.current) {
          handleBrushStroke(hit);
        } else if (activeTool3D === 'meshGrab' && grabDragging.current) {
          // Write grab center directly to tslSolverRef (bypasses stale gpuClient ref)
          const solver = tslSolverRef.current;
          const wasmClient = clientsRef.current.wasm;
          if (solver) {
            solver.grabNodes.grabCenterX.value = hit.x;
            solver.grabNodes.grabCenterY.value = hit.y;
            solver.grabNodes.grabCenterZ.value = hit.z;
          } else if (wasmClient && grabIndices.current.length > 0 && grabBasePositions.current) {
            const dx = hit.x - grabStartPoint.current[0];
            const dy = hit.y - grabStartPoint.current[1];
            const dz = hit.z - grabStartPoint.current[2];
            const base = grabBasePositions.current;
            const indices = grabIndices.current;
            wasmClient.setPins(indices.map((idx, j) => ({
              vertexIndex: idx,
              position: [base[j * 3] + dx, base[j * 3 + 1] + dy, base[j * 3 + 2] + dz] as [number, number, number],
            })));
          }
        }
      }
    };

    const onDown = (e: PointerEvent) => {
      if (grabDragging.current || brushDragging.current) return; // already active
      const hit = doRaycast(e);
      if (!hit) return;
      if (activeTool3D === 'steamBrush') {
        brushDragging.current = true;
        handleBrushStroke(hit);
      } else if (activeTool3D === 'meshGrab') {
        grabDragging.current = true;
        const center: [number, number, number] = [hit.x, hit.y, hit.z];
        // Write grab uniforms directly to tslSolverRef (bypasses stale gpuClient ref)
        const solver = tslSolverRef.current;
        const wasmClient = clientsRef.current.wasm;
        if (solver) {
          const g = solver.grabNodes;
          g.grabCenterX.value = center[0];
          g.grabCenterY.value = center[1];
          g.grabCenterZ.value = center[2];
          g.grabRadius.value = meshGrab.radius;
          g.grabStrength.value = meshGrab.strength;
          g.grabActive.value = 1;
          g.grabInitPending.value = 1;
        } else if (wasmClient && positionsRef.current) {
          const positions = positionsRef.current;
          const rSq = meshGrab.radius * meshGrab.radius;
          const indices: number[] = [];
          const N = positions.length / 3;
          for (let i = 0; i < N; i++) {
            const dx = positions[i * 3] - center[0];
            const dy = positions[i * 3 + 1] - center[1];
            const dz = positions[i * 3 + 2] - center[2];
            if (dx * dx + dy * dy + dz * dz < rSq) indices.push(i);
          }
          if (indices.length > 0) {
            grabIndices.current = indices;
            grabStartPoint.current = center;
            const base = new Float32Array(indices.length * 3);
            for (let j = 0; j < indices.length; j++) {
              const i = indices[j];
              base[j * 3] = positions[i * 3];
              base[j * 3 + 1] = positions[i * 3 + 1];
              base[j * 3 + 2] = positions[i * 3 + 2];
            }
            grabBasePositions.current = base;
            wasmClient.setPins(indices.map((idx, j) => ({
              vertexIndex: idx,
              position: [base[j * 3], base[j * 3 + 1], base[j * 3 + 2]] as [number, number, number],
            })));
          }
        }
      }
    };

    canvas.addEventListener('pointermove', onMove);
    canvas.addEventListener('pointerdown', onDown);
    return () => {
      canvas.removeEventListener('pointermove', onMove);
      canvas.removeEventListener('pointerdown', onDown);
    };
  }, [activeTool3D, camera, threeGl, staticGeometry, manualRaycaster, meshGrab.radius, meshGrab.strength, handleBrushStroke, releaseGrab, positionsRef, tslSolverRef]);

  if (!staticGeometry) return null;

  return (
    <>
      <mesh
        ref={meshRef}
        geometry={staticGeometry}
        onClick={handleMeshClick}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerLeave={handlePointerLeave}
        material={tslMaterial || undefined}
      >
        {!tslMaterial && (
          <meshPhysicalMaterial
            vertexColors={fitMapMode !== 'none'}
            color={effectiveTint || '#ffffff'}
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
            map={fitMapMode === 'none' ? textures.map : null}
            normalMap={textures.normalMap}
            roughnessMap={fitMapMode === 'none' ? textures.roughnessMap : null}
            aoMap={textures.aoMap}
          />
        )}
      </mesh>
      <PinRenderer livePositions={positionsRef.current || undefined} />
      {/* Steam brush cursor */}
      {activeTool3D === 'steamBrush' && (
        <mesh ref={brushCursorRef} visible={false}>
          <sphereGeometry key={steamBrush.radius} args={[steamBrush.radius, 16, 16]} />
          <meshBasicMaterial color="#88ccff" transparent opacity={0.2} depthWrite={false} />
        </mesh>
      )}
      {/* Mesh grab cursor */}
      {activeTool3D === 'meshGrab' && (
        <mesh ref={grabCursorRef} visible={false}>
          <sphereGeometry key={meshGrab.radius} args={[meshGrab.radius, 16, 16]} />
          <meshBasicMaterial color="#ffcc88" transparent opacity={0.2} depthWrite={false} />
        </mesh>
      )}
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
