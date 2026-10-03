/**
 * Revisión adversarial de UI del 2026-09-04, hallazgos F1, F2, F3.
 *
 * En la laptop de María (1366×643 de viewport real, vista dividida) tres
 * superficies que nacieron en cinco días distintos se pisan, porque cada una
 * se ancla a un marco distinto: la fila de capas al panel 2D, la barra de IA a
 * la ventana, la pista al pie del svg.
 *
 *   fila de capas ↔ barra de IA   10 108 px² · los TRES botones de modo
 *                                  devuelven `.fila-de-capas` en elementFromPoint
 *   fila de capas ↔ pista          3 612 px² · la instrucción de la herramienta
 *                                  queda cortada a media frase
 *   submenú Vista                  956 px de alto: se sale 426 px por abajo,
 *                                  sin scroll y sin ninguna señal
 *
 * Los tres pasaron todos los gates en verde: jsdom no calcula layout, y ningún
 * test —ni unitario ni e2e— nombraba `fila-de-capas` ni `logo-menu`. Esta suite
 * es esa red, y mide el RESULTADO (quién pinta encima de quién), no el valor
 * declarado, siguiendo el patrón de `emplazamiento-modales.spec.ts`.
 *
 * Ver docs/reports/2026-09-04-revision-adversarial-ui.md § 2 y § 2.1.
 */
import { test, expect, Page } from '@playwright/test';
import { dispatch, st } from './helpers/lienzo';

/** El viewport real del Chrome de María, medido en #1095. */
const MARIA = { width: 1366, height: 643 };

async function abrirApp(page: Page) {
  await page.goto('/app/');
  await page.waitForSelector('svg.pattern-svg', { timeout: 30000 });
  await page.waitForTimeout(600);
  // Los toasts de arranque tapan la esquina y falsean elementFromPoint.
  await page.locator('.toast__dismiss').evaluateAll((bs) => bs.forEach((b) => (b as HTMLElement).click())).catch(() => {});
  await page.waitForTimeout(200);
}

/** Vista dividida: es donde el panel 2D se estrecha y las superficies compiten. */
async function vistaDividida(page: Page) {
  await dispatch(page, 'editor/setViewMode', 'split');
  await page.waitForTimeout(600);
}

async function unaPieza(page: Page) {
  await dispatch(page, 'project/addPiece', {
    id: 'p1', name: 'p1',
    outline: [
      { type: 'M', values: [0, 0] }, { type: 'L', values: [200, 0] },
      { type: 'L', values: [200, 150] }, { type: 'L', values: [0, 150] }, { type: 'Z', values: [] },
    ],
    internals: [], position: { x: 100, y: 100 }, rotation: 0, mirrored: false,
    seamAllowance: 0, layer: 1, sublayer: 0, active: true, createdAt: 1, updatedAt: 1,
  });
  await page.waitForTimeout(300);
}

/** Quién pinta de verdad en el centro de cada elemento que casa con `sel`. */
async function alcanzables(page: Page, sel: string) {
  return page.evaluate((s) => {
    return [...document.querySelectorAll(s)].map((el) => {
      const r = el.getBoundingClientRect();
      const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
      const propio = !!hit && (hit === el || el.contains(hit));
      const culpable = propio
        ? null
        : (hit?.closest('[class]')?.className?.toString().split(' ')[0] ?? hit?.tagName ?? 'nada');
      return {
        nombre: el.getAttribute('aria-label') || el.textContent?.trim() || el.tagName,
        alcanzable: propio,
        culpable,
      };
    });
  }, sel);
}

/** px² de solape entre dos selectores (0 si alguno no está). */
async function solape(page: Page, a: string, b: string) {
  return page.evaluate(([sa, sb]) => {
    const ra = document.querySelector(sa)?.getBoundingClientRect();
    const rb = document.querySelector(sb)?.getBoundingClientRect();
    if (!ra || !rb) return 0;
    const w = Math.max(0, Math.min(ra.right, rb.right) - Math.max(ra.left, rb.left));
    const h = Math.max(0, Math.min(ra.bottom, rb.bottom) - Math.max(ra.top, rb.top));
    return Math.round(w * h);
  }, [a, b] as const);
}

