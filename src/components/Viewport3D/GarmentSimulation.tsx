/**
 * GarmentSimulation — R3F component that handles multi-piece cloth simulation with seams.
 *
 * Always merges all pieces into one shared solver (with or without seams).
 * All heavy work (meshing, SDF, simulation) runs in Web Workers.
 *
 * @module GarmentSimulation
 */

import { Suspense, useRef, useEffect, useCallback, useMemo, useState } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import { useSelector, useDispatch } from 'react-redux';
import { RootState } from '../../store';
import { PatternPiece, Seam } from '../../types/types';
import { ClothWorkerClient } from '../../utils/cloth/clothWorkerClient';
import type { SeamInitData } from '../../utils/cloth/clothWorker';
import { SimulationInitClient } from '../../utils/cloth/simulationInitClient';
import { detectBodyRegion, computePlacement } from '../../utils/cloth/garmentPlacement';
import { WasmSolverClient, isWasmSolverAvailable } from '../../utils/cloth/wasm/wasmSolverClient';
import { setSolverTier, setParticleCount } from '../../store/simulationSlice';

const PIECE_COLORS = ['#e8e4df', '#d4cfc8', '#c8c0b5', '#f0ece6', '#e0d8cc'];

// ─── Types ──────────────────────────────────────────────────────────────────

interface SimPiece {
  pieceId: string;
  vertices: Float32Array;
  triIds: Int32Array;
  outline: Array<{ type: string; values: number[] }>;
}

// ─── SDF Cache ───────────────────────────────────────────────────────────────

const _sdfInflight = new Map<string, Promise<import('../../utils/cloth/sdfGenerator').SDFData | null>>();

function sdfCacheKey(url: string, height: number): string {
  return `sdf|${url}|${height.toFixed(4)}`;
}

/**
 * Load avatar mesh and generate SDF off the main thread.
 */
async function loadSDFInWorker(
  avatarUrl: string,
  avatarHeight: number,
  initClient: SimulationInitClient | null,
): Promise<import('../../utils/cloth/sdfGenerator').SDFData | null> {
  const key = sdfCacheKey(avatarUrl, avatarHeight);
  const inflight = _sdfInflight.get(key);
  if (inflight) return inflight;

  const promise = (async () => {
    const { extractMeshData } = await import('../../utils/cloth/avatarSDF');
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

    if (initClient) {
      try {
        return await initClient.generateSDF(new Float32Array(vertices), new Uint32Array(indices), 32);
      } catch {
        return await initClient.generateSDF(new Float32Array(vertices), new Uint32Array(indices), 16).catch(() => null);
      }
    }
    return null;
  })();

  _sdfInflight.set(key, promise);
  promise.finally(() => _sdfInflight.delete(key));
  return promise;
}

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

function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  return Promise.race([
    p,
    new Promise<T>((_, rej) => setTimeout(() => rej(new Error(`${label} timed out (${ms}ms)`)), ms)),
  ]);
}

/**
 * Merged multi-piece simulation component.
 */
