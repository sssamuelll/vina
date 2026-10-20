#!/usr/bin/env node
/**
 * Capturas de la interfaz VIVA de Vina en los estados que decide una revisión
 * de diseño, con el patrón real de María, en dos resoluciones (la laptop de
 * María y un escritorio). Reusa la mecánica de `ui-surface-audit.mjs` (store
 * expuesto en `window.__VINA_STORE__`, `setInputFiles` del DXF).
 *
 * Se corre contra un BUILD DE PRODUCCIÓN, no contra el dev server: dos
 * superficies (`TopBar.tsx:81`, `SolverMetrics.tsx:36`) solo existen en DEV y
 * en las capturas del 24-09 exageraban el cromo.
 *
 *   npm run build && npx vite preview --port 4174 --strictPort     # terminal 1
 *   node scripts/capturas-ui.mjs --fecha=2026-09-26 [--sufijo=-f1] [--url=http://localhost:4174]
 *
 * Salida: docs/reports/ui-audit-<fecha><sufijo>/capturas/*.png y
 * superficies.json (qué `data-superficie` estaba visible en cada captura).
 * La carpeta ui-audit-* está ignorada por git a propósito.
 */
import { chromium } from 'playwright';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const arg = (nombre) => process.argv.slice(2).find((a) => a.startsWith(`--${nombre}=`))?.slice(nombre.length + 3);
const FECHA = arg('fecha');
if (!FECHA || !/^\d{4}-\d{2}-\d{2}$/.test(FECHA)) {
  console.error('Falta --fecha=YYYY-MM-DD (sin valor por defecto: dos corridas del mismo día se pisarían).');
  process.exit(1);
}
const TEXTO = process.argv.includes('--texto');
const SUFIJO = arg('sufijo') ?? '';
const BASE_URL = (arg('url') ?? 'http://localhost:4174').replace(/\/$/, '');
const FIXTURE = path.join(REPO, 'tests/fixtures/garments/maria_patrones_samuel_2M.dxf');
const OUT = path.join(REPO, 'docs/reports', `ui-audit-${FECHA}${SUFIJO}`, 'capturas');
const VIEWPORTS = [
  { name: 'maria-1366x768', width: 1366, height: 768 },
  { name: 'desk-1600x1000', width: 1600, height: 1000 },
];

await mkdir(OUT, { recursive: true });
const browser = await chromium.launch();
const context = await browser.newContext({ viewport: VIEWPORTS[0], deviceScaleFactor: 1 });
const page = await context.newPage();
const cdp = await context.newCDPSession(page);
await cdp.send('Storage.clearDataForOrigin', { origin: new URL(BASE_URL).origin, storageTypes: 'all' });

const registro = {};
const settle = (ms = 400) => page.waitForTimeout(ms);
const superficies = () => page.evaluate(() => {
  const vw = window.innerWidth, vh = window.innerHeight;
  const visibles = new Set();
  for (const el of document.querySelectorAll('[data-superficie]')) {
    const r = el.getBoundingClientRect();
    if (r.width <= 0 || r.height <= 0 || r.right <= 0 || r.bottom <= 0 || r.left >= vw || r.top >= vh) continue;
    visibles.add(el.getAttribute('data-superficie'));
  }
  return [...visibles].sort();
});
// --texto: also record the visible text of every shot (i18n es baseline).
// Self-contained on purpose: no closures over module scope, so it can move unchanged into a Playwright helper.
const collectTexto = () => {
  const visible = (el) => el.getClientRects().length > 0 && getComputedStyle(el).visibility !== 'hidden';
  const inDev = (el) => Boolean(el.closest('[data-superficie="dev"]'));
  const text = new Set(), attrs = new Set();
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    const value = n.nodeValue.trim();
    const parent = n.parentElement;
    if (value && parent && !inDev(parent) && visible(parent)) text.add(value);
  }
  for (const el of document.body.querySelectorAll('[aria-label],[title],[placeholder],[alt]')) {
    if (inDev(el) || !visible(el)) continue;
    for (const name of ['aria-label', 'title', 'placeholder', 'alt']) {
      const value = el.getAttribute(name)?.trim();
      if (value) attrs.add(value);
    }
  }
  return { text: [...text].sort(), attrs: [...attrs].sort() };
};
const textos = {};
const shot = async (nombre) => {
  await settle();
  await page.screenshot({ path: path.join(OUT, `${nombre}.png`) });
  if (TEXTO) textos[nombre] = await page.evaluate(collectTexto);
  registro[nombre] = await superficies();
  console.log('captura', nombre, registro[nombre].join(' '));
};
const dismissToasts = () => page.evaluate(() => {
  document.querySelectorAll('.toast__dismiss').forEach((b) => b.click());
}).catch(() => {});

