/**
 * #1097 — "ahora no puedo hacer más zoom, estoy al tope del zoom… no he
 * cogido la cúspide del triángulo" (María, 18:19). La rueda se clavaba en
 * silencio; ahora el tope sube a 40× y un toast lo dice UNA vez, no en
 * cada tick de rueda.
 */
import { test, expect } from '@playwright/test';
import { addPiece, dispatch, st } from './helpers/lienzo';
import { leerBitacora, guardarEvidencia } from './helpers/bitacora';

test.use({ viewport: { width: 1366, height: 643 } });

test.describe('#1097 — zoom a 40× con aviso', () => {
  test('la rueda acerca más allá del viejo tope de 10, y avisa una sola vez al llegar al nuevo tope', async ({ page }) => {
    await page.goto('/app/');
    await page.waitForSelector('svg.pattern-svg', { timeout: 20000 });
    await page.waitForTimeout(500);
    await addPiece(page, 'p1', { x: 0, y: 0 }, 200, 200);

    const box = await page.locator('svg.pattern-svg').boundingBox();
    const cx = box!.x + box!.width / 2;
    const cy = box!.y + box!.height / 2;
    await page.mouse.move(cx, cy);

    // Ya pasado el viejo tope de 10: la rueda real todavía tiene que acercar.
    await dispatch(page, 'editor/setZoom2D', 15);
    await page.mouse.wheel(0, -120);
    await page.waitForTimeout(200);
    const zoomTrasUnTick = (await st(page)).editor.zoom2D;
    expect(zoomTrasUnTick, 'la rueda no acercó más allá del viejo tope de 10×').toBeGreaterThan(15);

    // Sin toast todavía: no se ha llegado al tope nuevo.
    await expect(page.locator('.toast')).toHaveCount(0);

    // Al tope: la rueda intenta acercar más y ahí sí avisa.
    await dispatch(page, 'editor/setZoom2D', 40);
    await page.mouse.wheel(0, -120);
    await page.waitForTimeout(250);
    expect((await st(page)).editor.zoom2D).toBe(40);

    const toast = page.locator('.toast--info');
    await expect(toast).toBeVisible();
    await expect(toast.locator('.toast__message')).toContainText(/zoom máximo/i);

    guardarEvidencia('1097-zoom-cuarenta-y-aviso', await leerBitacora(page), 0);

    // Varios ticks más en el tope: sigue habiendo UN solo toast, no una pila.
    await page.mouse.wheel(0, -120);
    await page.mouse.wheel(0, -120);
    await page.mouse.wheel(0, -120);
    await page.waitForTimeout(200);
    await expect(page.locator('.toast--info')).toHaveCount(1);
  });

  test('el trazo del contorno engorda visiblemente entre 1× y 40× (no se lee "pixelado" para siempre)', async ({ page }) => {
    await page.goto('/app/');
    await page.waitForSelector('svg.pattern-svg', { timeout: 20000 });
    await page.waitForTimeout(500);
    await addPiece(page, 'p1', { x: 0, y: 0 }, 200, 200);

    const cutLine = page.locator('[data-testid="piece-cut-line"]').first();
    await expect(cutLine).toBeVisible();
    const patternUnitsAt1x = parseFloat((await cutLine.getAttribute('stroke-width')) ?? '0');
    const screenPxAt1x = patternUnitsAt1x * 1;

    await dispatch(page, 'editor/setZoom2D', 40);
    await page.waitForTimeout(150);
    const patternUnitsAt40 = parseFloat((await cutLine.getAttribute('stroke-width')) ?? '0');
    const screenPxAt40 = patternUnitsAt40 * 40;

    // A 1x medía ~1.4 pattern-units == ~1.4 screen px (zoom=1). A 40x tiene
    // que leerse mucho más grueso en pantalla, no seguir clavado en 1.4px.
    expect(screenPxAt40).toBeGreaterThan(screenPxAt1x * 3);
  });
});
