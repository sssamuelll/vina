/**
 * Caja negra — la bitácora, por la puerta de María.
 *
 * Spec: docs/superpowers/specs/2026-08-29-caja-negra-bitacora-design.md § 7.
 * Un recorrido corto de línea interna (atajo, enganche a un vértice, Enter,
 * clic derecho) y luego `Vina ▸ Archivo ▸ Exportar diagnóstico`: el JSON
 * descargado tiene que contar cada paso en orden — el atajo, el press con su
 * enganche y su anfitriona, la tecla consumida, la acción que despachó, el
 * menú que se abrió — más el entorno y los slices que antes no viajaban.
 */
import { test, expect, type Page } from '@playwright/test';
import { exportBundle } from './helpers/diagnostico';
import { waitForApp } from './helpers/sim';

type Cmd = { type: string; values: number[] };
type StoreWindow = {
  __VINA_STORE__: {
    dispatch: (a: unknown) => void;
    getState: () => {
      editor: { activeTool: string; zoom2D: number; pan2D: { x: number; y: number } };
      project: { pieces: Array<{ id: string; internals: Array<{ path: Cmd[] }> }> };
    };
  };
};
interface JournalEventLike { t: number; kind: string; name: string; data?: Record<string, unknown>; n?: number }
interface BundleLike {
  journal: { events: JournalEventLike[]; dropped: number };
  environment: { viewport?: { w: number; h: number }; userAgent?: string; flags?: Record<string, string> };
  slices: { editor: { activeTool: string }; tools: unknown };
  storage: { total: number };
  inspector: Record<string, unknown>;
}

const st = (page: Page) => page.evaluate(() => (window as unknown as StoreWindow).__VINA_STORE__.getState());
const dispatch = (page: Page, type: string, payload?: unknown) =>
  page.evaluate(([t, p]) => (window as unknown as StoreWindow).__VINA_STORE__.dispatch({ type: t, payload: p }), [type, payload] as const);

async function addPiece(page: Page, id: string, pos: { x: number; y: number }, w = 200, h = 150) {
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
async function toScreen(page: Page, p: { x: number; y: number }) {
  const box = await page.locator('svg.pattern-svg').boundingBox();
  if (!box) throw new Error('no svg');
  const { editor } = await st(page);
  return { x: box.x + editor.pan2D.x + p.x * editor.zoom2D, y: box.y + editor.pan2D.y + p.y * editor.zoom2D };
}
async function clickAt(page: Page, p: { x: number; y: number }, button: 'left' | 'right' = 'left') {
  const s = await toScreen(page, p);
  await page.mouse.move(s.x, s.y);
  await page.mouse.click(s.x, s.y, { button });
  await page.waitForTimeout(150);
}

const find = (events: JournalEventLike[], kind: string, name: string, pred: (d: Record<string, unknown>) => boolean = () => true) =>
  events.findIndex((e) => e.kind === kind && e.name === name && pred(e.data ?? {}));

test.beforeEach(async ({ page }) => {
  // La misma bandera que `diagnostico-3d.spec.ts`: tier sin WebGPU en el runner,
  // y de paso una bandera `vina-*` real que `environment.flags` tiene que recoger.
  await page.addInitScript(() => localStorage.setItem('vina-use-webgpu', 'false'));
});

test.describe('caja negra — bitácora', () => {
  test.setTimeout(90_000);

  test('el bundle cuenta el gesto entero, en orden, con entorno y slices', async ({ page }) => {
    await waitForApp(page);
    await addPiece(page, 'A', { x: 150, y: 150 });

    await page.keyboard.press('g');
    await expect.poll(async () => (await st(page)).editor.activeTool, { timeout: 5000 }).toBe('internalShape');
    await page.waitForTimeout(150);

    await clickAt(page, { x: 153, y: 153 }); // a 3 px del vértice (150,150) de A: engancha
    await clickAt(page, { x: 250, y: 200 });
    await page.keyboard.press('Enter');
    await page.waitForTimeout(200);
    await expect.poll(async () => (await st(page)).project.pieces.find(p => p.id === 'A')?.internals.length).toBe(1);

    // Lienzo vacío DENTRO del svg: en vista dividida el panel 2D mide ≈ 640 px, y
    // un punto más a la derecha cae en el visor 3D, cuyo menú también es `.context-menu`.
    await clickAt(page, { x: 400, y: 400 }, 'right');
    await expect(page.locator('.context-menu')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.locator('.context-menu')).toHaveCount(0);

    const bundle = (await exportBundle(page)) as unknown as BundleLike;
    const ev = bundle.journal.events;

    expect(bundle.journal.dropped).toBe(0);
    expect(find(ev, 'session', 'load')).toBeGreaterThanOrEqual(0);

    const shortcut = find(ev, 'shortcut', 'tool.internalShape', (d) => d.handled === true);
    const setTool = find(ev, 'action', 'editor/setActiveTool', (d) => (d.payload as string) === 'internalShape');
    const down = find(ev, 'gesture', 'down', (d) => d.tool === 'internalShape' && d.button === 0);
    const press = find(ev, 'gesture', 'internalShape:press', (d) => d.snap === 'vertex' && d.hostId === 'A' && d.armed === true);
    const enter = find(ev, 'gesture', 'key', (d) => d.key === 'Enter' && d.consumedBy === 'internalShape');
    const added = find(ev, 'action', 'project/addInternalLine', (d) => (d.payload as { pieceId?: string })?.pieceId === 'A');
    const menu = find(ev, 'ui', 'contextmenu', (d) => d.opened === true && d.tool === 'internalShape');

    for (const [label, idx] of Object.entries({ shortcut, setTool, down, press, enter, added, menu })) {
      expect(idx, `falta ${label} en la bitácora`).toBeGreaterThanOrEqual(0);
    }
    expect(shortcut).toBeLessThan(down);
    expect(down).toBeLessThan(press);
    expect(press).toBeLessThan(enter);
    expect(enter).toBeLessThan(added);
    expect(added).toBeLessThan(menu);
    for (let i = 1; i < ev.length; i++) expect(ev[i].t).toBeGreaterThanOrEqual(ev[i - 1].t);

    expect(bundle.slices.editor.activeTool).toBe('internalShape');
    expect(bundle.slices.tools).toBeTruthy();
    expect(bundle.environment.viewport?.w ?? 0).toBeGreaterThan(0);
    expect(typeof bundle.environment.userAgent).toBe('string');
    expect(bundle.environment.flags?.['vina-use-webgpu']).toBe('false');
    expect(typeof bundle.storage.total).toBe('number');
    expect(bundle.inspector).toHaveProperty('lastSolverError');
  });
});
