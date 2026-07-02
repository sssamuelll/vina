/**
 * Face-poke corr≈0 debug probe — DEV-ONLY, no production callsite.
 *
 * The GPU face-poke kernel (tslFacePoke.ts) compiles and runs but does not
 * visibly tent — dispatch-order analysis says corr is effectively ZERO at
 * output. The `correct` pass already binds 8/8 storage buffers, so NO debug
 * buffer can be added to the kernel. This probe diagnoses from the OUTSIDE:
 * position readback-diff (GPU truth) vs a CPU-oracle expectation computed
 * from the very same packed inputs the kernel binds. Divergence isolates:
 *
 *   expected=0                    → no pokes in the current pose (inconclusive
 *                                    probe; re-run mid-drape when the body
 *                                    shows through the cloth faces)
 *   expected>0, snapshot stale    → the snapshot kernel never wrote (dispatch
 *                                    / codegen of the snapshot pass)
 *   expected>0, GPU moved 0       → inputs + snapshot are fine → suspect TSL
 *                                    codegen of the correct kernel (corr
 *                                    accumulation across nested Loop closures
 *                                    / push predicate never firing)
 *   both >0, magnitudes differ    → kernel alive but math diverges (compare
 *                                    maxCorr + histograms)
 *
 * ── @gpu-local usage (browser console, Vite dev server) ─────────────────────
 *
 *   1. Load a project with avatar + garment on the GPU tier, press Play, let
 *      it drape into the poke state, then PAUSE the simulation — the probe
 *      needs quiescent positions (a running frame loop moves particles between
 *      the before/after readbacks and drowns the diff in solver motion).
 *   2. In the console:
 *
 *        const { runFacePokeDebugProbe } =
 *          await import('/src/utils/cloth/gpu/facePokeDebug.ts');
 *        const report = await runFacePokeDebugProbe(window.__OPENCLO_GPU_CLIENT__);
 *        console.log(report.verdict);
 *        console.log(report);
 *
 *   `GPU_CAPABILITIES.facePoke` stays FALSE — the probe dispatches
 *   `facePokeNodes.snapshot` / `.correct` DIRECTLY via `renderer.computeAsync`,
 *   bypassing the frame-loop gate in GarmentSimulation. `__OPENCLO_GPU_CLIENT__`
 *   is exposed (dev builds only) by GpuSolverClient when the avatar's face-poke
 *   nodes are built.
 *
 *   NOTE the probe is invasive: one `correct` dispatch moves posBuf/prevPosBuf
 *   by up to MAX_PUSH_DIST (0.05 m) on contacted particles. Re-pose or reload
 *   after probing.
 *
 * @module facePokeDebug
 */

import { facePokeCorrection } from '../facePokeCorrection';

/**
 * Mirrors `MAX_PUSH_DIST` in tslFacePoke.ts. Deliberately NOT imported:
 * keeps this module (and its vitest coverage) free of the three/tsl import
 * chain — the kernel builders in tslFacePoke pull in three/tsl at module
 * scope, which the pure expected-side math never needs.
 */
const MAX_PUSH_DIST = 0.05;

/** A particle "moved" when its position delta exceeds this (meters). */
const MOVED_EPS = 1e-7;

/** Histogram bin upper edges (|corr| in meters); last bin is open-ended. */
const HISTOGRAM_EDGES = [1e-7, 1e-5, 1e-4, 1e-3, 1e-2] as const;
const HISTOGRAM_LABELS = ['<1e-7', '[1e-7,1e-5)', '[1e-5,1e-4)', '[1e-4,1e-3)', '[1e-3,1e-2)', '>=1e-2'] as const;

// ─── Contracts ──────────────────────────────────────────────────────────────

/** Minimal renderer surface the probe needs (Three.js WebGPURenderer satisfies it). */
export interface FacePokeProbeRenderer {
  computeAsync(node: unknown): Promise<unknown>;
  getArrayBufferAsync(attribute: unknown): Promise<ArrayBuffer>;
}

/**
 * Face-poke kernel inputs + nodes, as exposed by
 * `GpuSolverClient.getFacePokeDebugState()`. The typed arrays are the
 * CPU-side copies of the EXACT buffers uploaded to the GPU (SBA `.array`),
 * so the expected-side oracle consumes the same packed bytes the kernel binds.
 */
