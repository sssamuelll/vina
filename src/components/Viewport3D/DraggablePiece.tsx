/**
 * DraggablePiece — Wrapper around PieceMesh that enables 3D drag in Arrange mode.
 *
 * Gizmo: ArrangeGizmo propio (estilo CLO3D, mesh-based/WebGPU-safe), ANCLADO
 * a la pieza. Reemplaza drei TransformControls, que aquí tenía dos bugs
 * (2026-07-04): el gizmo se renderizaba en el ORIGEN del mundo (envolvía un
 * grupo con position propio) y el drag por gizmo escribía la posición VIEJA
 * (movía su wrapper interno, pero onMouseUp leía el grupo hijo intacto).
 *
 * Flujo de drag: el gizmo reporta un delta WORLD live → se aplica al grupo
 * (visual inmediato) → onDragEnd despacha position = base + delta al store
 * (setArrangement3D V3 legacy) → resolveArrangement lo compone (única
 * autoridad) → la prop `position` vuelve resuelta y el delta local se
 * resetea. El drag directo de la pieza (sin gizmo) se conserva.
 */

import { useCallback, useEffect, useRef } from 'react';
import type { ThreeEvent } from '@react-three/fiber';
import * as THREE from 'three';
import PieceMesh from './PieceMesh';
import ArrangeGizmo from './ArrangeGizmo';
import type { PatternPiece } from '../../types/types';

interface DraggablePieceProps {
  piece: PatternPiece;
  isSelected: boolean;
  color: string;
  position: [number, number, number];
  rotation?: [number, number, number];
  flippedPieceIds?: string[];
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
  flippedPieceIds,
  canDrag,
  onSelect,
  onDragEnd,
  setOrbitEnabled,
  fabricColor,
  fabricRoughness,
}: DraggablePieceProps) {
  const groupRef = useRef<THREE.Group>(null);
  const actualPos = position; // colocación YA resuelta (única autoridad: resolveArrangement)
  const isFlipped = flippedPieceIds?.includes(piece.id) ?? false;

  const handleClick = useCallback((e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation();
    onSelect(piece.id, e.nativeEvent.shiftKey);
  }, [piece.id, onSelect]);

  // Delta live del gizmo: visual inmediato sin pasar por el store.
  const handleGizmoDrag = useCallback((delta: [number, number, number]) => {
    if (!groupRef.current) return;
    groupRef.current.position.set(
      actualPos[0] + delta[0],
      actualPos[1] + delta[1],
      actualPos[2] + delta[2],
    );
  }, [actualPos]);

  const handleGizmoDragEnd = useCallback((delta: [number, number, number]) => {
    onDragEnd(piece.id, [
      actualPos[0] + delta[0],
      actualPos[1] + delta[1],
      actualPos[2] + delta[2],
    ]);
  }, [piece.id, actualPos, onDragEnd]);

  // Re-sync cuando el store devuelve la posición resuelta (post-dragEnd o
  // cambio de binding/medidas): el delta local queda absorbido por la base.
  useEffect(() => {
    groupRef.current?.position.set(...actualPos);
  }, [actualPos]);

  // El arrastre libre que presta el gizmo, para poder empezarlo agarrando la
  // PIEZA y no su esfera central — que mide `size * 0.11`, o sea un radio de
  // ~1,8 cm de mundo: una cabeza de alfiler. María [20:08]: «para mover en 3D
  // era con las flechas, es un poco incómodo… me gustaría que se pudiera
  // mover con el ratón» — las flechas son las del gizmo (#1108).
  const arrastreLibre = useRef<((e: ThreeEvent<PointerEvent>) => void) | null>(null);
  const prestarArrastreLibre = useCallback((iniciar: (e: ThreeEvent<PointerEvent>) => void) => {
    arrastreLibre.current = iniciar;
  }, []);

  const showGizmo = canDrag && isSelected;

  // Solo arrastra el cuerpo de una pieza YA seleccionada. Con eso no hace
  // falta umbral de arrastre ni desambiguar clic-vs-arrastre: el primer clic
  // elige, los siguientes mueven.
  const handlePointerDown = useCallback((e: ThreeEvent<PointerEvent>) => {
    if (!showGizmo || !arrastreLibre.current) return;
    arrastreLibre.current(e);
  }, [showGizmo]);

  // Si el gizmo desaparece sin escritura al store (deselección/Escape a mitad de
  // drag), `actualPos` no cambia y el efecto de arriba no corre — revierte el
  // desplazamiento imperativo de handleGizmoDrag para que el store mande (#935).
  useEffect(() => {
    if (!showGizmo) groupRef.current?.position.set(...actualPos);
  }, [showGizmo, actualPos]);

  return (
    <>
      <group
        ref={groupRef}
        onClick={handleClick}
        onPointerDown={handlePointerDown}
        position={actualPos}
        scale={[1, 1, isFlipped ? -1 : 1]}
      >
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
      {showGizmo && (
        <ArrangeGizmo
          position={actualPos}
          onDrag={handleGizmoDrag}
          onDragEnd={handleGizmoDragEnd}
          setOrbitEnabled={setOrbitEnabled}
          prestarArrastreLibre={prestarArrastreLibre}
        />
      )}
    </>
  );
}
