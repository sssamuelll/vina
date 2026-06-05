/**
 * Sew3DTool — 3D sewing interaction component.
 *
 * Renders invisible pick meshes over each piece, handles pointer events
 * to identify hovered/clicked edges via `pickEdge`, and creates seams
 * when two compatible edges are selected.
 *
 * State machine:
 *   idle → first edge selected → second edge clicked → seam created → idle
 *   Escape at any point → cancel → idle
 *
 * Edge highlighting:
 *   - Green: compatible / first selection
 *   - Orange: length mismatch (>30% difference)
 *   - Red: blocked (same piece or already seamed)
 */

import { useState, useCallback, useMemo, useEffect } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import { useDisposable } from './hooks/useDisposable';
import type { ThreeEvent } from '@react-three/fiber';
import * as THREE from 'three';
import type { RootState, AppDispatch } from '../../store';
import { addSeam } from '../../store/projectSlice';
import { pickEdge, pieceHighlightRotation } from '../../utils/3d/edgePicker';
import type { PatternPiece, PathCommand, Seam } from '../../types/types';
import EdgeHighlight from './EdgeHighlight';
import { newId } from '../../utils/ids';

const SCALE = 0.001;

// ─── Shape builder (mirrors PieceMesh) ─────────────────────────────────────

function commandsToShape(commands: PathCommand[]): THREE.Shape | null {
  if (commands.length === 0) return null;
  const shape = new THREE.Shape();
  let cx = 0, cy = 0;
  for (const cmd of commands) {
    const v = cmd.values;
    switch (cmd.type) {
      case 'M': shape.moveTo(v[0] * SCALE, -v[1] * SCALE); cx = v[0]; cy = v[1]; break;
      case 'L': shape.lineTo(v[0] * SCALE, -v[1] * SCALE); cx = v[0]; cy = v[1]; break;
      case 'H': shape.lineTo(v[0] * SCALE, -cy * SCALE); cx = v[0]; break;
      case 'V': shape.lineTo(cx * SCALE, -v[0] * SCALE); cy = v[0]; break;
      case 'C':
        shape.bezierCurveTo(
          v[0] * SCALE, -v[1] * SCALE,
          v[2] * SCALE, -v[3] * SCALE,
          v[4] * SCALE, -v[5] * SCALE,
        );
        cx = v[4]; cy = v[5];
        break;
      case 'Q':
        shape.quadraticCurveTo(
          v[0] * SCALE, -v[1] * SCALE,
          v[2] * SCALE, -v[3] * SCALE,
        );
        cx = v[2]; cy = v[3];
        break;
      case 'Z': shape.closePath(); break;
    }
  }
  return shape;
}

// ─── PiecePickMesh ─────────────────────────────────────────────────────────

interface PiecePickMeshProps {
  piece: PatternPiece;
  position: [number, number, number];
  rotation?: [number, number, number];
  flipped: boolean;
  onPointerMove: (e: ThreeEvent<PointerEvent>, piece: PatternPiece) => void;
  onClick: (e: ThreeEvent<MouseEvent>, piece: PatternPiece) => void;
}

function PiecePickMesh({ piece, position, rotation, flipped, onPointerMove, onClick }: PiecePickMeshProps) {
  const geometry = useMemo(() => {
    const shape = commandsToShape(piece.outline);
    if (!shape) return null;
    const geo = new THREE.ShapeGeometry(shape, 32);
    geo.rotateX(Math.PI / 2);
    geo.computeBoundingBox();
    if (geo.boundingBox) {
      const center = new THREE.Vector3();
      geo.boundingBox.getCenter(center);
      geo.translate(-center.x, -center.y, -center.z);
    }
    return geo;
  }, [piece.outline]);
  // C1 lifecycle: disposes the previous geometry on recompute and on unmount
  // (replaces the manual prevGeoRef pattern).
  useDisposable(geometry);

  const finalRotation = useMemo((): [number, number, number] => {
    if (rotation) {
      return [rotation[0], rotation[1] - (piece.rotation ?? 0) * Math.PI / 180, rotation[2]];
    }
    return [0, -(piece.rotation ?? 0) * Math.PI / 180, 0];
  }, [rotation, piece.rotation]);

  if (!geometry) return null;

  return (
    <mesh
      geometry={geometry}
      position={position}
      rotation={finalRotation}
      scale={[1, 1, flipped ? -1 : 1]}
      onPointerMove={(e) => { e.stopPropagation(); onPointerMove(e, piece); }}
      onClick={(e) => { e.stopPropagation(); onClick(e, piece); }}
    >
      <meshBasicMaterial colorWrite={false} depthWrite={false} side={THREE.DoubleSide} />
    </mesh>
  );
}

