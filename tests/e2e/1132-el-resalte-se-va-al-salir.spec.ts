import { test, expect, type Page } from '@playwright/test';
import { addPiece, dispatch } from './helpers/lienzo';

/**
 * #1132 — el resalte de hover se queda pegado al salir del lienzo.
 *
 * Se queda con la salida DE GOLPE: un solo mousemove de dentro a fuera, que el
 * <svg> nunca recibe. Si se sale despacio, el último mousemove dentro ya no
 * está sobre el borde y la herramienta se limpia sola. Con el ratón de verdad
 * se sale de golpe muchas veces.
 *
 * La vara es la salida despacio: después de salir de golpe, el lienzo tiene que
 * quedar igual que después de salir despacio por el mismo camino. Antes se
 * comprueba que el resalte de verdad aparece, para que el caso no pase en vacío.
 *
 * Reproducido el 13-10 contra producción en Piquete (dejaba 2 elementos) y
 * Punto (1).
 */

const ID = 'p1132';

const HERRAMIENTAS = ['notch', 'point', 'pen', 'scissors', 'topstitchSeamline', 'trimPlace'] as const;

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

test.describe('#1132 — el resalte se va al salir del lienzo de golpe', () => {
  test.setTimeout(120_000);

  for (const herramienta of HERRAMIENTAS) {
    test(`${herramienta}: salir de golpe deja el lienzo como salir despacio`, async ({ page }) => {
      await page.goto('/app/');
      await page.waitForSelector('svg.pattern-svg', { timeout: 15000 });
      await page.waitForTimeout(500);
      await addPiece(page, ID, { x: 0, y: 0 }, 200, 150);
      await dispatch(page, 'editor/setZoom2D', 1);
      await dispatch(page, 'editor/setPan2D', { x: 150, y: 150 });
      await dispatch(page, 'editor/selectPiece', ID);
      await usar(page, herramienta);

      const box = (await page.locator('svg.pattern-svg').boundingBox())!;
      // Mitad del borde izquierdo de la pieza, y un punto fuera a su izquierda,
      // sobre el margen de herramientas.
      const borde = { x: box.x + 150, y: box.y + 150 + 75 };
      const fuera = { x: box.x - 25, y: borde.y };
      const entrar = async () => {
        await page.mouse.move(box.x + 60, borde.y + 40);
        await page.mouse.move(borde.x, borde.y, { steps: 8 });
        await page.waitForTimeout(250);
      };

      // Tijeras solo resalta con el corte empezado: su primer clic, en el
      // borde de arriba, fija el inicio y desde ahí sigue el borde bajo el ratón.
      if (herramienta === 'scissors') {
        await page.mouse.move(box.x + 250, box.y + 150, { steps: 8 });
        await page.mouse.click(box.x + 250, box.y + 150);
        await page.mouse.move(box.x + 250, box.y + 220, { steps: 8 });
      }

      await page.mouse.move(fuera.x, fuera.y, { steps: 40 });
      await page.waitForTimeout(200);
      const enReposo = await lienzo(page);

      await entrar();
      expect(await lienzo(page), 'el resalte no apareció: el caso pasaría en vacío').not.toBe(enReposo);
      await page.mouse.move(fuera.x, fuera.y, { steps: 40 });
      await page.waitForTimeout(250);
      const despacio = await lienzo(page);

      await entrar();
      await page.mouse.move(fuera.x, fuera.y, { steps: 1 });
      await page.waitForTimeout(250);
      expect(await lienzo(page), 'quedó resalte tras salir de golpe').toBe(despacio);
    });
  }
});
