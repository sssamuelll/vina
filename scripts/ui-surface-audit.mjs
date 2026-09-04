#!/usr/bin/env node

/**
 * Auditoría mecánica de superficies de UI de Vina.
 *
 * Uso (la fecha es obligatoria; no hay valor por defecto):
 *   node scripts/ui-surface-audit.mjs --fecha=2026-09-04
 *   VINA_AUDIT_DATE=2026-09-04 node scripts/ui-surface-audit.mjs
 *   VINA_URL=http://localhost:5174 node scripts/ui-surface-audit.mjs --fecha=2026-09-04
 *
 * La salida va a docs/reports/ui-audit-<fecha> y esa carpeta se BORRA antes de
 * empezar. Por eso la fecha se pide de fuera en vez de leerla del reloj: con la
 * fecha de hoy por defecto, dos corridas del mismo día se pisarían igual y el
 * destino dejaría de ser reproducible.
 *
 * Política de storage:
 * - Chromium corre en un BrowserContext efímero, aislado del perfil del usuario.
 * - Antes de la primera navegación se limpia TODO el storage del origen mediante
 *   CDP (`Storage.clearDataForOrigin`), incluida IndexedDB. Así el primer estado
 *   es vacío de verdad y nunca depende de un autosave de otra corrida.
 * - Después de importar el DXF se hace un flush con el `saveToStorage`
 *   canónico de la app y se espera mecánicamente a que el autosave
 *   `vina/projects/autosave` contenga las cinco piezas. Cada visita cargada hace
 *   reload y parte de esa restauración conocida.
 *
 * Este archivo es una herramienta de diagnóstico manual. No es un spec y no
 * participa en CI.
 */

import { chromium } from 'playwright';
import { access, mkdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(SCRIPT_DIR, '..');
function resolveAuditDate() {
  const flag = '--fecha=';
  const fromArgv = process.argv.slice(2).find((arg) => arg.startsWith(flag))?.slice(flag.length);
  const raw = (fromArgv ?? process.env.VINA_AUDIT_DATE ?? '').trim();
  const fail = (detalle) => {
    console.error(
      `${detalle}\n`
      + 'Pásala como argumento o por entorno:\n'
      + '  node scripts/ui-surface-audit.mjs --fecha=YYYY-MM-DD\n'
      + '  VINA_AUDIT_DATE=YYYY-MM-DD node scripts/ui-surface-audit.mjs\n'
      + 'No hay fecha por defecto a propósito: el censo borra docs/reports/ui-audit-<fecha> '
      + 'antes de escribir, y tomarla del reloj pisaría la corrida anterior del mismo día.',
    );
    process.exit(1);
  };
  if (!raw) fail('Falta la fecha del censo.');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) fail(`Fecha del censo con formato inválido: ${raw}`);
  // Descarta un 2026-13-01 o un 2026-02-31, que pasarían el patrón y crearían
  // una carpeta que nadie va a volver a encontrar.
  const asDate = new Date(`${raw}T00:00:00Z`);
  if (Number.isNaN(asDate.getTime()) || !asDate.toISOString().startsWith(raw)) {
    fail(`Fecha del censo inexistente: ${raw}`);
  }
  return raw;
}

const AUDIT_DATE = resolveAuditDate();
const OUTPUT_DIR = path.resolve(REPO_ROOT, 'docs', 'reports', `ui-audit-${AUDIT_DATE}`);
const FIXTURE = path.resolve(REPO_ROOT, 'tests', 'fixtures', 'garments', 'maria_patrones_samuel_2M.dxf');
const DEFAULT_VIEWPORT = { width: 1600, height: 1000 };
const EXPECTED_PIECES = 5;
const BASE_URL = (process.env.VINA_URL || 'http://localhost:5173').replace(/\/$/, '');
const ORIGIN = new URL(BASE_URL).origin;
const EXTERNAL_CDP_URL = process.env.VINA_CDP_URL || '';

const states = [];
const runtimeEvents = [];
const downloads = [];
let activeStateName = 'arranque';
let browser;
let context;
let page;
const frozenResponses = new Map();
const networkSnapshot = {
  habilitado: true,
  capturadoEn: null,
  respuestasGrafoInicial: 0,
  respuestasTotales: 0,
  bytesTotales: 0,
  aciertosCache: 0,
  recursosNoFuenteCapturadosTarde: 0,
  websocketsHmrInterceptados: 0,
  candidatos404Ignorados: 0,
  fuentesNoCapturadas: [],
};

function assertSafeOutputDirectory() {
  const reportsRoot = path.resolve(REPO_ROOT, 'docs', 'reports');
  const relative = path.relative(reportsRoot, OUTPUT_DIR);
  if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new Error(`Directorio de salida inseguro: ${OUTPUT_DIR}`);
  }
  if (path.basename(OUTPUT_DIR) !== `ui-audit-${AUDIT_DATE}`) {
    throw new Error(`Nombre de salida inesperado: ${OUTPUT_DIR}`);
  }
}

function normalizeError(error) {
  if (error instanceof Error) return error.stack || error.message;
  return String(error);
}

function slugify(value) {
  const slug = value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 78);
  return slug || 'estado';
}

function relativeToRepo(filePath) {
  return path.relative(REPO_ROOT, filePath).replaceAll('\\', '/');
}

function responseHeadersWithoutTransport(headers) {
  const normalized = headers instanceof Headers
    ? Object.fromEntries(headers.entries())
    : { ...headers };
  delete normalized['content-encoding'];
  delete normalized['content-length'];
  delete normalized['transfer-encoding'];
  return normalized;
}

function isViteGraphUrl(value) {
  const url = new URL(value, BASE_URL);
  if (url.origin !== ORIGIN) return false;
  const pathname = url.pathname;
  return pathname === '/'
    || pathname.startsWith('/src/')
    || pathname.startsWith('/@')
    || pathname.startsWith('/node_modules/.vite/')
    || /\.(?:[cm]?[jt]sx?|css|html)$/.test(pathname)
    || url.searchParams.has('worker_file');
}

function extractViteGraphUrls(source, baseUrl) {
  const rawSpecifiers = new Set();
  const patterns = [
    /\b(?:import|export)\s+(?:[^"'();]*?\s+from\s*)?["']([^"']+)["']/g,
    /\bimport\s*\(\s*(?:\/\*[\s\S]*?\*\/\s*)?["'`]([^"'`]+)["'`]\s*\)/g,
    /\b(?:src|href)=["']([^"']+)["']/g,
    /\bnew\s+URL\(\s*["'`]([^"'`]+)["'`]/g,
    /["'`]((?:\/src\/|\/@|\/node_modules\/\.vite\/|\.\.?\/)[^"'`]+)["'`]/g,
  ];
  for (const pattern of patterns) {
    for (const match of source.matchAll(pattern)) rawSpecifiers.add(match[1]);
  }

  const urls = [];
  for (const specifier of rawSpecifiers) {
    if (!specifier || specifier.startsWith('data:') || specifier.startsWith('blob:') || specifier.startsWith('#')) continue;
    try {
      const resolved = new URL(specifier, baseUrl);
      resolved.hash = '';
      if (isViteGraphUrl(resolved)) urls.push(resolved.href);
    } catch {
      // Una cadena que parece URL pero no se puede resolver no pertenece al
      // grafo HTTP transformado por Vite.
    }
  }
  return urls;
}

async function captureViteModuleGraph() {
  frozenResponses.clear();
  const queued = new Set([`${BASE_URL}/`]);
  let frontier = [`${BASE_URL}/`];
  const maxEntries = 5_000;
  const maxBytes = 300 * 1024 * 1024;
  let totalBytes = 0;

  while (frontier.length > 0) {
    const next = new Set();
    for (let offset = 0; offset < frontier.length; offset += 16) {
      const batch = frontier.slice(offset, offset + 16);
      const results = await Promise.all(batch.map(async (url) => {
        const response = await fetch(url, {
          // Vite usa `Accept: text/css` para decidir que una hoja se pide en
          // modo directo. Los imports ESM del navegador usan `*/*` y reciben
          // el wrapper JavaScript que inyecta el estilo.
          headers: { accept: '*/*' },
        });
        if (!response.ok) {
          if (url === `${BASE_URL}/`) throw new Error(`No se pudo congelar ${url}: HTTP ${response.status}`);
          networkSnapshot.candidatos404Ignorados += 1;
          return null;
        }
        const body = Buffer.from(await response.arrayBuffer());
        const headers = responseHeadersWithoutTransport(response.headers);
        const key = new URL(url).href;
        frozenResponses.set(key, { status: response.status, headers, body });
        totalBytes += body.byteLength;
        if (frozenResponses.size > maxEntries || totalBytes > maxBytes) {
          throw new Error(`Snapshot Vite excedió el límite (${frozenResponses.size} respuestas, ${totalBytes} bytes)`);
        }
        return {
          url: key,
          body,
          contentType: headers['content-type'] || '',
        };
      }));

      for (const result of results) {
        if (!result) continue;
        const pathname = new URL(result.url).pathname;
        const isText = /(?:javascript|typescript|text\/css|text\/html)/i.test(result.contentType)
          || /\.(?:[cm]?[jt]sx?|css|html)$/.test(pathname);
        if (!isText) continue;
        const source = result.body.toString('utf8');
        for (const candidate of extractViteGraphUrls(source, result.url)) {
          if (queued.has(candidate)) continue;
          queued.add(candidate);
          next.add(candidate);
        }
      }
    }
    frontier = [...next];
  }

  networkSnapshot.capturadoEn = new Date().toISOString();
  networkSnapshot.respuestasGrafoInicial = frozenResponses.size;
  networkSnapshot.respuestasTotales = frozenResponses.size;
  networkSnapshot.bytesTotales = totalBytes;
}

