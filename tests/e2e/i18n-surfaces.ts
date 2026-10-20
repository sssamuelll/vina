import type { Page } from '@playwright/test';

export { collectText, visibleSurfaces } from './i18n/text-collector';

export interface SurfaceEntry {
  /** The baseline shot name without the viewport prefix. */
  id: string;
  /** `data-superficie` values visible in this state at both viewports, sorted. */
  surfaces: readonly string[];
  /** True once the owning area has migrated (phase 4). */
  swept: boolean;
  /** Runs only in the first viewport and is named by its bare id. */
  onlyFirstViewport?: true;
  /** Brings a page already loaded on the empty app to this state. */
  reach: (page: Page) => Promise<void>;
}

const settle = (page: Page, ms = 400) => page.waitForTimeout(ms);
const press = (page: Page, key: string) => page.keyboard.press(key);

export const dismissToasts = (page: Page) =>
  page.evaluate(() => {
    document.querySelectorAll<HTMLElement>('.toast__dismiss').forEach((b) => b.click());
  }).catch(() => {});

/** Clears the origin's storage and opens the app on an empty project, ready to reach a state. */
export async function openApp(page: Page, origin: string, path: string): Promise<void> {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Storage.clearDataForOrigin', { origin, storageTypes: 'all' });
  await page.goto(path, { waitUntil: 'domcontentloaded', timeout: 90_000 });
  await page.locator('.app-shell').waitFor({ state: 'visible', timeout: 90_000 });
  await page.waitForFunction(() => Boolean((window as unknown as { __VINA_STORE__?: { getState?: unknown } }).__VINA_STORE__?.getState), undefined, { timeout: 60_000 });
  await page.waitForFunction(
    () => ((window as unknown as { __VINA_STORE__: { getState(): { project?: { pieces?: unknown[] } } } }).__VINA_STORE__.getState().project?.pieces?.length ?? 0) === 0,
    undefined, { timeout: 60_000 },
  );
  await page.locator('svg.pattern-svg').waitFor({ state: 'attached', timeout: 20_000 });
  await page.waitForTimeout(1500);
  await dismissToasts(page);
}

/** María's DXF, loaded the way the script did. */
export async function loadFixture(page: Page): Promise<void> {
  await page.locator('input[accept=".dxf"]').setInputFiles('tests/fixtures/garments/maria_patrones_samuel_2M.dxf');
  await page.waitForFunction(
    () => (window as unknown as { __VINA_STORE__: { getState(): { project: { pieces: unknown[] } } } }).__VINA_STORE__.getState().project.pieces.length === 5,
    undefined,
    { timeout: 60_000 },
  );
  await settle(page, 1500);
  await dismissToasts(page);
  await press(page, 'Escape');
}

async function clickViewMode(page: Page, label: string) {
  await page.locator('.pill-group').getByRole('button', { name: label, exact: true }).click();
  await settle(page, 900);
}

/** `exact`: the point must hit the piece fill itself, not a line, label or chip inside the piece. */
async function pieceInteriorPoint(page: Page, exact = false): Promise<{ x: number; y: number }> {
  const pt = await page.locator('svg.pattern-svg').evaluate((svg, exactHit) => {
    const fills = [...svg.querySelectorAll('.pattern-piece .piece-fill')]
      .map((fill) => ({ fill: fill as SVGGeometryElement, rect: fill.getBoundingClientRect() }))
      .filter(({ rect }) => rect.width > 0 && rect.height > 0)
      .sort((a, b) => b.rect.width * b.rect.height - a.rect.width * a.rect.height);
    const fr = [0.5, 0.35, 0.65, 0.2, 0.8];
    for (const { fill, rect } of fills) {
      const inv = fill.getScreenCTM()?.inverse();
      if (!inv) continue;
      const owner = fill.closest('[data-piece-id]');
      for (const fy of fr) for (const fx of fr) {
        const x = rect.left + rect.width * fx, y = rect.top + rect.height * fy;
        if (!fill.isPointInFill(new DOMPoint(x, y).matrixTransform(inv))) continue;
        const hit = document.elementFromPoint(x, y);
        if (exactHit ? hit === fill : hit && hit.closest('[data-piece-id]') === owner) return { x, y };
      }
    }
    return null;
  }, exact);
  if (!pt) throw new Error('no clickable point inside any piece');
  return pt;
}

// The point step 03 finds, reused by the later steps as the script did.
const points = new WeakMap<Page, { x: number; y: number }>();
const pointOf = async (page: Page) => points.get(page) ?? (await pieceInteriorPoint(page));

async function openPanel(page: Page, command: string) {
  await press(page, 'Control+k'); await settle(page);
  await page.locator(`.unified-bar__panel [data-command="${command}"]`).first().click();
  await settle(page, 900);
}

/** One state after the fixture is loaded: what reaches it, and what undoes it before the next. */
interface Step {
  id: string;
  surfaces: readonly string[];
  step: (page: Page) => Promise<void>;
  after?: (page: Page) => Promise<void>;
}

const escape = (page: Page) => press(page, 'Escape');
const escapeTwice = async (page: Page) => { await press(page, 'Escape'); await press(page, 'Escape'); };

