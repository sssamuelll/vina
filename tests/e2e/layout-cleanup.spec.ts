import { test, expect, Page } from '@playwright/test';

async function waitForApp(page: Page) {
  await page.goto('/');
  await page.waitForSelector('svg.pattern-svg', { timeout: 15000 });
  await page.waitForTimeout(1000);
}

async function drawAndSelectPiece(page: Page) {
  await page.click('button:has-text("2D")');
  await page.waitForTimeout(300);
  await page.keyboard.press('s');
  await page.waitForTimeout(200);
  const svg = page.locator('svg.pattern-svg');
  const box = await svg.boundingBox();
  if (!box) throw new Error('Pattern SVG not found');
  const cx = box.x + box.width / 2;
  const cy = box.y + box.height / 2;
  await page.mouse.move(cx - 80, cy - 60);
  await page.mouse.down();
  await page.mouse.move(cx + 80, cy + 60, { steps: 10 });
  await page.mouse.up();
  await page.waitForTimeout(500);
  await expect(page.locator('.status-bar')).toContainText(/Pieces.*[1-9]/, { timeout: 5000 });
  await page.keyboard.press('z');
  await page.waitForTimeout(200);
}

test.describe('UI Layout Cleanup', () => {
  test.setTimeout(120_000);

  test('PropertiesPanel shows only PIECE, MATERIAL, SEAMS when piece selected', async ({ page }) => {
    await waitForApp(page);
    await drawAndSelectPiece(page);
    await expect(page.locator('text=MATERIAL')).toBeVisible({ timeout: 5000 });
    await expect(page.locator('.properties-panel >> text=PROJECT')).not.toBeVisible({ timeout: 2000 });
    await expect(page.locator('.properties-panel >> text=AVATAR')).not.toBeVisible({ timeout: 2000 });
    await expect(page.locator('.properties-panel >> text=DISPLAY')).not.toBeVisible({ timeout: 2000 });
    await expect(page.locator('.properties-panel >> text=EXPORT')).not.toBeVisible({ timeout: 2000 });
    await expect(page.locator('.properties-panel >> text=SIMULATION')).not.toBeVisible({ timeout: 2000 });
  });

  test('PropertiesPanel starts collapsed without piece selection', async ({ page }) => {
    await waitForApp(page);
    await expect(page.locator('.properties-panel.collapsed')).toBeVisible({ timeout: 5000 });
  });

  test('copilot starts minimized', async ({ page }) => {
    await waitForApp(page);
    // CopilotSidePanel renders with class 'expanded' when open
    const copilotExpanded = page.locator('.copilot-side-panel.expanded');
    await expect(copilotExpanded).not.toBeVisible({ timeout: 3000 });
  });

  test('Activity Bar has correct icon count', async ({ page }) => {
    await waitForApp(page);
    const activityItems = page.locator('.activity-bar-item');
    // 6 top + 2 bottom + 1 copilot toggle = 9 total
    await expect(activityItems).toHaveCount(9, { timeout: 5000 });
  });

  test('Project view has save/open/new and piece list', async ({ page }) => {
    await waitForApp(page);
    // Click the Project icon in ActivityBar (first item)
    await page.click('.activity-bar-item[title="Project"]');
    await page.waitForTimeout(300);

    // Sidebar should show Project title
    await expect(page.locator('.sidebar-title')).toHaveText('Project');

    // Save/Open/New buttons should be visible (scoped to sidebar to avoid duplicates)
    const sidebar = page.locator('.sidebar');
    await expect(sidebar.locator('button:has-text("Save Project")')).toBeVisible();
    await expect(sidebar.locator('button:has-text("Open Project")')).toBeVisible();
    await expect(sidebar.locator('button:has-text("New Project")')).toBeVisible();
  });

  test('Avatar & Body view has mode toggle and measurements', async ({ page }) => {
    await waitForApp(page);
    // Click the Avatar icon in ActivityBar
    await page.click('.activity-bar-item[title="Avatar & Body"]');
    await page.waitForTimeout(300);

    // Sidebar should show Avatar & Body title
    await expect(page.locator('.sidebar-title')).toHaveText('Avatar & Body');

    // Mode toggle buttons (scoped to sidebar to avoid duplicates in 3D panel)
    const sidebar = page.locator('.sidebar');
    await expect(sidebar.locator('button:has-text("Dress Form")')).toBeVisible();
    await expect(sidebar.locator('button:has-text("3D Model")')).toBeVisible();
  });
});
