/**
 * Cotas vivas, PR A (spec 2026-08-30 § 8.3) — la promesa de María #223/#225
 * medida por su puerta: un clic crea el rectángulo, y escribir en SUS cotas
 * cambia ESA pieza (no el default del siguiente, que era lo que el e2e viejo
 * certificaba en verde — memoria `test-mide-nuestra-promesa-no-la-de-maria`).
 *
 * Es un e2e y no vitest porque jsdom no ve layout ni foco real: el chip HTML
 * anclado con pan/zoom, el Tab desde el lienzo y el scrub con el puntero
 * capturado solo se prueban en un navegador.
 */
import { test, expect, type Page } from '@playwright/test';
import { waitForApp } from './helpers/sim';

type Cmd = { type: string; values: number[] };
type Piece = { id: string; outline: Cmd[]; position: { x: number; y: number }; locked?: boolean };
type StoreWindow = {
  __VINA_STORE__: {
    getState: () => {
      editor: { activeTool: string; zoom2D: number; pan2D: { x: number; y: number }; selectedPieceIds: string[] };
      project: { pieces: Piece[] };
      tools: { toolOptions: Record<string, Record<string, unknown>> };
    };
    dispatch: (a: unknown) => void;
  };
};

const st = (page: Page) => page.evaluate(() => (window as unknown as StoreWindow).__VINA_STORE__.getState());
const bbox = (p: Piece) => {
  const xs = p.outline.flatMap(c => c.values.filter((_, i) => i % 2 === 0)).map(x => x + p.position.x);
  const ys = p.outline.flatMap(c => c.values.filter((_, i) => i % 2 === 1)).map(y => y + p.position.y);
  return { x: Math.min(...xs), y: Math.min(...ys), w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys) };
};
async function toScreen(page: Page, p: { x: number; y: number }) {
  const box = await page.locator('svg.pattern-svg').boundingBox();
  if (!box) throw new Error('no svg');
  const { editor } = await st(page);
  return { x: box.x + editor.pan2D.x + p.x * editor.zoom2D, y: box.y + editor.pan2D.y + p.y * editor.zoom2D };
}
const cota = (page: Page, nombre: 'Ancho' | 'Alto') =>
  page.getByRole('button', { name: new RegExp(`^${nombre} de la pieza:`) });

/** Rectángulo por clic en (250, 250) de patrón. */
async function crearPorClic(page: Page) {
  await page.keyboard.press('s');
  await expect.poll(async () => (await st(page)).editor.activeTool, { timeout: 5000 }).toBe('rectangle');
  const s = await toScreen(page, { x: 250, y: 250 });
  await page.mouse.move(s.x, s.y);
  await page.mouse.click(s.x, s.y);
  await expect.poll(async () => (await st(page)).project.pieces.length).toBe(1);
  return s;
}

