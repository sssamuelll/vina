/**
 * AnchorPoints — CLO3D-style arrangement points on avatar body.
 *
 * Visual reference: uniform blue filled circles (~#4A90D9), billboard-facing,
 * no labels, no glow, no outlines. ~50+ points at garment-construction
 * landmarks plus floating off-body points for sleeve/panel positioning.
 */

import { useMemo } from 'react';
import * as THREE from 'three';
import { Billboard } from '@react-three/drei';
import { deriveDimensions } from '../../utils/cloth/garmentPlacement';
import type { BodyMeasurements } from '../../types/types';

const POINT_COLOR = '#4A90D9';
const POINT_RADIUS = 0.008; // ~8mm visual radius

interface AnchorDef {
  position: [number, number, number];
}

function computeAnchors(m: BodyMeasurements): AnchorDef[] {
  const d = deriveDimensions(m);
  const sw = d.shoulderWidth / 2;
  const cr = d.chestRadius;
  const hr = d.hipRadius;
  const wh = d.waistHeight;
  const sh = d.shoulderHeight;
  const nh = d.neckHeight;
  const al = d.armLength;
  const h = d.heightM;

  // Knee/ankle heights (proportional)
  const kneeH = h * 0.28;
  const ankleH = h * 0.05;
  const thighH = wh - 0.12;
  const calfH = h * 0.18;

  // Arm positions
  const armDropPerUnit = 0.55; // arm drops relative to extension
  const elbowDist = al * 0.5;
  const wristDist = al * 0.95;

  const pts: AnchorDef[] = [];
  const p = (x: number, y: number, z: number) => pts.push({ position: [x, y, z] });

  // ── Head & Neck ──
  p(0, h, 0);                          // crown
  p(-0.04, nh, cr * 0.3);              // neck L front
  p(0.04, nh, cr * 0.3);               // neck R front
  p(-0.04, nh, -cr * 0.3);             // neck L back
  p(0.04, nh, -cr * 0.3);              // neck R back
  p(0, nh, cr * 0.4);                  // neck center front
  p(0, nh, -cr * 0.4);                 // neck center back

  // ── Shoulders ──
  p(-sw, sh, 0);                        // L shoulder
  p(sw, sh, 0);                         // R shoulder
  p(-sw * 0.7, sh, cr * 0.3);           // L shoulder front
  p(sw * 0.7, sh, cr * 0.3);            // R shoulder front
  p(-sw * 0.7, sh, -cr * 0.3);          // L shoulder back
  p(sw * 0.7, sh, -cr * 0.3);           // R shoulder back

  // ── Chest / Bust ──
  p(0, sh - 0.08, cr);                  // center front chest
  p(0, sh - 0.08, -cr);                 // center back chest
  p(-cr * 0.6, sh - 0.08, cr * 0.8);    // L bust
  p(cr * 0.6, sh - 0.08, cr * 0.8);     // R bust
  p(-cr * 0.8, sh - 0.08, 0);           // L side chest
  p(cr * 0.8, sh - 0.08, 0);            // R side chest
  p(-cr * 0.6, sh - 0.08, -cr * 0.8);   // L back chest
  p(cr * 0.6, sh - 0.08, -cr * 0.8);    // R back chest

  // ── Waist ──
  p(0, wh, cr * 0.9);                   // waist center front
  p(0, wh, -cr * 0.9);                  // waist center back
  p(-cr * 0.9, wh, 0);                  // waist L side
  p(cr * 0.9, wh, 0);                   // waist R side
  p(-cr * 0.5, wh, cr * 0.7);           // waist L front
  p(cr * 0.5, wh, cr * 0.7);            // waist R front
  p(-cr * 0.5, wh, -cr * 0.7);          // waist L back
  p(cr * 0.5, wh, -cr * 0.7);           // waist R back

  // ── Hips ──
  p(0, thighH, hr);                     // hip center front
  p(0, thighH, -hr);                    // hip center back
  p(-hr, thighH, 0);                    // hip L side
  p(hr, thighH, 0);                     // hip R side
  p(-hr * 0.6, thighH, hr * 0.8);       // hip L front
  p(hr * 0.6, thighH, hr * 0.8);        // hip R front

  // ── Arms (both sides, symmetric) ──
  for (const side of [-1, 1]) {
    const sx = side * sw;
    // Upper arm
    p(sx + side * elbowDist * 0.3, sh - elbowDist * 0.3 * armDropPerUnit, 0);
    // Elbow
    p(sx + side * elbowDist, sh - elbowDist * armDropPerUnit, 0);
    // Forearm
    p(sx + side * elbowDist * 1.5, sh - elbowDist * 1.5 * armDropPerUnit, 0);
    // Wrist
    p(sx + side * wristDist, sh - wristDist * armDropPerUnit, 0);
  }

  // ── Legs (both sides, symmetric) ──
  for (const side of [-0.08, 0.08]) {
    // Upper thigh
    p(side, thighH - 0.05, hr * 0.3);
    p(side, thighH - 0.05, -hr * 0.3);
    // Knee
    p(side, kneeH, 0.02);
    p(side, kneeH, -0.02);
    // Calf
    p(side, calfH, 0);
    // Ankle
    p(side, ankleH, 0);
  }

  // ── Center front/back vertical line ──
  p(0, sh - 0.04, cr);                  // upper CF
  p(0, (sh + wh) / 2, cr * 0.95);       // mid CF
  p(0, sh - 0.04, -cr);                 // upper CB
  p(0, (sh + wh) / 2, -cr * 0.95);      // mid CB

  // ── Off-body floating points (sleeve/panel arrangement) ──
  for (const side of [-1, 1]) {
    const offX = side * (sw + 0.15);
    p(offX, sh, 0);                       // sleeve top
    p(offX, sh - 0.1, 0);                 // sleeve upper
    p(offX, (sh + wh) / 2, 0);            // sleeve mid
    p(offX, wh + 0.05, 0);                // sleeve lower
  }

  return pts;
}

// ── Shared geometry (instanced rendering would be even better) ──────────────

const circleGeo = new THREE.CircleGeometry(POINT_RADIUS, 16);
const circleMat = new THREE.MeshBasicMaterial({
  color: POINT_COLOR,
  side: THREE.DoubleSide,
  depthTest: false,
  transparent: true,
  opacity: 0.95,
});

interface AnchorPointsProps {
  measurements: BodyMeasurements;
  visible: boolean;
}

export default function AnchorPoints({ measurements, visible }: AnchorPointsProps) {
  const anchors = useMemo(() => computeAnchors(measurements), [measurements]);

  if (!visible) return null;

  return (
    <group>
      {anchors.map((a, i) => (
        <Billboard key={i} position={a.position} follow lockX={false} lockY={false} lockZ={false}>
          <mesh geometry={circleGeo} material={circleMat} renderOrder={999} />
        </Billboard>
      ))}
    </group>
  );
}
