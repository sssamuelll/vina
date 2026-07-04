/**
 * wrapIsometry — pins the ISOMETRIC wrap parameterization (plan §6bis).
 *
 * The box-sleeve bug: wrapPanel parameterized the arc on the BODY radius
 * (φ = w/R) while placing the cloth at R + gap → over-curvature ×(R+gap)/R →
 * 18% of María's sleeve vertices piled on the ±165° clamp lines and the rest
 * pre-stretched +60% (the "pillow"). The collar had it worse (59% clamped).
 *
 * Pins:
 *  (a) a panel of width w wrapped at cloth radius r covers arc = w/r EXACTLY
 *      (no clamp) while w/r < thetaMax;
 *  (b) the wrap is an isometry: adjacent-vertex distances pre-wrap ≈ post-wrap;
 *  (c) the synthetic María sleeve (panel 381mm, armR 50mm) clamps ≤5% of verts;
 *  (d) the real María collar clamps ~0% under the collar wrap (was 44.2% under
 *      DEFAULT_WRAP's 150° cap — the "knot at the neckline", plan item 3).
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import * as THREE from 'three';
import { wrapPanel } from '../wrapPanel';
import { wrapParamsForRegion, DEFAULT_WRAP, MAX_SLEEVE_WRAP, MAX_COLLAR_WRAP } from '../wrapParams';
import { surfaceFrame, type SurfaceFrame } from '../surfaceFrame';
import { importDXFContent } from '../../../dxf';
import { classifyPiecesGeometric } from '../../../geometricClassifier';
import { detectSemanticEdges } from '../../../semanticEdges';
import { computeEffectiveRegions, deriveDimensions, outlineBBox } from '../../garmentPlacement';
import { meshPiece } from '../../../mesh';
import type { BodyMeasurements, PatternPiece } from '../../../../types/types';

const MARIA_FIXTURE = resolve(__dirname, '../../../../../tests/fixtures/garments/maria_patrones_samuel_2M.dxf');
const MARIA_MEAS = { height: 180, chest: 96, waist: 82, hips: 96, shoulder: 44, armLength: 64, inseam: 82 } as BodyMeasurements;

// Sleeve-like frame: axis +X, normal +Z.
const frameOf = (radius: number): SurfaceFrame => ({
  point: [0, 1.4, 0], normal: [0, 0, 1], tangent: [1, 0, 0], axis: [1, 0, 0], radius,
});

/** Signed wrap angle of a wrapped point around the frame axis (atan2 in the
 *  normal/binormal plane) — exact inverse of wrapPanel's φ. */
function wrapAngle(p: number[], frame: SurfaceFrame): number {
  const axis = new THREE.Vector3(...frame.axis).normalize();
  const normal = new THREE.Vector3(...frame.normal).normalize();
  const binormal = new THREE.Vector3().crossVectors(axis, normal).normalize();
  const d = new THREE.Vector3(p[0] - frame.point[0], p[1] - frame.point[1], p[2] - frame.point[2]);
  const radial = d.sub(axis.clone().multiplyScalar(d.dot(axis)));
  return Math.atan2(radial.dot(binormal), radial.dot(normal));
}

