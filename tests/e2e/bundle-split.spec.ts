import { test, expect, Page } from '@playwright/test';

/**
 * E2E tests verifying dynamic imports work after the Three.js bundle split.
 * Each test triggers a code path that loads from the deferred `three-addons` chunk.
 *
 * Setup retargeted (2026-06-04):
 *  - The GLTF-export test was DELETED. The 3D export is only reachable through
 *    the Render panel's "Export 3D" button, which is gated behind `hideChrome`
 *    in the current shell (AppShell mounts Viewport3D with hideChrome). The
 *    LogoMenu ▸ File ▸ "Export 3D Model" submenu items (OBJ/glTF/FBX/USDZ) are
 *    all `() => {}` stubs, and `onExport3D` is not exposed to the page — so the
 *    GLTFExporter chunk has no user-reachable trigger. Re-add this test when an
 *    export affordance is surfaced (product backlog).
 *  - The IK-chunk test now opens the Avatar panel via the RightDock
 *    `[aria-label="Avatar"]` affordance (the old `[data-tool-id="avatar"]`
 *    Toolbar3D button was deleted) and toggles `.ik-toggle-btn`.
 *  - The store handle is `__OPENCLO_STORE__` (RectAreaLight test dispatches
 *    `renderSettings/addLight`, which still exists).
 */

async function waitForApp(page: Page) {
  await page.goto('/');
  await page.waitForFunction(() => Boolean((window as unknown as { __OPENCLO_STORE__?: unknown }).__OPENCLO_STORE__), { timeout: 15000 });
  await expect(page.locator('[aria-label="Simular"]').first()).toBeVisible({ timeout: 15000 });
}

async function open3DView(page: Page) {
  await page.click('button:has-text("3D")');
  await page.waitForTimeout(2000);
}

test.describe('Bundle Split — Dynamic Imports', () => {
  test.setTimeout(120_000);

  test('IK solver loads CCDIKSolver from addon chunk without errors', async ({ page }) => {
    const errors: string[] = [];
    page.on('console', msg => { if (msg.type() === 'error') errors.push(msg.text()); });

    await waitForApp(page);
    await open3DView(page);

    // Open the Avatar panel via the RightDock affordance.
    await page.locator('button[aria-label="Avatar"]').click({ force: true });
    await page.waitForTimeout(500);
    await expect(page.locator('.context-panel__header >> text=Avatar')).toBeVisible({ timeout: 5000 });

    // Expand Pose section if collapsed.
    const poseHeader = page.locator('.avatar-panel button:has-text("Pose")');
    if (await poseHeader.isVisible({ timeout: 3000 }).catch(() => false)) {
      await poseHeader.click({ force: true });
      await page.waitForTimeout(300);
    }

    // Enable IK mode — triggers dynamic import of CCDIKSolver.
    const ikToggle = page.locator('.ik-toggle-btn');
    await expect(ikToggle).toBeVisible({ timeout: 5000 });
    await ikToggle.click({ force: true });
    await page.waitForTimeout(2000);
    await expect(ikToggle).toHaveText('IK Mode');

    const importErrors = errors.filter(e =>
      e.includes('Failed to fetch dynamically imported module') ||
      e.includes('Loading chunk') ||
      e.includes('CCDIKSolver')
    );
    expect(importErrors).toHaveLength(0);
  });

  test('RectAreaLight renders after dynamic import of UniformsLib', async ({ page }) => {
    const errors: string[] = [];
    page.on('console', msg => { if (msg.type() === 'error') errors.push(msg.text()); });

    await waitForApp(page);
    await open3DView(page);

    // Add a light via the store — triggers RectLight which dynamically imports
    // RectAreaLightUniformsLib.
    await page.evaluate(() => {
      const store = (window as unknown as { __OPENCLO_STORE__?: { dispatch: (a: unknown) => void } }).__OPENCLO_STORE__;
      store?.dispatch({ type: 'renderSettings/addLight' });
    });

    await page.waitForTimeout(3000);

    const importErrors = errors.filter(e =>
      e.includes('Failed to fetch dynamically imported module') ||
      e.includes('Loading chunk') ||
      e.includes('RectAreaLight') ||
      e.includes('UniformsLib')
    );
    expect(importErrors).toHaveLength(0);
  });

  test('avatar model loads via GLTFLoader from core chunk', async ({ page }) => {
    const errors: string[] = [];
    page.on('console', msg => { if (msg.type() === 'error') errors.push(msg.text()); });

    await waitForApp(page);
    await open3DView(page);
    await page.waitForTimeout(3000);

    await expect(page.locator('canvas').first()).toBeVisible();

    const importErrors = errors.filter(e =>
      e.includes('Failed to fetch dynamically imported module') ||
      e.includes('Loading chunk') ||
      e.includes('GLTFLoader') ||
      e.includes('Failed to load')
    );
    expect(importErrors).toHaveLength(0);
  });
});
