/**
 * AvatarTapes — Renders measurement tapes in the 3D viewport.
 *
 * Circumference tape: horizontal ring at Y height on avatar
 * Linear tape: straight line between two points with distance label
 */

import * as THREE from 'three';
import { Html, Line } from '@react-three/drei';
import { useSelector } from 'react-redux';
import type { RootState } from '../../store';

const TAPE_SEGMENTS = 64;

function circumferencePoints(y: number, radius: number, n = TAPE_SEGMENTS): THREE.Vector3[] {
  const pts: THREE.Vector3[] = [];
  for (let i = 0; i <= n; i++) {
    const a = (i / n) * Math.PI * 2;
    pts.push(new THREE.Vector3(Math.sin(a) * radius, y, Math.cos(a) * radius));
  }
  return pts;
}

function formatMm(mm: number): string {
  if (mm >= 10) return `${(mm / 10).toFixed(1)}cm`;
  return `${mm.toFixed(0)}mm`;
}

export default function AvatarTapes() {
  const tapes = useSelector((s: RootState) => s.avatarTape.tapes);
  const pendingTape = useSelector((s: RootState) => s.avatarTape.pendingTape);

  return (
    <group>
      {tapes.filter(t => t.visible).map(tape => {
        if (tape.type === 'circumference' && tape.height !== undefined) {
          // Derive approximate radius from measurement (C = 2πr → r = C/2π)
          const radius = (tape.measurement / 1000) / (2 * Math.PI);
          const pts = circumferencePoints(tape.height, radius);

          return (
            <group key={tape.id}>
              <Line points={pts} color={tape.color} lineWidth={2} depthTest={false} />
              {/* Label at front of ring */}
              <Html
                position={[0, tape.height + 0.02, radius + 0.01]}
                center
                distanceFactor={3}
                style={{
                  pointerEvents: 'none',
                  background: tape.color + 'cc',
                  color: '#fff',
                  padding: '2px 6px',
                  borderRadius: 4,
                  fontSize: 11,
                  fontFamily: "'Inter', sans-serif",
                  fontWeight: 600,
                  whiteSpace: 'nowrap',
                }}
              >
                {tape.label}: {formatMm(tape.measurement)}
              </Html>
            </group>
          );
        }

        if (tape.type === 'linear' && tape.pointA && tape.pointB) {
          const pA = new THREE.Vector3(...tape.pointA);
          const pB = new THREE.Vector3(...tape.pointB);
          const midpoint = pA.clone().lerp(pB, 0.5);
          return (
            <group key={tape.id}>
              <Line points={[pA, pB]} color={tape.color} lineWidth={2} depthTest={false} />
              {/* Endpoint dots */}
              {[pA, pB].map((pt, i) => (
                <mesh key={i} position={pt}>
                  <sphereGeometry args={[0.005, 8, 8]} />
                  <meshBasicMaterial color={tape.color} depthTest={false} />
                </mesh>
              ))}
              {/* Label at midpoint */}
              <Html
                position={midpoint.toArray() as [number, number, number]}
                center
                distanceFactor={3}
                style={{
                  pointerEvents: 'none',
                  background: tape.color + 'cc',
                  color: '#fff',
                  padding: '2px 6px',
                  borderRadius: 4,
                  fontSize: 11,
                  fontFamily: "'Inter', sans-serif",
                  fontWeight: 600,
                  whiteSpace: 'nowrap',
                }}
              >
                {tape.label}: {formatMm(tape.measurement)}
              </Html>
            </group>
          );
        }

        return null;
      })}

      {/* Pending linear tape (first point placed, waiting for second) */}
      {pendingTape?.type === 'linear' && pendingTape.pointA && (
        <mesh position={pendingTape.pointA as [number, number, number]}>
          <sphereGeometry args={[0.007, 8, 8]} />
          <meshBasicMaterial color="#ffff00" depthTest={false} />
        </mesh>
      )}
    </group>
  );
}
