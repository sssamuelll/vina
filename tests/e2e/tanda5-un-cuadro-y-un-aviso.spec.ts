/**
 * Reunión María 2026-09-07 — causa C (las dos gramáticas de cota) y fallo 11
 * (la pluma termina abierta sin avisar).
 *
 * CAUSA C. Ella eligió la cota negra tres veces y dio la razón, que no es
 * cromática:
 *
 *   [21:21] "me gusta más este cuadro negrito porque es más minimalista […]
 *            los ángulos y la distancia están juntos, ocupa menos"
 *   [22:23] "esto ocupa más, **he creado dos cuadros para una misma
 *            información** que en el otro estaba más acopladito"
 *
 * En el código eso es literal: `cotas.ts` emite `tramo-largo` y
 * `tramo-angulo` como DOS cotas del mismo tramo. La enmienda § 14 de la spec
 * de cotas vivas dice qué gana — la geometría de la negra, la legibilidad de
 * la azul — y esto lo mide: un solo cuadro por tramo, con las dos magnitudes
 * dentro, y con letra que se lea (de la negra dijo también "la letra casi ni
 * se lee" [07:31], y hoy es fontSize 10/z).
 *
 * FALLO 11. La palabra que decide el arreglo es "rendir":
 *
 *   [14:34] "ahí mismo te dice: oye, mira, no puedo **rendir**, o sea, esta
 *            pieza así, ¿me la cierras o qué?"
 *
 * No pide que se prohíba terminar abierto —eso está ratificado en la spec de
 * línea interna y hay un e2e que depende de ello—: pide que se le avise de
 * que así no se puede simular. Y el aviso va por el canal de toasts, porque
 * el contrato de interfaz prohíbe confirm/alert/prompt nativos (R7 = 0).
 */
import { test, expect, type Page } from '@playwright/test';
import { waitForApp } from './helpers/sim';
import { st, addPiece, toScreen } from './helpers/lienzo';

async function activar(page: Page, tecla: string, id: string) {
  await page.keyboard.press(tecla);
  await expect.poll(async () => (await st(page)).editor.activeTool, { timeout: 5000 }).toBe(id);
  await page.waitForTimeout(120);
}

async function clicEn(page: Page, p: { x: number; y: number }) {
  const s = await toScreen(page, p);
  await page.mouse.move(s.x, s.y);
  await page.mouse.click(s.x, s.y);
  await page.waitForTimeout(200);
}

