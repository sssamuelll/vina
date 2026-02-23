/**
 * Garment Fit Maps — CLO3D-equivalent stress/strain/fit visualization.
 *
 * Computes per-vertex data from XPBD solver state for three map types:
 *
 * - **Stress Map**: Force per unit area (kPa). How much pressure in the fabric.
 * - **Strain Map**: % elongation relative to rest state. How much the garment is stretched.
 * - **Fit Map**: % of maximum fabric distortion reached. Red = can't wear, yellow = tight.
 *
 * Also computes pressure points: contact points between avatar and garment.
 *
 * Reference: CLO Virtual Fashion "Garment Fit Maps" guide (2020).
 *
 * @module fitMaps
 */

// ─── Types ──────────────────────────────────────────────────────────────────

/** Which fit map visualization is active. */
export type FitMapMode = 'none' | 'stress' | 'strain' | 'fit' | 'pressure';

/** Per-vertex fit map data for rendering. */
export interface FitMapData {
  /** Mode used to compute this data */
  mode: FitMapMode;
  /** Per-vertex scalar values (length = numParticles) */
  values: Float32Array;
  /** Per-vertex RGB colors (length = numParticles * 3) */
  colors: Float32Array;
  /** Summary statistics */
  stats: FitMapStats;
}

/** Summary statistics for the garment. */
export interface FitMapStats {
  min: number;
  max: number;
  mean: number;
  /** Percentage of garment area in "can't wear" zone (fit map only) */
  cantWearPct: number;
  /** Percentage of garment area in "tight" zone (fit map only) */
  tightPct: number;
  /** Number of pressure points (pressure map only) */
  pressurePointCount: number;
}

/** Configurable ranges for fit map visualization (CLO3D "Garment Fit Properties"). */
export interface FitMapConfig {
  /** Stress map range: [min, max] in kPa. Default [0, 100]. */
  stressRange: [number, number];
  /** Strain map range: [min, max] as ratio (1.0 = no stretch). Default [1.0, 1.2]. */
  strainRange: [number, number];
  /** Fit map thresholds: [tight, cantWear] as fraction of max distortion. Default [0.8, 1.0]. */
  fitThresholds: [number, number];
  /** Distance threshold for pressure point detection (meters). Default 0.002. */
  pressureDistance: number;
}

/** Minimal solver edge data needed for fit map computation. */
export interface SolverEdgeData {
  /** Flat edge index pairs [id0, id1, id0, id1, ...] */
  stretchingIds: Int32Array;
  /** Rest lengths per edge */
  stretchingLengths: Float32Array;
}

/** Minimal fabric data needed for fit map computation. */
export interface FabricFitParams {
  /** Maximum stretch before break (ratio, e.g. 0.08 = 8%) */
  maxStretchRatio: number;
  /** Weight in g/m² */
  weight: number;
  /** Thickness in mm */
  thickness: number;
  /** Average stretch capacity (ratio) — used for stress computation */
  avgStretch: number;
}

// ─── Constants ──────────────────────────────────────────────────────────────

export const DEFAULT_FIT_MAP_CONFIG: FitMapConfig = {
  stressRange: [0, 100],
  strainRange: [1.0, 1.2],
  fitThresholds: [0.8, 1.0],
  pressureDistance: 0.002,
};

// ─── Color Scales ───────────────────────────────────────────────────────────

/**
 * 8-stop color scale matching CLO3D's blue→red gradient.
 * Each entry: [r, g, b] in 0-1 range.
 */
const STRESS_STRAIN_COLORS: [number, number, number][] = [
  [0.0, 0.0, 1.0],   // Blue (min)
  [0.0, 0.4, 1.0],   // Blue-cyan
  [0.0, 0.8, 0.8],   // Cyan
  [0.0, 1.0, 0.4],   // Green
  [0.4, 1.0, 0.0],   // Yellow-green
  [1.0, 1.0, 0.0],   // Yellow
  [1.0, 0.5, 0.0],   // Orange
  [1.0, 0.0, 0.0],   // Red (max)
];

/**
 * Fit map uses a 3-zone color scheme:
 * White (OK) → Yellow (Tight >80%) → Red (Can't Wear >100%)
 */
