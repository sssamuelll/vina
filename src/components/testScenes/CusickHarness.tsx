/**
 * B2: gate Cusick virtual — HARNESS del tier GPU (la pata @gpu-local del plan
 * "dos gates, dos baselines", docs/plans/2026-07-02-drape-profesional-borrow-plan.md §B2/§6).
 *
 * DEV-only. Montado por App.tsx cuando `import.meta.env.DEV` y la URL trae
 * `?testScene=cusick` (param `fabric` elige el preset, default 'chiffon') —
 * REEMPLAZA la app entera: sin store, sin avatar, sin UI. Lo consume
 * tests/e2e/cusick-gate.spec.ts (@gpu-local, corre Samuel — CI no tiene GPU).
 *
 * Misma escena que el runner CPU (cusickGate.cpu.test.ts): disco de 30 cm
 * (seed 42) a y=0.855 sobre pedestal rígido de 18 cm (topY=0.85), 300 frames
 * = 5 s de sim, substeps 15, dt 1/60. La física es la del tier GPU REAL:
 * initMultiPieceTsl con el fabricCompliance de producción
 * (useSimulationLifecycle.ts:521-538) y el dispatch de GarmentSimulation.tsx
 * (~:493-587) espejado MINIMAL — incluye self-collision (always-on en GPU,
 * #897 F3) y strain-limit (#gummy STEP 4), que el runner CPU no tiene: por
 * eso este gate lleva SU PROPIO baseline. Excluidos: tether (el harness nunca
 * captura — B1), face-poke, brush/grab, wind (windForce=0 sería no-op).
 *
 * Al frame 300: readback GPU→CPU (readPositionsToCPU), DC + folds + minY con
 * cusickMetric, y publica `window.__VINA_CUSICK__` + una línea
 * `[cusick-gpu] ...` estructurada. Después del frame 300 el dispatch se
 * detiene (pose congelada) para que Samuel inspeccione el drape.
 */
import { useEffect, useRef, useState } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import * as THREE from 'three';
import { WebGPURenderer, MeshStandardNodeMaterial } from 'three/webgpu';
// Same type-only deep import as GarmentSimulation.tsx — the per-substep batch
// list is typed against the solver's node fields.
import type ComputeNode from 'three/src/nodes/gpgpu/ComputeNode.js';
import { GpuSolverClient } from '../../utils/cloth/gpu/gpuSolverClient';
import { buildCusickDiscMesh, buildCusickPedestal } from '../../utils/cloth/cusickScene';
import {
  extractOrderedBoundaryLoop,
  computeDrapeCoefficient,
  countFolds,
} from '../../utils/cloth/cusickMetric';
import { getPhysicalFabric, toXPBDParams } from '../../utils/cloth/physicalFabric';

// Constantes de escena — MISMOS valores que cusickGate.cpu.test.ts.
const PEDESTAL_TOP_Y = 0.85;
const DISC_Y = 0.855; // 5 mm de gap sobre la tapa
const PEDESTAL_HEIGHT = 0.4;
const SUPPORT_RADIUS = 0.09;
const SPECIMEN_RADIUS = 0.15;
const FRAMES = 300; // 5 s de tiempo de sim a dt 1/60
const SUBSTEPS = 15; // default de initMultiPieceTsl — explícito para el loop

export interface CusickGpuResult {
  done: boolean;
  fabric: string;
  dc: number;
  folds: number;
  minY: number;
  nanCount: number;
  frames: number;
  error?: string;
}

function publish(result: CusickGpuResult): void {
  (window as unknown as Record<string, unknown>).__VINA_CUSICK__ = result;
}

/**
 * Espejo de Viewport3D.createWebGPURenderer (mismo three/webgpu renderer,
 * mismo gate de render pre-init) con forceWebGL SIEMPRE false: el harness
 * mide el tier GPU — sin WebGPU no tiene sentido y el spec falla con error.
 */
function createHarnessRenderer(canvas: HTMLCanvasElement): WebGPURenderer {
  const renderer = new WebGPURenderer({
    canvas,
    antialias: true,
    alpha: true,
    forceWebGL: false,
  });
  let backendReady = false;
  const originalRender = renderer.render.bind(renderer);
  renderer.render = function (...args: Parameters<typeof originalRender>) {
    if (!backendReady) return; // silently skip until init resolves
    return originalRender(...args);
  } as typeof renderer.render;
  renderer.init().then(() => {
    backendReady = true;
  }).catch((err) => {
    console.warn('[CusickHarness] WebGPURenderer.init() failed:', err);
    backendReady = true;
  });
  return renderer;
}

