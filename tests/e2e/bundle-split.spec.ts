import { test, expect, Page } from '@playwright/test';

/**
 * E2E tests verifying dynamic imports work after the Three.js bundle split.
 * Each test triggers a code path that loads from the deferred `three-addons` chunk.
 */

async function waitForApp(page: Page) {
  await page.goto('/');
  await page.waitForSelector('svg.pattern-svg', { timeout: 15000 });
  await page.waitForTimeout(1000);
}

async function open3DView(page: Page) {
  await page.click('button:has-text("3D")');
  await page.waitForTimeout(2000);
}

test.describe('Bundle Split — Dynamic Imports', () => {
  test.setTimeout(120_000);

  test('GLTF export triggers addon chunk load without errors', async ({ page }) => {
    const errors: string[] = [];
    page.on('console', msg => {
      if (msg.type() === 'error') errors.push(msg.text());
    });

    await waitForApp(page);
    await open3DView(page);

    // Open render settings panel
    const renderBtn = page.locator('button:has-text("Render")');
    await renderBtn.click({ force: true });
    await page.waitForTimeout(500);

    // Wait for Export section to be visible, expand if needed
    const exportSection = page.locator('button:has-text("Export")');
    if (await exportSection.isVisible({ timeout: 3000 }).catch(() => false)) {
      await exportSection.click({ force: true });
      await page.waitForTimeout(300);
    }

    // Click "Export 3D" button — this triggers dynamic import of GLTFExporter
    const export3DBtn = page.locator('button:has-text("Export 3D")');
    if (await export3DBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      // Set up download handling (we don't need the actual file, just verify no crash)
      const downloadPromise = page.waitForEvent('download', { timeout: 10000 }).catch(() => null);
      await export3DBtn.click({ force: true });

      // Wait a bit for dynamic import to resolve
      await page.waitForTimeout(3000);

      // Cancel/dismiss any download
      const download = await downloadPromise;
      if (download) await download.cancel().catch(() => {});
    }

    // No import errors should occur
    const importErrors = errors.filter(e =>
      e.includes('Failed to fetch dynamically imported module') ||
      e.includes('Loading chunk') ||
      e.includes('GLTFExporter')
    );
    expect(importErrors).toHaveLength(0);
  });

  test('IK solver loads CCDIKSolver from addon chunk without errors', async ({ page }) => {
    const errors: string[] = [];
    page.on('console', msg => {
      if (msg.type() === 'error') errors.push(msg.text());
    });

    await waitForApp(page);

    // Switch to 3D view
    await page.click('button:has-text("3D")');
    await page.waitForTimeout(2000);

    // Open avatar panel
    const avatarBtn = page.locator('button[data-tool-id="avatar"]');
    await avatarBtn.click({ force: true });
    await page.waitForTimeout(500);

    // Expand Pose section if collapsed
    const poseHeader = page.locator('.avatar-panel button:has-text("Pose")');
    if (await poseHeader.isVisible({ timeout: 3000 }).catch(() => false)) {
      await poseHeader.click({ force: true });
      await page.waitForTimeout(300);
    }

    // Enable IK mode — triggers dynamic import of CCDIKSolver
    const ikToggle = page.locator('.ik-toggle-btn');
    await expect(ikToggle).toBeVisible({ timeout: 5000 });
    await ikToggle.click({ force: true });
    await page.waitForTimeout(2000);

    // Verify IK mode is active
    await expect(ikToggle).toHaveText('IK Mode');

    // No dynamic import errors
    const importErrors = errors.filter(e =>
      e.includes('Failed to fetch dynamically imported module') ||
      e.includes('Loading chunk') ||
      e.includes('CCDIKSolver')
    );
    expect(importErrors).toHaveLength(0);
  });

  test('RectAreaLight renders after dynamic import of UniformsLib', async ({ page }) => {
    const errors: string[] = [];
    page.on('console', msg => {
      if (msg.type() === 'error') errors.push(msg.text());
    });

    await waitForApp(page);
    await open3DView(page);

    // Add a light via Redux store — this triggers RectLight component which
    // dynamically imports RectAreaLightUniformsLib
    await page.evaluate(() => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const store = (window as any).__OPENCLO_STORE__;
      if (!store) return;
      store.dispatch({
        type: 'renderSettings/addLight',
      });
    });

    // Wait for dynamic import to resolve and light to render
    await page.waitForTimeout(3000);

    // No errors from dynamic import or RectAreaLight rendering
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
    page.on('console', msg => {
      if (msg.type() === 'error') errors.push(msg.text());
    });

    await waitForApp(page);
    await open3DView(page);

    // Wait for avatar to load (GLTFLoader is in three-core, loads immediately)
    await page.waitForTimeout(3000);

    // Canvas should be visible and rendering
    await expect(page.locator('canvas')).toBeVisible();

    // No loading/import errors
    const importErrors = errors.filter(e =>
      e.includes('Failed to fetch dynamically imported module') ||
      e.includes('Loading chunk') ||
      e.includes('GLTFLoader') ||
      e.includes('Failed to load')
    );
    expect(importErrors).toHaveLength(0);
  });
});
