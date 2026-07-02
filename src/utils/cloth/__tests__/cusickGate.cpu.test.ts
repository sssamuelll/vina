/**
 * B2: gate Cusick virtual — RUNNER del tier CPU (la pata de CI del plan
 * "dos gates, dos baselines", docs/plans/2026-07-02-drape-profesional-borrow-plan.md §B2/§6).
 *
 * ISO 9073-9: disco de 30 cm (cusickScene) drapeado 5 s de tiempo de sim sobre
 * el pedestal rígido de 18 cm, con el solver CPU de producción (XPBDClothSolver).
 * Los números que loguea son el BASELINE pre-P1 (Fase 0 exit) con la física
 * actual (bend = distancia, no dihedral).
 *
 * Fidelidad al camino de producción:
 * - Colisión de cuerpo: `solver.setCollisionMesh(pedestal)` — el mismo camino
 *   que clothWorker.ts:353-358 ('setCollisionMesh'). Internamente envuelve el
 *   mesh como body { friction: 0.4 (M4-D), margin: clothThickness } y llama
 *   `solveTriangleCollision(pos, invMass, n, mesh, hash, margin, friction,
 *   prevPos)` POR SUBSTEP dentro de solve() (xpbdSolver.ts:1411-1422) —
 *   después de stretch/bend/seams, antes de selfCollision/LRA/ground.
 * - Pseudonormales: NO se construyen — el kernel CPU de producción
 *   (solveTriangleCollision) no acepta BodyPseudonormals; los args `pn` de
 *   pointToTriangleDist solo los ejercen penetrationMetric.ts y gpu/bvh.ts.
 *   Espejo exacto = sin pseudonormales.
 * - Tela: toXPBDParams aplicado con el MISMO mapping que el único consumidor
 *   de producción en camino de sim (fabricCompliance del tier GPU,
 *   useSimulationLifecycle.ts:506-527): stretch warp/weft RIGID 0.0, shear
 *   0.001, bend warp/weft de la tela, internalDamping de la tela. El tier CPU
 *   no tiene hoy consumidor propio de toXPBDParams (clothWorker 'setFabric'
 *   usa el mapping legacy de fabricLibrary) — se espeja el del GPU campo a
 *   campo sobre ClothSimConfig, que comparte los nombres.
 * - Config: substeps 15 exactos (adaptiveSubsteps OFF — el default de
 *   producción es adaptativo 10-30; el gate necesita cadencia fija), dt 1/60,
 *   gravedad -9.81. Sin seams, sin pins, sin tether.
 *
 * Determinismo: mesh sembrado (seed 42), sin Math.random/Date.now en el
 * camino de sim (performance.now solo para wall-clock del reporte).
 *
 * Los asserts son sanidad v1, NO bandas de calibración (esas llegan en la
 * recalibración J9).
 */
import { describe, it, expect } from 'vitest';
import { buildCusickDiscMesh, buildCusickPedestal } from '../cusickScene';
import {
  extractOrderedBoundaryLoop,
  computeDrapeCoefficient,
  countFolds,
} from '../cusickMetric';
import { XPBDClothSolver } from '../xpbdSolver';
import { getPhysicalFabric, toXPBDParams } from '../physicalFabric';

const PEDESTAL_TOP_Y = 0.85;
const DISC_Y = 0.855; // 5 mm de gap sobre la tapa
const SUPPORT_RADIUS = 0.09;
const SPECIMEN_RADIUS = 0.15;
const DT = 1 / 60;
const FRAMES = 300; // 5 s de tiempo de sim — ~35 s wall por tela, dentro de presupuesto
const HEM_FLOOR_Y = PEDESTAL_TOP_Y - 0.4; // el hem no puede caer bajo la base del pedestal

// Anclas Cusick: chiffon DC~30 (fluida) vs canvas DC~85 (rígida). La librería
// tiene 'chiffon' (45 g/m², bendingWarp 0.05) y 'canvas-12oz' (500 g/m²,
// bendingWarp 4.0 — el preset stiff más pesado; denim-12oz queda en 400 g/m²).
const FLUID_FABRIC = 'chiffon';
const STIFF_FABRIC = 'canvas-12oz';

const TEST_TIMEOUT = 240_000;

interface CusickResult {
  dc: number;
  folds: number;
  minY: number;
  wallMs: number;
  positions: Float32Array;
}