async function installFrozenNetworkSnapshot() {
  await captureViteModuleGraph();

  // Vite no puede empujar HMR dentro del contexto auditado: cada reload debe
  // ejecutar exactamente los mismos módulos transformados del snapshot.
  await context.routeWebSocket(/.*/, (webSocket) => {
    networkSnapshot.websocketsHmrInterceptados += 1;
    webSocket.onMessage(() => {});
  });

  await context.route(`${ORIGIN}/**`, async (route) => {
    const request = route.request();
    if (request.method() !== 'GET') {
      await route.continue();
      return;
    }

    const key = new URL(request.url()).href;
    const cached = frozenResponses.get(key);
    if (cached) {
      networkSnapshot.aciertosCache += 1;
      await route.fulfill(cached);
      return;
    }

    if (isViteGraphUrl(key)) {
      if (!networkSnapshot.fuentesNoCapturadas.includes(key)) networkSnapshot.fuentesNoCapturadas.push(key);
      await route.abort('blockedbyclient');
      return;
    }

    // Binarios y assets no pertenecen al grafo de código. Se fijan en su
    // primera lectura para que las recargas siguientes tampoco cambien.
    const response = await route.fetch();
    const body = await response.body();
    const entry = {
      status: response.status(),
      headers: responseHeadersWithoutTransport(response.headers()),
      body,
    };
    frozenResponses.set(key, entry);
    networkSnapshot.recursosNoFuenteCapturadosTarde += 1;
    networkSnapshot.respuestasTotales = frozenResponses.size;
    networkSnapshot.bytesTotales += body.byteLength;
    await route.fulfill(entry);
  });
}

function attachPageDiagnostics(targetPage) {
  targetPage.on('pageerror', (error) => {
    runtimeEvents.push({
      estado: activeStateName,
      tipo: 'pageerror',
      mensaje: error.message,
      timestamp: new Date().toISOString(),
    });
  });
  targetPage.on('console', (message) => {
    if (message.type() !== 'error') return;
    runtimeEvents.push({
      estado: activeStateName,
      tipo: 'console.error',
      mensaje: message.text(),
      timestamp: new Date().toISOString(),
    });
  });
  targetPage.on('download', (download) => {
    downloads.push({
      estado: activeStateName,
      archivo: download.suggestedFilename(),
      timestamp: new Date().toISOString(),
    });
    void download.cancel().catch(() => {});
  });
}

async function ensurePage() {
  if (page && !page.isClosed()) return page;
  page = await context.newPage();
  page.setDefaultTimeout(20_000);
  page.setDefaultNavigationTimeout(90_000);
  attachPageDiagnostics(page);
  return page;
}

async function settleUI() {
  await page.evaluate(async () => {
    if (document.fonts?.ready) await document.fonts.ready;
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  });
}

async function waitForStore() {
  await page.waitForFunction(() => Boolean(window.__VINA_STORE__), undefined, { timeout: 20_000 });
}

async function waitForPieceCount(expected) {
  await page.waitForFunction((count) => {
    const store = window.__VINA_STORE__;
    return store?.getState?.()?.project?.pieces?.length === count;
  }, expected, { timeout: 30_000 });
}

async function waitForRenderedPieces(expected) {
  await page.waitForFunction((count) => (
    document.querySelectorAll('svg.pattern-svg [data-piece-id]').length === count
  ), expected, { timeout: 20_000 });
}

async function waitForAutosave(expected) {
  await page.waitForFunction(async (count) => {
    // No abrir por nombre hasta saber que existe: indexedDB.open() crearía una
    // base vacía y una sonda de lectura terminaría mutando el sistema auditado.
    const databases = await indexedDB.databases();
    if (!databases.some((database) => database.name === 'vina')) return false;
    const database = await new Promise((resolve, reject) => {
      const request = indexedDB.open('vina');
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error || new Error('No se pudo abrir IndexedDB'));
    });
    try {
      if (!database.objectStoreNames.contains('projects')) return false;
      const value = await new Promise((resolve, reject) => {
        const tx = database.transaction('projects', 'readonly');
        const request = tx.objectStore('projects').get('autosave');
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error || new Error('No se pudo leer el autosave'));
      });
      return value?.pieces?.length === count;
    } finally {
      database.close();
    }
  }, expected, { timeout: 35_000, polling: 250 });
}

async function waitForPersistenceReady() {
  await page.waitForFunction(async () => {
    const databases = await indexedDB.databases();
    if (!databases.some((database) => database.name === 'vina')) return false;
    const database = await new Promise((resolve, reject) => {
      const request = indexedDB.open('vina');
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error || new Error('No se pudo abrir IndexedDB'));
    });
    try {
      return database.objectStoreNames.contains('projects');
    } finally {
      database.close();
    }
  }, undefined, { timeout: 30_000, polling: 100 });
  await settleUI();
}

async function dismissToasts() {
  await page.locator('.toast__dismiss').evaluateAll((buttons) => {
    for (const button of buttons) button.click();
  }).catch(() => {});
  await page.waitForFunction(() => !document.querySelector('.toast-container'), undefined, { timeout: 3_000 }).catch(() => {});
}

async function waitForApp(expectedPieces) {
  // En un Vite realmente frío, transformar el grafo completo (Three + WASM +
  // editor) puede superar 45 s aunque index.html responda en milisegundos.
  await page.locator('.app-shell').waitFor({ state: 'visible', timeout: 90_000 });
  await waitForStore();
  await waitForPieceCount(expectedPieces);
  await page.locator('svg.pattern-svg').waitFor({ state: 'attached', timeout: 20_000 });
}

async function clickViewMode(label) {
  const button = page.locator('.pill-group').getByRole('button', { name: label, exact: true });
  await button.click();
  const mode = label === '2D' ? '2d' : label === '3D' ? '3d' : 'split';
  await page.waitForFunction((expected) => (
    window.__VINA_STORE__?.getState?.()?.editor?.viewMode === expected
  ), mode);

  if (mode !== '3d') {
    await page.locator('svg.pattern-svg').waitFor({ state: 'visible' });
    await waitForRenderedPieces(EXPECTED_PIECES);
  }
  if (mode !== '2d') {
    await page.locator('.canvas-area__3d canvas').first().waitFor({ state: 'visible', timeout: 25_000 });
  }
  await settleUI();
}

async function prepareEmptyBase(viewport = DEFAULT_VIEWPORT) {
  await ensurePage();
  await page.setViewportSize(viewport);
  // 90 s por la misma razón que la espera de `.app-shell` en waitForApp: con Vite
  // frío, el grafo transformado tarda más que los 30 s por defecto. Si cambias uno,
  // cambia el otro.
  await page.goto(BASE_URL, { waitUntil: 'domcontentloaded', timeout: 90_000 });
  await waitForApp(0);
  await dismissToasts();
  await settleUI();
}

async function prepareLoadedBase(viewport = DEFAULT_VIEWPORT) {
  await ensurePage();
  await page.setViewportSize(viewport);
  // Mismo 90 s que prepareEmptyBase y que waitForApp (ver el comentario de ambas).
  await page.goto(BASE_URL, { waitUntil: 'domcontentloaded', timeout: 90_000 });
  await waitForApp(EXPECTED_PIECES);
  await clickViewMode('Split');
  await dismissToasts();
  await settleUI();
}

async function importFixture() {
  activeStateName = 'carga del DXF base';
  await prepareEmptyBase();
  await waitForPersistenceReady();
  // Es el mismo asentamiento de boot usado antes del setInputFiles en los specs
  // E2E del fixture de María; no es una espera inventada para el parseo.
  await page.waitForTimeout(500);
  await page.locator('input[accept=".dxf"]').setInputFiles(FIXTURE);
  await waitForPieceCount(EXPECTED_PIECES);
  await waitForRenderedPieces(EXPECTED_PIECES);
  // La app autosalva con debounce, pero esta herramienta recarga decenas de
  // veces. Un flush explícito por la API canónica elimina la carrera entre el
  // debounce y la primera visita sin escribir una forma de datos paralela.
  await page.evaluate(async () => {
    const { saveToStorage } = await import('/src/utils/projectIO.ts');
    await saveToStorage(window.__VINA_STORE__.getState().project);
  });
  await waitForAutosave(EXPECTED_PIECES);
  await settleUI();
}

async function visit(nombre, categoria, options = {}) {
  const {
    base = 'loaded',
    viewport = DEFAULT_VIEWPORT,
    action = async () => {},
    detalles = {},
  } = options;
  const numero = states.length + 1;
  const prefijo = String(numero).padStart(2, '0');
  const screenshotName = `${prefijo}-${slugify(nombre)}.png`;
  const screenshotPath = path.join(OUTPUT_DIR, screenshotName);
  const runtimeStart = runtimeEvents.length;
  const startedAt = new Date().toISOString();
  activeStateName = nombre;

  const entry = {
    numero,
    estado: nombre,
    categoria,
    alcanzado: false,
    viewport,
    base,
    detalles,
    inicio: startedAt,
  };

  try {
    console.log(`[${prefijo}] ... ${nombre}`);
    if (base === 'empty') await prepareEmptyBase(viewport);
    else await prepareLoadedBase(viewport);
    await action();
    await settleUI();

    await page.screenshot({
      path: screenshotPath,
      fullPage: false,
      animations: 'disabled',
      caret: 'hide',
      timeout: 30_000,
    });

    const censo = await collectCensus();
    entry.alcanzado = true;
    entry.captura = relativeToRepo(screenshotPath);
    entry.censo = censo;
    entry.fin = new Date().toISOString();
    entry.eventosRuntime = runtimeEvents.slice(runtimeStart);
    states.push(entry);
    console.log(`[${prefijo}] OK  ${nombre}`);
  } catch (error) {
    entry.motivo = normalizeError(error);
    entry.fin = new Date().toISOString();
    entry.eventosRuntime = runtimeEvents.slice(runtimeStart);
    states.push(entry);
    console.error(`[${prefijo}] NO  ${nombre}: ${entry.motivo.split('\n')[0]}`);
  }
}

