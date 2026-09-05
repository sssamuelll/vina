/**
 * «Unir patrones» agarra una pieza girada desde donde la pieza NO está.
 *
 * Ojo con la dirección del defecto, porque la intuición la pone al revés y yo
 * la puse al revés al escribir este archivo. Medido apagando el arreglo: el
 * clic SOBRE la tira girada sí enganchaba — la caja del fantasma sin girar
 * contiene de sobra el centro de la girada. Lo que falla es el otro lado: un
 * clic en espacio VACÍO, dentro del fantasma y fuera de la pieza, elige la
 * pieza igual. María hace clic donde no hay nada y Unir empieza a unir.
 *
 * Es el mismo defecto de #1064, vivo en una copia que se quedó atrás.
 * `PatternEditor.tsx` ya lo arregló y dejó la razón escrita:
 *
 *   «Vía `hitTestPieceBBox` y no con una copia local del bucle: era la misma
 *    caja calculada dos veces, y la de aquí se quedó midiendo contra el
 *    fantasma sin girar cuando #1033 volvió el giro declarativo (#1064).»
 *
 * Pero `useMergeTool.ts:45-66` conserva su propia copia del bucle, sumando
 * `piece.position` en vez de traer el punto a coordenadas de la pieza con
 * `patternToPieceLocal`. Con la pieza girada, mide contra el fantasma sin
 * girar. Y lleva un segundo defecto de paso: cuando un comando trae un número
 * impar de valores usa `0` como coordenada `y`, lo que estira la caja hasta el
 * origen.
 *
 * Censo del 2026-09-05: es uno de los VEINTICUATRO hit-tests del lienzo 2D,
 * de los cuales tres son copias literales de la misma idea y dos arrastran este
 * bug. Este se borra entero; los otros van al spec de la gramática.
 */
import { test, expect, Page } from '@playwright/test';
import { dispatch, st, toScreen } from './helpers/lienzo';
import { leerBitacora, indiceDe } from './helpers/bitacora';

const MARIA = { width: 1366, height: 643 };

async function dosPiezasUnaGirada(page: Page) {
  await page.goto('/');
  await page.waitForSelector('svg.pattern-svg', { timeout: 30000 });
  await page.waitForTimeout(800);

  // Una tira LARGA y ESTRECHA: girada 90°, su caja sin girar y su caja girada
  // casi no se solapan, que es lo que hace visible el defecto. Con un cuadrado
  // las dos cajas coinciden y el test pasaría con el bug dentro.
  await dispatch(page, 'project/addPiece', {
    id: 'tira', name: 'Tira',
    outline: [
      { type: 'M', values: [0, 0] }, { type: 'L', values: [240, 0] },
      { type: 'L', values: [240, 40] }, { type: 'L', values: [0, 40] }, { type: 'Z', values: [] },
    ],
    internals: [], position: { x: 200, y: 200 }, rotation: 90, mirrored: false,
    seamAllowance: 0, layer: 1, sublayer: 0, active: true, createdAt: 1, updatedAt: 1,
  });
  await page.waitForTimeout(400);
}

test.describe('Unir patrones engancha una pieza girada', () => {
  test.use({ viewport: MARIA });
  test.setTimeout(120_000);

  test('el clic sobre la tira girada la elige (esto ya funcionaba, y es el cinturón)', async ({ page }) => {
    await dosPiezasUnaGirada(page);

    await page.keyboard.press('j');
    await expect
      .poll(async () => (await st(page)).editor.activeTool, { timeout: 5000 })
      .toBe('merge');
    await page.waitForTimeout(300);

    // Centro REAL de la tira girada. La pieza ocupa 240×40 con origen en
    // (200,200) y giro de 90°: su centro geométrico está donde el giro lo deja,
    // no donde estaría sin girar.
    const centro = await page.evaluate(() => {
      const el = document.querySelector('svg.pattern-svg path.pattern-piece, svg.pattern-svg g.pattern-piece path');
      if (!el) return null;
      const r = (el as SVGGraphicsElement).getBoundingClientRect();
      return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
    });
    expect(centro, 'no se pintó la tira').not.toBeNull();

    // El primer clic solo escribe estado LOCAL del hook: no hay clase
    // `selected` que mirar. El oráculo que sí es inequívoco lo da la propia
    // caja negra — al clicar DOS VECES la misma pieza, `useMergeTool` registra
    // `unir:misma-pieza`. Ese registro solo existe si el hit-test la encontró
    // las dos veces; si falla, el primer clic hace `reset()` y el segundo se
    // limita a elegirla, sin registrar nada.
    await page.mouse.click(centro!.x, centro!.y);
    await page.waitForTimeout(400);
    await page.mouse.click(centro!.x, centro!.y);
    await page.waitForTimeout(500);

    const eventos = await leerBitacora(page);
    const i = indiceDe(eventos, 'gesture', 'no-paso-nada', (d) => d.razon === 'unir:misma-pieza');
    expect(
      i,
      'el clic sobre la tira girada no la enganchó: el hit-test mide contra el fantasma sin girar',
    ).toBeGreaterThanOrEqual(0);
  });

  test('y un clic FUERA de la tira girada no elige nada — ESTE es el defecto', async ({ page }) => {
    // El de arriba pasaba ya con el bug puesto: una caja demasiado grande engancha
    // de sobra el centro. El que lo caza es este, y por eso los dos van juntos —
    // uno solo, en cualquiera de las dos direcciones, da señal falsa.
    await dosPiezasUnaGirada(page);
    await page.keyboard.press('j');
    await expect
      .poll(async () => (await st(page)).editor.activeTool, { timeout: 5000 })
      .toBe('merge');
    await page.waitForTimeout(300);

    // Un punto que cae dentro de la caja SIN girar (la tira se extendería hacia
    // la derecha) pero fuera de la girada (que se extiende hacia abajo).
    const fuera = await toScreen(page, { x: 400, y: 210 });
    await page.mouse.click(fuera.x, fuera.y);
    await page.waitForTimeout(400);

    // Mismo oráculo, al revés: dos clics fuera no pueden producir el registro.
    const fuera2 = await toScreen(page, { x: 400, y: 210 });
    await page.mouse.click(fuera2.x, fuera2.y);
    await page.waitForTimeout(500);
    const eventos = await leerBitacora(page);
    expect(
      indiceDe(eventos, 'gesture', 'no-paso-nada', (d) => d.razon === 'unir:misma-pieza'),
      'enganchó desde fuera de la pieza girada: la caja es la del fantasma sin girar',
    ).toBe(-1);
  });
});
