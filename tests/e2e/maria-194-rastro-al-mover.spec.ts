import { test, expect, Page } from '@playwright/test';

/**
 * maria-194 — "no se porque aveces al mover una pieza se mueve muy bien. Y
 * solo en algunos casos, como uno que he detectado que es despues de haber
 * creado puntos de curva al mover la pieza cuando la estás arrastrando se
 * queda una sombra o recuerdo con los puntos y eso hay que cambiarlo deberia
 * moverse sin crear ningún rastro como ya lo hace muchas veces."
 *
 * El "algunos casos" es un camino concreto, reproducido el 2026-08-10:
 * entrar a "Editar patrón", NO pulsar Esc, cambiar a la flecha y arrastrar.
 * Nadie desmonta EditPatternOverlay al cambiar de herramienta, y ese overlay
 * se pinta bajo `translate(piece.position)` — la posición de REDUX — mientras
 * el arrastre mueve el grupo de la pieza por DOM directo. Medido antes del
 * fix: con la pieza desplazada +230,+130 px, las 4 anclas seguían clavadas en
 * su sitio viejo, y ahí se quedaban hasta soltar.
 *
 * Mismo contrato que maria-200 (la caja de transformación): la cromía que se
 * pinta desde Redux se esconde mientras dura el arrastre y vuelve al soltar.
 */

interface StoreWindow {
  __VINA_STORE__: {
    dispatch: (a: { type: string; payload?: unknown }) => void;
    getState: () => { tools: { activeTool2D: string } };
  };
}

async function waitForApp(page: Page) {
  await page.goto('/app/');
  await page.waitForSelector('svg.pattern-svg', { timeout: 15000 });
  await page.waitForTimeout(600);
}

async function setTool(page: Page, id: string) {
  await page.evaluate(i => {
    const s = (window as unknown as StoreWindow).__VINA_STORE__;
    s.dispatch({ type: 'editor/setActiveTool', payload: i });
    s.dispatch({ type: 'tools/setActiveTool2D', payload: i });
  }, id);
  await page.waitForTimeout(200);
}

const activeTool = (page: Page) =>
  page.evaluate(() => (window as unknown as StoreWindow).__VINA_STORE__.getState().tools.activeTool2D);

async function drawRect(page: Page) {
  await page.keyboard.press('s');
  await expect.poll(() => activeTool(page)).toBe('rectangle');
  await page.waitForTimeout(150);
  const box = await page.locator('svg.pattern-svg').boundingBox();
  if (!box) throw new Error('no pattern svg');
  const cx = box.x + box.width / 2, cy = box.y + box.height / 2;
  await page.mouse.move(cx - 170, cy - 95);
  await page.mouse.down();
  await page.mouse.move(cx + 170, cy + 95, { steps: 12 });
  await page.mouse.up();
  await page.waitForTimeout(500);
  return { cx, top: cy - 95 };
}

/** Centros en pantalla de cada ancla dibujada por los overlays de edición. */
const anchorCentres = (page: Page) => page.evaluate(() =>
  Array.from(document.querySelectorAll('[data-anchor-role]')).map(el => {
    const r = (el as SVGGElement).getBoundingClientRect();
    return { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2) };
  }));

test.describe('maria-194 — mover la pieza sin dejar rastro de puntos', () => {
  test.setTimeout(120_000);

  test('las anclas de Editar patrón no se quedan en el sitio viejo al arrastrar', async ({ page }) => {
    await waitForApp(page);
    const { cx, top } = await drawRect(page);

    await setTool(page, 'editPattern');
    await page.mouse.click(cx, top + 60);
    await page.waitForTimeout(500);
    const antes = await anchorCentres(page);
    expect(antes.length).toBeGreaterThan(0);

    // Cambia a la flecha SIN pulsar Esc: el overlay sigue montado (es el caso
    // que ella encontró; no lo cerramos, solo evitamos el rastro).
    await setTool(page, 'select');
    await expect.poll(async () => (await anchorCentres(page)).length).toBe(antes.length);

    // A mitad del arrastre no puede quedar NINGÚN ancla pintada en el sitio viejo
    await page.mouse.move(cx, top + 120);
    await page.mouse.down();
    await page.mouse.move(cx + 230, top + 250, { steps: 20 });
    await page.waitForTimeout(250);

    const durante = await anchorCentres(page);
    const quietas = durante.filter(d => antes.some(a => Math.abs(a.x - d.x) < 3 && Math.abs(a.y - d.y) < 3));
    expect(quietas).toHaveLength(0);

    // Y al soltar vuelven, ya en la posición nueva
    await page.mouse.up();
    await page.waitForTimeout(500);
    const despues = await anchorCentres(page);
    expect(despues).toHaveLength(antes.length);
    const movidas = despues.filter(d => antes.some(a => Math.abs(a.x - d.x) < 3 && Math.abs(a.y - d.y) < 3));
    expect(movidas).toHaveLength(0);
  });
});
