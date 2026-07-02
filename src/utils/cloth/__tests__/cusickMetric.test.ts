/**
 * B2 (plan drape profesional 2026-07-02): núcleo matemático del gate Cusick
 * virtual — ISO 9073-9: disco de 30 cm drapeado sobre pedestal de 18 cm.
 *
 * Convención ISO: DC alto = tela rígida (la silueta proyectada queda extendida);
 * DC bajo = tela fluida (el hem cae pegado al pedestal). Up-axis = Y; la
 * proyección de la silueta es al plano XZ.
 *
 * OJO: NO confundir con el `drapeCoefficient` 0-1 de PhysicalFabric, que tiene
 * la semántica INVERTIDA (0=stiff) — hallazgo W7; ese campo no se toca aquí.
 */
import { describe, it, expect } from 'vitest';
import {
  extractOrderedBoundaryLoop,
  computeDrapeCoefficient,
  countFolds,
} from '../cusickMetric';

/** Boundary circular sintético: n verts en un anillo de radio r (plano XZ, y fijo). */
function ringPositions(n: number, r: (theta: number) => number, y = 0.5): Float32Array {
  const pos = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    const t = (i / n) * Math.PI * 2;
    pos[i * 3] = r(t) * Math.cos(t);
    pos[i * 3 + 1] = y;
    pos[i * 3 + 2] = r(t) * Math.sin(t);
  }
  return pos;
}

const identityLoop = (n: number) => Uint32Array.from({ length: n }, (_, i) => i);

const SUPPORT_R = 0.09; // pedestal 18 cm
const SPECIMEN_R = 0.15; // disco 30 cm

describe('extractOrderedBoundaryLoop', () => {
  it('orders the boundary of a 2-triangle quad as a 4-cycle', () => {
    // Quad 0-1-2-3, diagonal 0-2: tris (0,1,2) + (0,2,3). Boundary = 4 aristas.
    const tris = new Uint32Array([0, 1, 2, 0, 2, 3]);
    const loop = extractOrderedBoundaryLoop(tris);
    expect(loop.length).toBe(4);
    // Es un ciclo: cada par consecutivo (wrap incluido) es arista boundary.
    const boundaryEdges = new Set(['0-1', '1-2', '2-3', '0-3']);
    for (let i = 0; i < 4; i++) {
      const a = loop[i];
      const b = loop[(i + 1) % 4];
      const key = a < b ? `${a}-${b}` : `${b}-${a}`;
      expect(boundaryEdges.has(key), `edge ${key}`).toBe(true);
    }
    expect(new Set(loop).size).toBe(4);
  });

  it('extracts the outer ring of a triangle fan (disc): center excluded', () => {
    // Fan: centro = 0, anillo = 1..8; tris (0, i, i+1).
    const n = 8;
    const tris: number[] = [];
    for (let i = 1; i <= n; i++) {
      tris.push(0, i, i === n ? 1 : i + 1);
    }
    const loop = extractOrderedBoundaryLoop(new Uint32Array(tris));
    expect(loop.length).toBe(n);
    expect(Array.from(loop)).not.toContain(0);
  });
});

describe('computeDrapeCoefficient', () => {
  it('flat specimen (hem at full 15 cm radius) → DC ≈ 100 (stiff)', () => {
    const n = 256;
    const pos = ringPositions(n, () => SPECIMEN_R);
    const dc = computeDrapeCoefficient(pos, identityLoop(n), {
      supportRadius: SUPPORT_R,
      specimenRadius: SPECIMEN_R,
    });
    expect(dc).toBeGreaterThan(98);
    expect(dc).toBeLessThanOrEqual(101); // shoelace de polígono inscrito ≈ círculo
  });

  it('fully draped (hem fallen to the support edge) → DC ≈ 0 (fluid)', () => {
    const n = 256;
    const pos = ringPositions(n, () => SUPPORT_R, 0.3);
    const dc = computeDrapeCoefficient(pos, identityLoop(n), {
      supportRadius: SUPPORT_R,
      specimenRadius: SPECIMEN_R,
    });
    expect(Math.abs(dc)).toBeLessThan(2);
  });

  it('is monotone in hem radius (mid-radius lands strictly between)', () => {
    const n = 256;
    const mk = (r: number) =>
      computeDrapeCoefficient(ringPositions(n, () => r), identityLoop(n), {
        supportRadius: SUPPORT_R,
        specimenRadius: SPECIMEN_R,
      });
    const mid = mk(0.12);
    expect(mid).toBeGreaterThan(mk(0.10));
    expect(mid).toBeLessThan(mk(0.14));
  });

  it('is orientation-independent (reversed loop gives the same DC)', () => {
    const n = 128;
    const pos = ringPositions(n, (t) => 0.12 + 0.01 * Math.cos(5 * t));
    const loop = identityLoop(n);
    const reversed = Uint32Array.from(loop).reverse();
    const opts = { supportRadius: SUPPORT_R, specimenRadius: SPECIMEN_R };
    expect(computeDrapeCoefficient(pos, loop, opts)).toBeCloseTo(
      computeDrapeCoefficient(pos, reversed, opts),
      10,
    );
  });
});

describe('countFolds', () => {
  it('counts k lobes of a sinusoidal hem r(θ) = r0 + a·cos(kθ)', () => {
    const n = 512;
    for (const k of [4, 6, 9]) {
      const pos = ringPositions(n, (t) => 0.12 + 0.015 * Math.cos(k * t));
      expect(countFolds(pos, identityLoop(n)), `k=${k}`).toBe(k);
    }
  });

  it('a circular hem with sub-prominence noise has 0 folds', () => {
    const n = 512;
    // Ruido determinista minúsculo (0.2 mm) muy por debajo de la prominencia default (2 mm).
    const pos = ringPositions(n, (t) => 0.12 + 0.0002 * Math.sin(37 * t) * Math.cos(11 * t));
    expect(countFolds(pos, identityLoop(n))).toBe(0);
  });

  it('fold count is invariant to loop starting point (circular smoothing)', () => {
    const n = 512;
    const pos = ringPositions(n, (t) => 0.12 + 0.015 * Math.cos(6 * t));
    const loop = identityLoop(n);
    const rotated = new Uint32Array(n);
    for (let i = 0; i < n; i++) rotated[i] = loop[(i + 200) % n];
    expect(countFolds(pos, rotated)).toBe(countFolds(pos, loop));
  });
});
