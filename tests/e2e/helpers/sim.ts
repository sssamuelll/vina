/**
 * Shared E2E helpers for the simulation / GPU test cluster.
 *
 * These replace the dead "sim panel" setup that targeted the deleted
 * ActivityBar (`.activity-bar-*`) and SimulationView (`.simulation-view`)
 * surfaces. The current shell has no wind/freeze/quality-preset UI — those
 * are product backlog — so setup is store-driven (the dress-avatar-dod.spec.ts
 * pattern): expose the Redux store at `window.__OPENCLO_STORE__`, dispatch a
 * rectangle piece into `project`, switch to 3D so GarmentSimulation mounts,
 * then start the sim via dispatch (or the RightDock Simulate button).
 *
 * Mesh observable: `window.__OPENCLO_CLOTH_MESH__` (GarmentSimulation.tsx:521).
 *
 * NOTE: do NOT use `window.__REDUX_STORE__` — that name is not exposed by the
 * app. The canonical handle is `__OPENCLO_STORE__` (src/store/index.ts).
 */
import { expect, type Page } from '@playwright/test';

/** Wait for the app shell to hydrate: store exposed + RightDock Simulate button visible. */
export async function waitForApp(page: Page) {
  await page.goto('/');
  await page
    .waitForFunction(() => Boolean((window as unknown as { __OPENCLO_STORE__?: unknown }).__OPENCLO_STORE__), {
      timeout: 15_000,
    })
    .catch(() => {
      throw new Error('window.__OPENCLO_STORE__ never appeared within 15s — dev server not serving the app?');
    });
  // RightDock Simulate button is part of the shell in split/3D view; its
  // presence implies the shell mounted (UnifiedBar + 3D viewport present).
  await expect(page.locator('[aria-label="Simular"]').first()).toBeVisible({ timeout: 15_000 });
}

/**
 * Dispatch a single rectangle piece into project state. Returns its id.
 * Rectangle outline: 200×300 mm closed path. Mirrors the addPiece payload
 * shape used elsewhere (id/name/outline/position/rotation/mirrored/...).
 */
export async function addRectanglePiece(page: Page, name = 'Rect'): Promise<string> {
  return page.evaluate((pieceName) => {
    const store = (window as unknown as { __OPENCLO_STORE__?: {
      dispatch: (a: unknown) => void;
      getState: () => { project?: { pieces?: Array<{ id: string }> } };
    } }).__OPENCLO_STORE__;
    if (!store) throw new Error('store not exposed');
    const id = (crypto as Crypto & { randomUUID: () => string }).randomUUID();
    const now = Date.now();
    store.dispatch({
      type: 'project/addPiece',
      payload: {
        id,
        name: pieceName,
        outline: [
          { type: 'M', values: [0, 0] },
          { type: 'L', values: [200, 0] },
          { type: 'L', values: [200, 300] },
          { type: 'L', values: [0, 300] },
          { type: 'L', values: [0, 0] },
        ],
        position: { x: 0, y: 0 },
        rotation: 0,
        mirrored: false,
        seamAllowance: 10,
        internals: [],
        createdAt: now,
        updatedAt: now,
        active: true,
      },
    });
    return id;
  }, name);
}

/** Switch the viewport to a given mode via the TopBar pills. */
export async function switchView(page: Page, mode: '2D' | 'Split' | '3D') {
  await page.click(`button:has-text("${mode}")`);
  await page.waitForTimeout(400);
}

/** Read the current simulation state from the store. */
export async function getSimulationState(page: Page): Promise<string> {
  return page.evaluate(() => {
    const store = (window as unknown as { __OPENCLO_STORE__?: {
      getState: () => { simulation?: { simulationState?: string } };
    } }).__OPENCLO_STORE__;
    return store?.getState().simulation?.simulationState ?? 'unknown';
  });
}

/**
 * Read the active solver tier from the store
 * (`'none' | 'webgpu' | 'wasm' | 'cpu-worker' | 'neural-drape'`). Live wind is
 * only applied by the `wasm` and `webgpu` tiers — the CPU worker has no
 * `setWind` (useSimulationLifecycle.ts:699) — so wind tests gate on this.
 */
export async function getSolverTier(page: Page): Promise<string> {
  return page.evaluate(() => {
    const store = (window as unknown as { __OPENCLO_STORE__?: {
      getState: () => { simulation?: { solverTier?: string } };
    } }).__OPENCLO_STORE__;
    return store?.getState().simulation?.solverTier ?? 'none';
  });
}

/** Start the simulation via store dispatch and poll until it reports 'running'. */
export async function startSimulation(page: Page) {
  await page.evaluate(() => {
    const store = (window as unknown as { __OPENCLO_STORE__?: { dispatch: (a: unknown) => void } }).__OPENCLO_STORE__;
    store?.dispatch({ type: 'simulation/setViewMode3D', payload: 'simulate' });
    store?.dispatch({ type: 'simulation/startSimulation' });
  });
  await page.waitForFunction(
    () => {
      const store = (window as unknown as { __OPENCLO_STORE__?: {
        getState: () => { simulation?: { simulationState?: string } };
      } }).__OPENCLO_STORE__;
      return store?.getState().simulation?.simulationState === 'running';
    },
    { timeout: 10_000 },
  );
}

/** Dispatch an arbitrary action onto the store. */
export async function dispatch(page: Page, action: Record<string, unknown>) {
  await page.evaluate((a) => {
    const store = (window as unknown as { __OPENCLO_STORE__?: { dispatch: (x: unknown) => void } }).__OPENCLO_STORE__;
    store?.dispatch(a);
  }, action);
}

/**
 * Wait for the cloth mesh observable to appear (real meshing + first render).
 * Returns true if it appeared within the budget, false otherwise — callers
 * decide whether absence is a hard failure or a skip.
 */
export async function waitForClothMesh(page: Page, budgetMs = 20_000): Promise<boolean> {
  return page
    .waitForFunction(
      () => Boolean((window as unknown as { __OPENCLO_CLOTH_MESH__?: { geometry?: unknown } }).__OPENCLO_CLOTH_MESH__?.geometry),
      { timeout: budgetMs, polling: 250 },
    )
    .then(() => true)
    .catch(() => false);
}

/** Aggregate position diagnostics from the cloth mesh: NaN/Inf/zero counts + avg center. */
export async function readMeshPositions(page: Page) {
  return page.evaluate(() => {
    const mesh = (window as unknown as { __OPENCLO_CLOTH_MESH__?: {
      geometry?: { getAttribute(n: string): { count: number; getX(i: number): number; getY(i: number): number; getZ(i: number): number } | null };
    } }).__OPENCLO_CLOTH_MESH__;
    if (!mesh?.geometry) return { found: false as const };
    const pos = mesh.geometry.getAttribute('position');
    if (!pos || pos.count === 0) return { found: false as const };
    let nanCount = 0, infCount = 0, zeroCount = 0, sumX = 0, sumY = 0, sumZ = 0;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
      if (isNaN(x) || isNaN(y) || isNaN(z)) nanCount++;
      if (!isFinite(x) || !isFinite(y) || !isFinite(z)) infCount++;
      if (x === 0 && y === 0 && z === 0) zeroCount++;
      sumX += x; sumY += y; sumZ += z;
    }
    return {
      found: true as const,
      count: pos.count,
      nanCount,
      infCount,
      zeroCount,
      allZeros: zeroCount === pos.count,
      avgX: sumX / pos.count,
      avgY: sumY / pos.count,
      avgZ: sumZ / pos.count,
    };
  });
}
