import { test, expect, type Page } from '@playwright/test';
import { addPiece, dispatch } from './helpers/lienzo';

/**
 * #1132, el hermano que abre T#212: un gesto que empezó en la hoja sigue
 * oyendo el ratón fuera de ella, y las herramientas calculan su resalte con
 * esas coordenadas. Si se suelta fuera, el mouseleave ya pasó al salir, y lo
 * que el movimiento de fuera encendió se quedaba hasta volver a la hoja.
 *
 * La pieza cruza el borde izquierdo de la hoja: fuera, a la altura de su lado
 * de arriba, el ratón cae sobre ese lado en coordenadas de patrón, y su tramo
 * visible es el que se encendería. La vara es la misma hoja después de volver
 * a entrar por el hueco y salir despacio, que apaga cualquier resalte.
 */

const ID = 'p1132f';
const HERRAMIENTAS = ['notch', 'point', 'trimPlace', 'seamAllowance', 'editPattern'] as const;

const lienzo = (page: Page) =>
  page.evaluate(() => document.querySelector('svg.pattern-svg')!.innerHTML);

async function usar(page: Page, id: string) {
  await page.evaluate(i => {
    const s = (window as unknown as { __VINA_STORE__: { dispatch: (a: unknown) => void } }).__VINA_STORE__;
    s.dispatch({ type: 'editor/setActiveTool', payload: i });
    s.dispatch({ type: 'tools/setActiveTool2D', payload: i });
  }, id);
  await page.waitForTimeout(200);
}

test.describe('#1132 — soltar fuera de la hoja no deja resalte', () => {
  test.setTimeout(120_000);

  for (const herramienta of HERRAMIENTAS) {
    test(`${herramienta}: un gesto que se suelta fuera deja la hoja sin resalte`, async ({ page }) => {
      await page.goto('/app/');
      await page.waitForSelector('svg.pattern-svg', { timeout: 15000 });
      await page.waitForTimeout(500);
      await addPiece(page, ID, { x: 0, y: 0 }, 200, 150);
      await dispatch(page, 'editor/setZoom2D', 1);
      await dispatch(page, 'editor/setPan2D', { x: -50, y: 150 });
      await usar(page, herramienta);

      const box = (await page.locator('svg.pattern-svg').boundingBox())!;
      const vacio = { x: box.x + 300, y: box.y + 400 };
      const fueraSobreElLado = { x: box.x - 15, y: box.y + 150 };

      await page.mouse.move(vacio.x, vacio.y, { steps: 5 });
      await page.mouse.down();
      await page.mouse.move(fueraSobreElLado.x, fueraSobreElLado.y, { steps: 30 });
      await page.mouse.move(fueraSobreElLado.x, fueraSobreElLado.y + 2, { steps: 2 });
      await page.mouse.up();
      await page.waitForTimeout(300);
      const alSoltar = await lienzo(page);

      // Volver a entrar por el hueco vacío y salir despacio: apaga lo que haya.
      await page.mouse.move(vacio.x, vacio.y, { steps: 30 });
      await page.mouse.move(fueraSobreElLado.x, vacio.y, { steps: 40 });
      await page.mouse.move(fueraSobreElLado.x, fueraSobreElLado.y + 2, { steps: 10 });
      await page.waitForTimeout(300);

      expect(alSoltar, 'quedó un resalte encendido desde fuera de la hoja').toBe(await lienzo(page));
    });
  }
});
