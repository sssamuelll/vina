import { test, expect, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';

const ORIGEN = 'http://localhost:4179';
const PAGINAS = [
  { url: '/', lang: 'en', titulo: 'Vina — Pattern making and 3D simulation in the browser', h1: 'Draft the pattern, watch it drape.',
    abrir: 'Open Vina', saltar: 'Skip to content', codigo: 'See the code', enviar: 'Send a pattern', idioma: 'Español', otra: '/es/',
    asunto: 'A%20pattern%20for%20Vina', comoH2: 'In the open, one decision at a time' },
  { url: '/es/', lang: 'es', titulo: 'Vina — Patronaje y simulación 3D en el navegador', h1: 'Traza el patrón, mira la caída.',
    abrir: 'Abrir Vina', saltar: 'Saltar al contenido', codigo: 'Ver el código', enviar: 'Enviar un patrón', idioma: 'English', otra: '/',
    asunto: 'Un%20patr%C3%B3n%20para%20Vina', comoH2: 'En abierto, una decisión a la vez' },
] as const;
const datos = (rel: string) => JSON.parse(readFileSync(rel, 'utf8'));
const N_FALTAN = (datos('home/datos/en-construccion.json') as unknown[]).length;
const N_DIARIO = (datos('home/datos/diario.json') as unknown[]).length;

async function cargar(page: Page, url: string) {
  const errores: string[] = [];
  const terceros: string[] = [];
  page.on('console', (m) => { if (m.type() === 'error') errores.push(m.text()); });
  page.on('pageerror', (e) => errores.push(e.message));
  page.on('request', (r) => { if (!r.url().startsWith(ORIGEN) && !r.url().startsWith('data:')) terceros.push(r.url()); });
  await page.goto(url, { waitUntil: 'networkidle' });
  return { errores, terceros };
}

for (const p of PAGINAS) {
  test.describe(`${p.url} a 1366×768`, () => {
    test.use({ viewport: { width: 1366, height: 768 } });

    test('título, idioma, un solo h1, sin errores ni terceros', async ({ page }) => {
      const { errores, terceros } = await cargar(page, p.url);
      await expect(page).toHaveTitle(p.titulo);
      await expect(page.locator('html')).toHaveAttribute('lang', p.lang);
      await expect(page.locator('h1')).toHaveCount(1);
      await expect(page.locator('h1')).toHaveText(p.h1);
      expect(errores).toEqual([]);
      expect(terceros).toEqual([]);
    });

    test('las tres alternativas de idioma y el enlace a la otra página', async ({ page }) => {
      await cargar(page, p.url);
      for (const [l, href] of [['en', 'https://vina.sdar.dev/'], ['es', 'https://vina.sdar.dev/es/'], ['x-default', 'https://vina.sdar.dev/']]) {
        await expect(page.locator(`link[rel="alternate"][hreflang="${l}"]`)).toHaveAttribute('href', href);
      }
      await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href', `https://vina.sdar.dev${p.url}`);
      const idioma = page.locator('header nav a.idioma');
      await expect(idioma).toHaveText(p.idioma);
      await expect(idioma).toHaveAttribute('href', p.otra);
      await expect(page.locator('header a.marca')).toHaveAttribute('href', p.url);
      await idioma.click();
      await expect(page.locator('h1')).toHaveText(PAGINAS.find((q) => q.url === p.otra)!.h1);
    });

    test('los «Abrir Vina» llevan al taller y los «Ver el código» al repo', async ({ page }) => {
      await cargar(page, p.url);
      const abrir = page.getByRole('link', { name: p.abrir });
      expect(await abrir.count()).toBeGreaterThanOrEqual(2);
      for (const href of await abrir.evaluateAll((as) => as.map((a) => a.getAttribute('href')))) expect(href).toBe('/app/');
      await expect(page.locator('section.cierre').getByRole('link', { name: p.codigo })).toHaveAttribute('href', 'https://github.com/sssamuelll/vina');
      const r = await page.request.get('/app/');
      expect(r.status()).toBe(200);
      expect(await r.text()).toContain('/assets/');
    });

    // Review Focus 2
    test('los dos botones de oferta abren el correo con el asunto', async ({ page }) => {
      await cargar(page, p.url);
      const oferta = page.locator('a.btn-oferta');
      await expect(oferta).toHaveCount(2);
      for (const href of await oferta.evaluateAll((as) => as.map((a) => a.getAttribute('href')))) expect(href).toBe(`mailto:contact@sdar.dev?subject=${p.asunto}`);
      await expect(oferta.first()).toHaveText(p.enviar);
    });

    // Review Focus 3
    test('cada enlace de las listas tiene nombre completo', async ({ page }) => {
      await cargar(page, p.url);
      const enlaces = page.locator('.lista a');
      await expect(enlaces).toHaveCount(N_FALTAN + N_DIARIO);
      for (const a of await enlaces.all()) {
        const visible = (await a.innerText()).trim();
        const nombre = (await a.getAttribute('aria-label')) ?? '';
        expect(nombre, visible).toContain(visible);
        expect(nombre.length, visible).toBeGreaterThan(visible.length + 10);
      }
    });

    test('regla del pliegue: el patrón entero arriba, el visor asoma', async ({ page }) => {
      await cargar(page, p.url);
      const patron = await page.locator('.hero-patron').boundingBox();
      const visor = await page.locator('.hero-visor').boundingBox();
      expect(patron!.y + patron!.height).toBeLessThanOrEqual(630);
      expect(visor!.y).toBeLessThanOrEqual(470);
      expect(768 - visor!.y).toBeGreaterThanOrEqual(160);
    });

    // Review Focus 5
    test('≤ 580 palabras visibles', async ({ page }) => {
      await cargar(page, p.url);
      const texto = await page.locator('body').innerText();
      expect(texto.split(/\s+/).filter((w) => /[\p{L}\d]/u.test(w)).length).toBeLessThanOrEqual(580);
    });

    test('CLS ≈ 0', async ({ page }) => {
      await page.addInitScript(() => {
        (window as unknown as { __cls: number }).__cls = 0;
        new PerformanceObserver((l) => { for (const e of l.getEntries() as unknown as { value: number; hadRecentInput: boolean }[]) if (!e.hadRecentInput) (window as unknown as { __cls: number }).__cls += e.value; })
          .observe({ type: 'layout-shift', buffered: true });
      });
      await cargar(page, p.url);
      await page.waitForTimeout(500);
      expect(await page.evaluate(() => (window as unknown as { __cls: number }).__cls)).toBeLessThanOrEqual(0.01);
    });

    test('axe: WCAG 2.2 AA sin violaciones', async ({ page }) => {
      await cargar(page, p.url);
      const r = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag22aa']).analyze();
      expect(r.violations.map((v) => `${v.id}: ${v.nodes.length}`)).toEqual([]);
    });

    test('el primer foco es «Saltar al contenido» y todo foco se ve', async ({ page }) => {
      await cargar(page, p.url);
      await page.keyboard.press('Tab');
      await expect(page.locator(':focus')).toHaveText(p.saltar);
      await page.keyboard.press('Tab');
      const outline = await page.locator(':focus').evaluate((el) => getComputedStyle(el).outlineStyle);
      expect(outline).not.toBe('none');
    });

    test('ningún bloque se queda invisible: por ancla y al final de la página', async ({ page }) => {
      await cargar(page, `${p.url}#send`);
      await page.waitForTimeout(600);
      await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
      await page.waitForTimeout(600);
      for (const op of await page.locator('main section').evaluateAll((ss) => ss.map((s) => getComputedStyle(s).opacity))) expect(op).toBe('1');
    });

    test('la descripción cabe en el snippet: 120–150 caracteres', async ({ page }) => {
      await cargar(page, p.url);
      const d = (await page.locator('meta[name="description"]').getAttribute('content'))!;
      expect([...d].length).toBeGreaterThanOrEqual(120);
      expect([...d].length).toBeLessThanOrEqual(150);
    });

    test('todo objetivo de puntero mide ≥ 24×24 (§ 7)', async ({ page }) => {
      await cargar(page, p.url);
      const chicos: string[] = [];
      for (const el of await page.locator('a:visible, button:visible').all()) {
        const b = (await el.boundingBox())!;
        if (b.width < 24 || b.height < 24) chicos.push(`${(await el.innerText()).trim()} ${b.width.toFixed(1)}×${b.height.toFixed(1)}`);
      }
      expect(chicos).toEqual([]);
    });

    // Review Focus 1
    test('toda imagen carga y tiene alt', async ({ page }) => {
      const fallidas: string[] = [];
      page.on('response', (r) => { if (r.request().resourceType() === 'image' && r.status() >= 400) fallidas.push(r.url()); });
      await cargar(page, p.url);
      await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
      await page.waitForLoadState('networkidle');
      expect(fallidas).toEqual([]);
      for (const img of await page.locator('main img').all()) {
        await expect(img).toHaveAttribute('alt', /.+/);
        expect(await img.evaluate((i: HTMLImageElement) => i.complete && i.naturalWidth > 0)).toBe(true);
      }
      await expect(page.locator('img.fig-01')).toHaveCount(1);
      await expect(page.locator('img.fig-02')).toHaveCount(1);
      await expect(page.locator('img.visor-poster')).toHaveCount(1);
    });

    test.describe('con reducción de movimiento', () => {
      test.use({ contextOptions: { reducedMotion: 'reduce' } });
      test('todo visible sin hacer scroll', async ({ page }) => {
        await cargar(page, p.url);
        for (const op of await page.locator('main section').evaluateAll((ss) => ss.map((s) => getComputedStyle(s).opacity))) expect(op).toBe('1');
      });
    });

    // Review Focus 1: la hoja de estilos llegó (desde /es/ una ruta relativa mal puesta la perdería).
    test.describe('con el sistema en oscuro', () => {
      test.use({ colorScheme: 'dark' });
      test('sigue en papel', async ({ page }) => {
        await cargar(page, p.url);
        expect(await page.evaluate(() => getComputedStyle(document.body).backgroundColor)).toBe('rgb(244, 239, 230)');
      });
    });
  });

  // Review Focus 4
  test.describe(`${p.url} sin JavaScript`, () => {
    test.use({ javaScriptEnabled: false, viewport: { width: 1366, height: 768 } });
    test('la página se ve entera, listas incluidas', async ({ page }) => {
      await page.goto(p.url);
      await expect(page.locator('h1')).toHaveText(p.h1);
      await expect(page.locator('.hero-patron svg .pieza')).toHaveCount(2);
      await expect(page.locator('#how h2')).toHaveText(p.comoH2);
      await expect(page.locator('#making li')).toHaveCount(N_FALTAN);
      await expect(page.locator('#how li')).toHaveCount(N_DIARIO);
    });
  });

  test.describe(`${p.url} móvil 390×844`, () => {
    test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
    test('orden texto → patrón → visor, sin scroll horizontal, y el idioma sigue a mano', async ({ page }) => {
      const { errores } = await cargar(page, p.url);
      expect(errores).toEqual([]);
      const y = async (sel: string) => (await page.locator(sel).boundingBox())!.y;
      expect(await y('h1')).toBeLessThan(await y('.hero-patron'));
      expect(await y('.hero-patron')).toBeLessThan(await y('.hero-visor'));
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
      await expect(page.locator('header nav a:not(.pill):not(.idioma)').first()).toBeHidden();
      await expect(page.locator('header nav a.idioma')).toBeVisible();
    });
  });

  test.describe(`${p.url} tableta 768×1024`, () => {
    test.use({ viewport: { width: 768, height: 1024 } });
    test('el hero se apila: texto → patrón → visor, el patrón ≥ 300 px, sin scroll horizontal', async ({ page }) => {
      await cargar(page, p.url);
      const caja = async (sel: string) => (await page.locator(sel).boundingBox())!;
      expect((await caja('.hero-patron')).width).toBeGreaterThanOrEqual(300);
      expect((await caja('h1')).y).toBeLessThan((await caja('.hero-patron')).y);
      expect((await caja('.hero-patron')).y).toBeLessThan((await caja('.hero-visor')).y);
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(768);
      const fig = await caja('img.fig-01');
      expect(fig.width / fig.height).toBeCloseTo(1280 / 620, 1);
    });
  });

  test.describe(`${p.url} pantalla de 320 px`, () => {
    test.use({ viewport: { width: 320, height: 640 } });
    test('sin scroll horizontal', async ({ page }) => {
      await cargar(page, p.url);
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(320);
    });
  });
}

const TECHOS = { document: 25_000, stylesheet: 20_000, script: 0, font: 100_000, image: 200_000, media: 0, total: 420_000 };
const BASELINE = 'tests/e2e/home-peso-baseline.json';

for (const p of PAGINAS) {
  test(`trinquete de peso de la carga de ${p.url} a 1366`, async ({ page }) => {
    await page.setViewportSize({ width: 1366, height: 768 });
    const bytes: Record<string, number> = {}; let fuentes = 0;
    const pendientes: Promise<void>[] = [];
    page.on('response', (r) => {
      pendientes.push((async () => {
        const tipo = r.request().resourceType();
        const n = (await r.body().catch(() => Buffer.alloc(0))).length;
        bytes[tipo] = (bytes[tipo] ?? 0) + n;
        if (tipo === 'font') fuentes++;
      })());
    });
    await page.goto(p.url, { waitUntil: 'networkidle' });
    await Promise.all(pendientes);
    const medido = { ...Object.fromEntries(Object.keys(TECHOS).map((k) => [k, bytes[k] ?? 0])), total: Object.values(bytes).reduce((a, b) => a + b, 0) };
    const todo = (existsSync(BASELINE) ? JSON.parse(readFileSync(BASELINE, 'utf8')) : {}) as Record<string, Record<string, number>>;
    if (process.env.HOME_PESO_UPDATE === '1') {
      // Solo baja (§ 10.1): subir un valor exige editarlo a mano en el JSON, a la vista del diff.
      const previo = todo[p.url] ?? {};
      todo[p.url] = Object.fromEntries(Object.entries(medido).map(([k, v]) => [k, k in previo ? Math.min(v, previo[k]) : v]));
      writeFileSync(BASELINE, JSON.stringify(todo, null, 2) + '\n');
      return;
    }
    const base = todo[p.url];
    expect(base, `${BASELINE} no tiene entrada para ${p.url}: HOME_PESO_UPDATE=1`).toBeTruthy();
    expect(fuentes).toBeLessThanOrEqual(2);
    for (const [k, techo] of Object.entries(TECHOS)) {
      expect(medido[k], `${k}: ${medido[k]} B`).toBeLessThanOrEqual(Math.min(techo, base[k] ?? techo));
    }
  });
}