async function collectCensus() {
  return page.evaluate(async () => {
    const round = (value, digits = 2) => {
      const factor = 10 ** digits;
      return Math.round(value * factor) / factor;
    };
    const normalizeSpace = (value) => String(value ?? '').replace(/\s+/g, ' ').trim();
    const ownText = (element) => normalizeSpace(
      [...element.childNodes]
        .filter((node) => node.nodeType === Node.TEXT_NODE)
        .map((node) => node.textContent || '')
        .join(' '),
    );
    const classNameOf = (element) => {
      const value = element.getAttribute?.('class') || '';
      return normalizeSpace(value);
    };
    const accessibleName = (element) => (
      normalizeSpace(element.getAttribute('aria-label'))
      || normalizeSpace(element.getAttribute('title'))
      || normalizeSpace(element.textContent)
    );
    const descriptor = (element) => {
      const tag = element.tagName.toLowerCase();
      const id = element.id ? `#${element.id}` : '';
      const classes = classNameOf(element)
        .split(' ')
        .filter(Boolean)
        .slice(0, 5)
        .map((name) => `.${name}`)
        .join('');
      const name = accessibleName(element);
      return `${tag}${id}${classes}${name ? ` [${name.slice(0, 120)}]` : ''}`;
    };
    const rectOf = (element) => {
      const rect = element.getBoundingClientRect();
      return {
        x: round(rect.x),
        y: round(rect.y),
        width: round(rect.width),
        height: round(rect.height),
        right: round(rect.right),
        bottom: round(rect.bottom),
      };
    };
    const isVisible = (element) => {
      if (!(element instanceof Element)) return false;
      if (element.hasAttribute('hidden')) return false;
      const rect = element.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0 || element.getClientRects().length === 0) return false;
      let current = element;
      while (current instanceof Element) {
        const style = getComputedStyle(current);
        if (style.display === 'none' || style.visibility === 'hidden' || style.visibility === 'collapse') return false;
        if (Number.parseFloat(style.opacity || '1') === 0) return false;
        current = current.parentElement;
      }
      return true;
    };
    const parseColor = (value) => {
      if (!value || value === 'transparent') return { r: 0, g: 0, b: 0, a: 0 };
      const match = value.match(/^rgba?\(\s*([\d.]+)\s*[, ]\s*([\d.]+)\s*[, ]\s*([\d.]+)(?:\s*[,/]\s*([\d.]+%?))?\s*\)$/i);
      if (!match) return null;
      const alphaRaw = match[4];
      const alpha = alphaRaw?.endsWith('%') ? Number.parseFloat(alphaRaw) / 100 : Number.parseFloat(alphaRaw ?? '1');
      return {
        r: Number.parseFloat(match[1]),
        g: Number.parseFloat(match[2]),
        b: Number.parseFloat(match[3]),
        a: Number.isFinite(alpha) ? alpha : 1,
      };
    };
    const colorString = (color) => `rgb(${Math.round(color.r)}, ${Math.round(color.g)}, ${Math.round(color.b)})`;
    const composite = (foreground, background) => {
      const a = foreground.a + background.a * (1 - foreground.a);
      if (a <= 0) return { r: 0, g: 0, b: 0, a: 0 };
      return {
        r: (foreground.r * foreground.a + background.r * background.a * (1 - foreground.a)) / a,
        g: (foreground.g * foreground.a + background.g * background.a * (1 - foreground.a)) / a,
        b: (foreground.b * foreground.a + background.b * background.a * (1 - foreground.a)) / a,
        a,
      };
    };
    const luminance = (color) => {
      const channel = (value) => {
        const normalized = value / 255;
        return normalized <= 0.03928
          ? normalized / 12.92
          : ((normalized + 0.055) / 1.055) ** 2.4;
      };
      return 0.2126 * channel(color.r) + 0.7152 * channel(color.g) + 0.0722 * channel(color.b);
    };
    const contrastRatio = (foreground, background) => {
      const first = luminance(foreground);
      const second = luminance(background);
      const lighter = Math.max(first, second);
      const darker = Math.min(first, second);
      return (lighter + 0.05) / (darker + 0.05);
    };
    const effectiveBackground = (element) => {
      let current = element;
      let result = { r: 0, g: 0, b: 0, a: 0 };
      let source = null;
      let approximate = false;
      const layers = [];
      while (current instanceof Element) {
        const style = getComputedStyle(current);
        if (style.backgroundImage !== 'none') approximate = true;
        const layer = parseColor(style.backgroundColor);
        if (layer && layer.a > 0) {
          source ||= descriptor(current);
          layers.push({ elemento: descriptor(current), color: style.backgroundColor });
          result = composite(result, layer);
          if (result.a >= 0.999) break;
        }
        current = current.parentElement;
      }
      if (result.a < 0.999) result = composite(result, { r: 255, g: 255, b: 255, a: 1 });
      return { color: result, source: source || 'fondo blanco asumido', approximate, layers };
    };
    const signatureKey = (signature) => JSON.stringify(signature);
    const groupBySignature = (items) => {
      const groups = new Map();
      for (const item of items) {
        const key = item.firmaClave;
        if (!groups.has(key)) {
          groups.set(key, {
            firmaClave: key,
            firma: item.firma,
            cantidad: 0,
            clases: new Set(),
            componentes: new Set(),
            nombres: new Set(),
            ids: [],
          });
        }
        const group = groups.get(key);
        group.cantidad += 1;
        if (item.className) group.clases.add(item.className);
        if (item.componente) group.componentes.add(item.componente);
        if (item.nombreAccesible) group.nombres.add(item.nombreAccesible);
        group.ids.push(item.id);
      }
      return [...groups.values()]
        .map((group) => ({
          ...group,
          clases: [...group.clases].sort(),
          componentes: [...group.componentes].sort(),
          nombres: [...group.nombres].sort(),
        }))
        .sort((a, b) => b.cantidad - a.cantidad || a.firmaClave.localeCompare(b.firmaClave));
    };

    const allElements = [...document.querySelectorAll('*')];
    const visibleElements = allElements.filter(isVisible);

    const surfaceElements = visibleElements.filter((element) => {
      const style = getComputedStyle(element);
      if (style.position !== 'fixed' && style.position !== 'absolute') return false;
      const rect = element.getBoundingClientRect();
      if (rect.width < 40 || rect.height < 20) return false;
      const background = parseColor(style.backgroundColor);
      return Boolean(background && background.a > 0);
    });

    const surfaces = surfaceElements.map((element, index) => {
      const style = getComputedStyle(element);
      const firma = {
        backgroundColor: style.backgroundColor,
        borderRadius: style.borderRadius,
        borderWidth: style.borderWidth,
        borderColor: style.borderColor,
        boxShadow: style.boxShadow,
        backdropFilter: style.backdropFilter || style.webkitBackdropFilter || 'none',
        zIndex: style.zIndex,
      };
      return {
        id: `surface-${index + 1}`,
        tag: element.tagName.toLowerCase(),
        className: classNameOf(element),
        componente: descriptor(element),
        texto: normalizeSpace(element.textContent).slice(0, 300),
        posicion: style.position,
        rect: rectOf(element),
        firma,
        firmaClave: signatureKey(firma),
      };
    });

    const buttonElements = [...document.querySelectorAll('button')].filter(isVisible);
    const buttons = buttonElements.map((element, index) => {
      const style = getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      const name = accessibleName(element);
      const firma = {
        backgroundColor: style.backgroundColor,
        borderRadius: style.borderRadius,
        borderWidth: style.borderWidth,
        borderColor: style.borderColor,
        fontSize: style.fontSize,
        fontFamily: style.fontFamily,
        color: style.color,
        padding: style.padding,
        height: Math.round(rect.height),
        width: Math.round(rect.width),
      };
      return {
        id: `button-${index + 1}`,
        tag: 'button',
        className: classNameOf(element),
        componente: descriptor(element),
        nombreAccesible: name,
        ariaLabel: normalizeSpace(element.getAttribute('aria-label')),
        ariaLabelledby: normalizeSpace(element.getAttribute('aria-labelledby')),
        title: normalizeSpace(element.getAttribute('title')),
        textContent: normalizeSpace(element.textContent),
        disabled: element.disabled,
        tabIndex: element.tabIndex,
        rect: rectOf(element),
        firma,
        firmaClave: signatureKey(firma),
      };
    });

    const formElements = [...document.querySelectorAll('input, select, textarea')].filter(isVisible);
    const formControls = formElements.map((element, index) => {
      const style = getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      const firma = {
        backgroundColor: style.backgroundColor,
        borderRadius: style.borderRadius,
        borderWidth: style.borderWidth,
        borderColor: style.borderColor,
        fontSize: style.fontSize,
        fontFamily: style.fontFamily,
        color: style.color,
        padding: style.padding,
        height: Math.round(rect.height),
        width: Math.round(rect.width),
      };
      return {
        id: `control-${index + 1}`,
        tag: element.tagName.toLowerCase(),
        type: element.getAttribute('type') || element.tagName.toLowerCase(),
        className: classNameOf(element),
        componente: descriptor(element),
        nombreAccesible: accessibleName(element),
        ariaLabel: normalizeSpace(element.getAttribute('aria-label')),
        title: normalizeSpace(element.getAttribute('title')),
        placeholder: normalizeSpace(element.getAttribute('placeholder')),
        disabled: element.disabled,
        rect: rectOf(element),
        firma,
        firmaClave: signatureKey(firma),
      };
    });

    const textElements = visibleElements
      .map((element) => ({ element, text: ownText(element) }))
      .filter(({ text }) => text.length > 0);

    const typography = textElements.map(({ element, text }, index) => {
      const style = getComputedStyle(element);
      const firma = {
        fontFamily: style.fontFamily,
        fontSize: style.fontSize,
        fontWeight: style.fontWeight,
        letterSpacing: style.letterSpacing,
        fontVariantNumeric: style.fontVariantNumeric,
      };
      return {
        id: `text-${index + 1}`,
        texto: text,
        className: classNameOf(element),
        componente: descriptor(element),
        rect: rectOf(element),
        firma,
        firmaClave: signatureKey(firma),
      };
    });

    const contrastEvaluated = [];
    const contrastSkipped = [];
    for (let index = 0; index < textElements.length; index += 1) {
      const { element, text } = textElements[index];
      const style = getComputedStyle(element);
      const foregroundRaw = parseColor(style.color);
      if (!foregroundRaw) {
        contrastSkipped.push({
          id: `contrast-skip-${index + 1}`,
          texto: text,
          componente: descriptor(element),
          motivo: `color no parseable: ${style.color}`,
        });
        continue;
      }
      const background = effectiveBackground(element);
      const foreground = foregroundRaw.a < 1
        ? composite(foregroundRaw, background.color)
        : foregroundRaw;
      const ratio = contrastRatio(foreground, background.color);
      const fontSizePx = Number.parseFloat(style.fontSize);
      const numericWeight = Number.parseInt(style.fontWeight, 10);
      const bold = style.fontWeight === 'bold' || style.fontWeight === 'bolder' || numericWeight >= 700;
      const large = fontSizePx >= 18.66 || (fontSizePx >= 14 && bold);
      const threshold = large ? 3 : 4.5;
      contrastEvaluated.push({
        id: `contrast-${index + 1}`,
        texto: text,
        className: classNameOf(element),
        componente: descriptor(element),
        fontSize: style.fontSize,
        fontWeight: style.fontWeight,
        colorDeclarado: style.color,
        colorEfectivo: colorString(foreground),
        backgroundColorEfectivo: colorString(background.color),
        fuenteDelFondo: background.source,
        capasDelFondo: background.layers,
        aproximadoPorImagenOGradiente: background.approximate,
        ratio: round(ratio),
        umbral: threshold,
        cumple: ratio >= threshold,
      });
    }

    const originalActive = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const focusAudit = [];
    for (let index = 0; index < buttonElements.length; index += 1) {
      const element = buttonElements[index];
      if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
      const beforeStyle = getComputedStyle(element);
      const before = {
        outline: beforeStyle.outline,
        outlineWidth: beforeStyle.outlineWidth,
        boxShadow: beforeStyle.boxShadow,
      };
      if (!element.disabled) element.focus({ preventScroll: true });
      // focus() y getComputedStyle fuerzan el cambio de pseudoestado de forma
      // síncrona. Esperar un rAF por botón vuelve esta auditoría O(n segundos)
      // en páginas headless en segundo plano, sin añadir señal visual real.
      const afterStyle = getComputedStyle(element);
      const after = {
        outline: afterStyle.outline,
        outlineWidth: afterStyle.outlineWidth,
        boxShadow: afterStyle.boxShadow,
      };
      const focusable = document.activeElement === element;
      const visualChanged = before.outline !== after.outline
        || before.outlineWidth !== after.outlineWidth
        || before.boxShadow !== after.boxShadow;
      focusAudit.push({
        id: buttons[index].id,
        nombreAccesible: buttons[index].nombreAccesible,
        className: buttons[index].className,
        componente: buttons[index].componente,
        disabled: element.disabled,
        tabIndex: element.tabIndex,
        focusable,
        antes: before,
        enfocado: after,
        cambioVisual: visualChanged,
        falla: !element.disabled && (!focusable || !visualChanged),
        motivo: element.disabled
          ? 'deshabilitado; no es objetivo de teclado'
          : !focusable
            ? 'no aceptó foco programático'
            : visualChanged
              ? null
              : 'outline, outlineWidth y boxShadow no cambiaron',
      });
      element.blur();
    }
    if (originalActive?.isConnected) originalActive.focus({ preventScroll: true });

    const overlapArea = (first, second) => {
      const width = Math.max(0, Math.min(first.right, second.right) - Math.max(first.x, second.x));
      const height = Math.max(0, Math.min(first.bottom, second.bottom) - Math.max(first.y, second.y));
      return width * height;
    };
    const surfaceOverlaps = [];
    for (let firstIndex = 0; firstIndex < surfaces.length; firstIndex += 1) {
      for (let secondIndex = firstIndex + 1; secondIndex < surfaces.length; secondIndex += 1) {
        const area = overlapArea(surfaces[firstIndex].rect, surfaces[secondIndex].rect);
        if (area <= 0) continue;
        const firstElement = surfaceElements[firstIndex];
        const secondElement = surfaceElements[secondIndex];
        const relation = firstElement.contains(secondElement) || secondElement.contains(firstElement)
          ? 'ancestro-descendiente'
          : 'superficies pares';
        surfaceOverlaps.push({
          superficieA: surfaces[firstIndex].componente,
          superficieAId: surfaces[firstIndex].id,
          superficieB: surfaces[secondIndex].componente,
          superficieBId: surfaces[secondIndex].id,
          relacionDOM: relation,
          areaPx2: round(area),
        });
      }
    }

    const workspaceElement = [...document.querySelectorAll('svg.pattern-svg')].find(isVisible) || null;
    const workspaceRect = workspaceElement ? rectOf(workspaceElement) : null;
    const workspaceOverlaps = workspaceRect
      ? surfaces
        .map((surface) => ({
          superficie: surface.componente,
          superficieId: surface.id,
          areaPx2: round(overlapArea(surface.rect, workspaceRect)),
        }))
        .filter((item) => item.areaPx2 > 0)
      : [];

    const hslOf = (color) => {
      const r = color.r / 255;
      const g = color.g / 255;
      const b = color.b / 255;
      const max = Math.max(r, g, b);
      const min = Math.min(r, g, b);
      const delta = max - min;
      let hue = 0;
      if (delta !== 0) {
        if (max === r) hue = 60 * (((g - b) / delta) % 6);
        else if (max === g) hue = 60 * ((b - r) / delta + 2);
        else hue = 60 * ((r - g) / delta + 4);
      }
      if (hue < 0) hue += 360;
      const lightness = (max + min) / 2;
      const saturation = delta === 0 ? 0 : delta / (1 - Math.abs(2 * lightness - 1));
      return { hue, saturation, lightness };
    };
    const colorFamily = (hue) => {
      if (hue < 15 || hue >= 345) return 'rojo';
      if (hue < 45) return 'naranja';
      if (hue < 70) return 'amarillo';
      if (hue < 165) return 'verde';
      if (hue < 195) return 'cian';
      if (hue < 255) return 'azul';
      if (hue < 290) return 'violeta';
      if (hue < 345) return 'magenta';
      return 'rojo';
    };
    const accentProperties = [
      'color', 'backgroundColor', 'borderTopColor', 'borderRightColor',
      'borderBottomColor', 'borderLeftColor', 'outlineColor',
      'textDecorationColor', 'fill', 'stroke',
    ];
    const accentMap = new Map();
    for (const element of visibleElements) {
      const style = getComputedStyle(element);
      for (const property of accentProperties) {
        const raw = style[property];
        const color = parseColor(raw);
        if (!color || color.a <= 0) continue;
        const hsl = hslOf(color);
        if (hsl.saturation < 0.25 || Math.max(color.r, color.g, color.b) - Math.min(color.r, color.g, color.b) < 24) continue;
        const rgb = colorString(color);
        if (!accentMap.has(rgb)) {
          accentMap.set(rgb, {
            rgb,
            familia: colorFamily(hsl.hue),
            hue: round(hsl.hue),
            saturacion: round(hsl.saturation),
            luminosidad: round(hsl.lightness),
            cantidad: 0,
            propiedades: new Set(),
            valoresFuente: new Set(),
            ejemplos: new Set(),
          });
        }
        const item = accentMap.get(rgb);
        item.cantidad += 1;
        item.propiedades.add(property);
        item.valoresFuente.add(raw);
        if (item.ejemplos.size < 10) item.ejemplos.add(descriptor(element));
      }
    }
    const accentColors = [...accentMap.values()]
      .map((item) => ({
        ...item,
        propiedades: [...item.propiedades].sort(),
        valoresFuente: [...item.valoresFuente].sort(),
        ejemplos: [...item.ejemplos],
      }))
      .sort((a, b) => b.cantidad - a.cantidad || a.rgb.localeCompare(b.rgb));

    return {
      capturadoEn: new Date().toISOString(),
      url: location.href,
      viewport: { width: innerWidth, height: innerHeight, devicePixelRatio },
      superficiesFlotantes: {
        criterio: 'position fixed|absolute; rect >= 40x20; backgroundColor con alpha > 0',
        total: surfaces.length,
        items: surfaces,
        grupos: groupBySignature(surfaces),
      },
      botones: {
        total: buttons.length,
        items: buttons,
        grupos: groupBySignature(buttons),
        sinNombreAccesible: buttons.filter((button) => !button.nombreAccesible),
      },
      controlesFormulario: {
        total: formControls.length,
        items: formControls,
        grupos: groupBySignature(formControls),
      },
      tipografia: {
        criterio: 'elementos visibles con al menos un nodo de texto directo no vacío',
        total: typography.length,
        items: typography,
        grupos: groupBySignature(typography),
      },
      contraste: {
        metodo: 'WCAG 2.x; fondos sólidos compuestos por ancestros; fallback blanco. Gradientes/imágenes quedan marcados como aproximados.',
        totalTextos: textElements.length,
        evaluados: contrastEvaluated.length,
        omitidos: contrastSkipped,
        items: contrastEvaluated,
        fallos: contrastEvaluated
          .filter((item) => !item.cumple)
          .sort((a, b) => a.ratio - b.ratio || a.texto.localeCompare(b.texto)),
      },
      focoVisible: {
        criterio: 'comparación de outline, outlineWidth y boxShadow antes/después de el.focus()',
        auditados: focusAudit,
        fallos: focusAudit.filter((item) => item.falla),
        deshabilitadosOmitidosComoFallo: focusAudit.filter((item) => item.disabled),
      },
      oclusion: {
        workspace2D: workspaceRect ? { selector: 'svg.pattern-svg', rect: workspaceRect } : null,
        entreSuperficies: surfaceOverlaps.sort((a, b) => b.areaPx2 - a.areaPx2),
        conWorkspace2D: workspaceOverlaps.sort((a, b) => b.areaPx2 - a.areaPx2),
      },
      coloresAcento: {
        criterio: 'colores computados RGB visibles con saturación >= 25% y rango de canal >= 24; incluye acentos y colores semánticos',
        items: accentColors,
      },
    };
  });
}

