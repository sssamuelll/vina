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
import { useDisposable } from './hooks/useDisposable';
import * as THREE from 'three';
import { MeshStandardNodeMaterial } from 'three/webgpu';
// Same type-only deep import as tslSolver.ts/tslCollision.ts — the TSL solver
// node fields are typed against this, so the per-substep batch list reuses it.
import type ComputeNode from 'three/src/nodes/gpgpu/ComputeNode.js';
import { useFrame, useThree } from '@react-three/fiber';
import { useSelector, useDispatch } from 'react-redux';
import { RootState } from '../../store';
import { PatternPiece, Seam, SeamGroup } from '../../types/types';
import type { SeamInitData } from '../../utils/cloth/clothWorker';
import { seamInitDataToPairs } from '../../utils/cloth/seamPairs';
import { buildSeamFillIndices } from './seamFill';
import { resolveArrangementWithFrames } from '../../utils/cloth/arrangement/arrangementBinding';
import { computeEffectiveRegions } from '../../utils/cloth/garmentPlacement';
import { wrapPlacedMesh } from '../../utils/cloth/arrangement/wrapPlacedMesh';
import { buildAxisHints } from '../../utils/cloth/arrangement/buildAxisHints';
import { computeFitMapData, fabricToFitParams } from '../../utils/cloth/fitMaps';
import { PHYSICAL_FABRIC_LIBRARY, getPhysicalFabric, toMeshPhysicalParams } from '../../utils/cloth/physicalFabric';
import { addPin, setCollisionDistance, setFitMapStats, setPieceOpacity } from '../../store/simulationSlice';
import { showErrorToast } from '../../store/copilotUISlice';
import { textureManager } from '../../utils/textures/TextureManager';
import type { Texture } from 'three';
import PinRenderer from './PinRenderer';
import SimSeamLines from './SimSeamLines';
import { registerSimulationCallbacks } from '../../store/undoMiddleware';
import { ThreeEvent } from '@react-three/fiber';
import { useGeometricPreview } from './useGeometricPreview';
import { useSimulationLifecycle, SimulationClients } from './useSimulationLifecycle';
import { GPU_CAPABILITIES } from '../../utils/cloth/solverCapabilities';
import { FACE_POKE_GENERATE_CADENCE } from '../../utils/cloth/gpu/tslFacePoke';
import { isRendererDeviceLost, markRendererDeviceLost } from './rendererDeviceLost';
import { isTetherDisabled } from './tetherFlag';
import { useCollisionBodies } from './useCollisionBodies';
import { useMeshing } from './useMeshing';
import { useSimulationRecorder } from '../../hooks/useSimulationRecorder';
import { useSimulationPlayback } from '../../hooks/useSimulationPlayback';
import { SIMULATION_MODES } from '../../utils/cloth/gpu/qualityPresets';
import { computeStiffnessMultiplier } from '../../utils/cloth/interfacing';
import { computePenetrationMetric, getPenetrationBody, penetrationStrideFor } from '../../utils/cloth/penetrationMetric';
import { computeFacePokeMetric, getFacePokeMetricBody, facePokeStrideFor } from '../../utils/cloth/facePokeMetric';
import { mapClothSimConfigToWasmSolverConfig, type SharedClothSimConfigKeys } from '../../utils/cloth/configBridge';
import type { ClothSimConfig } from '../../utils/cloth/xpbdSolver';
import {
  dispatchBrushStroke,
  dispatchBrushClear,
  dispatchGrabInit,
  type ClothToolTiers,
  type GrabHandle,
} from '../../utils/cloth/toolDispatch';

const PIECE_COLORS = ['#e6e0f8', '#dcece2', '#f4e4d9', '#dfe9f6', '#f2e0e8']; // pasteles con hue (lavanda/salvia/durazno/cielo/rosa) — refresh 2026-07-04

// Body-tether (frente#2): frame at which the drape is settled enough to capture
// tether targets from the cloth's wrapped-on-body positions. 150 frames ≈ 2.5 s
// — the M4 checkpoint the e2e validates as settled (seams closed, garment on
// body). Capturing here (vs init) is the root-cause fix for the tether collapse.
const TETHER_SETTLE_FRAMES = 150;

