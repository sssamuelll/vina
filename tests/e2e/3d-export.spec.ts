import { test, expect } from '@playwright/test';

test.describe('3D Export', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    // Wait for the 3D viewport to render
    await page.waitForSelector('.viewport3d', { timeout: 10_000 });
  });

  test('render settings panel has 3D Model export section', async ({ page }) => {
    // Open the render settings panel
    await page.click('button[title="Render Settings"]');
    await page.waitForSelector('.render-panel');

    // Expand Export section if collapsed
    const exportHeader = page.locator('.ap-section-header', { hasText: 'Export' });
    await exportHeader.click();

    // Verify 3D Model subsection exists
    await expect(page.locator('text=3D Model')).toBeVisible();
    await expect(page.locator('text=Export 3D')).toBeVisible();
  });

  test('3D export format dropdown has GLB, glTF, USDZ options', async ({ page }) => {
    await page.click('button[title="Render Settings"]');
    await page.waitForSelector('.render-panel');

    // Find the format select in the 3D Model section
    const formatSelect = page.locator('select').filter({ hasText: 'GLB' });
    await expect(formatSelect).toBeVisible();

    const options = await formatSelect.locator('option').allTextContents();
    expect(options).toContain('GLB');
    expect(options).toContain('glTF');
    expect(options).toContain('USDZ');
  });

  test('3D export scale dropdown has mm, cm, m, inches', async ({ page }) => {
    await page.click('button[title="Render Settings"]');
    await page.waitForSelector('.render-panel');

    // Find the scale select
    const scaleSelect = page.locator('select').filter({ hasText: 'mm' });
    await expect(scaleSelect).toBeVisible();

    const options = await scaleSelect.locator('option').allTextContents();
    expect(options).toContain('mm');
    expect(options).toContain('cm');
    expect(options).toContain('m');
    expect(options).toContain('inches');
  });
});
