import { test, expect, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

const H1 = 'Traza el patrón, mira la caída.';
const ORIGEN = 'http://localhost:4179';

async function cargar(page: Page, url = '/') {
  const errores: string[] = [];
  const terceros: string[] = [];
  page.on('console', (m) => { if (m.type() === 'error') errores.push(m.text()); });
  page.on('pageerror', (e) => errores.push(e.message));
  page.on('request', (r) => { if (!r.url().startsWith(ORIGEN) && !r.url().startsWith('data:')) terceros.push(r.url()); });
  await page.goto(url, { waitUntil: 'networkidle' });
  return { errores, terceros };
}

test.describe('home a 1366×768', () => {
  test.use({ viewport: { width: 1366, height: 768 } });

  test('título, idioma, un solo h1, sin errores ni terceros', async ({ page }) => {
    const { errores, terceros } = await cargar(page);
    await expect(page).toHaveTitle('Vina — Patronaje y simulación 3D en el navegador');
    await expect(page.locator('html')).toHaveAttribute('lang', 'es');
    await expect(page.locator('h1')).toHaveCount(1);
    await expect(page.locator('h1')).toHaveText(H1);
    expect(errores).toEqual([]);
    expect(terceros).toEqual([]);
  });

  test('los «Abrir Vina» llevan al taller y los «Ver el código» al repo', async ({ page }) => {
    await cargar(page);
    const abrir = page.getByRole('link', { name: 'Abrir Vina' });
    expect(await abrir.count()).toBeGreaterThanOrEqual(2);
    for (const href of await abrir.evaluateAll((as) => as.map((a) => a.getAttribute('href')))) expect(href).toBe('/app/');
    await expect(page.locator('#codigo').getByRole('link', { name: 'Ver el código' })).toHaveAttribute('href', 'https://github.com/sssamuelll/vina');
    const r = await page.request.get('/app/');
    expect(r.status()).toBe(200);
    expect(await r.text()).toContain('/assets/');
  });

  test('regla del pliegue: el patrón entero arriba, el visor asoma', async ({ page }) => {
    await cargar(page);
    const patron = await page.locator('.hero-patron').boundingBox();
    const visor = await page.locator('.hero-visor').boundingBox();
    expect(patron!.y + patron!.height).toBeLessThanOrEqual(630);
    expect(visor!.y).toBeLessThanOrEqual(470);
    expect(768 - visor!.y).toBeGreaterThanOrEqual(160);
  });

  test('≤ 400 palabras visibles', async ({ page }) => {
    await cargar(page);
    const texto = await page.locator('body').innerText();
    expect(texto.split(/\s+/).filter((w) => /[\p{L}\d]/u.test(w)).length).toBeLessThanOrEqual(400);
  });

  test('CLS ≈ 0', async ({ page }) => {
    await page.addInitScript(() => {
      (window as unknown as { __cls: number }).__cls = 0;
      new PerformanceObserver((l) => { for (const e of l.getEntries() as unknown as { value: number; hadRecentInput: boolean }[]) if (!e.hadRecentInput) (window as unknown as { __cls: number }).__cls += e.value; })
        .observe({ type: 'layout-shift', buffered: true });
    });
    await cargar(page);
    await page.waitForTimeout(500);
    expect(await page.evaluate(() => (window as unknown as { __cls: number }).__cls)).toBeLessThanOrEqual(0.01);
  });

  test('axe: WCAG 2.2 AA sin violaciones', async ({ page }) => {
    await cargar(page);
    const r = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag22aa']).analyze();
    expect(r.violations.map((v) => `${v.id}: ${v.nodes.length}`)).toEqual([]);
  });

  test('el primer foco es «Saltar al contenido» y todo foco se ve', async ({ page }) => {
    await cargar(page);
    await page.keyboard.press('Tab');
    await expect(page.locator(':focus')).toHaveText('Saltar al contenido');
    await page.keyboard.press('Tab');
    const outline = await page.locator(':focus').evaluate((el) => getComputedStyle(el).outlineStyle);
    expect(outline).not.toBe('none');
  });

  // Review Focus 4
  test('ningún bloque se queda invisible: por ancla y al final de la página', async ({ page }) => {
    await cargar(page, '/#codigo');
    await page.waitForTimeout(600);
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await page.waitForTimeout(600);
    for (const op of await page.locator('main section').evaluateAll((ss) => ss.map((s) => getComputedStyle(s).opacity))) expect(op).toBe('1');
  });

  test.describe('con reducción de movimiento', () => {
    // En Playwright 1.58 `reducedMotion` no es opción de test.use (se ignora en
    // silencio): va dentro de contextOptions.
    test.use({ contextOptions: { reducedMotion: 'reduce' } });
    test('todo visible sin hacer scroll', async ({ page }) => {
      await cargar(page);
      for (const op of await page.locator('main section').evaluateAll((ss) => ss.map((s) => getComputedStyle(s).opacity))) expect(op).toBe('1');
    });
  });

  // Review Focus 5
  test.describe('con el sistema en oscuro', () => {
    test.use({ colorScheme: 'dark' });
    test('sigue en papel', async ({ page }) => {
      await cargar(page);
      expect(await page.evaluate(() => getComputedStyle(document.body).backgroundColor)).toBe('rgb(244, 239, 230)');
    });
  });
});

// Review Focus 3
test.describe('sin JavaScript', () => {
  test.use({ javaScriptEnabled: false, viewport: { width: 1366, height: 768 } });
  test('la página se ve entera', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('h1')).toHaveText(H1);
    await expect(page.locator('.hero-patron svg .pieza')).toHaveCount(2);
    await expect(page.locator('#codigo h2')).toHaveText('Abierto, y se queda abierto.');
  });
});

test.describe('móvil 390×844', () => {
  test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  test('orden texto → patrón → visor, y sin scroll horizontal', async ({ page }) => {
    await cargar(page);
    const y = async (sel: string) => (await page.locator(sel).boundingBox())!.y;
    expect(await y('h1')).toBeLessThan(await y('.hero-patron'));
    expect(await y('.hero-patron')).toBeLessThan(await y('.hero-visor'));
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
    await expect(page.locator('header nav a:not(.pill)').first()).toBeHidden();
  });
});

// Review Focus 5
test.describe('pantalla de 320 px', () => {
  test.use({ viewport: { width: 320, height: 640 } });
  test('sin scroll horizontal', async ({ page }) => {
    await cargar(page);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(320);
  });
});
