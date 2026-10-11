import { test, expect, type Page } from '@playwright/test';
import { abrirAppVacia, cargarDxfDeMaria } from './helpers/estados';

/**
 * El margen de herramientas del patrón (spec 2026-10-02 «la interfaz en papel»
 * § 4.3), medido en la pantalla de María: 1366 × 643, que es su Chrome en una
 * laptop de 768 (§ 12).
 *
 * Lo que jsdom no puede decir: que el margen es una columna al lado de la hoja
 * y no encima, que con las doce de fábrica no hace falta desplazarse, que con
 * el catálogo entero la barra se ve y ningún botón queda recortado, y que la
 * activa siempre tiene su marca a la vista.
 */
test.describe.configure({ timeout: process.env.CI ? 240_000 : 120_000 });

/**
 * Playwright lanza Chromium con `--hide-scrollbars`: la barra no ocupa ancho y
 * un botón que la barra recortaría en el Chrome de María pasa aquí entero
 * (medido el 2026-10-03: 33 px útiles con barras de verdad, 43 sin ellas). Se
 * encienden, conservando los argumentos de WebGL de `playwright.config.ts`.
 */
test.use({
  launchOptions: {
    args: ['--use-gl=angle', '--use-angle=swiftshader'],
    ignoreDefaultArgs: ['--hide-scrollbars'],
  },
});

const VENTANA = { width: 1366, height: 643 };

/** Lo que el margen enseña de verdad: caja del margen, de la hoja y de cada botón. */
async function medir(page: Page) {
  return page.evaluate(() => {
    const margen = document.querySelector('nav.margen') as HTMLElement;
    const hoja = document.querySelector('svg.pattern-svg')!.getBoundingClientRect();
    const m = margen.getBoundingClientRect();
    const botones = Array.from(margen.querySelectorAll<HTMLElement>('.dock__tool, .dock__add')).map((b) => {
      const r = b.getBoundingClientRect();
      return { nombre: b.getAttribute('aria-label'), left: r.left, right: r.right };
    });
    return {
      margen: { left: m.left, right: m.right, width: m.width },
      hojaLeft: hoja.left,
      desborda: margen.scrollHeight > margen.clientHeight,
      // El ancho útil dentro del margen, sin la barra de desplazamiento.
      utilRight: m.left + margen.clientWidth,
      fondo: getComputedStyle(margen).backgroundColor,
      papel: getComputedStyle(document.querySelector('.canvas-area__2d')!).backgroundColor,
      botones,
    };
  });
}

test('con las doce de fábrica: una columna de papel al lado de la hoja, sin desplazarse', async ({ page }) => {
  await page.setViewportSize(VENTANA);
  await abrirAppVacia(page);
  await cargarDxfDeMaria(page);
  const r = await medir(page);
  expect(r.margen.left, 'el margen no está pegado al borde del área 2D').toBe(0);
  expect(Math.round(r.margen.width), 'el margen no mide 44 px').toBe(44);
  expect(r.hojaLeft, 'la hoja empieza debajo del margen: el margen la tapa').toBeGreaterThanOrEqual(r.margen.right);
  expect(r.fondo, 'el margen no es del color de la hoja').toBe(r.papel);
  expect(r.desborda, 'a 1366 × 643 las doce y el «+» no caben sin desplazarse').toBe(false);
  expect(r.botones).toHaveLength(13);
});

test('con el catálogo entero: la barra se ve, ningún botón queda recortado y la activa se trae a la vista', async ({ page }) => {
  await page.setViewportSize(VENTANA);
  // El sobre v2 con las 22 del catálogo, escrito antes de que arranque la app.
  await page.addInitScript(() => {
    const todas = [
      'select', 'editPattern', 'point', 'pen', 'internalShape', 'rectangle', 'scissors', 'measure',
      'seam', 'seamEdit', 'seamAllowance', 'notch', 'circle', 'triangle', 'grainline', 'hand',
      'measureCurve', 'compareCurves', 'slashAndSpread', 'trimPlace', 'elastic', 'pleat',
    ];
    localStorage.setItem('vina-docks', JSON.stringify({ version: 2, data: { tools2d: todas } }));
    localStorage.removeItem('vina-bar-position');
  });
  await page.goto('/app/');
  await expect(page.locator('svg.pattern-svg')).toBeVisible({ timeout: 20_000 });
  await page.locator('.pill-group').getByRole('button', { name: '2D', exact: true }).click();
  await page.waitForTimeout(400);

  const r = await medir(page);
  expect(r.botones).toHaveLength(23);
  expect(r.desborda, 'con 22 herramientas el margen tendría que desplazarse').toBe(true);
  expect(r.utilRight, 'la barra no ocupa ancho: el test no está viendo barras de verdad').toBeLessThan(r.margen.right - 2);
  // Recortado = el botón se sale del ancho útil (la barra de desplazamiento
  // se lo come). El clic de Playwright desplaza el contenedor y lo alcanza
  // igual: por eso se mide la caja y no el clic.
  const recortados = r.botones.filter((b) => b.right > r.utilRight + 0.5 || b.left < r.margen.left - 0.5);
  expect(recortados, 'botones recortados por la barra de desplazamiento').toEqual([]);

  // Abajo del todo, Pliegue; con Z se vuelve a Seleccionar, que está arriba.
  const margen = page.locator('nav.margen:not(.margen--derecho)');
  await margen.evaluate((el) => { el.scrollTop = el.scrollHeight; });
  await page.getByRole('button', { name: 'Pliegue', exact: true }).click();
  await page.locator('svg.pattern-svg').hover({ position: { x: 400, y: 300 } });
  await page.keyboard.press('z');
  const seleccionarALaVista = await page.evaluate(() => {
    const margenEl = document.querySelector('nav.margen')!.getBoundingClientRect();
    const b = document.querySelector('nav.margen .dock__tool--active')!.getBoundingClientRect();
    return b.top >= margenEl.top - 0.5 && b.bottom <= margenEl.bottom + 0.5;
  });
  expect(seleccionarALaVista, 'la activa quedó fuera de la vista del margen').toBe(true);
});

test('la activa que no está en el margen aparece al final, marcada, y se va al soltarla', async ({ page }) => {
  await page.setViewportSize(VENTANA);
  await abrirAppVacia(page);
  await cargarDxfDeMaria(page);
  await page.locator('svg.pattern-svg').hover({ position: { x: 400, y: 300 } });
  await page.keyboard.press('Shift+G');
  const hilo = page.locator('nav.margen:not(.margen--derecho)').getByRole('button', { name: /^Hilo/ });
  await expect(hilo).toHaveAttribute('aria-pressed', 'true');
  // Que se vea de verdad: lo de arriba en su centro es el propio botón.
  const encima = await hilo.evaluate((el) => {
    const r = el.getBoundingClientRect();
    return document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2)?.closest('button') === el;
  });
  expect(encima, 'la marca de la activa está tapada').toBe(true);
  await page.keyboard.press('z');
  await expect(page.locator('nav.margen:not(.margen--derecho)').getByRole('button', { name: /^Hilo/ })).toHaveCount(0);
});
