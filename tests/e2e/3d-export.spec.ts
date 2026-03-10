import { test, expect } from '@playwright/test';

test.describe('3D Export', () => {
  test.setTimeout(120_000);

  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    // Wait for the 3D viewport to render
    await page.waitForSelector('.viewport3d', { timeout: 10_000 });
    // Open the render settings panel
    await page.click('button[title="Render Settings"]');
    await page.waitForSelector('.render-panel');
  });

  test('render settings panel has 3D Model export section', async ({ page }) => {
    // Export section starts open — verify 3D Model subsection exists
    await expect(page.locator('text=3D Model')).toBeVisible();
    await expect(page.locator('text=Export 3D')).toBeVisible();
  });

  test('3D export format dropdown has GLB, glTF, USDZ options', async ({ page }) => {
    // Find the format select in the 3D Model section
    const formatSelect = page.locator('select').filter({ hasText: 'GLB' });
    await expect(formatSelect).toBeVisible();

    const options = await formatSelect.locator('option').allTextContents();
    expect(options).toContain('GLB');
    expect(options).toContain('glTF');
    expect(options).toContain('USDZ');
  });

  test('3D export scale dropdown has mm, cm, m, inches', async ({ page }) => {
    // Find the scale select (default value is "m")
    const scaleSelect = page.locator('select').filter({ hasText: /^m/ });
    await expect(scaleSelect).toBeVisible();

    const options = await scaleSelect.locator('option').allTextContents();
    expect(options).toContain('mm');
    expect(options).toContain('cm');
    expect(options).toContain('m');
    expect(options).toContain('inches');
  });
});
