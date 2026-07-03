/**
 * A4 face-poke A/B harness @gpu-local (maintainer-run) — el runner del
 * veredicto de flip de GPU_CAPABILITIES.facePoke.
 *
 * ON (default): fuerza el pase vía localStorage 'openclo-facepoke-on'.
 * OFF (baseline): correr con FP_OFF=1.
 *   FP_OFF=1 npx playwright test --config playwright.webgpu.config.ts facepoke-ab
 *
 * Loguea la métrica cara-aware (visible/aligned/true/shallow/near) a 2.5s y
 * 10s + salud del drape + timeline de fps + sondas de diagnóstico (raycast
 * tela-vs-cuerpo en puntos del pecho, offset colisión-vs-render por bandas,
 * posiciones de pares residuales). Las sondas son las que separaron física
 * de mismatch de render el 2026-07-03 — se quedan.
 */
import { test, expect, Page } from '@playwright/test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { switchView, startSimulation } from './helpers/sim';

const FIXTURE = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../fixtures/garments/maria_patrones_samuel_2M.dxf',
);
const SHOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../.tmp/facepoke-on-10s.png',
);

async function getState<T = unknown>(page: Page, sel: string): Promise<T> {
  return page.evaluate((p) => {
    const store = (window as unknown as Record<string, unknown>).__OPENCLO_STORE__ as
      | { getState: () => unknown }
      | undefined;
    if (!store) return null;
    return p
      .split('.')
      .reduce((o: unknown, k) => (o as Record<string, unknown> | null)?.[k], store.getState()) as T;
  }, sel) as Promise<T>;
}

async function readFacePoke(page: Page) {
  return page.evaluate(() => {
    const w = window as unknown as Record<string, unknown>;
    return (w.__OPENCLO_FACE_POKE__ as {
      visible: number; visibleShallow: number; visibleAligned: number; visibleTrue: number; near: number; maxDepth: number; sampledFaces: number; stride: number;
    } | undefined) ?? null;
  });
}

async function readDrape(page: Page) {
  return page.evaluate(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const mesh = (window as any).__OPENCLO_CLOTH_MESH__;
    if (!mesh) return null;
    const pos = mesh.geometry.attributes.position;
    let nan = 0, belowHip = 0, sleeve = 0;
    let minY = Infinity;
    for (let i = 0; i < pos.count; i++) {
      const y = pos.getY(i);
      if (Number.isNaN(y)) { nan++; continue; }
      if (y < 0.8) belowHip++;
      if (y < minY) minY = y;
      if (Math.abs(pos.getX(i)) > 0.25) sleeve++;
    }
    return { nan, belowHipPct: (belowHip / pos.count) * 100, minY, sleeve };
  });
}

