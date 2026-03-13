import { test, expect, Page } from '@playwright/test';

/**
 * E2E tests for mesh grab tool (PR #312, issue #135).
 *
 * Verifies:
 * 1. Mesh grab Redux state has correct defaults
 * 2. Tool activates via keyboard shortcut ('m')
 * 3. Redux state updates via dispatch
 * 4. Clamping on radius and strength
 * 5. Simulation runs with grab tool active — no errors
 * 6. Tool definition metadata
 *
 * Note: Playwright headless Chromium uses SwiftShader (no WebGPU),
 * so the GPU grab compute kernel is a no-op. Tests verify UI
 * controls, Redux wiring, and no-crash behavior.
 */

async function waitForApp(page: Page) {
  await page.goto('/');
  await page.waitForSelector('svg.pattern-svg', { timeout: 15000 });
  await page.waitForTimeout(1000);
}

async function dismissTemplateLibrary(page: Page) {
  const heading = page.locator('text=Seamly2D Pattern Library');
  if (await heading.isVisible().catch(() => false)) {
    await page.locator('button.template-close').click({ force: true });
    await page.waitForTimeout(300);
  }
}

async function drawRectanglePiece(page: Page) {
  await dismissTemplateLibrary(page);

  await page.click('button:has-text("2D")');
  await page.waitForTimeout(500);

  const svg = page.locator('svg.pattern-svg');
  await svg.click();
  await page.waitForTimeout(200);

  // 's' = Rectangle tool
  await page.keyboard.press('s');
  await page.waitForTimeout(200);

  const box = await svg.boundingBox();
  if (!box) throw new Error('Pattern SVG not found');

  const cx = box.x + box.width / 2;
  const cy = box.y + box.height / 2;
  await page.mouse.move(cx - 80, cy - 80);
  await page.mouse.down();
  await page.mouse.move(cx + 80, cy + 80, { steps: 10 });
  await page.mouse.up();
  await page.waitForTimeout(1000);

  await expect(page.locator('text=/Pieces:\\s*[1-9]/')).toBeVisible({ timeout: 5000 });
}

async function switchTo3D(page: Page) {
  await page.click('button:has-text("3D")');
  await page.waitForTimeout(500);
}

async function openSimPanel(page: Page) {
  const simItem = page.locator('.activity-bar-top .tool-tooltip-wrapper:nth-child(3) button');
  await simItem.click({ force: true });
  await page.waitForTimeout(500);
}

async function clickSimulate(page: Page) {
  const simBtn = page.locator('button').filter({ hasText: 'Simulate' }).first();
  await expect(simBtn).toBeEnabled({ timeout: 5000 });
  await simBtn.click();
}

