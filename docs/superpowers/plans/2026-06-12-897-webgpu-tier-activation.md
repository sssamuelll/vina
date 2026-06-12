# Epic #897 — WebGPU Tier Activation Implementation Plan (v2, post-crítica)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** La camisa de María (~29k partículas) simula ≥30 fps en el tier WebGPU con costuras cerrando, colisión de avatar calibrada y self-collision activa, verificado en producción.

**Architecture:** Cuatro PRs secuenciales desde main: F0 (medición honesta + bump three), F1 (costuras GPU con paridad WASM, SIN flip de capability), F2 (paridad de colisión + un submit por substep), F3+F4 (self-collision con buckets de capacidad fija + flip de capabilities + replay María + prod). El flip de `seams` va en el ÚLTIMO PR para que ningún usuario opt-in pise un tier con colisión sin calibrar (BLOCKER-1 de la crítica).

**Tech Stack:** Three.js TSL/WebGPU (`renderer.compute`), Rust WASM como espejo behavioral, Playwright local con WebGPU real (CI usa SwiftShader — sin WebGPU).

**Crítica del roster aplicada (2026-06-12):** Serrano (12 hallazgos) y Halberg (2 breakpoints + 3 contradicciones runtime). Resoluciones integradas: flip al final (S1), tipo TSL-only (S2), NaN-guard de pos en postSolve (S3), baseline sin SwiftShader (S4), sentinel null (S6), selfCollision GPU always-on RATIFICADO con divergencia documentada (S7), conversión Int32Array en callsite (S8), calibración también en `updateCollisionMesh` (S9), condicionalidad de cadencia documentada (S10), prefix-sum serial eliminado por diseño de buckets K-fijos (H-BP1), guard `denom>0` también en stretch/bend (H-BP2), un submit por substep (H-Q2), handlers lost/uncapturedError en el device del RENDERER (H-RC1), bump three priorizado por leak de staging buffers en 0.183 (H-RC3).

---

## Contexto verificado (no re-derivar — citas a working tree de 2026-06-12, main @ `4e870af4`)

| Hecho | Dónde |
|---|---|
| Algoritmo de costura a espejar (decay 0.97/substep antes de resolver, snap a 0 bajo 1e-6, α=compliance/sdt², skip si w_sum==0) | `crates/xpbd-wasm/src/lib.rs:649-711`, `src/utils/cloth/seamAssembly.ts:740-790` |
| Seeding CPU/WASM: restLength = distancia actual × tension/100; compliance = base[type]/strength × (taped?0.1:1) | `seamAssembly.ts:684-718`, `DEFAULT_SEAM_CONFIG` en `seamAssembly.ts:152-161` |
| GPU hoy: target=0 fijo (`seamDist.push(0)`), compliance uniforme 0.0, sin coloring, sin decay | `gpuSolverClient.ts:362-386,404-413`, `tslSolver.ts:622-635` |
| `SeamInitData` YA lleva type/tension/strength/taped al callsite GPU; `seamInitDataToPairs` los descarta | `seamAssembly.ts:499-524`, `seamPairs.ts:163-186` |
| `colorConstraints(ids, rest, count, compliance?)` ya existe y reordena compliance | `gpuBuffers.ts:453-522` |
| `renderer.compute(array)` = UN pass, dispatches secuenciales, barreras implícitas WebGPU entre dispatches → batching seguro Y consolidable | `node_modules/three/src/renderers/common/Renderer.js:2539-2628`, `WebGPUBackend.js:1346-1483` (verificado por Halberg) |
| Cada constraint posee su slot de `seamTargetDist` en exclusiva → decay en-kernel es race-free; write-then-re-read intra-invocation es coherente (fresh element nodes) | `tslBuffers.ts:180-187` + veredicto Halberg Q1 |
| Cadencia WASM **con avatar**: 15 ticks de decay/frame (`step(sdt)`×15). **Sin avatar**: 1 tick/frame a sdt=1/60 — divergencia WASM preexistente; el target de paridad es la rama con avatar (María siempre lleva). En modo 'complete' ambos tiers van a 20 substeps vía el mismo `SIMULATION_MODES` sync | `wasmSolverWorker.ts:310-403,406`, `qualityPresets.ts:42,57`, `GarmentSimulation.tsx:351-371` |
| Gate de costuras: ÚNICO gate real de entrada GPU; flip = `GPU_CAPABILITIES.seams: true` | `useSimulationLifecycle.ts:381-388`, `solverCapabilities.ts:186-224` |
| Divergencias colisión GPU vs WASM (verificadas): avatar margin/friction 0.005/0.3 vs 0.008/0.4 (M4-D); damping efectivo 0.9315 vs 0.9603 (doble aplicación); velocity del push INCLUIDA vs excluida+inelástica; sin pre-pass inicial | `gpuSolverClient.ts:732-739,771-775,404-413`, `wasmSolverWorker.ts:351-402,675-678`, `tslSolver.ts:233-238,367` |
| `updateCollisionMesh` (hermano de setCollisionMesh) también rutea `'__avatar__'` con defaults 0.3/0.005 — sin caller vivo hoy, trampa latente | `gpuSolverClient.ts:744-752` |
| §9 candidato 7 (per-body vs global-closest) REFUTADO: CPU/WASM también son per-body secuencial | `wasmSolverWorker.ts:359-361`, `xpbdSolver.ts:1411-1422` |
| selfCollision TSL: 5 kernels completos pero `Fn()()` sin `compute()`, `scBuffers: null` hardcoded, bug real: `adjNeighborsSBA` sin datos copiados | `tslSelfCollision.ts:106-126` (bug :117-120), `tslBuffers.ts:218` |
| Prefix-sum TSL = 1 hilo × ~59k iteraciones × 15 substeps = 180–900ms/frame (aritmética Halberg) — INVIABLE; diseño de reemplazo: buckets de capacidad fija | `tslSelfCollision.ts:240-252` |
| CSR adjacency reutilizable: `buildAdjacency(triIds: Int32Array, ...)` (¡convertir Uint32→Int32 en callsite!) + `buildAdjacencyCSR` | `src/utils/cloth/selfCollision.ts:16-31`, `src/utils/cloth/wasm/adjacencyCSR.ts:37-60` |
| `frameTimeMs` roto: dispatch = delta de UN frame ÷30 → FPS ~30× inflado; en tier GPU TSL ni se mide (onFrame nunca dispara) | `useSimulationLifecycle.ts:319-333,443` |
| Orden de vértices `staticGeometry` == orden merge `initMultiPieceTsl` → readback 1:1, métricas válidas | `GarmentSimulation.tsx:214-285,292-326`, `gpuSolverClient.ts:275-301` |
| Readback periódico GPU→CPU cada 15 frames (3 con tool); en three 0.183 CADA readback filtra un staging buffer (~470KB) hasta GC — r184 #33300 lo arregla (reuso) | `GarmentSimulation.tsx:470-484`, `node_modules/three/.../WebGPUAttributeUtils.js:333-362` (verificado Halberg) |
| three r184: NO menciona fix de #554 (isAtomic); SÍ toca `AtomicFunctionNode` (#33120 compile 3×), `getArrayBufferAsync` (#33300/#33322), bounds-check compute (#33186) | release notes upstream |
| NaN latente HOY: `makeDistanceConstraintFn` sin guard `w0+w1+α>0`; freeze (invMass=0 pieza entera) + stretch compliance 0 warp/weft → 0/0; postSolve NO restaura pinned (`If(w>0)`) | `tslSolver.ts:272-340,365` vs `lib.rs:228` |
| El device.lost que vigila el lifecycle es un SEÑUELO: los kernels corren en el device del RENDERER (R3F); pérdida del device real = freeze silencioso sin cascada | `useSimulationLifecycle.ts:391-403` vs `Renderer.js:2541` (Halberg RC-1) |
| `playwright.config.ts` fuerza SwiftShader SIEMPRE (no solo CI) — args incondicionales | `playwright.config.ts:26-28` |
| Contract tests GPU: 10 behaviors (CLAUDE.md "9" stale); nuevos desde #11; convención `vi.hoisted` + `fakeDevice.ts` | `src/utils/cloth/gpu/__tests__/gpuSolverClient.test.ts` |
| Replay M4 de referencia (umbrales DoD): nan=0, belowHipPct<5 (y<0.8), minY>0.5, maxY>1.3, particleCount>25k, zeroConstraintSeams=[] | `tests/e2e/seam-parity-replay.spec.ts:687-772` |
| Fixture obligatorio: `tests/fixtures/garments/maria_patrones_samuel_2M.dxf` | memoria `feedback_test_with_maria_pattern` |

