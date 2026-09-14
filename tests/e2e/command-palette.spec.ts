import { test, expect, Page } from '@playwright/test';

/**
 * Command surface today = UnifiedBar in 'commands' mode (⌘K / Ctrl+K).
 * It replaced the old standalone CommandPalette component. Real selectors:
 *   - opening switches the bottom floating bar into commands mode and opens
 *     `.unified-bar__panel`; the shared input is `.unified-bar__input`.
 *   - each command is a <button> inside `.unified-bar__panel`; its label text
 *     comes from `COMMANDS[].name` in UnifiedBarCommands.tsx.
 *   - no-match renders the text `No commands match "<query>"`.
 *   - there is NO arrow-key navigation / selected-item highlight / fuzzy-match
 *     character highlighting / category headers in the current component, so
 *     those tests were dropped (retargeting them would have been faking UI).
 *   - there is NO toolbar trigger button, so "opens via toolbar button" was
 *     dropped.
 * Command execution is verified by store effect (view mode), since the command
 * list is view/panel/toggle commands — there is no "Rectangle Tool" command.
 */

const PANEL = '.unified-bar__panel';
const INPUT = '.unified-bar__input';
// Commands render as <button> inside the panel; scope to those.
const COMMAND_BTN = `${PANEL} button`;

async function getViewMode(page: Page): Promise<string | null> {
  return page.evaluate(() => {
    const store = (window as unknown as { __VINA_STORE__?: { getState: () => { editor: { viewMode: string } } } }).__VINA_STORE__;
    return store ? store.getState().editor.viewMode : null;
  });
}

async function setViewMode(page: Page, mode: string) {
  await page.evaluate((m) => {
    const store = (window as unknown as { __VINA_STORE__?: { dispatch: (a: unknown) => void } }).__VINA_STORE__;
    store?.dispatch({ type: 'editor/setViewMode', payload: m });
  }, mode);
}

test.describe('Command Palette (UnifiedBar commands mode)', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('svg.pattern-svg', { timeout: 10000 });
  });

  test('opens with ⌘K and focuses the input', async ({ page }) => {
    await page.keyboard.press('Meta+k');
    await expect(page.locator(PANEL)).toBeVisible();
    await expect(page.locator(INPUT)).toBeFocused();
  });

  test('opens with Ctrl+K fallback', async ({ page }) => {
    await page.keyboard.press('Control+k');
    await expect(page.locator(PANEL)).toBeVisible();
    await expect(page.locator(INPUT)).toBeFocused();
  });

  test('Escape closes the panel', async ({ page }) => {
    await page.keyboard.press('Control+k');
    await expect(page.locator(PANEL)).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.locator(PANEL)).not.toBeVisible();
  });

  test('empty query shows the full command list', async ({ page }) => {
    await page.keyboard.press('Control+k');
    await expect(page.locator(PANEL)).toBeVisible();
    // Full list — well over a handful of commands defined in UnifiedBarCommands.
    expect(await page.locator(COMMAND_BTN).count()).toBeGreaterThan(5);
  });

  test('typing filters the command list', async ({ page }) => {
    await page.keyboard.press('Control+k');
    await expect(page.locator(PANEL)).toBeVisible();
    const total = await page.locator(COMMAND_BTN).count();

    await page.locator(INPUT).fill('escalado');
    await page.waitForTimeout(200);

    const filtered = await page.locator(COMMAND_BTN).count();
    expect(filtered).toBeGreaterThan(0);
    expect(filtered).toBeLessThan(total);
    await expect(page.locator(COMMAND_BTN).first()).toContainText(/Escalado/i);
  });

  test('shows a no-match message for gibberish', async ({ page }) => {
    await page.keyboard.press('Control+k');
    await page.locator(INPUT).fill('zzzzzzzzz');
    await page.waitForTimeout(200);
    await expect(page.locator(PANEL)).toContainText(/Ningún comando coincide/i);
  });

  test('clicking a command executes it (view mode changes)', async ({ page }) => {
    await setViewMode(page, 'split');
    await page.keyboard.press('Control+k');
    await page.locator(INPUT).fill('solo 2D');
    await page.waitForTimeout(200);
    await page.locator(COMMAND_BTN).first().click();
    await page.waitForTimeout(200);

    // Panel closes after execution and the store reflects the new view mode.
    await expect(page.locator(PANEL)).not.toBeVisible();
    expect(await getViewMode(page)).toBe('2d');
  });

  test('shortcuts are displayed next to commands that have one — and only those', async ({ page }) => {
    // ENMENDADO el 2026-09-14 (#1170). Este caso usaba «cuadrícula · G» como
    // ejemplo, y ese era justamente el anuncio FALSO: `G` es la herramienta
    // Línea interna, no la cuadrícula. O sea que había un test verde
    // defendiendo el bug — María lee «cuadrícula … G», pulsa G y entra a
    // dibujar. El propósito del caso es bueno; el ejemplo era el roto.
    //
    // Ahora se mide con un comando cuyo atajo SÍ existe, y con su negativo:
    // el de la cuadrícula no puede anunciar ninguno.
    await page.keyboard.press('Control+k');
    await page.locator(INPUT).fill('deshacer');
    await page.waitForTimeout(200);
    const conAtajo = page.locator(COMMAND_BTN).first();
    await expect(conAtajo).toContainText('Deshacer');
    await expect(conAtajo, 'el atajo se pinta junto al comando que lo tiene').toContainText('Ctrl+Z');

    await page.locator(INPUT).fill('cuadrícula');
    await page.waitForTimeout(200);
    const sinAtajo = page.locator(COMMAND_BTN).first();
    await expect(sinAtajo).toContainText('cuadrícula');
    await expect(
      sinAtajo,
      'la cuadrícula no tiene atajo: anunciar `G` mandaba a la usuaria a otra herramienta',
    ).not.toContainText('G');
  });
});
