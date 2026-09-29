import { expect, type Page } from '@playwright/test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/** El patrón real de María (5 piezas), el mismo que usan los specs de emplazamiento. */
export const FIXTURE_MARIA = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../fixtures/garments/maria_patrones_samuel_2M.dxf',
);

interface VentanaConStore {
  __VINA_STORE__?: { getState: () => unknown; dispatch: (a: unknown) => void };
}

export async function abrirAppVacia(page: Page): Promise<void> {
  await page.addInitScript(() => {
    localStorage.removeItem('vina-docks');
    localStorage.removeItem('vina-bar-position');
  });
  await page.goto('/app/');
  await page.waitForFunction(() => Boolean((window as unknown as VentanaConStore).__VINA_STORE__), { timeout: 20_000 });
  await expect(page.locator('svg.pattern-svg')).toBeVisible({ timeout: 20_000 });
  // La app abre en Split (`editorSlice.ts:10`, `viewMode: 'split'`), y los
  // estados de la spec (§ 3.2 y § 3.3) se miden sobre la vista 2D: Split tiene
  // su propio estado («Split en reposo»). Con la píldora, como lo haría María.
  await cambiarVista(page, '2D');
  await page.waitForTimeout(500);
}

export async function cargarDxfDeMaria(page: Page): Promise<void> {
  await page.locator('input[accept=".dxf"]').setInputFiles(FIXTURE_MARIA);
  await expect.poll(async () => page.locator('[data-piece-id]').count(), { timeout: 30_000 }).toBe(5);
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
  await page.waitForTimeout(600);
}

/** Cierra los toasts y suelta cualquier selección o herramienta: el reposo de verdad. */
export async function reposo(page: Page): Promise<void> {
  await page.evaluate(() => {
    document.querySelectorAll<HTMLButtonElement>('.toast__dismiss').forEach((b) => b.click());
  });
  await page.keyboard.press('Escape');
  await page.keyboard.press('Escape');
  await page.waitForTimeout(300);
}

/**
 * Un punto sobre el RELLENO de la pieza más grande en pantalla (px de ventana).
 * El centro geométrico no sirve tal cual: en el patrón de María el hilo y una
 * línea interna cruzan justo por el centro de cada pieza, y un clic ahí
 * selecciona la línea, no la pieza (medido: `elementFromPoint` devuelve un
 * `<path>` sin clase, y la barra flotante no monta). Se prueba el centro y, si
 * algo lo tapa, un anillo de desplazamientos alrededor, hasta que el elemento
 * de arriba sea el `.piece-fill` de esa pieza.
 */
export async function centroDePieza(page: Page): Promise<{ x: number; y: number }> {
  const punto = await page.evaluate(() => {
    const cajas = Array.from(document.querySelectorAll('[data-piece-id] .piece-fill'))
      .map((el) => {
        const r = el.getBoundingClientRect();
        return { el, x: r.x, y: r.y, w: r.width, h: r.height };
      })
      .filter((c) => c.w > 0 && c.h > 0)
      .sort((a, b) => b.w * b.h - a.w * a.h);
    const mayor = cajas[0];
    if (!mayor) return null;
    const cx = mayor.x + mayor.w / 2;
    const cy = mayor.y + mayor.h / 2;
    const desplazamientos = [
      [0, 0], [0.25, 0.25], [-0.25, 0.25], [0.25, -0.25], [-0.25, -0.25],
      [0.25, 0], [-0.25, 0], [0, 0.25], [0, -0.25], [0.15, 0.15], [-0.15, -0.15],
    ];
    for (const [fx, fy] of desplazamientos) {
      const x = cx + fx * mayor.w;
      const y = cy + fy * mayor.h;
      if (document.elementFromPoint(x, y) === mayor.el) return { x, y };
    }
    return { x: cx, y: cy };
  });
  if (!punto) throw new Error('ninguna pieza tiene caja en pantalla');
  return punto;
}

export async function seleccionarPieza(page: Page): Promise<{ x: number; y: number }> {
  await page.keyboard.press('z');
  const c = await centroDePieza(page);
  await page.mouse.click(c.x, c.y);
  await expect(page.locator('.floating-action-bar')).toBeVisible({ timeout: 5_000 });
  return c;
}

export async function abrirPaleta(page: Page): Promise<void> {
  await page.keyboard.press('Control+k');
  await expect(page.locator('.unified-bar__panel')).toBeVisible({ timeout: 5_000 });
}

/** `comando` es el texto del ítem en la paleta; `titulo`, el de la cabecera del panel. */
export async function abrirPanel(page: Page, comando: string, titulo: string): Promise<void> {
  await abrirPaleta(page);
  await page.locator('.unified-bar__panel').getByText(comando, { exact: true }).first().click();
  await expect(page.locator('.context-panel__header', { hasText: titulo }).first()).toBeVisible({ timeout: 8_000 });
}

export async function cambiarVista(page: Page, etiqueta: '2D' | 'Split' | '3D'): Promise<void> {
  await page.locator('.pill-group').getByRole('button', { name: etiqueta, exact: true }).click();
  await page.waitForTimeout(700);
}
