import { useMemo, useRef } from 'react';
import { useSelector } from 'react-redux';
import { RootState } from '../../store';
import * as THREE from 'three';

interface Props {
  livePositions?: Float32Array;
}

export default function SelectedVertexRenderer({ livePositions }: Props) {
  const selectedVertices = useSelector((s: RootState) => s.simulation.selectedVertices);
  const pointsRef = useRef<THREE.Points>(null);

  const geometry = useMemo(() => {
    if (!livePositions || selectedVertices.length === 0) return null;
    const positions = new Float32Array(selectedVertices.length * 3);
    for (let i = 0; i < selectedVertices.length; i++) {
      const vi = selectedVertices[i];
      positions[i * 3] = livePositions[vi * 3];
      positions[i * 3 + 1] = livePositions[vi * 3 + 1];
      positions[i * 3 + 2] = livePositions[vi * 3 + 2];
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    return geo;
  }, [livePositions, selectedVertices]);

  if (!geometry) return null;

  return (
    <points ref={pointsRef} geometry={geometry}>
      <pointsMaterial color="#00e5ff" size={0.008} sizeAttenuation depthTest={false} transparent opacity={0.9} />
    </points>
  );
}