**Invariantes:**
1. Mundo 3D en METROS; `sewedThreshold` 1e-6 absoluto en metros.
2. Paridad GPU↔WASM es BEHAVIORAL, nunca bit-exact.
3. Gate completo manual antes de cada commit: `npx tsc -b --noEmit && npm run test && npm run lint`.
4. PRs desde main; ramas: `feat/897-f0-baseline`, `feat/897-f1-gpu-seams`, `feat/897-f2-gpu-body-collision`, `feat/897-f3-gpu-self-collision-and-flip`.
5. No MODIFICAR el path legacy WGSL (`gpuSolver.ts`, `shaders/*.wgsl`); leerlo como referencia sí. Los tipos compartidos con él tampoco se modifican — se crean tipos TSL-only.
6. `GPU_CAPABILITIES.seams` queda `false` hasta el PR final. Verificación local intermedia vía bypass dev-only `openclo-webgpu-seams-unsafe` (se elimina en el flip).

---

# PR 1 — F0: medición honesta + bump three (`feat/897-f0-baseline`)

### Task F0.1: Arreglar frameTimeMs (×30 inflado)

**Files:**
- Modify: `src/components/Viewport3D/useSimulationLifecycle.ts:319-333`
- Test: `src/components/Viewport3D/__tests__/useSimulationLifecycle.frameTime.test.tsx` (create)

- [ ] **Step 1: Failing test** (harness estilo seamInit: store real + `renderHook`; mock de `performance.now` **arrancando en 1000**, no en 0):

```tsx
it('dispatches the true 30-frame average, not the single-frame delta / 30', () => {
  const { onFrame, dispatched } = renderLifecycleHarness();
  const positions = new Float32Array(3);
  for (let i = 0; i <= 30; i++) {
    nowValue = 1000 + i * 100;   // 100ms entre frames → media real 100
    onFrame(positions);
  }
  const actions = dispatched.filter(a => a.type === 'simulation/setFrameTime');
  expect(actions.length).toBeGreaterThan(0);
  expect(actions.at(-1)!.payload).toBeCloseTo(100, 0); // hoy ~3.3
});
it('recordFrameTick is exposed and feeds the same accounting', () => {
  const { recordFrameTick, dispatched } = renderLifecycleHarness();
  for (let i = 0; i <= 30; i++) { nowValue = 1000 + i * 16.7; recordFrameTick(); }
  expect(dispatched.filter(a => a.type === 'simulation/setFrameTime').at(-1)!.payload).toBeCloseTo(16.7, 0);
});
```

- [ ] **Step 2: Run** — `npx vitest run src/components/Viewport3D/__tests__/useSimulationLifecycle.frameTime.test.tsx` → FAIL.

- [ ] **Step 3: Fix** — sentinel **null** (S6: un sentinel 0 colisiona con relojes mockeados y con `performance.now()` legítimamente 0 en el primer frame):

```ts
  const windowStartRef = useRef<number | null>(null);
  const frameCountRef = useRef(0);

  /**
   * Frame-time compartido por todos los tiers. Workers (WASM/CPU/Neural) vía
   * onFrame; el tier GPU TSL lo llama directo desde useFrame (F0.2) porque
   * ahí onFrame nunca dispara (frameDriven). Media real de ventana de 30.
   */
  const recordFrameTick = useCallback(() => {
    const now = performance.now();
    if (windowStartRef.current === null) {
      windowStartRef.current = now;
      return;
    }
    frameCountRef.current++;
    if (frameCountRef.current % 30 === 0) {
      const avgMs = (now - windowStartRef.current) / 30;
      dispatch(setFrameTime(Math.round(avgMs * 10) / 10));
      windowStartRef.current = now;
    }
  }, [dispatch]);

  const onFrame = useCallback((positions: Float32Array) => {
    positionsRef.current = positions;
    recordFrameTick();
  }, [recordFrameTick]);
```

Reset en la rama 'idle' (donde hoy `setFrameTime(0)`): `windowStartRef.current = null; frameCountRef.current = 0;`. Exportar `recordFrameTick` en el objeto retornado.

- [ ] **Step 4: Run** → PASS. **Step 5: Gate + commit** `fix(sim): frameTimeMs media real de 30 frames — el FPS mostrado iba ~30x inflado (#897 F0)`.

### Task F0.2: Probe de FPS en tier GPU TSL

- [ ] **Step 1:** En `GarmentSimulation.tsx`, destructurar `recordFrameTick` del hook; en la rama TSL del `useFrame`, tras los dispatches de normales (~:468):

```ts
      // F0 (#897): en TSL la cadencia de render == cadencia de sim.
      recordFrameTick();
```

Colocarlo en el mismo punto del flujo donde corre el compute — si se descubre que el compute corre también en 'paused' (preexistente), NO arreglarlo aquí: anotar follow-up (F4.4).
- [ ] **Step 2:** Gate + commit `feat(sim): FPS en tier WebGPU TSL via recordFrameTick (#897 F0)`.

### Task F0.3: Config WebGPU local + spec de baseline (SIN SwiftShader)

**Files:**
- Create: `playwright.webgpu.config.ts`
- Create: `tests/e2e/perf-baseline.spec.ts`
- Modify: `package.json` (scripts)

(S4: el config base fuerza SwiftShader SIEMPRE — el baseline debe correr bajo config propia con GPU real para ser conmensurable con F4.)

- [ ] **Step 1: Config**

```ts
import { defineConfig } from '@playwright/test';
import base from './playwright.config';

/**
 * WebGPU/GPU real: headed, SIN los args SwiftShader del config base.
 * Local-only (CI no tiene GPU). Lo usan el baseline de perf (F0) y los
 * replays @webgpu (F4) — mismos flags ⇒ números conmensurables.
 */
export default defineConfig({
  ...base,
  grep: /@gpu-local/,
  workers: 1,
  use: {
    ...base.use,
    headless: false,
    launchOptions: { args: ['--enable-unsafe-webgpu'] },
  },
});
```

