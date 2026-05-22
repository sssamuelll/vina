import { test, expect } from '@playwright/test';

// ─── App Bootstrap ──────────────────────────────────────────────────────────

test.describe('App loads correctly', () => {
  test('renders workspace with all major regions', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('svg.pattern-svg', { timeout: 10000 });

    // Title bar
    await expect(page.locator('.workspace-logo')).toHaveText('OpenClo');

    // Activity bar
    await expect(page.locator('.activity-bar-item[aria-label="Project"]')).toBeVisible();
    await expect(page.locator('.activity-bar-item[aria-label="Simulation"]')).toBeVisible();
    await expect(page.locator('.activity-bar-item[aria-label="Avatar & Body"]')).toBeVisible();

    // Pattern editor
    await expect(page.locator('svg.pattern-svg')).toBeVisible();

    // Status bar
    await expect(page.locator('.status-bar')).toBeVisible();
  });

  test('default view mode is split', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('svg.pattern-svg', { timeout: 10000 });
    // Both SVG and canvas should be visible in split mode
    await expect(page.locator('svg.pattern-svg')).toBeVisible();
    await expect(page.locator('canvas')).toBeVisible();
  });
});

// ─── View Mode Switching ────────────────────────────────────────────────────

test.describe('View mode switching', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('svg.pattern-svg', { timeout: 10000 });
  });

  test('2D mode hides 3D viewport', async ({ page }) => {
    await page.click('button:has-text("2D")');
    await page.waitForTimeout(400);
    await expect(page.locator('svg.pattern-svg')).toBeVisible();
    // 3D viewport should be collapsed (width 0%)
    const viewport3d = page.locator('.viewport-3d');
    await expect(viewport3d).toHaveClass(/viewport-collapsed/);
  });

  test('3D mode hides 2D viewport', async ({ page }) => {
    await page.click('button:has-text("3D")');
    await page.waitForTimeout(400);
    await expect(page.locator('canvas')).toBeVisible();
    const viewport2d = page.locator('.viewport-2d');
    await expect(viewport2d).toHaveClass(/viewport-collapsed/);
  });

  test('Split mode shows both', async ({ page }) => {
    await page.click('button:has-text("3D")'); // go to 3D first
    await page.waitForTimeout(300);
    await page.click('button:has-text("Split")');
    await page.waitForTimeout(400);
    await expect(page.locator('svg.pattern-svg')).toBeVisible();
    await expect(page.locator('canvas')).toBeVisible();
  });

  test('active view button is highlighted', async ({ page }) => {
    for (const mode of ['2D', 'Split', '3D'] as const) {
      await page.click(`button:has-text("${mode}")`);
      await page.waitForTimeout(200);
      const btn = page.locator(`.view-toggle button:has-text("${mode}")`);
      await expect(btn).toHaveClass(/active/);
    }
  });
});

// ─── Split Divider ──────────────────────────────────────────────────────────

test.describe('Split divider', () => {
  test('divider is visible in split mode', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('svg.pattern-svg', { timeout: 10000 });
    // Default should be split
    await expect(page.locator('.viewport-divider')).toBeVisible();
  });

  test('dragging divider resizes panes', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('svg.pattern-svg', { timeout: 10000 });
    const divider = page.locator('.viewport-divider');
    const box = await divider.boundingBox();
    if (!box) throw new Error('no divider');

    const startX = box.x + box.width / 2;
    const startY = box.y + box.height / 2;

    // Get initial 2D width
    const v2d = page.locator('.viewport-2d');
    const initialBox = await v2d.boundingBox();
    if (!initialBox) throw new Error('no 2d viewport');

    // Drag divider 100px to the right
    await page.mouse.move(startX, startY);
    await page.mouse.down();
    await page.mouse.move(startX + 100, startY, { steps: 5 });
    await page.mouse.up();
    await page.waitForTimeout(200);

    const newBox = await v2d.boundingBox();
    if (!newBox) throw new Error('no 2d viewport after drag');
    expect(newBox.width).toBeGreaterThan(initialBox.width);
  });
});

// ─── Sidebar ────────────────────────────────────────────────────────────────

test.describe('Sidebar', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('svg.pattern-svg', { timeout: 10000 });
  });

  test('Pattern Explorer is open by default', async ({ page }) => {
    const explorerItem = page.locator('.activity-bar-item[aria-label="Project"]');
    await expect(explorerItem).toHaveClass(/active/);
  });

  test('clicking activity bar icon toggles sidebar view', async ({ page }) => {
    // Click simulation
    await page.click('.activity-bar-item[aria-label="Simulation"]');
    await expect(page.locator('text=Start Simulation')).toBeVisible();

    // Click avatar
    await page.click('.activity-bar-item[aria-label="Avatar & Body"]');
    await page.waitForTimeout(300);
    // Simulation content should be gone
    await expect(page.locator('text=Start Simulation')).not.toBeVisible();
  });

  test('clicking active icon closes sidebar', async ({ page }) => {
    // Click explorer (already active) to close
    await page.click('.activity-bar-item[aria-label="Project"]');
    await page.waitForTimeout(300);
    // Sidebar should be closed/collapsed
    const sidebar = page.locator('.sidebar');
    // Either hidden or width is 0
    const box = await sidebar.boundingBox();
    expect(!box || box.width === 0).toBeTruthy();
  });
});

// ─── Bottom Panel ───────────────────────────────────────────────────────────

test.describe('Bottom Panel', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('svg.pattern-svg', { timeout: 10000 });
  });

  test('shows tab headers', async ({ page }) => {
    await expect(page.locator('text=Problems')).toBeVisible();
    await expect(page.locator('text=Output')).toBeVisible();
    await expect(page.locator('text=Nesting Preview')).toBeVisible();
  });

  test('Copilot tab exists', async ({ page }) => {
    await expect(page.locator('text=Copilot')).toBeVisible();
  });
});

// ─── Status Bar ─────────────────────────────────────────────────────────────

test.describe('Status Bar', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('svg.pattern-svg', { timeout: 10000 });
  });

  test('shows piece count', async ({ page }) => {
    await expect(page.locator('.status-bar')).toContainText(/Pieces.*0/);
  });

  test('piece count updates after drawing', async ({ page }) => {
    // Draw a rectangle ('s')
    await page.keyboard.press('s');
    const svg = page.locator('svg.pattern-svg');
    const box = await svg.boundingBox();
    if (!box) throw new Error('no svg');
    const cx = box.x + box.width / 2;
    const cy = box.y + box.height / 2;
    await page.mouse.move(cx - 60, cy - 40);
    await page.mouse.down();
    await page.mouse.move(cx + 60, cy + 40, { steps: 10 });
    await page.mouse.up();
    await page.waitForTimeout(500);

    await expect(page.locator('.status-bar')).toContainText(/Pieces.*1/);
  });
});
