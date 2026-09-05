/**
 * Las cinco puertas nuevas, abiertas de verdad en un navegador.
 *
 * El censo del 2026-09-05 encontró siete herramientas con gesto completo y
 * ninguna puerta. Cinco la estrenaron. Este archivo prueba lo que ninguna
 * unitaria puede probar: que María LLEGA — que el botón existe donde se dice,
 * que se puede tocar, y que al tocarlo la herramienta se activa de verdad.
 *
 * Es la ley de «verificar la puerta, no solo el cuarto»: una unitaria que mira
 * `DOCK_2D_CATALOG` demuestra que la entrada está escrita, no que se alcance.
 *
 * Y mide dos cosas que este mismo cambio pone en riesgo:
 *
 *  - El personalizador pasa de catorce filas a diecinueve. El submenú del logo
 *    se salió de la pantalla con menos (#1095) y nadie lo vio hasta medirlo.
 *  - La pista de «Abrir la pieza» tiene que caber. En su primera redacción
 *    ocupaba 883 px y arrancaba en x = −101 a 1366×643: el hallazgo F2 del
 *    informe, repuesto por nuestra propia mano. Ahora va por fases.
 */
import { test, expect, Page } from '@playwright/test';
import { dispatch, st, toScreen } from './helpers/lienzo';

/** El viewport real del Chrome de María, medido en #1095. */
const MARIA = { width: 1366, height: 643 };

/** id → la etiqueta que María lee. */
const LAS_CINCO: Array<[string, string]> = [
  ['hand', 'Mano'],
  ['measureCurve', 'Medir el borde'],
  ['compareCurves', 'Comparar largos'],
  ['slashAndSpread', 'Abrir la pieza'],
  ['trimPlace', 'Poner avío'],
];

async function abrirApp(page: Page) {
  await page.goto('/');
  await page.waitForSelector('svg.pattern-svg', { timeout: 30000 });
  await page.waitForTimeout(800);
  await page.locator('.toast__dismiss')
    .evaluateAll((bs) => bs.forEach((b) => (b as HTMLElement).click()))
    .catch(() => {});
  await page.waitForTimeout(200);
}

const abrirPersonalizador = async (page: Page) => {
  await page.getByRole('button', { name: 'Personalizar herramientas del dock' }).click();
  await expect(page.locator('.dock-picker')).toBeVisible({ timeout: 5000 });
  await page.waitForTimeout(300);
};

test.describe('las cinco puertas se alcanzan', () => {
  test.use({ viewport: MARIA });
  test.setTimeout(120_000);

  for (const [id, etiqueta] of LAS_CINCO) {
    test(`«${etiqueta}» se añade al dock y su botón activa ${id}`, async ({ page }) => {
      await abrirApp(page);
      await abrirPersonalizador(page);

      const fila = page.locator('.dock-picker__item', { hasText: etiqueta });
      await expect(fila, `«${etiqueta}» no está en el personalizador`).toHaveCount(1);
      await fila.scrollIntoViewIfNeeded();
      await fila.click();
      await page.waitForTimeout(400);

      // Cerrar el personalizador para que no tape el dock.
      await page.getByRole('button', { name: 'Personalizar herramientas del dock' }).click();
      await page.waitForTimeout(300);

      const boton = page.getByRole('button', { name: etiqueta, exact: true });
      await expect(boton, `«${etiqueta}» no apareció en el dock`).toHaveCount(1);

      // Que EXISTA no basta: que el clic le llegue.
      const tapado = await page.evaluate((et) => {
        const b = [...document.querySelectorAll('button')].find((x) => x.getAttribute('aria-label') === et);
        if (!b) return 'no existe';
        const r = b.getBoundingClientRect();
        if (r.top < 0 || r.bottom > window.innerHeight) return `fuera de pantalla (${Math.round(r.top)}→${Math.round(r.bottom)} de ${window.innerHeight})`;
        const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
        return !hit || b === hit || b.contains(hit) ? null : (hit.className?.toString().split(' ')[0] ?? hit.tagName);
      }, etiqueta);
      expect(tapado, `el botón de «${etiqueta}» no recibe el clic`).toBeNull();

      await boton.click();
      await expect
        .poll(async () => (await st(page)).editor.activeTool, { timeout: 5000 })
        .toBe(id);

      // Y las DOS puertas del motor, no una: `tools.activeTool2D` es la llave
      // de las opciones y la compuerta de Medir. Activar solo la primera deja
      // la herramienta a medias, y eso no se ve.
      const activo2d = await page.evaluate(
        () => (window as unknown as { __VINA_STORE__: { getState: () => { tools: { activeTool2D: string } } } })
          .__VINA_STORE__.getState().tools.activeTool2D,
      );
      expect(activo2d, `${id} se activó a medias: falta tools.activeTool2D`).toBe(id);
    });
  }

  test('el personalizador entero cabe en la pantalla con sus diecinueve filas', async ({ page }) => {
    await abrirApp(page);
    await abrirPersonalizador(page);

    const medida = await page.evaluate(() => {
      const p = document.querySelector('.dock-picker') as HTMLElement | null;
      if (!p) return null;
      const r = p.getBoundingClientRect();
      const filas = p.querySelectorAll('.dock-picker__item').length;
      const lista = p.querySelector('.dock-picker__list') as HTMLElement | null;
      return {
        filas,
        top: Math.round(r.top), bottom: Math.round(r.bottom), vh: window.innerHeight,
        scrollea: !!lista && lista.scrollHeight > lista.clientHeight + 1,
      };
    });

    expect(medida, 'no se abrió el personalizador').not.toBeNull();
    expect(medida!.filas, 'el catálogo no llegó al personalizador').toBeGreaterThanOrEqual(19);
    // O cabe entero, o scrollea. Lo que no vale es salirse en silencio, que es
    // exactamente lo que hizo el submenú del logo en #1095.
    const cabe = medida!.top >= 0 && medida!.bottom <= medida!.vh;
    expect(
      cabe || medida!.scrollea,
      `el personalizador se sale (${medida!.top}→${medida!.bottom} de ${medida!.vh}) y no scrollea`,
    ).toBe(true);
  });
});

