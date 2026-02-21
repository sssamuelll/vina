import { test, expect } from '@playwright/test';

test.describe('Template Library', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('svg.pattern-svg', { timeout: 10000 });
  });

  test('opens via Templates button in toolbar', async ({ page }) => {
    await page.click('.template-btn');
    await expect(page.locator('.template-library')).toBeVisible();
    await expect(page.locator('.template-header h2')).toHaveText('Pattern Templates');
  });

  test('shows avatar measurement summary', async ({ page }) => {
    await page.click('.template-btn');
    await expect(page.locator('.template-subtitle')).toContainText('chest');
    await expect(page.locator('.template-subtitle')).toContainText('waist');
    await expect(page.locator('.template-subtitle')).toContainText('hips');
  });

  test('displays template cards', async ({ page }) => {
    await page.click('.template-btn');
    const cards = page.locator('.template-card');
    expect(await cards.count()).toBeGreaterThan(0);
  });

  test('each card has name and description', async ({ page }) => {
    await page.click('.template-btn');
    const firstCard = page.locator('.template-card').first();
    await expect(firstCard.locator('.template-name')).toBeVisible();
    await expect(firstCard.locator('.template-desc')).toBeVisible();
  });

  test('clicking a template adds pieces and closes', async ({ page }) => {
    await page.click('.template-btn');
    const firstCard = page.locator('.template-card').first();
    await firstCard.click();
    await page.waitForTimeout(500);

    // Library should close
    await expect(page.locator('.template-library')).not.toBeVisible();

    // Pieces should have been added
    await expect(page.locator('.status-bar')).not.toContainText('Pieces: 0');
  });

  test('closes via ✕ button', async ({ page }) => {
    await page.click('.template-btn');
    await page.click('.template-close');
    await expect(page.locator('.template-overlay')).not.toHaveClass(/open/);
  });

  test('closes by clicking overlay background', async ({ page }) => {
    await page.click('.template-btn');
    await page.locator('.template-overlay').click({ position: { x: 5, y: 5 } });
    await page.waitForTimeout(300);
    await expect(page.locator('.template-overlay')).not.toHaveClass(/open/);
  });
});