async function enumerateLeftDockTools() {
  activeStateName = 'enumeración dinámica del dock izquierdo';
  await prepareLoadedBase();
  return page.locator('.dock--left button.dock__tool').evaluateAll((buttons) => buttons
    .filter((button) => {
      const rect = button.getBoundingClientRect();
      const style = getComputedStyle(button);
      return rect.width > 0 && rect.height > 0 && style.display !== 'none' && style.visibility !== 'hidden';
    })
    .map((button) => ({
      nombre: (button.getAttribute('aria-label') || button.getAttribute('title') || button.textContent || '').replace(/\s+/g, ' ').trim(),
      className: button.getAttribute('class') || '',
      tieneAriaPressed: button.hasAttribute('aria-pressed'),
    }))
    .filter((item) => item.nombre));
}

async function clickDockTool(tool) {
  const button = page.locator('.dock--left').getByRole('button', { name: tool.nombre, exact: true }).first();
  await button.click();
  if (tool.tieneAriaPressed) {
    await page.waitForFunction((name) => {
      const candidates = [...document.querySelectorAll('.dock--left button.dock__tool')];
      const target = candidates.find((item) => (
        (item.getAttribute('aria-label') || item.getAttribute('title') || item.textContent || '').replace(/\s+/g, ' ').trim() === name
      ));
      return target?.getAttribute('aria-pressed') === 'true';
    }, tool.nombre);
  }
}

