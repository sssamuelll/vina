import { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import { useSelector } from 'react-redux';
import { RootState } from '../../store';
import { cmToM } from '../../utils/geometry';

/**
 * Parametric dress form mannequin built with LatheGeometry.
 * Creates a smooth rotational body from a profile curve,
 * like a real tailor's dress form.
 * 
 * Measurements drive the profile: chest, waist, hips, height.
 */

interface ProfilePoint {
  y: number;    // height (0 = floor)
  radius: number; // half-width at this height
}

function buildProfile(m: {
  height: number;
  chest: number;
  waist: number;
  hips: number;
  shoulder: number;
}): ProfilePoint[] {
  // Convert cm to meters, radius = half circumference / π
  const scale = 0.01;
  const h = m.height * scale;
  const chestR = (m.chest * scale) / (2 * Math.PI);
  const waistR = (m.waist * scale) / (2 * Math.PI);
  const hipR = (m.hips * scale) / (2 * Math.PI);
  const shoulderR = (m.shoulder * scale) / 2;

  // Key heights relative to total height
  const hipY = h * 0.48;
  const waistY = h * 0.58;
  const chestY = h * 0.72;
  const shoulderY = h * 0.82;
  const neckBaseY = h * 0.85;
  const neckTopY = h * 0.90;
  const bottomY = h * 0.42;

  // Build smooth profile with intermediate points
  return [
    // Base (flat bottom of dress form)
    { y: bottomY, radius: 0.001 },
    { y: bottomY + 0.005, radius: hipR * 0.6 },

    // Hip area
    { y: hipY - 0.04, radius: hipR * 0.95 },
    { y: hipY, radius: hipR },
    { y: hipY + 0.03, radius: hipR * 0.98 },

    // Waist (narrowest)
    { y: waistY - 0.03, radius: waistR * 1.05 },
    { y: waistY, radius: waistR },
    { y: waistY + 0.03, radius: waistR * 1.02 },

    // Chest (bust)
    { y: chestY - 0.04, radius: chestR * 0.95 },
    { y: chestY, radius: chestR },
    { y: chestY + 0.02, radius: chestR * 0.97 },

    // Shoulder slope
    { y: shoulderY - 0.02, radius: shoulderR * 0.85 },
    { y: shoulderY, radius: shoulderR },

    // Neck (dress forms have a short neck stub, no head)
    { y: neckBaseY, radius: 0.055 },
    { y: neckBaseY + 0.015, radius: 0.048 },
    { y: neckTopY, radius: 0.042 },

    // Neck cap (rounded top knob, like a real dress form)
    { y: neckTopY + 0.015, radius: 0.035 },
    { y: neckTopY + 0.025, radius: 0.02 },
    { y: neckTopY + 0.03, radius: 0.001 },
  ];
}

function buildStandProfile(): THREE.Vector2[] {
  // Stand base and pole
  return [
    new THREE.Vector2(0.001, 0),
    new THREE.Vector2(0.15, 0),        // base plate outer
    new THREE.Vector2(0.15, 0.015),      // base plate top
    new THREE.Vector2(0.025, 0.02),      // pole base
    new THREE.Vector2(0.02, 0.42),       // pole top (meets body bottom)
    new THREE.Vector2(0.001, 0.42),      // center
  ];
}

export default function Mannequin() {
  const measurements = useSelector((s: RootState) => s.project.avatar.measurements);

  const bodyGeometry = useMemo(() => {
    const profile = buildProfile(measurements);
    const points = profile.map(p => new THREE.Vector2(p.radius, p.y));
    const geo = new THREE.LatheGeometry(points, 48);
    geo.computeVertexNormals();
    return geo;
  }, [measurements]);
  // BUG-9 (#612): inline dispose pending C1 canonical pattern.
  useEffect(() => () => bodyGeometry.dispose(), [bodyGeometry]);

  const standGeometry = useMemo(() => {
    const points = buildStandProfile();
    const geo = new THREE.LatheGeometry(points, 32);
    geo.computeVertexNormals();
    return geo;
  }, []);
  // BUG-9 (#612): inline dispose pending C1 canonical pattern.
  useEffect(() => () => standGeometry.dispose(), [standGeometry]);

  return (
    <group userData={{ opencloRole: 'avatar' }}>
      {/* Body */}
      <mesh geometry={bodyGeometry}>
        <meshStandardMaterial
          color="#c8b8a8"
          roughness={0.75}
          metalness={0.02}
          side={THREE.DoubleSide}
        />
      </mesh>

      {/* Stand */}
      <mesh geometry={standGeometry}>
        <meshStandardMaterial
          color="#2a2a2a"
          roughness={0.3}
          metalness={0.8}
        />
      </mesh>

      {/* Neck cap finial (classic dress form metal knob) */}
      <mesh position={[0, cmToM(measurements.height) * 0.93, 0]}>
        <sphereGeometry args={[0.012, 16, 16]} />
        <meshStandardMaterial color="#666" metalness={0.9} roughness={0.15} />
      </mesh>
    </group>
  );
}