describe('wrap isometry (§6bis fix)', () => {
  it('(a) a panel of width w covers arc = w / clothRadius EXACTLY when under thetaMax', () => {
    const frame = frameOf(0.05);
    const params = { thetaMaxRad: MAX_SLEEVE_WRAP, gap: 0.03 };
    const rCloth = frame.radius + params.gap; // 0.08 — where the cloth lives
    const width = 0.3; // 0.3 / 0.08 = 3.75 rad < MAX_SLEEVE_WRAP → no clamp
    // Edge-to-edge coverage is exact...
    const a = wrapAngle(wrapPanel([-width / 2, 0, 0], frame, params), frame);
    const b = wrapAngle(wrapPanel([+width / 2, 0, 0], frame, params), frame);
    expect(b - a).toBeCloseTo(width / rCloth, 10);
    // ...and the parameterization is linear in w across the panel.
    for (const w of [-0.12, -0.05, 0, 0.07, 0.14]) {
      const phi = wrapAngle(wrapPanel([w, 0, 0], frame, params), frame);
      expect(phi).toBeCloseTo(w / rCloth, 10);
    }
  });

  it('(b) arc lengths are preserved: adjacent-vertex distances pre-wrap ≈ post-wrap (≤1%)', () => {
    const frame = frameOf(0.05);
    const params = { thetaMaxRad: MAX_SLEEVE_WRAP, gap: 0.03 };
    const step = 0.005; // 5mm — production particleDistance
    // Grid inside the un-clamped range (|w|/0.08 < 165°).
    for (let w = -0.15; w < 0.15; w += step) {
      for (let u = 0; u < 0.02; u += step) {
        const p = wrapPanel([w, 0, u], frame, params);
        const pw = wrapPanel([w + step, 0, u], frame, params); // width neighbour
        const pu = wrapPanel([w, 0, u + step], frame, params); // axis neighbour
        const dw = Math.hypot(pw[0] - p[0], pw[1] - p[1], pw[2] - p[2]);
        const du = Math.hypot(pu[0] - p[0], pu[1] - p[1], pu[2] - p[2]);
        expect(Math.abs(dw - step) / step).toBeLessThan(0.01);
        expect(Math.abs(du - step) / step).toBeLessThan(0.01);
      }
    }
  });

  it('(c) the María sleeve case (panel 381mm, armR 50mm) clamps ≤5% of vertices', () => {
    const R = 0.05;
    const panelWidth = 0.381;
    const frame = frameOf(R);
    const params = wrapParamsForRegion('left-sleeve', frame, panelWidth);
    const rCloth = R + params.gap;
    const half = params.thetaMaxRad / 2;
    // Synthetic 5mm grid spanning the panel width — the clamp predicate is
    // |w / rCloth| > thetaMax/2 (what wrapPanel clips).
    let total = 0;
    let clamped = 0;
    let clampedOld = 0;
    for (let w = -panelWidth / 2; w <= panelWidth / 2; w += 0.005) {
      total++;
      if (Math.abs(w / rCloth) > half + 1e-9) clamped++;
      if (Math.abs(w / R) > half + 1e-9) clampedOld++; // old φ = w/R for contrast
    }
    expect(clamped / total).toBeLessThanOrEqual(0.05); // in fact 0 — coverage = exactly 330°
    // The old parameterization piled a sizeable share on the clamp lines
    // (measured ~18% on the real mesh; the 1-D width grid shows the same order).
    expect(clampedOld / total).toBeGreaterThan(0.1);
  });

  it("(d) María's real collar: ~0% clamped under the collar wrap (was 44.2% with DEFAULT_WRAP)", () => {
    const pieces = importDXFContent(readFileSync(MARIA_FIXTURE, 'utf-8'), { unit: 'auto', autoDetect: true }).pieces;
    const map = classifyPiecesGeometric(pieces);
    for (const p of pieces as PatternPiece[]) {
      const c = map.get(p.id)!;
      if (c.category !== 'other') { p.category = c.category; if (c.side) p.side = c.side; }
      p.edges = detectSemanticEdges(p);
    }
    const regions = computeEffectiveRegions(pieces);
    const collarIdx = regions.indexOf('collar');
    expect(collarIdx).toBeGreaterThanOrEqual(0);

    const d = deriveDimensions(MARIA_MEAS);
    const frame = surfaceFrame('collar', d);
    // Production panel width: outline bbox width in metres (arrangementBinding).
    // Verified circumferential for María's collar: bbox 456×40.9mm.
    const panelWidth = outlineBBox(pieces[collarIdx].outline).width * 0.001;
    const params = wrapParamsForRegion('collar', frame, panelWidth);
    expect(params.thetaMaxRad).toBeCloseTo(MAX_COLLAR_WRAP, 10);
    // Coarse mesh (15mm) — enough vertices for a stable clamped fraction.
    const mesh = meshPiece(pieces[collarIdx], {
      yHeight: 0, scale: 0.001, maxEdgeLength: 15, minAngle: 25, maxRefinementPasses: 3, curveResolution: 12,
    });
    const n = mesh.vertices.length / 3;
    const halfDefault = DEFAULT_WRAP.thetaMaxRad / 2;
    const halfNow = params.thetaMaxRad / 2;
    let clampedDefault = 0; // isometric φ but DEFAULT_WRAP (150° cap) — pre-fix state
    let clampedNow = 0;     // collar wrap: 330° cap + panel-derived radius
    for (let i = 0; i < mesh.vertices.length; i += 3) {
      const w = mesh.vertices[i]; // mesher-local +X = circumference width
      if (Math.abs(w / (frame.radius + DEFAULT_WRAP.gap)) > halfDefault) clampedDefault++;
      if (Math.abs(w / (frame.radius + params.gap)) > halfNow + 1e-9) clampedNow++;
    }
    const before = clampedDefault / n;
    const after = clampedNow / n;
    console.log(`[collar coverage] clamped DEFAULT_WRAP (150°): ${(before * 100).toFixed(1)}% → collar wrap (330°, panel-derived r): ${(after * 100).toFixed(1)}% (n=${n})`);
    // Historical contrast: DEFAULT_WRAP clamped 44.2% of the band onto the ±75°
    // lines (the neckline "knot"). The panel-derived collar wrap must uncap it.
    expect(before).toBeGreaterThan(0.4);
    expect(after).toBeLessThanOrEqual(0.05); // in fact 0 — coverage = exactly 330°
  });
});
