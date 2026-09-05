/**
 * La importación de imágenes de referencia lleva 165 días fuera de pantalla.
 *
 * `ReferenceImageSettings` nunca estuvo mal emplazado: nunca estuvo emplazado.
 * Nació el 2026-03-24 montado como ÚLTIMO HIJO EN FLUJO NORMAL de
 * `.pattern-editor`, detrás de un `<svg>` que ocupa el 100% del alto, y su CSS
 * jamás declaró `position`. Medido en Chrome el 2026-09-05: a 1366×768 se
 * pinta en `top: 768`; a 1366×643, en `top: 643`. En los dos casos
 * `.pattern-editor { overflow: hidden }` se lo come.
 *
 * No es la trampa del `backdrop-filter` de la § 2 del contrato: los siete
 * ancestros son `z-index: auto` y ninguno tiene `transform`, `filter`,
 * `backdrop-filter`, `isolation` ni `contain`. Es geometría de flujo.
 *
 * Y lo grave es la consecuencia: el botón «Importar imagen» es la ÚNICA puerta
 * de todo el repo para meter una imagen de fondo — no hay soltar-imagen, no hay
 * comando en la paleta, y el copiloto solo sabe cambiar opacidad, ocultar y
 * borrar las que ya existen. Ley de puertas (§ 6), incumplida desde el commit
 * que la creó.
 *
 * Dos casos, y el primero importa más que el segundo:
 *
 *  (a) EL GENÉRICO no nombra ni un selector. Afirma que ninguna superficie del
 *      lienzo 2D se pinta fuera de la ventana. Falla hoy con `.ref-img-settings`
 *      y seguirá cazando al siguiente hijo que alguien añada al final de ese
 *      JSX — que es exactamente cómo llegó este. Es el punto 2 de la § 4 del
 *      spec del dueño del emplazamiento, y la lección de «buscar los hermanos
 *      antes de cerrar».
 *
 *  (b) LA PUERTA prueba que se ALCANZA, no que se despacha: la ley de
 *      «verificar la puerta, no solo el cuarto».
 */
import { test, expect, Page } from '@playwright/test';

/** El viewport real del Chrome de María, medido en #1095. */
const MARIA = { width: 1366, height: 643 };

async function abrirApp(page: Page) {
  await page.goto('/');
  await page.waitForSelector('svg.pattern-svg', { timeout: 30000 });
  await page.waitForTimeout(800);
  await page.locator('.toast__dismiss')
    .evaluateAll((bs) => bs.forEach((b) => (b as HTMLElement).click()))
    .catch(() => {});
  await page.waitForTimeout(200);
}

test.describe('ninguna superficie del lienzo 2D se pinta fuera de la pantalla', () => {
  test.use({ viewport: MARIA });
  test.setTimeout(90_000);

  test('todo hijo de .pattern-editor cabe dentro de la ventana', async ({ page }) => {
    await abrirApp(page);

    const fuera = await page.evaluate(() => {
      const editor = document.querySelector('.pattern-editor');
      if (!editor) return [{ que: 'no hay .pattern-editor', top: 0, bottom: 0, left: 0, right: 0 }];

      const candidatos: Element[] = [...editor.children];
      for (const hijo of editor.children) {
        candidatos.push(...hijo.querySelectorAll('button, input, [role="button"], a[href]'));
      }

      const vw = window.innerWidth;
      const vh = window.innerHeight;
      const malos: Array<{ que: string; top: number; bottom: number; left: number; right: number }> = [];
      const vistos = new Set<Element>();

      for (const el of candidatos) {
        if (vistos.has(el)) continue;
        vistos.add(el);
        const r = el.getBoundingClientRect();
        // Sin caja (oculto, o un <input type=file> escondido) no se juzga.
        if (r.width === 0 || r.height === 0) continue;
        // Tolerancia de 1 px: los bordes redondeados y el subpíxel no cuentan.
        if (r.top >= -1 && r.bottom <= vh + 1 && r.left >= -1 && r.right <= vw + 1) continue;
        const nombre = el.getAttribute('aria-label')
          || (el as HTMLElement).className?.toString().split(' ')[0]
          || el.tagName;
        malos.push({
          que: `${el.tagName.toLowerCase()}.${nombre}`,
          top: Math.round(r.top), bottom: Math.round(r.bottom),
          left: Math.round(r.left), right: Math.round(r.right),
        });
      }
      return malos;
    });

    expect(
      fuera,
      `estas superficies del lienzo 2D se pintan fuera de la ventana de ${MARIA.width}×${MARIA.height}`,
    ).toEqual([]);
  });

  test('red contra el arreglo perezoso: el lienzo sigue teniendo hijos que medir', async ({ page }) => {
    // Sin esto, borrar el contenido de `.pattern-editor` haría pasar el test de
    // arriba en vacío. Es el mismo cinturón que lleva el de las cotas.
    await abrirApp(page);
    const cuantos = await page.evaluate(
      () => document.querySelector('.pattern-editor')?.children.length ?? 0,
    );
    expect(cuantos, 'el lienzo 2D no tiene hijos: el test de arriba pasaría vacío').toBeGreaterThanOrEqual(2);
  });
});

