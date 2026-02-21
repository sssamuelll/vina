/**
 * ClothMesh — React Three Fiber component that renders a simulated cloth piece.
 *
 * Reads particle positions from the cloth simulation worker and updates a
 * Three.js BufferGeometry each frame. When simulation is idle, falls back to
 * static PieceMesh rendering.
 *
 * @module ClothMesh
 */

import { useRef, useEffect, useCallback, useMemo } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import { useSelector } from 'react-redux';
import { RootState } from '../../store';
import { PatternPiece, PathCommand } from '../../types/types';
import { ClothWorkerClient } from '../../utils/cloth/clothWorkerClient';

// ─── Helpers ────────────────────────────────────────────────────────────────

const SCALE = 0.003; // 1 SVG unit ≈ 3mm in 3D (match PieceMesh)

/**
 * Sample evenly-spaced points from a PathCommand outline.
 * Returns an array of {x, y} suitable for triangulation.
 */
function sampleOutline(commands: PathCommand[], numSamplesPerEdge: number = 4): { x: number; y: number }[] {
  const points: { x: number; y: number }[] = [];
  let cx = 0, cy = 0;

  for (const cmd of commands) {
    const v = cmd.values;
    switch (cmd.type) {
      case 'M':
        cx = v[0]; cy = v[1];
        points.push({ x: cx, y: cy });
        break;
      case 'L':
        cx = v[0]; cy = v[1];
        points.push({ x: cx, y: cy });
        break;
      case 'H':
        cx = v[0];
        points.push({ x: cx, y: cy });
        break;
      case 'V':
        cy = v[0];
        points.push({ x: cx, y: cy });
        break;
      case 'C': {
        // Sample cubic bezier
        const x0 = cx, y0 = cy;
        for (let t = 1; t <= numSamplesPerEdge; t++) {
          const u = t / numSamplesPerEdge;
          const mu = 1 - u;
          const px = mu * mu * mu * x0 + 3 * mu * mu * u * v[0] + 3 * mu * u * u * v[2] + u * u * u * v[4];
          const py = mu * mu * mu * y0 + 3 * mu * mu * u * v[1] + 3 * mu * u * u * v[3] + u * u * u * v[5];
          points.push({ x: px, y: py });
        }
        cx = v[4]; cy = v[5];
        break;
      }
      case 'Q': {
        const x0 = cx, y0 = cy;
        for (let t = 1; t <= numSamplesPerEdge; t++) {
          const u = t / numSamplesPerEdge;
          const mu = 1 - u;
          const px = mu * mu * x0 + 2 * mu * u * v[0] + u * u * v[2];
          const py = mu * mu * y0 + 2 * mu * u * v[1] + u * u * v[3];
          points.push({ x: px, y: py });
        }
        cx = v[2]; cy = v[3];
        break;
      }
      case 'Z':
        break;
    }
  }

  // Deduplicate consecutive identical points
  const deduped: { x: number; y: number }[] = [];
  for (const p of points) {
    const last = deduped[deduped.length - 1];
    if (!last || Math.abs(p.x - last.x) > 0.01 || Math.abs(p.y - last.y) > 0.01) {
      deduped.push(p);
    }
  }

  return deduped;
}

/**
 * Build a high-quality triangulated mesh from pattern piece using CDT.
 * Uses Constrained Delaunay Triangulation for better physics stability.
 */
function buildMeshFromPiece(piece: PatternPiece): { vertices: number[]; triIds: number[] } | null {
  try {
    // Import CDT mesher
    const { meshPiece } = require('../../utils/mesh');
    
    const meshData = meshPiece(piece, {
      yHeight: 1.2,
      scale: SCALE,
      maxEdgeLength: 15,
      minAngle: 25,
      maxRefinementPasses: 3,
      curveResolution: 12,
    });

    if (meshData.vertices.length === 0 || meshData.triIds.length === 0) {
      return null;
    }

    // Convert to the format expected by the component
    const vertices: number[] = Array.from(meshData.vertices);
    const triIds: number[] = Array.from(meshData.triIds);

    return { vertices, triIds };
  } catch (error) {
    console.warn('CDT meshing failed, falling back to Three.js Shape:', error);
    
    // Fallback to the old Three.js Shape method
    return buildMeshFromOutlineFallback(piece.outline);
  }
}

/**
 * Fallback mesh generation using Three.js Shape (old method).
 * @deprecated Used only as fallback when CDT fails
 */
