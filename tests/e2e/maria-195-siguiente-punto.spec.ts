/**
 * maria-195 — «estaría guay que saliera un menú donde tú pudieras elegir qué
 * largo de línea quieres crear, incluso el ángulo respecto al origen».
 *
 * La promesa no cambia: Tab congela el tramo, se escriben largo y ángulo, Enter
 * coloca, y se puede encadenar. Lo que cambia es DÓNDE se escribe.
 *
 * Hasta el 2026-09-06 era `NextPointPanel`, un diálogo flotante en la esquina
 * que además le robaba el sitio a la tira de herramienta mientras estaba
 * abierto. Ahora son dos chips sobre el propio trazo (#1129, spec de cotas
 * vivas § 5.4), por la gramática del número que el repo ya tenía escrita: el
 * número vive donde vive su sujeto, y el sujeto de un tramo en curso es el
 * gesto, no una esquina.
 *
 * Este archivo NO se borró al morir el panel: se reescribió contra los chips,
 * porque lo que fija es la promesa de María, no la implementación.
 *
 * 0° a la derecha, 90° hacia arriba tal como se ve en pantalla.
 */
import { test, expect, type Page } from '@playwright/test';
import { waitForApp } from './helpers/sim';

type Cmd = { type: string; values: number[] };
type StoreWindow = {
  __VINA_STORE__: {
    getState: () => {
      editor: { activeTool: string; zoom2D: number; pan2D: { x: number; y: number } };
      project: { pieces: Array<{ outline: Cmd[]; position: { x: number; y: number } }> };
    };
  };
};

const st = (page: Page) => page.evaluate(() => (window as unknown as StoreWindow).__VINA_STORE__.getState());

async function toScreen(page: Page, p: { x: number; y: number }) {
  const box = await page.locator('svg.pattern-svg').boundingBox();
  if (!box) throw new Error('no svg');
  const { editor } = await st(page);
  return { x: box.x + editor.pan2D.x + p.x * editor.zoom2D, y: box.y + editor.pan2D.y + p.y * editor.zoom2D };
}

/**
 * El chip en edición es un `input` con el rótulo pelado; en reposo es un
 * `button` cuyo aria-label lleva además el valor («Largo: 80 mm»), para que un
 * lector de pantalla no tenga que adivinarlo. De ahí los dos localizadores.
 */
const campo = (page: Page, nombre: 'Largo' | 'Ángulo') =>
  page.locator(`input.cota--editando[aria-label="${nombre}"]`);
const chip = (page: Page, nombre: 'Largo' | 'Ángulo') =>
  page.locator(`.cotas button.cota[aria-label^="${nombre}:"]`);

async function escribir(page: Page, valor: string) {
  await page.keyboard.press('Control+a');
  await page.keyboard.type(valor);
}

test.describe('maria-195 — siguiente punto por largo y ángulo', () => {
  test.setTimeout(120_000);

  test('pluma: Tab, 80/90, Enter, 50/0, Enter, Escape, Enter → tres puntos exactos', async ({ page }) => {
    await waitForApp(page);
    await page.keyboard.press('h');
    await expect.poll(async () => (await st(page)).editor.activeTool, { timeout: 5000 }).toBe('pen');

    const s = await toScreen(page, { x: 300, y: 400 });
    await page.mouse.move(s.x, s.y);
    await page.mouse.click(s.x, s.y);
    await page.waitForTimeout(150);

    // Tab congela el tramo y abre el chip de Largo, ya en edición.
    await page.keyboard.press('Tab');
    await expect(campo(page, 'Largo'), 'Tab no congeló el tramo en dos chips').toBeVisible({ timeout: 5000 });
    await expect(chip(page, 'Ángulo')).toHaveCount(1);

    // 80, Tab al Ángulo, −90… ojo: 90 en la convención de pantalla es ARRIBA.
    await escribir(page, '80');
    await page.keyboard.press('Tab');
    await expect(campo(page, 'Ángulo'), 'Tab dentro del chip no saltó al Ángulo').toBeVisible();
    await escribir(page, '90');
    await page.keyboard.press('Enter');
    await page.waitForTimeout(250);

    // Enter coloca Y deja el par re-anclado al nodo nuevo, con Largo otra vez
    // en edición: es el encadenado literal del spec («80/−90, Enter, 50/0,
    // Enter»), y es lo que permite escribir un contorno entero sin soltar el
    // teclado.
    await expect(
      campo(page, 'Largo'),
      'tras colocar, el foco no volvió a Largo: el encadenado se rompe',
    ).toBeVisible({ timeout: 3000 });

    await escribir(page, '50');
    await page.keyboard.press('Tab');
    await escribir(page, '0');
    await page.keyboard.press('Enter');
    await page.waitForTimeout(250);

    // Escape en escalera, la del spec de cotas vivas: el PRIMERO descarta el
    // borrador y devuelve el foco al botón del chip; el SEGUNDO suelta el
    // tramo congelado y el trazo sigue vivo. Un Esc, una acción.
    await page.keyboard.press('Escape');
    await page.waitForTimeout(200);
    await expect(chip(page, 'Largo'), 'el primer Escape ya soltó el tramo: eso son dos acciones').toHaveCount(1);

    await page.keyboard.press('Escape');
    await page.waitForTimeout(250);
    await expect(chip(page, 'Largo'), 'el segundo Escape no soltó el tramo congelado').toHaveCount(0);

    // Y fuera del congelado, Enter termina la pieza abierta.
    await page.keyboard.press('Enter');
    await page.waitForTimeout(400);
    const pieces = (await st(page)).project.pieces;
    expect(pieces, 'la pluma no terminó la pieza').toHaveLength(1);
    const pts = pieces[0].outline.filter(c => c.type !== 'Z').map(c => {
      const v = c.values;
      return [v[v.length - 2] + pieces[0].position.x, v[v.length - 1] + pieces[0].position.y];
    });
    expect(pts).toHaveLength(3);
    expect(pts[0][0]).toBeCloseTo(300, 4); expect(pts[0][1]).toBeCloseTo(400, 4);
    expect(pts[1][0]).toBeCloseTo(300, 4); expect(pts[1][1]).toBeCloseTo(320, 4);
    expect(pts[2][0]).toBeCloseTo(350, 4); expect(pts[2][1]).toBeCloseTo(320, 4);
  });

  test('los chips del tramo NO le roban la esquina a la tira, que es por lo que murió el panel', async ({ page }) => {
    // `NextPointPanel` obligaba a esconder `ToolStrip2D` mientras estaba
    // abierto: los dos vivían en la misma esquina. Los chips viven sobre el
    // trazo, así que la cabina de la herramienta se queda donde estaba.
    await waitForApp(page);
    await page.keyboard.press('h');
    await expect.poll(async () => (await st(page)).editor.activeTool, { timeout: 5000 }).toBe('pen');

    const s = await toScreen(page, { x: 300, y: 400 });
    await page.mouse.click(s.x, s.y);
    await page.waitForTimeout(150);
    await page.keyboard.press('Tab');
    await expect(campo(page, 'Largo')).toBeVisible({ timeout: 5000 });

    await expect(
      page.locator('.tool-strip'),
      'la tira se escondió con el tramo congelado: eso era del panel viejo',
    ).toBeVisible();
  });
});