export interface FacePokeDebugState {
  /** snapshot + correct compute nodes (dispatch via renderer.computeAsync). */
  nodes: { snapshot: unknown; correct: unknown };
  /** Packed cloth CSR (packFacePokeCsr layout: [offsets(N+1), list, triIds]). */
  csr: Uint32Array;
  /** Interleaved body geometry (packFacePokeBodyGeom: 18 floats/tri). */
  bodyGeom: Float32Array;
  /** Inverse masses (0 = pinned; kept in sync by freezePieces/setPins). */
  invMass: Float32Array;
  /** facePokeSnapshotSBA — read back post-dispatch to verify the snapshot kernel wrote. */
  snapshotSBA: unknown;
  numParticles: number;
  numClothTriangles: number;
  numBodyTris: number;
  /** Margin the correct kernel was built with (avatar margin). */
  margin: number;
  /** WebGPURenderer cached by the client (null until the first rendered frame). */
  renderer: FacePokeProbeRenderer | null;
}

/** The client surface the probe needs (GpuSolverClient satisfies it). */
export interface FacePokeProbeClient {
  getFacePokeDebugState(): FacePokeDebugState | null;
  readPositionsToCPU(renderer?: FacePokeProbeRenderer): Promise<Float32Array | null>;
}

export interface FacePokeMagnitudeStats {
  /** Particles with |corr| > 1e-7. */
  movedCount: number;
  /** Max |corr| over all particles (meters). */
  maxCorr: number;
  /** |corr| histogram, bin label → particle count. */
  histogram: Record<string, number>;
}

export interface FacePokeDebugReport {
  numParticles: number;
  numClothTriangles: number;
  numBodyTris: number;
  margin: number;
  /** true = post-dispatch snapshot buffer equals the BEFORE positions (kernel wrote). */
  snapshotWrote: boolean;
  /** Max |snapshot - before| component (meters); >0 with snapshotWrote=false = stale/unwritten. */
  snapshotMaxDiff: number;
  /** GPU truth: per-particle |after - before| over ONE snapshot+correct dispatch. */
  gpu: FacePokeMagnitudeStats;
  /** CPU-oracle expectation on the BEFORE positions + the same packed inputs. */
  expected: FacePokeMagnitudeStats & { facesWithContact: number };
  /** Human-readable isolation of the divergence. */
  verdict: string;
}

// ─── Pure expected-side math (unit-tested in facePokeOracle.test.ts) ────────

export interface FacePokeExpectedInputs {
  csr: Uint32Array;
  bodyGeom: Float32Array;
  invMass?: Float32Array | null;
  numParticles: number;
  numClothTriangles: number;
  numBodyTris: number;
  margin: number;
}

export interface FacePokeExpectedResult {
  /** Per-particle expected correction (numParticles*3), kernel-clamped. */
  corr: Float64Array;
  /** Cloth faces with at least one poking body vertex. */
  facesWithContact: number;
  stats: FacePokeMagnitudeStats;
}

/**
 * CPU-oracle expectation for ONE face-poke pass: runs `facePokeCorrection`
 * per cloth face over `positions` (brute force — no BVH; the kernel's BVH is
 * an enumeration optimization, not a semantic filter), accumulates each
 * corner's share, then mirrors the kernel's two output gates: invMass=0 skip
 * and per-particle MAX_PUSH_DIST clamp on the accumulated total.
 *
 * Per-triangle scatter here equals the kernel's per-vertex CSR gather exactly:
 * the CSR lists each (vertex, face) incidence once.
 */