function runCusick(fabricId: string): CusickResult {
  const pf = getPhysicalFabric(fabricId);
  if (!pf) throw new Error(`cusick gate: fabric '${fabricId}' not in library`);
  const xpbd = toXPBDParams(pf);

  const { mesh } = buildCusickDiscMesh({ y: DISC_Y, seed: 42 });
  const pedestal = buildCusickPedestal({ topY: PEDESTAL_TOP_Y });

  const solver = new XPBDClothSolver(mesh, {
    numSubsteps: 15,
    adaptiveSubsteps: false,
    dt: DT,
    gravity: [0, -9.81, 0],
    // Espejo del fabricCompliance de producción (useSimulationLifecycle.ts:513-527).
    stretchComplianceWarp: 0.0,
    stretchComplianceWeft: 0.0,
    stretchComplianceShear: 0.001,
    bendComplianceWarp: xpbd.bendComplianceWarp,
    bendComplianceWeft: xpbd.bendComplianceWeft,
    internalDamping: pf.internalDamping,
  });

  // Camino de producción CPU (clothWorker 'setCollisionMesh'): friction 0.4 +
  // margin = clothThickness, solveTriangleCollision por substep con prevPos.
  solver.setCollisionMesh(pedestal);

  const t0 = performance.now();
  for (let f = 0; f < FRAMES; f++) solver.step();
  const wallMs = performance.now() - t0;

  const { positions } = solver.getSnapshot();
  const loop = extractOrderedBoundaryLoop(new Uint32Array(mesh.triIds));
  const dc = computeDrapeCoefficient(positions, loop, {
    supportRadius: SUPPORT_RADIUS,
    specimenRadius: SPECIMEN_RADIUS,
  });
  const folds = countFolds(positions, loop);
  let minY = Infinity;
  for (let i = 0; i < loop.length; i++) {
    minY = Math.min(minY, positions[loop[i] * 3 + 1]);
  }

  // Baseline pre-P1 (Fase 0 exit) — una línea estructurada por tela.
  console.log(
    `[cusick-baseline-cpu] fabric=${fabricId} DC=${dc.toFixed(1)} folds=${folds} ` +
    `minY=${minY.toFixed(3)} wall=${(wallMs / 1000).toFixed(1)}s ` +
    `frames=${FRAMES} substeps=15`,
  );

  return { dc, folds, minY, wallMs, positions };
}

// Cache: cada tela se simula UNA vez; el test de ordering reusa los resultados.
const cache = new Map<string, CusickResult>();
function getResult(fabricId: string): CusickResult {
  let r = cache.get(fabricId);
  if (!r) {
    r = runCusick(fabricId);
    cache.set(fabricId, r);
  }
  return r;
}

function expectSane(r: CusickResult): void {
  // Sin NaN en las posiciones finales.
  let allFinite = true;
  for (let i = 0; i < r.positions.length; i++) {
    if (!Number.isFinite(r.positions[i])) { allFinite = false; break; }
  }
  expect(allFinite, 'final positions contain NaN/Inf').toBe(true);

  // DC finito y en rango físicamente plausible.
  expect(Number.isFinite(r.dc), 'DC is not finite').toBe(true);
  expect(r.dc).toBeGreaterThan(-10);
  expect(r.dc).toBeLessThan(110);

  // El hem no cayó bajo la base del pedestal (la tela no "se derramó" entera).
  expect(r.minY).toBeGreaterThan(HEM_FLOOR_Y);
}

describe('Cusick virtual gate — CPU tier baseline (pre-P1)', () => {
  it(`${FLUID_FABRIC}: drape sano (sin NaN, DC en rango, hem sobre la base)`, () => {
    expectSane(getResult(FLUID_FABRIC));
  }, TEST_TIMEOUT);

  it(`${STIFF_FABRIC}: drape sano (sin NaN, DC en rango, hem sobre la base)`, () => {
    expectSane(getResult(STIFF_FABRIC));
  }, TEST_TIMEOUT);

  it(`ordering ISO: DC(${FLUID_FABRIC}) < DC(${STIFF_FABRIC})`, () => {
    // Si este assert FALLA con la física actual (bend = constraint de
    // DISTANCIA, no dihedral), NO borrarlo: ese resultado es en sí evidencia
    // del dead-fold physics que P1 corrige — marcar test.fails y reportarlo.
    //
    // Baseline pre-P1 (2026-07-02, determinista con seed 42): chiffon DC=21.2
    // vs canvas DC=21.5 — el ordering SE SOSTIENE pero por 0.3 DC (anclas
    // físicas: ~30 vs ~85). Esa separación casi nula ES el síntoma del bend
    // de distancia: P1 debería abrir la brecha, no solo preservar el signo.
    const fluid = getResult(FLUID_FABRIC);
    const stiff = getResult(STIFF_FABRIC);
    expect(fluid.dc).toBeLessThan(stiff.dc);
  }, TEST_TIMEOUT);
});
