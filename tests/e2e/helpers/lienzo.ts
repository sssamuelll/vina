/**
 * Gestos sobre el lienzo 2D en coordenadas de PATRÓN (mm), traducidas a
 * pantalla con el pan/zoom vivos del store — como los hace María, no como
 * los haría un dispatch. Compartido por los specs que reproducen sus notas.
 */
import { expect, type Page } from '@playwright/test';

export type Cmd = { type: string; values: number[] };
export interface EstadoLienzo {
  editor: {
    activeTool: string;
    zoom2D: number;
    pan2D: { x: number; y: number };
    selectedPieceIds: string[];
    selectedSeamId: string | null;
    selectedTrazo: { trazoId: string; segmentIndex: number } | null;
  };
  project: {
    pieces: Array<{ id: string; name: string; outline: Cmd[]; position: { x: number; y: number }; internals: unknown[] }>;
    seams: Array<{ id: string }>;
    /** Líneas de construcción sueltas en el lienzo (spec 2026-09-12, #1158). */
    trazos: Array<{ id: string; path: Cmd[] }>;
  };
}
type StoreWindow = { __VINA_STORE__: { dispatch: (a: unknown) => void; getState: () => EstadoLienzo } };

export const st = (page: Page): Promise<EstadoLienzo> =>
  page.evaluate(() => (window as unknown as StoreWindow).__VINA_STORE__.getState());

export const dispatch = (page: Page, type: string, payload?: unknown) =>
  page.evaluate(([t, p]) => (window as unknown as StoreWindow).__VINA_STORE__.dispatch({ type: t, payload: p }), [type, payload] as const);

/** Rectángulo `w`×`h` mm con la esquina superior izquierda en `pos` (patrón). */
export async function addPiece(page: Page, id: string, pos: { x: number; y: number }, w = 200, h = 150) {
  await dispatch(page, 'project/addPiece', {
    id, name: id,
    outline: [
      { type: 'M', values: [0, 0] }, { type: 'L', values: [w, 0] },
      { type: 'L', values: [w, h] }, { type: 'L', values: [0, h] }, { type: 'Z', values: [] },
    ],
    internals: [], position: pos, rotation: 0, mirrored: false,
    seamAllowance: 0, layer: 1, sublayer: 0, active: true, createdAt: 1, updatedAt: 1,
  });
  await page.waitForTimeout(300);
}

export async function toScreen(page: Page, p: { x: number; y: number }) {
  const box = await page.locator('svg.pattern-svg').boundingBox();
  if (!box) throw new Error('no svg');
  const { editor } = await st(page);
  return { x: box.x + editor.pan2D.x + p.x * editor.zoom2D, y: box.y + editor.pan2D.y + p.y * editor.zoom2D };
}

export async function clickAt(page: Page, p: { x: number; y: number }, button: 'left' | 'right' = 'left') {
  const s = await toScreen(page, p);
  await page.mouse.move(s.x, s.y);
  await page.mouse.click(s.x, s.y, { button });
  await page.waitForTimeout(150);
}

export async function activarHerramienta(page: Page, tecla: string, id: string) {
  await page.keyboard.press(tecla);
  await expect.poll(async () => (await st(page)).editor.activeTool, { timeout: 5000 }).toBe(id);
  await page.waitForTimeout(100);
}

/** El diálogo de confirmación del shell: el último botón es el que confirma. */
export async function confirmarDialogo(page: Page, timeout = 3000) {
  const dlg = page.locator('.confirm-dialog');
  await expect(dlg, 'no apareció el diálogo de confirmación').toBeVisible({ timeout });
  await dlg.locator('button').last().click();
  await expect(dlg).toHaveCount(0);
  await page.waitForTimeout(200);
}
