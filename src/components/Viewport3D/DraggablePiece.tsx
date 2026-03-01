/**
 * DraggablePiece — Wrapper around PieceMesh that enables 3D drag in Arrange mode.
 *
 * Uses @react-three/drei PivotControls for CLO3D-style gizmo:
 * - Translate along XYZ axes
 * - Rotate around XYZ axes
 * - Only active when piece is selected and in arrange mode
 */

import { useCallback, useRef } from 'react';
import type { ThreeEvent } from '@react-three/fiber';
import { PivotControls } from '@react-three/drei';
import * as THREE from 'three';
import PieceMesh from './PieceMesh';
import type { PatternPiece } from '../../types/types';

interface DraggablePieceProps {
  piece: PatternPiece;
  isSelected: boolean;
  color: string;
  position: [number, number, number];
  rotation?: [number, number, number];
  arrangementOverride?: [number, number, number];
  canDrag: boolean;
  onSelect: (pieceId: string) => void;
  onDragEnd: (pieceId: string, position: [number, number, number]) => void;
  setOrbitEnabled: (enabled: boolean) => void;
  fabricColor?: string;
  fabricRoughness?: number;
}

export default function DraggablePiece({
  piece,
  isSelected,
  color,
  position,
  rotation,
  arrangementOverride,
  canDrag,
  onSelect,
  onDragEnd,
  setOrbitEnabled,
  fabricColor,
  fabricRoughness,
}: DraggablePieceProps) {
  const matrixRef = useRef(new THREE.Matrix4());
  const actualPos = arrangementOverride || position;

  const handleClick = useCallback((e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation();
    onSelect(piece.id);
  }, [piece.id, onSelect]);

  const handleDragStart = useCallback(() => {
    setOrbitEnabled(false);
  }, [setOrbitEnabled]);

  const handleDrag = useCallback((local: THREE.Matrix4) => {
    matrixRef.current.copy(local);
  }, []);

  const handleDragEnd = useCallback(() => {
    setOrbitEnabled(true);
    const pos = new THREE.Vector3();
    pos.setFromMatrixPosition(matrixRef.current);
    onDragEnd(piece.id, [
      actualPos[0] + pos.x,
      actualPos[1] + pos.y,
      actualPos[2] + pos.z,
    ]);
  }, [piece.id, actualPos, onDragEnd, setOrbitEnabled]);

  const showGizmo = canDrag && isSelected;

  if (showGizmo) {
    return (
      <PivotControls
        anchor={[0, 0, 0]}
        offset={actualPos}
        depthTest={false}
        scale={0.4}
        lineWidth={2}
        activeAxes={[true, true, true]}
        onDragStart={handleDragStart}
        onDrag={handleDrag}
        onDragEnd={handleDragEnd}
      >
        <group onClick={handleClick}>
          <PieceMesh
            piece={piece}
            isSelected={isSelected}
            color={color}
            position={[0, 0, 0]}
            placementRotation={rotation}
            fabricColor={fabricColor}
            fabricRoughness={fabricRoughness}
          />
        </group>
      </PivotControls>
    );
  }

  return (
    <group onClick={handleClick}>
      <PieceMesh
        piece={piece}
        isSelected={isSelected}
        color={color}
        position={actualPos}
        placementRotation={rotation}
        fabricColor={fabricColor}
        fabricRoughness={fabricRoughness}
      />
    </group>
  );
}
