/**
 * DraggablePiece — Wrapper around PieceMesh that enables 3D drag in Arrange mode.
 *
 * Uses @react-three/drei TransformControls for gizmo:
 * - Translate along XYZ axes
 * - Only active when piece is selected and in arrange mode
 *
 * TransformControls uses MeshBasicMaterial + LineBasicMaterial internally,
 * which are compatible with WebGPURenderer's NodeMaterial system.
 * (PivotControls was replaced because it uses LineMaterial extending
 * ShaderMaterial, which WebGPURenderer rejects.)
 */

import { useCallback, useRef, useEffect } from 'react';
import type { ThreeEvent } from '@react-three/fiber';
import { TransformControls } from '@react-three/drei';
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
  onSelect: (pieceId: string, shiftKey: boolean) => void;
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
  const groupRef = useRef<THREE.Group>(null);
  const actualPos = arrangementOverride || position;

  const handleClick = useCallback((e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation();
    onSelect(piece.id, e.nativeEvent.shiftKey);
  }, [piece.id, onSelect]);

  const handleMouseDown = useCallback(() => {
    setOrbitEnabled(false);
  }, [setOrbitEnabled]);

  const handleMouseUp = useCallback(() => {
    setOrbitEnabled(true);
    if (!groupRef.current) return;
    const pos = groupRef.current.position;
    onDragEnd(piece.id, [pos.x, pos.y, pos.z]);
  }, [piece.id, onDragEnd, setOrbitEnabled]);

  // Set initial position when actualPos changes
  useEffect(() => {
    if (groupRef.current) {
      groupRef.current.position.set(...actualPos);
    }
  }, [actualPos]);

  const showGizmo = canDrag && isSelected;

  if (showGizmo) {
    return (
      <TransformControls
        mode="translate"
        size={0.6}
        showX
        showY
        showZ
        onMouseDown={handleMouseDown}
        onMouseUp={handleMouseUp}
      >
        <group ref={groupRef} onClick={handleClick} position={actualPos}>
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
      </TransformControls>
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
