/**
 * AnchorPoints — CLO3D-style arrangement points on avatar body.
 *
 * Uniform blue filled circles (#4A90D9), billboard-facing, no labels,
 * no glow, no outlines. Points sit directly on body surface.
 * ~70 points at garment-construction landmarks.
 */

import { useMemo } from 'react';
import * as THREE from 'three';
import { Billboard } from '@react-three/drei';
import { deriveDimensions } from '../../utils/cloth/garmentPlacement';
import type { BodyMeasurements } from '../../types/types';

const POINT_COLOR = '#4A90D9';
const POINT_RADIUS = 0.006; // ~6mm — visible but not intrusive

interface AnchorPointsProps {
  measurements: BodyMeasurements;
  visible: boolean;
}

/**
 * Generate arrangement points that sit ON the body surface.
 * Uses cylinder/ellipse cross-sections at each height to place points
 * at the skin boundary rather than floating in space.
 */
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

  // Body radii — must be slightly oversized so dots sit ON surface visible, not inside mesh
  const SO = 1.25; // 25% overshoot to clear avatar mesh
  const neckR = cr * 0.4 * SO;
  const shoulderR = cr * SO;
  const chestR = cr * SO;
  const waistR = cr * 0.88 * SO;
  const hipR = hr * SO;
  const thighR = hr * 0.38 * SO;
  const kneeR = hr * 0.24 * SO;
  const calfR = hr * 0.2 * SO;
  const ankleR = hr * 0.15 * SO;

  const pts: [number, number, number][] = [];

  // Helper: ring of N points at height y, radius rX (side), rZ (front/back)
  const ring = (y: number, rX: number, rZ: number, n: number, startAngle = 0) => {
    for (let i = 0; i < n; i++) {
      const a = startAngle + (i / n) * Math.PI * 2;
      pts.push([Math.sin(a) * rX, y, Math.cos(a) * rZ]);
    }
  };

  // Helper: single point
  const p = (x: number, y: number, z: number) => pts.push([x, y, z]);

  // ── Crown ──
  p(0, h, 0);

  // ── Neck (4 points) ──
  ring(nh, neckR, neckR, 4, Math.PI / 4);

  // ── Neck base (6 points) ──
  ring(nh - 0.03, neckR * 1.3, neckR * 1.3, 6);

  // ── Shoulder line (8 points) ──
  p(-sw, sh, 0);
  p(sw, sh, 0);
  p(-sw * 0.65, sh, shoulderR * 0.55);
  p(sw * 0.65, sh, shoulderR * 0.55);
  p(-sw * 0.65, sh, -shoulderR * 0.55);
  p(sw * 0.65, sh, -shoulderR * 0.55);
  p(-sw * 0.35, sh, shoulderR * 0.7);
  p(sw * 0.35, sh, shoulderR * 0.7);

  // ── Upper chest / bust line (8 points) ──
  const bustH = sh - 0.08;
  ring(bustH, chestR, chestR, 8);

  // ── Mid chest (6 points) ──
  ring(sh - 0.15, chestR * 0.95, chestR * 0.95, 6, Math.PI / 6);

  // ── Waist (8 points) ──
  ring(wh, waistR, waistR, 8);

  // ── Upper hip (6 points) ──
  ring(wh - 0.06, waistR * 1.05, waistR * 1.05, 6, Math.PI / 6);

  // ── Hip line (8 points) ──
  const hipH = wh - 0.12;
  ring(hipH, hipR, hipR, 8);

  // ── Crotch level (4 points) ──
  const crotchH = wh - 0.22;
  ring(crotchH, hipR * 0.7, hipR * 0.7, 4, Math.PI / 4);

  // ── Arms (both sides) — 4 rings of points along each arm ──
  const armR = 0.04 * SO; // arm cross-section radius
  for (const side of [-1, 1]) {
    const baseX = side * sw;
    const dropRate = 0.45;
    const armStops = [0.15, 0.35, 0.55, 0.75, 0.95]; // shoulder to wrist
    for (const t of armStops) {
      const dist = al * t;
      const cx = baseX + side * dist;
      const cy = sh - dist * dropRate;
      // 4 points around the arm cross-section
      p(cx, cy + armR, 0);
      p(cx, cy - armR, 0);
      p(cx, cy, armR);
      p(cx, cy, -armR);
    }
  }

  // ── Legs (both sides) ──
  const legSpread = 0.075; // half-distance between legs
  for (const side of [-legSpread, legSpread]) {
    // Upper thigh (4 around)
    const thighH = hipH - 0.08;
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2;
      pts.push([side + Math.sin(a) * thighR, thighH, Math.cos(a) * thighR]);
    }
    // Mid thigh
    const midThighH = h * 0.38;
    p(side + thighR, midThighH, 0);
    p(side - thighR, midThighH, 0);

    // Knee (4 around)
    const kneeH = h * 0.28;
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2;
      pts.push([side + Math.sin(a) * kneeR, kneeH, Math.cos(a) * kneeR]);
    }

    // Calf
    const calfH = h * 0.2;
    p(side + calfR, calfH, 0);
    p(side - calfR, calfH, 0);
    p(side, calfH, calfR);
    p(side, calfH, -calfR);

    // Ankle (2 points — front/back only)
    const ankH = h * 0.06;
    p(side, ankH, ankleR);
    p(side, ankH, -ankleR);

    // Foot
    p(side, h * 0.015, ankleR * 1.5);
  }

  // ── Back shoulder blade area ──
  p(-sw * 0.4, sh - 0.06, -chestR * 0.95);
  p(sw * 0.4, sh - 0.06, -chestR * 0.95);
  p(-sw * 0.25, sh - 0.12, -chestR * 0.9);
  p(sw * 0.25, sh - 0.12, -chestR * 0.9);

  // ── Center front/back lines (additional density) ──
  const cfSteps = 5;
  for (let i = 0; i < cfSteps; i++) {
    const t = i / (cfSteps - 1);
    const y = sh - 0.04 - t * (sh - 0.04 - hipH);
    const r = chestR + t * (hipR - chestR);
    p(0, y, r);      // center front
    p(0, y, -r);     // center back
  }

  return pts;
}

// Shared geometry & material
const circleGeo = new THREE.CircleGeometry(POINT_RADIUS, 12);
const circleMat = new THREE.MeshBasicMaterial({
  color: POINT_COLOR,
  side: THREE.DoubleSide,
  depthTest: false,
  transparent: true,
  opacity: 0.9,
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