// Penetration metric cadence (plan drape-profesional §A1): every 4th position
// readback (readbacks run every 15 frames → metric ≈ every 60 frames ≈ 2 s).
// Cheap and honest — it's an oracle, not a gate. Cost per tick: ≤~7ms
// (sample-budgeted stride, see penetrationStrideFor) + one-time ~60ms lazy
// body build (pseudonormals + hash) on the first tick after a body registers.
const PENETRATION_READBACK_CADENCE = 4;

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
      // Sewing direction (Fase 5) — flows through every tier's resolution.
      pieceBReversed: s.pieceB.reversed === true ? true : undefined,
      tension: s.tension ?? 100,
      strength: s.strength ?? 1.0,
      active: true,
      taped: s.taped ?? false,
      // Proveniencia — solo para el color de las seam lines (seamThreadColor).
      createdBy: s.createdBy,
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
  getPositions?: () => Float32Array | null;
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
  // Renderer obtained early (before the lifecycle hook) so we can seed the
  // GPU-downgrade latch from the renderer device's known-lost state (#901).
  const { camera, gl: threeGl } = useThree();
  const rendererDevice = (threeGl as unknown as { backend?: { device?: GPUDevice } })?.backend?.device;
  // This component remounts on every Stop→Start (`useClothSim`), but the
  // renderer/device outlive it; the module-level registry remembers a past loss
  // so a restart over a dead renderer device skips the GPU tier immediately.
  const rendererDeviceAlreadyLost = !!rendererDevice && isRendererDeviceLost(rendererDevice);
  const meshRef = useRef<THREE.Mesh>(null);
  const brushDragging = useRef(false);
  const brushCursorRef = useRef<THREE.Mesh>(null);
  const grabCursorRef = useRef<THREE.Mesh>(null);
  // Mesh grab handle (C4 follow-up #702): `dispatchGrabInit` returns a typed
  // handle whose `.move`/`.release` methods close over the per-grab tier +
  // state. Active iff `current != null`; replaces the previous shared
  // `GrabState` ref + boolean `grabDragging` pair.
  const grabHandleRef = useRef<GrabHandle | null>(null);
  const geometryRef = useRef<THREE.BufferGeometry | null>(null);
  const tslFrameCounter = useRef(0);
  const tslReadbackPending = useRef(false);
  // §A1: completed-readback counter — the penetration metric runs on every
  // PENETRATION_READBACK_CADENCE-th resolved readback.
  const tslReadbackCount = useRef(0);
  // Body-tether (frente#2) settle-capture state. Targets MUST be captured from
  // the SETTLED drape (cloth wrapped on the body), NOT at init where positions
  // are the pre-wrap spread-out layout (~0.6 m mean from the body → garbage
  // targets → clamp drags cloth down, belowHip 72% collapse). `requested` fires
  // the async GPU readback recapture once; `ready` gates the kernel until good
  // targets exist.
  const tetherCaptureRequested = useRef(false);
  const tetherReady = useRef(false);
  // B1 off-switch: read once per mount (mirror of the e2e addInitScript
  // pattern); suppresses the capture below so `tetherReady` never arms.
  const tetherDisabled = useRef(isTetherDisabled());
  // 2a/2b-lite: identidad del solver del frame anterior — un re-init (T-pose
  // →A-pose por armAxis, cambio de fabric/medidas) crea un TslSolver NUEVO;
  // los contadores de settle (tether, readbacks) deben contar desde el
  // ÚLTIMO seed, no desde el mount, o el tether captura la pose transitoria.
  const lastSolverRef = useRef<import('../../utils/cloth/gpu/tslSolver').TslSolver | null>(null);
  // Dev A/B del face-poke (track piel): forzar el pase sin recompilar.
  const facePokeForced = useRef(
    typeof window !== 'undefined' &&
      (window as unknown as { localStorage?: Storage }).localStorage?.getItem('openclo-facepoke-on') === 'true',
  );
  // Renderer WebGPU device-loss latch (#901). Set the instant the renderer's
  // device.lost resolves so useFrame stops dispatching renderer.compute() on a
  // dead device — without waiting for the lifecycle effect to tear down the TSL
  // solver. Seeded from the registry so a remount over an already-dead renderer
  // device (Stop→Start, which resets per-mount refs but NOT the renderer) starts
  // latched. The renderer can't be revived in-place; recovery needs a reload.
  const rendererDeviceLostRef = useRef(rendererDeviceAlreadyLost);
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
  const surfaceMode3D = useSelector((s: RootState) => s.simulation.surfaceMode3D);
  const activeTool3D = useSelector((s: RootState) => s.tools.activeTool3D);
  const pinStrength = useSelector((s: RootState) => s.tools.toolOptions?.['pin']?.pinStrength || 'strong') as 'weak' | 'medium' | 'strong';
  const avatarMeasurements = useSelector((s: RootState) => s.project.avatar.measurements);
  // M2 (camisa de María): the user's arrange-mode drags MUST reach the
  // solver — before this selector, placedMeshes ignored them and Simulate
  // silently discarded manual placement (hallazgo A).
  const arrangementOverrides = useSelector((s: RootState) => s.project.arrangementOverrides);
  const pieceTints = useSelector((s: RootState) => s.simulation.pieceTints);
  const pieceUVTransforms = useSelector((s: RootState) => s.simulation.pieceUVTransforms);
  const pieceOpacity = useSelector((s: RootState) => s.simulation.pieceOpacity);
  const pieceEmission = useSelector((s: RootState) => s.simulation.pieceEmission);
  const pieceEmissionIntensity = useSelector((s: RootState) => s.simulation.pieceEmissionIntensity);
  const steamBrush = useSelector((s: RootState) => s.simulation.steamBrush);
  const meshGrab = useSelector((s: RootState) => s.simulation.meshGrab);
  const simulationMode = useSelector((s: RootState) => s.simulation.simulationMode);
  const seamGroups = useSelector((s: RootState) => s.project.seamGroups);
  const elastics = useSelector((s: RootState) => s.project.elastics);
  const hiddenPieceIds = useSelector((s: RootState) => s.simulation.hiddenPieceIds);
  const hiddenLayerIds = useSelector((s: RootState) => s.simulation.hiddenLayerIds);
  const xrayMode = useSelector((s: RootState) => s.simulation.xrayMode);
  const xrayActiveLayer = useSelector((s: RootState) => s.simulation.xrayActiveLayer);
  const armAxis = useSelector((s: RootState) => s.simulation.armAxis);
  const avatarModelUrl = useSelector((s: RootState) => s.project.avatarModelUrl);

  // Filter inactive pieces — only active pieces participate in simulation
  // Also filter out hidden pieces (3D arrangement visibility) and hidden layers
  const activePieces = useMemo(
    () => pieces.filter(p =>
      p.active !== false
      && !hiddenPieceIds.includes(p.id)
      && !hiddenLayerIds.includes(p.layer ?? 1)
    ),
    [pieces, hiddenPieceIds, hiddenLayerIds],
  );

  // ─── X-ray opacity ──────────────────────────────────────────────────────────
  // When xrayMode is on, set active-layer pieces to full opacity and others to 0.2
  useEffect(() => {
    if (!xrayMode) return;
    for (const p of pieces) {
      if (p.active === false) continue;
      const layer = p.layer ?? 1;
      const opacity = (xrayActiveLayer === layer) ? 1.0 : 0.2;
      dispatch(setPieceOpacity({ pieceId: p.id, opacity }));
    }
  }, [xrayMode, xrayActiveLayer, pieces, dispatch]);

  // ─── Meshing ────────────────────────────────────────────────────────────────

  const pieceMeshes = useMeshing({ pieces: activePieces, clientsRef, stretchingIdsRef });

  // ─── Geometry building ──────────────────────────────────────────────────────

  // Hoisted sobre el memo de geometría: el seam fill strip (abajo) necesita
  // los pares de costura para puentear la ranura del piso físico en el render.
  const seamInitData = useMemo(() => seamsToInitData(seams, seamGroups), [seams, seamGroups]);

  const { staticGeometry } = useMemo(() => {
    if (pieceMeshes.length === 0) return { staticGeometry: null };

    const axisHints = buildAxisHints(activePieces, armAxis);
    const arrangement = resolveArrangementWithFrames(activePieces, avatarMeasurements, arrangementOverrides, { axisHints, skeletonReady: armAxis.ready });
    // Index the arrangement by pieceId: useMeshing may drop pieces that fail to
    // mesh, so pieceMeshes is not guaranteed index-aligned with activePieces.
    const arrangeById = new Map(activePieces.map((p, i) => [p.id, arrangement[i]]));

    // Skip stale meshes whose piece was deleted: pieceMeshes is async React
    // state, activePieces shrinks synchronously, so a just-deleted piece has a
    // mesh but no frame. The old `?? arrangement[pi]` fallback destructured
    // `undefined` here and crashed the memo (#924).
    const validMeshes = pieceMeshes.filter(p => arrangeById.has(p.pieceId));
    if (validMeshes.length === 0) return { staticGeometry: null };

    let totalVerts = 0;
    for (const p of validMeshes) {
      totalVerts += p.vertices.length / 3;
    }

    const positions = new Float32Array(totalVerts * 3);
    const colors = new Float32Array(totalVerts * 3);
    const uvs = new Float32Array(totalVerts * 2);
    const indices: number[] = [];
    let vOffset = 0;
    let hasUVs = false;

    // Piezas con vértices ENVUELTOS — el seam fill resuelve pares sobre la
    // misma pose que el solver (placedMeshes) para paridad exacta de conteo.
    const wrappedMeshes: Array<(typeof validMeshes)[number]> = [];

    for (let pi = 0; pi < validMeshes.length; pi++) {
      const p = validMeshes[pi];
      const numVerts = p.vertices.length / 3;
      const color = new THREE.Color(PIECE_COLORS[pi % PIECE_COLORS.length]);
      const { frame, flip, wrapParams } = arrangeById.get(p.pieceId)!;

      // Envelope wrap (Task 5): curve each piece's flat mesher vertices over the
      // region cylinder (frame.point already carries the gross landmark, so the
      // wrap fully replaces the old rigid Euler rotate+translate). `flip` is the
      // M4-C anatomy-up correction. MUST stay identical to the solver loop.
      const curved = wrapPlacedMesh(p.vertices, frame, wrapParams, flip);
      positions.set(curved, vOffset * 3);
      wrappedMeshes.push({ ...p, vertices: curved });

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
    // Normales ANTES del fill: con las piezas aún separadas los puentes son
    // grandes y sesgarían las normales init (el GPU las recalcula por frame
    // sobre los triángulos de SIM — el strip nunca entra a esa suma).
    geo.computeVertexNormals();

    // Seam fill strip (costura-real): puentea la ranura del piso físico
    // (2mm shell, A3) SOLO en el index de render — sin él, la piel asoma
    // como línea a lo largo de toda costura cosida ("línea marrón",
    // hallazgo 2026-07-06). Cero vértices nuevos, cero física, cero costo
    // por frame. Kill-switch dev: localStorage 'openclo-seamfill' = 'off'.
    const seamFillEnabled = typeof window === 'undefined'
      || window.localStorage?.getItem('openclo-seamfill') !== 'off';
    if (seamFillEnabled && seamInitData.length > 0) {
      const offsets = new Map<string, number>();
      let acc = 0;
      for (const p of validMeshes) { offsets.set(p.pieceId, acc); acc += p.vertices.length / 3; }
      const fill = buildSeamFillIndices(seamInitDataToPairs(seamInitData, wrappedMeshes), offsets);
      if (fill.length > 0) geo.setIndex([...indices, ...fill]);
    }

    return { staticGeometry: geo };
  }, [pieceMeshes, activePieces, avatarMeasurements, arrangementOverrides, armAxis, seamInitData]);
  useDisposable(staticGeometry);

  // ─── Placed meshes for solver init ──────────────────────────────────────────

  const placedMeshes = useMemo(() => {
    if (pieceMeshes.length === 0) return [];

    // M2: arrange-mode drags apply here too — what the user sees in the
    // arrange view is EXACTLY where the solver starts.
    const axisHints = buildAxisHints(activePieces, armAxis);
    const arrangement = resolveArrangementWithFrames(activePieces, avatarMeasurements, arrangementOverrides, { axisHints, skeletonReady: armAxis.ready });
    // Index by pieceId — pieceMeshes may have dropped failed-to-mesh pieces, so
    // it is not guaranteed index-aligned with activePieces (matches render loop).
    const arrangeById = new Map(activePieces.map((p, i) => [p.id, arrangement[i]]));

    // Per-region tether radii (frente#2): one deterministic pass via
    // computeEffectiveRegions (same toggle-reset semantics as the arrangement path).
    const regions = computeEffectiveRegions(activePieces);
    const regionById = new Map(activePieces.map((p, i) => [p.id, regions[i] as string]));

    // Skip stale meshes (deleted piece, no frame) — same guard as the render
    // loop; the old `?? arrangement[i]` fallback destructured undefined (#924).
    return pieceMeshes
      .filter(pm => arrangeById.has(pm.pieceId))
      .map((pm) => {
      const { frame, flip, wrapParams } = arrangeById.get(pm.pieceId)!;
      // Envelope wrap (Task 5): IDENTICAL call to the render loop above — render
      // and solver must not diverge. `frame.point` carries the landmark; `flip`
      // is the M4-C anatomy-up correction.
      const transformed = wrapPlacedMesh(pm.vertices, frame, wrapParams, flip);
      const piece = activePieces.find(p => p.id === pm.pieceId);
      const stiffnessMultiplier = computeStiffnessMultiplier(piece?.interfacingType, piece?.solidifyFactor);
      const pressurePa = piece?.pressurePa ?? 0;
      const foldInternals = piece?.internals?.filter(l => l.type === 'fold' && l.foldOptions);
      return { ...pm, vertices: transformed, stiffnessMultiplier, pressurePa, internals: foldInternals, region: regionById.get(pm.pieceId) };
    });
    // armAxis dep is load-bearing: when AvatarModel publishes posed arm dirs (async), this rebuilds → the solver re-seeds in A-pose. Removing it strands sleeves in T-pose (#924 A-pose).
  }, [pieceMeshes, activePieces, avatarMeasurements, arrangementOverrides, armAxis]);

  // ─── Simulation lifecycle (solver cascade + collision) ──────────────────────

  const activeElastics = useMemo(() => elastics.filter(e => e.active !== false), [elastics]);

  const { clients, positionsRef, edgeDataRef, onFrame, recordFrameTick, tslSolverRef, simReadyRef, handleGpuDeviceLost } = useSimulationLifecycle({
    placedMeshes,
    seamInitData,
    elastics: activeElastics,
    fabricId,
    stretchingIdsRef,
    gpuInitiallyDowngraded: rendererDeviceAlreadyLost,
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
    // GPU/TSL path (per-tier shape ratified A6 § 3.1.C).
    if (tslSolverRef.current) {
      tslSolverRef.current.updateConfig({ substeps: mode.substeps });
    }
    // CPU + WASM via shared CPU shape + bridge translation (A2 § 3.2.B).
    // Narrowed to shared subset so the helper rejects CPU-only fields at
    // compile time (#696, A2 § 8 #3 closure).
    // selfCollision (M4-D): the preset's flag finally reaches the solvers —
    // before, this object only carried substeps and the mode's
    // selfCollision promise (e.g. 'complete': true) was silently dropped,
    // so the runtime flag could never change from its default.
    const sharedConfig: Partial<Pick<ClothSimConfig, SharedClothSimConfigKeys>> = {
      numSubsteps: mode.substeps,
      selfCollision: mode.selfCollision,
    };
    clients.cpu?.setConfig(sharedConfig);
    clients.wasm?.setConfig(mapClothSimConfigToWasmSolverConfig(sharedConfig));
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
    getPositions: () => positionsRef.current ?? null,
  }), [clients, positionsRef]);

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
    // Dev-only freeze: congela el loop de sim SIN desmontar (pausar por store
    // desmonta via useClothSim). Lo usa el probe del face-poke @gpu-local para
    // leer posiciones quietas; setear window.__OPENCLO_FREEZE_FRAME__=true.
    if (import.meta.env.DEV && (window as unknown as Record<string, unknown>).__OPENCLO_FREEZE_FRAME__) return;

    const solver = tslSolverRef.current;
    // 2a (init-race, plan §6bis): sin colisión cargada NO se stepea — los
    // frames sin cuerpo son basura física (la tela cae, la manga desliza) y
    // el settle-tether los congelaba. También raíz de la "bistabilidad" #902.
    if (solver && !simReadyRef.current) return;
    // 2a-ext: con avatar presente, no stepear hasta que el esqueleto publique
    // armAxis — el seed T-pose transitorio (pre-A-pose) nunca corre frames.
    // Antes esto lo "resolvía" un accidente: la extracción de colisión por
    // URL tardaba ~1.5s y serializaba el init; el bake vivo (15ms) destapó
    // la tormenta de doble-init dentro de las ventanas del DoD (medido:
    // ventanas 92/53/48/42/40 → 30 estable). Sin avatar, armAxis.ready
    // nunca llega: no se gatea (mannequin/proyectos sin cuerpo).
    if (solver && avatarModelUrl && !armAxis.ready) return;
    // 2b-lite: solver nuevo (re-seed) → los relojes de settle arrancan de 0.
    if (solver && solver !== lastSolverRef.current) {
      lastSolverRef.current = solver;
      tslFrameCounter.current = 0;
      tslReadbackCount.current = 0;
      tetherCaptureRequested.current = false;
      tetherReady.current = false;
    }

    // ─── TSL zero-copy path ──────────────────────────────────────────
    // rendererDeviceLostRef gate (#901): once the renderer device is lost,
    // dispatching compute on it is futile; bail to the CPU-readback path until
    // the lifecycle cascade swaps in the WASM/CPU tier.
    if (solver && !rendererDeviceLostRef.current) {
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

      // #897 F2 (H-Q2): UN renderer.compute(array) por substep = un submit
      // (antes ~12+). Las barreras implícitas de WebGPU entre dispatches del
      // mismo pass preservan el orden secuencial exacto del loop anterior.
      // La lista se construye UNA vez por frame: grabActive se lee una vez
      // arriba y collisionBodies solo muta entre frames (setTslCollisionBody).
      const substepNodes: ComputeNode[] = [solver.preSolve];
      // Wind force (two-pass: accumulate per-triangle, apply per-particle)
      if (solver.windNodes) {
        substepNodes.push(solver.windNodes.accumNode, solver.windNodes.applyNode);
      }
      // Batch all stretch colors — graph coloring guarantees no two
      // constraints WITHIN a color share a vertex, so each color's parallel
      // dispatch is race-free; cross-color shared vertices are ordered by
      // the sequential dispatches inside the pass (same guarantee as the
      // seam batch below).
      substepNodes.push(...solver.stretchColors);
      // Bend colored like stretch (P4-1 determinism): one dispatch per color,
      // no two constraints in a color share a vertex → race-free.
      substepNodes.push(...solver.bendColors);
      // Seam colors batched like stretch (#897 F1.3): sequential dispatches
      // inside one compute pass — WebGPU guarantees storage writes from one
      // dispatch are visible to the next, so cross-color shared vertices
      // are race-free.
      substepNodes.push(...solver.seamColors);
      // Self-collision (#897 F3): los 4 pases bucket ANTES de groundClamp —
      // espejo del orden Rust (self corre DENTRO de la dinámica natural,
      // pre-snapshot), así su corrección SÍ entra en la velocidad (vNat),
      // igual que en WASM donde self corre dentro del step de Rust.
      // Siempre-on en el tier GPU (divergencia ratificada vs preset
      // 'normal'); este gate de dispatch es el kill-switch.
      if (solver.selfCollisionNodes) {
        const sc = solver.selfCollisionNodes;
        substepNodes.push(sc.cellClearNode, sc.scatterNode, sc.resolveNode, sc.applyNode);
      }
      // Strain limiting (#gummy STEP 4): FUSIONADO dentro del kernel de
      // stretch (consejo 2026-07-02 — mismos ids/colores, ~150 dispatches
      // menos/frame). El cap corre en el slot del stretch; ver
      // makeDistanceConstraintFn (tslSolver.ts) para la semántica de lag.
      // Body-tether (frente#2): max-distance cling that holds each vertex within
      // its per-region radius of a target. Targets = each vertex's own SETTLED
      // position, captured from the wrapped-on-body drape (see settle-trigger
      // after the substep dispatch), NOT at init — init positions are the pre-wrap
      // spread-out layout (~0.6 m mean from the body), which collapsed the garment
      // (belowHip 72%, root-caused 2026-06-25). Gated on tetherReady so the kernel
      // runs only once good settled targets exist; with those, the cloth starts at
      // dist≈0 < radius so the clamp is a gentle anti-drift/anti-slide that also
      // arrests the #902 long-horizon slide-off, not an over-constraint.
      if (tetherReady.current && solver.tether) substepNodes.push(solver.tether);
      // Ground ANTES de la colisión de cuerpo (#897 F2.3) — espejo WASM:
      // en esa tier el ground corre DENTRO del step de Rust y la colisión
      // de triángulos JS corre después (wasmSolverWorker.ts:336,359). Así
      // el snapshot pre-colisión captura la posición post-ground y la
      // velocidad natural excluye solo el push del cuerpo.
      substepNodes.push(solver.groundClamp);
      // Mesh grab ANTES del snapshot: su desplazamiento SÍ debe entrar en
      // la velocidad (vNat = (preCol - prev) / sdt) → momentum natural al
      // soltar en vez de caída muerta.
      if (grabActive) {
        substepNodes.push(solver.grabNodes.grabNode);
      }
      // Snapshot pos → preCollisionPos (espejo de preCollisionBuf.set(
      // posView) en wasmSolverWorker.ts:352). Siempre se despacha: con 0
      // cuerpos, preCollisionPos == pos y postSolve degrada al
      // comportamiento previo exacto.
      substepNodes.push(solver.snapshotPreCollision);
      // 2-pass body collision (atomic-emulation pattern in tslCollision.ts):
      // findBest fills per-body atomic scratch; applyPush reads it,
      // pushes the particle, and resets the scratch for the next substep.
      for (const body of solver.collisionBodies) {
        substepNodes.push(body.findBestNode, body.applyPushNode);
      }
      // A4 face-poke Pass B (solve) — DENTRO del substep loop, tras el par de
      // colisión de cuerpo y antes de postSolve: la corrección queda excluida
      // de la velocidad vía preCollisionPos, igual que el push del cuerpo (el
      // monolito v1 corría 1×/frame post-substeps y los 15 substeps lo
      // deshacían). Gate = capability + dev flag 'openclo-facepoke-on'.
      // A4 face-poke Pass B (solve) — DENTRO del substep loop, tras el par de
      // colisión de cuerpo y antes de postSolve: corrección excluida de la
      // velocidad vía preCollisionPos + fricción Coulomb propia. CADA substep:
      // a substeps alternos la retención de manga cae (medido 6151 → 3945 —
      // el par push+grip por substep es protector). Gate = capability + dev
      // flag 'openclo-facepoke-on'.
      const facePokeOn = (GPU_CAPABILITIES.facePoke || facePokeForced.current) && solver.facePokeNodes;
      if (facePokeOn && solver.facePokeNodes) {
        substepNodes.push(solver.facePokeNodes.solve);
      }
      // postSolve deriva la velocidad de preCollisionPos (no de pos): el
      // push de colisión corrige posición sin crear velocidad, + respuesta
      // inelástica (#897 F2.3, espejo wasmSolverWorker.ts:367-399).
      substepNodes.push(solver.postSolve);

      // A4 face-poke Pass A (generate) — por CARA, cadencia 2 frames, ANTES
      // de los substeps: llena faceContactBuf (identidad del contacto más
      // profundo por cara); Pass B recomputa la profundidad fresca en cada
      // substep, así que los slots con 1 frame de edad siguen siendo válidos
      // (cuerpo estático, tela se mueve ~µm/substep).
      const fpCadence = tslFrameCounter.current < 300 ? FACE_POKE_GENERATE_CADENCE : FACE_POKE_GENERATE_CADENCE * 3;
      if (facePokeOn && solver.facePokeNodes && tslFrameCounter.current % fpCadence === 0) {
        renderer.compute(solver.facePokeNodes.generate);
      }

      for (let s = 0; s < substeps; s++) {
        renderer.compute(substepNodes);
      }

      // Steam brush (once per frame, after substeps settle; skip when inactive)
      if (solver.brushNodes.strength.value > 0) {
        renderer.compute(solver.brushNodes.brushNode);
      }

      renderer.compute(solver.normalZero);
      renderer.compute(solver.normalAccum);
      renderer.compute(solver.normalNormalize);
      // Normal-weld cross-seam (acta costura-real): tras normalize, los
      // vértices de costura promedian su normal con la de sus parejas → la
      // superficie se lee CONTINUA a través de la unión (el slit de 2mm pasa
      // de grieta de luz a surco de costura). Determinista, race-free.
      if (solver.normalWeld) {
        renderer.compute(solver.normalWeld);
      }

      // F0 (#897): en TSL la cadencia de render == cadencia de sim.
      recordFrameTick();

      // GPU→CPU position readback — keeps CPU geometry in sync with GPU positions
      // so raycasting (for grab/brush tools) works against actual cloth position.
      // Always runs periodically; more frequent when an interaction tool is active.
      tslFrameCounter.current++;
      const gpuClient = clientsRef.current.gpu;

      // Body-tether settle-capture (frente#2): once the drape has settled (the
      // M4 checkpoint, ~150 frames / 2.5 s — cloth is now wrapped on the body),
      // recapture tether targets from the CURRENT GPU positions, then enable the
      // kernel. Fires exactly once. Shares tslReadbackPending so this readback
      // and the per-frame geometry readback never map the position buffer
      // concurrently. Degrades safely: if the readback fails, tetherReady stays
      // false and the tether simply never turns on.
      if (
        gpuClient &&
        !tetherDisabled.current &&
        !tetherCaptureRequested.current &&
        !tslReadbackPending.current &&
        tslFrameCounter.current >= TETHER_SETTLE_FRAMES
      ) {
        tetherCaptureRequested.current = true;
        tslReadbackPending.current = true;
        gpuClient.recaptureTetherTargetsFromGpu().then((ok) => {
          tetherReady.current = ok;
          tslReadbackPending.current = false;
        });
      }

      if (gpuClient && !tslReadbackPending.current && staticGeometry) {
        const isToolActive = activeTool3D === 'meshGrab' || activeTool3D === 'steamBrush';
        const interval = isToolActive ? 3 : 15;
        if (tslFrameCounter.current % interval === 0) {
          tslReadbackPending.current = true;
          gpuClient.readbackPositionsToGeometry(renderer, staticGeometry).then(() => {
            tslReadbackPending.current = false;
            // §A1 penetration metric — slow cadence over the freshly-read
            // positions. No-op while no avatar body is registered.
            tslReadbackCount.current++;
            if (tslReadbackCount.current % PENETRATION_READBACK_CADENCE !== 0) return;
            const body = getPenetrationBody();
            const posAttr = staticGeometry.getAttribute('position');
            if (!body || !posAttr) return;
            const positions = posAttr.array as Float32Array;
            const { count, minSignedDist } = computePenetrationMetric(positions, body, {
              stride: penetrationStrideFor(posAttr.count),
            });
            // e2e §8 debug global — same window-cast pattern as __OPENCLO_CLOTH_MESH__.
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            (window as any).__OPENCLO_PENETRATION_COUNT__ = count;
            if (Number.isFinite(minSignedDist)) {
              // Inspector rules (fit:body-penetration / fit:pressure-point) compare in mm.
              dispatch(setCollisionDistance(minSignedDist * 1000));
            }
            // A4 face-aware oracle — counts body verts through cloth FACES (the
            // visible symptom A1 is blind to). HALF the A1 cadence (~2s): the
            // 120mm-band grid scan costs ~10-30ms per tick on the main thread.
            if (tslReadbackCount.current % (PENETRATION_READBACK_CADENCE * 2) !== 0) return;
            const fpBody = getFacePokeMetricBody();
            const idxAttr = staticGeometry.getIndex();
            if (fpBody && idxAttr) {
              const fp = computeFacePokeMetric(
                positions,
                idxAttr.array as Uint32Array | Uint16Array,
                fpBody,
                { stride: facePokeStrideFor(idxAttr.count / 3), debugPairs: 24 },
              );
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              (window as any).__OPENCLO_FACE_POKE__ = fp;
            }
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
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (window as any).__OPENCLO_THREE__ = THREE;
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

  // Effective opacity: per-piece override OR fabric default
  const effectiveOpacity = useMemo(() => {
    for (const p of activePieces) {
      if (pieceOpacity[p.id] !== undefined) return pieceOpacity[p.id];
    }
    return renderParams.opacity;
  }, [activePieces, pieceOpacity, renderParams.opacity]);

  // Effective emission color
  const effectiveEmission = useMemo(() => {
    for (const p of activePieces) {
      if (pieceEmission[p.id]) return pieceEmission[p.id];
    }
    return undefined;
  }, [activePieces, pieceEmission]);

  // Effective emission intensity
  const effectiveEmissionIntensity = useMemo(() => {
    for (const p of activePieces) {
      if (pieceEmissionIntensity[p.id] !== undefined) return pieceEmissionIntensity[p.id];
    }
    return 0;
  }, [activePieces, pieceEmissionIntensity]);

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
    return { repeatX: renderParams.mapRepeat[0], repeatY: renderParams.mapRepeat[1], rotation: renderParams.mapRotation, offsetX: 0, offsetY: 0 };
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

  // Apply UV repeat/rotation/offset from effective UV (responds to Redux slider changes)
  useEffect(() => {
    const rotRad = (effectiveUV.rotation ?? 0) * Math.PI / 180;
    const ox = effectiveUV.offsetX ?? 0;
    const oy = effectiveUV.offsetY ?? 0;
    [textures.map, textures.normalMap, textures.roughnessMap, textures.aoMap].forEach(tex => {
      if (tex) {
        tex.repeat.set(effectiveUV.repeatX, effectiveUV.repeatY);
        tex.offset.set(ox, oy);
        tex.rotation = rotRad;
        tex.needsUpdate = true;
      }
    });
  }, [textures, effectiveUV.repeatX, effectiveUV.repeatY, effectiveUV.rotation, effectiveUV.offsetX, effectiveUV.offsetY]);

  // Update TSL material properties for surface mode, opacity, emission, and textures
  useEffect(() => {
    if (!tslMaterial) return;

    const isFlat = surfaceMode3D === 'flat';
    const isXray = surfaceMode3D === 'xray';
    const stripTextures = surfaceMode3D === 'shaded' || surfaceMode3D === 'shaded-wire';

    // Opacity
    tslMaterial.opacity = isXray ? 0.1 : effectiveOpacity;
    tslMaterial.transparent = isXray || effectiveOpacity < 1;
    tslMaterial.depthWrite = !isXray;

    // Color & emission (mutate in-place to avoid GC pressure)
    if (isFlat) {
      tslMaterial.color.set('#000000');
      tslMaterial.emissive.set(effectiveTint || '#ffffff');
      tslMaterial.emissiveIntensity = 1;
    } else {
      tslMaterial.color.set(effectiveTint || '#ffffff');
      if (effectiveEmission) {
        tslMaterial.emissive.set(effectiveEmission);
        tslMaterial.emissiveIntensity = effectiveEmissionIntensity;
      } else {
        tslMaterial.emissive.setHex(0x000000);
        tslMaterial.emissiveIntensity = 0;
      }
    }

    // Roughness
    tslMaterial.roughness = isFlat ? 1 : renderParams.roughness;

    // Textures — strip for shaded/shaded-wire modes, apply for textured modes
    if (stripTextures || fitMapMode !== 'none') {
      tslMaterial.map = null;
      tslMaterial.normalMap = null;
      tslMaterial.roughnessMap = null;
    } else {
      tslMaterial.map = textures.map;
      tslMaterial.normalMap = textures.normalMap;
      tslMaterial.roughnessMap = textures.roughnessMap;
    }
    tslMaterial.aoMap = textures.aoMap;

    tslMaterial.needsUpdate = true;
  }, [tslMaterial, surfaceMode3D, effectiveOpacity, effectiveEmission, effectiveEmissionIntensity, effectiveTint, renderParams.roughness, fitMapMode, textures]);

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

  // ─── Steam brush + mesh grab interaction (via toolDispatch helper, C4) ────
  //
  // Tool dispatch consolidated to `src/utils/cloth/toolDispatch.ts` per C4
  // RFC § 3.1.A. Helper internalizes per-tier semantic divergence:
  // - GPU (TSL): writes uniforms via `tslSolver.setGrabUniforms()` /
  //   `gpuClient.setBrushParams()` (zero-copy hot path).
  // - WASM: mesh grab via `setPins` (positional pin shape; CRITICAL
  //   caveat per A6 RFC Q2 — see solverProtocol.ts JSDoc).
  // - CPU + Neural: silent no-op. Capability flags
  //   (`SolverCapabilities.tools`) document the matrix; UI surface in
  //   `SimulationStatusOverlay` communicates absence to user.
  //
  // R3F handlers (handlePointerDown/Move) duplicate manual raycaster
  // dispatch (onDown/onMove) for TSL geometry-sync workaround — both
  // routes call the same helper; underlying duplication captured as
  // separate rendering eje (C4 RFC § 6.5).
  //
  // Per C4 follow-up #701, `ClothToolTiers` is a discriminated union over
  // `kind`. `makeTiers` snapshots the per-frame refs into the canonical
  // tagged variant. GPU wins when both GPU + WASM are present (preserves
  // prior tier precedence; see toolDispatch tests).

  const makeTiers = useCallback((): ClothToolTiers => {
    const gpu = clientsRef.current.gpu;
    const tslSolver = tslSolverRef.current;
    if (gpu && tslSolver) {
      return { kind: 'gpu', gpu, tslSolver };
    }
    const wasm = clientsRef.current.wasm;
    const positions = positionsRef.current;
    if (wasm && positions) {
      return { kind: 'wasm', wasm, positions };
    }
    return { kind: 'none' };
  }, [positionsRef, tslSolverRef]);

  const handleBrushStroke = useCallback((point: THREE.Vector3) => {
    dispatchBrushStroke(
      { point: [point.x, point.y, point.z], radius: steamBrush.radius, strength: steamBrush.strength },
      makeTiers(),
    );
  }, [steamBrush.radius, steamBrush.strength, makeTiers]);

  const handlePointerDown = useCallback((e: ThreeEvent<PointerEvent>) => {
    // Skip if manual raycaster already started interaction (TSL mode)
    if (grabHandleRef.current || brushDragging.current) return;
    if (activeTool3D === 'steamBrush') {
      e.stopPropagation();
      brushDragging.current = true;
      handleBrushStroke(e.point);
    } else if (activeTool3D === 'meshGrab') {
      e.stopPropagation();
      // Handle is null when no tier accepted init (CPU/Neural, or WASM
      // with zero particles in radius). Caller observability comes from
      // toolDispatch's dev-mode console.warn (#704, #706).
      grabHandleRef.current = dispatchGrabInit(
        { point: [e.point.x, e.point.y, e.point.z], radius: meshGrab.radius, strength: meshGrab.strength },
        makeTiers(),
      );
    }
  }, [activeTool3D, handleBrushStroke, meshGrab.radius, meshGrab.strength, makeTiers]);

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
      const handle = grabHandleRef.current;
      if (!handle) return;
      e.stopPropagation();
      handle.move([e.point.x, e.point.y, e.point.z]);
    }
  }, [activeTool3D, handleBrushStroke]);

  const releaseGrab = useCallback(() => {
    const handle = grabHandleRef.current;
    if (!handle) return;
    grabHandleRef.current = null;
    handle.release();
  }, []);

  const handlePointerUp = useCallback(() => {
    brushDragging.current = false;
    dispatchBrushClear(makeTiers());
    releaseGrab();
  }, [releaseGrab, makeTiers]);

  const handlePointerLeave = useCallback(() => {
    if (brushCursorRef.current) brushCursorRef.current.visible = false;
    if (grabCursorRef.current) grabCursorRef.current.visible = false;
    if (!brushDragging.current) {
      dispatchBrushClear(makeTiers());
    }
    releaseGrab();
  }, [releaseGrab, makeTiers]);

  // Global pointerup to handle drag release outside mesh
  useEffect(() => {
    const handleGlobalUp = () => {
      brushDragging.current = false;
      dispatchBrushClear(makeTiers());
      releaseGrab();
    };
    window.addEventListener('pointerup', handleGlobalUp);
    return () => window.removeEventListener('pointerup', handleGlobalUp);
  }, [releaseGrab, makeTiers]);

  // ─── Manual raycasting for TSL mode ───────────────────────────────────────
  // R3F pointer events (onPointerMove/Down) depend on Three.js raycasting which
  // reads geometry.attributes.position (CPU side). In TSL mode, the mesh is
  // rendered at GPU-computed positions while the CPU geometry may lag behind.
  // This manual raycaster listens directly on the Canvas DOM element and does
  // its own raycast against the readback-updated geometry.
  // (camera + threeGl are obtained near the top of the component, before the
  // lifecycle hook, so the renderer device can seed the GPU-downgrade latch.)
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
        } else if (activeTool3D === 'meshGrab' && grabHandleRef.current) {
          grabHandleRef.current.move([hit.x, hit.y, hit.z]);
        }
      }
    };

    const onDown = (e: PointerEvent) => {
      if (grabHandleRef.current || brushDragging.current) return; // already active
      const hit = doRaycast(e);
      if (!hit) return;
      if (activeTool3D === 'steamBrush') {
        brushDragging.current = true;
        handleBrushStroke(hit);
      } else if (activeTool3D === 'meshGrab') {
        // Handle is null when no tier accepted init.
        grabHandleRef.current = dispatchGrabInit(
          { point: [hit.x, hit.y, hit.z], radius: meshGrab.radius, strength: meshGrab.strength },
          makeTiers(),
        );
      }
    };

    canvas.addEventListener('pointermove', onMove);
    canvas.addEventListener('pointerdown', onDown);
    return () => {
      canvas.removeEventListener('pointermove', onMove);
      canvas.removeEventListener('pointerdown', onDown);
    };
  }, [activeTool3D, camera, threeGl, staticGeometry, manualRaycaster, meshGrab.radius, meshGrab.strength, handleBrushStroke, releaseGrab, makeTiers]);

  // #901: los kernels TSL corren en el device del RENDERER (no en el device
  // propio del lifecycle, que es un señuelo), así que ESTE es el device cuya
  // pérdida importa. Se engancha en el mount (NO gated por tslMaterial, que
  // llega ~1-2 renders tarde) para no perder una pérdida durante el init de GPU.
  // Al perderse: marcamos el registro (sobrevive a remounts), latcheamos el ref
  // (corta el useFrame al instante) y avisamos al lifecycle para que la cascada
  // re-entre y caiga a WASM/CPU sola. El renderer no revive in-place — el toast
  // es honesto: el solver sigue, pero la vista 3D necesita reload.
  useEffect(() => {
    // rendererDevice (derived at the top) as the dep so this re-runs if the
    // device goes undefined→present after an async renderer.init (#901) instead
    // of latching device-loss detection to a single mount-time read.
    const device = rendererDevice;
    if (!device) return;
    // Ya muerto desde un montaje anterior (Stop→Start sobre el mismo renderer):
    // re-latchear sin re-enganchar un listener nuevo.
    if (isRendererDeviceLost(device)) {
      rendererDeviceLostRef.current = true;
      handleGpuDeviceLost();
      return;
    }
    let cancelled = false;
    device.lost.then((info) => {
      markRendererDeviceLost(device);
      if (cancelled) return;
      console.error('[GarmentSimulation] WebGPU device lost:', info?.message);
      rendererDeviceLostRef.current = true;
      handleGpuDeviceLost();
      dispatch(showErrorToast('WebGPU device lost — simulating on the fallback solver; reload to restore the 3D view'));
    });
    const onUncaptured = (e: Event) => {
      console.error('[GarmentSimulation] uncaptured GPU error:', (e as { error?: { message?: string } }).error?.message);
    };
    device.addEventListener?.('uncapturederror', onUncaptured);
    return () => { cancelled = true; device.removeEventListener?.('uncapturederror', onUncaptured); };
  }, [rendererDevice, dispatch, handleGpuDeviceLost]);

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
        // Render pass 2026-07-02: la tela castea y recibe sombra (ShadowNode
        // r184 soporta NodeMaterial; guard stale removido en EnvironmentSetup).
        castShadow
        receiveShadow
      >
        {!tslMaterial && (
          <meshPhysicalMaterial
            vertexColors={fitMapMode !== 'none'}
            color={surfaceMode3D === 'flat' ? '#000000' : (effectiveTint || '#ffffff')}
            side={THREE.DoubleSide}
            transparent={effectiveOpacity < 1}
            opacity={effectiveOpacity}
            depthWrite={surfaceMode3D !== 'xray'}
            roughness={surfaceMode3D === 'flat' ? 1 : renderParams.roughness}
            metalness={renderParams.metalness}
            sheen={renderParams.sheen}
            sheenRoughness={renderParams.sheenRoughness}
            sheenColor={renderParams.sheenColor}
            clearcoat={renderParams.clearcoat}
            clearcoatRoughness={renderParams.clearcoatRoughness}
            transmission={renderParams.transmission}
            thickness={renderParams.thickness}
            ior={renderParams.ior}
            emissive={surfaceMode3D === 'flat' ? (effectiveTint || '#ffffff') : (effectiveEmission ? new THREE.Color(effectiveEmission) : undefined)}
            emissiveIntensity={surfaceMode3D === 'flat' ? 1 : effectiveEmissionIntensity}
            map={(fitMapMode === 'none' && surfaceMode3D !== 'shaded' && surfaceMode3D !== 'shaded-wire') ? textures.map : null}
            normalMap={(surfaceMode3D !== 'shaded' && surfaceMode3D !== 'shaded-wire') ? textures.normalMap : null}
            roughnessMap={(fitMapMode === 'none' && surfaceMode3D !== 'shaded' && surfaceMode3D !== 'shaded-wire') ? textures.roughnessMap : null}
            aoMap={textures.aoMap}
          />
        )}
      </mesh>
      {(surfaceMode3D === 'xray' || surfaceMode3D === 'shaded-wire' || surfaceMode3D === 'textured-wire') && staticGeometry && (
        <mesh geometry={staticGeometry}>
          <meshBasicMaterial wireframe color="#888888" transparent opacity={0.3}
            depthTest polygonOffset polygonOffsetFactor={-1} />
        </mesh>
      )}
      <PinRenderer livePositions={positionsRef.current || undefined} />
      {/* Seam lines over the live garment (R2 #880 + polylines de borde
          2026-07-05): conexiones + línea de costura CLO3D-style, leídas de
          staticGeometry — la fuente que TODOS los tiers sincronizan
          (positionsRef solo lo alimentaban CPU/WASM: en el tier GPU default
          el componente estaba muerto). Gated showSeamlines3D adentro. */}
      <SimSeamLines
        geometry={staticGeometry}
        placedMeshes={placedMeshes}
        seamInitData={seamInitData}
      />
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
