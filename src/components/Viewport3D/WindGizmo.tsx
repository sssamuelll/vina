import React, { useRef, useMemo } from 'react';
import { useSelector } from 'react-redux';
import * as THREE from 'three';
import type { RootState } from '../../store';

export function WindGizmo(): React.ReactElement | null {
  const windForce = useSelector((s: RootState) => s.simulation.windForce);
  const windEnabled = useSelector((s: RootState) => s.simulation.windEnabled);
  const groupRef = useRef<THREE.Group>(null);

  // Compute rotation to align arrow with wind direction
  const quaternion = useMemo(() => {
    const dir = new THREE.Vector3(windForce[0], windForce[1], windForce[2]);
    const length = dir.length();
    if (length < 0.01) return new THREE.Quaternion();
    dir.normalize();
    // Arrow default direction is +Y; rotate to wind direction
    const q = new THREE.Quaternion();
    q.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
    return q;
  }, [windForce]);

  const magnitude = useMemo(() => {
    return Math.sqrt(
      windForce[0] * windForce[0] +
      windForce[1] * windForce[1] +
      windForce[2] * windForce[2],
    );
  }, [windForce]);

  if (!windEnabled || magnitude < 0.01) return null;

  const arrowScale = Math.min(magnitude / 10, 2.0);

  return (
    <group ref={groupRef} position={[0, 1.5, 1.5]} quaternion={quaternion}>
      {/* Shaft */}
      <mesh position={[0, arrowScale * 0.25, 0]}>
        <cylinderGeometry args={[0.015, 0.015, arrowScale * 0.5, 8]} />
        <meshStandardMaterial color="#4fc3f7" transparent opacity={0.7} />
      </mesh>
      {/* Head */}
      <mesh position={[0, arrowScale * 0.55, 0]}>
        <coneGeometry args={[0.04, arrowScale * 0.15, 8]} />
        <meshStandardMaterial color="#4fc3f7" transparent opacity={0.7} />
      </mesh>
    </group>
  );
}
