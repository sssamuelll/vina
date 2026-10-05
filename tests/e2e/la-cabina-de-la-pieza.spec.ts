/**
 * La cabina de la pieza (spec 2026-10-02 § 5.5, P3a): la barrita de cuatro,
 * la regla del candado y una cota a la vez. Es un e2e porque la barrita y los
 * chips son capas HTML ancladas con pan y zoom, y el foco del Tab solo es de
 * verdad en un navegador.
 */
import { test, expect, type Page } from '@playwright/test';
import { abrirAppVacia } from './helpers/estados';
import { addPiece, activarHerramienta, clickAt, dispatch, st, toScreen } from './helpers/lienzo';

const barrita = (page: Page) => page.locator('.floating-action-bar');
const bloqueada = (page: Page) => page.evaluate(() =>
  (window as unknown as { __VINA_STORE__: { getState: () => { project: { pieces: Array<{ locked?: boolean }> } } } })
    .__VINA_STORE__.getState().project.pieces[0].locked === true);

async function unaPiezaSeleccionada(page: Page) {
  await abrirAppVacia(page);
  await addPiece(page, 'p1', { x: 100, y: 100 }, 300, 200);
  await activarHerramienta(page, 'z', 'select');
  await clickAt(page, { x: 250, y: 200 });
  await expect.poll(async () => (await st(page)).editor.selectedPieceIds).toEqual(['p1']);
}

test.describe('la cabina de la pieza (P3a)', () => {
  test.setTimeout(90_000);

  test('la barrita trae cuatro acciones; el candado vive en el menú del clic derecho', async ({ page }) => {
    await unaPiezaSeleccionada(page);
    await expect(barrita(page).getByRole('button')).toHaveCount(4);
    for (const nombre of ['Rotar 90°', 'Duplicar', 'Voltear horizontal', 'Propiedades…']) {
      await expect(barrita(page).getByRole('button', { name: nombre, exact: true })).toBeVisible();
    }
    await clickAt(page, { x: 250, y: 200 }, 'right');
    await page.getByText('Bloquear', { exact: true }).click();
    await expect.poll(() => bloqueada(page)).toBe(true);
  });

  test('con la pieza bloqueada no hay caja, pero la barrita trae «Desbloquear» primero', async ({ page }) => {
    await unaPiezaSeleccionada(page);
    await dispatch(page, 'project/lockPiece', 'p1');
    const primero = barrita(page).getByRole('button').first();
    await expect(primero).toHaveAttribute('aria-label', 'Desbloquear');
    await primero.click();
    await expect.poll(() => bloqueada(page)).toBe(false);
    await expect(barrita(page).getByRole('button', { name: 'Rotar 90°', exact: true })).toBeVisible();
  });

  test('arrastrar la pieza bloqueada esconde la barrita mientras dura el gesto', async ({ page }) => {
    await unaPiezaSeleccionada(page);
    await dispatch(page, 'project/lockPiece', 'p1');
    await expect(barrita(page)).toBeVisible();
    const desde = await toScreen(page, { x: 250, y: 200 });
    await page.mouse.move(desde.x, desde.y);
    await page.mouse.down();
    await page.mouse.move(desde.x + 40, desde.y + 20, { steps: 6 });
    await expect(barrita(page)).toHaveCount(0);
    await page.mouse.up();
    await expect(barrita(page)).toBeVisible();
  });
});
