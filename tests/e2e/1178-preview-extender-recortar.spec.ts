/**
 * #1178 — Extender/Recortar no pintaba absolutamente nada en toda su vida.
 * `previewOutline` se calculaba y no tenía un solo consumidor en `renderers/`.
 *
 * Este spec verifica lo que un test de hook en jsdom no puede: que el
 * preview LLEGA A PANTALLA de verdad — un `<path>` nuevo aparece en el SVG
 * del lienzo al armar el gesto, y desaparece al confirmarlo o cancelarlo.
 */
import { test, expect, Page } from '@playwright/test';
import { addPiece, activarHerramienta, clickAt, dispatch } from './helpers/lienzo';

async function abrirApp(page: Page) {
  await page.goto('/app/');
  await page.waitForSelector('svg.pattern-svg', { timeout: 30000 });
  await page.waitForTimeout(700);
  await page.locator('.toast__dismiss').evaluateAll((bs) => bs.forEach((b) => (b as HTMLElement).click())).catch(() => {});
}

const nPreviews = (page: Page) => page.locator('svg.pattern-svg path[stroke="#8e44ad"]').count();

test.describe('#1178 — el preview de Extender/Recortar llega a pantalla', () => {
  test.setTimeout(60_000);

  test('armar el extremo pinta un preview, y confirmarlo lo quita', async ({ page }) => {
    await abrirApp(page);
    await addPiece(page, 'p1', { x: 100, y: 100 });
    await dispatch(page, 'editor/selectPiece', 'p1');
    await page.waitForTimeout(200);
    await activarHerramienta(page, 'u', 'extendTrim');

    expect(await nPreviews(page), 'el caso no se ejerce: ya había un preview antes de armar nada').toBe(0);

    // La pieza mide 200×150 en (100,100): su esquina superior derecha real es
    // (300,100), no el punto medio del borde — `findNearestEndpoint` solo
    // engancha vértices.
    await clickAt(page, { x: 300, y: 100 }); // esquina superior derecha
    expect(await nPreviews(page), 'armar el extremo no pintó ningún preview').toBeGreaterThan(0);

    await clickAt(page, { x: 300, y: 100 }); // confirma
    await page.waitForTimeout(200);
    expect(await nPreviews(page), 'el preview se quedó pintado tras confirmar').toBe(0);
  });

  test('Escape cancela el gesto y también quita el preview', async ({ page }) => {
    await abrirApp(page);
    await addPiece(page, 'p1', { x: 100, y: 100 });
    await dispatch(page, 'editor/selectPiece', 'p1');
    await page.waitForTimeout(200);
    await activarHerramienta(page, 'u', 'extendTrim');

    await clickAt(page, { x: 300, y: 100 }); // esquina superior derecha
    expect(await nPreviews(page)).toBeGreaterThan(0);

    await page.keyboard.press('Escape');
    await page.waitForTimeout(200);
    expect(await nPreviews(page), 'Escape no quitó el preview').toBe(0);
  });
});
