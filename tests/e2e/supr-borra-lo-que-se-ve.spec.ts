/**
 * Revisión adversarial de UI del 2026-09-04 — los tres fallos de borrado
 * reproducidos en el navegador (issue #1115).
 *
 * Estos NO se pueden probar en jsdom, y no por el apilamiento sino por el
 * ORDEN DE LOS LISTENERS: el atajo global escucha en `document` en burbuja
 * (ShortcutProvider.tsx:84) y el manejador local de la línea interna en
 * `window` en burbuja (useEditorInteractions.ts:443), o sea después. Quién
 * gana la tecla solo se ve con una tecla de verdad.
 *
 *   A) Seleccionar + línea interna elegida → Supr borró LA PIEZA (2 → 1)
 *   B) Pieza bloqueada → Supr la borró (1 → 0)
 *   C) Menú Edición ▸ Eliminar en Coser → borra la pieza (LogoMenu.tsx:89-93
 *      reimplementa el borrado sin la regla de #1094)
 *
 * Ver docs/reports/2026-09-04-revision-adversarial-ui.md § 4.
 */
import { test, expect, Page } from '@playwright/test';
import { dispatch, st } from './helpers/lienzo';

const RECT = (id: string, x: number, y: number, extra: Record<string, unknown> = {}) => ({
  id, name: id,
  outline: [
    { type: 'M', values: [0, 0] }, { type: 'L', values: [200, 0] },
    { type: 'L', values: [200, 150] }, { type: 'L', values: [0, 150] }, { type: 'Z', values: [] },
  ],
  internals: [], position: { x, y }, rotation: 0, mirrored: false,
  seamAllowance: 0, layer: 1, sublayer: 0, active: true, createdAt: 1, updatedAt: 1,
  ...extra,
});

async function abrirApp(page: Page) {
  await page.goto('/');
  await page.waitForSelector('svg.pattern-svg', { timeout: 30000 });
  await page.waitForTimeout(700);
  await page.locator('.toast__dismiss').evaluateAll((bs) => bs.forEach((b) => (b as HTMLElement).click())).catch(() => {});
}

/** Supr con el ratón fuera de todo campo de texto, como lo pulsa María. */
async function pulsarSupr(page: Page) {
  await page.mouse.move(700, 620);
  await page.keyboard.press('Delete');
  await page.waitForTimeout(500);
}

const nPiezas = async (page: Page) => (await st(page)).project.pieces.length;

test.describe('#1115 — Supr borra lo que se ve', () => {
  test.setTimeout(90_000);

  test('A · una línea interna seleccionada se borra ella, no su pieza', async ({ page }) => {
    await abrirApp(page);
    await dispatch(page, 'project/addPiece', RECT('p1', 100, 100));
    await dispatch(page, 'project/addPiece', RECT('p2', 400, 100));
    await dispatch(page, 'project/addInternalLine', {
      pieceId: 'p1',
      line: { id: 'L1', type: 'internal', path: [{ type: 'M', values: [20, 20] }, { type: 'L', values: [180, 20] }] },
    });
    await page.waitForTimeout(300);
    await dispatch(page, 'editor/selectInternalLine', { pieceId: 'p1', lineId: 'L1' });
    await page.waitForTimeout(300);

    expect(await nPiezas(page)).toBe(2);
    await pulsarSupr(page);

    const s = await st(page);
    const p1 = s.project.pieces.find((p) => p.id === 'p1');
    expect(s.project.pieces.length, 'Supr se llevó la pieza entera').toBe(2);
    expect(p1, 'la pieza anfitriona desapareció').toBeDefined();
    expect((p1 as unknown as { internals: unknown[] }).internals.length, 'la línea interna sigue ahí').toBe(0);
  });

  test('B · una pieza bloqueada no se borra con Supr', async ({ page }) => {
    await abrirApp(page);
    await dispatch(page, 'project/addPiece', RECT('pA', 100, 100, { locked: true }));
    await page.waitForTimeout(300);
    await dispatch(page, 'editor/selectPiece', 'pA');
    await page.waitForTimeout(300);

    expect((await st(page)).editor.selectedPieceIds, 'no quedó seleccionada, el caso no se ejerce').toContain('pA');
    await pulsarSupr(page);

    expect(await nPiezas(page), 'el candado no protegió del borrado').toBe(1);
  });

  test('B2 · y el candado no bloquea el borrado de una pieza libre a su lado', async ({ page }) => {
    // La red contra el arreglo perezoso: "no borres nunca" también pasaría B.
    await abrirApp(page);
    await dispatch(page, 'project/addPiece', RECT('pA', 100, 100, { locked: true }));
    await dispatch(page, 'project/addPiece', RECT('pB', 400, 100));
    await page.waitForTimeout(300);
    await dispatch(page, 'editor/selectPiece', 'pB');
    await page.waitForTimeout(300);
    await pulsarSupr(page);

    const s = await st(page);
    expect(s.project.pieces.map((p) => p.id)).toEqual(['pA']);
  });

  test('C · el menú Edición ▸ Eliminar obedece la misma regla que la tecla', async ({ page }) => {
    await abrirApp(page);
    await dispatch(page, 'project/addPiece', RECT('p1', 100, 100));
    await dispatch(page, 'project/addPiece', RECT('p2', 400, 100));
    await page.waitForTimeout(300);
    await dispatch(page, 'editor/selectPiece', 'p1');
    await page.waitForTimeout(200);
    // Entrar al menú de costuras por la puerta real (el atajo), que es la que
    // deja `editor.activeTool` y `tools.activeTool2D` en su sitio.
    await page.keyboard.press('n');
    await expect.poll(async () => (await st(page)).editor.activeTool, { timeout: 5000 }).toBe('seam');
    await page.waitForTimeout(300);

    const menu = page.locator('.logo-menu__trigger, .top-bar .logo-menu, [aria-label="Menú de la aplicación"]').first();
    await menu.click();
    await page.locator('.logo-menu').waitFor({ timeout: 8000 });
    await page.getByText('Edición', { exact: true }).first().hover();
    await page.waitForTimeout(400);
    await page.locator('.logo-menu__submenu').getByText(/^Eliminar$/).first().click();
    await page.waitForTimeout(600);

    expect(await nPiezas(page), 'el menú borró la pieza estando en Coser (#1094 por la otra puerta)').toBe(2);
  });

  test('C2 · pero el menú sigue borrando cuando de verdad toca', async ({ page }) => {
    await abrirApp(page);
    await dispatch(page, 'project/addPiece', RECT('p1', 100, 100));
    await dispatch(page, 'project/addPiece', RECT('p2', 400, 100));
    await page.waitForTimeout(300);
    await dispatch(page, 'editor/selectPiece', 'p1');
    await page.waitForTimeout(300);

    const menu = page.locator('.logo-menu__trigger, .top-bar .logo-menu, [aria-label="Menú de la aplicación"]').first();
    await menu.click();
    await page.locator('.logo-menu').waitFor({ timeout: 8000 });
    await page.getByText('Edición', { exact: true }).first().hover();
    await page.waitForTimeout(400);
    await page.locator('.logo-menu__submenu').getByText(/^Eliminar$/).first().click();
    await page.waitForTimeout(600);

    const s = await st(page);
    expect(s.project.pieces.map((p) => p.id)).toEqual(['p2']);
  });
});
