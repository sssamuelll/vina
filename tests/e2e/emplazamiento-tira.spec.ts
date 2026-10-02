/**
 * Cotas vivas, PR A (spec 2026-08-30 § 8.3.5): emplazamiento medido en el
 * navegador — María #225 ("el menú de arriba se ve cortado por el menú de los
 * comandos del 2D") venía de su laptop: 1366×768 menos el cromo de Chrome y
 * la barra de tareas deja 643 px, y ahí el dock (596 px, centrado) pisaba la
 * barra acoplada. Sin barra, el lienzo ocupa toda el área y la tira vive en
 * la esquina, donde el dock no llega.
 *
 * jsdom no calcula layout: `elementFromPoint` y `getBoundingClientRect` solo
 * existen aquí.
 */
import { test, expect } from '@playwright/test';

test.describe('emplazamiento de la tira y las cotas (laptop de María, 1366×643)', () => {
  test.use({ viewport: { width: 1366, height: 643 } });

  test('el dock nunca pinta encima de la tira; el lienzo ocupa toda el área 2D', async ({ page }) => {
    await page.goto('/app/');
    await page.waitForSelector('svg.pattern-svg', { timeout: 20000 });
    await page.getByRole('button', { name: 'Rectángulo' }).first().click();
    const r = await page.evaluate(() => {
      const tira = document.querySelector('.tool-strip')!.getBoundingClientRect();
      const area = document.querySelector('.canvas-area__2d')!.getBoundingClientRect();
      const svg = document.querySelector('svg.pattern-svg')!.getBoundingClientRect();
      const encima = document.elementFromPoint(tira.left + 8, tira.top + 8)?.closest('.tool-strip, .dock');
      return {
        encima: encima?.className ?? null,
        svgTop: svg.top, areaTop: area.top, svgH: svg.height, areaH: area.height,
        tiraRight: tira.right, areaRight: area.right, tiraTop: tira.top,
      };
    });
    expect(r.encima).toContain('tool-strip');
    expect(Math.abs(r.svgTop - r.areaTop)).toBeLessThan(1);
    expect(Math.abs(r.svgH - r.areaH)).toBeLessThan(1);
    expect(r.tiraRight).toBeLessThanOrEqual(r.areaRight);
    // a 20 px o más del borde de arriba: el hueco de la regla, retirada el 2026-10-02
    expect(r.tiraTop - r.areaTop).toBeGreaterThanOrEqual(20);
  });

  test('las cotas se ocultan mientras se arrastra la pieza y vuelven al soltar', async ({ page }) => {
    await page.goto('/app/');
    await page.waitForSelector('svg.pattern-svg', { timeout: 20000 });
    await page.keyboard.press('s');
    const box = await page.locator('svg.pattern-svg').boundingBox();
    if (!box) throw new Error('no svg');
    await page.mouse.click(box.x + 300, box.y + 300);
    await page.keyboard.press('z');
    await page.mouse.click(box.x + 320, box.y + 320);
    const ancho = page.getByRole('button', { name: /^Ancho de la pieza:/ });
    await expect(ancho).toBeVisible();
    await page.mouse.move(box.x + 320, box.y + 320);
    await page.mouse.down();
    await page.mouse.move(box.x + 380, box.y + 380, { steps: 6 });
    await expect(ancho).toHaveCount(0);
    await page.mouse.up();
    await expect(ancho).toBeVisible();
  });
});