export function computeExpectedFacePokeCorrections(
  positions: Float32Array,
  inputs: FacePokeExpectedInputs,
): FacePokeExpectedResult {
  const { csr, bodyGeom, invMass, numParticles, numClothTriangles, numBodyTris, margin } = inputs;

  // De-interleave the packed body geometry into the oracle's input shape.
  const bodyVerts = new Float32Array(numBodyTris * 9);
  const bodyPseudo = new Float32Array(numBodyTris * 9);
  for (let t = 0; t < numBodyTris; t++) {
    for (let k = 0; k < 9; k++) {
      bodyVerts[t * 9 + k] = bodyGeom[t * 18 + k];
      bodyPseudo[t * 9 + k] = bodyGeom[t * 18 + 9 + k];
    }
  }

  const triIdsBase = numParticles + 1 + numClothTriangles * 3;
  const corr = new Float64Array(numParticles * 3);
  let facesWithContact = 0;

  for (let t = 0; t < numClothTriangles; t++) {
    const i0 = csr[triIdsBase + t * 3];
    const i1 = csr[triIdsBase + t * 3 + 1];
    const i2 = csr[triIdsBase + t * 3 + 2];
    const r = facePokeCorrection(
      positions[i0 * 3], positions[i0 * 3 + 1], positions[i0 * 3 + 2],
      positions[i1 * 3], positions[i1 * 3 + 1], positions[i1 * 3 + 2],
      positions[i2 * 3], positions[i2 * 3 + 1], positions[i2 * 3 + 2],
      bodyVerts, bodyPseudo, margin,
    );
    const hit =
      r.dA.some((v) => v !== 0) || r.dB.some((v) => v !== 0) || r.dC.some((v) => v !== 0);
    if (!hit) continue;
    facesWithContact++;
    for (let c = 0; c < 3; c++) {
      corr[i0 * 3 + c] += r.dA[c];
      corr[i1 * 3 + c] += r.dB[c];
      corr[i2 * 3 + c] += r.dC[c];
    }
  }

  // Kernel output gates: pinned skip (w>0 If) + per-particle total clamp.
  for (let i = 0; i < numParticles; i++) {
    if (invMass && invMass[i] === 0) {
      corr[i * 3] = 0; corr[i * 3 + 1] = 0; corr[i * 3 + 2] = 0;
      continue;
    }
    const len = Math.hypot(corr[i * 3], corr[i * 3 + 1], corr[i * 3 + 2]);
    if (len > MAX_PUSH_DIST) {
      const s = MAX_PUSH_DIST / len;
      corr[i * 3] *= s; corr[i * 3 + 1] *= s; corr[i * 3 + 2] *= s;
    }
  }

  return { corr, facesWithContact, stats: summarizeMagnitudes(magnitudesOf(corr, numParticles)) };
}

// ─── Probe ──────────────────────────────────────────────────────────────────

/**
 * One-shot face-poke probe: readback BEFORE → dispatch snapshot + correct →
 * readback AFTER → diff, plus the CPU-oracle expectation on the BEFORE state.
 * Dev-only; see the module header for the exact @gpu-local console snippet.
 */
export async function runFacePokeDebugProbe(
  client: FacePokeProbeClient,
  rendererArg?: FacePokeProbeRenderer,
): Promise<FacePokeDebugReport> {
  const state = client.getFacePokeDebugState();
  if (!state) {
    throw new Error(
      '[facePokeDebug] face-poke state unavailable — the avatar body must be set ' +
        "(facePokeNodes are built in setTslCollisionBody('__avatar__', …)).",
    );
  }
  const renderer = rendererArg ?? state.renderer;
  if (!renderer) {
    throw new Error(
      '[facePokeDebug] no renderer — pass one explicitly or let the sim render ' +
        'a frame first (readbackPositionsToGeometry caches it on the client).',
    );
  }

  const before = await client.readPositionsToCPU(renderer);
  if (!before) throw new Error('[facePokeDebug] position readback (before) failed.');

  await renderer.computeAsync(state.nodes.snapshot);
  await renderer.computeAsync(state.nodes.correct);

  const after = await client.readPositionsToCPU(renderer);
  if (!after) throw new Error('[facePokeDebug] position readback (after) failed.');

  // Did the snapshot kernel write? Post-dispatch it must equal BEFORE positions.
  const snapshotRaw = new Float32Array(await renderer.getArrayBufferAsync(state.snapshotSBA));
  const snapshot = toVec3(snapshotRaw, state.numParticles);
  let snapshotMaxDiff = 0;
  for (let k = 0; k < state.numParticles * 3; k++) {
    const d = Math.abs(snapshot[k] - before[k]);
    if (d > snapshotMaxDiff) snapshotMaxDiff = d;
  }
  const snapshotWrote = snapshotMaxDiff <= MOVED_EPS;

  // GPU truth: per-particle displacement over the single correct dispatch.
  const gpuMags = new Float64Array(state.numParticles);
  for (let i = 0; i < state.numParticles; i++) {
    gpuMags[i] = Math.hypot(
      after[i * 3] - before[i * 3],
      after[i * 3 + 1] - before[i * 3 + 1],
      after[i * 3 + 2] - before[i * 3 + 2],
    );
  }
  const gpu = summarizeMagnitudes(gpuMags);

  // CPU-oracle expectation on the same inputs.
  const exp = computeExpectedFacePokeCorrections(before, state);
  const expected = { ...exp.stats, facesWithContact: exp.facesWithContact };

  return {
    numParticles: state.numParticles,
    numClothTriangles: state.numClothTriangles,
    numBodyTris: state.numBodyTris,
    margin: state.margin,
    snapshotWrote,
    snapshotMaxDiff,
    gpu,
    expected,
    verdict: verdictFor(expected, gpu, snapshotWrote),
  };
}

