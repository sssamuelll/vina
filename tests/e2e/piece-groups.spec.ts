/**
 * E2E tests for Piece Groups feature (#267)
 *
 * Tests verify:
 * 1. Creating groups from sidebar
 * 2. Group color indicators on canvas
 * 3. Context menu group actions
 * 4. Rename, delete, expand/collapse in sidebar
 */
import { test, expect, Page } from '@playwright/test';

// ─── Helpers ────────────────────────────────────────────────────────────────

async function waitForApp(page: Page) {
  await page.goto('/');
  await page.waitForSelector('svg.pattern-svg', { timeout: 15000 });
  await page.waitForTimeout(1000);
}

async function loadTShirtTemplate(page: Page) {
  // Open template library via the toolbar button
  const templateBtn = page.locator('.template-btn');
  await templateBtn.click();
  await page.waitForTimeout(500);

  // Click the T-Shirt template card
  const tshirtCard = page.locator('.template-card').filter({ hasText: 'T-Shirt' }).first();
  await tshirtCard.click({ force: true });
  await page.waitForTimeout(3000);

  // Verify pieces were loaded
  await expect(page.locator('.status-bar')).toContainText(/Pieces:\s*[1-9]/, { timeout: 5000 });
}

async function openProjectSidebar(page: Page) {
  // Click the first activity bar item (Project/Explorer)
  const projectBtn = page.locator('.activity-bar-item').first();
  await projectBtn.click();
  await page.waitForTimeout(500);
}

// ─── Groups Sidebar ─────────────────────────────────────────────────────────

test.describe('Piece Groups', () => {
  test.beforeEach(async ({ page }) => {
    await waitForApp(page);
    await loadTShirtTemplate(page);
    await openProjectSidebar(page);
  });

  test('sidebar shows Groups section', async ({ page }) => {
    // The Groups section header should be visible in the ProjectView
    const groupsHeader = page.locator('.sidebar-section-header').filter({ hasText: 'Groups' });
    await expect(groupsHeader).toBeVisible();
  });

  test('+ New Group button creates a group', async ({ page }) => {
    // The button text is "+ New Group" (possibly with piece count suffix)
    const newGroupBtn = page.locator('button').filter({ hasText: /\+ New Group/ });
    await expect(newGroupBtn).toBeVisible();
    await newGroupBtn.click();
    await page.waitForTimeout(300);

    // A group row should appear
    const groupItem = page.locator('.group-row').first();
    await expect(groupItem).toBeVisible();
  });

  test('group shows color dot and piece count', async ({ page }) => {
    const newGroupBtn = page.locator('button').filter({ hasText: /\+ New Group/ });
    await newGroupBtn.click();
    await page.waitForTimeout(300);

    const colorDot = page.locator('.group-color-dot').first();
    await expect(colorDot).toBeVisible();

    const pieceCount = page.locator('.group-piece-count').first();
    await expect(pieceCount).toBeVisible();
  });

  test('group can be deleted', async ({ page }) => {
    const newGroupBtn = page.locator('button').filter({ hasText: /\+ New Group/ });
    await newGroupBtn.click();
    await page.waitForTimeout(300);

    // Verify the group row exists before deleting
    await expect(page.locator('.group-row')).toHaveCount(1);

    const deleteBtn = page.locator('.group-row button[title="Delete group"]').first();
    await deleteBtn.click();
    await page.waitForTimeout(300);

    const groups = page.locator('.group-row');
    await expect(groups).toHaveCount(0);
  });

  test('group can be renamed via inline edit', async ({ page }) => {
    const newGroupBtn = page.locator('button').filter({ hasText: /\+ New Group/ });
    await newGroupBtn.click();
    await page.waitForTimeout(300);

    // Click the rename (pencil) button
    const renameBtn = page.locator('.group-row button[title="Rename"]').first();
    await renameBtn.click();
    await page.waitForTimeout(200);

    const input = page.locator('.group-rename-input');
    await expect(input).toBeVisible();

    await input.fill('Bodice Set');
    await input.press('Enter');
    await page.waitForTimeout(200);

    // The group label should now show "Bodice Set"
    const groupLabel = page.locator('.group-row .sidebar-list-item-label').first();
    await expect(groupLabel).toContainText('Bodice Set');
  });

  test('context menu shows Create Group from Selection', async ({ page }) => {
    // Click directly on a pattern piece element (not arbitrary canvas coords)
    const piece = page.locator('.pattern-piece').first();
    await expect(piece).toBeVisible({ timeout: 5000 });

    // Left-click to select the piece first
    await piece.click({ force: true });
    await page.waitForTimeout(300);

    // Right-click on the piece to open context menu
    await piece.click({ button: 'right', force: true });
    await page.waitForTimeout(300);

    // The "Create Group from Selection" item should be visible
    const createGroupItem = page.locator('text=Create Group from Selection');
    await expect(createGroupItem).toBeVisible();
  });
});
