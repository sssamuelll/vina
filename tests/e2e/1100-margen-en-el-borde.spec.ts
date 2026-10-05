/**
 * #1100 (María, audio 30-08) — "si yo me pongo encima me dijera cuánto es el
 * margen de costura aquí… y vaya desapareciendo según quito" [25:44]; "he
 * clicado a la línea pero se me ha iluminado toda la pieza… solo cambia esa
 * línea… falta control" [27:31].
 * Spec: docs/superpowers/specs/2026-09-02-margen-en-el-borde-design.md § 8.2.
 *
 * jsdom no calcula layout, ni foco real, ni `:has()` — esto SOLO se fija en
 * un navegador. Los gestos van en píxeles de pantalla, como los hace ella.
 */
import { test, expect, Page } from '@playwright/test';
import { activarHerramienta, dispatch, st, toScreen } from './helpers/lienzo';

test.use({ viewport: { width: 1366, height: 768 } });

interface Borde { id: string; segmentRange: [number, number]; seamAllowanceWidth?: number; seamAllowanceSpans?: Array<{ tStart: number; tEnd: number; width: number }> }
interface Estado {
  editor: { activeTool: string; saSelection: { kind: string; items: unknown[] } | null };
  project: { pieces: Array<{ id: string; seamAllowance: number; edges: Borde[] }> };
}
const estado = (page: Page) => page.evaluate(() => (window as unknown as { __VINA_STORE__: { getState: () => Estado } }).__VINA_STORE__.getState());

async function waitApp(page: Page) {
  await page.goto('/app/');
  await page.waitForSelector('svg.pattern-svg', { timeout: 20000 });
  await page.waitForTimeout(500);
}

/** Rectángulo 200 × 150 en (100, 100), margen de pieza 0. Devuelve el id del borde de ARRIBA. */
async function piezaConBordes(page: Page) {
  await dispatch(page, 'project/addPiece', {
    id: 'p1', name: 'p1',
    outline: [
      { type: 'M', values: [0, 0] }, { type: 'L', values: [200, 0] },
      { type: 'L', values: [200, 150] }, { type: 'L', values: [0, 150] }, { type: 'Z', values: [] },
    ],
    internals: [], position: { x: 100, y: 100 }, rotation: 0, mirrored: false,
    seamAllowance: 0, layer: 1, sublayer: 0, active: true, createdAt: 1, updatedAt: 1,
  });
  await page.waitForTimeout(300);
  const { project } = await estado(page);
  const bordes = project.pieces.find(p => p.id === 'p1')!.edges;
  const arriba = bordes.find(e => e.segmentRange[0] === 1)!;
  const derecha = bordes.find(e => e.segmentRange[0] === 2)!;
  return { arriba: arriba.id, derecha: derecha.id };
}

const borde = async (page: Page, id: string) =>
  (await estado(page)).project.pieces.find(p => p.id === 'p1')!.edges.find(e => e.id === id)!;

/** Puntos de patrón: mitad del borde de arriba y mitad del de la derecha. */
const ARRIBA = { x: 200, y: 100 };
const DERECHA = { x: 300, y: 175 };
const CUERPO = { x: 200, y: 175 };