// ─── Helpers ────────────────────────────────────────────────────────────────

/** Strip a possibly vec4-padded readback to flat vec3 (mirrors readPositionsToCPU). */
function toVec3(raw: Float32Array, numParticles: number): Float32Array {
  if (raw.length === numParticles * 3) return raw;
  if (raw.length === numParticles * 4) {
    const out = new Float32Array(numParticles * 3);
    for (let i = 0; i < numParticles; i++) {
      out[i * 3] = raw[i * 4];
      out[i * 3 + 1] = raw[i * 4 + 1];
      out[i * 3 + 2] = raw[i * 4 + 2];
    }
    return out;
  }
  throw new Error(
    `[facePokeDebug] unexpected readback length ${raw.length} for ${numParticles} particles (want *3 or *4).`,
  );
}

function magnitudesOf(corr: Float64Array, numParticles: number): Float64Array {
  const mags = new Float64Array(numParticles);
  for (let i = 0; i < numParticles; i++) {
    mags[i] = Math.hypot(corr[i * 3], corr[i * 3 + 1], corr[i * 3 + 2]);
  }
  return mags;
}

function summarizeMagnitudes(mags: Float64Array): FacePokeMagnitudeStats {
  const histogram: Record<string, number> = {};
  for (const label of HISTOGRAM_LABELS) histogram[label] = 0;
  let movedCount = 0;
  let maxCorr = 0;
  for (const m of mags) {
    if (m > MOVED_EPS) movedCount++;
    if (m > maxCorr) maxCorr = m;
    let bin: number = HISTOGRAM_EDGES.length; // open-ended last bin
    for (let b = 0; b < HISTOGRAM_EDGES.length; b++) {
      if (m < HISTOGRAM_EDGES[b]) { bin = b; break; }
    }
    histogram[HISTOGRAM_LABELS[bin]]++;
  }
  return { movedCount, maxCorr, histogram };
}

function verdictFor(
  expected: FacePokeMagnitudeStats & { facesWithContact: number },
  gpu: FacePokeMagnitudeStats,
  snapshotWrote: boolean,
): string {
  if (!snapshotWrote) {
    return (
      'SNAPSHOT STALE: post-dispatch snapshot buffer does not match the BEFORE positions — ' +
      'the snapshot kernel did not write. Suspect snapshot dispatch/codegen, not the correct kernel.'
    );
  }
  if (expected.movedCount === 0) {
    return (
      'INCONCLUSIVE: the CPU oracle expects ZERO contacts on the current positions — no body ' +
      'vertex pokes any cloth face right now. Re-run the probe mid-drape when the body shows through.'
    );
  }
  if (gpu.movedCount === 0) {
    return (
      `DIVERGENCE (corr≈0 confirmed): oracle expects ${expected.movedCount} particles moved ` +
      `(max ${expected.maxCorr.toExponential(2)} m over ${expected.facesWithContact} contacted faces), ` +
      'GPU moved 0. Inputs and snapshot are sound → suspect TSL codegen of the correct kernel ' +
      '(corr accumulation across nested Loop closures, or the push predicate never firing).'
    );
  }
  return (
    `KERNEL ALIVE: GPU moved ${gpu.movedCount} particles (max ${gpu.maxCorr.toExponential(2)} m) vs ` +
    `oracle ${expected.movedCount} (max ${expected.maxCorr.toExponential(2)} m). Compare histograms — ` +
    'if magnitudes agree, the no-tent symptom lies outside this pass (frame ordering / later passes undoing it).'
  );
}