test('facepoke A/B metric @gpu-local', async ({ page }) => {
  test.setTimeout(240_000);
  const fpOff = !!process.env.FP_OFF;
  await page.addInitScript((off) => {
    localStorage.setItem('openclo-use-webgpu', 'true');
    if (!off) localStorage.setItem('openclo-facepoke-on', 'true');
  }, fpOff);
  page.on('console', (msg) => {
    const t = msg.text();
    if (/RenderBake|SimLifecycle|CollisionMesh|AvatarCollision/.test(t)) console.log(`[page] ${t}`);
  });
  await page.goto('/');
  await page.waitForSelector('svg.pattern-svg', { timeout: 15_000 });
  await page.waitForFunction(
    () => Boolean((window as unknown as { __OPENCLO_STORE__?: unknown }).__OPENCLO_STORE__),
    { timeout: 15_000 },
  );
  await page.waitForTimeout(500);
  await page.locator('input[accept=".dxf"]').setInputFiles(FIXTURE);
  await expect
    .poll(async () => ((await getState<unknown[]>(page, 'project.pieces')) ?? []).length, { timeout: 30_000 })
    .toBe(5);
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur?.());
  await page.keyboard.press('Control+k');
  await page.waitForTimeout(400);
  await page.getByText('Auto-Sew Pieces', { exact: false }).first().click();
  await expect
    .poll(async () => ((await getState<unknown[]>(page, 'project.seams')) ?? []).length, { timeout: 15_000 })
    .toBeGreaterThanOrEqual(6);
  await switchView(page, '3D');

  await page.evaluate(() => {
    const w = window as unknown as Record<string, unknown>;
    const store = w.__OPENCLO_STORE__ as {
      getState: () => { simulation: { frameTimeMs: number } };
      subscribe: (f: () => void) => void;
    };
    let last = store.getState().simulation.frameTimeMs;
    let windows = 0;
    const samples: number[] = [];
    w.__SIM_WINDOWS__ = 0;
    w.__FRAME_MS_SAMPLES__ = samples;
    store.subscribe(() => {
      const v = store.getState().simulation.frameTimeMs;
      if (v !== last) {
        last = v;
        if (v > 0) { w.__SIM_WINDOWS__ = ++windows; samples.push(v); }
      }
    });
  });

  await startSimulation(page);
  await expect
    .poll(async () => getState<string>(page, 'simulation.solverTier'), { timeout: 60_000 })
    .toBe('webgpu');

  const waitWindows = (min: number, timeout: number) =>
    page.waitForFunction(
      (m) => ((window as unknown as { __SIM_WINDOWS__?: number }).__SIM_WINDOWS__ ?? 0) >= m,
      min,
      { timeout },
    );

  const triCount = await page.evaluate(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const m = (window as any).__OPENCLO_COLLISION_MESH__;
    return m ? m.triCount : null;
  });
  console.log(`[A4-collider] triCount=${triCount}`);

  await waitWindows(5, 60_000); // t≈2.5s
  const fp25 = await readFacePoke(page);
  const dr25 = await readDrape(page);
  console.log(
    `[A4-ON] t=2.5s visible=${fp25?.visible ?? 'n/a'} aligned=${fp25?.visibleAligned ?? 'n/a'} true=${fp25?.visibleTrue ?? 'n/a'} shallow=${fp25?.visibleShallow ?? 'n/a'} near=${fp25?.near ?? 'n/a'} maxDepthMm=${fp25 ? (fp25.maxDepth * 1000).toFixed(1) : 'n/a'} | belowHip=${dr25?.belowHipPct.toFixed(2)} minY=${dr25?.minY.toFixed(3)} sleeve=${dr25?.sleeve} nan=${dr25?.nan}`,
  );

  await waitWindows(20, 120_000); // t≈10s
  const fp10 = await readFacePoke(page);
  const dr10 = await readDrape(page);
  const frameMs = await page.evaluate(() => {
    const s = (window as unknown as { __FRAME_MS_SAMPLES__?: number[] }).__FRAME_MS_SAMPLES__ ?? [];
    const tail = s.slice(-6).sort((a, b) => a - b);
    return tail.length ? tail[Math.floor(tail.length / 2)] : null;
  });
  const allSamples = await page.evaluate(
    () => ((window as unknown as { __FRAME_MS_SAMPLES__?: number[] }).__FRAME_MS_SAMPLES__ ?? []).map((v) => Number(v.toFixed(1))),
  );
  console.log(`[A4-timeline] windows(ms)=${JSON.stringify(allSamples)}`);
  console.log(
    `[A4-ON] t=10s visible=${fp10?.visible ?? 'n/a'} aligned=${fp10?.visibleAligned ?? 'n/a'} true=${fp10?.visibleTrue ?? 'n/a'} shallow=${fp10?.visibleShallow ?? 'n/a'} near=${fp10?.near ?? 'n/a'} maxDepthMm=${fp10 ? (fp10.maxDepth * 1000).toFixed(1) : 'n/a'} | belowHip=${dr10?.belowHipPct.toFixed(2)} minY=${dr10?.minY.toFixed(3)} sleeve=${dr10?.sleeve} nan=${dr10?.nan} | frameMs(median tail)=${frameMs?.toFixed(1) ?? 'n/a'} fps=${frameMs ? (1000 / frameMs).toFixed(1) : 'n/a'}`,
  );
  const pairs = await page.evaluate(() => {
    const w = window as unknown as Record<string, unknown>;
    const fp = w.__OPENCLO_FACE_POKE__ as { pairs?: number[][] } | undefined;
    return fp?.pairs ?? null;
  });
  for (const pr of pairs ?? []) {
    console.log(`[A4-pair] x=${pr[0].toFixed(3)} y=${pr[1].toFixed(3)} z=${pr[2].toFixed(3)} depthMm=${(pr[3] * 1000).toFixed(1)} aligned=${pr[4]}`);
  }
  // Raycast probe: at chest sample points, who is in FRONT — cloth or the
  // RENDER avatar? The physics metric (collision mesh) says the chest has no
  // pokes; the eyes see skin patches. If the render avatar wins the ray, the
  // patch is a render-vs-collision surface mismatch, not physics.
  const rays = await page.evaluate(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const w = window as any;
    const cloth = w.__OPENCLO_CLOTH_MESH__;
    if (!cloth) return null;
    let scene = cloth;
    while (scene.parent) scene = scene.parent;
    const skinned: unknown[] = [];
    scene.traverse((o: { isSkinnedMesh?: boolean; isMesh?: boolean; name?: string }) => {
      if (o.isSkinnedMesh) skinned.push(o);
    });
    const THREE = w.__OPENCLO_THREE__;
    if (!THREE || skinned.length === 0) {
      return { error: `THREE=${!!THREE} skinned=${skinned.length}` };
    }
    const ray = new THREE.Raycaster();
    const out: Record<string, { cloth: number | null; body: number | null }> = {};
    const samples: Array<[string, number, number]> = [
      ['chin', 0.0, 1.42],
      ['chestL', -0.06, 1.28],
      ['chestR', 0.06, 1.28],
      ['midL', -0.055, 1.17],
      ['midR', 0.055, 1.17],
      ['belly', 0.0, 1.02],
    ];
    for (const [name, x, y] of samples) {
      ray.set(new THREE.Vector3(x, y, 2.0), new THREE.Vector3(0, 0, -1));
      const hitCloth = ray.intersectObject(cloth, false);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const hitBody = ray.intersectObjects(skinned as any[], false);
      out[name] = {
        cloth: hitCloth.length ? hitCloth[0].point.z : null,
        body: hitBody.length ? hitBody[0].point.z : null,
      };
    }
    return out;
  });
  console.log(`[A4-rays] ${JSON.stringify(rays)}`);
  const collZ = await page.evaluate(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const mesh = (window as any).__OPENCLO_COLLISION_MESH__ as
      | { vertices: Float32Array; triCount: number }
      | undefined;
    if (!mesh) return null;
    const v = mesh.vertices;
    const samples: Array<[string, number, number]> = [
      ['chin', 0.0, 1.42],
      ['chestL', -0.06, 1.28],
      ['chestR', 0.06, 1.28],
      ['midL', -0.055, 1.17],
      ['midR', 0.055, 1.17],
      ['belly', 0.0, 1.02],
    ];
    const out: Record<string, number | null> = {};
    for (const [name, sx, sy] of samples) {
      let best: number | null = null;
      for (let t = 0; t < mesh.triCount; t++) {
        const o = t * 9;
        // Ray (sx,sy,2)->(0,0,-1): intersect where the tri crosses x=sx,y=sy.
        const ax = v[o], ay = v[o + 1], az = v[o + 2];
        const bx = v[o + 3], by = v[o + 4], bz = v[o + 5];
        const cx = v[o + 6], cy = v[o + 7], cz = v[o + 8];
        // 2D barycentric in the XY plane.
        const d00x = bx - ax, d00y = by - ay;
        const d01x = cx - ax, d01y = cy - ay;
        const den = d00x * d01y - d01x * d00y;
        if (Math.abs(den) < 1e-12) continue;
        const wx = sx - ax, wy = sy - ay;
        const beta = (wx * d01y - d01x * wy) / den;
        const gamma = (d00x * wy - wx * d00y) / den;
        const alpha = 1 - beta - gamma;
        if (alpha < 0 || beta < 0 || gamma < 0) continue;
        const z = alpha * az + beta * bz + gamma * cz;
        if (best === null || z > best) best = z; // frontmost surface
      }
      out[name] = best;
    }
    return out;
  });
  console.log(`[A4-collz] ${JSON.stringify(collZ)}`);
  // Torso silhouette profile: front (max z) and back (min z) per y-band on the
  // central strip |x|<0.03, for BOTH surfaces. Translation shows as same-sign
  // shift front+back; girth shows as opposite-sign (front +, back -).
  const profile = await page.evaluate(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const w = window as any;
    const coll = w.__OPENCLO_COLLISION_MESH__ as { vertices: Float32Array; triCount: number } | undefined;
    const cloth = w.__OPENCLO_CLOTH_MESH__;
    if (!coll || !cloth) return null;
    let scene = cloth;
    while (scene.parent) scene = scene.parent;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const skinned: any[] = [];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    scene.traverse((o: any) => { if (o.isSkinnedMesh) skinned.push(o); });
    const THREE = w.__OPENCLO_THREE__;
    const bands = [1.0, 1.05, 1.1, 1.15, 1.2, 1.25, 1.3, 1.35, 1.4];
    const half = 0.025;
    const out: Record<string, { collF: number | null; rendF: number | null; collB: number | null; rendB: number | null }> = {};
    const acc: Record<number, { collF: number; rendF: number; collB: number; rendB: number }> = {};
    for (const b of bands) acc[b] = { collF: -Infinity, rendF: -Infinity, collB: Infinity, rendB: Infinity };
    const cv = coll.vertices;
    for (let i = 0; i < cv.length; i += 3) {
      const x = cv[i], y = cv[i + 1], z = cv[i + 2];
      if (Math.abs(x) > 0.03) continue;
      for (const b of bands) {
        if (Math.abs(y - b) > half) continue;
        if (z > acc[b].collF) acc[b].collF = z;
        if (z < acc[b].collB) acc[b].collB = z;
      }
    }
    const v3 = new THREE.Vector3();
    for (const m of skinned) {
      const pos = m.geometry.getAttribute('position');
      for (let i = 0; i < pos.count; i++) {
        m.getVertexPosition(i, v3);
        v3.applyMatrix4(m.matrixWorld);
        if (Math.abs(v3.x) > 0.03) continue;
        for (const b of bands) {
          if (Math.abs(v3.y - b) > half) continue;
          if (v3.z > acc[b].rendF) acc[b].rendF = v3.z;
          if (v3.z < acc[b].rendB) acc[b].rendB = v3.z;
        }
      }
    }
    for (const b of bands) {
      out[b.toFixed(2)] = {
        collF: acc[b].collF === -Infinity ? null : acc[b].collF,
        rendF: acc[b].rendF === -Infinity ? null : acc[b].rendF,
        collB: acc[b].collB === Infinity ? null : acc[b].collB,
        rendB: acc[b].rendB === Infinity ? null : acc[b].rendB,
      };
    }
    return out;
  });
  if (profile) {
    for (const [band, pr] of Object.entries(profile)) {
      const dF = pr.rendF !== null && pr.collF !== null ? ((pr.rendF - pr.collF) * 1000).toFixed(1) : 'n/a';
      const dB = pr.rendB !== null && pr.collB !== null ? ((pr.rendB - pr.collB) * 1000).toFixed(1) : 'n/a';
      console.log(`[A4-profile] y=${band} dFrontMm=${dF} dBackMm=${dB}`);
    }
  }
  await page.screenshot({ path: SHOT });
  expect(dr10?.nan ?? 1).toBe(0);
});