/**
 * F1 se cerró de raíz en P2 de «la interfaz en papel» (spec 2026-10-02 § 4.2):
 * los interruptores dejaron el lienzo y viven en la barra superior, que la
 * barra de IA no puede tapar (`barPosition.ts` la acota por debajo). Lo que
 * sigue midiéndose es el resultado: ninguno de los dos tapa al otro.
 */
test.describe('F1 — la barra de IA y los interruptores del patrón no se pisan', () => {
  test.use({ viewport: MARIA });
  test.setTimeout(90_000);

  test('los tres botones de modo se pueden clicar en vista dividida', async ({ page }) => {
    await abrirApp(page);
    await vistaDividida(page);
    await unaPieza(page);
    await expect(page.locator('.grupo-del-patron')).toBeVisible();

    const modos = await alcanzables(page, '.unified-bar__modes button');
    expect(modos.length, 'la barra de IA no expuso sus botones de modo').toBeGreaterThanOrEqual(3);
    const tapados = modos.filter((m) => !m.alcanzable);
    expect(
      tapados,
      `botones de la barra de IA tapados: ${tapados.map((t) => `${t.nombre} ← ${t.culpable}`).join(', ')}`,
    ).toEqual([]);
  });

  test('y los interruptores tampoco quedan tapados por la barra', async ({ page }) => {
    await abrirApp(page);
    await vistaDividida(page);
    await unaPieza(page);
    const toggles = await alcanzables(page, '.grupo-del-patron button');
    expect(toggles.length).toBeGreaterThanOrEqual(6);
    const tapados = toggles.filter((t) => !t.alcanzable);
    expect(
      tapados,
      `interruptores tapados: ${tapados.map((t) => `${t.nombre} ← ${t.culpable}`).join(', ')}`,
    ).toEqual([]);
  });

  test('sus rectángulos no se solapan en absoluto', async ({ page }) => {
    await abrirApp(page);
    await vistaDividida(page);
    await unaPieza(page);
    expect(await solape(page, '.grupo-del-patron', '.unified-bar')).toBe(0);
  });

  // Viewport ANTES de abrir: la posición por defecto de la barra se calcula al
  // montarla (barPosition.ts), así que redimensionar después no la recoloca y
  // el test pasaría sin haber medido nada. A 1280 el grupo se pliega en
  // «Mostrar»: lo que se mide es ese botón.
  for (const vp of [{ width: 1280, height: 720 }, { width: 1366, height: 768 }]) {
    test(`tampoco a ${vp.width}×${vp.height}`, async ({ page }) => {
      await page.setViewportSize(vp);
      await abrirApp(page);
      await vistaDividida(page);
      await unaPieza(page);
      expect(await solape(page, '.grupo-del-patron', '.unified-bar')).toBe(0);
      const tapados = (await alcanzables(page, '.unified-bar__modes button')).filter((m) => !m.alcanzable);
      expect(tapados, `tapados: ${tapados.map((t) => `${t.nombre} ← ${t.culpable}`).join(', ')}`).toEqual([]);
    });
  }
});

test.describe('F2 — la pista de la herramienta se lee entera', () => {
  test.use({ viewport: MARIA });
  test.setTimeout(90_000);

  test('nada la tapa y no se sale por la derecha', async ({ page }) => {
    await abrirApp(page);
    await vistaDividida(page);
    await unaPieza(page);
    // Margen de costura: su pista es de las más largas ("Pasa por un borde…").
    await page.keyboard.press('o');
    await expect.poll(async () => (await st(page)).editor.activeTool, { timeout: 5000 }).toBe('seamAllowance');
    await page.waitForTimeout(400);

    const medida = await page.evaluate(() => {
      const svg = document.querySelector('svg.pattern-svg')!;
      let pista: Element | null = null;
      for (const t of svg.querySelectorAll('text')) {
        const s = (t.textContent ?? '').trim();
        if (s.length > 20 && /^(Clic|Pasa|Arrastra|Haz)/.test(s)) pista = t;
      }
      if (!pista) return null;
      const rp = pista.getBoundingClientRect();
      // Desde P2 el grupo vive en la barra superior y la pista al pie de la
      // hoja: el solape tiene que seguir siendo 0.
      const rf = document.querySelector('.grupo-del-patron')?.getBoundingClientRect();
      const solape = rf
        ? Math.max(0, Math.min(rp.right, rf.right) - Math.max(rp.left, rf.left)) *
          Math.max(0, Math.min(rp.bottom, rf.bottom) - Math.max(rp.top, rf.top))
        : 0;
      return { texto: (pista.textContent ?? '').trim(), solape: Math.round(solape), fueraPorDerecha: Math.round(Math.max(0, rp.right - window.innerWidth)) };
    });

    expect(medida, 'no encontré la pista de la herramienta al pie del lienzo').not.toBeNull();
    expect(medida!.solape, `la fila tapa ${medida!.solape} px² de la pista "${medida!.texto}"`).toBe(0);
    expect(medida!.fueraPorDerecha, 'la pista se sale del viewport por la derecha').toBe(0);
  });
});

