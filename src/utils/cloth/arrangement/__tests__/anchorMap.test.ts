import { describe, it, expect } from 'vitest';
import { buildAnchorMap, BEARINGS } from '../anchorMap';
import type { CollisionMeshData } from '../../collisionMesh';
import type { BodyMeasurements } from '../../../../types/types';

// cm, matching deriveDimensions expectations. No waistHeight → h·0.55.
const MEASUREMENTS: BodyMeasurements = {
  height: 170,
  chest: 90,
  waist: 70,
  hips: 95,
  shoulder: 40,
  armLength: 55,
  inseam: 78,
};
// Derived heights (deriveDimensions): waist 0.935, shoulder 1.394, neck 1.479.
// Rings: chest 1.1645 / waist 0.935 / hip 0.835 / collar 1.4365 /
// thigh 0.663 / knee 0.39. Arm ring axis points sit at |x| ≥ 0.33 — outside
// the cylinder → arm rings omitted in every test below.

const R = 0.15;

/** Vertical cylinder tri soup: radius R around the y-axis, x=z=0.
 *  Normals are zeros — buildAnchorMap only reads vertices. */
function cylinderSoup(yMin: number, yMax: number, radius = R, segments = 32): CollisionMeshData {
  const stacks = Math.max(1, Math.round((yMax - yMin) / 0.02)); // 2cm bands
  const verts: number[] = [];
  const at = (seg: number, stack: number): [number, number, number] => {
    const a = (seg / segments) * 2 * Math.PI;
    return [Math.sin(a) * radius, yMin + (stack / stacks) * (yMax - yMin), Math.cos(a) * radius];
  };
  for (let st = 0; st < stacks; st++) {
    for (let sg = 0; sg < segments; sg++) {
      const p00 = at(sg, st), p10 = at(sg + 1, st), p01 = at(sg, st + 1), p11 = at(sg + 1, st + 1);
      verts.push(...p00, ...p10, ...p11);
      verts.push(...p00, ...p11, ...p01);
    }
  }
  const triCount = verts.length / 9;
  return { vertices: new Float32Array(verts), normals: new Float32Array(triCount * 3), triCount };
}

const dist2D = (p: [number, number, number]) => Math.hypot(p[0], p[2]);

describe('buildAnchorMap', () => {
  const full = cylinderSoup(0.2, 1.6);

  it('extracts torso rings with radius ≈ R (±5%)', () => {
    const map = buildAnchorMap(full, MEASUREMENTS);
    const torso = map.rings.filter((r) => r.region === 'front-torso');
    expect(torso.map((r) => r.ring)).toEqual([0, 1, 2]);
    for (const ring of torso) {
      expect(ring.radius).toBeGreaterThan(R * 0.95);
      expect(ring.radius).toBeLessThan(R * 1.05);
      expect(ring.points).toHaveLength(8);
    }
  });

  it('places points at measured radius + 1cm standoff from the axis', () => {
    const map = buildAnchorMap(full, MEASUREMENTS);
    const vertical = map.points.filter((p) => !p.region.includes('sleeve'));
    expect(vertical.length).toBeGreaterThan(0);
    for (const p of vertical) {
      expect(dist2D(p.position)).toBeCloseTo(R + 0.01, 2);
      // outward is unit and radial
      expect(Math.hypot(...p.outward)).toBeCloseTo(1, 6);
      expect(p.outward[1]).toBeCloseTo(0, 6);
    }
  });

  it('emits stable, unique IDs in the `${region}.ring${i}.${bearing}` format', () => {
    const map = buildAnchorMap(full, MEASUREMENTS);
    const ids = map.points.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
    const bearingAlt = BEARINGS.join('|');
    const re = new RegExp(`^[a-z-]+\\.ring\\d+\\.(${bearingAlt})$`);
    for (const id of ids) expect(id).toMatch(re);
    // Spot-check the pact: torso chest ring, front bearing.
    expect(ids).toContain('front-torso.ring0.front');
    expect(ids).toContain('front-torso.ring1.back');
    expect(ids).toContain('collar.ring0.left');
  });

  it('omits rings whose band is empty (short cylinder → no leg rings)', () => {
    const short = cylinderSoup(0.8, 1.5); // torso zone only — legs at 0.663/0.39
    const map = buildAnchorMap(short, MEASUREMENTS);
    expect(map.rings.some((r) => r.region === 'front-skirt')).toBe(false);
    // torso + collar still there
    expect(map.rings.filter((r) => r.region === 'front-torso')).toHaveLength(3);
    expect(map.rings.filter((r) => r.region === 'collar')).toHaveLength(1);
    // arm ring axis points lie outside the cylinder → omitted, not invented
    expect(map.rings.some((r) => r.region.includes('sleeve'))).toBe(false);
  });

  it('is deterministic: two calls → identical result', () => {
    const a = buildAnchorMap(full, MEASUREMENTS);
    const b = buildAnchorMap(full, MEASUREMENTS);
    expect(b).toEqual(a);
  });
});
