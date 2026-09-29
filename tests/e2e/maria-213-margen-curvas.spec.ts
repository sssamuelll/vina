import { test, expect, Page } from '@playwright/test';

/**
 * maria-213 — "cuando clique el resto de la pieza que es una sola curva no
 * identifico bien los márgenes curvos como se ve en la imagen, creando esa V
 * en azul".
 *
 * Reproducido el 2026-08-10 con un arco de 90mm de flecha: clicar EXACTAMENTE
 * encima del borde curvo devolvía `saSelection: null` (el borde era
 * inseleccionable, y el clic caía al cuerpo y volvía a aplicar el margen a
 * toda la pieza), y cuando la curva era lo bastante plana como para caer
 * dentro del umbral, el resalte se pintaba con 2 puntos: la cuerda, no el
 * trazo. Las dos superficies medían la curva como la recta entre sus extremos.
 */

interface Piece {
  id: string;
  position: { x: number; y: number };
  outline: Array<{ type: string; values: number[] }>;
}
interface StoreWindow {
  __VINA_STORE__: {
    dispatch: (a: { type: string; payload?: unknown }) => void;
    getState: () => {
      tools: { activeTool2D: string };
      editor: { saSelection: { kind: string; items: Array<{ edgeId: string }> } | null };
      project: { pieces: Piece[] };
    };
  };
}

const S = (page: Page) => page.evaluate(() => (window as unknown as StoreWindow).__VINA_STORE__.getState());
const activeTool = (page: Page) =>
  page.evaluate(() => (window as unknown as StoreWindow).__VINA_STORE__.getState().tools.activeTool2D);

async function waitForApp(page: Page) {
  await page.goto('/app/');
  await page.waitForSelector('svg.pattern-svg', { timeout: 15000 });
  await page.waitForTimeout(600);
}

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

/** Convierte el borde de arriba en curva y la abomba tirando de sus manejadores. */
async function arquearBordeSuperior(page: Page, cx: number, top: number) {
  await page.mouse.click(cx, top, { button: 'right' });
  await page.waitForTimeout(400);
  await page.getByText('Convertir en curva', { exact: true }).click();
  await page.waitForTimeout(600);
  const handles = page.locator('.node-editor__control-handle');
  for (let i = 0; i < Math.min(await handles.count(), 2); i++) {
    const bb = await handles.nth(i).boundingBox();
    if (!bb) continue;
    const hx = bb.x + bb.width / 2, hy = bb.y + bb.height / 2;
    await page.mouse.move(hx, hy);
    await page.mouse.down();
    await page.mouse.move(hx, hy - 120, { steps: 14 });
    await page.mouse.up();
    await page.waitForTimeout(350);
  }
}

/** Punto del bezier del comando 1, en coordenadas de patrón. */
function bezierAt(piece: Piece, t: number) {
  const [x0, y0] = piece.outline[0].values;
  const [x1, y1, x2, y2, x3, y3] = piece.outline[1].values;
  const m = 1 - t;
  return {
    x: piece.position.x + m * m * m * x0 + 3 * m * m * t * x1 + 3 * m * t * t * x2 + t * t * t * x3,
    y: piece.position.y + m * m * m * y0 + 3 * m * m * t * y1 + 3 * m * t * t * y2 + t * t * t * y3,
  };
}

const toScreen = (page: Page, p: { x: number; y: number }) =>
  page.evaluate(([x, y]) => {
    const svg = document.querySelector('svg.pattern-svg') as SVGSVGElement;
    const g = document.querySelector('[data-pan-zoom-group]') as SVGGElement;
    const pt = svg.createSVGPoint();
    pt.x = x; pt.y = y;
    const s = pt.matrixTransform(g.getScreenCTM()!);
    return { x: s.x, y: s.y };
  }, [p.x, p.y]);

test.describe('maria-213 — el margen entiende los bordes curvos', () => {
  test.setTimeout(120_000);

  test('clicar encima de la curva selecciona ese borde y el resalte la sigue', async ({ page }) => {
    await waitForApp(page);
    const { cx, top } = await drawRect(page);
    await arquearBordeSuperior(page, cx, top);

    const piece = (await S(page)).project.pieces[0];
    expect(piece.outline[1].type).toBe('C');
    // La curva tiene que haberse despegado de verdad de su cuerda.
    const flecha = Math.abs(bezierAt(piece, 0.5).y - (piece.position.y + piece.outline[0].values[1]));
    expect(flecha).toBeGreaterThan(40);

    // Como ella: primero el clic al cuerpo, que aplica el margen a toda la pieza.
    await page.keyboard.press('o');
    await expect.poll(() => activeTool(page)).toBe('seamAllowance');
    await page.mouse.click(cx, top + 120);
    await page.waitForTimeout(500);

    // Y ahora el clic justo encima del arco: tiene que seleccionar ESE borde.
    const apex = await toScreen(page, bezierAt(piece, 0.5));
    await page.mouse.click(apex.x, apex.y);
    await page.waitForTimeout(500);
    const sel = (await S(page)).editor.saSelection;
    expect(sel?.kind).toBe('edge');

    // El resalte se pinta siguiendo el trazo, no la cuerda.
    const highlight = page.locator('[data-testid="sa-edge-highlight"]').first();
    await expect(highlight).toHaveCount(1);
    const pts = (await highlight.getAttribute('points'))!.trim().split(/\s+/)
      .map(s => { const [a, b] = s.split(',').map(Number); return { x: a, y: b }; });
    expect(pts.length).toBeGreaterThan(2);

    // Desviación máxima del resalte contra la curva real: unos pocos mm.
    let maxDev = 0;
    for (let i = 0; i <= 60; i++) {
      const q = bezierAt(piece, i / 60);
      let best = Infinity;
      for (let j = 0; j + 1 < pts.length; j++) {
        const a = pts[j], b = pts[j + 1];
        const vx = b.x - a.x, vy = b.y - a.y;
        const L2 = vx * vx + vy * vy || 1;
        const t = Math.max(0, Math.min(1, ((q.x - a.x) * vx + (q.y - a.y) * vy) / L2));
        best = Math.min(best, Math.hypot(q.x - (a.x + t * vx), q.y - (a.y + t * vy)));
      }
      maxDev = Math.max(maxDev, best);
    }
    expect(maxDev).toBeLessThan(2);
  });
});