async function findPieceInteriorPoints() {
  const points = await page.locator('svg.pattern-svg').evaluate((svg) => {
    const fills = [...svg.querySelectorAll('.pattern-piece .piece-fill')]
      .map((fill) => ({ fill, rect: fill.getBoundingClientRect() }))
      .filter(({ rect }) => rect.width > 0 && rect.height > 0)
      .sort((a, b) => b.rect.width * b.rect.height - a.rect.width * a.rect.height);
    const fractions = [0.5, 0.35, 0.65, 0.2, 0.8, 0.1, 0.9];
    const directHits = [];
    const fallbackHits = [];
    const seen = new Set();

    for (const { fill, rect } of fills) {
      const matrix = fill.getScreenCTM();
      if (!matrix) continue;
      const inverse = matrix.inverse();
      const owner = fill.closest('[data-piece-id]');
      for (const fy of fractions) {
        for (const fx of fractions) {
          const x = rect.left + rect.width * fx;
          const y = rect.top + rect.height * fy;
          const local = new DOMPoint(x, y).matrixTransform(inverse);
          if (typeof fill.isPointInFill === 'function' && !fill.isPointInFill(local)) continue;
          const hit = document.elementFromPoint(x, y);
          if (!hit || hit.closest('[data-piece-id]') !== owner) continue;
          const pieceId = owner?.getAttribute('data-piece-id') || '';
          const key = `${pieceId}:${Math.round(x * 10)}:${Math.round(y * 10)}`;
          if (seen.has(key)) continue;
          seen.add(key);
          const candidate = { x, y, pieceId };
          // Preferir el cuerpo mismo evita abrir accidentalmente el menú de una
          // línea interna. Si no existe un píxel libre, el fallback sigue siendo
          // un clic humano válido sobre un descendiente de la misma pieza.
          (hit === fill ? directHits : fallbackHits).push(candidate);
        }
      }
    }
    return [...directHits, ...fallbackHits];
  });
  if (points.length === 0) throw new Error('No se encontró un punto interior alcanzable en ninguna pieza');
  return points;
}

async function findPieceInteriorPoint() {
  return (await findPieceInteriorPoints())[0];
}

async function selectFirstPiece() {
  const selectButton = page.locator('.dock--left').getByRole('button', { name: 'Seleccionar · Z', exact: true });
  await selectButton.click();
  const point = await findPieceInteriorPoint();
  await page.mouse.click(point.x, point.y);
  await page.locator('.floating-action-bar').waitFor({ state: 'visible', timeout: 8_000 });
}

async function findEmptyCanvasPoint() {
  const point = await page.locator('svg.pattern-svg').evaluate((svg) => {
    const rect = svg.getBoundingClientRect();
    const fractions = [0.08, 0.18, 0.3, 0.5, 0.7, 0.82, 0.92];
    for (const fy of fractions) {
      for (const fx of fractions) {
        const x = rect.left + rect.width * fx;
        const y = rect.top + rect.height * fy;
        const hit = document.elementFromPoint(x, y);
        if (!hit || !svg.contains(hit)) continue;
        if (hit.closest('[data-piece-id]')) continue;
        return { x, y };
      }
    }
    return null;
  });
  if (!point) throw new Error('No se encontró un punto vacío dentro del lienzo 2D');
  return point;
}

async function openEmptyCanvasContextMenu() {
  const point = await findEmptyCanvasPoint();
  await page.mouse.click(point.x, point.y, { button: 'right' });
  const menu = page.locator('.context-menu');
  await menu.waitFor({ state: 'visible' });
  if (await menu.locator('.context-menu__header').count()) {
    throw new Error('El supuesto punto vacío abrió un menú con cabecera de pieza');
  }
}

async function openPieceContextMenu() {
  const candidates = await findPieceInteriorPoints();
  const menu = page.locator('.context-menu');
  for (const point of candidates) {
    await page.mouse.click(point.x, point.y, { button: 'right' });
    await menu.waitFor({ state: 'visible' });
    await settleUI();
    const isPieceBodyMenu = await menu.evaluate((element) => {
      const labels = [...element.querySelectorAll('.context-menu__label')]
        .map((label) => (label.textContent || '').replace(/\s+/g, ' ').trim());
      const hasSegmentAction = labels.some((label) => /^Convertir en (línea|curva)$/.test(label));
      const hasInternalLineAction = labels.includes('Offset como línea interna');
      return labels.includes('Rotar 90°') && !hasSegmentAction && !hasInternalLineAction;
    });
    if (isPieceBodyMenu) return;
  }
  throw new Error('No se encontró un punto interior que abriera el menú puro de pieza');
}

async function openPieceLineContextMenu() {
  const editButton = page.locator('.dock--left').getByRole('button', { name: 'Editar patrón · Q', exact: true });
  await editButton.click();
  const interior = await findPieceInteriorPoint();
  await page.mouse.click(interior.x, interior.y);
  const point = await page.locator('svg.pattern-svg').evaluate((svg, pieceId) => {
    const owner = [...svg.querySelectorAll('[data-piece-id]')]
      .find((element) => element.getAttribute('data-piece-id') === pieceId);
    const pathElement = owner?.querySelector('[data-testid="piece-cut-line"]');
    if (!pathElement) return null;
    const path = pathElement;
    const length = path.getTotalLength();
    if (!Number.isFinite(length) || length <= 0) return null;
    const pointOnPath = path.getPointAtLength(length * 0.27);
    const matrix = path.getScreenCTM();
    if (!matrix) return null;
    const screen = new DOMPoint(pointOnPath.x, pointOnPath.y).matrixTransform(matrix);
    return { x: screen.x, y: screen.y };
  }, interior.pieceId);
  if (!point) throw new Error('No se pudo proyectar una línea de pieza a coordenadas de pantalla');
  await page.mouse.click(point.x, point.y, { button: 'right' });
  const menu = page.locator('.context-menu');
  await menu.waitFor({ state: 'visible' });
  await page.waitForFunction(() => [...document.querySelectorAll('.context-menu__label')]
    .some((label) => /^Convertir en (línea|curva)$/.test((label.textContent || '').trim())), undefined, { timeout: 5_000 });
}

async function clickUnifiedBarMode(name) {
  const button = page.locator('.unified-bar__modes').getByRole('button', { name, exact: true });
  await button.click();
  await page.waitForFunction((label) => {
    const target = [...document.querySelectorAll('.unified-bar__mode-btn')].find((item) => item.getAttribute('aria-label') === label);
    return target?.classList.contains('unified-bar__mode-btn--active');
  }, name);
  if (name === 'Modo comandos' || name === 'Modo ajustes') {
    await page.locator('.unified-bar__panel').waitFor({ state: 'visible' });
  } else {
    await page.locator('.unified-bar__panel').waitFor({ state: 'detached', timeout: 3_000 }).catch(() => {});
  }
}

async function switchTo3D() {
  await clickViewMode('3D');
}

async function ensureSimulationRunning() {
  const running = await page.evaluate(() => window.__VINA_STORE__?.getState?.()?.simulation?.simulationState === 'running');
  if (!running) {
    await page.locator('.dock--right').getByRole('button', { name: 'Simular', exact: true }).click();
  }
  await page.waitForFunction(() => window.__VINA_STORE__?.getState?.()?.simulation?.simulationState === 'running', undefined, { timeout: 20_000 });
}

async function activateFitMap(label, mode) {
  await switchTo3D();
  await ensureSimulationRunning();
  const button = page.locator(`button[title^="${label}"]`).first();
  await button.waitFor({ state: 'visible' });
  await page.waitForFunction((titlePrefix) => {
    const target = [...document.querySelectorAll('button')].find((item) => item.getAttribute('title')?.startsWith(titlePrefix));
    return Boolean(target && !target.disabled);
  }, label);
  await button.click();
  await page.waitForFunction((expected) => window.__VINA_STORE__?.getState?.()?.simulation?.fitMapMode === expected, mode);
}

