import { test, expect, Page } from '@playwright/test';

async function waitForApp(page: Page) {
  await page.goto('/');
  await page.waitForSelector('svg.pattern-svg', { timeout: 15000 });
  await page.waitForTimeout(1000);
}

async function openAvatarPanel(page: Page) {
  // Switch to 3D view
  await page.click('button:has-text("3D")');
  await page.waitForTimeout(2000);

  // Click the Avatar affordance in the RightDock to open the AvatarPanel.
  // (Toolbar3D, which owned the old data-tool-id button, was deleted 2026-06-04;
  // the 3D-side dock now hosts Arrange/Sew/Simulate/Avatar.)
  const avatarBtn = page.locator('button[aria-label="Avatar"]');
  await avatarBtn.click({ force: true });
  await page.waitForTimeout(500);

  await expect(page.locator('.context-panel__header >> text=Avatar')).toBeVisible({ timeout: 5000 });
}

test.describe('Morph Weights (#271)', () => {
  test.setTimeout(120_000);

  test('measurement sliders are visible in avatar panel', async ({ page }) => {
    await waitForApp(page);
    await openAvatarPanel(page);

    // Verify measurement sliders exist (scoped to avatar panel to avoid template library matches)
    const panel = page.locator('.avatar-panel');
    await expect(panel.locator('text=Estatura')).toBeVisible({ timeout: 3000 });
    await expect(panel.locator('text=Pecho')).toBeVisible({ timeout: 3000 });
    await expect(panel.locator('text=Cintura')).toBeVisible({ timeout: 3000 });
  });

  test('changing measurements produces no console errors', async ({ page }) => {
    const errors: string[] = [];
    page.on('console', msg => {
      if (msg.type() === 'error') errors.push(msg.text());
    });

    await waitForApp(page);
    await openAvatarPanel(page);

    // Change chest measurement via Redux store dispatch
    await page.evaluate(() => {
      const store = (window as unknown as Record<string, unknown>).__VINA_STORE__ as {
        dispatch: (action: { type: string; payload: Record<string, number> }) => void;
      };
      if (store) {
        store.dispatch({
          type: 'project/updateMeasurements',
          payload: { chest: 110, waist: 90 },
        });
      }
    });

    await page.waitForTimeout(2000);

    const relevantErrors = errors.filter(e =>
      e.includes('morphTarget') ||
      e.includes('Cannot read properties') ||
      e.includes('collision')
    );
    expect(relevantErrors).toHaveLength(0);
  });

  test('morph target state is accessible via Redux store', async ({ page }) => {
    await waitForApp(page);

    // Verify avatar slice has morph target fields
    const state = await page.evaluate(() => {
      const store = (window as unknown as Record<string, unknown>).__VINA_STORE__ as {
        getState: () => { avatar: { morphTargets: Record<string, number>; availableMorphTargets: string[] } };
      };
      if (!store) return null;
      const s = store.getState();
      return {
        morphTargets: s.avatar.morphTargets,
        availableMorphTargets: s.avatar.availableMorphTargets,
      };
    });

    expect(state).not.toBeNull();
    expect(state!.morphTargets).toBeDefined();
    expect(state!.availableMorphTargets).toBeDefined();
    expect(typeof state!.morphTargets).toBe('object');
    expect(Array.isArray(state!.availableMorphTargets)).toBe(true);
  });
});
