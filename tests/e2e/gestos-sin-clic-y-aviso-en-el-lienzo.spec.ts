/**
 * Revisión asistida 2026-09-10 — dos notas de QA sobre el PR #1149 ya
 * mergeado, escritas primero como comentarios en el PR
 * (issuecomment-5615735370, issuecomment-5615916096) y aquí convertidas en
 * contrato: `docs/superpowers/specs/2026-09-10-gestos-sin-clic-design.md`.
 *
 * § 1 — Samuel: "quiero que las piezas me hablen [...] sin tener que hacer
 * clicks nunca para que los eventos funcionen". Hoy `useEditPattern` exige un
 * clic previo (`enterEdit`) antes de calcular cualquier hover — el resalte de
 * tramo (`data-tramo-hover`) no aparece hasta ese clic.
 *
 * § 2 — Samuel, sobre el aviso de pieza abierta: "me gustaría que saliera ahí
 * mismo cerquita de la línea". Hoy es un toast genérico, una sola vez, al
 * crear la pieza.
 */
import { test, expect, type Page } from '@playwright/test';
import { waitForApp } from './helpers/sim';
import { st, dispatch, addPiece, toScreen, activarHerramienta } from './helpers/lienzo';

test.describe('§ 1 — Editar patrón: el hover no espera un clic', () => {
  test.setTimeout(90_000);

  test('sin pieza seleccionada y sin haber clicado antes, pasar el mouse sobre un tramo lo resalta', async ({ page }) => {
    await waitForApp(page);
    await addPiece(page, 'p1', { x: 100, y: 100 }, 200, 150);
    expect((await st(page)).editor.selectedPieceIds, 'este caso solo vale sin selección previa').toHaveLength(0);

    await activarHerramienta(page, 'q', 'editPattern');

    // Ni un solo clic hasta aquí — solo mover el mouse sobre el lado
    // superior del rectángulo (de 100,100 a 300,100 en espacio de patrón).
    const s = await toScreen(page, { x: 200, y: 100 });
    await page.mouse.move(s.x, s.y);
    await page.waitForTimeout(200);

    await expect(
      page.locator('[data-tramo-hover]'),
      'el resalte tiene que aparecer con solo pasar el mouse, sin haber clicado para "entrar"',
    ).toHaveCount(1);
  });

  test('el puntero también cambia sin clic previo — no solo el resalte', async ({ page }) => {
    // Encontrado en vivo por Samuel el 2026-09-10: el resalte de tramo
    // funcionaba sin clic, pero el cursor se quedaba en `default` — la señal
    // quedaba a medias. `getCursor()` (useEditPattern.ts) y su llamador
    // (useEditorInteractions.ts:1285) tenían la MISMA guarda de
    // `state.isEditing` que ya se había quitado de `handleMouseMove`.
    await waitForApp(page);
    await addPiece(page, 'p1', { x: 100, y: 100 }, 200, 150);
    await activarHerramienta(page, 'q', 'editPattern');

    const svg = page.locator('svg.pattern-svg');
    const lejos = await toScreen(page, { x: 500, y: 500 });
    await page.mouse.move(lejos.x, lejos.y);
    await page.waitForTimeout(150);
    expect(
      await svg.evaluate(el => getComputedStyle(el).cursor),
      'lejos de cualquier tramo, el puntero es el de siempre',
    ).toBe('default');

    const s = await toScreen(page, { x: 200, y: 100 });
    await page.mouse.move(s.x, s.y);
    await page.waitForTimeout(200);
    expect(
      await svg.evaluate(el => getComputedStyle(el).cursor),
      'sobre el tramo, sin haber clicado, el puntero tiene que avisar que es accionable',
    ).toBe('pointer');
  });

  test('al alejar el mouse de cualquier tramo, el resalte se va', async ({ page }) => {
    await waitForApp(page);
    await addPiece(page, 'p1', { x: 100, y: 100 }, 200, 150);
    await activarHerramienta(page, 'q', 'editPattern');

    const sobreElLado = await toScreen(page, { x: 200, y: 100 });
    await page.mouse.move(sobreElLado.x, sobreElLado.y);
    await page.waitForTimeout(200);
    await expect(page.locator('[data-tramo-hover]')).toHaveCount(1);

    const lejos = await toScreen(page, { x: 500, y: 500 });
    await page.mouse.move(lejos.x, lejos.y);
    await page.waitForTimeout(200);
    await expect(page.locator('[data-tramo-hover]')).toHaveCount(0);
  });

  test('el clic sobre el tramo resaltado sigue entrando en edición como siempre', async ({ page }) => {
    // Guarda de no-regresión: el hover sin clic no puede reemplazar el gesto
    // de ENTRAR — arrastrar nodos y el menú contextual siguen pidiendo el
    // primer clic, que es la acción en sí, no una señal que faltaba.
    await waitForApp(page);
    await addPiece(page, 'p1', { x: 100, y: 100 }, 200, 150);
    await activarHerramienta(page, 'q', 'editPattern');

    const s = await toScreen(page, { x: 200, y: 100 });
    await page.mouse.move(s.x, s.y);
    await page.mouse.click(s.x, s.y);
    await page.waitForTimeout(250);

    const editando = await page.evaluate(() =>
      (window as unknown as { __VINA_STORE__: { getState: () => unknown } }).__VINA_STORE__.getState());
    expect(editando, 'el store tiene que existir para leer algo').toBeTruthy();

    // La entrada real se ve en el DOM: los círculos de ancla del editor de
    // nodos solo se pintan con `editingPieceId` puesto.
    await expect(
      page.locator('[data-anchor-role]'),
      'clicar tiene que seguir entrando de verdad: nodos visibles',
    ).not.toHaveCount(0);
  });

  test('una pieza bloqueada no habla: sin resalte al pasarle el mouse por encima', async ({ page }) => {
    await waitForApp(page);
    await addPiece(page, 'p1', { x: 100, y: 100 }, 200, 150);
    await dispatch(page, 'project/updatePiece', {
      ...(await st(page)).project.pieces[0],
      locked: true,
    });
    await page.waitForTimeout(200);
    await activarHerramienta(page, 'q', 'editPattern');

    const s = await toScreen(page, { x: 200, y: 100 });
    await page.mouse.move(s.x, s.y);
    await page.waitForTimeout(200);

    await expect(
      page.locator('[data-tramo-hover]'),
      'una pieza bloqueada no es accionable: no tiene por qué hablar',
    ).toHaveCount(0);
  });
});

