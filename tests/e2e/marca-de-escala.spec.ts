import { test, expect, type Page } from '@playwright/test';
import { abrirAppVacia, cargarDxfDeMaria, reposo, cambiarVista } from './helpers/estados';
import { activarHerramienta, dispatch, st } from './helpers/lienzo';

/**
 * La marca de escala (spec 2026-10-02 «la interfaz en papel» § 4.4) sustituye a
 * las reglas numeradas. Tres cosas que jsdom no puede ver:
 *
 *  1. que mide lo que dice: un cuadro exacto de la cuadrícula que se pinta;
 *  2. que nada la tapa ni se pisa con la frase de ayuda, en la pantalla de
 *     María y en Split, con la frase más larga que hay;
 *  3. que no desaparece —ni vuelve «Trae tu patrón»— cuando en la hoja solo
 *     hay un trazo.
 */
interface VentanaConStore {
  __VINA_STORE__: { getState: () => { editor: { zoom2D: number } } };
}

const leer = (page: Page) => page.evaluate(() => {
  const marca = document.querySelector('.marca-de-escala');
  const patron = document.querySelector('svg.pattern-svg #grid-cuadro');
  if (!marca || !patron) return null;
  return {
    rotulo: marca.querySelector('text')?.textContent ?? '',
    anchoDelCorchete: marca.querySelector('path')!.getBoundingClientRect().width,
    cuadro: Number(patron.getAttribute('width')),
    zoom: (window as unknown as VentanaConStore).__VINA_STORE__.getState().editor.zoom2D,
  };
});

test.describe('la marca de escala (laptop de María, 1366×643)', () => {
  test.use({ viewport: { width: 1366, height: 643 } });
  test.describe.configure({ timeout: process.env.CI ? 240_000 : 90_000 });

  test('mide un cuadro exacto, lo dice, y cambia con el zoom', async ({ page }) => {
    await abrirAppVacia(page);
    await cargarDxfDeMaria(page);
    await reposo(page);

    const antes = await leer(page);
    expect(antes, 'no hay marca de escala o no hay cuadrícula').not.toBeNull();
    // 1,5 px de holgura: el corchete lleva un trazo de 1 px, mitad a cada lado.
    expect(Math.abs(antes!.anchoDelCorchete - antes!.cuadro), 'el corchete no mide un cuadro').toBeLessThan(1.5);
    expect(antes!.cuadro).toBeGreaterThanOrEqual(18);
    expect(antes!.rotulo).toMatch(/^\d+ mm$/);
    expect(Number(antes!.rotulo.replace(' mm', '')) * antes!.zoom, 'el rótulo no dice lo que mide el cuadro')
      .toBeCloseTo(antes!.cuadro, 0);

    await dispatch(page, 'editor/setZoom2D', antes!.zoom * 4);
    await page.waitForTimeout(300);
    const despues = await leer(page);
    expect(despues!.rotulo, 'al acercar, el cuadro tiene que valer menos').not.toBe(antes!.rotulo);
    expect(despues!.cuadro).toBeGreaterThanOrEqual(18);
    expect(despues!.cuadro).toBeLessThanOrEqual(45);
    expect(Math.abs(despues!.anchoDelCorchete - despues!.cuadro)).toBeLessThan(1.5);
  });

  for (const vista of ['2D', 'Split'] as const) {
    test(`en ${vista} nada la tapa y no se pisa con la frase de ayuda`, async ({ page }) => {
      await abrirAppVacia(page);
      await cargarDxfDeMaria(page);
      await cambiarVista(page, vista);
      await reposo(page);
      // La Pluma con un punto puesto enseña la frase más larga de la app.
      await activarHerramienta(page, 'h', 'pen');
      const svg = await page.locator('svg.pattern-svg').boundingBox();
      if (!svg) throw new Error('no svg');
      await page.mouse.click(svg.x + svg.width / 2, svg.y + 90);
      await page.waitForTimeout(300);

      const r = await page.evaluate(() => {
        const marca = document.querySelector('.marca-de-escala')?.getBoundingClientRect();
        if (!marca) return null;
        const pistas = Array.from(document.querySelectorAll('[data-superficie="pista"]')).map((p) => p.getBoundingClientRect());
        const sePisan = pistas.some((p) => p.left < marca.right && p.right > marca.left && p.top < marca.bottom && p.bottom > marca.top);
        const puntos = [
          [marca.left + 1, marca.top + 1],
          [(marca.left + marca.right) / 2, (marca.top + marca.bottom) / 2],
          [marca.right - 1, marca.bottom - 1],
        ];
        // La marca no recibe el ratón: `elementFromPoint` devuelve lo que hay
        // debajo o lo que la tapa. Si no es del lienzo, es cromo encima.
        const tapan = puntos
          .map(([x, y]) => document.elementFromPoint(x, y))
          .filter((el) => !el?.closest('svg.pattern-svg'))
          .map((el) => (el instanceof HTMLElement ? el.className : 'nada'));
        const area = document.querySelector('.canvas-area__2d')!.getBoundingClientRect();
        return {
          pistas: pistas.length,
          sePisan,
          tapan,
          dentro: marca.left >= area.left && marca.right <= area.right && marca.bottom <= area.bottom,
        };
      });
      expect(r, 'no hay marca de escala').not.toBeNull();
      expect(r!.pistas, 'la Pluma con un punto puesto tiene que enseñar su frase').toBeGreaterThan(0);
      expect(r!.tapan, 'algo del cromo tapa la marca de escala').toEqual([]);
      expect(r!.sePisan, 'la marca de escala y la frase de ayuda se pisan').toBe(false);
      expect(r!.dentro, 'la marca se sale del área del lienzo').toBe(true);
      await page.keyboard.press('Escape');
    });
  }

  test('con solo un trazo en la hoja, Seleccionar no devuelve la pantalla vacía', async ({ page }) => {
    await abrirAppVacia(page);
    await activarHerramienta(page, 'h', 'pen');
    const svg = await page.locator('svg.pattern-svg').boundingBox();
    if (!svg) throw new Error('no svg');
    await page.mouse.click(svg.x + 500, svg.y + 250);
    await page.mouse.click(svg.x + 700, svg.y + 250);
    await page.keyboard.press('Enter');
    await expect.poll(async () => (await st(page)).project.trazos.length, { timeout: 5_000 }).toBe(1);

    await activarHerramienta(page, 'z', 'select');
    await expect(page.locator('[data-testid="empty-state-2d"]'), '«Trae tu patrón» tapa el trazo').toHaveCount(0);
    await expect(page.locator('.marca-de-escala'), 'sin piezas pero con un trazo, la marca tiene que estar').toHaveCount(1);
  });
});