// ─── Main component ────────────────────────────────────────────────────────

interface Sew3DToolProps {
  pieces: PatternPiece[];
  placements: { position: [number, number, number]; rotation: [number, number, number] }[];
  arrangementOverrides: Record<string, [number, number, number]>;
  flippedPieceIds: string[];
}

export default function Sew3DTool({ pieces, placements, arrangementOverrides, flippedPieceIds }: Sew3DToolProps) {
  const dispatch = useDispatch<AppDispatch>();
  const seams = useSelector((s: RootState) => s.project.seams);
  // Seam construction type — shared option surface for the seam tool family
  // (toolOptions.seam.seamType), same as the 2D seam/freesewing tools.
  const seamType = useSelector(
    (s: RootState) => (s.tools.toolOptions?.seam?.seamType as Seam['type']) ?? 'standard',
  );

  // State machine
  const [firstEdge, setFirstEdge] = useState<{ pieceId: string; edgeName: string } | null>(null);
  const [hoveredEdge, setHoveredEdge] = useState<{ pieceId: string; edgeName: string } | null>(null);

  // Escape to cancel
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setFirstEdge(null);
        setHoveredEdge(null);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Compatibility check
  const getCompatibility = useCallback((
    first: { pieceId: string; edgeName: string },
    second: { pieceId: string; edgeName: string },
  ): 'compatible' | 'mismatch' | 'blocked' => {
    // Same piece → blocked
    if (first.pieceId === second.pieceId) return 'blocked';

    // Already seamed → blocked
    const alreadySeamed = seams.some(s =>
      (s.pieceA.pieceId === first.pieceId && s.pieceA.edgeName === first.edgeName &&
       s.pieceB.pieceId === second.pieceId && s.pieceB.edgeName === second.edgeName) ||
      (s.pieceA.pieceId === second.pieceId && s.pieceA.edgeName === second.edgeName &&
       s.pieceB.pieceId === first.pieceId && s.pieceB.edgeName === first.edgeName),
    );
    if (alreadySeamed) return 'blocked';

    // Check length mismatch (>30% difference)
    const pieceA = pieces.find(p => p.id === first.pieceId);
    const pieceB = pieces.find(p => p.id === second.pieceId);
    const edgeA = pieceA?.edges?.find(e => e.name === first.edgeName);
    const edgeB = pieceB?.edges?.find(e => e.name === second.edgeName);
    if (edgeA?.length && edgeB?.length) {
      const ratio = Math.max(edgeA.length, edgeB.length) / Math.min(edgeA.length, edgeB.length);
      if (ratio > 1.3) return 'mismatch';
    }

    return 'compatible';
  }, [seams, pieces]);

  const getHighlightColor = useCallback((pieceId: string, edgeName: string): string => {
    if (!firstEdge) return '#00ff00'; // green when no selection
    const compat = getCompatibility(firstEdge, { pieceId, edgeName });
    if (compat === 'blocked') return '#ff3333'; // red
    if (compat === 'mismatch') return '#ff9900'; // orange
    return '#00ff00'; // green
  }, [firstEdge, getCompatibility]);

  const handlePointerMove = useCallback((e: ThreeEvent<PointerEvent>, piece: PatternPiece) => {
    if (!piece.edges?.length) { setHoveredEdge(null); return; }

    // Transform hit point to local space
    const localPt = e.object.worldToLocal(e.point.clone());
    const result = pickEdge(localPt.x, localPt.z, piece.outline, piece.edges);

    if (result) {
      setHoveredEdge({ pieceId: piece.id, edgeName: result.edge.name });
    } else {
      setHoveredEdge(null);
    }
  }, []);

  const handleClick = useCallback((e: ThreeEvent<MouseEvent>, piece: PatternPiece) => {
    if (!piece.edges?.length) return;

    const localPt = e.object.worldToLocal(e.point.clone());
    const result = pickEdge(localPt.x, localPt.z, piece.outline, piece.edges);
    if (!result) return;

    const clicked = { pieceId: piece.id, edgeName: result.edge.name };

    if (!firstEdge) {
      // Select first edge
      setFirstEdge(clicked);
    } else {
      // Check compatibility and create seam
      const compat = getCompatibility(firstEdge, clicked);
      if (compat === 'blocked') return;

      dispatch(addSeam({
        id: newId(),
        pieceA: { pieceId: firstEdge.pieceId, edgeName: firstEdge.edgeName, tStart: 0, tEnd: 1 },
        pieceB: { pieceId: clicked.pieceId, edgeName: clicked.edgeName, tStart: 0, tEnd: 1 },
        type: seamType,
        tension: 100,
        strength: 1.0,
        active: true,
        taped: false,
        tapeWidth: 10,
      }));

      // Reset for next seam
      setFirstEdge(null);
      setHoveredEdge(null);
    }
  }, [firstEdge, getCompatibility, dispatch, seamType]);

  // Get piece + placement for a given pieceId
  const getPiecePlacement = useCallback((pieceId: string) => {
    const idx = pieces.findIndex(p => p.id === pieceId);
    if (idx === -1) return null;
    const piece = pieces[idx];
    const pos = arrangementOverrides[pieceId] || placements[idx]?.position || [0, 0, 0] as [number, number, number];
    const rot = placements[idx]?.rotation;
    const flipped = flippedPieceIds.includes(pieceId);
    return { piece, pos, rot, flipped };
  }, [pieces, placements, arrangementOverrides, flippedPieceIds]);

  // Build highlight rotation for a piece (shared with SeamRenderer3D via
  // edgePicker.pieceHighlightRotation so the transforms can't drift apart).
  const getHighlightRotation = useCallback((
    piece: PatternPiece,
    rot?: [number, number, number],
  ): [number, number, number] => pieceHighlightRotation(piece.rotation, rot), []);

  // Memoize active pieces with edges for pick mesh rendering
  const activePiecesWithEdges = useMemo(() =>
    pieces.filter(p => p.active && p.edges && p.edges.length > 0),
    [pieces],
  );

  return (
    <group>
      {/* Invisible pick meshes for each piece */}
      {activePiecesWithEdges.map((piece) => {
        const idx = pieces.indexOf(piece);
        const pos = arrangementOverrides[piece.id] || placements[idx]?.position || [0, 0, 0] as [number, number, number];
        const rot = placements[idx]?.rotation;
        const flipped = flippedPieceIds.includes(piece.id);
        return (
          <PiecePickMesh
            key={piece.id}
            piece={piece}
            position={pos}
            rotation={rot}
            flipped={flipped}
            onPointerMove={handlePointerMove}
            onClick={handleClick}
          />
        );
      })}

      {/* Highlight for hovered edge */}
      {hoveredEdge && (() => {
        const pp = getPiecePlacement(hoveredEdge.pieceId);
        if (!pp) return null;
        const edge = pp.piece.edges?.find(e => e.name === hoveredEdge.edgeName);
        if (!edge) return null;
        return (
          <group
            position={pp.pos}
            rotation={getHighlightRotation(pp.piece, pp.rot)}
            scale={[1, 1, pp.flipped ? -1 : 1]}
          >
            <EdgeHighlight
              outline={pp.piece.outline}
              edge={edge}
              color={getHighlightColor(hoveredEdge.pieceId, hoveredEdge.edgeName)}
            />
          </group>
        );
      })()}

      {/* Highlight for first selected edge (stays visible) */}
      {firstEdge && (() => {
        const pp = getPiecePlacement(firstEdge.pieceId);
        if (!pp) return null;
        const edge = pp.piece.edges?.find(e => e.name === firstEdge.edgeName);
        if (!edge) return null;
        return (
          <group
            position={pp.pos}
            rotation={getHighlightRotation(pp.piece, pp.rot)}
            scale={[1, 1, pp.flipped ? -1 : 1]}
          >
            <EdgeHighlight outline={pp.piece.outline} edge={edge} color="#00ff00" />
          </group>
        );
      })()}
    </group>
  );
}
