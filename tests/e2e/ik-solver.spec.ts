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

  // Click the avatar tool button in Toolbar3D to open the AvatarPanel
  const avatarBtn = page.locator('button[data-tool-id="avatar"]');
  await avatarBtn.click({ force: true });
  await page.waitForTimeout(500);

  // AvatarPanel should now show "Avatar & Pose" heading
  await expect(page.locator('h3:has-text("Avatar & Pose")')).toBeVisible({ timeout: 5000 });

  // Expand Pose section if collapsed
  const poseHeader = page.locator('.avatar-panel button:has-text("Pose")');
  if (await poseHeader.isVisible({ timeout: 3000 }).catch(() => false)) {
    await poseHeader.click({ force: true });
    await page.waitForTimeout(300);
  }
}

test.describe('IK Solver', () => {
  test.setTimeout(120_000);

  test('IK toggle button appears in avatar panel pose section', async ({ page }) => {
    await waitForApp(page);
    await openAvatarPanel(page);

    // IK toggle button should exist in the Pose section
    const ikToggle = page.locator('.ik-toggle-btn');
    await expect(ikToggle).toBeVisible({ timeout: 3000 });
  });

  test('IK toggle button switches between FK and IK mode text', async ({ page }) => {
    await waitForApp(page);
    await openAvatarPanel(page);

    const ikToggle = page.locator('.ik-toggle-btn');
    await expect(ikToggle).toBeVisible({ timeout: 3000 });

    // Starts as FK Mode
    await expect(ikToggle).toHaveText('FK Mode');

    // Click to enable IK (force: canvas overlaps in 3D view)
    await ikToggle.click({ force: true });
    await page.waitForTimeout(300);
    await expect(ikToggle).toHaveText('IK Mode');
    await expect(ikToggle).toHaveClass(/active/);

    // Click to disable IK
    await ikToggle.click({ force: true });
    await page.waitForTimeout(300);
    await expect(ikToggle).toHaveText('FK Mode');
  });
});
