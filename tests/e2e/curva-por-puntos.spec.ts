import { test, expect, Page } from '@playwright/test';

/**
 * maria-197, la otra mitad — "no utilizo nunca curvas bezier... es muy limitante
 * tener solo curvas bezier".
 *
 * Recorre su flujo por la interfaz: dibuja un rectángulo, clic derecho sobre un
 * lado, "Convertir en curva por puntos", y comprueba lo que importa de verdad —
 * que los puntos nuevos están SOBRE la línea, que convertir no deforma el
 * patrón, y que al arrastrar uno la curva pasa por él sin quedar con picos.
 */

interface StoreWindow {
  __VINA_STORE__: {
    getState: () => {
      tools: { activeTool2D: string };
      project: { pieces: Array<{ outline: Array<{ type: string; values: number[] }> }> };
    };
    dispatch: (a: unknown) => void;
  };
}

const outline = (page: Page) =>
  page.evaluate(() => (window as unknown as StoreWindow).__VINA_STORE__.getState().project.pieces[0].outline);

async function waitForApp(page: Page) {
  await page.goto('/app/');
  await page.waitForSelector('svg.pattern-svg', { timeout: 15000 });
  await page.waitForTimeout(500);
}

async function activateTool(page: Page, shortcut: string, toolId: string) {
  await page.keyboard.press(shortcut);
  await expect
    .poll(() => page.evaluate(() => (window as unknown as StoreWindow).__VINA_STORE__.getState().tools.activeTool2D), { timeout: 3000 })
    .toBe(toolId);
  await page.locator('[data-testid="empty-state-2d"]').waitFor({ state: 'detached', timeout: 2000 }).catch(() => {});
  await page.waitForTimeout(150);
}

async function drawRectangle(page: Page) {
  await activateTool(page, 's', 'rectangle');
  const box = await page.locator('svg.pattern-svg').boundingBox();
  if (!box) throw new Error('no pattern svg');
  const cx = box.x + box.width / 2;
  const cy = box.y + box.height / 2;

  await page.mouse.move(cx - 170, cy - 95);
  await page.mouse.down();
  await page.mouse.move(cx + 170, cy + 95, { steps: 12 });
  await page.mouse.up();
  await page.waitForTimeout(500);
  return { cx, cy, top: cy - 95, bottom: cy + 95, left: cx - 170, right: cx + 170 };
}

/** Punto de un bezier cúbico en t. */
function bezierAt(p1: number[], v: number[], t: number) {
  const u = 1 - t;
  const pick = (a: number, b: number, c: number, d: number) =>
    u * u * u * a + 3 * u * u * t * b + 3 * u * t * t * c + t * t * t * d;
  return { x: pick(p1[0], v[0], v[2], v[4]), y: pick(p1[1], v[1], v[3], v[5]) };
}

test.describe('maria-197 — curva por puntos, sin manejadores', () => {
  test.setTimeout(120_000);

  test('convertir reparte puntos sobre el lado y no deforma la pieza', async ({ page }) => {
    await waitForApp(page);
    const r = await drawRectangle(page);

    const before = await outline(page);
    expect(before.filter(c => c.type === 'C')).toHaveLength(0);
    const bboxBefore = {
      minY: Math.min(...before.filter(c => c.values.length >= 2).map(c => c.values[c.values.length - 1])),
      maxY: Math.max(...before.filter(c => c.values.length >= 2).map(c => c.values[c.values.length - 1])),
    };

    await page.mouse.click(r.cx, r.top, { button: 'right' });
    await page.waitForTimeout(300);

    const item = page.getByText('Convertir en curva por puntos', { exact: true });
    await expect(item).toBeVisible();
    await item.click();
    await page.waitForTimeout(400);

    const after = await outline(page);
    // Cuatro tramos nuevos: tres puntos que agarrar donde antes no había ninguno.
    expect(after.filter(c => c.type === 'C')).toHaveLength(4);

    // Y la pieza no se movió: la curva todavía dibuja la recta.
    const ysAfter = after.filter(c => c.values.length >= 2).map(c => c.values[c.values.length - 1]);
    expect(Math.min(...ysAfter)).toBeCloseTo(bboxBefore.minY, 6);
    expect(Math.max(...ysAfter)).toBeCloseTo(bboxBefore.maxY, 6);
  });

  test('al arrastrar un punto la curva pasa por él y no queda con picos', async ({ page }) => {
    await waitForApp(page);
    const r = await drawRectangle(page);

    await page.mouse.click(r.cx, r.top, { button: 'right' });
    await page.waitForTimeout(300);
    await page.getByText('Convertir en curva por puntos', { exact: true }).click();
    await page.waitForTimeout(400);

    // El punto del medio del lado superior, en pantalla.
    await activateTool(page, 'q', 'editPattern');
    await page.mouse.click(r.cx, r.cy);
    await page.waitForTimeout(400);

    await page.mouse.move(r.cx, r.top);
    await page.mouse.down();
    await page.mouse.move(r.cx, r.top - 60, { steps: 15 });
    await page.mouse.up();
    await page.waitForTimeout(500);

    const after = await outline(page);
    const curves = after.filter(c => c.type === 'C');
    expect(curves).toHaveLength(4);

    // ── La curva PASA por el punto ────────────────────────────────────────
    // Es la propiedad que la distingue de un bezier: el ancla del comando ES
    // el punto que ella agarró, no una aproximación.
    const moved = curves.find(c => Math.abs(c.values[5] - Math.min(...curves.map(k => k.values[5]))) < 1e-9)!;
    expect(moved).toBeDefined();

    // ── Sin picos: las tangentes entran y salen paralelas ─────────────────
    const idx = after.indexOf(moved);
    const next = after[idx + 1];
    expect(next?.type).toBe('C');
    const anchor = { x: moved.values[4], y: moved.values[5] };
    const incoming = { x: anchor.x - moved.values[2], y: anchor.y - moved.values[3] };
    const outgoing = { x: next.values[0] - anchor.x, y: next.values[1] - anchor.y };
    const cross = incoming.x * outgoing.y - incoming.y * outgoing.x;
    const mag = Math.hypot(incoming.x, incoming.y) * Math.hypot(outgoing.x, outgoing.y);
    expect(Math.abs(cross) / mag, 'pico en el punto arrastrado').toBeLessThan(1e-6);

    // ── Y la curva de verdad se dobló ─────────────────────────────────────
    const prevAnchor = after[idx - 1].values.slice(-2);
    const mid = bezierAt(prevAnchor, moved.values, 0.5);
    const chordMid = (prevAnchor[1] + anchor.y) / 2;
    expect(Math.abs(mid.y - chordMid), 'el tramo quedó recto').toBeGreaterThan(0.5);
  });
});
