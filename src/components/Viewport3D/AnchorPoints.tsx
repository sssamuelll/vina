/**
 * AnchorPoints — Body landmark spheres for piece arrangement.
 *
 * Shows small glowing spheres at key body positions (shoulders, neck, waist, hips, wrists)
 * where pattern pieces attach. Only visible in Arrange mode.
 *
 * Colors match the piece category color scheme.
 */

import { useMemo } from 'react';
import { Html } from '@react-three/drei';
import { deriveDimensions } from '../../utils/cloth/garmentPlacement';
import type { BodyMeasurements } from '../../types/types';

interface AnchorPoint {
  id: string;
  label: string;
  position: [number, number, number];
  color: string;
}

function computeAnchors(measurements: BodyMeasurements): AnchorPoint[] {
  const d = deriveDimensions(measurements);
  const sw = d.shoulderWidth / 2;

  return [
    // Shoulders
    { id: 'shoulder-l', label: 'L Shoulder', position: [-sw, d.shoulderHeight, 0], color: '#5a9e6f' },
    { id: 'shoulder-r', label: 'R Shoulder', position: [sw, d.shoulderHeight, 0], color: '#5a9e6f' },
    // Neck
    { id: 'neck', label: 'Neck', position: [0, d.neckHeight, 0], color: '#c9b84e' },
    // Chest front/back
    { id: 'chest-front', label: 'Chest F', position: [0, d.shoulderHeight - 0.1, d.chestRadius], color: '#4a7fbb' },
    { id: 'chest-back', label: 'Chest B', position: [0, d.shoulderHeight - 0.1, -d.chestRadius], color: '#bb4a4a' },
    // Waist
    { id: 'waist-front', label: 'Waist F', position: [0, d.waistHeight, d.chestRadius * 0.9], color: '#b5886a' },
    { id: 'waist-back', label: 'Waist B', position: [0, d.waistHeight, -d.chestRadius * 0.9], color: '#b5886a' },
    { id: 'waist-left', label: 'Waist L', position: [-d.chestRadius * 0.9, d.waistHeight, 0], color: '#b5886a' },
    { id: 'waist-right', label: 'Waist R', position: [d.chestRadius * 0.9, d.waistHeight, 0], color: '#b5886a' },
    // Hips
    { id: 'hip-front', label: 'Hip F', position: [0, d.waistHeight - 0.12, d.hipRadius], color: '#8e6aad' },
    { id: 'hip-back', label: 'Hip B', position: [0, d.waistHeight - 0.12, -d.hipRadius], color: '#8e6aad' },
    // Wrists
    { id: 'wrist-l', label: 'L Wrist', position: [-sw - d.armLength * 0.95, d.shoulderHeight - d.armLength * 0.55, 0], color: '#6a8aad' },
    { id: 'wrist-r', label: 'R Wrist', position: [sw + d.armLength * 0.95, d.shoulderHeight - d.armLength * 0.55, 0], color: '#6a8aad' },
  ];
}

interface AnchorPointsProps {
  measurements: BodyMeasurements;
  visible: boolean;
}

export default function AnchorPoints({ measurements, visible }: AnchorPointsProps) {
  const anchors = useMemo(() => computeAnchors(measurements), [measurements]);

  if (!visible) return null;

  return (
    <group>
      {anchors.map(a => (
        <group key={a.id} position={a.position}>
          {/* Glowing sphere */}
          <mesh>
            <sphereGeometry args={[0.01, 16, 16]} />
            <meshStandardMaterial
              color={a.color}
              emissive={a.color}
              emissiveIntensity={0.6}
              transparent
              opacity={0.85}
            />
          </mesh>
          {/* Outer glow ring */}
          <mesh>
            <sphereGeometry args={[0.015, 12, 12]} />
            <meshBasicMaterial
              color={a.color}
              transparent
              opacity={0.15}
            />
          </mesh>
          {/* Label */}
          <Html
            position={[0, 0.025, 0]}
            center
            distanceFactor={3}
            style={{
              pointerEvents: 'none',
              userSelect: 'none',
              fontSize: '8px',
              fontFamily: "'Inter', sans-serif",
              color: a.color,
              textShadow: '0 1px 3px rgba(0,0,0,0.9)',
              whiteSpace: 'nowrap',
              opacity: 0.8,
            }}
          >
            {a.label}
          </Html>
        </group>
      ))}
    </group>
  );
}
