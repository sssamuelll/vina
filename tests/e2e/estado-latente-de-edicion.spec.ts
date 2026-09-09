import { test, expect, Page } from '@playwright/test';

/**
 * Reunión María 2026-09-07 — los fallos 3, 7 y el cursor son UNA raíz.
 *
 * El estado de edición (`editPatternTool.isEditing`, `nodeEditor.isEditing`)
 * sobrevive a la herramienta que lo encendió, y desde ahí manda sobre cosas
 * que ya no le tocan:
 *
 *  - `showConvertedPoints` (PatternEditor.tsx:331) sale temprano si Q está
 *    editando, con este argumento escrito al lado: "esa superficie ya los
 *    enseña: no se le roba el modo". **Es falso.** `EditPatternOverlay` no
 *    pinta ni un manejador de control — el único que los pinta es
 *    `NodeEditorOverlay`. Por eso ella convertía y *"seguía sin ver nada"*
 *    [11:38], y su siguiente arrastre movía la pieza [11:09].
 *  - `ToolOverlay.tsx:294` monta el overlay de Editar patrón por
 *    `editPatternIsEditing` a secas, sin exigir que Q siga activa: el ancla
 *    dorada se queda pegada al volver a Seleccionar [06:21].
 *  - `getCursor` (useEditorInteractions.ts:1254) devuelve por
 *    `nodeEditor.isEditing` ANTES de mirar `activeTool`, así que un estado
 *    latente decide el cursor de cualquier herramienta [12:11].
 *
 * Los tres asserts son de resultado, no de implementación: no dicen POR DÓNDE
 * arreglarlo, solo qué tiene que ver María.
 */

interface StoreWindow {
  __VINA_STORE__: {
    getState: () => {
      tools: { activeTool2D: string };
      project: { pieces: Array<{ id: string; position: { x: number; y: number }; outline: Array<{ type: string; values: number[] }> }> };
    };
    dispatch: (a: unknown) => void;
  };
}

const AMARILLO = '#FFD700';

async function waitForApp(page: Page) {
  await page.goto('/');
  await page.waitForSelector('svg.pattern-svg', { timeout: 15000 });
  await page.waitForTimeout(500);
}

async function activateTool(page: Page, shortcut: string, toolId: string) {
  await page.keyboard.press(shortcut);
  await expect
    .poll(() => page.evaluate(() => (window as unknown as StoreWindow).__VINA_STORE__.getState().tools.activeTool2D), { timeout: 3000 })
    .toBe(toolId);
  await page.locator('[data-testid="empty-state-2d"]').waitFor({ state: 'detached', timeout: 2000 }).catch(() => {});
  await page.waitForTimeout(120);
}

/** Dibuja un rectángulo arrastrando, como lo hace ella. Devuelve sus bordes. */
async function dibujarRectangulo(page: Page) {
  await activateTool(page, 's', 'rectangle');
  const box = await page.locator('svg.pattern-svg').boundingBox();
  if (!box) throw new Error('no pattern svg');
  const cx = box.x + box.width / 2;
  const cy = box.y + box.height / 2;
  const bordes = { left: cx - 170, right: cx + 170, top: cy - 95, bottom: cy + 95, cx, cy };
  await page.mouse.move(bordes.left, bordes.top);
  await page.mouse.down();
  await page.mouse.move(bordes.right, bordes.bottom, { steps: 12 });
  await page.mouse.up();
  await page.waitForTimeout(500);
  return bordes;
}

const tiposDeContorno = (page: Page) =>
  page.evaluate(() =>
    (window as unknown as StoreWindow).__VINA_STORE__.getState().project.pieces[0].outline.map(c => c.type));

const cursorDelLienzo = (page: Page) =>
  page.locator('svg.pattern-svg').evaluate(el => getComputedStyle(el).cursor);

test.describe('el estado de edición no manda fuera de su herramienta', () => {
  test.setTimeout(120_000);

  test('fallo 3 — convertir en curva con Editar patrón abierto deja ver y moldear la curva', async ({ page }) => {
    await waitForApp(page);
    const b = await dibujarRectangulo(page);

    // Entra en Editar patrón y empieza a editar ESA pieza. Es el paso que la
    // sesión del 07-09 tenía puesto y el spec maria-197 no: allí se convierte
    // sin pasar nunca por Q, y por eso aquel pasa en verde con este roto.
    await activateTool(page, 'q', 'editPattern');
    await page.mouse.click(b.cx, b.cy);
    await page.waitForTimeout(300);

    await page.mouse.click(b.cx, b.top, { button: 'right' });
    await page.waitForTimeout(300);
    const item = page.getByText('Convertir en curva', { exact: true });
    await expect(item, 'el menú tiene que ofrecer convertir el lado bajo el cursor').toBeVisible();
    await item.click();
    await page.waitForTimeout(400);

    // El dato sí se escribe hoy — esto ya está verde y se queda como control.
    expect(await tiposDeContorno(page), 'el lado tiene que quedar como curva en el modelo').toContain('C');

    // Y esto es lo que ella no veía: sin manejadores, una curva convertida es
    // indistinguible de una recta y no hay forma de darle forma.
    await expect(
      page.locator('[class*="control-handle"]'),
      'tras convertir tiene que haber manejadores de curva a la vista',
    ).toHaveCount(2);
  });

  test('fallo 7 — el ancla dorada no sobrevive al volver a Seleccionar', async ({ page }) => {
    await waitForApp(page);
    const b = await dibujarRectangulo(page);

    await activateTool(page, 'q', 'editPattern');
    await page.mouse.click(b.cx, b.cy);
    await page.waitForTimeout(300);
    await page.mouse.click(b.left, b.top);
    await page.waitForTimeout(300);

    const dorado = page.locator(`[fill="${AMARILLO}" i], [stroke="${AMARILLO}" i]`);
    await expect(dorado, 'el nodo elegido tiene que pintarse dorado mientras Q está activa').not.toHaveCount(0);

    await activateTool(page, 'z', 'select');

    await expect(
      dorado,
      'al salir de Editar patrón no puede quedar ningún nodo dorado: el sujeto ya no existe',
    ).toHaveCount(0);
  });

  test('el cursor lo manda la herramienta activa, no un estado de edición latente', async ({ page }) => {
    await waitForApp(page);
    const b = await dibujarRectangulo(page);

    // Convertir en curva enciende el editor de nodos (activa editCurve).
    await page.mouse.click(b.cx, b.top, { button: 'right' });
    await page.waitForTimeout(300);
    await page.getByText('Convertir en curva', { exact: true }).click();
    await page.waitForTimeout(400);

    // Ella se va a otra herramienta. El editor de nodos queda encendido detrás.
    await activateTool(page, 's', 'rectangle');
    await page.mouse.move(b.cx, b.cy);
    await page.waitForTimeout(150);

    expect(
      await cursorDelLienzo(page),
      'con Rectángulo activa el cursor es la cruz, lo diga quien lo diga por detrás',
    ).toBe('crosshair');

    // Y no cambia por pasar cerca de un nodo: eso es el parpadeo que ella
    // describió como "las luces de una discoteca" [00:28].
    await page.mouse.move(b.left, b.top);
    await page.waitForTimeout(150);
    expect(
      await cursorDelLienzo(page),
      'pasar sobre un nodo no puede cambiar el cursor de otra herramienta',
    ).toBe('crosshair');
  });
});
