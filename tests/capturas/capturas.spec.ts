import { test, expect } from '@playwright/test';
import { execSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { en } from '../../src/i18n/en';
import { es } from '../../src/i18n/es';
import { I18N_SURFACES, collectText, openApp, visibleSurfaces } from '../e2e/i18n-surfaces';

const LOCALE = process.env.CAPTURAS_LOCALE ?? 'es';
const FECHA = process.env.CAPTURAS_FECHA;
if (!FECHA || !/^\d{4}-\d{2}-\d{2}$/.test(FECHA)) {
  throw new Error('CAPTURAS_FECHA=YYYY-MM-DD is required (no default: two runs on the same day would overwrite each other).');
}
const OUT = path.resolve('docs/reports', `ui-audit-${FECHA}`, 'capturas');
const FIXTURE = 'tests/fixtures/garments/maria_patrones_samuel_2M.dxf';

type Shot = { text: string[]; attrs: string[] };
const COMPARE = process.env.CAPTURAS_COMPARE
  ? (JSON.parse(readFileSync(process.env.CAPTURAS_COMPARE, 'utf8')) as { shots: Record<string, Shot> }).shots
  : null;

type Items = { text: string[]; attrs: string[] };
interface Exception { reason: string; removed: Items; added: Items }
const MENU_04: Exception = {
  reason: "the baseline shot is a copy of 03: the script's right-click opened no menu",
  removed: { text: ["180 mm", "90° al eje", "Clic en una cota para escribirla · arrástrala para ajustar · Tab pasa a la siguiente · Esc suelta", "·"], attrs: ["Clic en una cota para escribirla · arrástrala para ajustar · Tab pasa a la siguiente · Esc suelta", "Largo: 180 mm · Ángulo: 90° al eje"] },
  added: { text: ["Bloquear", "Capa", "Copiar", "Crear grupo con la selección", "Ctrl+C", "Desactivar pieza", "Duplicar", "Eliminar pieza", "Inspeccionar", "Optimizar todos los puntos de curva", "Orden", "PATRONES PARA SAMUEL-5", "Propiedades…", "Renombrar…", "Rotar 90°", "Seleccionar mueve la pieza, y un punto si pinchas encima · Editar patrón además añade, borra y curva", "Supr", "Voltear horizontal", "Voltear vertical", "↔", "↕", "↻", "⇅", "⏸", "▸", "◇", "☐", "✏️", "⧉", "🎛", "📁", "📄", "📑", "🔍", "🔒", "🗑"], attrs: ["Seleccionar mueve la pieza, y un punto si pinchas encima · Editar patrón además añade, borra y curva"] },
};
const SNAPSHOT_CARRIED: Exception = {
  reason: "the baseline's desk run carried the maria run's snapshot and simulation status",
  removed: { text: ["+", "1"], attrs: ["Estado de la simulación: En pausa · WASM XPBD · 1 aviso", "Guardar el estado actual"] },
  added: { text: [], attrs: ["Simula para ver los mapas de ajuste"] },
};

// Differences between the baseline's capture and a real run of the same state, as exact lists; any other difference is a step that misses its state.
const COMPARE_EXCEPTIONS: Record<string, Exception | 'skip'> = {
  // Captured mid-simulation: the status text depends on timing.
  'maria-1366x768--15-3d-simulando': 'skip',
  'desk-1600x1000--15-3d-simulando': 'skip',
  'maria-1366x768--04-2d-menu-contextual': MENU_04,
  'desk-1600x1000--04-2d-menu-contextual': MENU_04,
  'desk-1600x1000--02-2d-cargado': {
    reason: "the baseline's desk run carried the maria run's rectangle tool",
    removed: { text: ["Arrastra para dibujar · un clic crea uno de 100 × 100 mm · escribe en sus cotas para cambiarlo · Esc cancela", "Rectángulo", "S"], attrs: ["Arrastra para dibujar · un clic crea uno de 100 × 100 mm · escribe en sus cotas para cambiarlo · Esc cancela"] },
    added: { text: ["Seleccionar", "Seleccionar mueve la pieza, y un punto si pinchas encima · Editar patrón además añade, borra y curva", "Z"], attrs: ["Seleccionar mueve la pieza, y un punto si pinchas encima · Editar patrón además añade, borra y curva"] },
  },
  'desk-1600x1000--13-split': SNAPSHOT_CARRIED,
  'desk-1600x1000--14-3d': SNAPSHOT_CARRIED,
};

// Catalog keys whose Spanish was written fresh (spec § 1.1 O9): for each, the compare tolerates the
// `en` text missing from a shot and the `es` text added to it, and nothing else.
const leaves = (node: unknown, other: unknown): [string, string][] =>
  typeof node === 'string' && typeof other === 'string'
    ? [[node, other]]
    : node && other && typeof node === 'object' && typeof other === 'object'
      ? Object.entries(node).flatMap(([k, v]) => leaves(v, (other as Record<string, unknown>)[k]))
      : [];
const lookup = (root: unknown, key: string) => key.split('.').reduce<unknown>((n, k) => (n as Record<string, unknown> | undefined)?.[k], root);
const ALLOWED: [string, string][] = process.env.CAPTURAS_ALLOWED
  ? (JSON.parse(readFileSync(process.env.CAPTURAS_ALLOWED, 'utf8')) as string[]).flatMap((key) => {
      const pairs = leaves(lookup(en, key), lookup(es, key));
      if (!pairs.length) throw new Error(`CAPTURAS_ALLOWED: "${key}" has no string entries in both catalogs`);
      return pairs;
    })
  : [];

const registro: Record<string, string[]> = {};
const textos: Record<string, Shot> = {};

function compare(name: string, got: Shot) {
  const base = COMPARE?.[name];
  if (!base) { if (COMPARE) throw new Error(`${name} is not in the baseline`); return; }
  const exception = COMPARE_EXCEPTIONS[name];
  if (exception === 'skip') return;
  for (const key of ['text', 'attrs'] as const) {
    const expected = [...base[key]];
    for (const item of exception?.removed[key] ?? []) {
      const at = expected.indexOf(item);
      if (at < 0) throw new Error(`${name} ${key}: stale exception, "${item}" is not in the baseline`);
      expected.splice(at, 1);
    }
    expected.push(...(exception?.added[key] ?? []));
    const shot = [...got[key]];
    // A key counts only as a pair: its English left the shot and its Spanish joined it, in one place.
    for (const [enText, esText] of ALLOWED) {
      if (enText === esText) continue;
      const missing = expected.indexOf(enText);
      const added = shot.indexOf(esText);
      if (missing < 0 || added < 0 || shot.includes(enText) || expected.includes(esText)) continue;
      expected.splice(missing, 1);
      shot.splice(added, 1);
    }
    expect(shot.sort(), `${name} ${key}`).toEqual(expected.sort());
  }
}

test.describe.configure({ mode: 'serial' });
mkdirSync(OUT, { recursive: true });

for (const entry of I18N_SURFACES) {
  test(`${entry.id}`, async ({ page }, testInfo) => {
    const project = testInfo.project.name;
    const first = project === testInfo.config.projects[0].name;
    test.skip(Boolean(entry.onlyFirstViewport) && !first, 'only in the first viewport');
    const name = entry.onlyFirstViewport ? entry.id : `${project}--${entry.id}`;
    testInfo.annotations.push({ type: 'shot', description: name });

    await openApp(page, new URL(testInfo.project.use.baseURL ?? 'http://localhost:4174').origin, `/app/?lang=${LOCALE}`);

    await entry.reach(page);

    await page.waitForTimeout(400);
    const surfaces = await visibleSurfaces(page);
    expect(surfaces).toEqual(expect.arrayContaining([...entry.surfaces]));
    await page.screenshot({ path: path.join(OUT, `${name}.png`) });
    const got = await collectText(page);
    textos[name] = got;
    registro[name] = surfaces;
    console.log('captura', name, surfaces.join(' '));
    compare(name, got);
  });
}

// Each project runs in its own worker and writes its own shots, so both files merge with what an
// earlier project of this run wrote; global-setup.ts empties them when the run starts.
const merged = <T>(file: string, own: Record<string, T>, pick: (j: Record<string, unknown>) => Record<string, T>): Record<string, T> =>
  existsSync(file) ? { ...pick(JSON.parse(readFileSync(file, 'utf8'))), ...own } : own;

// eslint-disable-next-line no-empty-pattern -- Playwright reads fixtures from a destructured first argument
test.afterAll(({}, testInfo) => {
  const file = path.join(OUT, 'superficies.json');
  const all = merged(file, registro, (j) => j as Record<string, string[]>);
  writeFileSync(file, JSON.stringify(Object.fromEntries(Object.keys(all).sort().map((k) => [k, all[k]])), null, 2) + '\n');
  const target = process.env.CAPTURAS_TEXTO;
  if (!target) return;
  // A text baseline is written only from a project whose every shot was captured.
  const project = testInfo.project.name;
  const first = project === testInfo.config.projects[0].name;
  const missing = I18N_SURFACES.filter((e) => first || !e.onlyFirstViewport)
    .map((e) => (e.onlyFirstViewport ? e.id : `${project}--${e.id}`))
    .filter((name) => !textos[name]);
  if (missing.length) {
    console.error(`CAPTURAS_TEXTO not written for ${project}: no capture for ${missing.join(', ')}`);
    return;
  }
  const shots = merged(target, textos, (j) => (j.shots ?? {}) as Record<string, Shot>);
  const sorted = Object.fromEntries(Object.keys(shots).sort().map((k) => [k, shots[k]]));
  const _base = execSync('git rev-parse --short=8 HEAD').toString().trim();
  writeFileSync(target, JSON.stringify({ _base, _fixture: FIXTURE, shots: sorted }, null, 2) + '\n');
});
