/**
 * #1102 en un navegador de verdad — la mitad que jsdom no puede ver.
 *
 * María [11:23]: «si yo ahora quiero crear una línea nueva que empiece desde
 * aquí, no se está iluminando». Su queja tiene dos mitades y las dos son
 * visuales: que el punto ATRAIGA y que se VEA que atrae. La unitaria
 * (`1102-la-pluma-engancha.test.tsx`) cubre la primera contra el motor; esta
 * cubre que llegue al SVG, que es donde ella la mira.
 *
 * Y [11:38]: «siempre en los extremos los puntos deberían aparecer» — solo con
 * la pluma activa, que es lo que se decidió (decisión 13 de la gramática de la
 * tanda 6). Pintarlos siempre es #1108 y es otra cosa.
 */
import { test, expect } from '@playwright/test';
import { addPiece, dispatch, st, toScreen } from './helpers/lienzo';
import { leerBitacora } from './helpers/bitacora';

const MARIA = { width: 1366, height: 643 };

test.describe('la pluma engancha, y se ve que engancha', () => {
  test.use({ viewport: MARIA });
  test.setTimeout(120_000);

  test('los puntos de la pieza aparecen con la pluma y NO con otra herramienta', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('svg.pattern-svg', { timeout: 30000 });
    await page.waitForTimeout(600);
    await addPiece(page, 'p1', { x: 120, y: 140 }, 200, 150);

    const conSeleccionar = await page.locator('.pen-piece-vertices circle').count();
    expect(conSeleccionar, 'los puntos se pintan sin la pluma activa').toBe(0);

    await dispatch(page, 'editor/setActiveTool', 'pen');
    await dispatch(page, 'tools/setActiveTool2D', 'pen');
    await page.waitForTimeout(400);

    const conPluma = await page.locator('.pen-piece-vertices circle').count();
    expect(conPluma, 'con la pluma activa los puntos no aparecen').toBeGreaterThanOrEqual(4);
  });

  test('acercarse a un vértice enciende el anillo y el clic cae exacto', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('svg.pattern-svg', { timeout: 30000 });
    await page.waitForTimeout(600);
    await addPiece(page, 'p1', { x: 120, y: 140 }, 200, 150);
    await dispatch(page, 'editor/setActiveTool', 'pen');
    await dispatch(page, 'tools/setActiveTool2D', 'pen');
    await page.waitForTimeout(400);

    // Lejos de todo: sin anillo.
    const lejos = await toScreen(page, { x: 600, y: 500 });
    await page.mouse.move(lejos.x, lejos.y);
    await page.waitForTimeout(200);
    expect(await page.locator('svg.pattern-svg .snap-ring').count(), 'anillo encendido en el vacío').toBe(0);

    // A cuatro píxeles de la esquina superior izquierda: anillo.
    const esquina = await toScreen(page, { x: 120, y: 140 });
    await page.mouse.move(esquina.x + 4, esquina.y + 3);
    await page.waitForTimeout(250);
    expect(
      await page.locator('svg.pattern-svg .snap-ring').count(),
      'el enganche existe y es invisible — la mitad literal de la queja',
    ).toBe(1);

    // Y el clic aterriza EN la esquina, no cuatro píxeles más allá.
    await page.mouse.click(esquina.x + 4, esquina.y + 3);
    await page.waitForTimeout(300);

    const eventos = await leerBitacora(page);
    const enganche = [...eventos].reverse().find((e) => e.name === 'pen:press')?.data ?? null;
    // La bitácora es la fuente: dice a QUÉ enganchó, no solo dónde acabó.
    expect(enganche, 'la bitácora no registró el press de la pluma').not.toBeNull();
    expect(enganche!.snap, `el clic no enganchó nada: ${JSON.stringify(enganche)}`).toBe('vertex');
  });

  test('y el trazo que sale arranca en la esquina exacta de la pieza vecina', async ({ page }) => {
    // El resultado, no el intermedio: lo que se guarda tiene que empezar donde
    // ella quiso, porque de ahí sale el patrón.
    await page.goto('/');
    await page.waitForSelector('svg.pattern-svg', { timeout: 30000 });
    await page.waitForTimeout(600);
    await addPiece(page, 'p1', { x: 120, y: 140 }, 200, 150);
    await dispatch(page, 'editor/setActiveTool', 'pen');
    await dispatch(page, 'tools/setActiveTool2D', 'pen');
    await page.waitForTimeout(400);

    const esquina = await toScreen(page, { x: 320, y: 140 });   // la de arriba a la derecha
    await page.mouse.click(esquina.x + 3, esquina.y + 4);
    await page.waitForTimeout(200);
    const b = await toScreen(page, { x: 450, y: 140 });
    await page.mouse.click(b.x, b.y);
    await page.waitForTimeout(200);
    const c = await toScreen(page, { x: 450, y: 260 });
    await page.mouse.click(c.x, c.y);
    await page.waitForTimeout(200);
    await page.keyboard.press('Enter');
    await page.waitForTimeout(400);

    const piezas = (await st(page)).project.pieces;
    expect(piezas.length, 'la pluma no creó la pieza').toBe(2);
    const nueva = piezas[1];
    const arranque = { x: nueva.outline[0].values[0] + nueva.position.x, y: nueva.outline[0].values[1] + nueva.position.y };
    expect(arranque.x, 'el trazo no arrancó en la esquina').toBeCloseTo(320, 3);
    expect(arranque.y, 'el trazo no arrancó en la esquina').toBeCloseTo(140, 3);
  });
});
