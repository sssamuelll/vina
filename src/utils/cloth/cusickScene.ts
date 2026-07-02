/**
 * Escena del gate Cusick virtual (B2, plan drape profesional 2026-07-02).
 *
 * ISO 9073-9: espécimen circular de 30 cm drapeado sobre pedestal rígido de
 * 18 cm. El disco pasa por el mesher CDT REAL de producción
 * (meshPieceOutline) — el gate mide el pipeline de verdad, no un mesh ad hoc.
 * convertToClothMeshData ya emite el mesh HORIZONTAL a yHeight constante y
 * centrado en origen: la pose Cusick exacta sin transformación.
 *
 * Rompimiento de simetría determinista (Halberg #9, plan §B2): el disco
 * perfectamente simétrico es la escena metastable canónica — el jitter radial
 * sembrado (LCG mulberry32, NUNCA Math.random: rompería el resume del gate
 * P4-0) clava la cuenca de asentamiento sin sesgar el DC (±0.6 mm ≪ banda de
 * tolerancia ±8 DC).
 *
 * Consumidores: harness @gpu-local (GPU tier, corre Samuel) + variante CI
 * (post-merge, ver plan §6 — dos gates, dos baselines hasta el backport del
 * strain-limit).
 */
import { meshPieceOutline, type MeshConfig } from '../mesh/cdtMesher';
import type { ClothMeshData } from './xpbdSolver';
import { collisionMeshFromBuffers, type CollisionMeshData } from './collisionMesh';
import type { Point2D } from '../../types/types';

export interface CusickDiscOptions {
  /** Altura Y (m) del plano del disco (típico: topY del pedestal + gap). */
  y: number;
  /** Radio del espécimen en mm de patrón (ISO: 150). */
  radiusMm?: number;
  /** Semilla del jitter determinista. */
  seed?: number;
  /** Amplitud radial del jitter en mm (> tolerancia de simplifyOutline 0.5). */
  jitterMm?: number;
  /** Puntos del outline circular. */
  segments?: number;
  /** Resolución de sim en mm (maxEdgeLength del CDT). */
  particleDistanceMm?: number;
}

/** mulberry32 — PRNG determinista, sin estado global. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function buildCusickDiscMesh(opts: CusickDiscOptions): { mesh: ClothMeshData } {
  const radius = opts.radiusMm ?? 150;
  const segments = opts.segments ?? 96;
  const jitter = opts.jitterMm ?? 0.6;
  const rand = mulberry32(opts.seed ?? 42);

  const outline: Point2D[] = [];
  for (let i = 0; i < segments; i++) {
    const t = (i / segments) * Math.PI * 2;
    const r = radius + jitter * (rand() * 2 - 1);
    outline.push({ x: r * Math.cos(t), y: r * Math.sin(t) });
  }

  const config: Required<MeshConfig> = {
    yHeight: opts.y,
    scale: 0.001, // mm → m
    maxEdgeLength: opts.particleDistanceMm ?? 7,
    minAngle: 25,
    maxRefinementPasses: 3,
    curveResolution: 12,
  };

  return { mesh: meshPieceOutline(outline, [], config) };
}

export interface CusickPedestalOptions {
  /** Altura Y (m) de la tapa superior del pedestal. */
  topY: number;
  /** Radio en metros (ISO: 0.09). */
  radius?: number;
  /** Altura del cilindro en metros. */
  height?: number;
  /** Segmentos radiales. */
  radialSegments?: number;
}

/**
 * Cilindro CERRADO (pared + ambas tapas) como CollisionMeshData — watertight
 * para que buildBodyPseudonormals produzca signos inside/outside válidos.
 */
export function buildCusickPedestal(opts: CusickPedestalOptions): CollisionMeshData {
  const r = opts.radius ?? 0.09;
  const h = opts.height ?? 0.4;
  const topY = opts.topY;
  const botY = topY - h;
  const n = opts.radialSegments ?? 48;

  // Verts indexados: anillo top [0..n), anillo bottom [n..2n), centro top 2n,
  // centro bottom 2n+1.
  const verts = new Float32Array((2 * n + 2) * 3);
  for (let i = 0; i < n; i++) {
    const t = (i / n) * Math.PI * 2;
    const x = r * Math.cos(t);
    const z = r * Math.sin(t);
    verts.set([x, topY, z], i * 3);
    verts.set([x, botY, z], (n + i) * 3);
  }
  verts.set([0, topY, 0], 2 * n * 3);
  verts.set([0, botY, 0], (2 * n + 1) * 3);

  const idx: number[] = [];
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    // Pared (dos tris por quad, winding hacia afuera).
    idx.push(i, n + i, j, j, n + i, n + j);
    // Tapa superior (normal +Y).
    idx.push(2 * n, j, i);
    // Tapa inferior (normal −Y).
    idx.push(2 * n + 1, n + i, n + j);
  }

  const mesh = collisionMeshFromBuffers(verts, new Uint32Array(idx));
  if (!mesh) throw new Error('cusick pedestal: empty collision mesh');
  return mesh;
}