test.describe('#1100 — el margen se lee al pasar y se escribe al clicar', () => {
  test.setTimeout(90_000);

  test('la promesa de María: sobre el borde se lee "0 mm · de la pieza"; fuera del borde y fuera del lienzo se va', async ({ page }) => {
    await waitApp(page);
    await piezaConBordes(page);
    await activarHerramienta(page, 'o', 'seamAllowance');

    const lectura = page.locator('.cota--lectura');
    const s = await toScreen(page, ARRIBA);
    await page.mouse.move(s.x - 40, s.y, { steps: 4 });
    await page.mouse.move(s.x, s.y, { steps: 4 });
    await expect(lectura).toBeVisible();
    await expect(lectura).toHaveText('0 mm');
    await expect(lectura).toHaveAttribute('data-rotulo', 'de la pieza');
    await expect(lectura).toHaveClass(/cota--hueca/);
    // El borde se resalta (peso hover), y nada está seleccionado todavía.
    await expect(page.locator('[data-testid="sa-edge-hover"]')).toHaveCount(1);
    expect((await estado(page)).editor.saSelection).toBeNull();

    // Al cuerpo: nada que leer.
    const c = await toScreen(page, CUERPO);
    await page.mouse.move(c.x, c.y, { steps: 6 });
    await expect(lectura).toHaveCount(0);

    // Otra vez al borde, y de ahí a la línea al pie (fuera del <svg>): la costura de #1132.
    await page.mouse.move(s.x, s.y, { steps: 6 });
    await expect(lectura).toBeVisible();
    const pie = await page.locator('.linea-al-pie').boundingBox();
    expect(pie).not.toBeNull();
    await page.mouse.move(pie!.x + 300, pie!.y + 12, { steps: 8 });
    await expect(lectura).toHaveCount(0);
  });

  test('clic en el borde abre el chip con el foco; 20 + Enter escribe en ESE borde, lo promueve, y es una sola entrada de deshacer', async ({ page }) => {
    await waitApp(page);
    const { arriba, derecha } = await piezaConBordes(page);
    await activarHerramienta(page, 'o', 'seamAllowance');

    const s = await toScreen(page, ARRIBA);
    await page.mouse.move(s.x, s.y, { steps: 4 });
    await page.mouse.click(s.x, s.y);
    const input = page.locator('input.cota--editando');
    await expect(input).toBeVisible();
    await expect(input).toBeFocused();
    await expect(input).toHaveValue('0');
    await expect(input).toHaveAttribute('data-rotulo', 'de la pieza');

    await input.fill('20');
    await input.press('Enter');
    await page.waitForTimeout(200);

    expect((await borde(page, arriba)).seamAllowanceWidth).toBe(20);
    expect((await borde(page, derecha)).seamAllowanceWidth).toBeUndefined();
    expect((await estado(page)).project.pieces[0].seamAllowance).toBe(0);

    const chip = page.locator('button.cota');
    await expect(chip).toHaveText('20 mm');
    await expect(chip).not.toHaveClass(/cota--hueca/);
    await expect(chip).not.toHaveAttribute('data-rotulo', /.+/);
    await expect(chip).toBeFocused();

    await page.keyboard.press('Control+z');
    await page.waitForTimeout(300);
    expect((await borde(page, arriba)).seamAllowanceWidth).toBeUndefined();
  });

  test('el teclado vuelve: Escape suelta el borde y la tecla siguiente es de la app', async ({ page }) => {
    await waitApp(page);
    await piezaConBordes(page);
    await activarHerramienta(page, 'o', 'seamAllowance');

    const s = await toScreen(page, ARRIBA);
    await page.mouse.move(s.x, s.y, { steps: 4 });
    await page.mouse.click(s.x, s.y);
    const input = page.locator('input.cota--editando');
    await expect(input).toBeFocused();
    // Con el campo abierto, "s" es una letra, no un atajo. El chip abre con el
    // valor seleccionado (spec 30-08 § 5.3), así que la letra lo reemplaza.
    await page.keyboard.press('s');
    expect((await estado(page)).editor.activeTool).toBe('seamAllowance');
    await expect(input).toHaveValue('s');

    await page.keyboard.press('Escape');                 // 1º: descarta el borrador
    await expect(input).toHaveCount(0);
    await expect(page.locator('button.cota')).toBeFocused();
    await page.keyboard.press('Escape');                 // 2º: suelta la selección
    await expect.poll(async () => (await estado(page)).editor.saSelection).toBeNull();
    await expect(page.locator('button.cota')).toHaveCount(0);
    await page.keyboard.press('s');                      // y la app vuelve a oír
    await expect.poll(async () => (await estado(page)).editor.activeTool).toBe('rectangle');
  });

  test('pan con el puntero quieto: la lectura se vuelve a resolver sin mover el ratón', async ({ page }) => {
    await waitApp(page);
    const { arriba } = await piezaConBordes(page);
    // Tramo en el último 40 % del borde de arriba, 25 mm.
    await dispatch(page, 'project/addEdgeSeamAllowanceSpan', { pieceId: 'p1', edgeId: arriba, span: { tStart: 0.6, tEnd: 1, width: 25 } });
    await activarHerramienta(page, 'o', 'seamAllowance');

    const lectura = page.locator('.cota--lectura');
    const s = await toScreen(page, ARRIBA);           // t = 0,5: fuera del tramo
    await page.mouse.move(s.x, s.y, { steps: 4 });
    await expect(lectura).toHaveText('0 mm');
    await expect(lectura).toHaveAttribute('data-rotulo', 'de la pieza');

    // Mover el patrón 60 px a la izquierda deja bajo el cursor el punto (260, 100): t = 0,8, dentro del tramo.
    const { editor } = await st(page);
    await dispatch(page, 'editor/setPan2D', { x: editor.pan2D.x - 60, y: editor.pan2D.y });
    await expect(lectura).toHaveText('25 mm');
    await expect(lectura).toHaveAttribute('data-rotulo', 'del tramo');
    await expect(lectura).not.toHaveClass(/cota--hueca/);
  });

  test('techo de dos chips y borrador intocable: mientras se escribe, la lectura de otro borde se oculta; en reposo, los dos', async ({ page }) => {
    await waitApp(page);
    await piezaConBordes(page);
    await activarHerramienta(page, 'o', 'seamAllowance');

    const s = await toScreen(page, ARRIBA);
    await page.mouse.move(s.x, s.y, { steps: 4 });
    await page.mouse.click(s.x, s.y);
    const input = page.locator('input.cota--editando');
    await expect(input).toBeFocused();

    const d = await toScreen(page, DERECHA);
    await page.mouse.move(d.x, d.y, { steps: 8 });
    const lectura = page.locator('.cota--lectura');
    await expect(lectura).toBeHidden();
    await expect(input).toBeFocused();

    await page.keyboard.press('Escape');
    await expect(input).toHaveCount(0);
    await page.mouse.move(d.x + 1, d.y, { steps: 2 });
    await expect(lectura).toBeVisible();
    await expect(page.locator('button.cota')).toHaveCount(1);
  });
});