function CusickScene({ fabricId }: { fabricId: string }) {
  // Escena determinista, construida una vez (seed 42 — mismo mesh que CI).
  const [scene] = useState(() => {
    const { mesh } = buildCusickDiscMesh({ y: DISC_Y, seed: 42 });
    const pedestal = buildCusickPedestal({ topY: PEDESTAL_TOP_Y });
    const loop = extractOrderedBoundaryLoop(new Uint32Array(mesh.triIds));
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(mesh.vertices.slice(), 3));
    if (mesh.uvs) geo.setAttribute('uv', new THREE.BufferAttribute(mesh.uvs, 2));
    geo.setIndex(Array.from(mesh.triIds));
    geo.computeVertexNormals();
    return { mesh, pedestal, loop, geo };
  });

  const clientRef = useRef<GpuSolverClient | null>(null);
  const frameCount = useRef(0);
  const readbackFired = useRef(false);
  const [material, setMaterial] = useState<InstanceType<typeof MeshStandardNodeMaterial> | null>(null);

  useEffect(() => {
    let cancelled = false;
    let client: GpuSolverClient | null = null;
    publish({ done: false, fabric: fabricId, dc: NaN, folds: 0, minY: NaN, nanCount: -1, frames: 0 });

    (async () => {
      try {
        const pf = getPhysicalFabric(fabricId);
        if (!pf) throw new Error(`cusick harness: fabric '${fabricId}' not in library`);
        const xpbd = toXPBDParams(pf);

        // Device propio como en useSimulationLifecycle (los kernels TSL corren
        // en el device del RENDERER; este es el señuelo de init — #901).
        if (!('gpu' in navigator)) throw new Error('WebGPU not available');
        const adapter = await navigator.gpu.requestAdapter();
        if (!adapter) throw new Error('No WebGPU adapter');
        const device = await adapter.requestDevice();
        if (cancelled) return;

        client = new GpuSolverClient(device);
        // fabricCompliance — espejo campo a campo de useSimulationLifecycle.ts:521-538
        // (stretch RIGID 0.0, shear 0.001, bend + density de la tela).
        await client.initMultiPieceTsl(
          [{ pieceId: 'cusick-disc', vertices: scene.mesh.vertices, triIds: scene.mesh.triIds, uvs: scene.mesh.uvs }],
          [], // sin seams
          { internalDamping: pf.internalDamping }, // substeps 15 / dt 1/60 / gravedad -9.81 = defaults del cliente
          {
            stretchComplianceWarp: 0.0,
            stretchComplianceWeft: 0.0,
            shearCompliance: 0.001,
            bendComplianceWarp: xpbd.bendComplianceWarp,
            bendComplianceWeft: xpbd.bendComplianceWeft,
            density: xpbd.density,
          },
        );
        if (cancelled) return;

        // Pedestal = ÚNICO body (sin avatar) — mismo camino que producción
        // (setCollisionMesh → BVH + pseudonormales) con frictionBody de la tela.
        client.setCollisionMesh(scene.pedestal, pf.frictionBody);

        const solver = client.getTslSolver();
        if (!solver) throw new Error('TSL solver missing after init');
        const mat = new MeshStandardNodeMaterial();
        // Mismos storage nodes que escriben los kernels (GarmentSimulation:806-811).
        mat.positionNode = solver.positionBufNode.toAttribute();
        mat.normalNode = solver.normalBufNode.toAttribute();
        mat.side = THREE.DoubleSide;
        mat.color.set('#e8e4df');
        setMaterial(mat);
        clientRef.current = client;
      } catch (e) {
        console.error('[CusickHarness] init failed:', e);
        publish({ done: true, fabric: fabricId, dc: NaN, folds: 0, minY: NaN, nanCount: -1, frames: 0, error: String(e) });
      }
    })();

    return () => {
      cancelled = true;
      clientRef.current = null;
      client?.dispose();
    };
  }, [fabricId, scene]);

  useFrame(({ gl }) => {
    const client = clientRef.current;
    const solver = client?.getTslSolver();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const renderer = gl as any;
    if (!client || !solver || !renderer.backend?.device) return;

    if (frameCount.current >= FRAMES) {
      if (!readbackFired.current) {
        readbackFired.current = true;
        void (async () => {
          try {
            const positions = await client.readPositionsToCPU(renderer);
            if (!positions) throw new Error('position readback returned null');
            let nanCount = 0;
            for (let i = 0; i < positions.length; i++) {
              if (!Number.isFinite(positions[i])) nanCount++;
            }
            const dc = computeDrapeCoefficient(positions, scene.loop, {
              supportRadius: SUPPORT_RADIUS,
              specimenRadius: SPECIMEN_RADIUS,
            });
            const folds = countFolds(positions, scene.loop);
            let minY = Infinity;
            for (let i = 0; i < scene.loop.length; i++) {
              minY = Math.min(minY, positions[scene.loop[i] * 3 + 1]);
            }
            // Baseline GPU — una línea estructurada por tela (espejo del CPU runner).
            console.log(
              `[cusick-gpu] fabric=${fabricId} DC=${dc.toFixed(1)} folds=${folds} ` +
              `minY=${minY.toFixed(3)} nan=${nanCount} frames=${FRAMES} substeps=${SUBSTEPS}`,
            );
            publish({ done: true, fabric: fabricId, dc, folds, minY, nanCount, frames: FRAMES });
          } catch (e) {
            console.error('[CusickHarness] readback/metric failed:', e);
            publish({ done: true, fabric: fabricId, dc: NaN, folds: 0, minY: NaN, nanCount: -1, frames: FRAMES, error: String(e) });
          }
        })();
      }
      return; // pose congelada post-gate — Samuel puede orbitar e inspeccionar
    }

    // Espejo MINIMAL del dispatch TSL de GarmentSimulation.tsx (~:493-587),
    // MISMO ORDEN de producción. Incluidos: self-collision (always-on GPU) y
    // strain-limit. Excluidos: wind (windForce=0 → no-op), seams (no hay),
    // tether (B1: el gate mide el drape que el tether congelaría), face-poke
    // (avatar-only: se construye solo para el body '__avatar__'), brush/grab.
    const substepNodes: ComputeNode[] = [solver.preSolve];
    substepNodes.push(...solver.stretchColors);
    substepNodes.push(...solver.bendColors);
    if (solver.selfCollisionNodes) {
      const sc = solver.selfCollisionNodes;
      substepNodes.push(sc.cellClearNode, sc.scatterNode, sc.resolveNode, sc.applyNode);
    }
      // strainLimit: fusionado dentro del stretch (2026-07-02) — implícito.
    substepNodes.push(solver.groundClamp);
    substepNodes.push(solver.snapshotPreCollision);
    for (const body of solver.collisionBodies) {
      substepNodes.push(body.findBestNode, body.applyPushNode);
    }
    substepNodes.push(solver.postSolve);

    for (let s = 0; s < SUBSTEPS; s++) {
      renderer.compute(substepNodes);
    }
    renderer.compute(solver.normalZero);
    renderer.compute(solver.normalAccum);
    renderer.compute(solver.normalNormalize);

    frameCount.current++;
  });

  return (
    <>
      {/* frustumCulled off: las posiciones viven en GPU y el bounding CPU queda stale */}
      <mesh geometry={scene.geo} material={material ?? undefined} frustumCulled={false} />
      <mesh position={[0, PEDESTAL_TOP_Y - PEDESTAL_HEIGHT / 2, 0]}>
        <cylinderGeometry args={[SUPPORT_RADIUS, SUPPORT_RADIUS, PEDESTAL_HEIGHT, 48]} />
        <meshStandardMaterial color="#555560" />
      </mesh>
    </>
  );
}

export default function CusickHarness({ fabricId }: { fabricId: string }) {
  return (
    <div style={{ width: '100vw', height: '100vh', background: '#0c0c14', position: 'relative' }}>
      <Canvas
        camera={{ position: [0.45, 1.15, 0.45], fov: 50 }}
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        gl={createHarnessRenderer as any}
      >
        <ambientLight intensity={0.7} />
        <directionalLight position={[2, 4, 3]} intensity={1.2} />
        <CusickScene fabricId={fabricId} />
        <OrbitControls target={[0, PEDESTAL_TOP_Y, 0]} />
      </Canvas>
      <div style={{
        position: 'absolute', top: 8, left: 8, color: '#7fd97f',
        fontFamily: 'monospace', fontSize: 12, pointerEvents: 'none',
      }}>
        cusick harness — {fabricId}
      </div>
    </div>
  );
}