const FIT_COLOR_OK: [number, number, number] = [1.0, 1.0, 1.0];
const FIT_COLOR_TIGHT: [number, number, number] = [1.0, 1.0, 0.0];
const FIT_COLOR_CANT_WEAR: [number, number, number] = [1.0, 0.0, 0.0];

/** Pressure point color: magenta */
const PRESSURE_COLOR: [number, number, number] = [1.0, 0.0, 0.8];
const NO_PRESSURE_COLOR: [number, number, number] = [0.3, 0.3, 0.3];

// ─── Interpolation Helpers ──────────────────────────────────────────────────

/** Interpolate through an 8-stop color scale. t clamped to [0,1]. */
function sampleColorScale(t: number, scale: [number, number, number][]): [number, number, number] {
  const tc = Math.max(0, Math.min(1, t));
  const idx = tc * (scale.length - 1);
  const lo = Math.floor(idx);
  const hi = Math.min(lo + 1, scale.length - 1);
  const frac = idx - lo;
  return [
    scale[lo][0] + (scale[hi][0] - scale[lo][0]) * frac,
    scale[lo][1] + (scale[hi][1] - scale[lo][1]) * frac,
    scale[lo][2] + (scale[hi][2] - scale[lo][2]) * frac,
  ];
}

/** Lerp between two colors. */
function lerpColor(a: [number, number, number], b: [number, number, number], t: number): [number, number, number] {
  const tc = Math.max(0, Math.min(1, t));
  return [
    a[0] + (b[0] - a[0]) * tc,
    a[1] + (b[1] - a[1]) * tc,
    a[2] + (b[2] - a[2]) * tc,
  ];
}

// ─── Per-Vertex Strain Computation ──────────────────────────────────────────

/**
 * Compute per-vertex strain from edge constraints.
 *
 * For each edge, strain = currentLength / restLength.
 * Per-vertex strain = max of all incident edge strains (conservative estimate).
 *
 * @returns Float32Array of per-vertex strain ratios (1.0 = no deformation)
 */
export function computePerVertexStrain(
  positions: Float32Array,
  numParticles: number,
  edges: SolverEdgeData,
): Float32Array {
  const strain = new Float32Array(numParticles);
  strain.fill(1.0); // Default: no deformation

  const numEdges = edges.stretchingLengths.length;
  for (let i = 0; i < numEdges; i++) {
    const id0 = edges.stretchingIds[2 * i];
    const id1 = edges.stretchingIds[2 * i + 1];

    const dx = positions[3 * id1] - positions[3 * id0];
    const dy = positions[3 * id1 + 1] - positions[3 * id0 + 1];
    const dz = positions[3 * id1 + 2] - positions[3 * id0 + 2];
    const len = Math.sqrt(dx * dx + dy * dy + dz * dz);
    const restLen = edges.stretchingLengths[i];

    if (restLen === 0) continue;
    const edgeStrain = len / restLen;

    // Take the max strain at each vertex (worst case)
    if (edgeStrain > strain[id0]) strain[id0] = edgeStrain;
    if (edgeStrain > strain[id1]) strain[id1] = edgeStrain;
  }

  return strain;
}

// ─── Stress Map ─────────────────────────────────────────────────────────────

/**
 * Compute stress map: force per unit area (kPa) from strain and fabric properties.
 *
 * Stress ≈ E × ε where E = tensile modulus estimated from fabric data,
 * and ε = strain - 1 (elongation fraction).
 *
 * The modulus is estimated as: E = (tensileStrength_N_per_5cm) / (maxStretch × thickness × 0.05m)
 * This gives Pa; we convert to kPa.
 */
