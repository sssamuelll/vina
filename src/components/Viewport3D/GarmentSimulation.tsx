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
import { buildAvatarSDF } from '../../utils/cloth/avatarSDF';
import { placeGarmentPieces, computePlacement, detectBodyRegion } from '../../utils/cloth/garmentPlacement';
import { computeFitMapData, fabricToFitParams } from '../../utils/cloth/fitMaps';
import { PHYSICAL_FABRIC_LIBRARY } from '../../utils/cloth/physicalFabric';

const ClothMesh = lazy(() => import('./ClothMesh'));

const SCALE = 0.003;
const PIECE_COLORS = ['#e8e4df', '#d4cfc8', '#c8c0b5', '#f0ece6', '#e0d8cc'];

/**
 * Build mesh data for a piece using CDT mesher.
 */
function buildMeshFromPiece(
  piece: PatternPiece,
  meshPieceFn: ((p: PatternPiece, opts: Record<string, number>) => { vertices: Float32Array; triIds: Int32Array }) | null,
  particleDistance: number = 5,
): { vertices: number[]; triIds: number[] } | null {
  try {
    if (!meshPieceFn) return null;
    const meshData = meshPieceFn(piece, {
      yHeight: 1.2,
      scale: SCALE,
      maxEdgeLength: particleDistance,
      minAngle: 25,
      maxRefinementPasses: 3,
      curveResolution: 12,
    });
    if (meshData.vertices.length === 0 || meshData.triIds.length === 0) return null;
    return { vertices: Array.from(meshData.vertices), triIds: Array.from(meshData.triIds) };
  } catch {
    return null;
  }
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

  // Lazy-load CDT mesher
  const [meshPieceFn, setMeshPieceFn] = useState<((p: PatternPiece, opts: Record<string, number>) => { vertices: Float32Array; triIds: Int32Array }) | null>(null);
  useEffect(() => {
    import('../../utils/mesh').then(mod => {
      setMeshPieceFn(() => mod.meshPiece);
    }).catch(() => {});
  }, []);

  // Build mesh data for all pieces
  const pieceMeshes = useMemo(() => {
    const result: Array<{
      pieceId: string;
      vertices: number[];
      triIds: number[];
      outline: Array<{ type: string; values: number[] }>;
    }> = [];
    for (const piece of pieces) {
      const pd = pieceParticleDistances[piece.id] ?? globalParticleDistance;
      const mesh = buildMeshFromPiece(piece, meshPieceFn, pd);
      if (!mesh) continue;
      result.push({
        pieceId: piece.id,
        vertices: mesh.vertices,
        triIds: mesh.triIds,
        outline: piece.outline as Array<{ type: string; values: number[] }>,
      });
    }
    return result;
  }, [pieces, meshPieceFn, globalParticleDistance, pieceParticleDistances]);

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

  // Start/stop worker
  useEffect(() => {
    if (simulationState === 'running' && pieceMeshes.length > 0) {
      const client = new ClothWorkerClient();
      clientRef.current = client;
      client.onFrame = onFrame;
      client.onEdgeData = (ids, lengths) => {
        edgeDataRef.current = { stretchingIds: ids, stretchingLengths: lengths };
      };

      client.initMultiPiece(pieceMeshes, seamInitData).then(async () => {
        client.setFabric(fabricId);
        client.requestEdgeData();

        // Generate and set avatar body SDF for collision
        if (avatarModelUrl) {
          try {
            const sdf = await buildAvatarSDF(avatarModelUrl, avatarHeight);
            client.setSDF(sdf);
          } catch (e) {
            console.warn('[GarmentSimulation] Avatar SDF generation failed:', e);
          }
        }

        client.start();
      }).catch(() => {});

      return () => {
        client.dispose();
        clientRef.current = null;
        positionsRef.current = null;
      };
    } else if (simulationState === 'idle') {
      if (clientRef.current) {
        clientRef.current.dispose();
        clientRef.current = null;
      }
      positionsRef.current = null;
    } else if (simulationState === 'paused') {
      clientRef.current?.stop();
    }
    return undefined;
  }, [simulationState, pieceMeshes, seamInitData, fabricId, onFrame, avatarModelUrl, avatarHeight]);

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

  if (!staticGeometry) return null;

  return (
    <mesh ref={meshRef} geometry={staticGeometry}>
      <meshStandardMaterial
        vertexColors
        side={THREE.DoubleSide}
        transparent
        opacity={0.85}
        roughness={0.7}
        metalness={0}
      />
    </mesh>
  );
}

/**
 * GarmentSimulation — decides whether to use merged or individual simulation.
 */
export default function GarmentSimulation({ pieces, seams, onFitMapStats }: GarmentSimulationProps) {
  const { selectedPieceIds } = useSelector((s: RootState) => s.editor);
  const hasSeams = seams.length > 0;

  if (hasSeams) {
    return (
      <Suspense fallback={null}>
        <MergedSimulation pieces={pieces} seams={seams} onFitMapStats={onFitMapStats} />
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
        />
      ))}
    </Suspense>
  );
}
