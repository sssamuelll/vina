#!/usr/bin/env node
/**
 * Activos de la home desde el BUILD de producción (spec § 5.3–5.4 + enmienda 2026-09-29):
 * figuras del taller con el DXF de María, póster del visor, favicons, OG y manifest.
 *   npm run build && npx vite preview --port 4179 --strictPort     # terminal 1
 *   npm run home:activos -- --url=http://localhost:4179 [--espera=120000] [--sin-poster]
 * --sin-poster salta el paso 7 (2,5 min de simulación); el resto sale byte a byte igual.
 * --gpu: Chrome visible con WebGPU (máquina con GPU): el póster y fig-02 salen del render real y en segundos, no en minutos.
 * Los pasos del taller viven ahora en tests/e2e/i18n-surfaces.ts (la lista de estados de la interfaz; el script capturas-ui.mjs ya no existe).
 */
import { chromium } from 'playwright';
import { writeFile, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const arg = (n) => process.argv.slice(2).find((a) => a.startsWith(`--${n}=`))?.slice(n.length + 3);
const BASE = (arg('url') ?? 'http://localhost:4179').replace(/\/$/, '');
// Headless no tiene WebGPU: simula en WASM a ~1 fps con las 29 000 partículas de la camiseta.
// Medido el 2026-09-29: a los 8 s la tela ni ha empezado; a los 90–120 s ya está quieta.
const ESPERA = Number(arg('espera') ?? 120_000);
const SIN_POSTER = process.argv.includes('--sin-poster');
const GPU = process.argv.includes('--gpu'); // Chrome visible con WebGPU: solo en una máquina con GPU
const COPY = { en: JSON.parse(await readFile(path.join(REPO, 'home/copy/en.json'), 'utf8')), es: JSON.parse(await readFile(path.join(REPO, 'home/copy/es.json'), 'utf8')) };
const lanzar = () => chromium.launch(GPU ? { headless: false, args: ['--enable-unsafe-webgpu', '--disable-backgrounding-occluded-windows', '--disable-renderer-backgrounding'] } : {});
const FIXTURE = path.join(REPO, 'tests/fixtures/garments/maria_patrones_samuel_2M.dxf');
const PAPEL = '#F4EFE6';

/** PNG → WebP con el codificador de Chromium, con recorte opcional (en px del PNG).
 *  Con `maxBytes` baja la calidad de 0,05 en 0,05 hasta que quepa. */
async function aWebp(page, png, destino, { recorte, ancho, calidad = 0.82, maxBytes = Infinity } = {}) {
  let buf;
  for (let q = calidad; ; q = Math.round((q - 0.05) * 100) / 100) {
    const url = await page.evaluate(async ({ b64, recorte, ancho, q }) => {
      const img = await createImageBitmap(await (await fetch(`data:image/png;base64,${b64}`)).blob());
      const r = recorte ?? { x: 0, y: 0, w: img.width, h: img.height };
      const w = ancho ?? r.w, h = Math.round(r.h * (w / r.w));
      const c = new OffscreenCanvas(w, h);
      const ctx = c.getContext('2d');
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(img, r.x, r.y, r.w, r.h, 0, 0, w, h);
      const blob = await c.convertToBlob({ type: 'image/webp', quality: q });
      // FileReader y no String.fromCharCode(...bytes): el spread revienta la pila con imágenes grandes.
      return new Promise((ok) => { const fr = new FileReader(); fr.onload = () => ok(fr.result); fr.readAsDataURL(blob); });
    }, { b64: png.toString('base64'), recorte, ancho, q });
    buf = Buffer.from(url.split(',')[1], 'base64');
    if (buf.length <= maxBytes || q <= 0.3) break;
  }
  await writeFile(path.join(REPO, destino), buf);
  console.log('✓', destino, buf.length, 'B');
}

function pngAIco(png) { // ICO con una entrada PNG (válido desde Vista; todos los navegadores lo leen)
  const h = Buffer.alloc(22);
  h.writeUInt16LE(0, 0); h.writeUInt16LE(1, 2); h.writeUInt16LE(1, 4);       // reservado, tipo=icono, 1 imagen
  h.writeUInt8(32, 6); h.writeUInt8(32, 7); h.writeUInt8(0, 8); h.writeUInt8(0, 9);
  h.writeUInt16LE(1, 10); h.writeUInt16LE(32, 12);                           // planos, bpp
  h.writeUInt32LE(png.length, 14); h.writeUInt32LE(22, 18);                  // tamaño, offset
  return Buffer.concat([h, png]);
}

let browser = await lanzar();

// Primero lo estático (favicons, OG, manifest): tras minutos de WebGL + WASM el proceso de
// GPU de Chromium headless puede quedarse colgado y tumbar la siguiente captura (visto el 2026-09-29).
// ── 1. Favicons: el piquete al 80 % (zona segura maskable) sobre papel ──────
const icono = (await readFile(path.join(REPO, 'public/icon.svg'))).toString('base64');
const ctxIcono = await browser.newContext({ viewport: { width: 512, height: 512 }, deviceScaleFactor: 1 });
const pIcono = await ctxIcono.newPage();
await pIcono.setContent(`<body style="margin:0;height:100vh;background:${PAPEL};display:grid;place-items:center"><img src="data:image/svg+xml;base64,${icono}" style="width:80%">`);
for (const [lado, destino] of [[512, 'public/icon-512.png'], [192, 'public/icon-192.png'], [180, 'public/apple-touch-icon.png'], [32, null]]) {
  await pIcono.setViewportSize({ width: lado, height: lado });
  const img = await pIcono.screenshot();
  const [ruta, datos] = destino ? [destino, img] : ['public/favicon.ico', pngAIco(img)];
  await writeFile(path.join(REPO, ruta), datos);
  console.log('✓', ruta, datos.length, 'B');
}
await ctxIcono.close();

// ── 2. OG 1200×630 por idioma desde home/og.html por file:// ────────────────
const ctxOg = await browser.newContext({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 1 });
const pOg = await ctxOg.newPage();
for (const [idioma, destino, pie] of [['en', 'public/og.png', 'vina.sdar.dev · Pattern making and 3D simulation in the browser'], ['es', 'public/og-es.png', 'vina.sdar.dev · Patronaje y simulación 3D en el navegador']]) {
  const q = new URLSearchParams({ h1: COPY[idioma].h1, pie, lang: idioma });
  await pOg.goto(`${pathToFileURL(path.join(REPO, 'home/og.html')).href}?${q}`, { waitUntil: 'load' });
  await pOg.evaluate(() => document.fonts.ready);
  const og = await pOg.screenshot();
  await writeFile(path.join(REPO, destino), og);
  console.log('✓', destino, og.length, 'B');
}
await ctxOg.close();

// ── 3. Manifest, escrito aquí para que no se desincronice de los iconos ──────
const manifest = {
  name: 'Vina', short_name: 'Vina', start_url: '/app/', display: 'standalone',
  background_color: PAPEL, theme_color: '#1E1B18', lang: 'es',
  icons: [
    { src: '/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any maskable' },
    { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any maskable' },
  ],
};
await writeFile(path.join(REPO, 'public/manifest.webmanifest'), JSON.stringify(manifest, null, 2) + '\n');
console.log('✓ public/manifest.webmanifest');

// ── 4. El taller a 1600×1000 @2x con el DXF de María ─────────────────────────
const W = 1600, H = 1000, DPR = 2;
let page; // los helpers de abajo miran la página del taller abierta ahora
const settle = (ms = 400) => page.waitForTimeout(ms);
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
    // Lejos del centro, que es el hilo: un clic en el hilo selecciona la línea, no la pieza.
    const fr = [0.3, 0.7, 0.2, 0.8];
    for (const { fill, rect } of fills) {
      const inv = fill.getScreenCTM()?.inverse();
      if (!inv) continue;
      const owner = fill.closest('[data-piece-id]');
      for (const fy of fr) for (const fx of fr) {
        const x = rect.left + rect.width * fx, y = rect.top + rect.height * fy;
        if (!fill.isPointInFill(new DOMPoint(x, y).matrixTransform(inv))) continue;
        const hit = document.elementFromPoint(x, y);
        if (hit && hit.closest('[data-piece-id]') === owner) return { x, y, pieza: { x: rect.x, y: rect.y, w: rect.width, h: rect.height } };
      }
    }
    return null;
  });
}

