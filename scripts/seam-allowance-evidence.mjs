/**
 * Seam-allowance — Playwright EVIDENCE runner.
 *
 * Drives the real UI and writes a labelled screenshot per step, proving the
 * three things a patternmaker needs from per-edge seam allowance:
 *   A) per-edge width  — different allowance per edge on ONE piece (hem 40 / side 20)
 *   B) corner geometry — corner type per vertex
 *   C) with / without seam allowance — the ⇧S view toggle
 * Plus the interaction model: per-edge editing is left-click select + the docked
 * Properties panel; right-click is always the general command menu (no collapse).
 *
 * HOW TO RUN (two terminals):
 *   1) npm run dev                       # leave it running (warm server on :5173)
 *   2) node scripts/seam-allowance-evidence.mjs
 *
 * Screenshots land in:  screenshots/seam-allowance/  (the canonical test-evidence
 * folder, gitignored wholesale — evidence, not source). Exits 0 and prints OK
 * only if every axis verified.
 */
import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';

const BASE = process.env.VINA_BASE || process.env.OPENCLO_BASE || 'http://localhost:5173';
const DIR = 'screenshots/seam-allowance';
mkdirSync(DIR, { recursive: true });
const shot = (page, n) => page.screenshot({ path: `${DIR}/${n}.png` });

const ZOOM = 1.4, PAN = { x: 360, y: 320 };
let pass = true;
const check = (label, cond) => { console.log(`${cond ? '  ✓' : '  ✗'} ${label}`); if (!cond) pass = false; };

const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
page.on('pageerror', (e) => console.log('[pageerror]', e.message));

try {
  await page.goto(`${BASE}/app/`);
  await page.waitForSelector('.canvas-area', { timeout: 20000 });
  await page.waitForFunction(() => Boolean(window.__VINA_STORE__), { timeout: 15000 });
  await page.waitForTimeout(1200);

  const dispatch = (a) => page.evaluate((x) => window.__VINA_STORE__.dispatch(x), a);
  const state = () => page.evaluate(() => window.__VINA_STORE__.getState());

  // ── Setup: a bodice-front piece (edges get real garment names), SA 10 ──
  await dispatch({
    type: 'project/addPiece', payload: {
      id: 'evidence-front', name: 'Front', category: 'bodice', side: 'front',
      outline: [
        { type: 'M', values: [0, 0] }, { type: 'L', values: [240, 0] },
        { type: 'L', values: [240, 240] }, { type: 'L', values: [0, 240] }, { type: 'Z', values: [] },
      ],
      position: { x: 0, y: 0 }, rotation: 0, mirrored: false, active: true,
      seamAllowance: 10, internals: [], createdAt: Date.now(), updatedAt: Date.now(),
    },
  });
  await dispatch({ type: 'editor/setZoom2D', payload: ZOOM });
  await dispatch({ type: 'editor/setPan2D', payload: PAN });
  await dispatch({ type: 'editor/setActiveTool', payload: 'seamAllowance' });
  if (!(await state()).editor.showSeamAllowance) await dispatch({ type: 'editor/toggleSeamAllowance' });
  await page.waitForTimeout(400);

  const svg = await page.evaluate(() => {
    const r = document.querySelector('svg.pattern-svg').getBoundingClientRect();
    return { left: r.left, top: r.top };
  });
  const at = (lx, ly) => ({ x: svg.left + PAN.x + lx * ZOOM, y: svg.top + PAN.y + ly * ZOOM });
  const widths = async () => {
    const p = (await state()).project.pieces.find((x) => x.id === 'evidence-front');
    return Object.fromEntries(p.edges.map((e) => [e.name, e.seamAllowanceWidth]));
  };
  const edges = await page.evaluate(() => (window.__VINA_STORE__.getState().project.pieces.find((x) => x.id === 'evidence-front').edges ?? [])
    .map((e) => ({ name: e.name, range: e.segmentRange })));
  const nameForCmd = (c) => (edges.find((e) => e.range[0] <= c && c < e.range[1]) || {}).name;
  const hemName = nameForCmd(3), sideName = nameForCmd(2);

  console.log(`\nPiece edges: ${edges.map((e) => e.name).join(', ')}`);
  console.log(`hem(bottom)=${hemName}  side(right)=${sideName}\n`);

  await shot(page, '00-piece-SA-tool-active');

  // ── Axis A — per-edge width ──
  console.log('Axis A — per-edge width (left-click an edge → panel):');
  await page.mouse.click(at(120, 238).x, at(120, 238).y);          // hem (bottom)
  await page.waitForSelector('#edge-prop-width', { timeout: 5000 });
  await shot(page, '01-edge-selected-panel-open');
  await page.locator('#edge-prop-width').fill('40');
  await page.locator('#edge-prop-width').press('Enter');
  await page.waitForTimeout(250);

  await page.mouse.click(at(238, 120).x, at(238, 120).y);          // side (right)
  await page.waitForSelector('#edge-prop-width', { timeout: 5000 });
  await page.locator('#edge-prop-width').fill('20');
  await page.locator('#edge-prop-width').press('Enter');
  await page.waitForTimeout(250);
  await shot(page, '02-per-edge-asymmetric');

  const w = await widths();
  check(`hem ${hemName} = 40mm`, w[hemName] === 40);
  check(`side ${sideName} = 20mm (different width, same piece)`, w[sideName] === 20);

  // ── Axis B — corner geometry ──
  console.log('Axis B — corner geometry (left-click a vertex → panel):');
  await page.mouse.click(at(2, 2).x, at(2, 2).y);                  // top-left corner
  await page.waitForTimeout(300);
  check('a vertex is selected', !!(await state()).editor.selectedVertex);
  await page.getByRole('button', { name: /^squared$/i }).click();
  await page.waitForTimeout(250);
  await shot(page, '03-corner-type-squared');
  const ct = (await state()).project.pieces.find((x) => x.id === 'evidence-front').cornerTypes ?? {};
  check('a squared corner was applied', Object.values(ct).includes('squared'));

  // ── Axis C — with / without seam allowance ──
  console.log('Axis C — show / hide seam allowance (⇧S):');
  await dispatch({ type: 'editor/toggleSeamAllowance' });
  await page.waitForTimeout(250);
  check('seam allowance hidden', (await state()).editor.showSeamAllowance === false);
  await shot(page, '04-without-seam-allowance');
  await dispatch({ type: 'editor/toggleSeamAllowance' });
  await page.waitForTimeout(250);
  check('seam allowance shown', (await state()).editor.showSeamAllowance === true);
  await shot(page, '05-with-seam-allowance');

  // ── Interaction fix — right-click is the general command menu ──
  console.log('Interaction fix — right-click = general menu (no collapse):');
  await page.mouse.click(at(120, 120).x, at(120, 120).y, { button: 'right' });
  await page.waitForSelector('.context-menu', { timeout: 5000 });
  check('right-click shows the general command menu', await page.evaluate(() => !!document.querySelector('.context-menu')));
  await shot(page, '06-rightclick-general-menu');

  console.log(`\n${pass ? 'OK' : 'FAIL'} — evidence written to ${DIR}/`);
} catch (err) {
  console.log('ERROR:', err.message);
  pass = false;
  await shot(page, 'error').catch(() => {});
} finally {
  await browser.close();
}
process.exit(pass ? 0 : 1);