function buildMeshFromOutlineFallback(
  outline: PathCommand[],
): { vertices: number[]; triIds: number[] } | null {
  const points = sampleOutline(outline);
  if (points.length < 3) return null;

  // Center the points
  let centerX = 0, centerY = 0;
  for (const p of points) { centerX += p.x; centerY += p.y; }
  centerX /= points.length;
  centerY /= points.length;

  // Build a Three.js Shape for triangulation
  const shape = new THREE.Shape();
  const first = points[0];
  shape.moveTo((first.x - centerX) * SCALE, -(first.y - centerY) * SCALE);
  for (let i = 1; i < points.length; i++) {
    shape.lineTo((points[i].x - centerX) * SCALE, -(points[i].y - centerY) * SCALE);
  }
  shape.closePath();

  const geo = new THREE.ShapeGeometry(shape, 1);
  const posAttr = geo.getAttribute('position');
  const index = geo.getIndex();

  if (!posAttr || !index) {
    geo.dispose();
    return null;
  }

  // Extract flat vertex array (place at y=1.2 above ground)
  const vertices: number[] = [];
  for (let i = 0; i < posAttr.count; i++) {
    vertices.push(posAttr.getX(i), 1.2, posAttr.getY(i));
  }

  const triIds: number[] = [];
  for (let i = 0; i < index.count; i++) {
    triIds.push(index.getX(i));
  }

  geo.dispose();
  return { vertices, triIds };
}

// ─── Component ──────────────────────────────────────────────────────────────

interface ClothMeshProps {
  /** The pattern piece to simulate */
  piece: PatternPiece;
  /** Whether this piece is selected */
  isSelected: boolean;
  /** Base color for the mesh */
  color: string;
  /** 3D position when not simulating */
  position: [number, number, number];
}

/**
 * Renders a pattern piece as a simulated cloth mesh.
 *
 * When the simulation slice is 'running', initializes a ClothWorkerClient
 * and updates geometry from worker frames. When idle, renders as a static mesh.
 */
export default function ClothMesh({ piece, isSelected, color, position }: ClothMeshProps) {
  const meshRef = useRef<THREE.Mesh>(null);
  const geometryRef = useRef<THREE.BufferGeometry | null>(null);
  const positionsRef = useRef<Float32Array | null>(null);
  const clientRef = useRef<ClothWorkerClient | null>(null);
  const triIdsRef = useRef<Int32Array | null>(null);

  const simulationState = useSelector((s: RootState) => s.simulation.simulationState);
  const fabricId = useSelector((s: RootState) =>
    s.simulation.pieceFabrics[piece.id] ?? s.simulation.defaultFabricId
  );

  // Build mesh data from piece using CDT
  const meshData = useMemo(() => buildMeshFromPiece(piece), [piece]);

  // Frame callback: stores latest positions for useFrame
  const onFrame = useCallback((positions: Float32Array, _numParticles: number, triIds: Int32Array) => {
    positionsRef.current = positions;
    triIdsRef.current = triIds;
  }, []);

  // Start/stop worker based on simulation state
  useEffect(() => {
    if (simulationState === 'running' && meshData) {
      const client = new ClothWorkerClient();
      clientRef.current = client;
      client.onFrame = onFrame;

      client.init(meshData).then(() => {
        client.setFabric(fabricId);
        client.start();
      }).catch(() => {
        // Worker init failed — simulation won't run for this piece
      });

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
  }, [simulationState, meshData, fabricId, onFrame]);

  // Update fabric on the running worker
  useEffect(() => {
    if (clientRef.current && simulationState === 'running') {
      clientRef.current.setFabric(fabricId);
    }
  }, [fabricId, simulationState]);

  // Per-frame geometry update from worker positions
  useFrame(() => {
    if (!meshRef.current) return;
    const positions = positionsRef.current;
    if (!positions || !geometryRef.current) return;

    const posAttr = geometryRef.current.getAttribute('position') as THREE.BufferAttribute;
    if (posAttr && posAttr.array.length === positions.length) {
      (posAttr.array as Float32Array).set(positions);
      posAttr.needsUpdate = true;
      geometryRef.current.computeVertexNormals();
      geometryRef.current.computeBoundingSphere();
    }
  });

  // Build static geometry
  const staticGeometry = useMemo(() => {
    if (!meshData) return null;

    const geo = new THREE.BufferGeometry();
    const posArray = new Float32Array(meshData.vertices);
    geo.setAttribute('position', new THREE.BufferAttribute(posArray, 3));
    geo.setIndex(Array.from(meshData.triIds));
    geo.computeVertexNormals();
    geometryRef.current = geo;
    return geo;
  }, [meshData]);

  if (!staticGeometry) return null;

  return (
    <group position={simulationState !== 'idle' ? [0, 0, 0] : position}>
      <mesh ref={meshRef} geometry={staticGeometry}>
        <meshStandardMaterial
          color={isSelected ? '#ffd700' : color}
          side={THREE.DoubleSide}
          transparent
          opacity={0.85}
          roughness={0.7}
          metalness={0}
        />
      </mesh>
    </group>
  );
}
