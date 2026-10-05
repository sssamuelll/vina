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

  test('una cota a la vez: Ancho a la vista; Tab desde ella pasa a Alto, que ocupa su sitio', async ({ page }) => {
    const chip = (nombre: 'Ancho' | 'Alto') => page.getByRole('button', { name: new RegExp(`^${nombre} de la pieza:`) });
    const campo = (nombre: 'Ancho' | 'Alto') => page.locator(`input.cota--editando[aria-label="${nombre} de la pieza"]`);
    await unaPiezaSeleccionada(page);
    await expect(chip('Ancho')).toHaveText('300 mm');
    await expect(chip('Alto')).toHaveCount(0);

    // En edición: Tab pasa a Alto, abierto y listo para teclear.
    await chip('Ancho').click();
    await page.keyboard.press('Tab');
    await expect(campo('Alto')).toBeFocused();
    await expect(chip('Ancho')).toHaveCount(0);
    await page.keyboard.type('150');
    await page.keyboard.press('Enter');
    await expect(chip('Alto')).toHaveText('150 mm');
    await expect(chip('Ancho'), 'confirmar Alto no devuelve a Ancho').toHaveCount(0);

    // En reposo: Shift+Tab sobre el chip vuelve a Ancho.
    await chip('Alto').focus();
    await page.keyboard.press('Shift+Tab');
    await expect(campo('Ancho')).toBeFocused();
    await page.keyboard.press('Escape');

    // Otra pieza empieza por Ancho.
    await addPiece(page, 'p2', { x: 500, y: 100 }, 120, 90);
    await clickAt(page, { x: 560, y: 145 });
    await expect(chip('Ancho')).toHaveText('120 mm');
    await expect(chip('Alto')).toHaveCount(0);
  });
});
