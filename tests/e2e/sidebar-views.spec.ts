import { test, expect, Page } from '@playwright/test';

async function clickActivityBarItem(page: Page, title: string) {
  await page.click(`.activity-bar-item[aria-label="${title}"]`);
  await page.waitForTimeout(300);
}

test.describe('Pattern Explorer', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('svg.pattern-svg', { timeout: 10000 });
  });

  test('shows empty state', async ({ page }) => {
    await clickActivityBarItem(page, 'Pattern Explorer');
    await expect(page.locator('text=PIECES')).toBeVisible();
    await expect(page.locator('text=SEAMS')).toBeVisible();
  });

  test('shows piece after drawing', async ({ page }) => {
    // Draw rect ('s' = Rectangle)
    await page.keyboard.press('s');
    const svg = page.locator('svg.pattern-svg');
    const box = await svg.boundingBox();
    if (!box) throw new Error('no svg');
    await page.mouse.move(box.x + box.width / 2 - 50, box.y + box.height / 2 - 50);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width / 2 + 50, box.y + box.height / 2 + 50, { steps: 10 });
    await page.mouse.up();
    await page.waitForTimeout(500);

    await clickActivityBarItem(page, 'Pattern Explorer');
    await expect(page.locator('text=(1)')).toBeVisible();
  });
});

test.describe('Measurements View', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('svg.pattern-svg', { timeout: 10000 });
  });

  test('opens measurements sidebar', async ({ page }) => {
    await clickActivityBarItem(page, 'Measurements');
    await expect(page.locator('text=MEASUREMENTS')).toBeVisible();
  });

  test('shows height field', async ({ page }) => {
    await clickActivityBarItem(page, 'Measurements');
    await expect(page.locator('text=/height|Height|Altura/i')).toBeVisible();
  });
});

test.describe('Grading View', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('svg.pattern-svg', { timeout: 10000 });
  });

  test('opens grading sidebar', async ({ page }) => {
    await clickActivityBarItem(page, 'Grading');
    await expect(page.locator('text=GRADING')).toBeVisible();
  });
});

test.describe('Nesting View', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('svg.pattern-svg', { timeout: 10000 });
  });

  test('opens nesting sidebar', async ({ page }) => {
    await clickActivityBarItem(page, 'Nesting');
    await expect(page.locator('text=NESTING')).toBeVisible();
  });
});

test.describe('File Explorer', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('svg.pattern-svg', { timeout: 10000 });
  });

  test('opens file explorer sidebar', async ({ page }) => {
    await clickActivityBarItem(page, 'Files');
    await expect(page.locator('text=/FILES|File/i')).toBeVisible();
  });
});

test.describe('Settings View', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('svg.pattern-svg', { timeout: 10000 });
  });

  test('opens settings sidebar', async ({ page }) => {
    await clickActivityBarItem(page, 'Settings');
    await expect(page.locator('text=SETTINGS')).toBeVisible();
  });
});

test.describe('Pose Editor View', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('svg.pattern-svg', { timeout: 10000 });
  });

  test('opens pose editor sidebar', async ({ page }) => {
    await clickActivityBarItem(page, 'Pose Editor');
    await expect(page.locator('text=/POSE|Pose/i')).toBeVisible();
  });

  test('shows pose presets', async ({ page }) => {
    await clickActivityBarItem(page, 'Pose Editor');
    await expect(page.locator('text=A-pose')).toBeVisible();
    await expect(page.locator('text=T-pose')).toBeVisible();
  });
});