const CHAIN: readonly Step[] = [
  { id: '02-2d-cargado', surfaces: ['ambiente', 'documento', 'pista'], step: (p) => clickViewMode(p, '2D') },
  {
    id: '03-2d-pieza-seleccionada', surfaces: ['ambiente', 'cabina', 'documento', 'pista'],
    step: async (p) => {
      await press(p, 'z');
      const pt = await pieceInteriorPoint(p);
      points.set(p, pt);
      await p.mouse.click(pt.x, pt.y); await settle(p, 600);
    },
  },
  {
    id: '04-2d-menu-contextual', surfaces: ['ambiente', 'documento', 'menu', 'pista'],
    step: async (p) => {
      // Found again, on the fill itself: with the piece selected, its dimension chip and grainline sit over the point step 03 clicked and give the line's menu, not the piece's.
      const pt = await pieceInteriorPoint(p, true);
      await p.mouse.click(pt.x, pt.y, { button: 'right' });
      await p.locator('.context-menu').waitFor({ state: 'visible', timeout: 3_000 });
    },
    after: async (p) => { await escape(p); await settle(p, 300); },
  },
  {
    id: '05-2d-pluma-activa', surfaces: ['ambiente', 'documento', 'pista'],
    step: async (p) => { await escape(p); await press(p, 'h'); await settle(p, 500); },
    after: escape,
  },
  {
    id: '06-2d-editar-patron', surfaces: ['ambiente', 'cabina', 'documento', 'pista'],
    step: async (p) => {
      await press(p, 'q');
      const pt = await pointOf(p);
      await p.mouse.click(pt.x, pt.y); await settle(p, 600);
    },
    after: escapeTwice,
  },
  {
    id: '07-paleta', surfaces: ['ambiente', 'barra', 'documento', 'paleta', 'pista'],
    step: async (p) => { await press(p, 'Control+k'); await settle(p, 500); },
    after: escape,
  },
  {
    // Named for the settings mode of the unified bar, which no longer exists (the
    // `.unified-bar__modes` row went away at 473c1772). The baseline state is the
    // canvas after the palette closes; the id stays because it is the baseline key.
    id: '08-barra-ajustes', surfaces: ['ambiente', 'documento', 'pista'],
    step: (p) => settle(p, 500),
    after: escape,
  },
  {
    id: '10-menu-logo', surfaces: ['ambiente', 'documento', 'menu', 'pista'],
    step: async (p) => { await p.locator('.logo-menu__trigger').click(); await settle(p); },
    after: escape,
  },
  {
    id: '11-panel-propiedades', surfaces: ['ambiente', 'cabina', 'documento', 'panel', 'pista'],
    step: async (p) => {
      await press(p, 'z');
      const pt = await pointOf(p);
      await p.mouse.click(pt.x, pt.y); await settle(p);
      await openPanel(p, 'show-properties');
    },
  },
  { id: '12-panel-capas', surfaces: ['ambiente', 'cabina', 'documento', 'panel', 'pista'], step: (p) => openPanel(p, 'show-layers') },
  { id: '12b-panel-avatar', surfaces: ['ambiente', 'cabina', 'documento', 'panel', 'pista'], step: (p) => openPanel(p, 'show-avatar'), after: escape },
  {
    id: '12c-rectangulo-tira', surfaces: ['ambiente', 'cabina', 'documento', 'pista'],
    step: async (p) => { await press(p, 's'); await settle(p, 500); },
    after: escape,
  },
  { id: '13-split', surfaces: ['ambiente', 'documento', 'pista'], step: (p) => clickViewMode(p, 'Split') },
  {
    id: '14-3d', surfaces: ['ambiente', 'pista'],
    step: async (p) => { await clickViewMode(p, '3D'); await settle(p, 1500); },
  },
  {
    // Captured mid-simulation: its status text depends on timing.
    id: '15-3d-simulando', surfaces: ['ambiente', 'instantaneas', 'pista', 'tooltip'],
    step: async (p) => { await p.locator('[data-action="simulate"]').click(); await settle(p, 4000); },
  },
];

/** Loads the fixture, replays every step before `index`, then runs the step itself. */
function reachChain(index: number) {
  return async (page: Page) => {
    await loadFixture(page);
    points.delete(page);
    for (let i = 0; i < index; i++) {
      await CHAIN[i].step(page);
      await CHAIN[i].after?.(page);
    }
    await CHAIN[index].step(page);
  };
}

export const I18N_SURFACES: readonly SurfaceEntry[] = [
  { id: '01-vacio', surfaces: ['ambiente', 'estado-vacio', 'pista'], swept: false, onlyFirstViewport: true, reach: async () => {} },
  { id: '01b-dxf-recien-cargado', surfaces: ['ambiente', 'documento', 'pista'], swept: false, onlyFirstViewport: true, reach: loadFixture },
  ...CHAIN.map((s, i): SurfaceEntry => ({ id: s.id, surfaces: s.surfaces, swept: false, reach: reachChain(i) })),
];

export const PENDING_SURFACES: readonly string[] = ['leyenda', 'modal', 'pie', 'toast', 'velo'];
export const PENDING_CEILING = 5;