test.describe('cotas de pieza (María #223/#225)', () => {
  test.setTimeout(90_000);
  test.beforeEach(async ({ page }) => { await waitForApp(page); });

  test('clic crea, las cotas editan ESA pieza, y el siguiente clic NO hereda el tamaño', async ({ page }) => {
    await crearPorClic(page);
    let pieces = (await st(page)).project.pieces;
    expect(bbox(pieces[0])).toMatchObject({ w: 100, h: 100 });
    await expect(cota(page, 'Ancho')).toHaveText('100 mm');
    // El rótulo «Editando: la pieza nueva» se fue con la tarjeta en P2b (spec
    // 2026-10-02 § 8): de qué pieza son las cotas lo prueba la edición de abajo.

    await cota(page, 'Ancho').click();
    await page.keyboard.type('300');
    await page.keyboard.press('Tab');
    await page.keyboard.type('150');
    await page.keyboard.press('Enter');

    pieces = (await st(page)).project.pieces;
    expect(pieces).toHaveLength(1);
    expect(bbox(pieces[0])).toMatchObject({ x: 250, y: 250, w: 300, h: 150 });
    await expect(cota(page, 'Ancho')).toHaveText('300 mm');
    await expect(cota(page, 'Alto')).toHaveText('150 mm');

    // Reunión 07-09 [01:49]: "en verdad no es una acción repetitiva, cada
    // rectángulo va a ser de un tamaño distinto". La creación caliente se
    // retira: editar la cota cambia ESA pieza y no contamina lo que el
    // siguiente clic va a crear. El rótulo promete 100 × 100 y eso es lo que
    // sale — ella ya había cazado la contradicción en [01:22]: "ponía que de
    // 100" y le creó otra cosa.
    // Debajo de la primera (250..550 x 250..400), dentro del svg aunque la vista sea split.
    const t = await toScreen(page, { x: 250, y: 500 });
    await page.mouse.click(t.x, t.y);
    await expect.poll(async () => (await st(page)).project.pieces.length).toBe(2);
    pieces = (await st(page)).project.pieces;
    expect(bbox(pieces[1])).toMatchObject({ w: 100, h: 100 });
    expect((await st(page)).tools.toolOptions.rectangle?.width ?? 100).toBe(100);
  });

  test('una pieza seleccionada con Z edita su cota sin tocar el default del rectángulo', async ({ page }) => {
    const s = await crearPorClic(page);
    await page.keyboard.press('z');
    await expect.poll(async () => (await st(page)).editor.activeTool).toBe('select');
    await page.mouse.click(s.x + 20, s.y + 20);
    // Desde P2b no hay rótulo «Editando: la pieza seleccionada»: lo dice la
    // selección (spec 2026-10-02 § 8).
    const id = (await st(page)).project.pieces[0].id;
    await expect.poll(async () => (await st(page)).editor.selectedPieceIds).toEqual([id]);

    await cota(page, 'Ancho').click();
    await page.keyboard.type('200');
    await page.keyboard.press('Enter');

    const state = await st(page);
    expect(bbox(state.project.pieces[0]).w).toBe(200);
    expect(state.tools.toolOptions.rectangle?.width ?? 100).toBe(100);
  });

  test('arrastrar la cota (scrub) ajusta en vivo y es UNA entrada de deshacer', async ({ page }) => {
    await crearPorClic(page);
    const chip = await cota(page, 'Ancho').boundingBox();
    if (!chip) throw new Error('sin chip');
    const { editor } = await st(page);
    const cx = chip.x + chip.width / 2, cy = chip.y + chip.height / 2;
    await page.mouse.move(cx, cy);
    await page.mouse.down();
    await page.mouse.move(cx + 50 * editor.zoom2D, cy, { steps: 10 });
    await page.mouse.up();
    await expect.poll(async () => bbox((await st(page)).project.pieces[0]).w).toBe(150);

    await page.keyboard.press('Control+z');
    await expect.poll(async () => bbox((await st(page)).project.pieces[0]).w).toBe(100);
  });

  test('teclas reales: Tab desde el lienzo enfoca Ancho; Retroceso dentro no borra la pieza; s no cambia de herramienta; Escape descarta', async ({ page }) => {
    await crearPorClic(page);
    // el clic dejó el foco en el body: Tab va a la primera cota
    await page.keyboard.press('Tab');
    await expect(cota(page, 'Ancho')).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(page.getByRole('textbox', { name: 'Ancho de la pieza' })).toBeFocused();
    await page.keyboard.press('Backspace');
    await page.keyboard.type('s');
    expect((await st(page)).project.pieces).toHaveLength(1);
    expect((await st(page)).editor.activeTool).toBe('rectangle');
    await page.keyboard.press('Escape');
    await expect(cota(page, 'Ancho')).toHaveText('100 mm');
    await expect(cota(page, 'Ancho')).toBeFocused();
  });

  test('blur descarta: escribir y clicar fuera no cambia la pieza', async ({ page }) => {
    const s = await crearPorClic(page);
    await cota(page, 'Ancho').click();
    await page.keyboard.type('999');
    await page.mouse.click(s.x - 200, s.y - 200);
    expect(bbox((await st(page)).project.pieces[0]).w).toBe(100);
  });

  test('pieza bloqueada: cotas apagadas', async ({ page }) => {
    await crearPorClic(page);
    const id = (await st(page)).project.pieces[0].id;
    await page.evaluate((pid) => {
      const store = (window as unknown as StoreWindow).__VINA_STORE__;
      const piece = store.getState().project.pieces.find(p => p.id === pid)!;
      store.dispatch({ type: 'project/updatePiece', payload: { ...piece, locked: true, updatedAt: Date.now() } });
    }, id);
    await expect(cota(page, 'Ancho')).toHaveAttribute('aria-disabled', 'true');
    // aria-disabled frena la actionability de Playwright: el clic va forzado, y aun asi no abre
    await cota(page, 'Ancho').click({ force: true });
    expect(await page.getByRole('textbox', { name: 'Ancho de la pieza' }).count()).toBe(0);
  });

  test('pieza girada: las cotas siguen los lados de la caja girada y escribir Ancho conserva la esquina', async ({ page }) => {
    await crearPorClic(page);
    const id = (await st(page)).project.pieces[0].id;
    await page.evaluate((pid) => {
      const store = (window as unknown as StoreWindow).__VINA_STORE__;
      const piece = store.getState().project.pieces.find(p => p.id === pid)!;
      store.dispatch({ type: 'project/updatePiece', payload: { ...piece, rotation: 90, updatedAt: Date.now() } });
    }, id);
    await page.keyboard.press('z');
    const s = await toScreen(page, { x: 300, y: 300 });
    await page.mouse.click(s.x, s.y);
    const ancho = await cota(page, 'Ancho').boundingBox();
    if (!ancho) throw new Error('sin chip de Ancho');
    // Una cota a la vez (spec 2026-10-02 § 5.5): en Seleccionar solo se ve Ancho.
    await expect(cota(page, 'Alto')).toHaveCount(0);
    // girada 90°: el chip de Ancho queda a un lado (no arriba)
    // El oráculo es el CONTORNO pintado, no el grupo `[data-piece-id]`: desde
    // que "Largos" nace encendido (reunión 07-09, fallo 4) el grupo incluye las
    // etiquetas de largo y su caja ya no es la geometría de la pieza. Lo que
    // este caso afirma no cambia —el chip de Ancho cae a un costado y no por
    // arriba—; cambia con qué se mide, porque la caja anterior medía de más.
    const piezaBox = await page.locator('[data-piece-id] .piece-fill').first().boundingBox();
    if (!piezaBox) throw new Error('sin contorno de pieza');
    // el chip se centra a 18 px del lado: su centro cae fuera de la caja por un costado, no por arriba
    const cx = ancho.x + ancho.width / 2;
    const cy = ancho.y + ancho.height / 2;
    expect(cx > piezaBox.x + piezaBox.width - 1 || cx < piezaBox.x + 1).toBe(true);
    expect(cy).toBeGreaterThan(piezaBox.y);
    expect(cy).toBeLessThan(piezaBox.y + piezaBox.height);
    await cota(page, 'Ancho').click();
    await page.keyboard.type('200');
    await page.keyboard.press('Enter');
    await expect.poll(async () => {
      const p = (await st(page)).project.pieces[0];
      const xs = p.outline.flatMap(c => c.values.filter((_, i) => i % 2 === 0));
      return Math.max(...xs) - Math.min(...xs);
    }).toBe(200);
  });
});
