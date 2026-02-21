import { test, expect } from '@playwright/test';

test.describe('Simulation Panel', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('svg.pattern-svg', { timeout: 10000 });
  });

  test('ActivityBar shows simulation icon', async ({ page }) => {
    const simIcon = page.locator('.activity-bar-item[title="Simulation"]');
    await expect(simIcon).toBeVisible();
  });

  test('clicking simulation icon opens SimulationView', async ({ page }) => {
    await page.click('.activity-bar-item[title="Simulation"]');
    await expect(page.locator('text=Start Simulation')).toBeVisible();
    await expect(page.locator('text=IDLE')).toBeVisible();
  });

  test('particle distance slider defaults to 5mm', async ({ page }) => {
    await page.click('.activity-bar-item[title="Simulation"]');
    const slider = page.locator('input[type="range"]');
    await expect(slider).toBeVisible();
    await expect(slider).toHaveValue('5');
    await expect(page.locator('text=5mm')).toBeVisible();
  });

  test('particle distance slider is adjustable', async ({ page }) => {
    await page.click('.activity-bar-item[title="Simulation"]');
    const slider = page.locator('input[type="range"]');
    await slider.fill('3');
    await expect(page.locator('text=3mm')).toBeVisible();
  });

  test('Start Simulation disabled without pieces', async ({ page }) => {
    await page.click('.activity-bar-item[title="Simulation"]');
    const btn = page.locator('button:has-text("Start Simulation")');
    await expect(btn).toBeDisabled();
  });

  test('can start simulation with a piece', async ({ page }) => {
    // Draw rectangle
    await page.keyboard.press('r');
    const svg = page.locator('svg.pattern-svg');
    const box = await svg.boundingBox();
    if (!box) throw new Error('no svg');
    const cx = box.x + box.width / 2;
    const cy = box.y + box.height / 2;
    await page.mouse.move(cx - 80, cy - 60);
    await page.mouse.down();
    await page.mouse.move(cx + 80, cy + 60, { steps: 10 });
    await page.mouse.up();
    await page.waitForTimeout(500);

    // Open sim panel and start
    await page.click('.activity-bar-item[title="Simulation"]');
    const btn = page.locator('button:has-text("Start Simulation")');
    await expect(btn).toBeEnabled();
    await btn.click();

    // Should switch to running
    await expect(page.locator('text=SIMULATING')).toBeVisible({ timeout: 5000 });
    await expect(page.locator('button:has-text("Pause")')).toBeVisible();
  });

  test('can pause and reset simulation', async ({ page }) => {
    // Draw rect + start sim
    await page.keyboard.press('r');
    const svg = page.locator('svg.pattern-svg');
    const box = await svg.boundingBox();
    if (!box) throw new Error('no svg');
    await page.mouse.move(box.x + box.width / 2 - 80, box.y + box.height / 2 - 60);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width / 2 + 80, box.y + box.height / 2 + 60, { steps: 10 });
    await page.mouse.up();
    await page.waitForTimeout(500);

    await page.click('.activity-bar-item[title="Simulation"]');
    await page.click('button:has-text("Start Simulation")');
    await expect(page.locator('text=SIMULATING')).toBeVisible({ timeout: 5000 });

    // Pause
    await page.click('button:has-text("Pause")');
    await expect(page.locator('text=PAUSED')).toBeVisible();

    // Reset
    await page.click('button:has-text("Reset")');
    await expect(page.locator('text=IDLE')).toBeVisible();
  });
});

// ─── Avatar / 3D View ───────────────────────────────────────────────────────

test.describe('Avatar & 3D View', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('svg.pattern-svg', { timeout: 10000 });
  });

  test('ActivityBar shows avatar icon', async ({ page }) => {
    await expect(page.locator('.activity-bar-item[title="Avatar"]')).toBeVisible();
  });

  test('3D view renders a canvas', async ({ page }) => {
    await page.click('button:has-text("3D")');
    await page.waitForTimeout(2000);
    await expect(page.locator('canvas')).toBeVisible();
  });

  test.skip('avatar in A-pose (visual regression)', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('svg.pattern-svg', { timeout: 10000 });
    await page.click('button:has-text("3D")');
    await page.waitForTimeout(3000);
    await expect(page).toHaveScreenshot('avatar-a-pose.png', {
      clip: { x: 330, y: 0, width: 700, height: 800 },
    });
  });
});
