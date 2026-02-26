/**
 * AnchorPoints — CLO3D-style arrangement points on avatar body.
 *
 * Uniform blue filled circles (#4A90D9), billboard-facing.
 * Placement matches CLO3D reference exactly.
 */

import { useMemo } from 'react';
import * as THREE from 'three';
import { Billboard } from '@react-three/drei';
import { deriveDimensions } from '../../utils/cloth/garmentPlacement';
import type { BodyMeasurements } from '../../types/types';

const POINT_COLOR = '#4A90D9';
const POINT_RADIUS = 0.008; // bigger than before — matches CLO3D

interface AnchorPointsProps {
  measurements: BodyMeasurements;
  visible: boolean;
}

function computeAnchors(m: BodyMeasurements): [number, number, number][] {
  const d = deriveDimensions(m);
  const sw = d.shoulderWidth / 2;
  const cr = d.chestRadius;
  const hr = d.hipRadius;
  const wh = d.waistHeight;
  const sh = d.shoulderHeight;
  const nh = d.neckHeight;
  const al = d.armLength;
  const h = d.heightM;

  // Surface offset so dots sit ON mesh, not inside
  const SO = 1.25;

  const pts: [number, number, number][] = [];
  const p = (x: number, y: number, z: number) => pts.push([x, y, z]);

  // ════════════════════════════════════════════════════════════════════════
  // HEAD
  // ════════════════════════════════════════════════════════════════════════

  const headR = cr * 0.32 * SO;
  const headTop = h + 0.02;

  // Top of head — 1 point
  p(0, headTop, 0);
  // Frontal cranium — 1 point (front of skull)
  p(0, headTop - 0.02, headR * 0.8);
  // Lateral cranium — 1 point (side of skull)
  p(headR * 0.9, headTop - 0.03, 0);
  // Slightly above ears — 1 per side
  p(-headR * 1.1, nh + (headTop - nh) * 0.6, 0);
  p(headR * 1.1, nh + (headTop - nh) * 0.6, 0);
  // Nape of neck — 1 point
  p(0, nh + 0.01, -headR * 1.2);
  // Start of head (forehead level) — 1 point
  p(0, nh + (headTop - nh) * 0.4, headR * 1.0);

  // ════════════════════════════════════════════════════════════════════════
  // SHOULDERS — 1 point per shoulder
  // ════════════════════════════════════════════════════════════════════════

  p(-sw * SO, sh, 0);
  p(sw * SO, sh, 0);

  // ════════════════════════════════════════════════════════════════════════
  // TORSO — 5 rings
  // Each ring: 3 front + 3 back + lateral points (varies)
  // Upper rings are closer together
  // ════════════════════════════════════════════════════════════════════════

  const torsoTop = sh - 0.04;
  const torsoBot = wh - 0.10;
  const torsoH = torsoTop - torsoBot;

  // Ring heights — upper rings closer together
  const ringYs = [
    torsoTop,                        // Ring 1 (upper chest) 
    torsoTop - torsoH * 0.18,        // Ring 2 (bust)        — close to ring 1
    torsoTop - torsoH * 0.40,        // Ring 3 (central/waist-ish)
    torsoTop - torsoH * 0.65,        // Ring 4 (below central)
    torsoTop - torsoH * 0.90,        // Ring 5 (low hip)
  ];

  // Torso radius at each ring height (interpolate chest→hip)
  const torsoR = (y: number) => {
    const t = Math.max(0, Math.min(1, (torsoTop - y) / torsoH));
    return (cr + t * (hr - cr)) * SO;
  };

  for (let ri = 0; ri < 5; ri++) {
    const y = ringYs[ri];
    const r = torsoR(y);
    const rSide = r * 0.95;

    // 3 front points: center + 2 flanking
    p(0, y, r);                          // center front
    p(-r * 0.45, y, r * 0.88);           // left front
    p(r * 0.45, y, r * 0.88);            // right front

    // 3 back points: center + 2 flanking
    p(0, y, -r);                         // center back
    p(-r * 0.45, y, -r * 0.88);          // left back
    p(r * 0.45, y, -r * 0.88);           // right back

    // Lateral points — varies by ring
    if (ri === 2) {
      // Central ring: 2 lateral per side
      p(-rSide, y + 0.015, 0);
      p(-rSide, y - 0.015, 0);
      p(rSide, y + 0.015, 0);
      p(rSide, y - 0.015, 0);
    } else if (ri === 3) {
      // Below central: 1 lateral per side
      p(-rSide, y, 0);
      p(rSide, y, 0);
    } else {
      // Other rings: 1 lateral per side
      p(-rSide, y, 0);
      p(rSide, y, 0);
    }
  }

  // ════════════════════════════════════════════════════════════════════════
  // ARMS — 4 rings × 4 points per ring, per arm
  // ════════════════════════════════════════════════════════════════════════

  const armR = 0.035 * SO;
  const dropRate = 0.45;

  for (const side of [-1, 1]) {
    const baseX = side * sw * SO;
    const ringTs = [0.20, 0.45, 0.70, 0.92]; // 4 stops along arm

    for (const t of ringTs) {
      const dist = al * t;
      const cx = baseX + side * dist;
      const cy = sh - dist * dropRate;
      // 4 points around arm cross-section
      p(cx, cy + armR, 0);               // top
      p(cx, cy - armR, 0);               // bottom
      p(cx, cy, armR);                    // front
      p(cx, cy, -armR);                   // back
    }
  }

  // ════════════════════════════════════════════════════════════════════════
  // LEGS
  // ════════════════════════════════════════════════════════════════════════

  const crotchH = wh - 0.24;
  const legSpread = 0.08;

  // Crotch ring — just below genitals
  // 3 front + 3 back + 1 lateral per side (lateral slightly higher)
  for (const side of [-1, 1]) {
    const lx = side * legSpread;
    const lr = hr * 0.4 * SO;

    // 3 front
    p(lx, crotchH, lr);
    p(lx - lr * 0.5, crotchH, lr * 0.85);
    p(lx + lr * 0.5, crotchH, lr * 0.85);

    // 3 back
    p(lx, crotchH, -lr);
    p(lx - lr * 0.5, crotchH, -lr * 0.85);
    p(lx + lr * 0.5, crotchH, -lr * 0.85);

    // 1 lateral per side (slightly higher)
    p(lx + side * lr, crotchH + 0.02, 0);
  }

  // 3 rings per leg × 4 points
  const legRingHeights = [
    h * 0.35,    // mid-thigh
    h * 0.25,    // knee
    h * 0.14,    // mid-calf
  ];
  const legRingRadii = [
    hr * 0.32 * SO,   // thigh
    hr * 0.22 * SO,   // knee
    hr * 0.18 * SO,   // calf
  ];

  for (const side of [-1, 1]) {
    const lx = side * legSpread;
    for (let ri = 0; ri < 3; ri++) {
      const y = legRingHeights[ri];
      const r = legRingRadii[ri];
      p(lx, y, r);           // front
      p(lx, y, -r);          // back
      p(lx + r, y, 0);       // outer
      p(lx - r, y, 0);       // inner
    }
  }

  // Ankles — 1 point front + 1 back per leg
  for (const side of [-1, 1]) {
    const lx = side * legSpread;
    const ankR = hr * 0.14 * SO;
    p(lx, h * 0.05, ankR);
    p(lx, h * 0.05, -ankR);
  }

  return pts;
}

// Shared geometry & material
const circleGeo = new THREE.CircleGeometry(POINT_RADIUS, 16);
const circleMat = new THREE.MeshBasicMaterial({
  color: POINT_COLOR,
  side: THREE.DoubleSide,
  depthTest: false,
  transparent: true,
  opacity: 0.92,
});

export default function AnchorPoints({ measurements, visible }: AnchorPointsProps) {
  const anchors = useMemo(() => computeAnchors(measurements), [measurements]);

  if (!visible) return null;

  return (
    <group>
      {anchors.map((pos, i) => (
        <Billboard key={i} position={pos} follow lockX={false} lockY={false} lockZ={false}>
          <mesh geometry={circleGeo} material={circleMat} renderOrder={999} />
        </Billboard>
      ))}
    </group>
  );
}
