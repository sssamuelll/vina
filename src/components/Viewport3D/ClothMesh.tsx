/**
 * @deprecated Since #96, GarmentSimulation always uses MergedSimulation.
 * ClothMesh is no longer imported anywhere. Kept for reference only.
 * CDT meshing in this file runs on the main thread (useMemo) — do NOT
 * reintroduce this component without moving meshing to a Web Worker.
 *
 * ClothMesh — React Three Fiber component that renders a simulated cloth piece.
 *
 * Reads particle positions from the cloth simulation worker and updates a
 * Three.js BufferGeometry each frame. When simulation is idle, falls back to
 * static PieceMesh rendering.
 *
 * @module ClothMesh
 */

import { useRef, useEffect, useCallback, useMemo, useState } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import { useSelector } from 'react-redux';
import { RootState } from '../../store';
import { PatternPiece, PathCommand } from '../../types/types';
import { ClothWorkerClient } from '../../utils/cloth/clothWorkerClient';
// Avatar collision mesh is loaded via dynamic import
import {
  computeFitMapData,
  fabricToFitParams,
  type SolverEdgeData,
  type FitMapStats,
} from '../../utils/cloth/fitMaps';
import { PHYSICAL_FABRIC_LIBRARY } from '../../utils/cloth/physicalFabric';

// ─── Helpers ────────────────────────────────────────────────────────────────

const SCALE = 0.001; // 1 SVG unit = 1mm = 0.001m

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
function buildMeshFromPiece(
  piece: PatternPiece,
  meshPieceFn: ((p: PatternPiece, opts: Record<string, number>) => { vertices: Float32Array; triIds: Int32Array }) | null,
  particleDistance: number = 5
): { vertices: Float32Array; triIds: Int32Array } | null {
  try {
    if (!meshPieceFn) {
      const fallback = buildMeshFromOutlineFallback(piece.outline);
      if (!fallback) return null;
      return {
        vertices: new Float32Array(fallback.vertices),
        triIds: new Int32Array(fallback.triIds),
      };
    }
    
    const meshData = meshPieceFn(piece, {
      yHeight: 1.2,
      scale: SCALE,
      maxEdgeLength: particleDistance,
      minAngle: 25,
      maxRefinementPasses: 3,
      curveResolution: 12,
    });

    if (meshData.vertices.length === 0 || meshData.triIds.length === 0) {
      return null;
    }

    return meshData;
  } catch (error) {
    console.warn('CDT meshing failed, falling back to Three.js Shape:', error);
    
    // Fallback to the old Three.js Shape method
    const fallback = buildMeshFromOutlineFallback(piece.outline);
    if (!fallback) return null;
    return {
      vertices: new Float32Array(fallback.vertices),
      triIds: new Int32Array(fallback.triIds),
    };
  }
}

/**
 * Fallback mesh generation using Three.js Shape (old method).
 * @deprecated Used only as fallback when CDT fails
 */
function buildMeshFromOutlineFallback(
  outline: PathCommand[],
): { vertices: Float32Array; triIds: Int32Array } | null {
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
  const numVerts = posAttr.count;
  const vertices = new Float32Array(numVerts * 3);
  for (let i = 0; i < numVerts; i++) {
    vertices[i * 3] = posAttr.getX(i);
    vertices[i * 3 + 1] = 1.2;
    vertices[i * 3 + 2] = posAttr.getY(i);
  }

  const triIds = new Int32Array(index.array);

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
  /** Callback with fit map stats (for legend display) */
  onFitMapStats?: (stats: FitMapStats | null) => void;
  /** Callback with inspected value when user clicks a point */
  onInspect?: (value: number | null) => void;
}

/**
 * Renders a pattern piece as a simulated cloth mesh.
 *
 * When the simulation slice is 'running', initializes a ClothWorkerClient
 * and updates geometry from worker frames. When idle, renders as a static mesh.
 */
