/**
 * GarmentSimulation — R3F component that handles multi-piece cloth simulation with seams.
 *
 * When seams exist, merges all connected pieces into one shared solver.
 * When no seams exist, falls back to individual ClothMesh per piece.
 *
 * @module GarmentSimulation
 */

import { Suspense, lazy, useRef, useEffect, useCallback, useMemo } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import { useSelector } from 'react-redux';
import { RootState } from '../../store';
import { PatternPiece, Seam } from '../../types/types';
import { ClothWorkerClient } from '../../utils/cloth/clothWorkerClient';
import type { SeamInitData } from '../../utils/cloth/clothWorker';

const ClothMesh = lazy(() => import('./ClothMesh'));

const SCALE = 0.003;
const PIECE_COLORS = ['#e8e4df', '#d4cfc8', '#c8c0b5', '#f0ece6', '#e0d8cc'];

function getPosition(index: number, total: number): [number, number, number] {
  const radius = 0.6;
  const angle = (index / Math.max(total, 1)) * Math.PI * 2 - Math.PI / 2;
  return [Math.cos(angle) * radius, 1.1, Math.sin(angle) * radius];
}

/**
 * Build mesh data for a piece using CDT mesher.
 */
function buildMeshFromPiece(piece: PatternPiece): { vertices: number[]; triIds: number[] } | null {
  try {
    const { meshPiece } = require('../../utils/mesh');
    const meshData = meshPiece(piece, {
      yHeight: 1.2,
      scale: SCALE,
      maxEdgeLength: 15,
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
}

/**
 * Merged multi-piece simulation component.
 * Renders all pieces as a single merged mesh with vertex colors.
 */
function MergedSimulation({ pieces, seams }: GarmentSimulationProps) {
  const meshRef = useRef<THREE.Mesh>(null);
  const geometryRef = useRef<THREE.BufferGeometry | null>(null);
  const positionsRef = useRef<Float32Array | null>(null);
  const clientRef = useRef<ClothWorkerClient | null>(null);

  const simulationState = useSelector((s: RootState) => s.simulation.simulationState);
  const fabricId = useSelector((s: RootState) => s.simulation.defaultFabricId);

  // Build mesh data for all pieces
  const pieceMeshes = useMemo(() => {
    const result: Array<{
      pieceId: string;
      vertices: number[];
      triIds: number[];
      outline: Array<{ type: string; values: number[] }>;
    }> = [];
    for (const piece of pieces) {
      const mesh = buildMeshFromPiece(piece);
      if (!mesh) continue;
      result.push({
        pieceId: piece.id,
        vertices: mesh.vertices,
        triIds: mesh.triIds,
        outline: piece.outline as Array<{ type: string; values: number[] }>,
      });
    }
    return result;
  }, [pieces]);

  // Build merged geometry for rendering (static initial state)
  const { staticGeometry } = useMemo(() => {
    if (pieceMeshes.length === 0) return { staticGeometry: null };

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

      // Copy vertices
      for (let i = 0; i < p.vertices.length; i++) {
        positions[vOffset * 3 + i] = p.vertices[i];
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
  }, [pieceMeshes]);

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

      client.initMultiPiece(pieceMeshes, seamInitData).then(() => {
        client.setFabric(fabricId);
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
  }, [simulationState, pieceMeshes, seamInitData, fabricId, onFrame]);

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
export default function GarmentSimulation({ pieces, seams }: GarmentSimulationProps) {
  const { selectedPieceIds } = useSelector((s: RootState) => s.editor);
  const hasSeams = seams.length > 0;

  if (hasSeams) {
    return (
      <Suspense fallback={null}>
        <MergedSimulation pieces={pieces} seams={seams} />
      </Suspense>
    );
  }

  // No seams — fall back to individual ClothMesh per piece
  return (
    <Suspense fallback={null}>
      {pieces.map((piece, i) => (
        <ClothMesh
          key={piece.id}
          piece={piece}
          isSelected={selectedPieceIds.includes(piece.id)}
          color={PIECE_COLORS[i % PIECE_COLORS.length]}
          position={getPosition(i, pieces.length)}
        />
      ))}
    </Suspense>
  );
}