async function abrirTaller(opciones) {
  const context = await browser.newContext(opciones);
  page = await context.newPage();
  const cdp = await context.newCDPSession(page);
  await cdp.send('Storage.clearDataForOrigin', { origin: new URL(BASE).origin, storageTypes: 'all' });
  await page.goto(`${BASE}/app/`, { waitUntil: 'domcontentloaded', timeout: 90_000 });
  await waitForApp(0);
  await settle(1500);
  await dismissToasts();
  await page.locator('input[accept=".dxf"]').setInputFiles(FIXTURE);
  await page.waitForFunction(() => window.__VINA_STORE__.getState().project.pieces.length === 5, undefined, { timeout: 60_000 });
  await settle(1500);
  await dismissToasts();
  await page.keyboard.press('Escape');
  return context;
}
let context = await abrirTaller({ viewport: { width: W, height: H }, deviceScaleFactor: DPR });

// ── 5. fig-01: pieza seleccionada con su cota (03-2d-pieza-seleccionada) ─────
// Recortes con el aspecto exacto de la figura: 1280×620 a lo ancho de 1600 son las
// 775 filas de arriba (lo que enseñaba la maqueta con object-fit: cover; top).
await clickViewMode('2D');
await page.keyboard.press('Control+0'); // Ajustar zoom al patrón
await settle(1200);
const pt = await pieceInteriorPoint();
if (!pt) throw new Error('fig-01: no encontré un punto dentro de una pieza');
await page.mouse.click(pt.x, pt.y);
await settle(1000);
await dismissToasts();
let png = await page.screenshot();
const alto01 = Math.round(W * 620 / 1280);
await aWebp(page, png, 'home/img/fig-01@2x.webp', { recorte: { x: 0, y: 0, w: W * DPR, h: alto01 * DPR }, ancho: 2560 });
await aWebp(page, png, 'home/img/fig-01@1x.webp', { recorte: { x: 0, y: 0, w: W * DPR, h: alto01 * DPR }, ancho: 1280 });
// Móvil: la pieza seleccionada con sus cotas y las vecinas, al aspecto de la caja
// móvil (358×260 → 1,38); todo el svg.pattern-svg dejaba las piezas diminutas.
const { pieza } = pt;
const mh = pieza.h * 1.55, mw = mh * 1.38;
const [mx, my] = [pieza.x + pieza.w / 2 - mw / 2, pieza.y + pieza.h / 2 - mh / 2 - pieza.h * 0.08];
await aWebp(page, png, 'home/img/fig-01-movil.webp', {
  recorte: { x: Math.round(mx * DPR), y: Math.round(my * DPR), w: Math.round(mw * DPR), h: Math.round(mh * DPR) },
  ancho: 780,
});

