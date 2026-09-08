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

    // Dibuja una interna de un tramo dentro de la pieza y la deja seleccionada.
    await activar(page, 'g', 'internalShape');
    await clicEn(page, { x: 150, y: 150 });
    await clicEn(page, { x: 300, y: 220 });
    await page.keyboard.press('Enter');
    await page.waitForTimeout(400);

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

    const chip = page.locator('button.cota').filter({ hasText: /mm|°/ }).first();
    await expect(chip).toBeVisible();
    const px = await chip.evaluate(el => parseFloat(getComputedStyle(el).fontSize));

    // "La letra casi ni se lee" [07:31]. El readout de hoy es fontSize 10/z:
    // a zoom 1 son 10 px, y por debajo de eso es ilegible en un monitor de
    // trabajo. La enmienda toma la geometría de la negra y el tamaño de la azul.
    expect(px, 'el número que ella tiene que leer todo el día no baja de 11 px').toBeGreaterThanOrEqual(11);
  });

  test('fallo 11 — terminar una pieza abierta lo dice, y no con un diálogo del navegador', async ({ page }) => {
    await waitForApp(page);
    await activar(page, 'h', 'pen');

    // Tres puntos y Enter: termina abierta. Eso SIGUE PERMITIDO —está
    // ratificado— pero deja de ser mudo.
    await clicEn(page, { x: 150, y: 150 });
    await clicEn(page, { x: 350, y: 150 });
    await clicEn(page, { x: 350, y: 300 });
    await page.keyboard.press('Enter');
    await page.waitForTimeout(600);

    expect((await st(page)).project.pieces, 'la pieza se crea igual: terminar abierto está ratificado').toHaveLength(1);

    await expect(
      page.getByText(/abiert|no se puede simular|no simula/i).first(),
      'pero tiene que decirle que así no se puede rendir — es literalmente lo que pidió',
    ).toBeVisible({ timeout: 5000 });
  });
});
