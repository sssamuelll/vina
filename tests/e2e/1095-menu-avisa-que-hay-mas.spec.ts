/**
 * #1095 — el menú de pieza (20 filas) se recorta a 1366×643 sin ninguna
 * señal. Reproducido primero vía la caja negra (mandato de Samuel,
 * tanda 1): la bitácora deja la línea de tiempo real del gesto, no solo
 * un assert sobre el valor declarado.
 *
 * jsdom no calcula layout (contrato de interfaz § verificación): esto
 * SOLO se puede fijar en un navegador real, con elementFromPoint.
 */
import { test, expect } from '@playwright/test';
import { addPiece, dispatch } from './helpers/lienzo';
import { leerBitacora, guardarEvidencia } from './helpers/bitacora';

test.use({ viewport: { width: 1366, height: 643 } });

test.describe('#1095 — el menú avisa cuando hay más filas abajo', () => {
  test('degradado + flecha aparecen con overflow, y desaparecen al llegar al fondo', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('svg.pattern-svg', { timeout: 20000 });
    await page.waitForTimeout(500);

    // Pieza baja en el lienzo, igual que la reproducción del issue: el clic
    // derecho cae en la mitad inferior de una laptop de 768px.
    await addPiece(page, 'p1', { x: 100, y: 250 }, 300, 300);
    // Consolidar "Duplicar" en submenú (este mismo fix) bajó el piso de filas
    // lo suficiente para que una pieza desnuda YA NO desborde a 1366×643 —
    // eso es el resultado querido, pero deja sin cubrir el caso real (una
    // pieza organizada en grupos SIGUE desbordando). Dos grupos activan
    // addToGroup y removeFromGroup, que es exactamente ese caso.
    await addPiece(page, 'p2', { x: 500, y: 500 }, 50, 50);
    await dispatch(page, 'project/createGroup', { name: 'Contiene a p1', pieceIds: ['p1'] });
    await dispatch(page, 'project/createGroup', { name: 'No contiene a p1', pieceIds: ['p2'] });
    const box = await page.locator('svg.pattern-svg').boundingBox();
    const x = box!.x + box!.width * 0.4;
    const y = box!.y + box!.height * 0.75;
    await page.mouse.move(x, y);
    await page.mouse.click(x, y, { button: 'right' });

    const menu = page.locator('.context-menu');
    await expect(menu).toBeVisible();

    // El propio menú tiene que desbordar en esta pieza (control, como el
    // issue): si no desborda el test no está probando nada.
    const overflows = await menu.evaluate(el => el.scrollHeight > el.clientHeight + 1);
    expect(overflows, 'el menú de esta pieza no desbordó — la reproducción no es la del issue').toBe(true);

    // Señal de fondo visible al abrir (scrollTop=0): la fila real de María.
    await expect(page.locator('.context-menu__fade--bottom')).toBeVisible();
    // Todavía no bajó, así que no hay señal arriba.
    await expect(page.locator('.context-menu__fade--top')).toHaveCount(0);

    // "Eliminar pieza" no es alcanzable por elementFromPoint sin bajar
    // (el defecto exacto que reportó María).
    const deleteHidden = await page.evaluate(() => {
      const btn = [...document.querySelectorAll('.context-menu__item--danger')]
        .find(b => b.textContent?.includes('Eliminar pieza'));
      if (!btn) return true;
      const r = btn.getBoundingClientRect();
      const hit = document.elementFromPoint(r.left + 4, r.top + r.height / 2);
      return !btn.contains(hit) && hit !== btn;
    });
    expect(deleteHidden, '"Eliminar pieza" ya era alcanzable sin bajar — la pieza de prueba no reproduce el corte').toBe(true);

    guardarEvidencia('1095-menu-avisa-que-hay-mas', await leerBitacora(page), 0);

    // Bajar hasta el fondo real del scroll: la señal de abajo se apaga, la
    // de arriba se prende, y "Eliminar pieza" pasa a ser clicable de verdad.
    await menu.evaluate(el => { el.scrollTop = el.scrollHeight; });
    await page.waitForTimeout(150);
    await expect(page.locator('.context-menu__fade--bottom')).toHaveCount(0);
    await expect(page.locator('.context-menu__fade--top')).toBeVisible();

    const deleteReachableNow = await page.evaluate(() => {
      const btn = [...document.querySelectorAll('.context-menu__item--danger')]
        .find(b => b.textContent?.includes('Eliminar pieza'));
      if (!btn) return false;
      const r = btn.getBoundingClientRect();
      const hit = document.elementFromPoint(r.left + 4, r.top + r.height / 2);
      return btn.contains(hit) || hit === btn;
    });
    expect(deleteReachableNow).toBe(true);
  });

  test('un menú corto (sin overflow) no muestra ninguna señal', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('svg.pattern-svg', { timeout: 20000 });
    await page.waitForTimeout(500);

    // Con el proyecto vacío, el placeholder "Trae tu patrón" cubre el lienzo
    // y se traga el clic derecho — una pieza cualquiera lo quita de en medio.
    await addPiece(page, 'p1', { x: 0, y: 0 }, 50, 50);

    // emptyCanvas: 3 filas (pegar/pegar espejo/ajustar zoom), nunca desborda.
    // Lejos de la pieza (arriba-izquierda) y de la tira de herramienta 2D
    // (franja superior): un punto a media altura del lienzo cae en el fondo.
    const box = await page.locator('svg.pattern-svg').boundingBox();
    await page.mouse.click(box!.x + box!.width * 0.8, box!.y + box!.height * 0.6, { button: 'right' });
    const menu = page.locator('.context-menu');
    await expect(menu).toBeVisible();
    await expect(page.locator('.context-menu__fade--top')).toHaveCount(0);
    await expect(page.locator('.context-menu__fade--bottom')).toHaveCount(0);
  });
});