async function clickRightDock(name) {
  await switchTo3D();
  await page.locator('.dock--right').getByRole('button', { name, exact: true }).click();
  if (name === 'Coser') {
    await page.waitForFunction(() => window.__VINA_STORE__?.getState?.()?.tools?.activeTool3D === 'sew3d');
  } else if (name === 'Simular') {
    await page.waitForFunction(() => window.__VINA_STORE__?.getState?.()?.simulation?.simulationState === 'running');
  } else if (name === 'Avatar') {
    await page.locator('.context-panel').waitFor({ state: 'visible', timeout: 15_000 });
    await page.waitForFunction(() => !document.querySelector('.context-panel')?.textContent?.includes('Cargando...'), undefined, { timeout: 15_000 }).catch(() => {});
  } else if (name === 'Colocar') {
    await page.waitForFunction(() => window.__VINA_STORE__?.getState?.()?.simulation?.viewMode3D === 'arrange');
  }
}

function countBy(items, selector) {
  const counts = new Map();
  for (const item of items) {
    const value = selector(item);
    if (value == null || value === '') continue;
    counts.set(String(value), (counts.get(String(value)) || 0) + 1);
  }
  return [...counts.entries()]
    .map(([valor, cantidad]) => ({ valor, cantidad }))
    .sort((a, b) => b.cantidad - a.cantidad || a.valor.localeCompare(b.valor, 'es'));
}

function aggregateSignatureGroups(reachedStates, censusKey) {
  const groups = new Map();
  for (const state of reachedStates) {
    for (const item of state.censo[censusKey].items) {
      const key = item.firmaClave;
      if (!groups.has(key)) {
        groups.set(key, {
          firmaClave: key,
          firma: item.firma,
          observaciones: 0,
          estados: new Set(),
          clases: new Set(),
          componentes: new Set(),
          nombres: new Set(),
        });
      }
      const group = groups.get(key);
      group.observaciones += 1;
      group.estados.add(state.estado);
      if (item.className) group.clases.add(item.className);
      if (item.componente) group.componentes.add(item.componente);
      if (item.nombreAccesible) group.nombres.add(item.nombreAccesible);
    }
  }
  return [...groups.values()]
    .map((group) => ({
      ...group,
      estados: [...group.estados].sort(),
      clases: [...group.clases].sort(),
      componentes: [...group.componentes].sort(),
      nombres: [...group.nombres].sort(),
    }))
    .sort((a, b) => b.observaciones - a.observaciones || a.firmaClave.localeCompare(b.firmaClave));
}

function aggregateFindings(reachedStates, source, keyOf, mapper = (item) => item) {
  const groups = new Map();
  for (const state of reachedStates) {
    for (const raw of source(state)) {
      const item = mapper(raw);
      const key = keyOf(item);
      if (!groups.has(key)) {
        groups.set(key, { ...item, observaciones: 0, estados: new Set() });
      }
      const group = groups.get(key);
      group.observaciones += 1;
      group.estados.add(state.estado);
    }
  }
  return [...groups.values()].map((group) => ({
    ...group,
    estados: [...group.estados].sort(),
  }));
}

function buildAggregate() {
  const reachedStates = states.filter((state) => state.alcanzado);
  const surfaceGroups = aggregateSignatureGroups(reachedStates, 'superficiesFlotantes');
  const buttonGroups = aggregateSignatureGroups(reachedStates, 'botones');
  const formGroups = aggregateSignatureGroups(reachedStates, 'controlesFormulario');
  const typographyItems = reachedStates.flatMap((state) => state.censo.tipografia.items);
  const surfaces = reachedStates.flatMap((state) => state.censo.superficiesFlotantes.items);
  const buttons = reachedStates.flatMap((state) => state.censo.botones.items);
  const controls = reachedStates.flatMap((state) => state.censo.controlesFormulario.items);

  const accentMap = new Map();
  for (const state of reachedStates) {
    for (const color of state.censo.coloresAcento.items) {
      if (!accentMap.has(color.rgb)) {
        accentMap.set(color.rgb, {
          rgb: color.rgb,
          familia: color.familia,
          hue: color.hue,
          observaciones: 0,
          estados: new Set(),
          propiedades: new Set(),
          valoresFuente: new Set(),
          ejemplos: new Set(),
        });
      }
      const aggregate = accentMap.get(color.rgb);
      aggregate.observaciones += color.cantidad;
      aggregate.estados.add(state.estado);
      for (const property of color.propiedades) aggregate.propiedades.add(property);
      for (const value of color.valoresFuente) aggregate.valoresFuente.add(value);
      for (const example of color.ejemplos) {
        if (aggregate.ejemplos.size < 20) aggregate.ejemplos.add(example);
      }
    }
  }
  const accentColors = [...accentMap.values()]
    .map((item) => ({
      ...item,
      estados: [...item.estados].sort(),
      propiedades: [...item.propiedades].sort(),
      valoresFuente: [...item.valoresFuente].sort(),
      ejemplos: [...item.ejemplos],
    }))
    .sort((a, b) => b.observaciones - a.observaciones || a.rgb.localeCompare(b.rgb));

  const contrastFailures = aggregateFindings(
    reachedStates,
    (state) => state.censo.contraste.fallos,
    (item) => JSON.stringify([
      item.texto, item.className, item.fontSize, item.fontWeight,
      item.colorEfectivo, item.backgroundColorEfectivo, item.ratio, item.umbral,
    ]),
  ).sort((a, b) => a.ratio - b.ratio || a.texto.localeCompare(b.texto, 'es'));

  const focusFailures = aggregateFindings(
    reachedStates,
    (state) => state.censo.focoVisible.fallos,
    (item) => JSON.stringify([item.nombreAccesible, item.className, item.motivo, item.antes, item.enfocado]),
  ).sort((a, b) => (a.nombreAccesible || a.componente).localeCompare(b.nombreAccesible || b.componente, 'es'));

  const unnamedButtons = aggregateFindings(
    reachedStates,
    (state) => state.censo.botones.sinNombreAccesible,
    (item) => JSON.stringify([item.className, item.componente, item.firmaClave]),
  ).sort((a, b) => a.componente.localeCompare(b.componente, 'es'));

  const surfaceOverlaps = aggregateFindings(
    reachedStates,
    (state) => state.censo.oclusion.entreSuperficies,
    (item) => JSON.stringify([item.superficieA, item.superficieB, item.relacionDOM, item.areaPx2]),
  ).sort((a, b) => b.areaPx2 - a.areaPx2);

  const workspaceOverlaps = aggregateFindings(
    reachedStates,
    (state) => state.censo.oclusion.conWorkspace2D,
    (item) => JSON.stringify([item.superficie, item.areaPx2]),
  ).sort((a, b) => b.areaPx2 - a.areaPx2);

  return {
    cobertura: {
      solicitados: states.length,
      alcanzados: reachedStates.length,
      noAlcanzados: states.length - reachedStates.length,
    },
    firmas: {
      superficiesFlotantes: surfaceGroups,
      botones: buttonGroups,
      controlesFormulario: formGroups,
    },
    distribuciones: {
      tamanosFuente: countBy(typographyItems, (item) => item.firma.fontSize),
      familiasFuente: countBy(typographyItems, (item) => item.firma.fontFamily),
      pesosFuente: countBy(typographyItems, (item) => item.firma.fontWeight),
      radios: countBy([...surfaces, ...buttons, ...controls], (item) => item.firma.borderRadius),
      sombras: countBy(surfaces, (item) => item.firma.boxShadow),
      zIndex: countBy(surfaces, (item) => item.firma.zIndex),
    },
    coloresAcento: accentColors,
    fallosContraste: contrastFailures,
    fallosFocoVisible: focusFailures,
    botonesSinNombreAccesible: unnamedButtons,
    solapamientos: {
      entreSuperficies: surfaceOverlaps,
      conWorkspace2D: workspaceOverlaps,
    },
    estadosNoAlcanzados: states
      .filter((state) => !state.alcanzado)
      .map(({ estado, categoria, motivo }) => ({ estado, categoria, motivo })),
  };
}

function mdCell(value) {
  return String(value ?? '—')
    .replaceAll('|', '\\|')
    .replaceAll('\r', ' ')
    .replaceAll('\n', '<br>');
}

function mdList(values) {
  return values.length ? values.map(mdCell).join('<br>') : '—';
}

function distributionTable(title, items) {
  const rows = items.length
    ? items.map((item) => `| ${mdCell(item.valor)} | ${item.cantidad} |`).join('\n')
    : '| — | 0 |';
  return `### ${title}\n\n| Valor | Conteo |\n|---|---:|\n${rows}`;
}