export default function ClothMesh({ piece, isSelected, color, position, onFitMapStats, onInspect }: ClothMeshProps) {
  const meshRef = useRef<THREE.Mesh>(null);
  const geometryRef = useRef<THREE.BufferGeometry | null>(null);
  const positionsRef = useRef<Float32Array | null>(null);
  const clientRef = useRef<ClothWorkerClient | null>(null);
  const triIdsRef = useRef<Int32Array | null>(null);
  const edgeDataRef = useRef<SolverEdgeData | null>(null);
  const colorsRef = useRef<Float32Array | null>(null);
  const fitValuesRef = useRef<Float32Array | null>(null);

  const simulationState = useSelector((s: RootState) => s.simulation.simulationState);
  const fitMapMode = useSelector((s: RootState) => s.simulation.fitMapMode);
  const fitMapConfig = useSelector((s: RootState) => s.simulation.fitMapConfig);
  const fabricId = useSelector((s: RootState) =>
    s.simulation.pieceFabrics[piece.id] ?? s.simulation.defaultFabricId
  );
  const avatarModelUrl = useSelector((s: RootState) => s.project.avatarModelUrl);
  const avatarHeight = useSelector((s: RootState) => s.project.avatar.measurements.height) / 100;
  const particleDistance = useSelector((s: RootState) =>
    s.simulation.pieceParticleDistance[piece.id] ?? s.simulation.particleDistance
  );

  // Lazy-load CDT mesher (cdt2d is CJS, needs dynamic import in browser)
  const [meshPieceFn, setMeshPieceFn] = useState<((p: PatternPiece, opts: Record<string, number>) => { vertices: Float32Array; triIds: Int32Array }) | null>(null);
  useEffect(() => {
    import('../../utils/mesh').then(mod => {
      setMeshPieceFn(() => mod.meshPiece);
    }).catch(() => {});
  }, []);

  // Build mesh data from piece using CDT (or fallback)
  const meshData = useMemo(() => buildMeshFromPiece(piece, meshPieceFn, particleDistance), [piece, meshPieceFn, particleDistance]);

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
      client.onEdgeData = (ids, lengths) => {
        edgeDataRef.current = { stretchingIds: ids, stretchingLengths: lengths };
      };

      // Apply position offset to vertices so particles start near the avatar body
      const placedData = { ...meshData };
      if (position[0] !== 0 || position[1] !== 0 || position[2] !== 0) {
        const verts = new Float32Array(meshData.vertices);
        const numVerts = verts.length / 3;
        for (let i = 0; i < numVerts; i++) {
          verts[i * 3] += position[0];
          verts[i * 3 + 1] += position[1];
          verts[i * 3 + 2] += position[2];
        }
        placedData.vertices = verts;
      }

      client.init(placedData).then(async () => {
        client.setFabric(fabricId);
        // Request edge data for fit map computation
        client.requestEdgeData();

        // Start simulation immediately — collision mesh loads later (non-blocking)
        client.start();

        // Extract collision mesh in background (non-blocking)
        if (avatarModelUrl) {
          import('../../utils/cloth/avatarCollisionMesh').then(({ extractAvatarCollisionMesh }) =>
            extractAvatarCollisionMesh(avatarModelUrl, avatarHeight)
          ).then(mesh => {
            if (mesh) client.setCollisionMesh(mesh);
          }).catch(e => {
            console.warn('[ClothMesh] Avatar collision mesh extraction failed:', e);
          });
        }
      }).catch(() => {
        // Worker init failed — simulation won't run for this piece
      });

      return () => {
        client.dispose();
        clientRef.current = null;
        positionsRef.current = null;
        edgeDataRef.current = null;
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
  }, [simulationState, meshData, fabricId, onFrame, position, avatarModelUrl, avatarHeight]);

  // Update fabric on the running worker
  useEffect(() => {
    if (clientRef.current && simulationState === 'running') {
      clientRef.current.setFabric(fabricId);
    }
  }, [fabricId, simulationState]);

  // Per-frame geometry update from worker positions + fit map colors
  useFrame(() => {
    if (!meshRef.current) return;
    const positions = positionsRef.current;
    if (!positions || !geometryRef.current) return;

    const geo = geometryRef.current;
    const posAttr = geo.getAttribute('position') as THREE.BufferAttribute;
    if (posAttr && posAttr.array.length === positions.length) {
      (posAttr.array as Float32Array).set(positions);
      posAttr.needsUpdate = true;
      geo.computeVertexNormals();
      geo.computeBoundingSphere();
    }

    // Compute fit map vertex colors
    if (fitMapMode !== 'none' && edgeDataRef.current) {
      const numP = positions.length / 3;
      const fabric = PHYSICAL_FABRIC_LIBRARY.find((f: { id: string }) => f.id === fabricId);
      const fitParams = fabric ? fabricToFitParams(fabric) : {
        maxStretchRatio: 0.08, weight: 150, thickness: 0.4, avgStretch: 0.025,
      };
      const mapData = computeFitMapData(
        fitMapMode, positions, numP, edgeDataRef.current, fitParams, null, fitMapConfig,
      );
      if (mapData) {
        let colorAttr = geo.getAttribute('color') as THREE.BufferAttribute | null;
        if (!colorAttr || colorAttr.array.length !== mapData.colors.length) {
          colorAttr = new THREE.BufferAttribute(new Float32Array(mapData.colors.length), 3);
          geo.setAttribute('color', colorAttr);
        }
        (colorAttr.array as Float32Array).set(mapData.colors);
        colorAttr.needsUpdate = true;
        colorsRef.current = mapData.colors;
        fitValuesRef.current = mapData.values;
        onFitMapStats?.(mapData.stats);
      }
    } else {
      // Remove vertex colors when fit map is off
      if (geo.getAttribute('color')) {
        geo.deleteAttribute('color');
        colorsRef.current = null;
        fitValuesRef.current = null;
        onFitMapStats?.(null);
      }
    }
  });

  // Build static geometry
  const staticGeometry = useMemo(() => {
    if (!meshData) return null;

    const geo = new THREE.BufferGeometry();
    const posArray = new Float32Array(meshData.vertices);
    geo.setAttribute('position', new THREE.BufferAttribute(posArray, 3));
    geo.setIndex(new THREE.BufferAttribute(meshData.triIds, 1));
    geo.computeVertexNormals();
    geometryRef.current = geo;
    return geo;
  }, [meshData]);

  if (!staticGeometry) return null;

  return (
    <group position={simulationState !== 'idle' ? [0, 0, 0] : position}>
      <mesh
        ref={meshRef}
        geometry={staticGeometry}
        onClick={(e) => {
          if (fitMapMode === 'none' || !fitValuesRef.current) return;
          e.stopPropagation();
          // Find nearest vertex to intersection point
          const point = e.point;
          const pos = positionsRef.current;
          if (!pos) return;
          const numP = pos.length / 3;
          let minDist = Infinity;
          let nearestIdx = 0;
          for (let i = 0; i < numP; i++) {
            const dx = pos[3 * i] - point.x;
            const dy = pos[3 * i + 1] - point.y;
            const dz = pos[3 * i + 2] - point.z;
            const d = dx * dx + dy * dy + dz * dz;
            if (d < minDist) { minDist = d; nearestIdx = i; }
          }
          onInspect?.(fitValuesRef.current[nearestIdx]);
        }}
      >
        <meshStandardMaterial
          color={fitMapMode !== 'none' ? '#ffffff' : (isSelected ? '#ffd700' : color)}
          vertexColors={fitMapMode !== 'none'}
          side={THREE.DoubleSide}
          transparent
          opacity={fitMapMode !== 'none' ? 0.95 : 0.85}
          roughness={0.7}
          metalness={0}
        />
      </mesh>
    </group>
  );
}
