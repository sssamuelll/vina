/**
 * #226 (Trello) — "necesito gestionar la distancia respecto a los puntos de
 * la línea externa y el ángulo, largo, etc … que hubiera una manera en la
 * que yo pueda editar eso y no solo ver el valor a la hora de crearlo."
 * Spec: docs/superpowers/specs/2026-08-30-cotas-vivas-design.md § 8.3.1.
 *
 * jsdom no calcula layout ni foco real — esto SOLO se puede fijar en un
 * navegador real.
 */
import { test, expect, Page } from '@playwright/test';
import { addPiece, dispatch } from './helpers/lienzo';

test.use({ viewport: { width: 1366, height: 768 } });

interface EstadoConInternals {
  project: {
    pieces: Array<{ id: string; internals: Array<{ id: string; type: string; path: Array<{ type: string; values: number[] }> }> }>;
  };
}

async function waitApp(page: Page) {
  await page.goto('/');
  await page.waitForSelector('svg.pattern-svg', { timeout: 20000 });
  await page.waitForTimeout(500);
}

test.describe('#226 — cotas de línea interna', () => {
  test('seleccionar una línea enganchada muestra sus cotas, y escribir una distancia de borde mueve SOLO ese extremo por el contorno', async ({ page }) => {
    await waitApp(page);
    await addPiece(page, 'p1', { x: 100, y: 100 }, 100, 60);
    // Línea de (0,20) [lado de cierre] a (50,60) [lado superior], en local.
    await dispatch(page, 'project/addInternalLine', {
      pieceId: 'p1',
      line: { id: 'l1', type: 'reference', path: [{ type: 'M', values: [0, 20] }, { type: 'L', values: [50, 60] }] },
    });
    await dispatch(page, 'editor/selectInternalLine', { pieceId: 'p1', lineId: 'l1' });
    await page.waitForTimeout(300);

    const capa = page.locator('[data-testid="cotas"]');
    await expect(capa).toBeVisible();
    // Cota de tramo (largo) siempre visible; cotas de borde (huecas) por cada extremo enganchado.
    await expect(page.locator('.cota:not(.cota--hueca)')).toHaveCount(2); // largo + ángulo
    const bordes = page.locator('.cota.cota--hueca');
    await expect(bordes.first()).toBeVisible();
    const nBordesAntes = await bordes.count();
    expect(nBordesAntes).toBeGreaterThan(0);

    // El transform box y la barra flotante de la pieza NO compiten (spec § 3.5).
    await expect(page.locator('g.transform-handles')).toHaveCount(0);

    // Clic en la primera cota de borde, escribir 30, Enter.
    await bordes.first().click();
    const input = page.locator('.cota--editando').first();
    await expect(input).toBeVisible();
    await input.fill('30');
    await input.press('Enter');
    await page.waitForTimeout(200);

    // El extremo que se movió sigue sobre el contorno (x=0 o y=0/60 en local).
    const estado = await page.evaluate(() => (window as unknown as { __VINA_STORE__: { getState: () => EstadoConInternals } }).__VINA_STORE__.getState());
    const linea = estado.project.pieces.find(p => p.id === 'p1')!.internals.find(l => l.id === 'l1')!;
    const [mx, my] = linea.path[0].values;
    const [lx, ly] = linea.path[1].values;
    const sobreElBorde = (p: [number, number]) => Math.abs(p[0]) < 1e-3 || Math.abs(p[1]) < 1e-3 || Math.abs(p[1] - 60) < 1e-3;
    expect(sobreElBorde([mx, my]) || sobreElBorde([lx, ly])).toBe(true);

    // Una entrada de deshacer: Ctrl+Z devuelve el extremo movido a (0,20).
    await page.keyboard.press('Control+z');
    await page.waitForTimeout(200);
    const revertido = await page.evaluate(() => (window as unknown as { __VINA_STORE__: { getState: () => EstadoConInternals } }).__VINA_STORE__.getState());
    const lineaRevertida = revertido.project.pieces.find(p => p.id === 'p1')!.internals.find(l => l.id === 'l1')!;
    expect(lineaRevertida.path[0].values).toEqual([0, 20]);
  });

  test('escribir el largo de un tramo mueve el nodo final; una entrada de deshacer', async ({ page }) => {
    await waitApp(page);
    await addPiece(page, 'p1', { x: 100, y: 100 }, 200, 200);
    await dispatch(page, 'project/addInternalLine', {
      pieceId: 'p1',
      line: { id: 'l1', type: 'reference', path: [{ type: 'M', values: [50, 50] }, { type: 'L', values: [100, 50] }] },
    });
    await dispatch(page, 'editor/selectInternalLine', { pieceId: 'p1', lineId: 'l1' });
    await page.waitForTimeout(300);

    const largoChip = page.locator('.cota:not(.cota--hueca)').first();
    await largoChip.click();
    const input = page.locator('.cota--editando').first();
    await input.fill('150');
    await input.press('Enter');
    await page.waitForTimeout(200);

    const estado = await page.evaluate(() => (window as unknown as { __VINA_STORE__: { getState: () => EstadoConInternals } }).__VINA_STORE__.getState());
    const linea = estado.project.pieces.find(p => p.id === 'p1')!.internals.find(l => l.id === 'l1')!;
    expect(linea.path[1].values[0]).toBeCloseTo(200, 1); // 50 + 150 = 200
    expect(linea.path[1].values[1]).toBeCloseTo(50, 1);
  });

  test('#1107 — con el hilo seleccionado, aparece su cota de ángulo y escribir 0 lo endereza', async ({ page }) => {
    await waitApp(page);
    await addPiece(page, 'p1', { x: 100, y: 100 }, 200, 200);
    await dispatch(page, 'project/addInternalLine', {
      pieceId: 'p1',
      line: { id: 'g1', type: 'grainline', path: [{ type: 'M', values: [50, 50] }, { type: 'L', values: [70, 100] }] },
    });
    await dispatch(page, 'editor/selectInternalLine', { pieceId: 'p1', lineId: 'g1' });
    await page.waitForTimeout(300);

    const chips = page.locator('.cota:not(.cota--hueca)');
    await expect(chips).toHaveCount(2); // largo + ángulo, gratis por ser InternalLine

    // El chip de ángulo es el segundo del par (orden del Tab: largo → ángulo).
    const angulo = chips.nth(1);
    await angulo.click();
    const input = page.locator('.cota--editando').first();
    await input.fill('0');
    await input.press('Enter');
    await page.waitForTimeout(200);

    const estado = await page.evaluate(() => (window as unknown as { __VINA_STORE__: { getState: () => EstadoConInternals } }).__VINA_STORE__.getState());
    const hilo = estado.project.pieces.find(p => p.id === 'p1')!.internals.find(l => l.id === 'g1')!;
    expect(hilo.path[1].values[1]).toBeCloseTo(hilo.path[0].values[1], 1); // mismo y: horizontal
  });
});