function buildSummary(report) {
  const { agregado } = report;
  const surfaceRows = agregado.firmas.superficiesFlotantes.length
    ? agregado.firmas.superficiesFlotantes.map((group, index) => {
      const components = group.clases.length ? group.clases : group.componentes;
      const border = `${group.firma.borderWidth} ${group.firma.borderColor}`;
      return `| ${index + 1} | ${group.observaciones} | ${mdList(components)} | ${mdCell(group.firma.backgroundColor)} | ${mdCell(group.firma.borderRadius)} | ${mdCell(border)} | ${mdCell(group.firma.boxShadow)} | ${mdCell(group.firma.backdropFilter)} | ${mdCell(group.firma.zIndex)} |`;
    }).join('\n')
    : '| — | 0 | — | — | — | — | — | — | — |';

  const buttonRows = agregado.firmas.botones.length
    ? agregado.firmas.botones.map((group, index) => {
      const namesAndClasses = [
        ...(group.nombres.length ? group.nombres.map((name) => `“${name}”`) : []),
        ...(group.clases.length ? group.clases : group.componentes),
      ];
      const border = `${group.firma.borderWidth} ${group.firma.borderColor}`;
      return `| ${index + 1} | ${group.observaciones} | ${mdList(namesAndClasses)} | ${mdCell(group.firma.backgroundColor)} | ${mdCell(group.firma.borderRadius)} | ${mdCell(border)} | ${mdCell(group.firma.fontSize)} / ${mdCell(group.firma.fontFamily)} | ${mdCell(group.firma.color)} | ${mdCell(group.firma.padding)} | ${group.firma.width}×${group.firma.height} |`;
    }).join('\n')
    : '| — | 0 | — | — | — | — | — | — | — | — |';

  const blueCount = agregado.coloresAcento.filter((item) => item.familia === 'azul').length;
  const violetCount = agregado.coloresAcento.filter((item) => item.familia === 'violeta').length;
  const accentOrder = { azul: 0, violeta: 1, cian: 2, magenta: 3, rojo: 4, naranja: 5, amarillo: 6, verde: 7 };
  const accentRows = [...agregado.coloresAcento]
    .sort((a, b) => (accentOrder[a.familia] ?? 99) - (accentOrder[b.familia] ?? 99) || b.observaciones - a.observaciones)
    .map((item) => `| ${mdCell(item.rgb)} | ${mdCell(item.familia)} | ${item.observaciones} | ${mdList(item.propiedades)} | ${item.estados.length} |`)
    .join('\n') || '| — | — | 0 | — | 0 |';

  const contrastRows = agregado.fallosContraste.map((item) => (
    `| ${item.ratio.toFixed(2)} | ${item.umbral.toFixed(1)} | ${mdCell(item.texto)} | ${mdCell(item.fontSize)} / ${mdCell(item.fontWeight)} | ${mdCell(item.colorEfectivo)} sobre ${mdCell(item.backgroundColorEfectivo)} | ${mdCell(item.componente)} | ${item.observaciones} (${item.estados.length} estados) |`
  )).join('\n') || '| — | — | Ninguno | — | — | — | 0 |';

  const focusRows = agregado.fallosFocoVisible.map((item) => (
    `| ${mdCell(item.nombreAccesible || '(sin nombre)')} | ${mdCell(item.className || item.componente)} | ${mdCell(item.motivo)} | ${item.observaciones} | ${mdList(item.estados)} |`
  )).join('\n') || '| Ninguno | — | — | 0 | — |';

  const unnamedRows = agregado.botonesSinNombreAccesible.map((item) => (
    `| ${mdCell(item.className || item.componente)} | ${item.observaciones} | ${mdList(item.estados)} |`
  )).join('\n') || '| Ninguno | 0 | — |';

  const peerOverlapRows = agregado.solapamientos.entreSuperficies.map((item) => (
    `| ${mdCell(item.superficieA)} | ${mdCell(item.superficieB)} | ${mdCell(item.relacionDOM)} | ${item.areaPx2.toFixed(2)} | ${item.observaciones} | ${mdList(item.estados)} |`
  )).join('\n') || '| Ninguno | — | — | 0 | 0 | — |';

  const workspaceOverlapRows = agregado.solapamientos.conWorkspace2D.map((item) => (
    `| ${mdCell(item.superficie)} | ${item.areaPx2.toFixed(2)} | ${item.observaciones} | ${mdList(item.estados)} |`
  )).join('\n') || '| Ninguno | 0 | 0 | — |';

  const notReachedRows = agregado.estadosNoAlcanzados.map((item) => (
    `| ${mdCell(item.estado)} | ${mdCell(item.categoria)} | ${mdCell(item.motivo)} |`
  )).join('\n') || '| Ninguno | — | — |';

  const stateRows = report.estados.map((state) => (
    `| ${String(state.numero).padStart(2, '0')} | ${mdCell(state.estado)} | ${state.alcanzado ? 'Sí' : 'No'} | ${state.captura ? `[PNG](../../${state.captura.replace(/^docs\//, '')})` : '—'} |`
  )).join('\n');

  const logoButtons = report.estados
    .filter((state) => state.alcanzado)
    .flatMap((state) => state.censo.botones.items)
    .filter((button) => button.className.includes('logo-menu__trigger'));
  const logoNamed = logoButtons.some((button) => button.nombreAccesible === 'Vina');
  const approximateContrastCount = agregado.fallosContraste.filter((item) => item.aproximadoPorImagenOGradiente).length;
  const snapshotRed = report.metadata.snapshotRed;

  return `# Auditoría de superficies de UI de Vina\n\n` +
    `Fecha del censo: ${AUDIT_DATE}. Generado: ${report.metadata.generadoEn}.\n\n` +
    `URL auditada: \`${report.metadata.url}\`. Cobertura: **${agregado.cobertura.alcanzados}/${agregado.cobertura.solicitados} estados alcanzados**; ${agregado.cobertura.noAlcanzados} no alcanzados.\n\n` +
    `## Criterios y límites\n\n` +
    `El script usa un BrowserContext efímero y, antes de cargar la app, limpia cookies, localStorage, sessionStorage e IndexedDB del origen mediante CDP. El estado vacío es por eso un vacío real. Después importa el DXF de María, espera cinco piezas en \`window.__VINA_STORE__\`, hace un flush con el \`saveToStorage\` canónico de la app y espera las mismas cinco piezas en \`vina/projects/autosave\`; cada visita cargada parte de un reload de ese autosave.\n\n` +
    `Para que las decenas de recargas midan una sola versión, el script congela antes de navegar el grafo transformado por Vite (${snapshotRed.respuestasGrafoInicial} respuestas), intercepta el WebSocket de HMR y sirve los mismos bytes desde memoria durante todo el recorrido. Los assets binarios fuera del grafo se fijan en su primera lectura. Fuentes pedidas pero ausentes del snapshot: ${snapshotRed.fuentesNoCapturadas.length}.\n\n` +
    `Las firmas de superficie agrupan solo propiedades visuales; el rect queda en \`censo.json\` como dato de cada instancia. Incluir el rect dentro de la clave haría que dos superficies idénticas en posiciones distintas nunca compartieran firma y volvería inútil el agrupamiento pedido.\n\n` +
    `El menú de una línea de pieza no es un componente separado: la app abre el menú general de la pieza y agrega acciones de segmento. La visita valida el hit exacto por la presencia de “Convertir en línea” o “Convertir en curva”; la visita de pieza exige el menú de cuerpo sin acciones de segmento ni de línea interna.\n\n` +
    `El contraste compone colores sólidos de ancestros. Cuando hay gradientes, imágenes o contenido de canvas, el ratio queda marcado como aproximado porque los estilos computados no revelan el píxel real detrás de cada glifo. Hay ${approximateContrastCount} grupos de fallos aproximados por esa causa. Los botones deshabilitados quedan en el dato crudo, pero no cuentan como fallo de foco porque no son objetivos del teclado.\n\n` +
    (logoNamed
      ? `Hay una contradicción puntual con el brief: el botón del logo sí tiene nombre accesible en el DOM vivo. Su texto hijo es \`Vina\`, y el algoritmo solicitado (aria-label, title o textContent) lo resuelve como “Vina”; por eso no aparece entre los botones sin nombre.\n\n`
      : '') +
    `## Cobertura y capturas\n\n` +
    `| Nº | Estado | Alcanzado | Captura |\n|---:|---|:---:|---|\n${stateRows}\n\n` +
    `## Firmas de superficies flotantes\n\n` +
    `Hay **${agregado.firmas.superficiesFlotantes.length} firmas distintas** de superficie flotante en el conjunto completo. “Observaciones” cuenta apariciones a través de estados; no intenta deduplicar el mismo componente entre capturas.\n\n` +
    `| # | Observaciones | Componentes o clases | Fondo | Radio | Borde | Sombra | Backdrop | z-index |\n|---:|---:|---|---|---|---|---|---|---|\n${surfaceRows}\n\n` +
    `## Firmas de botones\n\n` +
    `Hay **${agregado.firmas.botones.length} firmas distintas** de botón. El ancho y el alto redondeados forman parte de la firma, como pide el encargo.\n\n` +
    `| # | Observaciones | Nombres y clases | Fondo | Radio | Borde | Fuente | Color | Padding | Tamaño |\n|---:|---:|---|---|---|---|---|---|---|---|\n${buttonRows}\n\n` +
    `## Distribuciones\n\n` +
    `${distributionTable('Tamaños de fuente', agregado.distribuciones.tamanosFuente)}\n\n` +
    `${distributionTable('Familias tipográficas', agregado.distribuciones.familiasFuente)}\n\n` +
    `${distributionTable('Pesos tipográficos', agregado.distribuciones.pesosFuente)}\n\n` +
    `${distributionTable('Radios', agregado.distribuciones.radios)}\n\n` +
    `${distributionTable('Sombras de superficies flotantes', agregado.distribuciones.sombras)}\n\n` +
    `${distributionTable('z-index de superficies flotantes', agregado.distribuciones.zIndex)}\n\n` +
    `## Colores de acento observados\n\n` +
    `Candidatos cromáticos distintos: **${agregado.coloresAcento.length}**. Azules: **${blueCount}**. Violetas: **${violetCount}**. El censo incluye también colores semánticos para no esconder rojos, verdes o amarillos que conviven con los acentos de marca.\n\n` +
    `| RGB | Familia | Observaciones | Propiedades | Estados |\n|---|---|---:|---|---:|\n${accentRows}\n\n` +
    `## Fallos de contraste\n\n` +
    `Ordenados del peor ratio al mejor. Los umbrales son 4.5:1 para texto normal y 3:1 para texto de al menos 18.66 px o de al menos 14 px en negrita, tal como define el encargo.\n\n` +
    `| Ratio | Umbral | Texto real | Tamaño / peso | Colores efectivos | Componente | Repetición |\n|---:|---:|---|---|---|---|---|\n${contrastRows}\n\n` +
    `## Botones sin foco visible\n\n` +
    `| Botón | Clase o componente | Motivo | Observaciones | Estados |\n|---|---|---|---:|---|\n${focusRows}\n\n` +
    `## Botones sin nombre accesible\n\n` +
    `La regla aplicada es exactamente la solicitada: vacío si no hay \`aria-label\`, \`title\` ni texto visible en \`textContent\`.\n\n` +
    `| Clase o componente | Observaciones | Estados |\n|---|---:|---|\n${unnamedRows}\n\n` +
    `## Solapamientos\n\n` +
    `Las relaciones ancestro-descendiente se conservan y se etiquetan: son contenciones estructurales, no necesariamente colisiones entre paneles independientes. El dato crudo mantiene cada par por estado.\n\n` +
    `### Entre superficies flotantes\n\n` +
    `| Superficie A | Superficie B | Relación DOM | Área px² | Observaciones | Estados |\n|---|---|---|---:|---:|---|\n${peerOverlapRows}\n\n` +
    `### Con el área de trabajo 2D\n\n` +
    `El área de trabajo se mide con el rect visible de \`svg.pattern-svg\`. En 3D puro no existe un workspace 2D visible y no se inventa uno.\n\n` +
    `| Superficie | Área px² | Observaciones | Estados |\n|---|---:|---:|---|\n${workspaceOverlapRows}\n\n` +
    `## Estados no alcanzados\n\n` +
    `| Estado | Categoría | Motivo |\n|---|---|---|\n${notReachedRows}\n`;
}

async function runVisits() {
  await visit('Estado vacío real', 'base', { base: 'empty' });

  await importFixture();

  for (const label of ['2D', 'Split', '3D']) {
    await visit(`Cargado · modo ${label}`, 'modos principales', {
      action: () => clickViewMode(label),
      detalles: { modo: label },
    });
  }

  const dockTools = await enumerateLeftDockTools();
  for (const tool of dockTools) {
    await visit(`Dock izquierdo · ${tool.nombre}`, 'herramientas dock izquierdo', {
      action: () => clickDockTool(tool),
      detalles: { enumeradoDinamicamente: true, herramienta: tool },
    });
  }

  await visit('Pieza seleccionada · floating action bar', 'selección 2D', {
    action: selectFirstPiece,
  });

  await visit('Menú contextual · lienzo vacío', 'menús contextuales', {
    action: openEmptyCanvasContextMenu,
  });
  await visit('Menú contextual · pieza', 'menús contextuales', {
    action: openPieceContextMenu,
  });
  await visit('Menú contextual · línea de pieza', 'menús contextuales', {
    action: openPieceLineContextMenu,
  });

  for (const mode of ['Modo chat', 'Modo comandos', 'Modo ajustes']) {
    await visit(`Barra de IA · ${mode}`, 'barra de IA', {
      action: () => clickUnifiedBarMode(mode),
      detalles: { modo: mode },
    });
  }

  await visit('Personalizador del dock', 'dock izquierdo', {
    action: async () => {
      await page.getByRole('button', { name: 'Personalizar herramientas del dock', exact: true }).click();
      await page.locator('.dock-picker').waitFor({ state: 'visible' });
    },
  });

  const fitMaps = [
    ['Mapa de tensión', 'stress'],
    ['Mapa de estiramiento', 'strain'],
    ['Mapa de ajuste', 'fit'],
    ['Puntos de presión', 'pressure'],
  ];
  for (const [label, mode] of fitMaps) {
    await visit(`Visor 3D · ${label}`, 'controles visor 3D', {
      action: () => activateFitMap(label, mode),
      detalles: { requiereSimulacion: true, fitMapMode: mode },
    });
  }

  await visit('Visor 3D · Ocultar avatar', 'controles visor 3D', {
    action: async () => {
      await switchTo3D();
      await page.getByTitle('Ocultar avatar (Shift+A)', { exact: true }).click();
      await page.getByTitle('Mostrar avatar (Shift+A)', { exact: true }).waitFor({ state: 'visible' });
    },
  });

  await visit('Visor 3D · Captura F10', 'controles visor 3D', {
    action: async () => {
      await switchTo3D();
      await page.getByTitle('Captura del visor 3D (F10)', { exact: true }).click();
    },
  });

  await visit('Visor 3D · Ajustes del mapa de ajuste', 'controles visor 3D', {
    action: async () => {
      await switchTo3D();
      await page.getByTitle('Ajustes del mapa de ajuste', { exact: true }).click();
      await page.getByLabel('Tensión mín', { exact: true }).waitFor({ state: 'visible' });
    },
  });

  await visit('Visor 3D · Modo de superficie', 'controles visor 3D', {
    action: async () => {
      await switchTo3D();
      await page.getByRole('button', { name: /^Modo de superficie:/ }).click();
      await page.getByRole('group', { name: 'Modo de superficie', exact: true }).waitFor({ state: 'visible' });
    },
  });

  for (const name of ['Colocar', 'Coser', 'Simular', 'Avatar']) {
    await visit(`Dock derecho 3D · ${name}`, 'dock derecho 3D', {
      action: () => clickRightDock(name),
      detalles: { control: name },
    });
  }

  await visit('Solver Metrics expandido', 'diagnóstico', {
    action: async () => {
      // El título visible se localizó durante el encargo ("Solver Metrics" →
      // "Métricas del solver"). La clase del componente es el ancla estable.
      await page.locator('.solver-metrics-toggle').click();
      await page.locator('.solver-metrics--expanded').waitFor({ state: 'visible' });
    },
  });

  await visit('Menú del logo Vina', 'menú principal', {
    action: async () => {
      await page.locator('.logo-menu__trigger').click();
      await page.locator('.logo-menu').waitFor({ state: 'visible' });
    },
  });

  for (const viewport of [
    { width: 1920, height: 1080 },
    { width: 1600, height: 1000 },
    { width: 1280, height: 720 },
  ]) {
    await visit(`Responsive Split · ${viewport.width}x${viewport.height}`, 'viewports', {
      viewport,
      action: () => clickViewMode('Split'),
      detalles: { viewport, modo: 'Split' },
    });
  }

  return { dockTools };
}

async function main() {
  assertSafeOutputDirectory();
  await access(FIXTURE);
  await rm(OUTPUT_DIR, { recursive: true, force: true });
  await mkdir(OUTPUT_DIR, { recursive: true });

  if (EXTERNAL_CDP_URL) {
    // Escape hatch para sandboxes que permiten CDP pero bloquean child_process
    // (`spawn EPERM`). La ejecución normal sigue siendo `chromium.launch()`.
    browser = await chromium.connectOverCDP(EXTERNAL_CDP_URL);
    context = browser.contexts()[0];
    if (!context) throw new Error(`El navegador CDP no expuso un contexto: ${EXTERNAL_CDP_URL}`);
    page = context.pages()[0] || await context.newPage();
  } else {
    browser = await chromium.launch({
      headless: true,
      args: ['--use-gl=angle', '--use-angle=swiftshader'],
    });
    context = await browser.newContext({
      viewport: DEFAULT_VIEWPORT,
      deviceScaleFactor: 1,
      acceptDownloads: true,
    });
    page = await context.newPage();
  }
  page.setDefaultTimeout(20_000);
  page.setDefaultNavigationTimeout(90_000);
  attachPageDiagnostics(page);
  activeStateName = 'snapshot de red y grafo Vite';
  await installFrozenNetworkSnapshot();

  const cdp = await context.newCDPSession(page);
  await context.clearCookies();
  await cdp.send('Storage.clearDataForOrigin', {
    origin: ORIGIN,
    storageTypes: 'all',
  });

  const startedAt = new Date().toISOString();
  const discovery = await runVisits();
  const aggregate = buildAggregate();
  const report = {
    metadata: {
      auditoria: 'censo mecánico de deriva de diseño de superficies UI',
      fechaObjetivo: AUDIT_DATE,
      generadoEn: new Date().toISOString(),
      inicio: startedAt,
      url: BASE_URL,
      origenLimpiado: ORIGIN,
      storagePolicy: 'BrowserContext efímero + Storage.clearDataForOrigin(all) antes de navegar; flush canónico saveToStorage tras importar; luego autosave IDB conocido para cada visita cargada',
      fixture: relativeToRepo(FIXTURE),
      piezasEsperadas: EXPECTED_PIECES,
      chromiumArgs: ['--use-gl=angle', '--use-angle=swiftshader'],
      navegador: EXTERNAL_CDP_URL ? `CDP externo (${EXTERNAL_CDP_URL})` : 'chromium.launch() standalone',
      viewportBase: DEFAULT_VIEWPORT,
      snapshotRed: {
        ...networkSnapshot,
        fuentesNoCapturadas: [...networkSnapshot.fuentesNoCapturadas],
      },
      herramientasDockDescubiertas: discovery.dockTools,
      descargasDisparadas: downloads,
      eventosRuntime: runtimeEvents,
    },
    estados: states,
    agregado: aggregate,
  };

  await writeFile(path.join(OUTPUT_DIR, 'censo.json'), `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  await writeFile(path.join(OUTPUT_DIR, 'RESUMEN.md'), buildSummary(report), 'utf8');

  console.log(`Censo: ${path.join(OUTPUT_DIR, 'censo.json')}`);
  console.log(`Resumen: ${path.join(OUTPUT_DIR, 'RESUMEN.md')}`);
  console.log(`Cobertura: ${aggregate.cobertura.alcanzados}/${aggregate.cobertura.solicitados}`);
}

main()
  .catch((error) => {
    console.error(`FATAL: ${normalizeError(error)}`);
    process.exitCode = 1;
  })
  .finally(async () => {
    if (browser) await browser.close().catch(() => {});
  });
