/**
 * Per-region max-distance tether radius (m). Small = clings, large = hangs loose.
 * #gummy frente#2 body-tether (2026-06-25 spec). Tuning values; adjust @gpu-local.
 */
const REGION_RADIUS: Record<string, number> = {
  'front-torso': 0.025,
  'back-torso': 0.025,
  collar: 0.02,
  sleeve: 0.05,
  'front-skirt': 0.12,
  'back-skirt': 0.12,
};
const DEFAULT_RADIUS = 0.06;

export function regionRadius(region: string): number {
  return REGION_RADIUS[region] ?? DEFAULT_RADIUS;
}

export function buildTetherRadii(
  pieceRegions: Array<{ region: string; vertexCount: number }>,
): Float64Array {
  const total = pieceRegions.reduce((s, p) => s + p.vertexCount, 0);
  const out = new Float64Array(total);
  let off = 0;
  for (const p of pieceRegions) {
    out.fill(regionRadius(p.region), off, off + p.vertexCount);
    off += p.vertexCount;
  }
  return out;
}
