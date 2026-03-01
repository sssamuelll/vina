/**
 * PinRenderer — Renders camera-facing circles at pinned vertex locations.
 *
 * #133 — Visual feedback for cloth simulation pins.
 *
 * - Red dots for active pins
 * - Orange for selected/hovered pins
 * - Billboard effect via lookAt
 * - Positions update from simulation frame or static target positions
 */

import { useRef, useMemo } from 'react';
import * as THREE from 'three';
import { useFrame, useThree, ThreeEvent } from '@react-three/fiber';
import { useSelector, useDispatch } from 'react-redux';
import type { RootState } from '../../store';
import { selectPin, removePin } from '../../store/simulationSlice';

// Pin colors following CLO3D conventions
const PIN_COLOR_ACTIVE = '#ff3333';    // Red for active pins
const PIN_COLOR_SELECTED = '#ff9900';  // Orange for selected pin
const PIN_COLOR_WEAK = '#ffff00';      // Yellow for weak pins
const PIN_RADIUS = 0.012;              // Slightly larger than anchor points

// Shared resources
const pinGeo = new THREE.CircleGeometry(PIN_RADIUS, 16);

// Materials for different states
const pinMatActive = new THREE.MeshBasicMaterial({
  color: PIN_COLOR_ACTIVE,
  side: THREE.DoubleSide,
  depthTest: false,
  transparent: true,
  opacity: 0.9,
});

const pinMatSelected = new THREE.MeshBasicMaterial({
  color: PIN_COLOR_SELECTED,
  side: THREE.DoubleSide,
  depthTest: false,
  transparent: true,
  opacity: 0.95,
});

const pinMatWeak = new THREE.MeshBasicMaterial({
  color: PIN_COLOR_WEAK,
  side: THREE.DoubleSide,
  depthTest: false,
  transparent: true,
  opacity: 0.85,
});

interface PinRendererProps {
  /** Live positions from simulation (optional). If not provided, uses targetPosition. */
  livePositions?: Float32Array;
  /** Callback when orbit controls should be disabled (during pin interaction) */
  setOrbitEnabled?: (enabled: boolean) => void;
}

/**
 * Single pin mesh component with interaction handlers.
 */
function PinMesh({
  pinId,
  position,
  strength,
  isSelected,
  setOrbitEnabled,
}: {
  pinId: string;
  position: [number, number, number];
  strength: 'weak' | 'medium' | 'strong';
  isSelected: boolean;
  setOrbitEnabled?: (enabled: boolean) => void;
}) {
  const meshRef = useRef<THREE.Mesh>(null);
  const { camera } = useThree();
  const dispatch = useDispatch();

  // Choose material based on state
  const material = useMemo(() => {
    if (isSelected) return pinMatSelected;
    if (strength === 'weak') return pinMatWeak;
    return pinMatActive;
  }, [isSelected, strength]);

  // Billboard: face camera each frame
  useFrame(() => {
    if (meshRef.current) {
      meshRef.current.lookAt(camera.position);
    }
  });

  const handleClick = (e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation();
    if (e.shiftKey) {
      // Shift+Click removes pin
      dispatch(removePin(pinId));
    } else {
      // Click selects pin
      dispatch(selectPin(pinId));
    }
  };

  const handlePointerOver = (e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation();
    document.body.style.cursor = 'pointer';
    setOrbitEnabled?.(false);
  };

  const handlePointerOut = () => {
    document.body.style.cursor = '';
    setOrbitEnabled?.(true);
  };

  return (
    <mesh
      ref={meshRef}
      geometry={pinGeo}
      material={material}
      position={position}
      renderOrder={1000}
      onClick={handleClick}
      onPointerOver={handlePointerOver}
      onPointerOut={handlePointerOut}
    />
  );
}

export default function PinRenderer({ livePositions, setOrbitEnabled }: PinRendererProps) {
  const pinnedVertices = useSelector((state: RootState) => state.simulation.pinnedVertices);
  const selectedPinId = useSelector((state: RootState) => state.simulation.selectedPinId);

  const pins = useMemo(() => Object.values(pinnedVertices), [pinnedVertices]);

  if (pins.length === 0) return null;

  return (
    <group>
      {pins.map((pin) => {
        // Use live position from simulation if available, otherwise use target position
        let position: [number, number, number];
        if (livePositions && pin.vertexIndex * 3 + 2 < livePositions.length) {
          position = [
            livePositions[pin.vertexIndex * 3],
            livePositions[pin.vertexIndex * 3 + 1],
            livePositions[pin.vertexIndex * 3 + 2],
          ];
        } else {
          position = pin.targetPosition;
        }

        return (
          <PinMesh
            key={pin.id}
            pinId={pin.id}
            position={position}
            strength={pin.strength}
            isSelected={pin.id === selectedPinId}
            setOrbitEnabled={setOrbitEnabled}
          />
        );
      })}
    </group>
  );
}
