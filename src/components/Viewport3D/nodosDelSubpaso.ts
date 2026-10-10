import type ComputeNode from 'three/src/nodes/gpgpu/ComputeNode.js';
import type { TslSolver } from '../../utils/cloth/gpu/tslSolver';

/**
 * Repasos del estiramiento al final de cada subpaso, después de la colisión
 * (IA 1b-2, «Física primero», aprobado por Samuel el 10-10). El estiramiento
 * con su tope rígido del 2 % corre al principio del subpaso; costuras,
 * autocolisión, tirante y colisión lo vuelven a estirar después, y con 15
 * subpasos el residuo era grande: la camisa de María, holgada, quedaba con el
 * 17,9 % de sus aristas por encima del 8 %. Medido con la camisa cosida en
 * WebGPU (cuadros/s · aristas > 8 % · p95): sin repaso 25,1 · 17,9 % · 19,7 %;
 * 1 → 23,2 · 9,4 % · 12,0 %; 2 → 21,9 · 5,7 % · 8,7 %; 3 → 20,6 · 3,9 % · 7,0 %,
 * lo mismo que 30 subpasos (12,9 cuadros/s). Penetración 0 en todos.
 */
export const REPASOS_DE_ESTIRAMIENTO = 3;

/**
 * Los kernels de un subpaso del tier GPU, en orden. #897 F2 (H-Q2): UN
 * `renderer.compute(array)` por substep = un submit (antes ~12+). Las barreras
 * implícitas de WebGPU entre dispatches del mismo pass preservan el orden
 * secuencial exacto. La lista se construye UNA vez por frame: `grab` se lee
 * una vez y los cuerpos de colisión solo mutan entre frames.
 */
export function nodosDelSubpaso(
  solver: TslSolver,
  op: { tether: boolean; grab: boolean; facePoke: boolean },
): ComputeNode[] {
  const nodos: ComputeNode[] = [solver.preSolve];
  // Wind force (two-pass: accumulate per-triangle, apply per-particle)
  if (solver.windNodes) {
    nodos.push(solver.windNodes.accumNode, solver.windNodes.applyNode);
  }
  // Batch all stretch colors — graph coloring guarantees no two
  // constraints WITHIN a color share a vertex, so each color's parallel
  // dispatch is race-free; cross-color shared vertices are ordered by
  // the sequential dispatches inside the pass (same guarantee as the
  // seam batch below).
  nodos.push(...solver.stretchColors);
  // Bend colored like stretch (P4-1 determinism): one dispatch per color,
  // no two constraints in a color share a vertex → race-free.
  nodos.push(...solver.bendColors);
  // Seam colors batched like stretch (#897 F1.3): sequential dispatches
  // inside one compute pass — WebGPU guarantees storage writes from one
  // dispatch are visible to the next, so cross-color shared vertices
  // are race-free.
  nodos.push(...solver.seamColors);
  // Self-collision (#897 F3): los 4 pases bucket ANTES de groundClamp —
  // espejo del orden Rust (self corre DENTRO de la dinámica natural,
  // pre-snapshot), así su corrección SÍ entra en la velocidad (vNat),
  // igual que en WASM donde self corre dentro del step de Rust.
  // Siempre-on en el tier GPU (divergencia ratificada vs preset
  // 'normal'); este gate de dispatch es el kill-switch.
  if (solver.selfCollisionNodes) {
    const sc = solver.selfCollisionNodes;
    nodos.push(sc.cellClearNode, sc.scatterNode, sc.resolveNode, sc.applyNode);
  }
  // Strain limiting (#gummy STEP 4): FUSIONADO dentro del kernel de
  // stretch (consejo 2026-07-02 — mismos ids/colores, ~150 dispatches
  // menos/frame). El cap corre en el slot del stretch; ver
  // makeDistanceConstraintFn (tslSolver.ts) para la semántica de lag.
  // Body-tether (frente#2): max-distance cling that holds each vertex within
  // its per-region radius of a target. Targets = each vertex's own SETTLED
  // position, captured from the wrapped-on-body drape (see settle-trigger
  // after the substep dispatch), NOT at init — init positions are the pre-wrap
  // spread-out layout (~0.6 m mean from the body), which collapsed the garment
  // (belowHip 72%, root-caused 2026-06-25). Gated on tetherReady so the kernel
  // runs only once good settled targets exist; with those, the cloth starts at
  // dist≈0 < radius so the clamp is a gentle anti-drift/anti-slide that also
  // arrests the #902 long-horizon slide-off, not an over-constraint.
  if (op.tether && solver.tether) nodos.push(solver.tether);
  // Ground ANTES de la colisión de cuerpo (#897 F2.3) — espejo WASM:
  // en esa tier el ground corre DENTRO del step de Rust y la colisión
  // de triángulos JS corre después (wasmSolverWorker.ts:336,359). Así
  // el snapshot pre-colisión captura la posición post-ground y la
  // velocidad natural excluye solo el push del cuerpo.
  nodos.push(solver.groundClamp);
  // Mesh grab ANTES del snapshot: su desplazamiento SÍ debe entrar en
  // la velocidad (vNat = (preCol - prev) / sdt) → momentum natural al
  // soltar en vez de caída muerta.
  if (op.grab) nodos.push(solver.grabNodes.grabNode);
  // Snapshot pos → preCollisionPos (espejo de preCollisionBuf.set(
  // posView) en wasmSolverWorker.ts:352). Siempre se despacha: con 0
  // cuerpos, preCollisionPos == pos y postSolve degrada al
  // comportamiento previo exacto.
  nodos.push(solver.snapshotPreCollision);
  // 2-pass body collision (atomic-emulation pattern in tslCollision.ts):
  // findBest fills per-body atomic scratch; applyPush reads it,
  // pushes the particle, and resets the scratch for the next substep.
  for (const body of solver.collisionBodies) {
    nodos.push(body.findBestNode, body.applyPushNode);
  }
  // A4 face-poke Pass B (solve) — DENTRO del substep loop, tras el par de
  // colisión de cuerpo y antes de postSolve: corrección excluida de la
  // velocidad vía preCollisionPos + fricción Coulomb propia. CADA substep:
  // a substeps alternos la retención de manga cae (medido 6151 → 3945 —
  // el par push+grip por substep es protector). Gate = capability + dev
  // flag 'vina-facepoke-on'.
  if (op.facePoke && solver.facePokeNodes) nodos.push(solver.facePokeNodes.solve);
  // Repasos del estiramiento (con su tope) tras la colisión: lo que el
  // subpaso volvió a estirar se corrige antes del cierre (ver arriba). Como
  // el push del cuerpo, no entra en la velocidad: postSolve la deriva de
  // preCollisionPos.
  for (let r = 0; r < REPASOS_DE_ESTIRAMIENTO; r++) nodos.push(...solver.stretchColors);
  // postSolve deriva la velocidad de preCollisionPos (no de pos): el
  // push de colisión corrige posición sin crear velocidad, + respuesta
  // inelástica (#897 F2.3, espejo wasmSolverWorker.ts:367-399).
  nodos.push(solver.postSolve);
  return nodos;
}
