/**
 * Regression guard for #527 — coordinate normalization in the Seamly2D adapter.
 *
 * `adaptSeamlyPattern` used to hardcode a cm→mm scale of ×10 for every pattern,
 * regardless of the pattern's declared `unit`. Patterns authored in millimetres
 * (jacket1_52-176, jacket2-6, pants1_52-176) were therefore inflated 10×, so their
 * geometry spanned ~10 m. That overflowed the 2D canvas and made the CDT mesher
 * non-terminating, so the cloth never produced a mesh.
 *
 * These tests load the real converted patterns through `adaptSeamlyPattern` and
 * assert the resulting points sit in a physically plausible range. They FAIL on the
 * pre-fix code (jacket ~10 m) and PASS once the adapter honours the declared unit.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { adaptSeamlyPattern, type SeamlyPattern } from '../seamlyAdapter';

// Patterns with missing measurements (e.g. the jacket) emit many resolver
// warnings via console.warn. Silence them so the suite output stays readable and
// the interception doesn't add latency under parallel load.
let warnSpy: ReturnType<typeof vi.spyOn>;
beforeAll(() => { warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {}); });
afterAll(() => { warnSpy.mockRestore(); });

// adaptSeamlyPattern is fast in isolation (a few ms) but the full suite runs this
// file on a worker shared with the 40s e2ePipeline test; under that contention the
// 5s default occasionally trips. 15s is a comfortable margin without masking a
// genuine hang.
const TIMEOUT_MS = 15_000;

const OUTPUT_DIR = join(__dirname, '..', '..', '..', '..', 'tools', 'seamly2d-converter', 'output');

/** Default avatar measurements (cm), per the e2e DoD harness. */
const MEASUREMENTS: Record<string, number> = {
  chest: 96,
  waist: 80,
  hips: 100,
  height: 180,
  shoulderWidth: 40,
  shoulder: 40,
  armLength: 60,
  inseam: 80,
};

function loadPattern(name: string): SeamlyPattern {
  return JSON.parse(readFileSync(join(OUTPUT_DIR, `${name}.json`), 'utf-8')) as SeamlyPattern;
}

function boundingBox(name: string) {
  const adapted = adaptSeamlyPattern(loadPattern(name), MEASUREMENTS);
  const xs = adapted.points.map((p) => p.x).filter((v) => Number.isFinite(v));
  const ys = adapted.points.map((p) => p.y).filter((v) => Number.isFinite(v));
  return {
    width: Math.max(...xs) - Math.min(...xs),
    height: Math.max(...ys) - Math.min(...ys),
    pointCount: adapted.points.length,
  };
}

/**
 * A garment pattern, laid out flat, is at most a couple of metres across (a coat
 * panel plus seam allowance). 5000 mm (5 m) is a generous upper bound that a
 * correctly-normalized pattern never exceeds but a 10×-inflated one always does.
 */
const MAX_REASONABLE_MM = 5000;

describe('#527 — Seamly2D coordinate normalization (unit-aware scaling)', () => {
  it('jacket1_52-176 (unit: mm) stays within a physical range', { timeout: TIMEOUT_MS }, () => {
    const bbox = boundingBox('jacket1_52-176');
    expect(bbox.pointCount).toBeGreaterThan(0);
    // Pre-fix: width ≈ 10071 mm, height ≈ 7886 mm (10× inflated). Post-fix: ≈ 1 m.
    expect(
      bbox.width,
      `jacket bbox width ${bbox.width.toFixed(0)}mm exceeds ${MAX_REASONABLE_MM}mm — coords not normalized (#527)`,
    ).toBeLessThan(MAX_REASONABLE_MM);
    expect(
      bbox.height,
      `jacket bbox height ${bbox.height.toFixed(0)}mm exceeds ${MAX_REASONABLE_MM}mm — coords not normalized (#527)`,
    ).toBeLessThan(MAX_REASONABLE_MM);
  });

  it('mm patterns are not 10× inflated relative to cm patterns', { timeout: TIMEOUT_MS }, () => {
    // The mm jacket and the cm shirt should be the same order of magnitude once
    // both are normalized to mm. Before the fix the jacket was ~7× the shirt.
    const jacket = boundingBox('jacket1_52-176');
    const shirt = boundingBox('male_shirt');
    expect(jacket.width / shirt.width).toBeLessThan(3);
  });

  it('male_shirt (unit: cm) is unchanged — cm still scales ×10', { timeout: TIMEOUT_MS }, () => {
    // Guards against the fix accidentally regressing the cm path. The shirt is
    // authored in cm; a correct ×10 keeps it ~1–1.5 m wide.
    const bbox = boundingBox('male_shirt');
    expect(bbox.width).toBeGreaterThan(100); // not collapsed (would be ~148mm if ×1 by mistake)
    expect(bbox.width).toBeLessThan(MAX_REASONABLE_MM);
    expect(bbox.height).toBeLessThan(MAX_REASONABLE_MM);
  });
});
