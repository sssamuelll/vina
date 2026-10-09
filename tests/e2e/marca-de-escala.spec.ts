import { test, expect, type Page } from '@playwright/test';
import { abrirAppVacia, cargarDxfDeMaria, reposo, cambiarVista, abrirPanel } from './helpers/estados';
import { activarHerramienta, dispatch, st } from './helpers/lienzo';

/**
 * La marca de escala (spec 2026-10-02 «la interfaz en papel» § 4.4) sustituye a
 * las reglas numeradas. Tres cosas que jsdom no puede ver:
 *
 *  1. que mide lo que dice: un cuadro exacto de la cuadrícula que se pinta;
 *  2. que nada la tapa ni se pisa con la frase de ayuda, en la pantalla de
 *     María y en Split, con la frase más larga que hay, y también con un panel
 *     abierto (hasta P4 se abría a la izquierda y corría el lienzo 324 px;
 *     desde P4 va a la derecha y la marca no se mueve);
 *  3. que no desaparece —ni vuelve «Trae tu patrón»— cuando en la hoja solo
 *     hay un trazo o una foto para calcar, y que en la pantalla vacía no está;
 *  4. que las unidades llegan a la cuadrícula y a la marca a la vez.
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
    abajo: (() => {
      const svg = document.querySelector('svg.pattern-svg')!.getBoundingClientRect();
      const r = marca.querySelector('path')!.getBoundingClientRect();
      return { aIzquierda: r.left - svg.left, alPie: svg.bottom - r.bottom };
    })(),
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
    // Abajo a la izquierda de la hoja (spec § 4.4): entre 24 px y 24 más un cuadro del pie.
    expect(antes!.abajo.alPie).toBeGreaterThanOrEqual(23);
    expect(antes!.abajo.alPie).toBeLessThanOrEqual(24 + antes!.cuadro + 1);
    expect(antes!.abajo.aIzquierda).toBeLessThan(80);
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

  const CASOS = [
    { vista: '2D', panel: false }, { vista: 'Split', panel: false },
    { vista: '2D', panel: true }, { vista: 'Split', panel: true },
  ] as const;
  for (const { vista, panel } of CASOS) {
    test(`en ${vista}${panel ? ' con Propiedades abierto' : ''} nada la tapa y no se pisa con la frase de ayuda`, async ({ page }) => {
      await abrirAppVacia(page);
      await cargarDxfDeMaria(page);
      await cambiarVista(page, vista);
      await reposo(page);
      if (panel) {
        // Después del reposo y no antes: Escape cierra el panel.
        await abrirPanel(page, 'Propiedades', 'Propiedades');
        await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
      }
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
          dentro: marca.left >= area.left && marca.right <= area.right && marca.top >= area.top && marca.bottom <= area.bottom,
          paneles: document.querySelectorAll('.context-panel').length,
        };
      });
      expect(r, 'no hay marca de escala').not.toBeNull();
      expect(r!.paneles, 'el panel no está como dice el caso').toBe(panel ? 1 : 0);
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

  test('la pantalla vacía no lleva marca; con una foto para calcar, la marca está y «Trae tu patrón» se va', async ({ page }) => {
    await abrirAppVacia(page);
    await expect(page.locator('[data-testid="empty-state-2d"]')).toHaveCount(1);
    await expect(page.locator('.marca-de-escala'), 'la pantalla vacía no lleva marca de escala').toHaveCount(0);

    await dispatch(page, 'project/addReferenceImage', {
      id: 'foto', filename: 'foto.png', width: 800, height: 600, position: { x: 0, y: 0 },
      scale: 1, rotation: 0, opacity: 0.5, locked: false, visible: true, pixelsPerMm: null,
    });
    expect((await st(page)).editor.activeTool).toBe('select');
    await expect(page.locator('[data-testid="empty-state-2d"]'), '«Trae tu patrón» tapa la foto que se va a calcar').toHaveCount(0);
    await expect(page.locator('.marca-de-escala'), 'con una foto en la hoja, la marca tiene que estar').toHaveCount(1);
  });

  test('en pulgadas, la cuadrícula y la marca cambian juntas', async ({ page }) => {
    await abrirAppVacia(page);
    await cargarDxfDeMaria(page);
    await reposo(page);
    await dispatch(page, 'editor/setUnits', 'inches');
    await page.waitForTimeout(300);

    const r = await leer(page);
    expect(r, 'no hay marca de escala o no hay cuadrícula').not.toBeNull();
    expect(r!.rotulo, 'la marca no habla en pulgadas').toMatch(/^(1\/8|1\/4|1\/2|\d+) in$/);
    // «1/2» → 0,5; «6» → 6.
    const pulgadas = r!.rotulo.replace(' in', '').split('/').map(Number).reduce((a, b) => a / b);
    // Al ancho exacto y no al píxel: con el patrón de María encuadrado, 2 in
    // (50,8 mm) y 50 mm se llevan 0,39 px, y una cuadrícula que se quedara en
    // milímetros pasaba una tolerancia de medio píxel (medido el 2026-10-02).
    expect(Math.abs(pulgadas * 25.4 * r!.zoom - r!.cuadro), 'la cuadrícula no se pinta en pulgadas').toBeLessThan(1e-6);
    expect(Math.abs(r!.anchoDelCorchete - r!.cuadro), 'el corchete no mide un cuadro').toBeLessThan(1.5);
  });
});
