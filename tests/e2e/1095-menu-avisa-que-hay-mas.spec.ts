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
    await page.goto('/app/');
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
    // Ronda 2: el marco (.context-menu) ya no scrollea — el scrollport real
    // es el wrapper interior que separa marco de contenido para que los
    // fades no viajen con el scroll.
    const menuScroll = page.locator('.context-menu__scroll');

    // El propio menú tiene que desbordar en esta pieza (control, como el
    // issue): si no desborda el test no está probando nada.
    const overflows = await menuScroll.evaluate(el => el.scrollHeight > el.clientHeight + 1);
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
    await menuScroll.evaluate(el => { el.scrollTop = el.scrollHeight; });
    await page.waitForTimeout(150);
    await expect(page.locator('.context-menu__fade--bottom')).toHaveCount(0);
    const fadeTop = page.locator('.context-menu__fade--top');
    await expect(fadeTop).toBeVisible();

    // Ronda 2 (hallazgo del review): `toBeVisible()` solo mira CSS, no
    // posición. Si el fade es hijo del MISMO elemento que hace scroll, viaja
    // con el contenido y termina fuera del scrollport (y negativa) aunque
    // "exista" y su CSS diga visible. Tiene que seguir DENTRO del menú.
    const menuBox = (await menu.boundingBox())!;
    const fadeBox = (await fadeTop.boundingBox())!;
    expect(fadeBox.y, 'el fade superior se fue fuera del menú al bajar el scroll').toBeGreaterThanOrEqual(menuBox.y - 1);
    expect(fadeBox.y + fadeBox.height).toBeLessThanOrEqual(menuBox.y + menuBox.height + 1);

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

  test('ronda 2 (hallazgo del review): el submenú "Duplicar" es alcanzable con el mouse, no queda recortado', async ({ page }) => {
    await page.goto('/app/');
    await page.waitForSelector('svg.pattern-svg', { timeout: 20000 });
    await page.waitForTimeout(500);
    await addPiece(page, 'p1', { x: 100, y: 100 }, 200, 200);

    const box = await page.locator('svg.pattern-svg').boundingBox();
    const x = box!.x + box!.width * 0.4;
    const y = box!.y + box!.height * 0.4;
    await page.mouse.click(x, y, { button: 'right' });
    const menu = page.locator('.context-menu');
    await expect(menu).toBeVisible();

    const trigger = menu.getByRole('button', { name: /duplicar/i });
    await trigger.hover();
    const panel = page.locator('.submenu-panel');
    await expect(panel).toBeVisible({ timeout: 2000 });

    const item = panel.getByRole('button', { name: 'Duplicar' });
    const r = (await item.boundingBox())!;
    const hit = await page.evaluate(([px, py]) => {
      const el = document.elementFromPoint(px, py);
      return el?.textContent ?? null;
    }, [r.x + r.width / 2, r.y + r.height / 2]);
    expect(hit, 'elementFromPoint no alcanzó "Duplicar" — el submenú está recortado').toBe('Duplicar');

    await item.click();
    await expect(menu).toHaveCount(0);
    const state = await page.evaluate(() => (window as unknown as {
      __VINA_STORE__: { getState: () => { project: { pieces: Array<{ id: string }> } } };
    }).__VINA_STORE__.getState().project.pieces.length);
    expect(state).toBe(2); // p1 + su duplicado
  });

  test('ronda 2: el submenú "Duplicar" también se abre y se ejecuta por teclado', async ({ page }) => {
    await page.goto('/app/');
    await page.waitForSelector('svg.pattern-svg', { timeout: 20000 });
    await page.waitForTimeout(500);
    await addPiece(page, 'p1', { x: 100, y: 100 }, 200, 200);

    const box = await page.locator('svg.pattern-svg').boundingBox();
    await page.mouse.click(box!.x + box!.width * 0.4, box!.y + box!.height * 0.4, { button: 'right' });
    const menu = page.locator('.context-menu');
    await expect(menu).toBeVisible();

    const trigger = menu.getByRole('button', { name: /duplicar/i });
    await trigger.focus();
    await page.keyboard.press('Enter');
    const panel = page.locator('.submenu-panel');
    await expect(panel).toBeVisible({ timeout: 2000 });
    await panel.getByRole('button', { name: 'Duplicar' }).click();

    const count = await page.evaluate(() => (window as unknown as {
      __VINA_STORE__: { getState: () => { project: { pieces: Array<{ id: string }> } } };
    }).__VINA_STORE__.getState().project.pieces.length);
    expect(count).toBe(2);
  });

  test('un menú corto (sin overflow) no muestra ninguna señal', async ({ page }) => {
    await page.goto('/app/');
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
