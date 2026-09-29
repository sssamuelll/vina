import { test, expect, Page } from '@playwright/test';

/**
 * maria-197 — "cuando tengo una línea recta en un rectángulo, ¿cómo la hago
 * curva? No encuentro herramienta para eso".
 *
 * El verbo `convertSegment` existía desde siempre, pero solo se alcanzaba con
 * clic derecho DENTRO de "Editar patrón": había que saber entrar al modo nodo
 * primero. Este spec recorre su flujo real — dibuja un rectángulo, clic derecho
 * sobre un lado, elige la opción — sin tocar el modo de edición en ningún
 * momento, y comprueba que el lado quedó convertido en curva de verdad.
 */

interface StoreWindow {
  __VINA_STORE__: {
    getState: () => {
      tools: { activeTool2D: string };
      project: { pieces: Array<{ outline: Array<{ type: string; values: number[] }> }> };
    };
    dispatch: (a: unknown) => void;
  };
}

async function waitForApp(page: Page) {
  await page.goto('/app/');
  await page.waitForSelector('svg.pattern-svg', { timeout: 15000 });
  await page.waitForTimeout(500);
}

async function activateTool(page: Page, shortcut: string, toolId: string) {
  await page.keyboard.press(shortcut);
  await expect
    .poll(() => page.evaluate(() => (window as unknown as StoreWindow).__VINA_STORE__.getState().tools.activeTool2D), { timeout: 2000 })
    .toBe(toolId);
  await page.locator('[data-testid="empty-state-2d"]').waitFor({ state: 'detached', timeout: 2000 }).catch(() => {});
  await page.waitForTimeout(100);
}

const outlineTypes = (page: Page) =>
  page.evaluate(() =>
    (window as unknown as StoreWindow).__VINA_STORE__.getState().project.pieces[0].outline.map(c => c.type));

test.describe('maria-197 — convertir un lado recto en curva', () => {
  test.setTimeout(120_000);

  test('el clic derecho sobre un lado ofrece convertirlo, sin entrar a editar nodos', async ({ page }) => {
    await waitForApp(page);

    // ── Su flujo: dibuja un rectángulo con la herramienta rectángulo ───────
    await activateTool(page, 's', 'rectangle');
    const svg = page.locator('svg.pattern-svg');
    const box = await svg.boundingBox();
    if (!box) throw new Error('no pattern svg');
    const cx = box.x + box.width / 2;
    const cy = box.y + box.height / 2;

    const left = cx - 170, right = cx + 170, top = cy - 95, bottom = cy + 95;
    await page.mouse.move(left, top);
    await page.mouse.down();
    await page.mouse.move(right, bottom, { steps: 12 });
    await page.mouse.up();
    await page.waitForTimeout(500);

    // Cuatro lados rectos, ninguna curva.
    expect(await outlineTypes(page)).not.toContain('C');

    // ── Clic derecho SOBRE el lado superior. Sin pasar por "Editar patrón" ──
    await page.mouse.click(cx, top, { button: 'right' });
    await page.waitForTimeout(300);

    const item = page.getByText('Convertir en curva', { exact: true });
    await expect(item).toBeVisible();

    await item.click();
    await page.waitForTimeout(400);

    // ── El lado es una curva de verdad, no solo un menú que se cerró ───────
    const after = await outlineTypes(page);
    expect(after).toContain('C');
    // Sigue siendo la misma pieza cerrada de cuatro lados.
    expect(after.filter(t => t === 'M')).toHaveLength(1);
    expect(after.filter(t => t === 'L' || t === 'C')).toHaveLength(3);
  });

  test('el clic derecho lejos del contorno no ofrece la opción', async ({ page }) => {
    await waitForApp(page);

    await activateTool(page, 's', 'rectangle');
    const svg = page.locator('svg.pattern-svg');
    const box = await svg.boundingBox();
    if (!box) throw new Error('no pattern svg');
    const cx = box.x + box.width / 2;
    const cy = box.y + box.height / 2;

    await page.mouse.move(cx - 170, cy - 95);
    await page.mouse.down();
    await page.mouse.move(cx + 170, cy + 95, { steps: 12 });
    await page.mouse.up();
    await page.waitForTimeout(500);

    // El centro de la pieza está a ~95px de cualquier lado: hay pieza bajo el
    // cursor, pero ningún segmento. El ítem se OCULTA (§4 hide-not-disable).
    await page.mouse.click(cx, cy, { button: 'right' });
    await page.waitForTimeout(300);

    await expect(page.getByText('Convertir en curva', { exact: true })).toHaveCount(0);
    // Y el menú sí abrió — la ausencia es del ítem, no del menú entero.
    await expect(page.getByText('Duplicar', { exact: true }).first()).toBeVisible();
  });
});
