import { test, expect, Page } from '@playwright/test';

/**
 * E2E tests for per-piece freeze feature (PR #305, issue #302).
 *
 * Verifies:
 * 1. Freeze UI controls appear in simulation panel
 * 2. Simulation runs with a piece frozen — no errors
 * 3. Frozen piece stays static while others drape
 * 4. Unfreezing resumes simulation for that piece
 * 5. Toggle freeze mid-simulation without restart
 *
 * Note: Playwright headless Chromium uses SwiftShader (no WebGPU),
 * so freeze (GPU-only) falls back to WASM/CPU where freeze isn't
 * supported. Tests verify UI controls and no-crash behavior.
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

test.describe('Per-Piece Freeze (issue #302)', () => {
  test.setTimeout(120_000);

  test('freeze UI controls visible with a piece', async ({ page }) => {
    await waitForApp(page);
    await drawRectanglePiece(page);
    await openSimPanel(page);

    // "Freeze Pieces" label should be visible
    await expect(page.locator('text=Freeze Pieces')).toBeVisible({ timeout: 5000 });

    // Should see a checkbox with the piece name
    const freezeCheckbox = page.locator('label:has-text("Rect") input[type="checkbox"]').first();
    await expect(freezeCheckbox).toBeVisible();

    // Should not be checked by default
    expect(await freezeCheckbox.isChecked()).toBe(false);
  });

  test('freeze checkbox toggles piece frozen state', async ({ page }) => {
    await waitForApp(page);
    await drawRectanglePiece(page);
    await openSimPanel(page);

    const freezeCheckbox = page.locator('label:has-text("Rect") input[type="checkbox"]').first();

    // Check it
    await freezeCheckbox.check();
    await page.waitForTimeout(300);
    expect(await freezeCheckbox.isChecked()).toBe(true);

    // "frozen" indicator should appear
    await expect(page.locator('text=frozen')).toBeVisible();

    // Uncheck it
    await freezeCheckbox.uncheck();
    await page.waitForTimeout(300);
    expect(await freezeCheckbox.isChecked()).toBe(false);
  });

  test('simulation runs with frozen piece — no errors', async ({ page }) => {
    const errors: string[] = [];
    page.on('console', msg => {
      if (msg.type() === 'error') errors.push(msg.text());
    });

    await waitForApp(page);
    await drawRectanglePiece(page);
    await openSimPanel(page);

    // Freeze the piece
    const freezeCheckbox = page.locator('label:has-text("Rect") input[type="checkbox"]').first();
    await freezeCheckbox.check();

    // Start simulation
    await clickSimulate(page);
    await expect(page.locator('text=SIMULATING').first()).toBeVisible({ timeout: 15000 });

    // Let simulation run with frozen piece
    await page.waitForTimeout(5000);

    // Should still be simulating
    const stillSimulating = await page.locator('text=SIMULATING').first().isVisible();
    const paused = await page.locator('text=PAUSED').first().isVisible();
    expect(stillSimulating || paused).toBe(true);

    // No freeze-related errors
    const freezeErrors = errors.filter(e =>
      e.includes('freezePieces') ||
      e.includes('invMass') ||
      e.includes('pieceVertexRanges') ||
      e.includes('Failed to fetch dynamically imported module')
    );
    expect(freezeErrors).toHaveLength(0);
  });

  test('toggle freeze mid-simulation without restart', async ({ page }) => {
    const errors: string[] = [];
    page.on('console', msg => {
      if (msg.type() === 'error') errors.push(msg.text());
    });

    await waitForApp(page);
    await drawRectanglePiece(page);
    await openSimPanel(page);

    // Start simulation without freeze
    await clickSimulate(page);
    await expect(page.locator('text=SIMULATING').first()).toBeVisible({ timeout: 15000 });
    await page.waitForTimeout(2000);

    // Freeze mid-simulation
    const freezeCheckbox = page.locator('label:has-text("Rect") input[type="checkbox"]').first();
    await freezeCheckbox.check();
    await page.waitForTimeout(2000);

    // Should still be simulating (not restarted)
    await expect(page.locator('text=SIMULATING').first()).toBeVisible();

    // Unfreeze mid-simulation
    await freezeCheckbox.uncheck();
    await page.waitForTimeout(2000);

    // Still simulating
    await expect(page.locator('text=SIMULATING').first()).toBeVisible();

    // No errors from toggling
    const freezeErrors = errors.filter(e =>
      e.includes('freezePieces') ||
      e.includes('invMass')
    );
    expect(freezeErrors).toHaveLength(0);
  });

  test('frozen piece Redux state updates correctly', async ({ page }) => {
    await waitForApp(page);
    await drawRectanglePiece(page);
    await openSimPanel(page);

    // Check initial state
    const state0 = await page.evaluate(() => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const store = (window as any).__REDUX_STORE__;
      if (!store) return null;
      return store.getState().simulation.frozenPieceIds;
    });

    if (!state0) {
      test.skip(true, 'Redux store not exposed');
      return;
    }

    expect(state0).toEqual([]);

    // Freeze the piece
    const freezeCheckbox = page.locator('label:has-text("Rect") input[type="checkbox"]').first();
    await freezeCheckbox.check();
    await page.waitForTimeout(300);

    const state1 = await page.evaluate(() => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return (window as any).__REDUX_STORE__?.getState().simulation.frozenPieceIds;
    });
    expect(state1.length).toBe(1);

    // Unfreeze
    await freezeCheckbox.uncheck();
    await page.waitForTimeout(300);

    const state2 = await page.evaluate(() => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return (window as any).__REDUX_STORE__?.getState().simulation.frozenPieceIds;
    });
    expect(state2).toEqual([]);
  });
});
