/**
 * Shift endereza respecto a la HOJA (firma de María del 23-09, opción B).
 *
 * María, 10-09 [07:35]: «quiero hacer una línea perpendicular, entonces le
 * estaba dando al shift, pero no me hace nada el shift».
 *
 * Los unitarios (`shift-endereza-a-la-hoja.test.tsx`) prueban los hooks en
 * jsdom. Esto prueba lo que jsdom no ve: que el Shift real llega a la
 * herramienta a través del router de teclas del editor, y que un Shift+clic no
 * se lo come el lienzo antes (selección aditiva, por ejemplo).
 *
 * La escena es la del documento que firmó: un delantero con el costado
 * inclinado (dirección 1:3), la misma que sus capturas.
 */
import { test, expect, type Page } from '@playwright/test';
import { waitForApp } from './helpers/sim';
import { activarHerramienta, addPiece, clickAt, dispatch, st, toScreen } from './helpers/lienzo';

type Cmd = { type: string; values: number[] };

async function delantero(page: Page) {
  await dispatch(page, 'project/addPiece', {
    id: 'delantero', name: 'Delantero',
    outline: [
      { type: 'M', values: [0, 0] }, { type: 'L', values: [200, 0] },
      { type: 'L', values: [260, 180] }, { type: 'L', values: [0, 180] }, { type: 'Z', values: [] },
    ],
    internals: [], position: { x: 200, y: 150 }, rotation: 0, mirrored: false,
    seamAllowance: 0, layer: 1, sublayer: 0, active: true, createdAt: 1, updatedAt: 1,
  });
  await page.waitForTimeout(300);
}

async function mover(page: Page, p: { x: number; y: number }) {
  const s = await toScreen(page, p);
  await page.mouse.move(s.x, s.y, { steps: 6 });
  await page.waitForTimeout(200);
}

const pildora = (page: Page) =>
  page.locator('svg.pattern-svg text').filter({ hasText: /al (borde|tramo|eje)/ }).first();

test.describe('Shift endereza respecto a la hoja', () => {
  test.setTimeout(120_000);

  test('Línea interna desde el costado inclinado: Shift la deja horizontal, y el clic cae sobre la guía', async ({ page }) => {
    await waitForApp(page);
    await delantero(page);
    await activarHerramienta(page, 'g', 'internalShape');

    // (430,240) es el punto medio del costado: local (230,90).
    await clickAt(page, { x: 430, y: 240 });
    await mover(page, { x: 291, y: 276 });
    await expect(pildora(page), 'sin Shift la línea va a pulso').toContainText(/86[.,]1° al borde/);

    // Shift con la mano quieta: la goma se endereza en ese instante.
    await page.keyboard.down('Shift');
    await expect(pildora(page)).toContainText(/139[.,]0 mm · 71[.,]6° al borde/);

    const destino = await toScreen(page, { x: 291, y: 276 });
    await page.mouse.click(destino.x, destino.y);
    await page.keyboard.up('Shift');
    await page.keyboard.press('Enter');
    await page.waitForTimeout(300);

    const internas = (await st(page)).project.pieces[0].internals as Array<{ path: Cmd[] }>;
    expect(internas).toHaveLength(1);
    const [m, l] = internas[0].path;
    // Horizontal exacta en la hoja: la y del segundo nodo es la del primero.
    expect(l.values[1]).toBeCloseTo(m.values[1], 6);
    expect(l.values[0]).toBeCloseTo(m.values[0] - 139, 0);
  });

  test('Pluma: Shift+clic coloca el segundo nodo en vertical exacta', async ({ page }) => {
    await waitForApp(page);
    await activarHerramienta(page, 'h', 'pen');
    await clickAt(page, { x: 200, y: 400 });
    await page.keyboard.down('Shift');
    await mover(page, { x: 206, y: 250 });
    await expect(pildora(page)).toContainText(/150[.,]0 mm · 90[.,]0° al eje/);
    const s = await toScreen(page, { x: 206, y: 250 });
    await page.mouse.click(s.x, s.y);
    await page.keyboard.up('Shift');
    await page.keyboard.press('Escape');
    await page.waitForTimeout(300);

    const trazos = (await st(page)).project.trazos as Array<{ path: Cmd[] }>;
    expect(trazos).toHaveLength(1);
    const [m, l] = trazos[0].path;
    expect(l.values[0]).toBeCloseTo(m.values[0], 6);
    expect(m.values[1] - l.values[1]).toBeCloseTo(150, 0);
  });

  test('Pluma: Shift+doble clic termina un trazo de dos nodos, no una pieza', async ({ page }) => {
    // El segundo press de un doble clic trae `detail` 2: es lo que distingue
    // «termina» de «otro nodo», y solo un navegador real lo pone.
    await waitForApp(page);
    await activarHerramienta(page, 'h', 'pen');
    await clickAt(page, { x: 200, y: 400 });
    await page.keyboard.down('Shift');
    const s = await toScreen(page, { x: 300, y: 430 });
    await page.mouse.dblclick(s.x, s.y);
    await page.keyboard.up('Shift');
    await page.waitForTimeout(300);

    const { project } = await st(page);
    expect(project.pieces, 'Shift+doble clic cerró una pieza').toHaveLength(0);
    const trazos = project.trazos as Array<{ path: Cmd[] }>;
    expect(trazos).toHaveLength(1);
    expect(trazos[0].path).toHaveLength(2);
    expect(trazos[0].path[1].values[1]).toBeCloseTo(trazos[0].path[0].values[1], 6);
  });

  test('Línea interna: Shift+doble clic termina la línea sin un nodo de más', async ({ page }) => {
    await waitForApp(page);
    await delantero(page);
    await activarHerramienta(page, 'g', 'internalShape');
    await clickAt(page, { x: 430, y: 240 });
    await page.keyboard.down('Shift');
    const s = await toScreen(page, { x: 291, y: 276 });
    await page.mouse.dblclick(s.x, s.y);
    await page.keyboard.up('Shift');
    await page.waitForTimeout(300);

    const internas = (await st(page)).project.pieces[0].internals as Array<{ path: Cmd[] }>;
    expect(internas).toHaveLength(1);
    expect(internas[0].path, 'el segundo press del doble clic dejó un nodo de más').toHaveLength(2);
  });

  test('Editar patrón: con el punto seleccionado, Shift y después arrastrar lo mueve en horizontal exacta', async ({ page }) => {
    await waitForApp(page);
    await addPiece(page, 'R', { x: 200, y: 200 }, 200, 150);
    await activarHerramienta(page, 'q', 'editPattern');
    // El primer clic sobre la pieza entra en edición (ver #1092); el segundo
    // selecciona la esquina. Shift va ANTES de agarrarla: es el gesto que la
    // pista invita a hacer, y el que deseleccionaba el punto en el press.
    await clickAt(page, { x: 300, y: 275 });
    await clickAt(page, { x: 400, y: 200 });

    const a = await toScreen(page, { x: 400, y: 200 });
    const b = await toScreen(page, { x: 440, y: 207 });
    await page.keyboard.down('Shift');
    await page.mouse.move(a.x, a.y);
    await page.mouse.down();
    await page.mouse.move(b.x, b.y, { steps: 8 });
    await page.mouse.up();
    await page.keyboard.up('Shift');
    await page.waitForTimeout(250);

    const outline = (await st(page)).project.pieces[0].outline as Cmd[];
    expect(outline[1].values[0]).toBeCloseTo(240, 0);
    expect(outline[1].values[1], 'Shift dejó la esquina fuera de la horizontal').toBeCloseTo(0, 6);
  });
});