function MergedSimulation({ pieces, seams }: GarmentSimulationProps) {
  const dispatch = useDispatch();
  const meshRef = useRef<THREE.Mesh>(null);
  const positionsRef = useRef<Float32Array | null>(null);

  const simulationState = useSelector((s: RootState) => s.simulation.simulationState);
  const fabricId = useSelector((s: RootState) => s.simulation.defaultFabricId);
  const avatarModelUrl = useSelector((s: RootState) => s.project.avatarModelUrl);
  const avatarHeight = useSelector((s: RootState) => s.project.avatar.measurements.height) / 100;
  const globalParticleDistance = useSelector((s: RootState) => s.simulation.particleDistance);
  const pieceParticleDistances = useSelector((s: RootState) => s.simulation.pieceParticleDistance);
  const avatarMeasurements = useSelector((s: RootState) => s.project.avatar.measurements);

  const [pieceMeshes, setPieceMeshes] = useState<SimPiece[]>([]);
  const initClientRef = useRef<SimulationInitClient | null>(null);

  useEffect(() => {
    let cancelled = false;
    const client = new SimulationInitClient();
    initClientRef.current = client;

    (async () => {
      const meshed = await client.meshAllPieces(pieces, pieceParticleDistances, globalParticleDistance);
      if (cancelled) return;

      const result: SimPiece[] = meshed.map(m => ({
        ...m,
        outline: (pieces.find(p => p.id === m.pieceId)?.outline ?? []) as any,
      }));

      setPieceMeshes(result);
      dispatch(setParticleCount(result.reduce((sum, p) => sum + p.vertices.length / 3, 0)));
    })();

    return () => { cancelled = true; client.dispose(); initClientRef.current = null; };
  }, [pieces, globalParticleDistance, pieceParticleDistances, dispatch]);

  const placedMeshes = useMemo(() => {
    if (pieceMeshes.length === 0) return [];
    return pieceMeshes.map((pm, i) => {
      const piece = pieces[i];
      const region = piece ? detectBodyRegion(piece) : 'unknown';
      
      let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
      for (const cmd of pm.outline) {
        for (let j = 0; j < cmd.values.length - 1; j += 2) {
          const x = cmd.values[j], y = cmd.values[j + 1];
          if (x < minX) minX = x; if (x > maxX) maxX = x;
          if (y < minY) minY = y; if (y > maxY) maxY = y;
        }
      }
      const geo = { widthMm: maxX > minX ? maxX - minX : 200, heightMm: maxY > minY ? maxY - minY : 300 };
      const placement = computePlacement(region as any, avatarMeasurements, geo);
      const [rx, ry, rz] = placement.rotation;
      const [px, py, pz] = placement.position;
      const cx = Math.cos(rx), sx = Math.sin(rx);
      const cy = Math.cos(ry), sy = Math.sin(ry);
      const cz = Math.cos(rz), sz = Math.sin(rz);

      const transformed = new Float32Array(pm.vertices.length);
      for (let vi = 0; vi < pm.vertices.length / 3; vi++) {
        const vx = pm.vertices[vi * 3], vy = pm.vertices[vi * 3 + 1], vz = pm.vertices[vi * 3 + 2];
        const y1 = vy * cx - vz * sx, z1 = vy * sx + vz * cx;
        const x2 = vx * cy + z1 * sy, z2 = -vx * sy + z1 * cy;
        const x3 = x2 * cz - y1 * sz, y3 = x2 * sz + y1 * cz;
        transformed[vi * 3] = x3 + px; transformed[vi * 3 + 1] = y3 + py; transformed[vi * 3 + 2] = z2 + pz;
      }
      return { ...pm, vertices: transformed };
    });
  }, [pieceMeshes, pieces, avatarMeasurements]);

  const staticGeometry = useMemo(() => {
    if (placedMeshes.length === 0) return null;
    let totalV = 0;
    for (const p of placedMeshes) { totalV += p.vertices.length / 3; }

    const positions = new Float32Array(totalV * 3);
    const colors = new Float32Array(totalV * 3);
    const indices: number[] = [];
    let vOff = 0;

    for (let pi = 0; pi < placedMeshes.length; pi++) {
      const p = placedMeshes[pi];
      const nV = p.vertices.length / 3;
      const col = new THREE.Color(PIECE_COLORS[pi % PIECE_COLORS.length]);
      positions.set(p.vertices, vOff * 3);
      for (let i = 0; i < nV; i++) { colors[(vOff+i)*3] = col.r; colors[(vOff+i)*3+1] = col.g; colors[(vOff+i)*3+2] = col.b; }
      for (let i = 0; i < p.triIds.length; i++) indices.push(p.triIds[i] + vOff);
      vOff += nV;
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geo.setIndex(indices);
    geo.computeVertexNormals();
    return geo;
  }, [placedMeshes]);

  const seamInitData = useMemo(() => seamsToInitData(seams), [seams]);
  const onFrame = useCallback((positions: Float32Array) => { positionsRef.current = positions; }, []);

  const clientRef = useRef<any>(null);

  useEffect(() => {
    if (simulationState === 'running' && placedMeshes.length > 0) {
      let cancelled = false;
      const startSim = async () => {
        try {
          const wasmAvailable = await withTimeout(isWasmSolverAvailable(), 5000, 'Wasm check').catch(() => false);
          if (wasmAvailable && !cancelled) {
            dispatch(setSolverTier('wasm'));
            const wasm = new WasmSolverClient();
            clientRef.current = wasm;
            wasm.onFrame = onFrame;
            await withTimeout(wasm.initMultiPiece(placedMeshes, seamInitData), 12000, 'Wasm init');
            if (!cancelled) wasm.start();
            if (avatarModelUrl && !cancelled) {
              loadSDFInWorker(avatarModelUrl, avatarHeight, initClientRef.current).then(sdf => {
                if (sdf && !cancelled) wasm.setSDF(sdf);
              });
            }
            return;
          }
        } catch {}

        if (!cancelled) {
          dispatch(setSolverTier('cpu-worker'));
          const cpu = new ClothWorkerClient();
          clientRef.current = cpu;
          cpu.onFrame = (pos) => onFrame(pos);
          await withTimeout(cpu.initMultiPiece(placedMeshes, seamInitData), 15000, 'CPU init');
          cpu.setFabric(fabricId);
          if (!cancelled) cpu.start();
        }
      };
      startSim();
      return () => { cancelled = true; clientRef.current?.dispose(); clientRef.current = null; };
    }
  }, [simulationState, placedMeshes, seamInitData, fabricId, onFrame, avatarModelUrl, avatarHeight, dispatch]);

  useFrame(() => {
    if (!meshRef.current || !staticGeometry || !positionsRef.current) return;
    const posAttr = staticGeometry.getAttribute('position') as THREE.BufferAttribute;
    if (posAttr.array.length === positionsRef.current.length) {
      (posAttr.array as Float32Array).set(positionsRef.current);
      posAttr.needsUpdate = true;
      staticGeometry.computeVertexNormals();
    }
  });

  if (!staticGeometry) return null;
  return (
    <mesh ref={meshRef} geometry={staticGeometry}>
      <meshPhysicalMaterial vertexColors side={THREE.DoubleSide} transparent opacity={0.85} roughness={0.7} />
    </mesh>
  );
}

export default function GarmentSimulation({ pieces, seams, onFitMapStats, onInspect }: GarmentSimulationProps) {
  return (
    <Suspense fallback={null}>
      <MergedSimulation pieces={pieces} seams={seams} onFitMapStats={onFitMapStats} onInspect={onInspect} />
    </Suspense>
  );
}