export function computeStressMap(
  positions: Float32Array,
  numParticles: number,
  edges: SolverEdgeData,
  fabric: FabricFitParams,
  config: FitMapConfig = DEFAULT_FIT_MAP_CONFIG,
): FitMapData {
  const strain = computePerVertexStrain(positions, numParticles, edges);
  const values = new Float32Array(numParticles);
  const colors = new Float32Array(numParticles * 3);

  // Estimate Young's modulus (Pa) from fabric properties
  // tensile strength (N/5cm) = force at break over 5cm strip width
  // E ≈ tensileStrength / (maxStretch × crossSectionArea)
  // crossSection ≈ thickness(m) × 0.05(m)
  const thicknessM = fabric.thickness / 1000;
  const crossSection = thicknessM * 0.05; // 5cm strip
  const maxStretch = Math.max(fabric.maxStretchRatio, 0.01);
  // Average tensile strength — we use fabric.weight as a proxy if needed
  // For simplicity: E ~ weight(g/m²) × 50 (empirical factor giving reasonable kPa range)
  // Real modulus would come from actual tensile testing; this gives CLO3D-like values
  const E = crossSection > 0 ? (fabric.weight * 50) / maxStretch : 10000;

  let min = Infinity, max = -Infinity, sum = 0;
  const [rangeMin, rangeMax] = config.stressRange;

  for (let i = 0; i < numParticles; i++) {
    const elongation = Math.max(0, strain[i] - 1.0);
    const stressKPa = (E * elongation) / 1000; // Pa → kPa
    values[i] = stressKPa;

    if (stressKPa < min) min = stressKPa;
    if (stressKPa > max) max = stressKPa;
    sum += stressKPa;

    const t = (stressKPa - rangeMin) / (rangeMax - rangeMin);
    const [r, g, b] = sampleColorScale(t, STRESS_STRAIN_COLORS);
    colors[3 * i] = r;
    colors[3 * i + 1] = g;
    colors[3 * i + 2] = b;
  }

  return {
    mode: 'stress',
    values,
    colors,
    stats: {
      min, max,
      mean: numParticles > 0 ? sum / numParticles : 0,
      cantWearPct: 0, tightPct: 0, pressurePointCount: 0,
    },
  };
}

// ─── Strain Map ─────────────────────────────────────────────────────────────

/**
 * Compute strain map: percentage of stretch relative to rest state.
 *
 * CLO3D convention: Blue = 100% (no stretch), Red = 120% (20% stretched).
 * Values expressed as percentage (100 = no deformation).
 */
export function computeStrainMap(
  positions: Float32Array,
  numParticles: number,
  edges: SolverEdgeData,
  config: FitMapConfig = DEFAULT_FIT_MAP_CONFIG,
): FitMapData {
  const strain = computePerVertexStrain(positions, numParticles, edges);
  const values = new Float32Array(numParticles);
  const colors = new Float32Array(numParticles * 3);

  const [rangeMin, rangeMax] = config.strainRange;
  let min = Infinity, max = -Infinity, sum = 0;

  for (let i = 0; i < numParticles; i++) {
    const pct = strain[i] * 100; // as percentage (100 = no deformation)
    values[i] = pct;

    if (pct < min) min = pct;
    if (pct > max) max = pct;
    sum += pct;

    const t = (strain[i] - rangeMin) / (rangeMax - rangeMin);
    const [r, g, b] = sampleColorScale(t, STRESS_STRAIN_COLORS);
    colors[3 * i] = r;
    colors[3 * i + 1] = g;
    colors[3 * i + 2] = b;
  }

  return {
    mode: 'strain',
    values,
    colors,
    stats: {
      min, max,
      mean: numParticles > 0 ? sum / numParticles : 0,
      cantWearPct: 0, tightPct: 0, pressurePointCount: 0,
    },
  };
}

// ─── Fit Map ────────────────────────────────────────────────────────────────

/**
 * Compute fit map: percentage of maximum fabric distortion reached.
 *
 * CLO3D convention:
 * - White (<80%): OK
 * - Yellow (80-100%): Tight
 * - Red (>100%): Can't Wear
 *
 * Values are 0-1+ where 1.0 = fabric stretched to its maximum.
 * The table shows what % of total garment area is in each zone.
 */