test.describe('§ 2 — la pieza abierta avisa junto a ella, no en una esquina', () => {
  test.setTimeout(90_000);

  async function clicEn(page: Page, p: { x: number; y: number }) {
    const s = await toScreen(page, p);
    await page.mouse.move(s.x, s.y);
    await page.mouse.click(s.x, s.y);
    await page.waitForTimeout(150);
  }

  test('con dos nodos ya no hay pieza que avisar: es un trazo, sin toast y sin aviso en el lienzo', async ({ page }) => {
    // ENMENDADO el 2026-09-12 (spec `2026-09-12-trazos-lineas-de-construccion`
    // § 3.1-3.2, #1158). Este caso medía el aviso "abierta: no se puede
    // simular" dibujado sobre una pieza de dos nodos. La Pluma ya no crea
    // piezas abiertas: con dos nodos el resultado es un trazo (línea de
    // construcción), que no es una pieza y no lleva margen, capa ni aviso de
    // simulación — no hay qué "no se puede simular" del qué avisar.
    await waitForApp(page);
    await activarHerramienta(page, 'h', 'pen');
    await clicEn(page, { x: 150, y: 150 });
    await clicEn(page, { x: 350, y: 150 });
    await page.keyboard.press('Enter');
    await page.waitForTimeout(400);

    const { pieces, trazos } = (await st(page)).project;
    expect(pieces, 'dos nodos no son un polígono: no debe nacer ninguna pieza').toHaveLength(0);
    expect(trazos).toHaveLength(1);
    expect(trazos[0].path.map(c => c.type), 'dos nodos: el trazo queda abierto').not.toContain('Z');

    await expect(
      page.locator('.toast__message'),
      'un trazo no es una pieza: sigue sin haber toast',
    ).toHaveCount(0);

    await expect(
      page.getByText('abierta: no se puede simular'),
      'un trazo no es una pieza: no hay aviso de simulación que dibujar',
    ).toHaveCount(0);
  });

  test('una pieza cerrada no lleva ningún aviso', async ({ page }) => {
    await waitForApp(page);
    await addPiece(page, 'p1', { x: 100, y: 100 }, 200, 150);
    await page.waitForTimeout(200);

    await expect(page.getByText('abierta: no se puede simular')).toHaveCount(0);
  });

  test('un trazo de dos nodos tampoco lleva el aviso más tarde, ni cambiando de herramienta', async ({ page }) => {
    // ENMENDADO el 2026-09-12 (#1158): este caso medía que el aviso, al ser
    // derivado del `outline` y no un evento, siguiera visible tras cambiar de
    // herramienta. Con dos nodos ya no hay pieza —es un trazo— así que la
    // propiedad que se mide ahora es la contraria: sigue sin haber nada que
    // avisar, ni al crear ni después.
    await waitForApp(page);
    await activarHerramienta(page, 'h', 'pen');
    await clicEn(page, { x: 150, y: 150 });
    await clicEn(page, { x: 350, y: 150 });
    await page.keyboard.press('Enter');
    await page.waitForTimeout(400);

    await activarHerramienta(page, 'z', 'select');
    await page.waitForTimeout(1000);

    expect((await st(page)).project.pieces, 'sigue sin haber ninguna pieza').toHaveLength(0);
    await expect(page.getByText('abierta: no se puede simular')).toHaveCount(0);
  });
});