test.describe('la puerta de las imágenes de referencia', () => {
  test.use({ viewport: MARIA });
  test.setTimeout(90_000);

  test('desde el menú Vina ▸ Archivo se llega al panel, y su botón se puede tocar', async ({ page }) => {
    await abrirApp(page);

    await page.getByRole('button', { name: /vina/i }).first().dispatchEvent('click');
    // React implementa onMouseEnter sobre mouseover/mouseout (mouseenter nativo
    // no burbujea y React no lo escucha): hay que despachar mouseover.
    await page.getByText('Archivo', { exact: true }).dispatchEvent('mouseover');

    const item = page.getByText('Importar imagen de referencia...', { exact: true });
    await expect(item, 'el menú Archivo no ofrece la puerta').toBeVisible({ timeout: 10_000 });
    await item.dispatchEvent('click');
    await page.waitForTimeout(700);

    await expect(
      page.locator('.context-panel__header', { hasText: 'Imágenes de referencia' }),
      'el panel no se abrió',
    ).toBeVisible({ timeout: 10_000 });

    // Y que el botón sea de verdad tocable: que exista no basta.
    const alcanzable = await page.evaluate(() => {
      const btn = document.querySelector('.ref-img-import-btn');
      if (!btn) return { hay: false, propio: false, culpable: 'no existe', r: null as unknown };
      const r = btn.getBoundingClientRect();
      const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
      return {
        hay: true,
        propio: !!hit && (hit === btn || btn.contains(hit) || btn.contains(hit as Node)),
        culpable: hit?.className?.toString().split(' ')[0] ?? hit?.tagName ?? 'nada',
        r: { top: Math.round(r.top), left: Math.round(r.left), w: Math.round(r.width), h: Math.round(r.height) },
      };
    });

    expect(alcanzable.hay, 'no se pintó el botón de importar').toBe(true);
    expect(
      alcanzable.propio,
      `el botón de importar está tapado por "${alcanzable.culpable}" (caja: ${JSON.stringify(alcanzable.r)})`,
    ).toBe(true);
  });

  test('y la imagen que se importa se PINTA: no basta con que entre al store', async ({ page }) => {
    // El fallo silencioso que este frente puede introducir y que jsdom no ve:
    // `objectUrlMap` es un `Map` a nivel de módulo de `PatternEditor.tsx` que
    // hidrata un `useEffect` del propio componente. Si el panel se muda de
    // anfitrión y el mapa se queda donde estaba, `ReferenceImageLayer` se queda
    // sin URL y la imagen se importa y se pinta EN BLANCO. Todo verde, y la
    // funcionalidad muerta. Por eso se importa una de verdad y se mira el href.
    await abrirApp(page);
    await page.getByRole('button', { name: /vina/i }).first().dispatchEvent('click');
    await page.getByText('Archivo', { exact: true }).dispatchEvent('mouseover');
    await page.getByText('Importar imagen de referencia...', { exact: true }).dispatchEvent('click');
    await page.waitForTimeout(700);

    await page.locator('.ref-img-settings input[type="file"]')
      .setInputFiles('tests/fixtures/imagenes/referencia-4x4.png');
    await page.waitForTimeout(1200);

    const pintada = await page.evaluate(() => {
      const imgs = [...document.querySelectorAll('svg.pattern-svg image')];
      return imgs.map((i) => {
        const href = i.getAttribute('href') || i.getAttribute('xlink:href') || '';
        const r = i.getBoundingClientRect();
        return { conHref: href.length > 0, esquema: href.slice(0, 5), w: Math.round(r.width), h: Math.round(r.height) };
      });
    });

    expect(pintada.length, 'la imagen entró al store pero nadie la pintó en el lienzo').toBeGreaterThan(0);
    expect(
      pintada.every((p) => p.conHref),
      `hay <image> sin href: la imagen se pinta en blanco (${JSON.stringify(pintada)})`,
    ).toBe(true);
  });

  test('y el toggle del menú Vista sigue siendo otra cosa, sin chocar de nombre', async ({ page }) => {
    // Vista ▸ «Imágenes de referencia» muestra u oculta; Archivo ▸ «Importar
    // imagen de referencia...» abre el panel. Un término por concepto (§ 5):
    // dos ítems con la MISMA etiqueta haciendo cosas distintas sí sería el fallo.
    await abrirApp(page);
    await page.getByRole('button', { name: /vina/i }).first().dispatchEvent('click');
    await page.getByText('Vista', { exact: true }).first().dispatchEvent('mouseover');
    await expect(page.getByText('Imágenes de referencia', { exact: true })).toBeVisible({ timeout: 10_000 });
  });
});