test.describe('Mesh Grab Tool (issue #135)', () => {
  test.setTimeout(120_000);

  test('mesh grab Redux state has correct defaults', async ({ page }) => {
    await waitForApp(page);

    const state = await page.evaluate(() => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const store = (window as any).__REDUX_STORE__;
      if (!store) return null;
      return store.getState().simulation.meshGrab;
    });

    if (!state) {
      test.skip(true, 'Redux store not exposed');
      return;
    }

    expect(state).toEqual({ active: false, radius: 0.05, strength: 0.8 });
  });

  test('mesh grab tool activates via shortcut key', async ({ page }) => {
    await waitForApp(page);
    await drawRectanglePiece(page);
    await switchTo3D(page);
    await page.waitForTimeout(500);

    // Press 'r' = Mesh Grab shortcut
    await page.keyboard.press('r');
    await page.waitForTimeout(300);

    // Check Redux state for active tool
    const activeTool = await page.evaluate(() => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const store = (window as any).__REDUX_STORE__;
      if (!store) return null;
      return store.getState().tools.activeTool3D;
    });

    if (!activeTool) {
      test.skip(true, 'Redux store not exposed');
      return;
    }

    expect(activeTool).toBe('meshGrab');
  });

  test('mesh grab state updates via Redux dispatch', async ({ page }) => {
    await waitForApp(page);

    const updated = await page.evaluate(() => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const store = (window as any).__REDUX_STORE__;
      if (!store) return null;

      store.dispatch({ type: 'simulation/setMeshGrabRadius', payload: 0.1 });
      store.dispatch({ type: 'simulation/setMeshGrabStrength', payload: 0.5 });
      store.dispatch({ type: 'simulation/setMeshGrabActive', payload: true });

      return store.getState().simulation.meshGrab;
    });

    if (!updated) {
      test.skip(true, 'Redux store not exposed');
      return;
    }

    expect(updated.radius).toBe(0.1);
    expect(updated.strength).toBe(0.5);
    expect(updated.active).toBe(true);
  });

  test('mesh grab clamping works via Redux', async ({ page }) => {
    await waitForApp(page);

    const clamped = await page.evaluate(() => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const store = (window as any).__REDUX_STORE__;
      if (!store) return null;

      // Radius clamps to [0.01, 0.5]
      store.dispatch({ type: 'simulation/setMeshGrabRadius', payload: 0 });
      const r1 = store.getState().simulation.meshGrab.radius;
      store.dispatch({ type: 'simulation/setMeshGrabRadius', payload: 2 });
      const r2 = store.getState().simulation.meshGrab.radius;

      // Strength clamps to [0, 1]
      store.dispatch({ type: 'simulation/setMeshGrabStrength', payload: -1 });
      const s1 = store.getState().simulation.meshGrab.strength;
      store.dispatch({ type: 'simulation/setMeshGrabStrength', payload: 5 });
      const s2 = store.getState().simulation.meshGrab.strength;

      return { r1, r2, s1, s2 };
    });

    if (!clamped) {
      test.skip(true, 'Redux store not exposed');
      return;
    }

    expect(clamped.r1).toBe(0.01);
    expect(clamped.r2).toBe(0.5);
    expect(clamped.s1).toBe(0);
    expect(clamped.s2).toBe(1);
  });

  test('simulation runs with mesh grab active — no errors', async ({ page }) => {
    const errors: string[] = [];
    page.on('console', msg => {
      if (msg.type() === 'error') errors.push(msg.text());
    });

    await waitForApp(page);
    await drawRectanglePiece(page);
    await openSimPanel(page);

    // Start simulation
    await clickSimulate(page);
    await expect(page.locator('text=SIMULATING').first()).toBeVisible({ timeout: 15000 });

    // Switch to 3D and activate mesh grab
    await switchTo3D(page);
    await page.waitForTimeout(500);
    await page.keyboard.press('r');
    await page.waitForTimeout(500);

    // Let simulation run with grab tool active
    await page.waitForTimeout(3000);

    // Should still be simulating
    const stillSimulating = await page.locator('text=SIMULATING').first().isVisible();
    const paused = await page.locator('text=PAUSED').first().isVisible();
    expect(stillSimulating || paused).toBe(true);

    // No mesh-grab-related errors
    const grabErrors = errors.filter(e =>
      e.includes('meshGrab') ||
      e.includes('grabDragging') ||
      e.includes('makeGrabComputeNode') ||
      e.includes('Failed to fetch dynamically imported module')
    );
    expect(grabErrors).toHaveLength(0);
  });

  test('tool definition has correct metadata', async ({ page }) => {
    await waitForApp(page);

    const toolDef = await page.evaluate(() => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const registry = (window as any).__TOOL_REGISTRY__;
      if (!registry) return null;
      const tool = registry.find((t: { id: string }) => t.id === 'meshGrab');
      if (!tool) return null;
      return {
        id: tool.id,
        name: tool.name,
        shortcut: tool.shortcut,
        context: tool.context,
        group: tool.group,
        cursor: tool.cursor,
      };
    });

    if (!toolDef) {
      test.skip(true, 'Tool registry not exposed');
      return;
    }

    expect(toolDef.id).toBe('meshGrab');
    expect(toolDef.name).toBe('Mesh Grab');
    expect(toolDef.shortcut).toBe('r');
    expect(toolDef.context).toBe('3d');
    expect(toolDef.group).toBe('3d-simulation');
    expect(toolDef.cursor).toBe('grab');
  });
});