// ── 6. fig-02 sale del paso 7, con el póster: mismo contexto, misma simulación en reposo ──
await page.keyboard.press('Escape');
await context.close();

if (SIN_POSTER) { await browser.close(); process.exit(0); }

// ── 7. caida-poster: coser, vestir y simular, solo el lienzo 3D ─────────────
// Navegador nuevo y 1600×1000 @1x: tras las capturas a @2x, o a más píxeles (3200×2000 a @2x,
// 2134×1334 a @1x), el WebGL por software de headless deja el hilo principal sin fotogramas
// y los clics esperan «estable» 30 s (visto 4 veces el 2026-09-29; en un Chromium limpio a
// @1x, nunca). El recorte de 1040×600 sale a tamaño real, sin reescalar.
await browser.close();
browser = await lanzar();
const dpr7 = GPU ? DPR : 1; // con GPU real, @2x cabe sin dejar el hilo principal sin fotogramas
context = await abrirTaller({ viewport: { width: W, height: H }, deviceScaleFactor: dpr7 });
// Al 3D antes de coser (el orden del sondeo que funcionó): cosido en 2D, el clic en «3D»
// se quedaba esperando «estable» 30 s.
await clickViewMode('3D');
await settle(1500);
// El fondo del visor de la home (--visor-arriba) y sin suelo: son ajustes de render que la
// usuaria tiene en el panel de render; sin ellos el recuadro saldría gris claro y el
// indicador «Simulando» (--visor-texto) no se leería encima. Desde P5 el fondo de fábrica es
// «Papel» (`transparent`): el color se ignora y, sin cromo, asoma el negro del body. Hay que
// pasar a «Sólido» antes de poner el color.
await page.evaluate(() => {
  window.__VINA_STORE__.dispatch({ type: 'renderSettings/setBackgroundMode', payload: 'solid' });
  window.__VINA_STORE__.dispatch({ type: 'renderSettings/setBackgroundColor', payload: '#2a2825' });
  window.__VINA_STORE__.dispatch({ type: 'renderSettings/setGroundVisible', payload: false });
});
// El DXF llega sin costuras: sin coser, «Vestir avatar» deja caer las piezas sueltas.
async function comando(nombre) {
  await page.keyboard.press('Control+k'); await settle(600);
  // dispatchEvent y no click(): la espera de «estable» de Playwright se queda sin fotogramas
  // con el WebGL por software de headless y agota los 30 s aunque la fila ya esté quieta.
  await page.locator('.unified-bar__panel').getByText(nombre, { exact: true }).first().dispatchEvent('click');
  await settle(1500);
  await page.keyboard.press('Escape');
}
const fondo = await page.evaluate(() => window.__VINA_STORE__.getState().renderSettings.backgroundMode);
if (fondo !== 'solid') throw new Error(`caida-poster: el fondo del visor quedó en «${fondo}» y el póster saldría sobre otro color`);
await comando('Coser piezas automáticamente');
const costuras = await page.evaluate(() => window.__VINA_STORE__.getState().project.seams.length);
if (!costuras) throw new Error('caida-poster: «Coser piezas automáticamente» no cosió nada');
await comando('Vestir avatar');
console.log(`… simulando ${ESPERA / 1000} s (${costuras} costuras)`);
await settle(GPU ? 20_000 : ESPERA);
if (GPU) console.log('mira la costura lateral derecha del póster antes de commitear: si hay franja negra, #1219 sigue y se arregla primero');
await dismissToasts();
// Sin cromo: todo invisible salvo los <canvas> (visibility se hereda y el hijo la puede recuperar).
await page.addStyleTag({ content: 'body *{visibility:hidden!important}canvas{visibility:visible!important}' });
await settle(300);
const lienzo = page.locator('canvas').first();
const caja = await lienzo.boundingBox();
png = await lienzo.screenshot();
// Encuadre con la cámara por defecto: 1040×600 centrados en x y pegados arriba (cabeza →
// muslos, de mano a mano). ponytail: fijo a esa cámara; si cambia el encuadre inicial del
// visor, recalcular aquí mirando el póster.
const [rx, ry] = [Math.round(caja.width / 2 - 520), 0];
await aWebp(page, png, 'home/img/caida-poster.webp', { recorte: { x: rx * dpr7, y: ry, w: 1040 * dpr7, h: 600 * dpr7 }, ancho: 1040, maxBytes: 100_000 });
// fig-02: el mismo visor con el mapa de estiramiento (azul en reposo → rojo estirado, la convención de CLO);
// el mapa de ajuste («fit») pinta la camiseta entera de rojo con sus umbrales por defecto. 1280×560, centrado en x, pegado arriba.
await page.evaluate(() => window.__VINA_STORE__.dispatch({ type: 'simulation/setFitMapMode', payload: 'strain' }));
await settle(2500);
if ((await page.evaluate(() => window.__VINA_STORE__.getState().simulation.fitMapMode)) !== 'strain') throw new Error('fig-02: el mapa de estiramiento no se activó');
png = await lienzo.screenshot();
const w02 = Math.min(Math.round(caja.width), 1280), h02 = Math.round(w02 * 560 / 1280), x02 = Math.round((caja.width - w02) / 2);
await aWebp(page, png, 'home/img/fig-02@2x.webp', { recorte: { x: x02 * dpr7, y: 0, w: w02 * dpr7, h: h02 * dpr7 }, ancho: 2560, maxBytes: 90_000 });
await aWebp(page, png, 'home/img/fig-02@1x.webp', { recorte: { x: x02 * dpr7, y: 0, w: w02 * dpr7, h: h02 * dpr7 }, ancho: 1280, maxBytes: 45_000 });
const mw2 = Math.round(h02 * 1.38), x02m = Math.round((caja.width - mw2) / 2);
await aWebp(page, png, 'home/img/fig-02-movil.webp', { recorte: { x: x02m * dpr7, y: 0, w: mw2 * dpr7, h: h02 * dpr7 }, ancho: 780, maxBytes: 30_000 });
await context.close();

await browser.close();