test.describe('tanda 5 — un cuadro para una información, y un aviso cuando no se puede simular', () => {
  test.setTimeout(120_000);

  test('causa C — el tramo de una interna se acota en UN cuadro, no en dos', async ({ page }) => {
    await waitForApp(page);
    await addPiece(page, 'pieza', { x: 100, y: 100 }, 300, 200);

    // Dibuja una interna de un tramo dentro de la pieza y luego la selecciona.
    await activar(page, 'g', 'internalShape');
    await clicEn(page, { x: 150, y: 150 });
    await clicEn(page, { x: 300, y: 220 });
    await page.keyboard.press('Enter');
    await page.waitForTimeout(400);

    // ENMENDADO el 2026-09-14 (#1154). Estos dos casos se apoyaban en que
    // cerrar el trazo dejaba el tramo seleccionado, y esa autoselección murió:
    // plantaba la cota bajo el cursor, justo donde iba el clic siguiente. Lo
    // que miden —que el largo y el ángulo van en UN cuadro, y que ese número se
    // lee— no cambia ni un ápice; solo que ahora el tramo se elige clicándolo,
    // que es como se elige todo lo demás.
    await activar(page, 'z', 'select');
    await clicEn(page, { x: 225, y: 185 });
    await expect(page.locator('[data-internal-line-segment]'), 'el clic tiene que caer en el tramo').toHaveCount(1);

    // Los chips del tramo son `button.cota` con aria "Largo: …" y "Ángulo: …".
    const chips = page.locator('button.cota').filter({ hasText: /mm|°/ });
    const cuantos = await chips.count();

    expect(
      cuantos,
      'un tramo tiene UN largo y UN ángulo: eso es una información, y va en un cuadro',
    ).toBe(1);

    // Y las dos magnitudes tienen que estar dentro de ese cuadro, no una
    // dentro y otra desaparecida.
    const texto = await chips.first().innerText();
    expect(texto, 'el cuadro lleva el largo').toMatch(/\d+([.,]\d+)?\s*mm/);
    expect(texto, 'y el ángulo, juntos, que es lo que ella eligió').toMatch(/[-−]?\d+([.,]\d+)?\s*°/);
  });

  test('causa C — la letra del cuadro se lee', async ({ page }) => {
    await waitForApp(page);
    await addPiece(page, 'pieza', { x: 100, y: 100 }, 300, 200);
    await activar(page, 'g', 'internalShape');
    await clicEn(page, { x: 150, y: 150 });
    await clicEn(page, { x: 300, y: 220 });
    await page.keyboard.press('Enter');
    await page.waitForTimeout(400);

    // ENMENDADO el 2026-09-14 (#1154). Estos dos casos se apoyaban en que
    // cerrar el trazo dejaba el tramo seleccionado, y esa autoselección murió:
    // plantaba la cota bajo el cursor, justo donde iba el clic siguiente. Lo
    // que miden —que el largo y el ángulo van en UN cuadro, y que ese número se
    // lee— no cambia ni un ápice; solo que ahora el tramo se elige clicándolo,
    // que es como se elige todo lo demás.
    await activar(page, 'z', 'select');
    await clicEn(page, { x: 225, y: 185 });
    await expect(page.locator('[data-internal-line-segment]'), 'el clic tiene que caer en el tramo').toHaveCount(1);

    const chip = page.locator('button.cota').filter({ hasText: /mm|°/ }).first();
    await expect(chip).toBeVisible();
    const px = await chip.evaluate(el => parseFloat(getComputedStyle(el).fontSize));

    // "La letra casi ni se lee" [07:31]. El readout de hoy es fontSize 10/z:
    // a zoom 1 son 10 px, y por debajo de eso es ilegible en un monitor de
    // trabajo. La enmienda toma la geometría de la negra y el tamaño de la azul.
    expect(px, 'el número que ella tiene que leer todo el día no baja de 11 px').toBeGreaterThanOrEqual(11);
  });

  test('fallo 11 — con tres puntos ya no hay nada que avisar: Enter cierra el trazo', async ({ page }) => {
    await waitForApp(page);
    await activar(page, 'h', 'pen');

    // ENMENDADO el 2026-09-09 (contrato `2026-09-09-lo-que-se-ve-y-cuando`
    // § 4). Antes esta prueba exigía el AVISO tras tres puntos y Enter. El
    // aviso funcionaba —se verificó a mano en el navegador el 09-09 y aparece—
    // pero avisar de algo que se puede resolver solo es peor que resolverlo, y
    // el contrato de interfaz § 4 ya lo tenía escrito: "prefiere ACTUAR Y
    // OFRECER DESHACER antes que preguntar".
    await clicEn(page, { x: 150, y: 150 });
    await clicEn(page, { x: 350, y: 150 });
    await clicEn(page, { x: 350, y: 300 });
    await page.keyboard.press('Enter');
    await page.waitForTimeout(600);

    const pieza = (await st(page)).project.pieces[0];
    expect(pieza, 'la pieza se crea igual').toBeTruthy();
    expect(
      pieza.outline.map((c: { type: string }) => c.type),
      'con tres nodos hay polígono: Enter lo cierra solo',
    ).toContain('Z');

    await expect(
      page.locator('.toast__message').filter({ hasText: /no se puede simular/i }),
      'y si cerró, no queda nada que advertir',
    ).toHaveCount(0);

    // La salida si no era eso: deshacer. No un modal, no una pregunta.
    await page.keyboard.press('Control+z');
    await expect.poll(async () => (await st(page)).project.pieces.length).toBe(0);
  });

  test('fallo 11 — dos puntos ya no son una pieza que no simula: son un trazo, y no hay nada que rendir', async ({ page }) => {
    // ENMENDADO el 2026-09-12 (spec `2026-09-12-trazos-lineas-de-construccion`
    // § 3.1-3.2, #1158). Este caso exigía que dos puntos + Enter dejaran una
    // PIEZA abierta con el aviso "no se puede simular" — la letra del BLOCKER
    // de Serrano era "no se llega en silencio a una pieza que no simula".
    // La Pluma ya no puede crear una pieza abierta en absoluto: con dos nodos
    // el resultado es un TRAZO (línea de construcción), y un trazo no es una
    // pieza — no hay nada que "no simule" de lo que avisar. El BLOCKER sigue
    // cerrado, por construcción en vez de por aviso (spec § 3.2, "Por qué no
    // rompe el BLOCKER de Serrano").
    await waitForApp(page);
    await activar(page, 'h', 'pen');

    await clicEn(page, { x: 150, y: 150 });
    await clicEn(page, { x: 350, y: 150 });
    await page.keyboard.press('Enter');
    await page.waitForTimeout(600);

    const { pieces, trazos } = (await st(page)).project;
    expect(pieces, 'dos nodos no son un polígono: no debe nacer ninguna pieza').toHaveLength(0);
    expect(trazos).toHaveLength(1);
    expect(
      trazos[0].path.map((c: { type: string }) => c.type),
      'dos nodos no cierran nada',
    ).not.toContain('Z');

    await expect(
      page.getByText(/abiert|no se puede simular|no simula/i).first(),
      'un trazo no es una pieza: no hay nada que avisar',
    ).toHaveCount(0);
  });
});