Scripts: `"test:e2e:gpu": "playwright test --config playwright.webgpu.config.ts"`.

- [ ] **Step 2: Spec** `perf-baseline.spec.ts`, título con tag `@gpu-local`, gated por `process.env.OPENCLO_PERF === '1'`:

```ts
/**
 * F0 (#897): baseline de perf con el patrón real de María, GPU real (config
 * webgpu, sin SwiftShader). No asserta umbrales — imprime el baseline.
 * Correr: OPENCLO_PERF=1 npm run test:e2e:gpu -- perf-baseline
 */
import { test, expect } from '@playwright/test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { switchView, startSimulation } from './helpers/sim';

const RUN = process.env.OPENCLO_PERF === '1';
const FIXTURE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../fixtures/garments/maria_patrones_samuel_2M.dxf');

test.describe('perf baseline @gpu-local — camisa de María', () => {
  test.skip(!RUN, 'OPENCLO_PERF=1 para correr el baseline');
  test('mide FPS de solver y de render en el tier por defecto', async ({ page }) => {
    test.setTimeout(240_000);
    await page.goto('/');
    await page.waitForFunction(() => Boolean((window as any).__OPENCLO_STORE__), { timeout: 15_000 });
    await page.locator('input[accept=".dxf"]').setInputFiles(FIXTURE);
    await page.waitForFunction(() => (window as any).__OPENCLO_STORE__.getState().project.pieces.length === 5, { timeout: 30_000 });
    await page.keyboard.press('Control+k');
    await page.getByText('Auto-Sew Pieces').click();
    await page.waitForFunction(() => (window as any).__OPENCLO_STORE__.getState().project.seams.length >= 6, { timeout: 15_000 });
    await switchView(page, '3D');
    await startSimulation(page);
    await page.waitForFunction(() => (window as any).__OPENCLO_STORE__.getState().simulation.solverTier !== 'none', { timeout: 30_000 });
    const tier = await page.evaluate(() => (window as any).__OPENCLO_STORE__.getState().simulation.solverTier);

    await page.waitForTimeout(10_000);
    const solverSamples: number[] = [];
    for (let i = 0; i < 20; i++) {
      await page.waitForTimeout(500);
      solverSamples.push(await page.evaluate(() => (window as any).__OPENCLO_STORE__.getState().simulation.frameTimeMs));
    }
    const renderFps = await page.evaluate(() => new Promise<number>((resolve) => {
      let frames = 0; const t0 = performance.now();
      const tick = () => { frames++; performance.now() - t0 < 5000 ? requestAnimationFrame(tick) : resolve(frames / 5); };
      requestAnimationFrame(tick);
    }));
    const particleCount = await page.evaluate(() => (window as any).__OPENCLO_STORE__.getState().simulation.particleCount);
    const med = (a: number[]) => [...a].sort((x, y) => x - y)[Math.floor(a.length / 2)];
    console.log(`[perf-baseline] tier=${tier} particles=${particleCount} solverFrameMs(median)=${med(solverSamples)} solverFps=${(1000 / med(solverSamples)).toFixed(1)} renderFps=${renderFps.toFixed(1)}`);
    expect(solverSamples.some(s => s > 0) || tier === 'webgpu').toBe(true);
  });
});
```

- [ ] **Step 3: Run** `OPENCLO_PERF=1 npm run test:e2e:gpu -- perf-baseline` → anotar números → `gh issue comment 897`.
- [ ] **Step 4: Gate + commit** `test(perf): baseline María en GPU real, config webgpu local-only (#897 F0)`.

### Task F0.4: Bump three 0.183.2 → 0.184 (PRIORIZADO — el readback de 0.183 filtra staging buffers)

