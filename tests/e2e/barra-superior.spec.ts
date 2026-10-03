import { test, expect, type Locator, type Page } from '@playwright/test';
import { abrirAppVacia, cargarDxfDeMaria, cambiarVista } from './helpers/estados';

/**
 * La barra superior (spec 2026-10-02 «la interfaz en papel» § 4.2 y § 9),
 * medida en el navegador porque jsdom no calcula layout:
 *
 *  - el selector de vista está en el centro de la ventana y no se mueve al
 *    cambiar de vista (hasta P2 vivía entre dos espaciadores `flex: 1` y su x
 *    dependía de lo que hubiera a cada lado);
 *  - en español, a 1366 px, los seis interruptores del grupo del patrón caben
 *    y no se pliegan (§ 4.2: lo fija un e2e);
 *  - cuando no caben (1280 px), se pliegan en «Mostrar» y los seis siguen a un
 *    clic, en un menú que sale de la barra y se ve entero sobre la hoja.
 */
test.describe.configure({ timeout: process.env.CI ? 240_000 : 120_000 });

interface VentanaConStore {
  __VINA_STORE__: { getState: () => { editor: { showGrainlines: boolean } } };
}

/** Los botones de `contenedor` que no se ven enteros: tapados o recortados. */
async function noSeVen(contenedor: Locator): Promise<string[]> {
  return contenedor.evaluate((c) => {
    const caja = c.getBoundingClientRect();
    return [...c.querySelectorAll('button')]
      .filter((b) => {
        const r = b.getBoundingClientRect();
        const encima = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
        const recortado = r.right > caja.right + 0.5 || r.left < caja.left - 0.5;
        return recortado || !encima || !b.contains(encima);
      })
      .map((b) => b.textContent?.trim() ?? '?');
  });
}

async function centroDelSelector(page: Page) {
  return page.evaluate(() => {
    const r = document.querySelector('.pill-group')!.getBoundingClientRect();
    return { centro: (r.left + r.right) / 2, ventana: window.innerWidth / 2 };
  });
}

test('el selector de vista está en el centro de la ventana y no se mueve entre 2D, Split y 3D', async ({ page }) => {
  await page.setViewportSize({ width: 1366, height: 643 });
  await abrirAppVacia(page);
  await cargarDxfDeMaria(page);
  const centros: number[] = [];
  for (const vista of ['2D', 'Split', '3D'] as const) {
    await cambiarVista(page, vista);
    await page.waitForTimeout(300);
    const { centro, ventana } = await centroDelSelector(page);
    expect(Math.abs(centro - ventana), `en ${vista} el selector no está en el centro de la ventana`).toBeLessThanOrEqual(0.5);
    centros.push(centro);
  }
  expect(Math.max(...centros) - Math.min(...centros), 'el selector se movió al cambiar de vista').toBeLessThanOrEqual(0.5);
});

test('en español a 1366 los seis interruptores caben: el grupo no se pliega', async ({ page }) => {
  await page.setViewportSize({ width: 1366, height: 643 });
  await abrirAppVacia(page);
  await cargarDxfDeMaria(page);
  await cambiarVista(page, 'Split');
  const grupo = page.getByRole('group', { name: 'Qué se ve del patrón' });
  await expect(grupo).toBeVisible();
  await expect(grupo.getByRole('button')).toHaveCount(6);
  await expect(page.getByRole('button', { name: 'Mostrar' })).toHaveCount(0);
  expect(await noSeVen(grupo), 'interruptores tapados o recortados').toEqual([]);
});

test('a 1280 se pliega en «Mostrar», y desde ahí los seis siguen a un clic', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  await abrirAppVacia(page);
  await cargarDxfDeMaria(page);
  const mostrar = page.getByRole('button', { name: 'Mostrar' });
  await expect(mostrar).toBeVisible();
  await mostrar.click();

  const menu = page.getByRole('group', { name: 'Qué se ve del patrón' });
  await expect(menu).toBeVisible();
  await expect(menu.getByRole('button')).toHaveCount(6);
  // La barra superior es contexto de apilamiento: un menú que se quedara
  // dentro de ella se cortaría en su borde. Este cuelga de <body>.
  expect(await noSeVen(menu), 'interruptores del menú tapados o recortados').toEqual([]);

  const leer = () => page.evaluate(() => (window as unknown as VentanaConStore).__VINA_STORE__.getState().editor.showGrainlines);
  const antes = await leer();
  await menu.getByRole('button', { name: 'Hilo' }).click();
  expect(await leer(), 'el interruptor del menú no cambió nada').toBe(!antes);

  await page.keyboard.press('Escape');
  await expect(menu).toHaveCount(0);
  await expect(mostrar).toBeFocused();
});