export function computeFitMap(
  positions: Float32Array,
  numParticles: number,
  edges: SolverEdgeData,
  fabric: FabricFitParams,
  config: FitMapConfig = DEFAULT_FIT_MAP_CONFIG,
  avatarPositions?: Float32Array | null,
): FitMapData {
  const strain = computePerVertexStrain(positions, numParticles, edges);
  const values = new Float32Array(numParticles);
  const colors = new Float32Array(numParticles * 3);

  // CLO3D: "Fit Map is calculated for the areas in which fabric and avatar are in contact."
  // Build contact mask — vertices within pressureDistance of avatar are "in contact"
  const contactMask = new Uint8Array(numParticles);
  if (avatarPositions && avatarPositions.length >= 3) {
    const threshold = config.pressureDistance * 3; // Slightly wider for fit map (contact zone, not just touching)
    const thresholdSq = threshold * threshold;
    const numAvatarVerts = avatarPositions.length / 3;
    for (let i = 0; i < numParticles; i++) {
      const gx = positions[3 * i], gy = positions[3 * i + 1], gz = positions[3 * i + 2];
      for (let j = 0; j < numAvatarVerts; j++) {
        const dx = gx - avatarPositions[3 * j];
        const dy = gy - avatarPositions[3 * j + 1];
        const dz = gz - avatarPositions[3 * j + 2];
        if (dx * dx + dy * dy + dz * dz < thresholdSq) {
          contactMask[i] = 1;
          break;
        }
      }
    }
  } else {
    // No avatar data — show fit map on all vertices (fallback)
    contactMask.fill(1);
  }

  const maxStretch = Math.max(fabric.maxStretchRatio, 0.001);
  const [tightThreshold, cantWearThreshold] = config.fitThresholds;
  let min = Infinity, max = -Infinity, sum = 0;
  let tightCount = 0, cantWearCount = 0;
  let contactCount = 0;

  /** Non-contact color: neutral light gray */
  const NO_CONTACT: [number, number, number] = [0.85, 0.85, 0.85];

  for (let i = 0; i < numParticles; i++) {
    const elongation = Math.max(0, strain[i] - 1.0);
    const fitRatio = elongation / maxStretch;
    values[i] = fitRatio;

    // Only color contact areas; non-contact = neutral gray
    if (!contactMask[i]) {
      colors[3 * i] = NO_CONTACT[0];
      colors[3 * i + 1] = NO_CONTACT[1];
      colors[3 * i + 2] = NO_CONTACT[2];
      continue;
    }

    contactCount++;
    if (fitRatio < min) min = fitRatio;
    if (fitRatio > max) max = fitRatio;
    sum += fitRatio;

    let color: [number, number, number];
    if (fitRatio > cantWearThreshold) {
      color = FIT_COLOR_CANT_WEAR;
      cantWearCount++;
    } else if (fitRatio > tightThreshold) {
      const t = (fitRatio - tightThreshold) / (cantWearThreshold - tightThreshold);
      color = lerpColor(FIT_COLOR_TIGHT, FIT_COLOR_CANT_WEAR, t);
      tightCount++;
    } else {
      const t = fitRatio / tightThreshold;
      color = lerpColor(FIT_COLOR_OK, FIT_COLOR_TIGHT, t);
    }

    colors[3 * i] = color[0];
    colors[3 * i + 1] = color[1];
    colors[3 * i + 2] = color[2];
  }

  // Percentages relative to contact area (not total garment)
  const total = contactCount || 1;

  return {
    mode: 'fit',
    values,
    colors,
    stats: {
      min, max,
      mean: sum / total,
      cantWearPct: (cantWearCount / total) * 100,
      tightPct: (tightCount / total) * 100,
      pressurePointCount: 0,
    },
  };
}

// ─── Pressure Points ────────────────────────────────────────────────────────

/**
 * Compute pressure points: vertices where the garment is in contact with the avatar.
 *
 * Uses distance from each garment vertex to nearest avatar surface point.
 * Avatar surface is approximated via SDF values if available, or a simple
 * distance threshold from avatar body capsules.
 *
 * @param positions - Current garment positions
 * @param numParticles - Number of particles
 * @param avatarPositions - Avatar mesh vertex positions (flat array) or null
 * @param config - Fit map configuration
 * @returns FitMapData with binary pressure values (0 or 1)
 */