test.describe('F3 — el submenú del menú de aplicación avisa cuando hay más', () => {
  test.use({ viewport: MARIA });
  test.setTimeout(90_000);

  test('el submenú Vista cabe en la pantalla', async ({ page }) => {
    await abrirApp(page);
    await page.locator('.logo-menu__trigger').click();
    await page.locator('.logo-menu').waitFor({ timeout: 5000 });
    await page.getByText('Vista', { exact: true }).first().hover();
    await page.waitForTimeout(400);

    const sub = await page.evaluate(() => {
      const el = document.querySelector('.logo-menu__submenu');
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return {
        top: Math.round(r.top),
        bottom: Math.round(r.bottom),
        alto: Math.round(r.height),
        innerHeight: window.innerHeight,
        seSale: Math.round(Math.max(0, r.bottom - window.innerHeight) + Math.max(0, -r.top)),
        items: el.querySelectorAll('[role="menuitem"], button, .logo-menu__item').length,
      };
    });

    expect(sub, 'no se abrió el submenú Vista').not.toBeNull();
    expect(sub!.items, 'el submenú Vista perdió sus ítems').toBeGreaterThanOrEqual(15);
    expect(sub!.seSale, `el submenú Vista se sale ${sub!.seSale} px de la pantalla`).toBe(0);
  });

  test('y su último ítem se puede clicar de verdad', async ({ page }) => {
    await abrirApp(page);
    await page.locator('.logo-menu__trigger').click();
    await page.locator('.logo-menu').waitFor({ timeout: 5000 });
    await page.getByText('Vista', { exact: true }).first().hover();
    await page.waitForTimeout(400);

    const ultimo = await page.evaluate(() => {
      const sub = document.querySelector('.logo-menu__submenu');
      if (!sub) return null;
      const items = [...sub.querySelectorAll('[role="menuitem"], button, .logo-menu__item')];
      const el = items[items.length - 1];
      if (!el) return null;
      // El menú se alcanza haciendo scroll DENTRO del propio menú. Si lo que
      // hay que mover es la página, el arreglo no existe: un menú flotante que
      // obliga a hacer scroll al documento es el defecto, no la solución.
      const scrollable = (() => {
        for (let e: Element | null = el; e && e !== document.body; e = e.parentElement) {
          if (e.scrollHeight > e.clientHeight + 1) return e;
        }
        return null;
      })();
      const scrollDocAntes = document.documentElement.scrollTop;
      if (scrollable) scrollable.scrollTop = scrollable.scrollHeight;
      const r = el.getBoundingClientRect();
      const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
      return {
        texto: (el.textContent ?? '').trim(),
        haySrollPropio: !!scrollable,
        paginaSeMovio: document.documentElement.scrollTop !== scrollDocAntes,
        paginaDesborda: document.documentElement.scrollHeight > window.innerHeight + 1,
        alcanzable: !!hit && (hit === el || el.contains(hit as Node)),
        culpable: hit?.closest('[class]')?.className?.toString().split(' ')[0] ?? null,
        dentro: r.bottom <= window.innerHeight && r.top >= 0,
      };
    });

    expect(ultimo, 'no pude leer el último ítem del submenú').not.toBeNull();
    expect(ultimo!.paginaDesborda, 'la página entera hace scroll: un menú no puede alargar el documento').toBe(false);
    expect(ultimo!.dentro, `el último ítem ("${ultimo!.texto}") queda fuera de la pantalla incluso tras el scroll del propio menú`).toBe(true);
    expect(ultimo!.alcanzable, `el último ítem lo tapa ${ultimo!.culpable}`).toBe(true);
  });
});
