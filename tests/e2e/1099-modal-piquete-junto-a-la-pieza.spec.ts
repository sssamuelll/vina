/**
 * #1099 — "colocar exacto… no me ha creado nada. […] no me lo crea, qué
 * ladilla." (María, 30:02–31:55). El modal caía sobre el visor 3D, lejos
 * de la pieza que ella estaba midiendo — mismo tratamiento que ya recibió
 * "Siguiente punto" en el PR #1091: de `fixed` a `absolute` dentro de
 * `.pattern-editor`, así se queda del lado 2D pase lo que pase con el 3D.
 */
import { test, expect, Page } from '@playwright/test';
import { dispatch, clickAt } from './helpers/lienzo';
import { leerBitacora, guardarEvidencia } from './helpers/bitacora';

test.use({ viewport: { width: 1366, height: 643 } });

interface VentanaConStore {
  __VINA_STORE__: { dispatch: (a: { type: string; payload?: unknown }) => void };
}

async function abrirModalDePiquete(page: Page) {
  await page.goto('/');
  await page.waitForSelector('svg.pattern-svg', { timeout: 20000 });
  await page.waitForTimeout(500);

  // Perímetro 1502mm, como el caso real de María.
  const w = 400, h = 351;
  await dispatch(page, 'project/addPiece', {
    id: 'p1', name: 'Delantero', outline: [
      { type: 'M', values: [0, 0] }, { type: 'L', values: [w, 0] },
      { type: 'L', values: [w, h] }, { type: 'L', values: [0, h] }, { type: 'Z', values: [] },
    ],
    internals: [], position: { x: 100, y: 50 }, rotation: 0, mirrored: false,
    seamAllowance: 0, layer: 1, sublayer: 0, active: true, createdAt: 1, updatedAt: 1,
  });
  await page.waitForTimeout(300);
  await page.evaluate(() => {
    const s = (window as unknown as VentanaConStore).__VINA_STORE__;
    s.dispatch({ type: 'editor/setActiveTool', payload: 'notch' });
    s.dispatch({ type: 'tools/setActiveTool2D', payload: 'notch' });
  });
  await page.waitForTimeout(300);
  await clickAt(page, { x: 100 + w / 2, y: 50 }); // borde superior de la pieza
  const modal = page.locator('.notch-precision-modal');
  await expect(modal).toBeVisible({ timeout: 5000 });
  return modal;
}

test.describe('#1099 — el modal de piquete se muda al lado 2D', () => {
  test('ronda 2 (hallazgo del review): a un ratio de split angosto (15%), el modal sigue completo dentro del viewport', async ({ page }) => {
    // Abrir con el split por defecto (fiable: a 15% la tira de opciones del
    // piquete tapa el lienzo de 205px y el clic ya no llega a la pieza —
    // eso es otro hallazgo aparte, no lo que este test verifica). Angostar
    // el split DESPUÉS reproduce igual de bien el recorte del modal, y es
    // el caso real: arrastrar el divisor con el modal ya abierto.
    const modal = await abrirModalDePiquete(page);
    await expect(modal).toBeVisible();

    await dispatch(page, 'layout/setSplitRatio', 0.15);
    await page.waitForTimeout(300);

    const modalBox = (await modal.boundingBox())!;
    const viewport = page.viewportSize()!;
    expect(modalBox.x, 'el modal se recorta por la izquierda — negativo').toBeGreaterThanOrEqual(0);
    expect(modalBox.x + modalBox.width, 'el modal se sale del viewport por la derecha').toBeLessThanOrEqual(viewport.width);
  });

  test('el modal no invade el visor 3D en vista split', async ({ page }) => {
    const modal = await abrirModalDePiquete(page);

    const splitDivider = (await page.locator('svg.pattern-svg').boundingBox())!.x
      + (await page.locator('svg.pattern-svg').boundingBox())!.width;
    const modalBox = (await modal.boundingBox())!;

    expect(
      modalBox.x + modalBox.width,
      'el modal se sale del lado 2D hacia el visor 3D',
    ).toBeLessThanOrEqual(splitDivider + 2);

    // No es `fixed` respecto a la ventana: vive dentro de .pattern-editor.
    const dentroDelEditor = await page.evaluate(() => {
      const modal = document.querySelector('.notch-precision-modal');
      const editor = document.querySelector('.pattern-editor');
      return !!modal && !!editor && editor.contains(modal);
    });
    expect(dentroDelEditor).toBe(true);
  });

  test('confirmar "Colocar exacto" deja un toast que dice dónde quedó — aunque el piquete caiga fuera de la vista', async ({ page }) => {
    const modal = await abrirModalDePiquete(page);

    const input = modal.locator('#notch-distance');
    await input.fill('500');
    await modal.getByText('Colocar exacto').click();

    await expect(modal).toHaveCount(0);
    const toast = page.locator('.toast--info, .toast--success');
    await expect(toast).toBeVisible();
    await expect(toast.locator('.toast__message')).toContainText(/piquete/i);
    await expect(toast.locator('.toast__message')).toContainText('500');

    guardarEvidencia('1099-modal-piquete-junto-a-la-pieza', await leerBitacora(page), 0);
  });
});