test.describe('«Abrir la pieza» — el gesto más largo del lienzo, dicho y hecho', () => {
  test.use({ viewport: MARIA });
  test.setTimeout(150_000);

  async function unaTira(page: Page) {
    await abrirApp(page);
    await dispatch(page, 'editor/setActiveTool', 'rectangle');
    await dispatch(page, 'tools/setActiveTool2D', 'rectangle');
    await page.waitForTimeout(300);
    const a = await toScreen(page, { x: 120, y: 140 });
    const b = await toScreen(page, { x: 320, y: 290 });
    await page.mouse.move(a.x, a.y); await page.mouse.down();
    await page.mouse.move(b.x, b.y, { steps: 12 }); await page.mouse.up();
    await page.waitForTimeout(600);
    return (await st(page)).project.pieces[0];
  }

  const clic = async (page: Page, x: number, y: number) => {
    const s = await toScreen(page, { x, y });
    await page.mouse.move(s.x, s.y); await page.waitForTimeout(120);
    await page.mouse.click(s.x, s.y);
    await page.waitForTimeout(400);
  };

  test('cinco clics, un arrastre y Enter abren la pieza de verdad', async ({ page }) => {
    const pieza = await unaTira(page);
    await dispatch(page, 'editor/selectPiece', pieza.id);
    await dispatch(page, 'editor/setActiveTool', 'slashAndSpread');
    await dispatch(page, 'tools/setActiveTool2D', 'slashAndSpread');
    await page.waitForTimeout(400);

    const antes = pieza.outline.length;

    await clic(page, 220, 140);   // 1 · contorno: primer extremo del corte
    await clic(page, 220, 290);   // 2 · contorno: segundo extremo
    await clic(page, 170, 215);   // 3 · elegir la mitad izquierda
    await clic(page, 170, 215);   // 4 · confirmarla
    await clic(page, 220, 290);   // 5 · pivote en la punta de abajo

    const a = await toScreen(page, { x: 220, y: 160 });
    const b = await toScreen(page, { x: 170, y: 160 });
    await page.mouse.move(a.x, a.y);
    await page.mouse.move(b.x, b.y, { steps: 18 });
    await page.waitForTimeout(300);
    await page.mouse.down(); await page.mouse.up();
    await page.waitForTimeout(400);
    await page.keyboard.press('Enter');
    await page.waitForTimeout(800);

    const despues = (await st(page)).project.pieces[0].outline.length;
    expect(
      despues,
      `la pieza no se abrió: el contorno sigue con ${despues} comandos`,
    ).toBeGreaterThan(antes);
  });

  test('y la pista cabe en la pantalla en TODAS sus fases', async ({ page }) => {
    // La primera redacción metía los cinco pasos en una línea: 883 px de ancho
    // arrancando en x = −101. Con la pista por fases, cada una tiene que caber.
    const pieza = await unaTira(page);
    await dispatch(page, 'editor/selectPiece', pieza.id);
    await dispatch(page, 'editor/setActiveTool', 'slashAndSpread');
    await dispatch(page, 'tools/setActiveTool2D', 'slashAndSpread');
    await page.waitForTimeout(400);

    const medirPista = () => page.evaluate(() => {
      const t = [...document.querySelectorAll('svg.pattern-svg text')]
        .map((e) => ({ txt: e.textContent ?? '', r: (e as SVGGraphicsElement).getBoundingClientRect() }))
        .filter((x) => x.txt.length > 25)
        .sort((a, b) => b.txt.length - a.txt.length)[0];
      if (!t) return null;
      return { txt: t.txt, left: Math.round(t.r.left), right: Math.round(t.r.right), vw: window.innerWidth };
    });

    const fuera: string[] = [];
    const pasos: Array<[number, number]> = [[220, 140], [220, 290], [170, 215], [170, 215], [220, 290]];
    for (let i = 0; i <= pasos.length; i++) {
      const p = await medirPista();
      if (p && (p.left < 0 || p.right > p.vw)) {
        fuera.push(`paso ${i}: "${p.txt.slice(0, 45)}…" ${p.left}→${p.right} de ${p.vw}`);
      }
      if (i < pasos.length) await clic(page, pasos[i][0], pasos[i][1]);
    }

    expect(fuera, 'la pista se sale de la pantalla en alguna fase').toEqual([]);
  });
});
