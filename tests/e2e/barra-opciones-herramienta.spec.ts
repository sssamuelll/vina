import { test, expect, Page } from '@playwright/test';

/**
 * #1049: la barra de opciones de herramienta pasa a ser una canaleta acoplada
 * dentro de `.canvas-area__2d`, que cambia a columna flex.
 *
 * Por qué es un e2e y no vitest: jsdom no calcula layout —
 * `getBoundingClientRect()` devuelve 0 siempre—, así que ningún unitario puede
 * ver si el lienzo encoge, si salta al cambiar de herramienta, ni si desborda
 * por debajo de la barra. La restricción global lo exige para todo cambio de
 * `position` u `overflow`: medir el RESULTADO, no el valor declarado.
 *
 * Nota sobre los selectores: el nombre accesible de un botón del dock es
 * `${etiqueta} · ${atajo}` cuando la herramienta tiene atajo (`Dock.tsx:48`).
 * Playwright empareja `name` por subcadena, así que basta la etiqueta.
 */

async function abrirApp(page: Page) {
  await page.goto('/');
  await page.waitForSelector('svg.pattern-svg', { timeout: 20000 });
  await page.waitForTimeout(500);
}

/**
 * La misma herramienta puede salir DOS veces en el dock: fija arriba y otra
 * vez en la zona de auto-sugerencia (`.dock__tool--auto`, `DockAutoZone.tsx`).
 * Las dos despachan la misma activación, así que para medir layout da igual
 * cuál se pulse — pero sin `.first()` Playwright falla por modo estricto.
 */
function botonDeHerramienta(page: Page, etiqueta: string) {
  return page.getByRole('button', { name: etiqueta }).first();
}

test.describe('barra de opciones de herramienta', () => {
  test.beforeEach(async ({ page }) => {
    await abrirApp(page);
  });

  test('el alto del lienzo no cambia al alternar herramientas', async ({ page }) => {
    // Punto declara opciones; Seleccionar no. El canal es permanente, así que
    // el lienzo tiene que medir lo mismo con las dos. Si el canal apareciera y
    // desapareciera, el patrón saltaría en cada cambio de herramienta — y con
    // 7 de las 14 del dock sin opciones, eso pasa todo el tiempo.
    await botonDeHerramienta(page, 'Punto').click();
    await page.waitForTimeout(200);
    const conOpciones = await page.locator('svg.pattern-svg').boundingBox();

    await botonDeHerramienta(page, 'Seleccionar').click();
    await page.waitForTimeout(200);
    const sinOpciones = await page.locator('svg.pattern-svg').boundingBox();

    expect(sinOpciones!.height).toBeCloseTo(conOpciones!.height, 0);
    expect(sinOpciones!.y).toBeCloseTo(conOpciones!.y, 0);
  });

  test('el lienzo no desborda por debajo de la barra', async ({ page }) => {
    // `.pattern-editor` es `height: 100%`. En columna flex un alto en
    // porcentaje se resuelve contra el contenedor IGNORANDO que un hermano ya
    // se llevó espacio, así que mal puesto desborda. Esta es la red de eso.
    const area = await page.locator('.canvas-area__2d').boundingBox();
    const barra = await page.locator('.tool-options-bar').boundingBox();
    const lienzo = await page.locator('.pattern-editor').boundingBox();

    expect(barra!.height).toBeGreaterThan(0);
    expect(lienzo!.y).toBeGreaterThanOrEqual(barra!.y + barra!.height - 1);
    expect(lienzo!.y + lienzo!.height).toBeLessThanOrEqual(area!.y + area!.height + 1);
  });

  test('la barra es cromo en flujo, no una capa', async ({ page }) => {
    const estilo = await page.locator('.tool-options-bar').evaluate((el) => {
      const c = getComputedStyle(el);
      return { position: c.position, zIndex: c.zIndex };
    });
    expect(estilo.position).toBe('static');
    expect(estilo.zIndex).toBe('auto');
  });
});
