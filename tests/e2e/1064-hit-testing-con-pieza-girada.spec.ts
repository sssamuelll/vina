import { test, expect, Page } from '@playwright/test';

/**
 * #1064 — con una pieza girada, clicar donde el borde SE VE no enganchaba nada.
 *
 * Los unitarios prueban las funciones de hit-test una a una. Esto lo prueba
 * donde la usuaria lo vive: gira la pieza con el tirador de verdad —no
 * inyectando `rotation` en el store— y luego pasa el ratón por encima del borde
 * tal como aparece en pantalla.
 *
 * Que el giro venga del tirador importa: #1064 nace justo de que #1033 volvió
 * ese tirador declarativo. Sembrar `rotation` a mano probaría el arreglo pero
 * no el camino que lo destapó.
 */

async function waitForApp(page: Page) {
  await page.goto('/app/');
  await page.waitForSelector('svg.pattern-svg', { timeout: 15000 });
  await page.waitForTimeout(1000);
}

async function dispatch(page: Page, action: { type: string; payload?: unknown }) {
  return page.evaluate((act) => {
    const root = document.getElementById('root');
    if (!root) return;
    const key = Object.keys(root).find(k => k.startsWith('__reactContainer'));
    if (!key) return;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const queue = [(root as any)[key]];
    while (queue.length > 0) {
      const node = queue.shift();
      if (!node) continue;
      if (node.memoizedProps?.store?.dispatch) {
        node.memoizedProps.store.dispatch(act);
        return;
      }
      if (node.child) queue.push(node.child);
      if (node.sibling) queue.push(node.sibling);
    }
  }, action);
}

interface StoreWindow {
  __VINA_STORE__: {
    getState: () => {
      editor: { activeTool: string; selectedPieceIds: string[] };
      project: { pieces: Array<{ id: string; rotation: number }>; seams: unknown[] };
    };
  };
}

const rotacion = (page: Page) =>
  page.evaluate(() => (window as unknown as StoreWindow).__VINA_STORE__.getState()
    .project.pieces.find(p => p.id === 'g1064')!.rotation);

/** Forma de L, asimétrica en los dos ejes: un rectángulo girado 90° se parece
 *  demasiado a sí mismo y disimula el fallo. */
const L = [
  { type: 'M', values: [0, 0] },
  { type: 'L', values: [160, 0] },
  { type: 'L', values: [160, 60] },
  { type: 'L', values: [60, 60] },
  { type: 'L', values: [60, 220] },
  { type: 'L', values: [0, 220] },
  { type: 'Z', values: [] },
];

async function piezaGiradaConElTirador(page: Page) {
  await dispatch(page, { type: 'project/addPiece', payload: {
    id: 'g1064', name: 'Mutada', outline: L,
    internals: [], position: { x: 220, y: 220 }, rotation: 0, mirrored: false,
    seamAllowance: 0, layer: 1, sublayer: 0, active: true, createdAt: 1, updatedAt: 1,
  } });
  await page.waitForTimeout(400);

  await page.keyboard.press('z');
  await dispatch(page, { type: 'editor/selectPiece', payload: 'g1064' });
  await expect
    .poll(() => page.evaluate(() => (window as unknown as StoreWindow).__VINA_STORE__
      .getState().editor.selectedPieceIds.length)).toBe(1);
  await page.waitForTimeout(400);

  const svg = await page.locator('svg.pattern-svg').boundingBox();
  const circulo = await page.locator('g.transform-handles circle').first().boundingBox();
  if (!svg || !circulo) throw new Error('sin svg o sin tirador de giro');

  // Pivote = centro del contorno (80,110) + posición (220,220).
  const pivotX = svg.x + 300;
  const pivotY = svg.y + 330;
  const cx = circulo.x + circulo.width / 2;
  const cy = circulo.y + circulo.height / 2;
  const radio = Math.hypot(cx - pivotX, cy - pivotY);

  // Un cuarto de vuelta, del norte al este del pivote.
  await page.mouse.move(cx, cy);
  await page.mouse.down();
  await page.mouse.move(pivotX + radio, pivotY, { steps: 12 });
  await page.mouse.up();
  await page.waitForTimeout(400);

  const deg = await rotacion(page);
  expect(Math.abs(deg)).toBeGreaterThan(60); // el tirador de verdad escribió el ángulo
  return { svg, deg };
}

/** Dónde se ve en pantalla un punto local, según el transform del renderizador. */
function enPantalla(local: { x: number; y: number }, deg: number) {
  const rad = (deg * Math.PI) / 180;
  const px = 80, py = 110;             // pivote local (centro del contorno)
  const dx = local.x - px, dy = local.y - py;
  return {
    x: px + dx * Math.cos(rad) - dy * Math.sin(rad) + 220,
    y: py + dx * Math.sin(rad) + dy * Math.cos(rad) + 220,
  };
}

test.describe('#1064 — el hit-testing sigue a la pieza girada', () => {
  test.setTimeout(120_000);

  test('coser resalta el borde donde SE VE, tras girar con el tirador', async ({ page }) => {
    await waitForApp(page);
    const { svg, deg } = await piezaGiradaConElTirador(page);

    await page.keyboard.press('n');
    await expect
      .poll(() => page.evaluate(() => (window as unknown as StoreWindow).__VINA_STORE__
        .getState().editor.activeTool)).toBe('seam');

    // El overlay de coser solo pinta algo dentro cuando el hit-test enganchó
    // un borde; en vacío el grupo existe pero va sin hijos.
    const resalte = () =>
      page.locator('g.edge-pair-overlay > *').count().catch(() => 0);

    // Control: en lona vacía no hay resalte. Sin esto, un overlay que pintara
    // siempre haría pasar el test sin probar nada.
    await page.mouse.move(svg.x + 40, svg.y + 40);
    await page.waitForTimeout(250);
    expect(await resalte()).toBe(0);

    // Y ahora encima del borde, tal como se ve girado.
    const p = enPantalla({ x: 80, y: 0 }, deg);
    await page.mouse.move(svg.x + p.x, svg.y + p.y);
    await page.waitForTimeout(300);
    expect(await resalte()).toBeGreaterThan(0);

    // El espejo del fallo: donde el borde estaría SIN girar ya no engancha.
    // Hasta 2026-08-21 era justo al revés.
    await page.mouse.move(svg.x + 80 + 220, svg.y + 0 + 220);
    await page.waitForTimeout(300);
    expect(await resalte()).toBe(0);
  });

  test('el menú contextual sabe sobre qué pieza se hizo clic derecho', async ({ page }) => {
    await waitForApp(page);
    const { svg, deg } = await piezaGiradaConElTirador(page);

    // Dentro del cuerpo de la pieza girada: el escalón interior de la L.
    const p = enPantalla({ x: 30, y: 200 }, deg);
    await page.mouse.click(svg.x + p.x, svg.y + p.y, { button: 'right' });
    await page.waitForTimeout(400);

    // El menú de pieza solo aparece si el hit-test de cuerpo encontró la pieza.
    const menu = await page.locator('[role="menu"], .context-menu').count();
    expect(menu).toBeGreaterThan(0);
  });
});