export function computePressurePoints(
  positions: Float32Array,
  numParticles: number,
  avatarPositions: Float32Array | null,
  config: FitMapConfig = DEFAULT_FIT_MAP_CONFIG,
): FitMapData {
  const values = new Float32Array(numParticles);
  const colors = new Float32Array(numParticles * 3);
  let pressureCount = 0;

  if (avatarPositions && avatarPositions.length >= 3) {
    // Build simple spatial lookup: for each garment vertex, find min distance to avatar
    const threshold = config.pressureDistance;
    const thresholdSq = threshold * threshold;
    const numAvatarVerts = avatarPositions.length / 3;

    for (let i = 0; i < numParticles; i++) {
      const gx = positions[3 * i];
      const gy = positions[3 * i + 1];
      const gz = positions[3 * i + 2];

      let minDistSq = Infinity;
      // Simple brute force — for production, use spatial hash or BVH
      for (let j = 0; j < numAvatarVerts; j++) {
        const dx = gx - avatarPositions[3 * j];
        const dy = gy - avatarPositions[3 * j + 1];
        const dz = gz - avatarPositions[3 * j + 2];
        const distSq = dx * dx + dy * dy + dz * dz;
        if (distSq < minDistSq) {
          minDistSq = distSq;
          if (distSq < thresholdSq) break; // Early exit
        }
      }

      if (minDistSq < thresholdSq) {
        values[i] = 1.0;
        pressureCount++;
        colors[3 * i] = PRESSURE_COLOR[0];
        colors[3 * i + 1] = PRESSURE_COLOR[1];
        colors[3 * i + 2] = PRESSURE_COLOR[2];
      } else {
        values[i] = 0.0;
        colors[3 * i] = NO_PRESSURE_COLOR[0];
        colors[3 * i + 1] = NO_PRESSURE_COLOR[1];
        colors[3 * i + 2] = NO_PRESSURE_COLOR[2];
      }
    }
  } else {
    // No avatar data — all vertices are non-contact
    for (let i = 0; i < numParticles; i++) {
      colors[3 * i] = NO_PRESSURE_COLOR[0];
      colors[3 * i + 1] = NO_PRESSURE_COLOR[1];
      colors[3 * i + 2] = NO_PRESSURE_COLOR[2];
    }
  }

  return {
    mode: 'pressure',
    values,
    colors,
    stats: {
      min: 0, max: pressureCount > 0 ? 1 : 0,
      mean: numParticles > 0 ? pressureCount / numParticles : 0,
      cantWearPct: 0, tightPct: 0,
      pressurePointCount: pressureCount,
    },
  };
}

// ─── Unified Compute ────────────────────────────────────────────────────────

/**
 * Compute fit map data for the requested mode.
 *
 * This is the main entry point — call it each frame (or on demand) with
 * the current solver snapshot and fabric parameters.
 */
export function computeFitMapData(
  mode: FitMapMode,
  positions: Float32Array,
  numParticles: number,
  edges: SolverEdgeData,
  fabric: FabricFitParams,
  avatarPositions?: Float32Array | null,
  config: FitMapConfig = DEFAULT_FIT_MAP_CONFIG,
): FitMapData | null {
  switch (mode) {
    case 'stress':
      return computeStressMap(positions, numParticles, edges, fabric, config);
    case 'strain':
      return computeStrainMap(positions, numParticles, edges, config);
    case 'fit':
      return computeFitMap(positions, numParticles, edges, fabric, config, avatarPositions);
    case 'pressure':
      return computePressurePoints(positions, numParticles, avatarPositions ?? null, config);
    case 'none':
      return null;
  }
}

// ─── PhysicalFabric → FabricFitParams Helper ────────────────────────────────

/**
 * Extract fit-relevant params from a PhysicalFabric.
 */
export function fabricToFitParams(fabric: {
  maxStretchBeforeBreak: number;
  weight: number;
  thickness: number;
  stretchWarp: number;
  stretchWeft: number;
}): FabricFitParams {
  return {
    maxStretchRatio: fabric.maxStretchBeforeBreak / 100,
    weight: fabric.weight,
    thickness: fabric.thickness,
    avgStretch: ((fabric.stretchWarp + fabric.stretchWeft) / 2) / 100,
  };
}