(H-RC3: en 0.183.2 cada `getArrayBufferAsync` crea un staging GPUBuffer que nunca se destruye — ~470KB/readback, ~9.4MB/s con tool activa. r184 #33300 reusa buffers. El bump deja de ser "higiene": es la única vía sin workaround propio.)

- [ ] **Step 1:** `npm install three@0.184 @types/three@0.184`. Si `@types/three@0.184` no existe: intentar runtime-only (`three@0.184` + types 0.183.1) y validar `npx tsc -b`; si tampoco compila, revert + issue documentando el LEAK como motivación pendiente (no silencioso).
- [ ] **Step 2:** Gates estáticos. Arreglos triviales OK (paths de tipos, casts muertos del typo `setAtmoic`); roturas mayores → revert + issue.
- [ ] **Step 3:** Smoke en navegador real (unit tests mockean TSL — no validan el bump): dev server + opt-in + pieza simple en GPU; consola sin `[#554 workaround]` ni errores de pipeline; re-correr baseline F0.3 y comparar (regresión >20% → revert).
- [ ] **Step 4:** Commit `chore(deps): three 0.183.2 -> 0.184 — fix del leak de staging buffers en readback (#33300) + TSL compile 3x (#897 F0)`.

### Task F0.5: PR

`gh pr create` con números de baseline + evidencia del bump.

---

# PR 2 — F1: costuras GPU cierran, SIN flip (`feat/897-f1-gpu-seams`)

Espejo behavioral de `lib.rs:649-711`. El flip de capability va en el PR final (S1); este PR deja todo listo y verificable vía bypass dev-only.

**Alternativa rechazada** (documentar en el PR): GPU consumiendo `SeamConstraintSet` de `buildSeamConstraints` — requeriría merged mesh + outlines + pieceEdges en el client GPU; `seamPairs.ts` es la superficie GPU ratificada (Fase 4) y espeja la resolución exactamente.

### Task F1.1: `SeamPair` lleva compliance y tensión

**Files:** `src/utils/cloth/seamPairs.ts`, `src/utils/cloth/__tests__/seamPairs.test.ts`

- [ ] **Step 1: Failing tests**

```ts
it('computes per-seam compliance and tension factor mirroring buildSeamConstraints', () => {
  const seams = [makeSeamInitData({ type: 'french', strength: 0.5, taped: true, tension: 80 })];
  const pairs = seamInitDataToPairs(seams, pieces);
  expect(pairs[0].compliance).toBeCloseTo(0.000002, 9); // 0.00001/0.5×0.1
  expect(pairs[0].tensionFactor).toBeCloseTo(0.8, 6);
});
it('defaults: standard, strength 1, no tape, tension 100', () => {
  const pairs = seamInitDataToPairs([makeSeamInitData({})], pieces);
  expect(pairs[0].compliance).toBeCloseTo(0.0001, 9);
  expect(pairs[0].tensionFactor).toBe(1);
});
```

- [ ] **Step 2: Run** → FAIL. **Step 3: Implement** — añadir `DEFAULT_SEAM_CONFIG` al import de `./seamAssembly`; interface:

```ts
export interface SeamPair {
  pieceAId: string;
  pieceBId: string;
  vertexPairs: Array<[LocalVertexIndex, LocalVertexIndex]>;
  /** Compliance XPBD per-seam: base[type] / strength × (taped ? 0.1 : 1) — espejo de buildSeamConstraints. */
  compliance: number;
  /** tension/100 — escala el target inicial (1 = distancia actual). */
  tensionFactor: number;
}
```

En el loop de `seamInitDataToPairs` tras `resolved.failure`:

```ts
    const baseCompliance = DEFAULT_SEAM_CONFIG.compliance[seam.type ?? 'standard'];
    pairs.push({
      pieceAId: seam.pieceAId,
      pieceBId: seam.pieceBId,
      vertexPairs: resolved.vertexPairs,
      compliance: (baseCompliance / (seam.strength ?? 1.0)) * (seam.taped ? 0.1 : 1.0),
      tensionFactor: (seam.tension ?? 100) / 100,
    });
```

(Comprobar opcionalidad real de `type` en `SeamInitData` y ajustar el `??`.)
- [ ] **Step 4-5:** PASS + gate + commit `feat(seams): SeamPair lleva compliance y tension per-seam hacia GPU (#897 F1)`.

### Task F1.2: Packing GPU — seeding real + coloring, tipo TSL-only (behavior #11)

**Files:**
- Modify: `src/utils/cloth/gpu/tslBuffers.ts` (NUEVO tipo `TslSeamConstraintData` — `SeamConstraintData` legacy NO se toca, S2)
- Modify: `src/utils/cloth/gpu/gpuSolverClient.ts:362-386`
- Test: behavior #11 en `gpuSolverClient.test.ts`

- [ ] **Step 1: Failing tests** (convención `vi.hoisted` + `makeQuadPiece`):

```ts
describe('initMultiPieceTsl seam closure packing (behavior #11 — #897 F1)', () => {
  it('seeds targetDist = world distance × tensionFactor and per-constraint compliance, colored', async () => {
    // piezas con distancia conocida 0.3 entre locales A0↔B0
    const seamPairs = [{ pieceAId: 'A', pieceBId: 'B', vertexPairs: [[0, 0]] as any, compliance: 0.0001, tensionFactor: 0.5 }];
    await client.initMultiPieceTsl([pieceA, pieceB], seamPairs);
    const g = (client as any).tslBuffers.seamColors[0];
    expect(g.targetDistSBA.array[0]).toBeCloseTo(0.15, 6); // hoy: 0
    expect(g.complianceSBA.array[0]).toBeCloseTo(0.0001, 9);
  });
  it('splits shared-vertex pairs into separate color groups', async () => {
    const seamPairs = [{ pieceAId: 'A', pieceBId: 'B', vertexPairs: [[0, 0], [1, 0]] as any, compliance: 0.0001, tensionFactor: 1 }];
    // → 2 grupos de count 1 (comparten B0)
  });
});
```

- [ ] **Step 2: Run** → FAIL. **Step 3: Implement**

`tslBuffers.ts` — tipo nuevo (NO tocar `SeamConstraintData` de gpuBuffers, lo consume el legacy WGSL):

```ts
/** Seam constraints del path TSL (#897 F1) — coloreadas, con compliance.
 *  Distinto de SeamConstraintData (legacy WGSL, intocable per plan inv. 5). */
export interface TslSeamConstraintData {
  ids: Uint32Array;                 // GLOBAL, reordenados por color
  targetDist: Float32Array;         // seed = distancia mundial × tension (decae en GPU)
  compliance: Float32Array;         // per-constraint
  colorRanges: Array<{ offset: number; count: number }>;
}
```

`gpuSolverClient.ts` — packing nuevo (el warn de pieza desconocida se conserva igual):

```ts
    let seam: TslSeamConstraintData | null = null;
    if (seamPairs && seamPairs.length > 0) {
      const seamIds: number[] = [];
      const seamDist: number[] = [];
      const seamCompliance: number[] = [];
      for (const sp of seamPairs) {
        const offA = vertexOffsets.get(sp.pieceAId);
        const offB = vertexOffsets.get(sp.pieceBId);
        if (offA === undefined || offB === undefined) { console.warn(/* igual */); continue; }
        for (const [a, b] of sp.vertexPairs) {
          const ga = a + offA, gb = b + offB;
          const dx = mergedPositions[ga * 3] - mergedPositions[gb * 3];
          const dy = mergedPositions[ga * 3 + 1] - mergedPositions[gb * 3 + 1];
          const dz = mergedPositions[ga * 3 + 2] - mergedPositions[gb * 3 + 2];
          seamIds.push(ga, gb);
          seamDist.push(Math.sqrt(dx * dx + dy * dy + dz * dz) * sp.tensionFactor);
          seamCompliance.push(sp.compliance);
        }
      }
      if (seamIds.length > 0) {
        const colored = colorConstraints(new Uint32Array(seamIds), new Float32Array(seamDist), seamIds.length / 2, new Float32Array(seamCompliance));
        seam = { ids: colored.ids, targetDist: colored.restLengths, compliance: colored.compliance!, colorRanges: colored.colorRanges };
      }
    }
```

(`mergedPositions` = el Float32Array merged que `initMultiPieceTsl` ya construye; usar el nombre real de la variable.)
- [ ] **Step 4-5:** PASS + gate + commit `feat(gpu): packing de costuras TSL — seeding real + compliance + coloring, tipo TSL-only (#897 F1, behavior #11)`.

### Task F1.3: `seamColors` en TslBufferSet

**Files:** `src/utils/cloth/gpu/tslBuffers.ts` + sus tests

- [ ] **Step 1: Failing test** — `createTslBuffers` con `TslSeamConstraintData` de 2 colores produce `seamColors` con slices por rango; behavior #10 reescrito contra `seamColors` (vacío `[]` sin pairs; mantiene LOCAL→GLOBAL y loud-skip).
- [ ] **Step 2: Implement**

```ts
export interface SeamColorGroup {
  idsSBA: StorageBufferAttribute;        // pares GLOBALES de este color
  targetDistSBA: StorageBufferAttribute; // el kernel lo DECAE in-place por substep
  complianceSBA: StorageBufferAttribute;
  count: number;
}
```

En `TslBufferSet`: `seamColors: SeamColorGroup[]` reemplaza `seamIdsSBA`/`seamTargetDistSBA` (mantener `numSeamConstraints`). Factory: mismo patrón de slicing que `stretchColors` (:131-153). `destroyTslBufferSet`: loop sobre `seamColors` (3 SBAs/grupo), quitar las 2 viejas.
- [ ] **Step 3:** Gate + commit `feat(gpu): seamColors por color en TslBufferSet con disposal (#897 F1)`.

### Task F1.4: Kernel de costura con decay + guards (y guard en stretch/bend — H-BP2)

**Files:** `src/utils/cloth/gpu/tslSolver.ts` + tests

- [ ] **Step 1: Failing tests** — `createTslSolver` retorna `seamColors: ComputeNode[]` (longitud = nº colores, dispatchCount por grupo); uniforms `seamShrinkFactor`/`seamSewedThreshold` con defaults 0.97/1e-6; `seamStiffness` eliminado del config TSL.
- [ ] **Step 2: Implement**

`TslSolverConfig`: − `seamStiffness`, + `seamShrinkFactor: number`, + `seamSewedThreshold: number`. `createUniforms` correspondiente; `updateConfig` pierde la rama seamStiffness (shrink/threshold init-only, como WASM).

**Guard H-BP2 en el factory compartido** — en `makeDistanceConstraintFn` (tslSolver.ts:272-340), envolver la corrección:

```ts
      const denom = w0.add(w1).add(alpha);
      // Guard 0/0 (espejo de Rust `if w_sum == 0 continue` + CPU): pieza
      // congelada (invMass=0 en ambos extremos) + compliance 0 (warp/weft
      // default) producía NaN permanente — postSolve no restaura pinned.
      If(denom.greaterThan(float(0.0)), () => {
        const s = C.negate().div(denom);
        const n = delta.div(len);
        posBuf.element(id0).addAssign(n.mul(s).mul(w0).negate());
        posBuf.element(id1).addAssign(n.mul(s).mul(w1));
      });
```

Kernel de costura nuevo:

```ts
/**
 * Seam kernel — espejo behavioral de Rust `solve_seams` (lib.rs:649-711):
 * decay del target ANTES de resolver (×shrink/substep, snap a 0 bajo
 * threshold), luego proyección XPBD con compliance per-constraint.
 * Race-free: (a) dentro de un color no se comparten vértices; (b) cada
 * constraint posee su slot de target en exclusiva; (c) cada constraint vive
 * en exactamente un color → decay tickea una vez por substep. La cadencia de
 * decay por frame es 0.97^substeps — igual que WASM en la rama con avatar
 * (la de producción); la rama WASM sin avatar (1 tick/frame) es una
 * divergencia preexistente de WASM, no el target de paridad. El write-then-
 * re-read de targetBuf dentro de la invocación es coherente (program order
 * + element nodes frescos emiten load tras el store).
 */
function makeSeamConstraintFn(
  posBuf: TslNode, invMassBuf: TslNode, idsBuf: TslNode,
  targetBuf: TslNode, complianceBuf: TslNode,
  sdt: FloatUniform, shrink: FloatUniform, threshold: FloatUniform,
) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (Fn as any)(() => {
    const ci = instanceIndex;
    const tgt = targetBuf.element(ci);
    If(tgt.greaterThan(threshold), () => {
      const shrunk = tgt.mul(shrink);
      If(shrunk.lessThan(threshold), () => {
        targetBuf.element(ci).assign(float(0.0));
      }).Else(() => {
        targetBuf.element(ci).assign(shrunk);
      });
    });

    const id0 = idsBuf.element(uint(ci).mul(uint(2)));
    const id1 = idsBuf.element(uint(ci).mul(uint(2)).add(uint(1)));
    const w0 = invMassBuf.element(id0);
    const w1 = invMassBuf.element(id1);
    const delta = posBuf.element(id1).sub(posBuf.element(id0));
    const len = delta.dot(delta).sqrt();

    If(len.greaterThan(float(1e-7)), () => {
      const restLen = targetBuf.element(ci); // re-leído post-decay
      const C = len.sub(restLen);
      const alpha = complianceBuf.element(ci).div(sdt.mul(sdt));
      const denom = w0.add(w1).add(alpha);
      If(denom.greaterThan(float(0.0)), () => {
        const s = C.negate().div(denom);
        const n = delta.div(len);
        posBuf.element(id0).addAssign(n.mul(s).mul(w0).negate());
        posBuf.element(id1).addAssign(n.mul(s).mul(w1));
      });
    });
  })();
}
```

Instanciación: por cada `buffers.seamColors[k]` → `storage()` ids (uint, count×2) / target (float, count) / compliance (float, count) → `compute(fn, count, [64])`. Interface `TslSolver`: `seamColors: ComputeNode[]` reemplaza `seam`.
- [ ] **Step 3:** Gate (`tsc -b` caza consumidores de `solver.seam`) + commit `feat(gpu): kernel de costura con decay en-kernel + compliance per-constraint; guard denom>0 tambien en stretch/bend (#897 F1)`.

### Task F1.5: Dispatch + config + bypass dev (SIN flip)

**Files:** `GarmentSimulation.tsx`, `gpuSolverClient.ts`, `useSimulationLifecycle.ts`, test seamInit

- [ ] **Step 1: Dispatch** — reemplazar `if (solver.seam) ...` por:

```ts
        if (solver.seamColors.length > 0) renderer.compute(solver.seamColors);
```

- [ ] **Step 2: defaultConfig** — quitar `seamStiffness: 0.0`; añadir `seamShrinkFactor: DEFAULT_SEAM_CONFIG.shrinkFactor, seamSewedThreshold: DEFAULT_SEAM_CONFIG.sewedThreshold` (import de `../seamAssembly`).
- [ ] **Step 3: Bypass dev-only** (S1) en `useSimulationLifecycle.ts`:

```ts
/** DEV-ONLY (#897): permite probar costuras GPU antes del flip de capability.
 *  Se ELIMINA en el PR del flip. No documentado a usuarios. */
function isWebGpuSeamsUnsafeOptIn(): boolean {
  return safeGetItem('openclo-webgpu-seams-unsafe') === 'true';
}
// gate:
if (wantsWebGPU && projectHasSeams && !GPU_CAPABILITIES.seams && !isWebGpuSeamsUnsafeOptIn()) {
```

- [ ] **Step 4: Tests del gate** — el caso existente "opt-in + seams → toast + WASM" SIGUE VÁLIDO (capability sigue false) — no se invierte. Añadir caso bypass: con `localStorage['openclo-webgpu-seams-unsafe']='true'`, el warning toast del gate NO se dispatcha (señal falsable: el toast solo nace en ese gate; en jsdom el intento GPU cae a WASM por navigator.gpu ausente, igual que el control :265-280).
- [ ] **Step 5:** Gate completo + commit `feat(gpu): dispatch coloreado de costuras + bypass dev openclo-webgpu-seams-unsafe — flip pendiente al PR final (#897 F1)`.

### Task F1.6: Verificación local + PR

- [ ] Dev server + navegador real: AMBAS keys localStorage (`openclo-use-webgpu` + `openclo-webgpu-seams-unsafe`), María, Auto-Sew, Simulate. Criterio de aceptación CON colisión aún sin calibrar (S1): las costuras CIERRAN (los bordes emparejados convergen a contacto en ~2s, visible) y no hay NaN — el drape global (altura, hundimiento) NO es criterio de F1, es F2.
- [ ] `npm run test:e2e` local — replays WASM sin regresión (default intacto).
- [ ] Push + PR (sin tocar CLAUDE.md de counts — el PR final consolida, S11).

---

# PR 3 — F2: bodyCollision calibración + 1 submit/substep (`feat/897-f2-gpu-body-collision`)

### Task F2.1: Calibración M4-D en AMBAS rutas de avatar

**Files:** `gpuSolverClient.ts:732-752` + contract tests (behavior #12)

- [ ] **Step 1: Failing tests** — `setCollisionMesh` Y `updateCollisionMesh` (S9) rutean `'__avatar__'` con `friction 0.4, margin 0.008`.
- [ ] **Step 2: Implement** — constantes de módulo compartidas:

```ts
/** Calibración M4-D del avatar (espejo wasmSolverWorker.ts:675-678):
 *  0.4 ≈ algodón sobre piel; 8mm anti z-fight. GPU no la había recibido. */
const AVATAR_FRICTION = 0.4;
const AVATAR_MARGIN = 0.008;
```

usadas en ambos métodos: `this.setTslCollisionBody('__avatar__', mesh, AVATAR_FRICTION, AVATAR_MARGIN)`.
- [ ] **Step 3:** Gate + commit `fix(gpu): calibracion M4-D del avatar en las dos rutas (friction 0.4, margin 8mm) (#897 F2)`.

### Task F2.2: Damping — eliminar la doble aplicación

- [ ] `defaultConfig.damping: 0.9603` → `0.99` con comentario (0.99 × 0.97 interno = 0.9603 efectivo = paridad WASM; el valor viejo daba 0.9315 → momentum ×0.34/frame vs ×0.54). Pin en test. Gate + commit.

### Task F2.3: Exclusión del push en velocidad + respuesta inelástica + NaN de pos

**Files:** `tslBuffers.ts` (+`preCollisionPosSBA` N vec3 + disposal), `tslSolver.ts`, `GarmentSimulation.tsx`, tests

- [ ] **Step 1: Failing tests** — `snapshotPreCollision: ComputeNode` (dispatch N) expuesto; postSolve factory recibe el buffer nuevo.
- [ ] **Step 2: Snapshot kernel**

```ts
/** pos → preCollisionPos. Tras grab, antes de colisión de cuerpo (espejo de
 *  preCollisionBuf.set(posView) en wasmSolverWorker). Siempre se despacha:
 *  con 0 cuerpos preCollisionPos==pos ⇒ postSolve degrada al comportamiento
 *  actual exacto. */
function makeSnapshotPreCollisionFn(posBuf: TslNode, preColBuf: TslNode) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (Fn as any)(() => {
    preColBuf.element(instanceIndex).assign(posBuf.element(instanceIndex));
  })();
}
```

- [ ] **Step 3: postSolve nuevo** — derivación con exclusión + **doble NaN-check (S3: el guard actual solo ve `v`; con vNat del snapshot, un NaN inyectado por los kernels de colisión pasaría invisible y `pos` queda envenenado para siempre — WASM cubre esa ventana con `guardNaN(posView)` post-colisión)**:

```ts
    If(w.greaterThan(float(0.0)), () => {
      // Velocidad NATURAL pre-colisión (espejo wasmSolverWorker.ts:367-375):
      // el push corrige posición pero NO crea velocidad (a 900Hz, 5cm → 45m/s).
      const vNat = preColBuf.element(i).sub(prevPosBuf.element(i)).div(uniforms.sdt).toVar('vNat');

      // Inelástica (espejo :377-399): si hubo push, anular la componente de
      // vNat que apunta HACIA la superficie.
      const push = posBuf.element(i).sub(preColBuf.element(i));
      const pushLen2 = push.dot(push);
      If(pushLen2.greaterThan(float(1e-20)), () => {
        const n = push.div(pushLen2.sqrt());
        const vn = vNat.dot(n);
        If(vn.lessThan(float(0.0)), () => { vNat.subAssign(n.mul(vn)); });
      });

      const v = vNat;
      const speed2 = v.dot(v);
      // NaN-check de pos ADEMÁS del de v (S3): pos puede ser NaN con vNat
      // finita (NaN nacido en los kernels de colisión, post-snapshot).
      const posLen2 = posBuf.element(i).dot(posBuf.element(i));
      If(speed2.equal(speed2).and(posLen2.equal(posLen2)), () => {
        /* ...resto EXACTAMENTE igual (ground friction, clamp 5 m/s)... */
      }).Else(() => {
        velBuf.element(i).assign(vec3(0, 0, 0));
        posBuf.element(i).assign(prevPosBuf.element(i));
      });
    });
```

- [ ] **Step 4: Reorden del substep** (espejo WASM: ground dentro del step, colisión después; grab ANTES del snapshot para conservar momentum):

```
preSolve → wind → stretchColors → bend → seamColors → groundClamp → grab → snapshot → bodyCollision(findBest+applyPush por cuerpo) → postSolve
```

- [ ] **Step 5:** Gate + commit `fix(gpu): el push de colision no crea velocidad — snapshot + inelastica + NaN-check de pos, espejo WASM (#897 F2)`.

### Task F2.4: NaN guard + clamp i32 en findBest (§9 cand. 5-6)

- [ ] En ambos casts de `tslCollision.ts` (:296-303 inside-projection, :340-349 edge):

```ts
        // §9 c.5+6: NaN.toI32 es UB en WGSL; >2.147m desborda i32 a escala 1e6.
        const distClamped = distFloat.min(float(2.0));
        const distI32 = select(int(INT32_MAX), int(distClamped.mul(uDistScale)), distFloat.equal(distFloat));
```

(import `select` de `three/tsl`; si no existe en esta versión, patrón `If/Else` + `.toVar()`.) Test string/estructural pin. Gate + commit.

### Task F2.5: Un submit por substep (H-Q2)

(Tras F1+F2+F3 el loop haría ~258 `renderer.compute()`/frame = ~258 `queue.submit()` IPC = 5-15ms de CPU puro. La consolidación a un array por substep usa exactamente la misma garantía de barreras que ya usa `stretchColors`.)

**Files:** `GarmentSimulation.tsx` (substep loop)

- [ ] **Step 1: Implement** — construir la lista una vez por frame y despachar una vez por substep:

```ts
      // #897 F2: UN renderer.compute(array) por substep = un submit (antes
      // ~17). Las barreras implícitas entre dispatches del mismo pass
      // preservan el orden exacto de la secuencia previa.
      const substepNodes: ComputeNode[] = [solver.preSolve];
      if (solver.windNodes) substepNodes.push(solver.windNodes.accumNode, solver.windNodes.applyNode);
      substepNodes.push(...solver.stretchColors);
      if (solver.bend) substepNodes.push(solver.bend);
      substepNodes.push(...solver.seamColors);
      substepNodes.push(solver.groundClamp);
      if (grabActive) substepNodes.push(solver.grabNodes.grabNode);
      substepNodes.push(solver.snapshotPreCollision);
      for (const body of solver.collisionBodies) substepNodes.push(body.findBestNode, body.applyPushNode);
      substepNodes.push(solver.postSolve);

      for (let s = 0; s < substeps; s++) {
        renderer.compute(substepNodes);
      }
```

(Las normales y el brush quedan fuera, por frame, como hoy. F3 insertará sus nodos antes de `groundClamp`.)
- [ ] **Step 2:** Verificación en navegador real (bypass + María): mismo comportamiento, FPS mejora o igual. Gate + commit `perf(gpu): un submit por substep — ~17 compute() consolidados en un pass (#897 F2)`.

### Task F2.6: Verificación de drape GPU + contingencia + flip de bodyCollision

- [ ] **Step 1:** Navegador real (ambas keys): María, esperar ~25s, leer `__OPENCLO_CLOTH_MESH__` (consola o Playwright MCP) y comprobar los umbrales M4: `nan===0`, `belowHipPct<5`, `minY>0.5`, `maxY>1.3`.
- [ ] **Step 2 (solo si falla):** diagnósticos §9.3 — kernel lift-test (push fijo 1cm si `bestTriIdx>=0`) para aislar pass-1 vs pass-2 + exponer `window.__OPENCLO_CLOTH_BBOX__` (min/max Y del último readback). Documentar en el issue ANTES de tocar más constantes. Candidato siguiente con evidencia: pre-pass inicial de interpenetración (hoy WASM-only).
- [ ] **Step 3:** `bodyCollision: true` en `GPU_CAPABILITIES` + JSDoc (4 causas cerradas + medición). Gate completo + PR con números.

---

# PR 4 — F3+F4: selfCollision por buckets + flip + replay María (`feat/897-f3-gpu-self-collision-and-flip`)

**Rediseño F3 (H-BP1):** el prefix-sum TSL serial (1 hilo × ~59k iter × 15 substeps = 180-900ms/frame) es fallo determinista del DoD. Se reemplaza el esquema CSR-compactado por **buckets de capacidad fija K=8**: `cellEntries` pasa a `tableSize × K`; scatter hace `slot = atomicAdd(count[h],1)` y escribe `entries[h*K+slot]` si `slot < K`; resolve itera `j < min(count[h], K)`. Elimina prefixSum Y cellStart Y el pase hashCount (scatter cuenta y escribe a la vez). Pipeline por substep: **cellClear(T) → scatter(N) → resolve(N) → apply(N)** — 4 dispatches, cero pasos seriales. Divergencia ratificada: celdas con >K partículas truncan candidatos (27 celdas × 8 = hasta 216 candidatos/partícula — de sobra a 5mm de spacing con celda de 2mm); CPU/WASM son unbounded. Plan B si K=8 trunca en la práctica: port Blelloch de `shaders/prefixSum.wgsl` (leerlo está permitido).

### Task F3.1: Fix del bug de adjacency

**Files:** `tslSelfCollision.ts:117-120` + test

- [ ] **Step 1: Failing test**

```ts
it('copies adjacency neighbor DATA into the SBA (not a zero-filled array)', () => {
  const buffers = createSelfCollisionBuffers(4, 8, new Uint32Array([0, 1, 2, 3, 3]), new Uint32Array([3, 7, 11]));
  expect(Array.from(buffers.adjNeighborsSBA.array as Uint32Array)).toEqual([3, 7, 11]);
});
```

- [ ] **Step 2: Fix** — `adjacencyNeighbors.length > 0 ? new Uint32Array(adjacencyNeighbors) : new Uint32Array(1)`.
- [ ] **Step 3:** Gate + commit `fix(gpu): adjNeighborsSBA copiaba longitud, no datos (#897 F3)`.

### Task F3.2: Rediseño a buckets K-fijos + compute() wrap + cellClear

**Files:** `tslSelfCollision.ts` (reescritura del módulo), sus tests

- [ ] **Step 1: Failing tests** — `createSelfCollisionBuffers(numParticles, tableSize, adjOffsets, adjNeighbors)`: `cellEntriesSBA.array.length === tableSize * 8`; sin `cellStartSBA`; `makeSelfCollisionComputeNodes` retorna `{cellClearNode, scatterNode, resolveNode, applyNode}` compute()-wrapped con dispatchCounts `[tableSize, N, N, N]`.
- [ ] **Step 2: Implement**

```ts
/** Capacidad por celda. 27 celdas × 8 = 216 candidatos/partícula máximo.
 *  A 5mm de spacing con celda = thickness (2mm), >8 partículas/celda solo
 *  ocurre en interpenetración masiva — truncar ahí es aceptable (divergencia
 *  ratificada vs CPU/WASM unbounded; plan B: Blelloch, ver plan #897). */
export const CELL_CAPACITY = 8;
```

Buffers: `cellCountSBA (Uint32, tableSize, atomic)`, `cellEntriesSBA (Uint32, tableSize*CELL_CAPACITY)`, adjacency CSR igual (con el fix F3.1), `deltaSBA`/`corrCountSBA` igual. Kernels:
- `cellClear` (T hilos): `atomicStore(cellCountBuf.element(i), int(0).toVar())`.
- `scatter` (N): hash igual que hoy (mismos primes); `const slot = atomicAdd(cellCountBuf.element(h), int(1)); If(slot.lessThan(int(CELL_CAPACITY)), () => { cellEntriesBuf.element(uint(h).mul(uint(CELL_CAPACITY)).add(uint(slot))).assign(uint(i)); });`
- `resolve` (N): por cada una de las 27 celdas vecinas: `const cnt = atomicLoad(cellCountBuf.element(h)).min(int(CELL_CAPACITY)); Loop(cnt, ({ k }) => { const j = cellEntriesBuf.element(uint(h).mul(uint(CELL_CAPACITY)).add(uint(k))); /* núcleo IDÉNTICO al actual: j>i, invMass, adjacency-skip CSR (cap 64), dist2 < thickSq, corrección Jacobi fixed-point a deltaBuf/corrCountBuf */ });`
- `apply` (N): igual que hoy (promedio + reset de delta/corrCount).
Todos envueltos: `compute(fn, count, [64])` (cellClear con `[64]` también — tableSize/64 workgroups).
- [ ] **Step 3:** Gate + commit `feat(gpu): self-collision por buckets K=8 — sin prefix-sum serial, 4 pases compute()-wrapped (#897 F3, H-BP1)`.

### Task F3.3: Alocación + config + dispatch

**Files:** `selfCollision.ts` (export `nextPrime`), `gpuSolverClient.ts`, `tslSolver.ts`, `GarmentSimulation.tsx`, behavior #13

- [ ] **Step 1: Failing test (behavior #13)** — tras `initMultiPieceTsl`: `scBuffers` no null, `adjOffsetsSBA.array.length === N+1`, `adjNeighborsSBA` con datos reales del quad.
- [ ] **Step 2: Implement** — `export function nextPrime` en `selfCollision.ts` (mismo cuerpo). En `initMultiPieceTsl` entre `createTslBuffers` y `createTslSolver`:

```ts
      // Self-collision (#897 F3): siempre alocado y activo en el tier GPU.
      // RATIFICADO (plan #897 S7): diverge del preset 'normal' (selfCollision
      // false), que es una decisión de perf MEDIDA EN WASM (#608/#892, kernel
      // a 1FPS) — no aplica a compute GPU. El kill-switch es el gate de
      // dispatch en GarmentSimulation.
      const adjSets = buildAdjacency(new Int32Array(mergedTriIds), totalVerts); // S8: firma pide Int32Array
      const csr = buildAdjacencyCSR(adjSets, totalVerts);
      tslBuffers.scBuffers = createSelfCollisionBuffers(totalVerts, nextPrime(totalVerts * 2), csr.offsets, csr.neighbors);
```

`defaultConfig`: `selfCollision: true, thickness: 0.002`. Gate de creación de nodos en `createTslSolver` (:683) ya existe.
- [ ] **Step 3: Dispatch** — en `substepNodes` (F2.5), ANTES de `groundClamp` (espejo Rust: self dentro de la dinámica natural → su corrección SÍ entra en velocidad; queda antes del snapshot):

```ts
      if (solver.selfCollisionNodes) {
        const sc = solver.selfCollisionNodes;
        substepNodes.push(sc.cellClearNode, sc.scatterNode, sc.resolveNode, sc.applyNode);
      }
      substepNodes.push(solver.groundClamp);
```

- [ ] **Step 4:** Comentario en `qualityPresets.ts:49` anotando que el tier GPU ignora este flag (decisión per-tier ratificada, #897). Gate + commit `feat(gpu): self-collision activa en el substep loop del tier GPU (#897 F3)`.

### Task F4.1: Flip de capabilities + retirada del bypass + gate test con fake

**Files:** `solverCapabilities.ts`, `useSimulationLifecycle.ts`, test seamInit

- [ ] **Step 1:** `GPU_CAPABILITIES`: `seams: true`, `selfCollision: true` (bodyCollision ya en true desde F2.6) con JSDoc honesto cada uno (qué paridad, qué divergencias ratificadas: behavioral no bit-exact; buckets K=8; Jacobi promediado; cellSize=thickness vs 2×).
- [ ] **Step 2:** Eliminar `isWebGpuSeamsUnsafeOptIn` y su uso (el gate genérico queda: capability true ⇒ no salta).
- [ ] **Step 3: Test del flip con señal positiva (S5)** — fake mínimo en seamInit test:

```ts
// navigator.gpu fake (jsdom no lo tiene):
(globalThis.navigator as any).gpu = {
  requestAdapter: async () => ({ requestDevice: async () => fakeDevice }),
};
const fakeDevice = { lost: new Promise(() => {}), addEventListener: vi.fn(), pushErrorScope: vi.fn(), popErrorScope: vi.fn().mockResolvedValue(null) };
// GpuSolverClient mock extendido: initMultiPieceTsl: vi.fn().mockResolvedValue(undefined),
// getTslSolver: () => ({}), onFrame: null, freezePieces: vi.fn(), setCollisionMesh: vi.fn(), dispose, stop
```

Asserts: con opt-in + seams, `initMultiPieceTsl` recibe `seamPairs` no vacíos Y el warning toast del gate NO se dispatcha. Borrar el caso viejo del toast con comentario (flip #897 F4). Limpieza del fake en afterEach (`delete (navigator as any).gpu`).
- [ ] **Step 4:** Gate + commit `feat(gpu): flip de capabilities seams+selfCollision, retirada del bypass dev (#897 F4)`.

### Task F4.2: Detección de pérdida del device REAL (H-RC1, mínimo honesto)

**Files:** `GarmentSimulation.tsx` (o Viewport3D si el renderer vive mejor ahí), test si viable

- [ ] **Step 1:** Effect cuando el tier TSL está activo: engancha al device del RENDERER (no al señuelo del lifecycle):

```ts
  // #897 F4 (H-RC1): los kernels corren en el device del renderer; el
  // device.lost del lifecycle vigila un device que no ejecuta nada. Detección
  // mínima: toast + error. La cascada automática a WASM tras pérdida queda
  // como follow-up (issue #<nuevo>).
  useEffect(() => {
    if (!tslMaterial) return;
    const device = (threeGl as any)?.backend?.device as GPUDevice | undefined;
    if (!device) return;
    let cancelled = false;
    device.lost.then((info) => {
      if (cancelled) return;
      console.error('[GarmentSimulation] WebGPU device lost:', info?.message);
      dispatch(showErrorToast('WebGPU device lost — reload or restart the simulation (falls back to WASM)'));
    });
    const onUncaptured = (e: Event) => console.error('[GarmentSimulation] uncaptured GPU error:', (e as any).error?.message);
    device.addEventListener?.('uncapturederror', onUncaptured);
    return () => { cancelled = true; device.removeEventListener?.('uncapturederror', onUncaptured); };
  }, [tslMaterial, threeGl, dispatch]);
```

- [ ] **Step 2:** `gh issue create` follow-up: "cascada automática GPU→WASM tras device lost del renderer (hoy: toast)". Gate + commit.

### Task F4.3: Replay GPU de María (≥30fps) — el DoD

**Files:** Create `tests/e2e/webgpu-maria-replay.spec.ts` (tag `@gpu-local`)

- [ ] **Step 1: Spec** — estructura del replay M4 (`seam-parity-replay.spec.ts:687-772`) con: `page.addInitScript(() => localStorage.setItem('openclo-use-webgpu', 'true'))` ANTES de `goto` (sin la key unsafe — ya no existe); asserts:

```ts
    // tier + pins #895
    poll solverTier === 'webgpu' (30s)
    poll simulation.bodyCollision === true (30s)
    expect(particleCount).toBeGreaterThan(25_000);
    expect(zeroConstraintSeams).toHaveLength(0);
    await page.waitForTimeout(25_000);
    // drape — umbrales M4 idénticos (readback periódico ≤15 frames stale)
    expect(drape.nan).toBe(0);
    expect(drape.belowHipPct).toBeLessThan(5);
    expect(drape.minY).toBeGreaterThan(0.5);
    expect(drape.maxY).toBeGreaterThan(1.3);
    // DoD #897 — ≥30fps sostenidos (mediana de 20 muestras de frameTimeMs cada 500ms)
    expect(medianFrameMs).toBeGreaterThan(0);
    expect(1000 / medianFrameMs).toBeGreaterThanOrEqual(30);
```

- [ ] **Step 2: Run** `npm run test:e2e:gpu -- webgpu-maria-replay`. Si <30fps: perfilar primero (¿submit overhead residual? ¿resolve de self-collision?) y decidir con evidencia (Blelloch / frecuencia de self-collision / profiling de pases) — no adivinar. Si drape falla: contingencia F2.6.
- [ ] **Step 3:** Gate + commit + PR con tabla baseline (F0) vs final.

### Task F4.4: Cierre

- [ ] `npm run test:e2e` completo local — tier WASM sin regresiones.
- [ ] CLAUDE.md: actualizar fila Epic-746 con el recuento final de behaviors (#11-#13) — este PR es el dueño del recuento (S11).
- [ ] `gh issue comment 897`: tabla baseline vs final (solver FPS, render FPS, drape) + decisión pendiente **del usuario**: default del opt-in `openclo-use-webgpu` (presentar evidencia, no flipear).
- [ ] Follow-ups a archivar como issues: (a) cascada auto GPU→WASM tras device lost; (b) compute/FPS en estado 'paused' del tier TSL (preexistente, S12); (c) Blelloch si K=8 trunca; (d) pre-pass de interpenetración inicial en GPU si la contingencia F2.6 lo señaló; (e) #892 sigue abierto (WASM tier).
- [ ] Tras merge + deploy: verificación EN PRODUCCIÓN (openclo.sdar.dev, IDB limpio, opt-in, flujo María, FPS del overlay + drape + costuras visualmente cerradas). Lección #895: prod o no cuenta.
- [ ] Actualizar memoria del proyecto (estado épica, números, fuera-de-scope).

---

## Self-review (v2)

- Los 2 BLOCKERs de Serrano resueltos estructuralmente (flip al final; tipo TSL-only). Los 2 breakpoints de Halberg resueltos por diseño (buckets K=8 elimina el paso serial; guard denom en F1.4 cubre stretch/bend/seam).
- Cadena de tipos coherente: `SeamPair.{compliance,tensionFactor}` → `TslSeamConstraintData` → `SeamColorGroup` → `makeSeamConstraintFn` → `solver.seamColors` → `substepNodes`. `recordFrameTick` → GarmentSimulation. `snapshotPreCollision`/`preColBuf` → postSolve. `CELL_CAPACITY` → scatter/resolve.
- Estados intermedios: PR2 y PR3 no cambian NADA para usuarios (capability false + bypass dev no documentado); PR4 es el único flip y llega con colisión calibrada + self-collision + replay verde.
- Sin placeholders: cada paso tiene código o referencia exacta con delta delimitado.