async function waitForApp(piezas) {
  await page.locator('.app-shell').waitFor({ state: 'visible', timeout: 90_000 });
  await page.waitForFunction(() => Boolean(window.__VINA_STORE__?.getState), undefined, { timeout: 60_000 });
  await page.waitForFunction((n) => (window.__VINA_STORE__.getState().project?.pieces?.length ?? 0) === n, piezas, { timeout: 60_000 });
  await page.locator('svg.pattern-svg').waitFor({ state: 'attached', timeout: 20_000 });
}
async function clickViewMode(label) {
  await page.locator('.pill-group').getByRole('button', { name: label, exact: true }).click();
  await settle(900);
}
async function pieceInteriorPoint() {
  return page.locator('svg.pattern-svg').evaluate((svg) => {
    const fills = [...svg.querySelectorAll('.pattern-piece .piece-fill')]
      .map((fill) => ({ fill, rect: fill.getBoundingClientRect() }))
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
        if (hit && hit.closest('[data-piece-id]') === owner) return { x, y };
      }
    }
    return null;
  });
}
async function abrirPanel(comando) {
  await page.keyboard.press('Control+k'); await settle(400);
  await page.locator('.unified-bar__panel').getByText(comando, { exact: true }).first().click().catch(() => {});
  await settle(900);
}

await page.goto(`${BASE_URL}/app/`, { waitUntil: 'domcontentloaded', timeout: 90_000 });
await waitForApp(0);
await settle(1500);
await dismissToasts();
await shot('01-vacio');

await page.locator('input[accept=".dxf"]').setInputFiles(FIXTURE);
await page.waitForFunction(() => window.__VINA_STORE__.getState().project.pieces.length === 5, undefined, { timeout: 60_000 });
await settle(1500);
await shot('01b-dxf-recien-cargado');
await dismissToasts();

for (const vp of VIEWPORTS) {
  await page.setViewportSize({ width: vp.width, height: vp.height });
  await settle(1200);
  await dismissToasts();
  await page.keyboard.press('Escape');
  const P = (n) => `${vp.name}--${n}`;

  await clickViewMode('2D');
  await shot(P('02-2d-cargado'));

  await page.keyboard.press('z');
  const pt = await pieceInteriorPoint();
  if (pt) { await page.mouse.click(pt.x, pt.y); await settle(600); }
  await shot(P('03-2d-pieza-seleccionada'));

  if (pt) {
    await page.locator('[data-piece-id]').first().click({ button: 'right' }).catch(() => {});
    await page.locator('.context-menu').waitFor({ state: 'visible', timeout: 3_000 }).catch(() => {});
  }
  await shot(P('04-2d-menu-contextual'));
  await page.keyboard.press('Escape'); await settle(300);

  await page.keyboard.press('Escape');
  await page.keyboard.press('h'); await settle(500);
  await shot(P('05-2d-pluma-activa'));
  await page.keyboard.press('Escape');

  await page.keyboard.press('q');
  if (pt) { await page.mouse.click(pt.x, pt.y); await settle(600); }
  await shot(P('06-2d-editar-patron'));
  await page.keyboard.press('Escape'); await page.keyboard.press('Escape');

  await page.keyboard.press('Control+k'); await settle(500);
  await shot(P('07-paleta'));
  await page.keyboard.press('Escape');

  await page.locator('.unified-bar__modes').getByRole('button', { name: 'Modo ajustes', exact: true }).click().catch(() => {});
  await settle(500);
  await shot(P('08-barra-ajustes'));
  await page.locator('.unified-bar__modes').getByRole('button', { name: 'Modo chat', exact: true }).click().catch(() => {});
  await page.keyboard.press('Escape');

  await page.locator('.logo-menu__trigger').click().catch(() => {});
  await settle(400);
  await shot(P('10-menu-logo'));
  await page.keyboard.press('Escape');

  await page.keyboard.press('z');
  if (pt) { await page.mouse.click(pt.x, pt.y); await settle(400); }
  await abrirPanel('Propiedades');
  await shot(P('11-panel-propiedades'));
  await abrirPanel('Capas');
  await shot(P('12-panel-capas'));
  await abrirPanel('Avatar y medidas');
  await shot(P('12b-panel-avatar'));
  await page.keyboard.press('Escape');
  await page.keyboard.press('s'); await settle(500);
  await shot(P('12c-rectangulo-tira'));
  await page.keyboard.press('Escape');

  await clickViewMode('Split');
  await shot(P('13-split'));
  await clickViewMode('3D');
  await settle(1500);
  await shot(P('14-3d'));
  await page.locator('nav[aria-label="Herramientas del 3D"]').getByRole('button', { name: 'Simular', exact: true }).click().catch(() => {});
  await settle(4000);
  await shot(P('15-3d-simulando'));
  await page.locator('nav[aria-label="Herramientas del 3D"]').getByRole('button', { name: /Detener|Pausar|Parar|Simular/ }).first().click().catch(() => {});
}

await writeFile(path.join(OUT, 'superficies.json'), JSON.stringify(registro, null, 2) + '\n');
if (TEXTO) {
  const dir = path.join(REPO, 'tests/i18n/baseline');
  await mkdir(dir, { recursive: true });
  const salida = { _base: '473c1772', _fixture: 'tests/fixtures/garments/maria_patrones_samuel_2M.dxf', shots: textos };
  await writeFile(path.join(dir, 'texto-es.json'), JSON.stringify(salida, null, 2) + '\n');
}
await browser.close();
console.log('OK', OUT);
