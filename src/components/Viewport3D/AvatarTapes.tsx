/**
 * AvatarTapes — Renders measurement tapes in the 3D viewport.
 *
 * Circumference tape: horizontal ring at Y height on avatar
 * Linear tape: straight line between two points with distance label
 */

import * as THREE from 'three';
import { Html, Line } from '@react-three/drei';
import { useMemo } from 'react';
import { useSelector } from 'react-redux';
import type { RootState } from '../../store';
import { separarEtiquetas } from './separarEtiquetas';

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

  const visibles = useMemo(() => tapes.filter(t => t.visible), [tapes]);

  // Las etiquetas de contorno se apartan entre sí antes de pintarse: cada
  // cinta sabe su altura pero ninguna sabe de las demás, y dos anillos
  // cercanos escribían sus números uno encima del otro (#1108). El anillo no
  // se mueve — solo el número.
  const alturaDeEtiqueta = useMemo(() => {
    const conAltura = visibles
      .map((t, i) => ({ t, i }))
      .filter(({ t }) => t.type === 'circumference' && t.height !== undefined);
    const puestas = separarEtiquetas(conAltura.map(({ t }) => t.height!));
    const porIndice = new Map<number, number>();
    conAltura.forEach(({ i }, k) => porIndice.set(i, puestas[k]));
    return porIndice;
  }, [visibles]);

  return (
    <group>
      {visibles.map((tape, indiceVisible) => {
        if (tape.type === 'circumference' && tape.height !== undefined) {
          // Derive approximate radius from measurement (C = 2πr → r = C/2π)
          const radius = (tape.measurement / 1000) / (2 * Math.PI);
          const pts = circumferencePoints(tape.height, radius);

          return (
            <group key={tape.id}>
              <Line points={pts} color={tape.color} lineWidth={2} depthTest={false} />
              {/* Label at front of ring */}
              <Html
                position={[0, (alturaDeEtiqueta.get(indiceVisible) ?? tape.height) + 0.02, radius + 0.01]}
                center
                distanceFactor={3}
                style={{
                  pointerEvents: 'none',
                  background: tape.color + 'cc',
                  color: '#fff',
                  padding: '2px 6px',
                  borderRadius: 4,
                  fontSize: 11,
                  fontFamily: 'var(--font-sans)',
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
                  fontFamily: 'var(--font-sans)',
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
